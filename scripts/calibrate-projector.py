"""Measure the classroom SfM scale from manually marked projector corners.

Run beside the COLMAP model on the cluster. Coordinates in OBSERVATIONS mark
the outside corners of the black screen border in three 1920 x 1080 frames.
The measured screen height is 1.825 m; its approximate width is a check only.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pycolmap


OBSERVATIONS = {
    "C5307-0025.jpg": {"tl": (882, 148), "tr": (1312, 130), "bl": (884, 473), "br": (1303, 472)},
    "C5308-0005.jpg": {"tl": (627, 283), "tr": (1186, 268), "bl": (638, 714), "br": (1194, 707)},
    "C5308-0006.jpg": {"tl": (404, 256), "tr": (1003, 270), "bl": (411, 732), "br": (1008, 706)},
}


def unit(vector: np.ndarray) -> np.ndarray:
    return vector / np.linalg.norm(vector)


def triangulate(reconstruction: pycolmap.Reconstruction, corner: str) -> tuple[np.ndarray, list[float]]:
    system = np.zeros((3, 3))
    target = np.zeros(3)
    views = []
    for name, corners in OBSERVATIONS.items():
        image = next(image for image in reconstruction.images.values() if image.name == name)
        camera = image.camera
        pose = image.cam_from_world().matrix()
        ray_camera = unit(np.r_[camera.cam_from_img(corners[corner]), 1.0])
        ray_world = unit(pose[:, :3].T @ ray_camera)
        center = np.asarray(image.projection_center())
        projection = np.eye(3) - np.outer(ray_world, ray_world)
        system += projection
        target += projection @ center
        views.append((image, pose, np.asarray(corners[corner], dtype=float)))

    point = np.linalg.solve(system, target)
    errors = []
    for image, pose, pixel in views:
        projected = np.asarray(image.camera.img_from_cam(pose[:, :3] @ point + pose[:, 3]))
        errors.append(round(float(np.linalg.norm(projected - pixel)), 2))
    return point, errors


def fit_floor(points: np.ndarray, origin: np.ndarray, axes: np.ndarray, preliminary_scale: float) -> tuple[np.ndarray, int, float]:
    """Fit the visible room floor after a coarse selection from the section plot."""
    x, y, z = ((points - origin) @ axes.T * preliminary_scale).T
    inside = (x > -4.3) & (x < 4.3) & (z > 1.0) & (z < 10.5)
    selected = inside & (y > -1.0) & (y < 1.0) & (np.abs(y - (-0.65 + 0.10 * z)) < 0.11)
    for _ in range(5):
        if selected.sum() < 1000:
            raise ValueError("Too few floor points to calibrate the room")
        design = np.c_[x[selected], z[selected], np.ones(selected.sum())]
        coefficients = np.linalg.lstsq(design, y[selected], rcond=None)[0]
        residual = y - (coefficients[0] * x + coefficients[1] * z + coefficients[2])
        selected = inside & (np.abs(residual) < 0.035)
    return coefficients, int(selected.sum()), float(np.std(residual[selected]))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    reconstruction = pycolmap.Reconstruction(str(args.model))
    points = {}
    reprojection = {}
    for corner in ("tl", "tr", "bl", "br"):
        points[corner], reprojection[corner] = triangulate(reconstruction, corner)

    widths = [np.linalg.norm(points["tr"] - points["tl"]), np.linalg.norm(points["br"] - points["bl"])]
    heights = [np.linalg.norm(points["tl"] - points["bl"]), np.linalg.norm(points["tr"] - points["br"])]
    model_height = float(np.mean(heights))
    preliminary_scale = 1.825 / model_height

    right = unit((points["tr"] - points["tl"]) + (points["br"] - points["bl"]))
    up = (points["tl"] - points["bl"]) + (points["tr"] - points["br"])
    up = unit(up - np.dot(up, right) * right)
    front = unit(np.cross(right, up))
    origin = (points["bl"] + points["br"]) / 2
    preliminary_axes = np.stack((right, up, front))
    sparse_points = np.array([point.xyz for point in reconstruction.points3D.values()])
    floor_coefficients, floor_inliers, floor_residual = fit_floor(
        sparse_points, origin, preliminary_axes, preliminary_scale
    )
    slope_x, slope_z, floor_intercept = floor_coefficients
    floor_up = unit(np.array([-slope_x, 1.0, -slope_z]))
    floor_right = unit(np.array([1.0, slope_x, 0.0]))
    floor_front = unit(np.cross(floor_right, floor_up))
    floor_axes_in_preliminary_frame = np.stack((floor_right, floor_up, floor_front))
    viewer_axes = floor_axes_in_preliminary_frame @ preliminary_axes
    vertical_heights = [
        float(np.dot(points["tl"] - points["bl"], viewer_axes[1])),
        float(np.dot(points["tr"] - points["br"], viewer_axes[1])),
    ]
    metres_per_model_unit = 1.825 / np.mean(vertical_heights)
    width_metres = float(np.mean(widths) * metres_per_model_unit)
    floor_origin = origin + floor_intercept / preliminary_scale * up
    floor_residual *= metres_per_model_unit / preliminary_scale

    result = {
        "reference": "outside corners of black projector screen border",
        "measured_height_m": 1.825,
        "approximate_width_m": 2.4,
        "model_height_units": round(model_height, 5),
        "projected_vertical_height_units": round(float(np.mean(vertical_heights)), 5),
        "metres_per_model_unit": round(metres_per_model_unit, 6),
        "inferred_width_m": round(width_metres, 4),
        "width_difference_from_approximate_m": round(width_metres - 2.4, 4),
        "side_vertical_height_m": [round(float(h * metres_per_model_unit), 4) for h in vertical_heights],
        "edge_width_m": [round(float(w * metres_per_model_unit), 4) for w in widths],
        "reprojection_error_px_by_corner": reprojection,
        "observation_order": list(OBSERVATIONS),
        "screen_bottom_center_model_units": origin.tolist(),
        "right_world_axis": right.tolist(),
        "up_world_axis": up.tolist(),
        "front_world_axis": front.tolist(),
        "floor_fit_preliminary_y_equals_ax_plus_bz_plus_c": floor_coefficients.tolist(),
        "floor_fit_sparse_inliers": floor_inliers,
        "floor_fit_residual_sd_m": round(floor_residual, 4),
        "viewer_floor_origin_colmap_units": floor_origin.tolist(),
        "viewer_right_colmap_axis": viewer_axes[0].tolist(),
        "viewer_up_colmap_axis": viewer_axes[1].tolist(),
        "viewer_front_colmap_axis": viewer_axes[2].tolist(),
        "screen_bottom_height_above_floor_m": round(float(-floor_intercept * metres_per_model_unit / preliminary_scale * floor_up[1]), 4),
        "corner_model_units": {corner: point.tolist() for corner, point in points.items()},
        "limits": "Manual screen corners and the sparse floor selection add uncertainty; no room length was measured.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
