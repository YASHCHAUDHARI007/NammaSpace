"""Package two overlapping COLMAP segments from one video for Nerfstudio.

The segments must share camera views. Align their camera centers by a similarity
transform, then use the first segment through its last frame and the second
segment for the remaining frames. Reject an alignment with a large seam.
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

WORLD_TO_NERFSTUDIO = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=float)


def write_ply(path: Path, points: list) -> None:
    header = (
        'ply\nformat binary_little_endian 1.0\n'
        f'element vertex {len(points)}\n'
        'property float x\nproperty float y\nproperty float z\n'
        'property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n'
    )
    with path.open('wb') as output:
        output.write(header.encode('ascii'))
        for xyz, color in points:
            output.write(struct.pack('<fffBBB', *xyz, *color))


def align_centers(first: dict, second: dict, names: list[str]):
    x = np.array([second[name].projection_center() for name in names])
    y = np.array([first[name].projection_center() for name in names])
    mx, my = x.mean(axis=0), y.mean(axis=0)
    u, singular, vt = np.linalg.svd((x - mx).T @ (y - my))
    reflection = np.eye(3)
    reflection[2, 2] = np.linalg.det(u @ vt)
    row_rotation = u @ reflection @ vt
    scale = float(np.sum(singular * np.diag(reflection)) / np.sum((x - mx) ** 2))
    rotation = row_rotation.T
    translation = my - scale * rotation @ mx
    predicted = scale * (rotation @ x.T).T + translation
    errors = np.linalg.norm(predicted - y, axis=1)
    return scale, rotation, translation, errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('images', type=Path)
    parser.add_argument('first_model', type=Path)
    parser.add_argument('second_model', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error(f'Output already exists: {args.output}')

    first = pycolmap.Reconstruction(str(args.first_model))
    second = pycolmap.Reconstruction(str(args.second_model))
    a = {image.name: image for image in first.images.values() if image.has_pose}
    b = {image.name: image for image in second.images.values() if image.has_pose}
    shared = sorted(a.keys() & b.keys())
    if len(shared) < 10:
        raise ValueError(f'Only {len(shared)} overlapping cameras')
    scale, rotation, translation, errors = align_centers(a, b, shared)
    first_names = sorted(a)
    seam = first_names[-1]
    all_names = sorted(set(first_names) | {name for name in b if name > seam})
    source_names = {path.name for path in args.images.glob('*.jpg')}
    if len(all_names) < len(source_names) * 0.95:
        raise ValueError(f'Only {len(all_names)} of {len(source_names)} source frames have camera poses')
    first_steps = np.linalg.norm(np.diff([a[name].projection_center() for name in first_names], axis=0), axis=1)
    median_step = float(np.median(first_steps))
    seam_step = float(np.linalg.norm(scale * rotation @ b[all_names[len(first_names)]].projection_center() + translation - a[seam].projection_center()))
    if scale <= 0 or np.median(errors) > median_step * 0.05 or seam_step > median_step * 3:
        raise ValueError(f'Bad overlap or seam: median error={np.median(errors):.4g}, seam step={seam_step:.4g}, median step={median_step:.4g}')

    output = args.output.resolve()
    image_output = output / 'images'
    image_output.mkdir(parents=True)
    frames = []
    selected_ids = [set(), set()]
    for name in all_names:
        segment = 0 if name <= seam else 1
        reconstruction, image = (first, a[name]) if segment == 0 else (second, b[name])
        selected_ids[segment].add(image.image_id)
        camera = reconstruction.cameras[image.camera_id]
        if camera.model != pycolmap.CameraModelId.SIMPLE_RADIAL:
            raise ValueError(f'Unsupported camera model: {camera.model}')
        focal, cx, cy, k1 = map(float, camera.params)
        pose = image.cam_from_world().inverse().matrix()
        position = pose[:3, 3]
        orientation = pose[:3, :3]
        if segment == 1:
            position = scale * rotation @ position + translation
            orientation = rotation @ orientation
        c2w = np.eye(4)
        c2w[:3, :3] = WORLD_TO_NERFSTUDIO @ orientation @ np.diag([1, -1, -1])
        c2w[:3, 3] = WORLD_TO_NERFSTUDIO @ position
        if abs(np.linalg.det(c2w[:3, :3]) - 1) > 1e-5:
            raise ValueError(f'Invalid camera pose: {name}')
        source, destination = args.images / name, image_output / name
        try:
            os.link(source, destination)
        except OSError:
            shutil.copy2(source, destination)
        frames.append({
            'file_path': f'./images/{name}', 'transform_matrix': c2w.tolist(),
            'camera_model': 'OPENCV', 'fl_x': focal, 'fl_y': focal,
            'cx': cx, 'cy': cy, 'k1': k1, 'k2': 0.0, 'p1': 0.0, 'p2': 0.0,
            'w': camera.width, 'h': camera.height,
        })

    points = []
    for segment, reconstruction in enumerate((first, second)):
        for point in reconstruction.points3D.values():
            if point.error > 2.5 or sum(e.image_id in selected_ids[segment] for e in point.track.elements) < 3:
                continue
            xyz = np.asarray(point.xyz, dtype=float)
            if segment == 1:
                xyz = scale * rotation @ xyz + translation
            xyz = WORLD_TO_NERFSTUDIO @ xyz
            if np.isfinite(xyz).all():
                points.append((xyz.astype(np.float32), np.asarray(point.color, dtype=np.uint8)))
    if len(points) < 1000:
        raise ValueError(f'Only {len(points)} clean starting points')
    write_ply(output / 'sparse_pc.ply', points)
    (output / 'transforms.json').write_text(json.dumps({
        'applied_transform': np.column_stack((WORLD_TO_NERFSTUDIO, np.zeros(3))).tolist(),
        'ply_file_path': 'sparse_pc.ply', 'frames': frames,
    }, indent=2) + '\n')
    summary = {
        'source_images': len(source_names), 'registered_images': len(all_names),
        'unregistered_images': sorted(source_names - set(all_names)),
        'first_model_images': len(first_names),
        'second_model_images': len(b), 'overlap_images': len(shared),
        'overlap_median_center_error': float(np.median(errors)),
        'overlap_max_center_error': float(np.max(errors)),
        'median_first_step': median_step, 'seam_step': seam_step,
        'similarity_scale': scale, 'starting_points': len(points),
    }
    (output / 'package-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
