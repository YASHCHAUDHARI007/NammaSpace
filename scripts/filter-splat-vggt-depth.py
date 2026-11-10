"""Prune front-floating splats using VGGT depth checked against video SfM points."""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
import pycolmap


RECORD = np.dtype([
    ("position", "<f4", (3,)),
    ("scale", "<f4", (3,)),
    ("color", "u1", (4,)),
    ("rotation", "u1", (4,)),
])


def sample_bilinear(image: np.ndarray, xy: np.ndarray) -> np.ndarray:
    height, width = image.shape
    x = np.clip(xy[:, 0], 0, width - 1.001)
    y = np.clip(xy[:, 1], 0, height - 1.001)
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    dx = x - x0
    dy = y - y0
    return (
        image[y0, x0] * (1 - dx) * (1 - dy)
        + image[y0, x0 + 1] * dx * (1 - dy)
        + image[y0 + 1, x0] * (1 - dx) * dy
        + image[y0 + 1, x0 + 1] * dx * dy
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("depth", type=Path)
    parser.add_argument("validation", type=Path)
    parser.add_argument("model", type=Path)
    parser.add_argument("calibration", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--absolute-tolerance", type=float, default=0.25,
                        help="Minimum accepted camera-depth difference in scene units")
    parser.add_argument("--relative-tolerance", type=float, default=0.04)
    parser.add_argument("--minimum-confidence", type=float, default=1.5)
    parser.add_argument("--minimum-front-views", type=int, default=3)
    parser.add_argument("--maximum-support-views", type=int, default=1)
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        parser.error("Source and output must differ")
    if (args.absolute_tolerance <= 0 or args.relative_tolerance <= 0
            or args.minimum_front_views < 1 or args.maximum_support_views < 0):
        parser.error("Use positive tolerances and valid view counts")
    if args.source.stat().st_size % RECORD.itemsize:
        parser.error("Source is not a standard 32-byte splat")

    splats = np.fromfile(args.source, dtype=RECORD)
    inference = np.load(args.depth)
    depth_maps = np.squeeze(inference["depth"])
    confidence_maps = np.squeeze(inference["confidence"])
    names = [str(name) for name in inference["names"]]
    fits = {row["image"]: row for row in json.loads(args.validation.read_text())["frames"]
            if "slope" in row and row["slope"] > 0}
    calibration = json.loads(args.calibration.read_text())
    axes = np.asarray([calibration[f"viewer_{axis}_colmap_axis"]
                       for axis in ("right", "up", "front")], dtype=np.float64)
    scale = float(calibration["scene_units_per_model_unit"])
    origin = np.asarray(calibration["viewer_floor_origin_colmap_units"], dtype=np.float64)
    model_positions = splats["position"].astype(np.float64) / scale @ axes + origin
    reconstruction = pycolmap.Reconstruction(str(args.model))
    images = {image.name: image for image in reconstruction.images.values() if image.has_pose}

    front_count = np.zeros(len(splats), dtype=np.uint8)
    support_count = np.zeros(len(splats), dtype=np.uint8)
    checked_count = np.zeros(len(splats), dtype=np.uint8)
    per_frame = []
    for index, name in enumerate(names):
        if name not in fits or name not in images:
            continue
        image = images[name]
        camera = image.camera
        focal, cx, cy, k1 = map(float, camera.params)
        pose = image.cam_from_world().matrix()
        cam = model_positions @ pose[:, :3].T + pose[:, 3]
        z = cam[:, 2]
        positive = z > 0.01
        x = np.divide(cam[:, 0], z, out=np.zeros_like(z), where=positive)
        y = np.divide(cam[:, 1], z, out=np.zeros_like(z), where=positive)
        distortion = 1 + k1 * (x * x + y * y)
        u = focal * x * distortion + cx
        v = focal * y * distortion + cy
        visible = positive & (u >= 1) & (u < camera.width - 2) & (v >= 1) & (v < camera.height - 2)
        selected = np.flatnonzero(visible)
        coords = inference["coords"][index]
        square_xy = np.column_stack((
            coords[0] + u[selected] * (coords[2] - coords[0]) / coords[4],
            coords[1] + v[selected] * (coords[3] - coords[1]) / coords[5],
        ))
        depth = sample_bilinear(depth_maps[index], square_xy)
        confidence = sample_bilinear(confidence_maps[index], square_xy)
        valid = np.isfinite(depth) & (depth > 0) & (confidence >= args.minimum_confidence)
        selected = selected[valid]
        predicted = fits[name]["slope"] * depth[valid] + fits[name]["offset"]
        tolerance = np.maximum(args.absolute_tolerance / scale, args.relative_tolerance * predicted)
        difference = z[selected] - predicted
        checked_count[selected] += 1
        front_count[selected] += difference < -tolerance
        support_count[selected] += np.abs(difference) <= tolerance
        per_frame.append({"image": name, "checked_splats": int(len(selected)),
                          "front_splats": int((difference < -tolerance).sum()),
                          "supported_splats": int((np.abs(difference) <= tolerance).sum())})

    remove = ((front_count >= args.minimum_front_views)
              & (support_count <= args.maximum_support_views)
              & (front_count >= np.ceil(0.6 * checked_count)))
    retained = splats[~remove]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    retained.tofile(args.output)
    summary = {
        "source": str(args.source), "output": str(args.output),
        "source_splats": len(splats), "removed_splats": int(remove.sum()),
        "retained_splats": len(retained),
        "absolute_tolerance_scene_units": args.absolute_tolerance,
        "relative_tolerance": args.relative_tolerance,
        "minimum_confidence": args.minimum_confidence,
        "minimum_front_views": args.minimum_front_views,
        "maximum_support_views": args.maximum_support_views,
        "splats_checked_in_any_view": int((checked_count > 0).sum()),
        "front_view_count_histogram": np.bincount(front_count, minlength=len(per_frame) + 1).tolist(),
        "per_frame": per_frame,
        "sha256": sha256(args.output.read_bytes()).hexdigest(),
    }
    args.output.with_suffix(".json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({key: summary[key] for key in (
        "source_splats", "removed_splats", "retained_splats", "splats_checked_in_any_view", "sha256"
    )}, indent=2))


if __name__ == "__main__":
    main()
