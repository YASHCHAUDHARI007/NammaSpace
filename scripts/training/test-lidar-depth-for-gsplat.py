"""Synthetic end-to-end check for lidar-depth-for-gsplat.py: a fake Stray session in a known room.

    uv run --python cpython-3.12-macos-aarch64-none --with numpy --with opencv-python-headless \
        --with open3d --with pycolmap python -I scripts/training/test-lidar-depth-for-gsplat.py

The room is 6 x 3 x 8 m with a box in the middle whose LiDAR returns are low-confidence (like a black
chair). The test checks that align recovers a known similarity transform (and the camera-axis
convention) despite outliers, that rendered depth matches the true z-depth, and that pixels on the
unseen box get 0 rather than the depth of the floor behind it.
"""
import importlib.util
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np
import open3d as o3d
import pycolmap

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "lidar-depth-for-gsplat.py")
spec = importlib.util.spec_from_file_location("lidar", SCRIPT)
lidar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lidar)


def R_to_quat(R):
    """(qx, qy, qz, qw) for a rotation matrix (Shepperd's method)."""
    m = R
    tr = np.trace(m)
    if tr > 0:
        S = np.sqrt(tr + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / S, (m[0, 2] - m[2, 0]) / S, (m[1, 0] - m[0, 1]) / S, 0.25 * S]
    else:
        i = int(np.argmax(np.diag(m)))
        j, k = (i + 1) % 3, (i + 2) % 3
        S = np.sqrt(1.0 + m[i, i] - m[j, j] - m[k, k]) * 2
        q = [0.0, 0.0, 0.0, (m[k, j] - m[j, k]) / S]
        q[i] = 0.25 * S
        q[j] = (m[j, i] + m[i, j]) / S
        q[k] = (m[k, i] + m[i, k]) / S
    return q


def look_at(pos, target):
    """Camera-to-world rotation, OpenCV axes (+Y down, +Z forward), world +Y up."""
    z = (target - pos) / np.linalg.norm(target - pos)
    y = np.array([0.0, -1.0, 0.0])
    y = y - y.dot(z) * z
    y /= np.linalg.norm(y)
    return np.stack([np.cross(y, z), y, z], 1)


def scene_with(meshes):
    scene = o3d.t.geometry.RaycastingScene()
    for m in meshes:
        scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(m))
    return scene


room = o3d.geometry.TriangleMesh.create_box(6, 3, 8).translate((-3, 0, -4))
dark_box = o3d.geometry.TriangleMesh.create_box(0.6, 1.0, 0.6).translate((-0.3, 0, -0.3))
true_scene = scene_with([room, dark_box])  # geometry ids: room 0, box 1

RGB_W, RGB_H, F_RGB = 1920, 1440, 1400.0
DW, DH = 256, 192
sx = DW / RGB_W
Kd = (F_RGB * sx, F_RGB * sx, 960 * sx, 720 * sx)

# Known LiDAR -> COLMAP similarity.
a = 0.7
S_TRUE = 0.8
R_TRUE = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]]) @ np.array(
    [[1, 0, 0], [0, np.cos(0.2), -np.sin(0.2)], [0, np.sin(0.2), np.cos(0.2)]]
)
T_TRUE = np.array([1.0, -2.0, 3.0])


def to_colmap(p):
    return S_TRUE * p @ R_TRUE.T + T_TRUE


def write_session(stray, flip):
    """24 poses on a loop at 1.5 m looking at the box; depth with the box's returns at confidence 0."""
    os.makedirs(os.path.join(stray, "depth"))
    os.makedirs(os.path.join(stray, "confidence"))
    rows, poses = [], []
    for k in range(24):
        th = 2 * np.pi * k / 24
        pos = np.array([2.5 * np.cos(th), 1.5, 2.5 * np.sin(th)])
        R_wc = look_at(pos, np.array([0.0, 0.75, 0.0]))
        poses.append((pos, R_wc))
        v, u = np.mgrid[0:DH, 0:DW]
        dirs = np.stack([(u - Kd[2]) / Kd[0], (v - Kd[3]) / Kd[1], np.ones_like(u, float)], -1).reshape(-1, 3) @ R_wc.T
        rays = np.concatenate([np.broadcast_to(pos, dirs.shape), dirs], 1).astype(np.float32)
        hit = true_scene.cast_rays(o3d.core.Tensor(rays))
        z = hit["t_hit"].numpy()
        gid = hit["geometry_ids"].numpy()
        z[~np.isfinite(z)] = 0
        conf = np.where(gid == 1, 0, 2).astype(np.uint8)
        cv2.imwrite(os.path.join(stray, "depth", f"{k:06d}.png"), np.round(z * 1000).astype(np.uint16).reshape(DH, DW))
        cv2.imwrite(os.path.join(stray, "confidence", f"{k:06d}.png"), conf.reshape(DH, DW))
        q = R_to_quat(R_wc @ lidar.FLIP if flip else R_wc)
        rows.append(f"{k / 60:.4f}, {k:06d}, {pos[0]}, {pos[1]}, {pos[2]}, {q[0]}, {q[1]}, {q[2]}, {q[3]}, {F_RGB}, {F_RGB}, 960.0, 720.0, 960.0, 720.0")
    with open(os.path.join(stray, "odometry.csv"), "w") as f:
        f.write("timestamp, frame, x, y, z, qx, qy, qz, qw, fx, fy, cx, cy, distortion_center_x, distortion_center_y\n")
        f.write("\n".join(rows) + "\n")
    writer = cv2.VideoWriter(os.path.join(stray, "rgb.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), 60, (RGB_W, RGB_H))
    for _ in range(24):
        writer.write(np.full((RGB_H, RGB_W, 3), 128, np.uint8))
    writer.release()
    return poses


def add_image(rec, image_id, name, camera_id, pos, R_wc):
    R_cw = R_TRUE @ R_wc
    R_cw = R_cw.T
    centre = to_colmap(pos)
    image = pycolmap.Image(name=name, camera_id=camera_id, image_id=image_id)
    rec.add_image_with_trivial_frame(image, pycolmap.Rigid3d(pycolmap.Rotation3d(R_cw), -R_cw @ centre))


def run(*args):
    subprocess.run([sys.executable, "-I", SCRIPT, *args], check=True)


with tempfile.TemporaryDirectory() as tmp:
    stray = os.path.join(tmp, "R")
    poses = write_session(stray, flip=False)

    # extract: every 5th frame, names the registration step expects.
    run("extract", "--stray", stray, "--frames", os.path.join(tmp, "frames"), "--name", "R", "--every", "5")
    listed = open(os.path.join(tmp, "frames", "R", "list.txt")).read().split()
    assert listed == [f"R/R_{k:06d}.jpg" for k in (0, 5, 10, 15, 20)], listed
    assert all(os.path.exists(os.path.join(tmp, "frames", n)) for n in listed)

    # The "registered" model: every 2nd LiDAR frame at its true COLMAP pose, two of them 1 m off.
    reg = pycolmap.Reconstruction()
    reg.add_camera_with_trivial_rig(pycolmap.Camera(model="PINHOLE", width=RGB_W, height=RGB_H, params=[F_RGB, F_RGB, 960, 720], camera_id=1))
    for i, k in enumerate(range(0, 24, 2)):
        pos, R_wc = poses[k]
        if k in (4, 10):
            pos = pos + np.array([1.0, 0.0, 0.0])
        add_image(reg, i + 1, f"R/R_{k:06d}.jpg", 1, pos, R_wc)
    reg_dir = os.path.join(tmp, "reg")
    os.makedirs(reg_dir)
    reg.write(reg_dir)

    align_json = os.path.join(tmp, "align.json")
    run("align", "--stray", stray, "--registered", reg_dir, "--name", "R", "--out", align_json)
    import json

    al = json.load(open(align_json))
    assert abs(al["scale"] - S_TRUE) < 1e-6, al["scale"]
    assert np.allclose(al["R"], R_TRUE, atol=1e-6) and np.allclose(al["t"], T_TRUE, atol=1e-6)
    assert al["flip_axes"] is False and al["inliers"] == 10 and al["registered"] == 12, al

    # Same session written with ARKit camera axes: align must detect the flip.
    stray_flip = os.path.join(tmp, "R_flip")
    write_session(stray_flip, flip=True)
    run("align", "--stray", stray_flip, "--registered", reg_dir, "--name", "R", "--out", os.path.join(tmp, "flip.json"))
    assert json.load(open(os.path.join(tmp, "flip.json")))["flip_axes"] is True

    # Training model: distorted cameras. T1 looks at the box, T2 straight at the -X wall 5 m away.
    train = pycolmap.Reconstruction()
    train.add_camera_with_trivial_rig(
        pycolmap.Camera(model="OPENCV", width=800, height=600, params=[600, 600, 400, 300, -0.1, 0.02, 0, 0], camera_id=1)
    )
    t1 = (np.array([0.0, 1.2, 2.0]), look_at(np.array([0.0, 1.2, 2.0]), np.array([0.0, 0.5, 0.0])))
    t2 = (np.array([2.0, 1.5, 0.0]), look_at(np.array([2.0, 1.5, 0.0]), np.array([-3.0, 1.5, 0.0])))
    add_image(train, 1, "train/T1.jpg", 1, *t1)
    add_image(train, 2, "train/T2.jpg", 1, *t2)
    train_dir = os.path.join(tmp, "train")
    os.makedirs(train_dir)
    train.write(train_dir)

    depths = os.path.join(tmp, "depths")
    # --max-depth 6: the walls are 5.5 m from the far side of the LiDAR loop in this room.
    run("render", "--stray", stray, "--align", align_json, "--model", train_dir, "--out", depths,
        "--every", "1", "--downscale", "2", "--max-depth", "6")

    # Ground truth in the COLMAP frame, same rays.
    room_c = o3d.geometry.TriangleMesh(room)
    room_c.vertices = o3d.utility.Vector3dVector(to_colmap(np.asarray(room.vertices)))
    box_c = o3d.geometry.TriangleMesh(dark_box)
    box_c.vertices = o3d.utility.Vector3dVector(to_colmap(np.asarray(dark_box.vertices)))
    gt_scene = scene_with([room_c, box_c])
    train = pycolmap.Reconstruction(train_dir)
    for image_id in train.reg_image_ids():
        image = train.images[image_id]
        centre, dirs, (h, w) = lidar.camera_rays(train.cameras[image.camera_id], image, 2)
        hit = gt_scene.cast_rays(o3d.core.Tensor(np.concatenate([np.broadcast_to(centre, dirs.shape), dirs], 1).astype(np.float32)))
        gt = hit["t_hit"].numpy().reshape(h, w)
        on_box = hit["geometry_ids"].numpy().reshape(h, w) == 1
        got = np.load(os.path.join(depths, "train", os.path.splitext(os.path.basename(image.name))[0] + ".npy")).astype(np.float64)
        assert got.shape == (h, w) and got.dtype == np.float64
        valid = got > 0
        assert valid.any(), f"{image.name}: no pixel got depth"
        err = np.abs(got - gt)[valid]
        print(f"{image.name}: {valid.mean():.0%} pixels with depth, median error {np.median(err) / S_TRUE * 100:.1f} cm, "
              f"95th pct {np.percentile(err, 95) / S_TRUE * 100:.1f} cm, 99th pct {np.percentile(err, 99) / S_TRUE * 100:.1f} cm, "
              f"box pixels with depth {(valid & on_box).sum()}/{on_box.sum()}")
        # 256 x 192 depth fused at 2 cm: centimetre error, a little more at grazing angles and 6 m range.
        assert np.median(err) < 0.015 * S_TRUE and np.percentile(err, 95) < 0.05 * S_TRUE, "rendered depth is off"
        assert np.percentile(err, 99) < 0.10 * S_TRUE, "some pixels took the depth of the wrong surface"
        if image.name.endswith("T2.jpg"):
            # Independent check that the output is camera z-depth, not ray length: the wall is
            # perpendicular to the optical axis 5 m away, so z is 5 m across the centre of the image.
            centre_block = got[int(0.4 * h) : int(0.6 * h), int(0.3 * w) : int(0.7 * w)]
            assert (centre_block > 0).mean() > 0.9, (centre_block > 0).mean()
            assert np.abs(centre_block[centre_block > 0] - 5.0 * S_TRUE).max() < 0.03 * S_TRUE
            assert valid.mean() > 0.4
        else:
            assert on_box.sum() > 1000 and (valid & on_box).sum() <= 0.02 * on_box.sum(), "unseen box got depth"
            assert valid.mean() > 0.2

    # seen_free on its own: a ray through a hole in the grid fails, a ray through free voxels passes.
    free = np.ones((40, 40, 40), np.uint8)
    free[20, :, 20] = 0
    origin = np.zeros(3)
    centre = np.array([1.025, 0.1, 1.025])
    dirs = np.array([[0.0, 1.0, 0.0], [1.0, 1.0, 0.0]])  # along the hole; diagonal away from it
    # near=0.1: the camera itself sits in the hole column; the diagonal ray leaves it within 0.1.
    ok = lidar.seen_free(free, origin, centre, dirs, np.array([1.5, 0.5]), near=0.1)
    assert ok.tolist() == [False, True], ok

print("lidar depth for gsplat: OK (extract, align with outliers and axis flip, render accuracy, unseen box masked)")
