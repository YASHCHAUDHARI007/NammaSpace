#!/usr/bin/env python3
"""LiDAR depth maps for gsplat-dense-depth.patch (steps 1-2, section 2 of docs/ghosting-research-2026-11-24.md).

Input: one Stray Scanner session per room (rgb.mp4, depth/, confidence/, odometry.csv) and the COLMAP
model gsplat trains that room on. Output: DIR/<image name without extension>.npy per training image,
in the format the patch header describes.

    python lidar-depth-for-gsplat.py extract --stray R504_lidar --frames lidar-frames --name R504
        (then run the three COLMAP commands it prints, which register those frames into a copy
        of the training database)
    python lidar-depth-for-gsplat.py align --stray R504_lidar --registered sparse-lidar-reg \
        --name R504 --out R504-align.json
    python lidar-depth-for-gsplat.py render --stray R504_lidar --align R504-align.json \
        --model DATA/sparse/0 --out DATA/depths --mesh R504-lidar.ply

Needs numpy, opencv-python, open3d and pycolmap (>= 3.10, as gsplat uses).

render fuses the confident LiDAR depth into a TSDF mesh, moves it into the COLMAP frame and raycasts
camera z-depth for every training camera (distortion included). A pixel keeps its depth only if the
LiDAR saw the space in front of the surface as empty. Where LiDAR never looked (under desks seen only
from the 0.8 m pass, say), a ray would pass through the unseen object to the wall behind it and teach
the splats a wrong depth, so those pixels are 0 instead.
"""
import argparse
import csv
import json
import os
import re
import sys

import cv2
import numpy as np

FLIP = np.diag([1.0, -1.0, -1.0])  # ARKit camera axes (+Y up, looking down -Z) <-> OpenCV (+Y down, +Z forward)
# shortcut: one fixed free-space grid resolution; a room plus 4 m margins is ~20 MB at 5 cm.
FREE_VOXEL_M = 0.05


def quat_to_R(qx, qy, qz, qw):
    x, y, z, w = np.array([qx, qy, qz, qw]) / np.linalg.norm([qx, qy, qz, qw])
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def read_odometry(stray):
    """frame -> (camera-to-world 4x4 as stored, (fx, fy, cx, cy) at the RGB video resolution)."""
    frames = {}
    with open(os.path.join(stray, "odometry.csv")) as f:
        for row in csv.DictReader(f, skipinitialspace=True):
            T = np.eye(4)
            T[:3, :3] = quat_to_R(*(float(row[k]) for k in ("qx", "qy", "qz", "qw")))
            T[:3, 3] = [float(row[k]) for k in ("x", "y", "z")]
            if "fx" in row:
                K = tuple(float(row[k]) for k in ("fx", "fy", "cx", "cy"))
            else:  # older app versions: one matrix for the whole session
                M = np.loadtxt(os.path.join(stray, "camera_matrix.csv"), delimiter=",")
                K = (M[0, 0], M[1, 1], M[0, 2], M[1, 2])
            frames[int(row["frame"])] = (T, K)
    return frames


def open_video(stray):
    cap = cv2.VideoCapture(os.path.join(stray, "rgb.mp4"))
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if not w or not h:
        sys.exit(
            "OpenCV cannot read rgb.mp4 (HEVC). Transcode it in place first:\n"
            "  ffmpeg -i rgb.mp4 -c:v libx264 -crf 16 rgb-h264.mp4 && mv rgb-h264.mp4 rgb.mp4"
        )
    return cap, w, h


def umeyama(src, dst):
    """Similarity (s, R, t) minimising |s R src + t - dst|^2 (Umeyama 1991)."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    a, b = src - mu_s, dst - mu_d
    U, S, Vt = np.linalg.svd(b.T @ a / len(src))
    D = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:
        D[2, 2] = -1
    R = U @ D @ Vt
    s = np.trace(np.diag(S) @ D) / (a**2).sum(1).mean()
    return s, R, mu_d - s * R @ mu_s


def fit_similarity(src, dst, inlier_m, iters=2000, seed=0):
    """RANSAC around umeyama. src in metres; residuals are reported in metres."""
    rng = np.random.default_rng(seed)

    def residual(s, R, t):
        return np.linalg.norm(s * src @ R.T + t - dst, axis=1) / s

    best = np.zeros(len(src), bool)
    for _ in range(iters):
        s, R, t = umeyama(*(x[rng.choice(len(src), 3, replace=False)] for x in (src, dst)))
        if np.isfinite(s) and s > 0:
            inliers = residual(s, R, t) < inlier_m
            if inliers.sum() > best.sum():
                best = inliers
    if best.sum() < 3:
        sys.exit("No consistent similarity transform: check the frame names and the registration.")
    for _ in range(2):  # refit on inliers, then re-select them
        s, R, t = umeyama(src[best], dst[best])
        err = residual(s, R, t)
        best = err < inlier_m
    return s, R, t, best, err


def rotation_deg(Ra, Rb):
    return np.degrees(np.arccos(np.clip((np.trace(Ra.T @ Rb) - 1) / 2, -1, 1)))


def colmap_pose(image):
    """(world-to-camera rotation, camera centre) for pycolmap 3.10+ (property) and 3.12+ (method)."""
    cam_from_world = image.cam_from_world
    if callable(cam_from_world):
        cam_from_world = cam_from_world()
    M = np.asarray(cam_from_world.matrix(), dtype=np.float64)
    return M[:, :3], -M[:, :3].T @ M[:, 3]


def camera_rays(cam, image, downscale):
    """Camera centre and per-pixel world directions (unit camera-z) for a COLMAP camera, distortion included."""
    w, h = round(cam.width / downscale), round(cam.height / downscale)
    # Pixel centres in COLMAP image coordinates (top-left pixel centre at 0.5, 0.5).
    u, v = np.meshgrid((np.arange(w) + 0.5) * cam.width / w, (np.arange(h) + 0.5) * cam.height / h)
    xy = np.asarray(cam.cam_from_img(np.stack([u.ravel(), v.ravel()], 1).astype(np.float64)))
    R_cw, centre = colmap_pose(image)
    return centre, np.concatenate([xy, np.ones((len(xy), 1))], 1) @ R_cw, (h, w)


def extract(args):
    odometry = read_odometry(args.stray)
    cap, _, _ = open_video(args.stray)
    os.makedirs(os.path.join(args.frames, args.name), exist_ok=True)
    names, k = [], 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if k % args.every == 0 and k in odometry:
            names.append(f"{args.name}/{args.name}_{k:06d}.jpg")
            cv2.imwrite(os.path.join(args.frames, names[-1]), frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
        k += 1
    if k != len(odometry):
        print(f"warning: rgb.mp4 has {k} frames and odometry.csv {len(odometry)} rows; video frame k is taken as row k")
    list_path = os.path.join(args.frames, args.name, "list.txt")
    with open(list_path, "w") as f:
        f.write("\n".join(names) + "\n")
    fx, fy, cx, cy = odometry[min(odometry)][1]
    print(
        f"Wrote {len(names)} frames. Register them into a COPY of the database of the model gsplat trains on:\n"
        f"  cp DATABASE.db lidar-reg.db\n"
        f"  colmap feature_extractor --database_path lidar-reg.db --image_path {args.frames} \\\n"
        f"      --image_list_path {list_path} --ImageReader.single_camera 1 \\\n"
        f"      --ImageReader.camera_model PINHOLE --ImageReader.camera_params {fx:.2f},{fy:.2f},{cx:.2f},{cy:.2f}\n"
        f"  colmap vocab_tree_matcher --database_path lidar-reg.db \\\n"
        f"      --VocabTreeMatching.vocab_tree_path VOCAB_TREE --VocabTreeMatching.match_list_path {list_path}\n"
        f"  colmap image_registrator --database_path lidar-reg.db --input_path SPARSE_MODEL --output_path sparse-lidar-reg"
    )


def align(args):
    import pycolmap

    odometry = read_odometry(args.stray)
    rec = pycolmap.Reconstruction(args.registered)
    pattern = re.compile(rf"(?:^|/){re.escape(args.name)}_(\d+)\.jpg$")
    frames, centres, rotations = [], [], []
    for image_id in rec.reg_image_ids():
        image = rec.images[image_id]
        m = pattern.search(image.name)
        if m and int(m.group(1)) in odometry:
            R_cw, centre = colmap_pose(image)
            frames.append(int(m.group(1)))
            centres.append(centre)
            rotations.append(R_cw.T)
    if len(frames) < 6:
        sys.exit(f"Only {len(frames)} {args.name}_* frames are registered in {args.registered}; need at least 6.")

    stray_T = [odometry[k][0] for k in frames]
    s, R, t, inliers, err = fit_similarity(np.array([T[:3, 3] for T in stray_T]), np.array(centres), args.inlier_m)

    # Stray stores OpenCV camera axes (per its OdometryEncoder); check against COLMAP rather than trust it.
    rot_err = {
        flip: np.median(
            [rotation_deg(R @ T[:3, :3] @ (FLIP if flip else np.eye(3)), Rc) for T, Rc, ok in zip(stray_T, rotations, inliers) if ok]
        )
        for flip in (False, True)
    }
    flip = rot_err[True] < rot_err[False]
    result = {
        "name": args.name,
        "scale": s,
        "R": R.tolist(),
        "t": t.tolist(),
        "flip_axes": bool(flip),
        "registered": len(frames),
        "inliers": int(inliers.sum()),
        "median_residual_m": float(np.median(err[inliers])),
        "max_inlier_residual_m": float(err[inliers].max()),
        "median_rotation_deg": float(rot_err[flip]),
    }
    with open(args.out, "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps({k: v for k, v in result.items() if k not in ("R", "t")}, indent=2))
    print(f"COLMAP units per metre: {s:.4f}. Check it against the laser readings and AprilTag sizes.")
    if result["median_rotation_deg"] > 5 or result["median_residual_m"] > 0.05:
        print("warning: residuals are high; check registration before rendering depth.")


def mark_free(free, origin, T, depth, K, stride=2):
    """Mark grid voxels that a LiDAR ray crossed before hitting its surface."""
    fx, fy, cx, cy = K
    v, u = np.mgrid[0 : depth.shape[0] : stride, 0 : depth.shape[1] : stride]
    d = depth[v, u]
    keep = d > 0
    if not keep.any():
        return
    u, v, d = u[keep], v[keep], d[keep]
    dirs = np.stack([(u - cx) / fx, (v - cy) / fy, np.ones_like(d)], 1) @ T[:3, :3].T  # unit camera-z
    zs = np.arange(0.0, d.max(), FREE_VOXEL_M / 2, dtype=np.float32)
    pts = T[:3, 3] + zs[None, :, None] * dirs[:, None, :]
    pts = pts[zs[None, :] < d[:, None] - 2 * FREE_VOXEL_M]
    idx = np.floor((pts - origin) / FREE_VOXEL_M).astype(np.int64)
    idx = idx[np.all((idx >= 0) & (idx < free.shape), 1)]
    free[idx[:, 0], idx[:, 1], idx[:, 2]] = 1


def seen_free(free, origin, centre, dirs, z, near, chunk=10000):
    """True for each ray whose path from `near` to 2 voxels before depth z crosses only LiDAR-seen free space.

    centre, dirs and z are in the free grid's frame and units (metres); dirs have unit camera-z.
    """
    ok = np.zeros(len(z), bool)
    rays = np.flatnonzero(z > 0)
    for start in range(0, len(rays), chunk):
        r = rays[start : start + chunk]
        zs = np.arange(near, z[r].max(), FREE_VOXEL_M / 2, dtype=np.float32)
        pts = centre + zs[None, :, None] * dirs[r, None, :]
        need = zs[None, :] < z[r, None] - 2 * FREE_VOXEL_M
        idx = np.floor((pts - origin) / FREE_VOXEL_M).astype(np.int64)
        inside = np.all((idx >= 0) & (idx < free.shape), -1)
        seen = np.zeros(need.shape, bool)
        ii = idx[inside]
        seen[inside] = free[ii[:, 0], ii[:, 1], ii[:, 2]] > 0
        ok[r] = np.all(seen | ~need, 1)
    return ok


def render(args):
    import open3d as o3d
    import open3d.core as o3c
    import pycolmap

    al = json.load(open(args.align))
    s, R, t = al["scale"], np.array(al["R"]), np.array(al["t"])
    F = FLIP if al["flip_axes"] else np.eye(3)
    odometry = read_odometry(args.stray)
    _, rgb_w, rgb_h = open_video(args.stray)
    keys = sorted(odometry)[:: args.every]

    centres = np.array([odometry[k][0][:3, 3] for k in keys])
    origin = centres.min(0) - args.max_depth - FREE_VOXEL_M
    free = np.zeros(np.ceil((np.ptp(centres, 0) + 2 * args.max_depth) / FREE_VOXEL_M).astype(int) + 3, np.uint8)
    # Tensor TSDF: Open3D 0.20's legacy ScalableTSDFVolume integrated nothing in testing.
    vbg = o3d.t.geometry.VoxelBlockGrid(
        attr_names=("tsdf", "weight"),
        attr_dtypes=(o3c.float32, o3c.float32),
        attr_channels=((1), (1)),
        voxel_size=args.voxel,
        block_resolution=8,
        block_count=100000,
        device=o3c.Device("CPU:0"),
    )
    for k in keys:
        depth = cv2.imread(os.path.join(args.stray, "depth", f"{k:06d}.png"), cv2.IMREAD_UNCHANGED)
        conf = cv2.imread(os.path.join(args.stray, "confidence", f"{k:06d}.png"), cv2.IMREAD_UNCHANGED)
        if depth is None:
            continue
        depth = depth.astype(np.float32) / 1000.0
        if conf is not None:
            depth[conf < args.min_confidence] = 0.0
        depth[depth > args.max_depth] = 0.0
        if not (depth > 0).any():
            continue
        T = odometry[k][0].copy()
        T[:3, :3] = T[:3, :3] @ F
        fx, fy, cx, cy = odometry[k][1]
        h, w = depth.shape
        K = (fx * w / rgb_w, fy * h / rgb_h, cx * w / rgb_w, cy * h / rgb_h)
        intrinsic = o3c.Tensor([[K[0], 0, K[2]], [0, K[1], K[3]], [0, 0, 1]], o3c.float64)
        extrinsic = o3c.Tensor(np.linalg.inv(T), o3c.float64)
        image = o3d.t.geometry.Image(np.ascontiguousarray(depth))
        fuse = dict(depth_scale=1.0, depth_max=args.max_depth, trunc_voxel_multiplier=4.0)
        blocks = vbg.compute_unique_block_coordinates(image, intrinsic, extrinsic, **fuse)
        vbg.integrate(blocks, image, intrinsic, extrinsic, **fuse)
        mark_free(free, origin, T, depth, K)

    try:
        # A surface must be seen in at least 2 fused frames, which drops one-frame noise.
        mesh = vbg.extract_triangle_mesh(weight_threshold=2.0).to_legacy()
    except RuntimeError:  # Open3D raises instead of returning an empty mesh
        mesh = o3d.geometry.TriangleMesh()
    if len(mesh.triangles) == 0:
        sys.exit("The fused LiDAR mesh is empty: check depth/, confidence/ and --min-confidence.")
    mesh.vertices = o3d.utility.Vector3dVector(s * np.asarray(mesh.vertices) @ R.T + t)  # into the COLMAP frame
    if args.mesh:
        o3d.io.write_triangle_mesh(args.mesh, mesh)
    scene = o3d.t.geometry.RaycastingScene()
    scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(mesh))

    rec = pycolmap.Reconstruction(args.model)
    coverage = []
    for image_id in rec.reg_image_ids():
        image = rec.images[image_id]
        centre, dirs, (h, w) = camera_rays(rec.cameras[image.camera_id], image, args.downscale)
        rays = np.concatenate([np.broadcast_to(centre, dirs.shape), dirs], 1).astype(np.float32)
        z = scene.cast_rays(o3d.core.Tensor(rays))["t_hit"].numpy().astype(np.float64)  # = z-depth
        z[~np.isfinite(z)] = 0.0
        # Check free space in the LiDAR frame, in metres: p_lidar = R^T (p - t) / s, depth z / s.
        ok = seen_free(free, origin, (centre - t) @ R / s, dirs @ R, z / s, near=args.near)
        z[~ok] = 0.0
        coverage.append(ok.mean())
        out = os.path.join(args.out, os.path.splitext(image.name)[0] + ".npy")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        np.save(out, z.reshape(h, w).astype(np.float16))
    coverage = np.array(coverage)
    print(
        f"Wrote {len(coverage)} depth maps to {args.out}. Pixels with depth per image: "
        f"median {np.median(coverage):.0%}, 10th percentile {np.percentile(coverage, 10):.0%}."
    )


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract", help="save every Nth Stray RGB frame for COLMAP registration")
    e.add_argument("--stray", required=True, help="Stray Scanner session folder")
    e.add_argument("--frames", required=True, help="output image root for the registration")
    e.add_argument("--name", required=True, help="session name, e.g. R504")
    e.add_argument("--every", type=int, default=30)
    a = sub.add_parser("align", help="fit the ARKit -> COLMAP similarity from the registered frames")
    a.add_argument("--stray", required=True)
    a.add_argument("--registered", required=True, help="COLMAP model written by image_registrator")
    a.add_argument("--name", required=True)
    a.add_argument("--out", required=True, help="alignment JSON")
    a.add_argument("--inlier-m", type=float, default=0.1, help="RANSAC inlier distance in metres")
    r = sub.add_parser("render", help="write one depth map per training image")
    r.add_argument("--stray", required=True)
    r.add_argument("--align", required=True, help="alignment JSON from align")
    r.add_argument("--model", required=True, help="the COLMAP model gsplat trains on (e.g. DATA/sparse/0)")
    r.add_argument("--out", required=True, help="--depth_dir for the patched trainer")
    r.add_argument("--mesh", help="also write the fused mesh (COLMAP frame) here, for inspection")
    r.add_argument("--every", type=int, default=10, help="fuse every Nth LiDAR frame")
    r.add_argument("--voxel", type=float, default=0.02, help="TSDF voxel size in metres")
    r.add_argument("--max-depth", type=float, default=4.0, help="ignore LiDAR depth beyond this (metres)")
    r.add_argument("--min-confidence", type=int, default=2, help="Stray confidence 0-2")
    r.add_argument("--near", type=float, default=0.3, help="free-space check starts this far from a training camera (metres)")
    r.add_argument("--downscale", type=int, default=4, help="depth map size = training camera size / this")
    args = p.parse_args()
    {"extract": extract, "align": align, "render": render}[args.cmd](args)


if __name__ == "__main__":
    main()
