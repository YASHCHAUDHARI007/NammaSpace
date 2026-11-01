"""Fit the walking floor from one video's Gaussian splats and camera route.

The first floor estimate can select a raised stage when the camera changes
height. Supply a reviewed floor candidate box in that estimate's scene units.
This script fits a plane in the box and writes a corrected relative calibration.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def unit(vector: np.ndarray) -> np.ndarray:
    return vector / np.linalg.norm(vector)


def rotation_from_to(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    cross = np.cross(source, target)
    dot = float(source @ target)
    if dot <= -0.99:
        raise ValueError('Floor normal points away from the camera')
    skew = np.array([
        [0, -cross[2], cross[1]],
        [cross[2], 0, -cross[0]],
        [-cross[1], cross[0], 0],
    ])
    return np.eye(3) + skew + skew @ skew / (1 + dot)


def camera_centers(transforms: dict) -> np.ndarray:
    applied = np.asarray(transforms['applied_transform'], dtype=float)
    if applied.shape != (3, 4):
        raise ValueError('Expected a 3 by 4 applied transform')
    if not np.isclose(np.linalg.det(applied[:, :3]), 1, atol=1e-5):
        raise ValueError('Applied transform must preserve orientation and scale')
    centers = []
    for frame in transforms['frames']:
        camera = np.asarray(frame['transform_matrix'], dtype=float)
        if camera.shape != (4, 4):
            raise ValueError('Invalid camera transform')
        centers.append(np.linalg.solve(applied[:, :3], camera[:3, 3] - applied[:, 3]))
    if len(centers) < 20:
        raise ValueError('Need at least 20 registered video cameras')
    return np.asarray(centers)


def fit_floor(points: np.ndarray, threshold: float, max_slope: float) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(17)
    best_count, best = 0, None
    for _ in range(3000):
        sample = points[rng.choice(len(points), 3, replace=False)]
        design = np.c_[sample[:, 0], sample[:, 2], np.ones(3)]
        if abs(np.linalg.det(design)) < 0.03:
            continue
        plane = np.linalg.solve(design, sample[:, 1])
        if np.linalg.norm(plane[:2]) > max_slope:
            continue
        residual = points[:, 1] - (points[:, 0] * plane[0] + points[:, 2] * plane[1] + plane[2])
        count = int(np.count_nonzero(abs(residual) < threshold))
        if count > best_count:
            best_count, best = count, plane
    if best is None:
        raise ValueError('No near-horizontal plane found in the candidate box')
    for _ in range(5):
        residual = points[:, 1] - (points[:, 0] * best[0] + points[:, 2] * best[1] + best[2])
        inliers = abs(residual) < threshold * 1.2
        design = np.c_[points[inliers, 0], points[inliers, 2], np.ones(inliers.sum())]
        best = np.linalg.lstsq(design, points[inliers, 1], rcond=None)[0]
    residual = points[:, 1] - (points[:, 0] * best[0] + points[:, 2] * best[1] + best[2])
    return best, abs(residual) < threshold * 1.2


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('provisional_calibration', type=Path)
    parser.add_argument('provisional_splat', type=Path)
    parser.add_argument('video_transforms', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--candidate-min', type=float, nargs=3, required=True, metavar=('X', 'Y', 'Z'))
    parser.add_argument('--candidate-max', type=float, nargs=3, required=True, metavar=('X', 'Y', 'Z'))
    parser.add_argument('--min-opacity', type=float, default=0.5)
    parser.add_argument('--max-axis-scale', type=float, default=0.12)
    parser.add_argument('--ransac-threshold', type=float, default=0.05)
    parser.add_argument('--max-slope', type=float, default=0.2)
    args = parser.parse_args()
    if args.output.exists() or args.output == args.provisional_calibration:
        parser.error('Output must be a new file')
    low, high = np.asarray(args.candidate_min), np.asarray(args.candidate_max)
    if (not np.isfinite(low).all() or not np.isfinite(high).all() or not (low < high).all()
            or not 0 < args.min_opacity < 1 or args.max_axis_scale <= 0
            or args.ransac_threshold <= 0 or not 0 < args.max_slope < 1):
        parser.error('Invalid candidate box or fit threshold')

    provisional = json.loads(args.provisional_calibration.read_text())
    if provisional.get('metric_scale_known'):
        raise ValueError('This relative floor refinement cannot change metric calibration')
    axes = np.asarray([provisional[f'viewer_{axis}_colmap_axis']
                       for axis in ('right', 'up', 'front')], dtype=float)
    origin = np.asarray(provisional['viewer_floor_origin_colmap_units'], dtype=float)
    scale = float(provisional['scene_units_per_model_unit'])
    if axes.shape != (3, 3) or not np.allclose(axes @ axes.T, np.eye(3), atol=1e-4) or scale <= 0:
        raise ValueError('Invalid provisional calibration')

    raw = np.fromfile(args.provisional_splat, dtype=np.uint8)
    if not len(raw) or len(raw) % 32:
        raise ValueError('Expected a nonempty 32-byte Gaussian splat file')
    records = raw.reshape(-1, 32)
    positions = records[:, :12].copy().view('<f4').reshape(-1, 3)
    sizes = records[:, 12:24].copy().view('<f4').reshape(-1, 3)
    opacity = records[:, 27] / 255
    selected = (
        np.isfinite(positions).all(axis=1)
        & np.isfinite(sizes).all(axis=1)
        & (positions >= low).all(axis=1)
        & (positions <= high).all(axis=1)
        & (sizes.max(axis=1) < args.max_axis_scale)
        & (opacity >= args.min_opacity)
    )
    candidates = positions[selected].astype(float)
    if len(candidates) < 5000:
        raise ValueError(f'Only {len(candidates)} likely floor splats')
    plane, inliers = fit_floor(candidates, args.ransac_threshold, args.max_slope)
    if inliers.sum() < 3000:
        raise ValueError(f'Floor fit has only {inliers.sum()} inliers')
    floor_points = candidates[inliers]
    horizontal_span = np.quantile(floor_points[:, (0, 2)], .9, axis=0) - np.quantile(
        floor_points[:, (0, 2)], .1, axis=0
    )
    if horizontal_span[0] < 1 or horizontal_span[1] < 2:
        raise ValueError('Floor inliers do not cover enough of the room')

    normal = unit(np.array([-plane[0], 1, -plane[1]]))
    rotation = rotation_from_to(normal, np.array([0, 1, 0]))
    floor_origin_old = np.array([0, plane[2], 0])
    centers = camera_centers(json.loads(args.video_transforms.read_text()))
    old_camera_positions = (centers - origin) @ axes.T * scale
    straightened_cameras = (old_camera_positions - floor_origin_old) @ rotation.T
    clearance = float(np.median(straightened_cameras[:, 1]))
    if clearance <= 0.1:
        raise ValueError('Fitted floor is too close to or above the camera route')
    factor = 1 / clearance
    new_origin = origin + floor_origin_old @ axes / scale
    new_axes = rotation @ axes
    new_scale = scale * factor
    new_camera_positions = (centers - new_origin) @ new_axes.T * new_scale
    residual = floor_points[:, 1] - (floor_points[:, 0] * plane[0]
                                     + floor_points[:, 2] * plane[1] + plane[2])

    result = dict(provisional)
    result.pop('floor_fit_sparse_inliers', None)
    result.update({
        'reference': 'Walking floor fitted to Gaussians trained only from the source video',
        'scene_units_per_model_unit': new_scale,
        'viewer_floor_origin_colmap_units': new_origin.tolist(),
        'viewer_right_colmap_axis': new_axes[0].tolist(),
        'viewer_up_colmap_axis': new_axes[1].tolist(),
        'viewer_front_colmap_axis': new_axes[2].tolist(),
        'camera_clearance_scene_units': 1.0,
        'camera_position_quantiles_scene_units': np.quantile(
            new_camera_positions, [.05, .5, .95], axis=0
        ).round(3).tolist(),
        'floor_fit_method': 'RANSAC on reviewed floor splats; camera poses set relative scale',
        'floor_fit_splat_inliers': int(inliers.sum()),
        'floor_fit_residual_sd_scene_units': float(np.std(residual) * factor),
        'floor_fit_horizontal_span_prior_scene_units': horizontal_span.round(3).tolist(),
        'floor_candidate_min_prior_scene_units': low.tolist(),
        'floor_candidate_max_prior_scene_units': high.tolist(),
        'floor_plane_prior_scene_units': plane.tolist(),
    })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
