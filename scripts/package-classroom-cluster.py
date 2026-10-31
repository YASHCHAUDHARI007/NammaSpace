"""Package reviewed classroom images and COLMAP poses for Nerfstudio 1.1.5.

Run with the Python environment that has pycolmap and numpy. The output uses
one camera model per frame because the video and stills have different lenses.
Room scale remains unknown. No room dimensions are written to the dataset.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import struct

import numpy as np
import pycolmap


WORLD_TO_NERFSTUDIO = np.array(
    [[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0]], dtype=np.float64
)


def write_ply(path: Path, points: list[tuple[np.ndarray, np.ndarray]]) -> None:
    header = (
        "ply\nformat binary_little_endian 1.0\n"
        f"element vertex {len(points)}\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n"
    )
    with path.open("wb") as output:
        output.write(header.encode("ascii"))
        for xyz, color in points:
            output.write(struct.pack("<fffBBB", *xyz, *color))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", type=Path, help="Reviewed 1920x1080 JPG folder")
    parser.add_argument("model", type=Path, help="COLMAP sparse model folder")
    parser.add_argument("output", type=Path, help="New Nerfstudio dataset folder")
    parser.add_argument("--video-only", action="store_true")
    parser.add_argument("--max-point-error", type=float, default=2.5)
    parser.add_argument("--min-point-views", type=int, default=3)
    args = parser.parse_args()
    if not args.images.is_dir() or not args.model.is_dir():
        parser.error("Input image or model folder does not exist")
    if args.output.exists():
        parser.error(f"Output already exists: {args.output}")
    if args.max_point_error <= 0 or args.min_point_views < 2:
        parser.error("Point limits must be positive, with at least two views")

    model = pycolmap.Reconstruction(str(args.model))
    selected = {path.name: path for path in args.images.iterdir() if path.suffix.lower() == ".jpg"}
    registered = sorted(
        (image for image in model.images.values()
         if image.has_pose and image.name.split("/")[-1] in selected
         and (not args.video_only or not image.name.startswith("photos/"))),
        key=lambda image: image.name,
    )
    if len(registered) < 20:
        parser.error(f"Only {len(registered)} selected images have camera poses")

    output = args.output.resolve()
    image_dir = output / "images"
    image_dir.mkdir(parents=True)
    frames = []
    for image in registered:
        camera = model.cameras[image.camera_id]
        if camera.model != pycolmap.CameraModelId.SIMPLE_RADIAL:
            raise ValueError(f"Unsupported camera model for {image.name}: {camera.model}")
        focal, cx, cy, k1 = map(float, camera.params)
        c2w = np.eye(4)
        c2w[:3, :] = image.cam_from_world().inverse().matrix()
        c2w[:3, 1:3] *= -1  # OpenCV camera axes to OpenGL camera axes.
        c2w = np.vstack((WORLD_TO_NERFSTUDIO, [0, 0, 0, 1])) @ c2w
        if not np.isfinite(c2w).all() or abs(np.linalg.det(c2w[:3, :3]) - 1) > 1e-5:
            raise ValueError(f"Invalid camera pose: {image.name}")
        name = image.name.split("/")[-1]
        source, destination = selected[name], image_dir / name
        try:
            os.link(source, destination)
        except OSError:
            shutil.copy2(source, destination)
        frames.append({
            "file_path": f"./images/{name}",
            "transform_matrix": c2w.tolist(),
            "colmap_im_id": image.image_id,
            "camera_model": "OPENCV",
            "fl_x": focal, "fl_y": focal, "cx": cx, "cy": cy,
            "k1": k1, "k2": 0.0, "p1": 0.0, "p2": 0.0,
            "w": camera.width, "h": camera.height,
        })

    selected_ids = {image.image_id for image in registered}
    points = []
    for point in model.points3D.values():
        if point.error > args.max_point_error:
            continue
        if sum(element.image_id in selected_ids for element in point.track.elements) < args.min_point_views:
            continue
        x, y, z = map(float, point.xyz)
        xyz = np.array([x, z, -y], dtype=np.float32)
        color = np.asarray(point.color, dtype=np.uint8)
        if np.isfinite(xyz).all():
            points.append((xyz, color))
    if len(points) < 1000:
        raise ValueError(f"Only {len(points)} clean starting points")
    write_ply(output / "sparse_pc.ply", points)

    transforms = {
        "applied_transform": WORLD_TO_NERFSTUDIO.tolist(),
        "ply_file_path": "sparse_pc.ply",
        "frames": frames,
    }
    (output / "transforms.json").write_text(json.dumps(transforms, indent=2) + "\n")
    summary = {
        "selected_images": len(selected),
        "registered_images": len(registered),
        "registered_video_frames": sum(not image.name.startswith("photos/") for image in registered),
        "registered_stills": sum(image.name.startswith("photos/") for image in registered),
        "unregistered_or_excluded_names": sorted(set(selected) - {image.name.split("/")[-1] for image in registered}),
        "clean_starting_points": len(points),
        "max_point_error_px": args.max_point_error,
        "min_point_views": args.min_point_views,
        "room_dimensions_known": False,
        "nerfstudio_version_target": "1.1.5",
    }
    (output / "package-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
