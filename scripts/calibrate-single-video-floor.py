"""Align a one-video room to its visible floor using only its camera solve.

The camera route gives an approximate horizontal plane. Sparse points fit the
floor below it. The median camera clearance is defined as one scene unit; this
is an arbitrary scale and does not imply a physical camera height.
"""

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
    parser.add_argument('model', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--front-frame', type=int, required=True)
    parser.add_argument('--rear-frame', type=int, required=True)
    args = parser.parse_args()
    model = pycolmap.Reconstruction(str(args.model))
    images = {image.name: image for image in model.images.values() if image.has_pose}
    front_name = f'frame_{args.front_frame:04}.jpg'
    rear_name = f'frame_{args.rear_frame:04}.jpg'
    if front_name not in images or rear_name not in images:
        parser.error('Both reference frames need camera poses')
    cameras = np.array([image.projection_center() for image in images.values()])
    points = np.array([point.xyz for point in model.points3D.values()])
    mean = cameras.mean(axis=0)
    _, spreads, basis = np.linalg.svd(cameras - mean)
    up = basis[-1]
    if np.median((points - mean) @ up) > 0:
        up = -up
    if spreads[-1] / spreads[-2] > 0.15:
        raise ValueError('The camera route has too much vertical motion to estimate the floor')
    front = images[front_name].projection_center()
    rear = images[rear_name].projection_center()
    depth_axis = unit((rear - front) - np.dot(rear - front, up) * up)
    right = unit(np.cross(up, depth_axis))
    depth_axis = unit(np.cross(right, up))
    initial_axes = np.stack((right, up, depth_axis))
    relative = (points - mean) @ initial_axes.T
    camera_relative = (cameras - mean) @ initial_axes.T

    # The lower point cloud has a strong floor peak in a floor-facing video.
    lower = relative[:, 1]
    center = np.median(camera_relative[:, 1])
    hist_edges = np.arange(center - 2.5, center - 0.35, 0.035)
    counts, _ = np.histogram(lower, bins=hist_edges)
    peak = (hist_edges[np.argmax(counts)] + hist_edges[np.argmax(counts) + 1]) / 2
    candidates = relative[(abs(lower - peak) < 0.18)]
    if len(candidates) < 500:
        raise ValueError(f'Only {len(candidates)} likely floor points')
    rng = np.random.default_rng(17)
    best_count, best = 0, None
    for _ in range(3000):
        sample = candidates[rng.choice(len(candidates), 3, replace=False)]
        matrix = np.c_[sample[:, 0], sample[:, 2], np.ones(3)]
        if abs(np.linalg.det(matrix)) < 0.01:
            continue
        plane = np.linalg.solve(matrix, sample[:, 1])
        if np.linalg.norm(plane[:2]) > 0.2:
            continue
        residual = candidates[:, 1] - (candidates[:, 0] * plane[0] + candidates[:, 2] * plane[1] + plane[2])
        count = int(np.count_nonzero(abs(residual) < 0.035))
        if count > best_count:
            best_count, best = count, plane
    if best is None or best_count < 500:
        raise ValueError(f'Floor fit has only {best_count} inliers')
    for _ in range(5):
        residual = candidates[:, 1] - (candidates[:, 0] * best[0] + candidates[:, 2] * best[1] + best[2])
        selected = abs(residual) < 0.035
        design = np.c_[candidates[selected, 0], candidates[selected, 2], np.ones(selected.sum())]
        best = np.linalg.lstsq(design, candidates[selected, 1], rcond=None)[0]
    floor_up_local = unit(np.array([-best[0], 1, -best[1]]))
    floor_right_local = unit(np.array([1, best[0], 0]))
    floor_depth_local = unit(np.cross(floor_right_local, floor_up_local))
    axes = np.stack((floor_right_local, floor_up_local, floor_depth_local)) @ initial_axes
    front_relative = (front - mean) @ initial_axes.T
    front_floor_local = np.array([
        front_relative[0],
        front_relative[0] * best[0] + front_relative[2] * best[1] + best[2],
        front_relative[2],
    ])
    origin = mean + front_floor_local @ initial_axes
    clearance = (cameras - origin) @ axes[1]
    median_clearance = float(np.median(clearance))
    if median_clearance <= 0:
        raise ValueError('Fitted floor is above the camera route')
    scale = 1 / median_clearance
    position = (cameras - origin) @ axes.T * scale
    residual = candidates[:, 1] - (candidates[:, 0] * best[0] + candidates[:, 2] * best[1] + best[2])
    inliers = abs(residual) < 0.035
    result = {
        'reference': 'floor plane and camera route reconstructed only from source-video frames',
        'unit_label': 'relative scene units',
        'metric_scale_known': False,
        'room_dimensions_known': False,
        'camera_clearance_scene_units': 1.0,
        'scene_units_per_model_unit': scale,
        'viewer_floor_origin_colmap_units': origin.tolist(),
        'viewer_right_colmap_axis': axes[0].tolist(),
        'viewer_up_colmap_axis': axes[1].tolist(),
        'viewer_front_colmap_axis': axes[2].tolist(),
        'front_reference_frame': front_name,
        'rear_reference_frame': rear_name,
        'floor_fit_sparse_inliers': int(inliers.sum()),
        'floor_fit_residual_sd_scene_units': float(np.std(residual[inliers]) * scale),
        'camera_position_quantiles_scene_units': np.quantile(position, [.05, .5, .95], axis=0).round(3).tolist(),
        'limits': 'Scale and horizontal orientation come from one video. No physical room or camera dimensions were measured.',
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
