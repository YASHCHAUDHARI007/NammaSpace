"""Align a one-video COLMAP room to its screen and floor without metric claims.

The screen height sets an arbitrary scene-unit scale. This script does not use
measured room or screen dimensions. Mark the same four screen-border corners
in at least two frames from the source video.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pycolmap


def unit(vector: np.ndarray) -> np.ndarray:
    length = np.linalg.norm(vector)
    if length < 1e-10:
        raise ValueError("Cannot align a zero-length direction")
    return vector / length


def triangulate(model: pycolmap.Reconstruction, observations: dict, corner: str) -> tuple[np.ndarray, list[float]]:
    by_name = {image.name: image for image in model.images.values() if image.has_pose}
    system = np.zeros((3, 3))
    target = np.zeros(3)
    views = []
    for name, marks in observations.items():
        if name not in by_name:
            raise ValueError(f"Screen mark has no registered camera: {name}")
        image = by_name[name]
        pose = image.cam_from_world().matrix()
        ray = unit(np.r_[image.camera.cam_from_img(marks[corner]), 1.0])
        ray = unit(pose[:, :3].T @ ray)
        centre = np.asarray(image.projection_center())
        projector = np.eye(3) - np.outer(ray, ray)
        system += projector
        target += projector @ centre
        views.append((image, pose, np.asarray(marks[corner], dtype=float)))
    point = np.linalg.solve(system, target)
    errors = []
    for image, pose, marked_pixel in views:
        predicted = image.camera.img_from_cam(pose[:, :3] @ point + pose[:, 3])
        errors.append(round(float(np.linalg.norm(np.asarray(predicted) - marked_pixel)), 2))
    return point, errors


def fit_floor(points: np.ndarray, threshold: float, seed: int) -> tuple[np.ndarray, int, float]:
    # Coordinates are relative to the screen bottom, with its height set to 2.
    candidate = points[
        (points[:, 0] > -7) & (points[:, 0] < 5)
        & (points[:, 1] > -1.3) & (points[:, 1] < -0.25)
        & (points[:, 2] > 0.5) & (points[:, 2] < 16)
    ]
    if len(candidate) < 400:
        raise ValueError(f"Only {len(candidate)} possible floor points")
    rng = np.random.default_rng(seed)
    best_count = 0
    best = None
    for _ in range(3000):
        sample = candidate[rng.choice(len(candidate), 3, replace=False)]
        design = np.c_[sample[:, 0], sample[:, 2], np.ones(3)]
        if abs(np.linalg.det(design)) < 0.05:
            continue
        plane = np.linalg.solve(design, sample[:, 1])
        if max(abs(plane[:2])) > 0.15:
            continue
        residual = candidate[:, 1] - (candidate[:, 0] * plane[0] + candidate[:, 2] * plane[1] + plane[2])
        count = int(np.count_nonzero(abs(residual) < threshold))
        if count > best_count:
            best_count, best = count, plane
    if best is None or best_count < 300:
        raise ValueError(f"Floor fit has only {best_count} inliers")
    for _ in range(5):
        residual = candidate[:, 1] - (candidate[:, 0] * best[0] + candidate[:, 2] * best[1] + best[2])
        selected = abs(residual) < threshold
        design = np.c_[candidate[selected, 0], candidate[selected, 2], np.ones(selected.sum())]
        best = np.linalg.lstsq(design, candidate[selected, 1], rcond=None)[0]
    residual = candidate[:, 1] - (candidate[:, 0] * best[0] + candidate[:, 2] * best[1] + best[2])
    selected = abs(residual) < threshold
    return best, int(selected.sum()), float(np.std(residual[selected]))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("observations", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--screen-height-units", type=float, default=2.0)
    parser.add_argument("--floor-threshold-units", type=float, default=0.05)
    args = parser.parse_args()
    if args.screen_height_units <= 0 or args.floor_threshold_units <= 0:
        parser.error("Scale and floor threshold must be positive")
    observations = json.loads(args.observations.read_text())
    if len(observations) < 2 or any(set(marks) != {"tl", "tr", "bl", "br"} for marks in observations.values()):
        parser.error("Mark tl, tr, bl, and br in at least two registered frames")
    model = pycolmap.Reconstruction(str(args.model))
    corners, errors = {}, {}
    for corner in ("tl", "tr", "bl", "br"):
        corners[corner], errors[corner] = triangulate(model, observations, corner)

    right = unit(corners["tr"] - corners["tl"] + corners["br"] - corners["bl"])
    up = corners["tl"] - corners["bl"] + corners["tr"] - corners["br"]
    up = unit(up - np.dot(up, right) * right)
    front = unit(np.cross(right, up))
    screen_bottom = (corners["bl"] + corners["br"]) / 2
    camera_centres = np.array([image.projection_center() for image in model.images.values() if image.has_pose])
    if np.median((camera_centres - screen_bottom) @ front) < 0:
        front = -front
    screen_height_model = float(np.mean([
        np.linalg.norm(corners["tl"] - corners["bl"]),
        np.linalg.norm(corners["tr"] - corners["br"]),
    ]))
    preliminary_scale = args.screen_height_units / screen_height_model
    initial_axes = np.stack((right, up, front))
    sparse = np.array([point.xyz for point in model.points3D.values()])
    relative_points = (sparse - screen_bottom) @ initial_axes.T * preliminary_scale
    floor, floor_inliers, floor_sd = fit_floor(relative_points, args.floor_threshold_units, seed=3)

    slope_x, slope_z, intercept = floor
    floor_up = unit(np.array([-slope_x, 1.0, -slope_z]))
    floor_right = unit(np.array([1.0, slope_x, 0.0]))
    floor_front = unit(np.cross(floor_right, floor_up))
    final_axes = np.stack((floor_right, floor_up, floor_front)) @ initial_axes
    floor_origin = screen_bottom + intercept / preliminary_scale * up
    projected_heights = [
        float(np.dot(corners["tl"] - corners["bl"], final_axes[1])),
        float(np.dot(corners["tr"] - corners["br"], final_axes[1])),
    ]
    scale = args.screen_height_units / np.mean(projected_heights)
    camera_scene = (camera_centres - floor_origin) @ final_axes.T * scale
    screen_width = float(np.mean([
        np.linalg.norm(corners["tr"] - corners["tl"]),
        np.linalg.norm(corners["br"] - corners["bl"]),
    ]) * scale)
    result = {
        "reference": "manually marked outer projector-screen border in source-video frames",
        "unit_label": "relative scene units",
        "metric_scale_known": False,
        "room_dimensions_known": False,
        "screen_height_scene_units": args.screen_height_units,
        "screen_width_scene_units": round(screen_width, 4),
        "scene_units_per_model_unit": round(float(scale), 8),
        "screen_bottom_height_scene_units": round(float(np.dot(screen_bottom - floor_origin, final_axes[1]) * scale), 4),
        "screen_corner_reprojection_error_px": errors,
        "screen_observation_frames": list(observations),
        "floor_fit_preliminary_y_equals_ax_plus_bz_plus_c": floor.tolist(),
        "floor_fit_sparse_inliers": floor_inliers,
        "floor_fit_residual_sd_scene_units": round(float(floor_sd * scale / preliminary_scale), 4),
        "viewer_floor_origin_colmap_units": floor_origin.tolist(),
        "viewer_right_colmap_axis": final_axes[0].tolist(),
        "viewer_up_colmap_axis": final_axes[1].tolist(),
        "viewer_front_colmap_axis": final_axes[2].tolist(),
        "capture_camera_position_quantiles_scene_units": np.quantile(camera_scene, [0.05, 0.5, 0.95], axis=0).round(3).tolist(),
        "limits": "The screen sets only a relative scale. Floor alignment and room coverage come from one video; no physical dimensions were measured.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
