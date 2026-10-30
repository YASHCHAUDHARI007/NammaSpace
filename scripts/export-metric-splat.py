"""Convert a trained Nerfstudio PLY to a floor-aligned, metric 32-byte .splat.

Run this on the cluster. It uses only the locally generated checkpoint export,
the dataparser transform, and the projector/floor calibration JSON.
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
    args = parser.parse_args()

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
    metric_scale = float(calibration["metres_per_model_unit"])

    # dataparser_transform maps the original COLMAP world to Nerfstudio model axes.
    colmap_positions = (source / model_scale - matrix[:, 3]) @ matrix[:, :3]
    positions = (colmap_positions - floor_origin) @ viewer_axes.T * metric_scale
    alpha = expit(vertices["opacity"].astype(np.float64))
    selected = (
        np.isfinite(positions).all(axis=1)
        & (positions >= CROP_MIN).all(axis=1)
        & (positions <= CROP_MAX).all(axis=1)
        & (alpha >= 0.01)
    )
    positions = positions[selected]
    alpha = alpha[selected]

    scales = np.exp(np.stack([vertices[f"scale_{i}"] for i in range(3)], axis=1)[selected])
    scales *= metric_scale / model_scale
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
        "crop_min_m": CROP_MIN.tolist(),
        "crop_max_m": CROP_MAX.tolist(),
        "floor_y_m": 0,
        "screen_width_m": calibration["inferred_width_m"],
        "screen_bottom_height_m": calibration["screen_bottom_height_above_floor_m"],
        "position_quantiles_m": np.quantile(positions, [0.01, 0.5, 0.99], axis=0).round(3).tolist(),
    }
    args.output.with_suffix(".json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
