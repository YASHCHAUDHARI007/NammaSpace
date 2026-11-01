"""Move a one-video scene origin from a raised platform to the walking floor."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pycolmap


def unit(vector: np.ndarray) -> np.ndarray:
    return vector / np.linalg.norm(vector)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("initial", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--height-min", type=float, required=True)
    parser.add_argument("--height-max", type=float, required=True)
    parser.add_argument("--rear-min", type=float, required=True)
    args = parser.parse_args()
    if args.height_min >= args.height_max:
        parser.error("The lower height must be smaller than the upper height")
    model = pycolmap.Reconstruction(str(args.model))
    initial = json.loads(args.initial.read_text())
    old_axes = np.asarray([initial[f"viewer_{name}_colmap_axis"]
                           for name in ("right", "up", "front")])
    old_origin = np.asarray(initial["viewer_floor_origin_colmap_units"])
    old_scale = float(initial["scene_units_per_model_unit"])
    world = np.asarray([point.xyz for point in model.points3D.values()])
    old_scene = (world - old_origin) @ old_axes.T * old_scale
    candidates = old_scene[(old_scene[:, 1] >= args.height_min)
                           & (old_scene[:, 1] <= args.height_max)
                           & (old_scene[:, 2] >= args.rear_min)]
    if len(candidates) < 500:
        raise ValueError(f"Only {len(candidates)} possible walking-floor points")
    rng = np.random.default_rng(23)
    best_count, best = 0, None
    for _ in range(4000):
        sample = candidates[rng.choice(len(candidates), 3, replace=False)]
        design = np.c_[sample[:, 0], sample[:, 2], np.ones(3)]
        if abs(np.linalg.det(design)) < 0.01:
            continue
        plane = np.linalg.solve(design, sample[:, 1])
        if np.linalg.norm(plane[:2]) > 0.12:
            continue
        residual = candidates[:, 1] - (candidates[:, 0] * plane[0]
                                       + candidates[:, 2] * plane[1] + plane[2])
        count = int(np.count_nonzero(abs(residual) < 0.025))
        if count > best_count:
            best_count, best = count, plane
    if best is None or best_count < 500:
        raise ValueError(f"Walking-floor fit has only {best_count} inliers")
    for _ in range(5):
        residual = candidates[:, 1] - (candidates[:, 0] * best[0]
                                       + candidates[:, 2] * best[1] + best[2])
        selected = abs(residual) < 0.025
        design = np.c_[candidates[selected, 0], candidates[selected, 2],
                       np.ones(selected.sum())]
        best = np.linalg.lstsq(design, candidates[selected, 1], rcond=None)[0]
    right_local = unit(np.array([1, best[0], 0]))
    up_local = unit(np.array([-best[0], 1, -best[1]]))
    front_local = unit(np.cross(right_local, up_local))
    new_axes = np.stack((right_local, up_local, front_local)) @ old_axes
    floor_origin = old_origin + np.array([0, best[2], 0]) @ old_axes / old_scale
    centers = np.asarray([image.projection_center() for image in model.images.values()
                          if image.has_pose])
    clearance_model = np.median((centers - floor_origin) @ new_axes[1])
    if clearance_model <= 0:
        raise ValueError("Walking floor is above the camera path")
    new_scale = float(1 / clearance_model)
    residual = candidates[:, 1] - (candidates[:, 0] * best[0]
                                   + candidates[:, 2] * best[1] + best[2])
    inliers = abs(residual) < 0.025
    camera_scene = (centers - floor_origin) @ new_axes.T * new_scale
    result = {
        "reference": "walking floor below the raised stage, fitted only to the source video",
        "unit_label": "relative scene units",
        "metric_scale_known": False,
        "room_dimensions_known": False,
        "camera_clearance_scene_units": 1.0,
        "scene_units_per_model_unit": new_scale,
        "viewer_floor_origin_colmap_units": floor_origin.tolist(),
        "viewer_right_colmap_axis": new_axes[0].tolist(),
        "viewer_up_colmap_axis": new_axes[1].tolist(),
        "viewer_front_colmap_axis": new_axes[2].tolist(),
        "floor_fit_sparse_inliers": int(inliers.sum()),
        "floor_fit_residual_sd_scene_units": float(np.std(residual[inliers])
                                                    * new_scale / old_scale),
        "stage_above_walking_floor_scene_units": float(-best[2] * new_scale / old_scale),
        "camera_position_quantiles_scene_units": np.quantile(camera_scene,
                                                               [.05, .5, .95], axis=0).round(3).tolist(),
        "limits": "Scale and horizontal orientation come from one video. No physical dimensions were measured.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
