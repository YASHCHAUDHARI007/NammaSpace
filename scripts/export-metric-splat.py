"""Convert a trained Gaussian PLY to a floor-aligned 32-byte .splat.

Use an identity transform for PLY files already in COLMAP coordinates. This
script needs the PLY, a dataparser transform, and a screen/floor calibration.
The calibration can use measured metres or arbitrary relative scene units.
"""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from plyfile import PlyData
from scipy.spatial.transform import Rotation
from scipy.special import expit


SH_C0 = 0.28209479177387814
CROP_MIN = np.array([-5.0, -0.5, -1.2])
CROP_MAX = np.array([5.0, 3.8, 12.5])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ply", type=Path)
    parser.add_argument("dataparser_transform", type=Path)
    parser.add_argument("calibration", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--min-opacity", type=float, default=0.01)
    parser.add_argument("--max-axis-scale-m", type=float, default=0.0,
                        help="Discard unusually broad Gaussians; 0 disables this filter")
    parser.add_argument("--crop-min", type=float, nargs=3, default=CROP_MIN.tolist(),
                        help="Outlier envelope minimum in output units")
    parser.add_argument("--crop-max", type=float, nargs=3, default=CROP_MAX.tolist(),
                        help="Outlier envelope maximum in output units")
    args = parser.parse_args()
    crop_min = np.asarray(args.crop_min, dtype=float)
    crop_max = np.asarray(args.crop_max, dtype=float)
    if (not 0 <= args.min_opacity < 1 or args.max_axis_scale_m < 0
            or not np.isfinite(crop_min).all() or not np.isfinite(crop_max).all()
            or not (crop_min < crop_max).all()):
        parser.error("Invalid opacity or Gaussian scale threshold")

    vertices = PlyData.read(str(args.ply))["vertex"].data
    source = np.stack([vertices[field] for field in "xyz"], axis=1).astype(np.float64)
    dataparser = json.loads(args.dataparser_transform.read_text())
    calibration = json.loads(args.calibration.read_text())
    matrix = np.asarray(dataparser["transform"], dtype=np.float64)
    model_scale = float(dataparser["scale"])
    viewer_axes = np.asarray(
        [calibration[f"viewer_{axis}_colmap_axis"] for axis in ("right", "up", "front")],
        dtype=np.float64,
    )
    floor_origin = np.asarray(calibration["viewer_floor_origin_colmap_units"], dtype=np.float64)
    metric = bool(calibration.get("metric_scale_known", "metres_per_model_unit" in calibration))
    scene_scale = float(calibration["metres_per_model_unit"] if metric else calibration["scene_units_per_model_unit"])

    # dataparser_transform maps the original COLMAP world to Nerfstudio model axes.
    colmap_positions = (source / model_scale - matrix[:, 3]) @ matrix[:, :3]
    positions = (colmap_positions - floor_origin) @ viewer_axes.T * scene_scale
    alpha = expit(vertices["opacity"].astype(np.float64))
    selected = (
        np.isfinite(positions).all(axis=1)
        & (positions >= crop_min).all(axis=1)
        & (positions <= crop_max).all(axis=1)
        & (alpha >= args.min_opacity)
    )
    positions = positions[selected]
    alpha = alpha[selected]

    scales = np.exp(np.stack([vertices[f"scale_{i}"] for i in range(3)], axis=1)[selected])
    scales *= scene_scale / model_scale
    sh0 = np.stack([vertices[f"f_dc_{i}"] for i in range(3)], axis=1)[selected]
    rgb = np.clip(0.5 + SH_C0 * sh0, 0.0, 1.0)
    source_quaternions = np.stack([vertices[f"rot_{i}"] for i in range(4)], axis=1)[selected]
    source_quaternions /= np.linalg.norm(source_quaternions, axis=1, keepdims=True)
    rotate_model_to_viewer = viewer_axes @ matrix[:, :3].T
    world_rotation = Rotation.from_matrix(rotate_model_to_viewer)
    gaussian_rotation = Rotation.from_quat(source_quaternions[:, [1, 2, 3, 0]])
    xyzw = (world_rotation * gaussian_rotation).as_quat()
    wxyz = xyzw[:, [3, 0, 1, 2]]

    finite = np.isfinite(positions).all(axis=1) & np.isfinite(scales).all(axis=1) & (scales > 0).all(axis=1)
    if args.max_axis_scale_m:
        finite &= (scales <= args.max_axis_scale_m).all(axis=1)
    positions, scales, rgb, alpha, wxyz = (
        values[finite] for values in (positions, scales, rgb, alpha, wxyz)
    )
    record_type = np.dtype(
        [
            ("position", "<f4", (3,)),
            ("scale", "<f4", (3,)),
            ("color", "u1", (4,)),
            ("rotation", "u1", (4,)),
        ]
    )
    assert record_type.itemsize == 32
    records = np.empty(len(positions), dtype=record_type)
    records["position"] = positions.astype(np.float32)
    records["scale"] = scales.astype(np.float32)
    records["color"] = np.clip(np.rint(np.c_[rgb, alpha] * 255), 0, 255).astype(np.uint8)
    records["rotation"] = np.clip(np.rint(128 + 128 * wxyz), 0, 255).astype(np.uint8)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    records.tofile(args.output)

    digest = sha256(args.output.read_bytes()).hexdigest()
    summary = {
        "source_ply": str(args.ply),
        "input_splats": len(vertices),
        "exported_splats": len(records),
        "bytes": args.output.stat().st_size,
        "sha256": digest,
        "scale_type": "metric" if metric else "relative",
        "unit_label": "m" if metric else calibration.get("unit_label", "relative scene units"),
        "crop_note": "Outlier cleanup envelope; not a measured room boundary",
        "min_opacity": args.min_opacity,
    }
    if metric:
        summary.update({
            "crop_min_m": crop_min.tolist(),
            "crop_max_m": crop_max.tolist(),
            "max_axis_scale_m": args.max_axis_scale_m,
            "floor_y_m": 0,
            "screen_width_m": calibration["inferred_width_m"],
            "screen_bottom_height_m": calibration["screen_bottom_height_above_floor_m"],
            "position_quantiles_m": np.quantile(positions, [0.01, 0.5, 0.99], axis=0).round(3).tolist(),
        })
    else:
        summary.update({
            "crop_min_scene_units": crop_min.tolist(),
            "crop_max_scene_units": crop_max.tolist(),
            "max_axis_scale_scene_units": args.max_axis_scale_m,
            "floor_y_scene_units": 0,
            "screen_width_scene_units": calibration["screen_width_scene_units"],
            "screen_bottom_height_scene_units": calibration["screen_bottom_height_scene_units"],
            "position_quantiles_scene_units": np.quantile(positions, [0.01, 0.5, 0.99], axis=0).round(3).tolist(),
        })
    args.output.with_suffix(".json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
