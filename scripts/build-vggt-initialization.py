"""Add VGGT depth points to a one-video Nerfstudio training dataset.

Each depth map is fitted to sparse points from the same video's camera solve.
Only high-confidence samples inside the sparse room envelope are added.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import struct

import numpy as np
from PIL import Image
import pycolmap


WORLD_TO_NERFSTUDIO = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=float)


def write_ply(path: Path, points: list[tuple[np.ndarray, np.ndarray]]) -> None:
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_dataset', type=Path)
    parser.add_argument('model', type=Path)
    parser.add_argument('inference', type=Path)
    parser.add_argument('validation', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--grid-step', type=int, default=6)
    args = parser.parse_args()
    if args.output.exists() or args.grid_step < 2:
        parser.error('Output must be new and grid step must be at least 2')
    inference = np.load(args.inference)
    names = [str(name) for name in inference['names']]
    fits = {row['image']: row for row in json.loads(args.validation.read_text())['frames']
            if row.get('slope', 0) > 0 and row.get('median_relative_error', 1) < 0.05}
    model = pycolmap.Reconstruction(str(args.model))
    images = {image.name: image for image in model.images.values() if image.has_pose}
    sparse_xyz = np.array([point.xyz for point in model.points3D.values()])
    envelope_min = np.quantile(sparse_xyz, .005, axis=0) - 1.5
    envelope_max = np.quantile(sparse_xyz, .995, axis=0) + 1.5
    points = []
    sparse_count = 0
    for point in model.points3D.values():
        if point.error > 2.5 or len(point.track.elements) < 3:
            continue
        xyz = WORLD_TO_NERFSTUDIO @ np.asarray(point.xyz, dtype=float)
        points.append((xyz.astype(np.float32), np.asarray(point.color, dtype=np.uint8)))
        sparse_count += 1

    frame_counts = {}
    for index, name in enumerate(names):
        if name not in fits or name not in images:
            continue
        image = images[name]
        camera = model.cameras[image.camera_id]
        focal, cx, cy, k1 = map(float, camera.params)
        depth = np.squeeze(inference['depth'][index])
        confidence = np.squeeze(inference['confidence'][index])
        coords = inference['coords'][index]
        sy, sx = np.mgrid[args.grid_step // 2:depth.shape[0]:args.grid_step,
                          args.grid_step // 2:depth.shape[1]:args.grid_step]
        sx, sy = sx.ravel(), sy.ravel()
        px = (sx - coords[0]) * coords[4] / (coords[2] - coords[0])
        py = (sy - coords[1]) * coords[5] / (coords[3] - coords[1])
        z = fits[name]['slope'] * depth[sy, sx] + fits[name]['offset']
        conf = confidence[sy, sx]
        in_image = ((px >= 1) & (px < camera.width - 1)
                    & (py >= 1) & (py < camera.height - 1))
        confident = conf >= max(1.0, float(np.median(conf[in_image])))
        valid = in_image & confident & np.isfinite(z) & (z > 0.3) & (z < 18)
        px, py, z = px[valid], py[valid], z[valid]
        xd, yd = (px - cx) / focal, (py - cy) / focal
        xu, yu = xd.copy(), yd.copy()
        for _ in range(6):
            distortion = 1 + k1 * (xu * xu + yu * yu)
            xu, yu = xd / distortion, yd / distortion
        camera_points = np.column_stack((xu * z, yu * z, z))
        pose = image.cam_from_world().inverse().matrix()
        world = camera_points @ pose[:3, :3].T + pose[:3, 3]
        bounded = (world >= envelope_min).all(axis=1) & (world <= envelope_max).all(axis=1)
        world, px, py = world[bounded], px[bounded], py[bounded]
        pixels = np.asarray(Image.open(args.source_dataset / 'images' / name).convert('RGB'))
        colors = pixels[np.rint(py).astype(int), np.rint(px).astype(int)]
        nerfstudio_points = world @ WORLD_TO_NERFSTUDIO.T
        points.extend((xyz.astype(np.float32), color) for xyz, color in zip(nerfstudio_points, colors))
        frame_counts[name] = len(world)

    if len(frame_counts) < 15 or len(points) < sparse_count + 20000:
        raise ValueError('Too few validated VGGT points for a dense initialization')
    output = args.output.resolve()
    (output / 'images').mkdir(parents=True)
    for source in (args.source_dataset / 'images').glob('*.jpg'):
        destination = output / 'images' / source.name
        try:
            os.link(source, destination)
        except OSError:
            shutil.copy2(source, destination)
    shutil.copy2(args.source_dataset / 'transforms.json', output / 'transforms.json')
    write_ply(output / 'sparse_pc.ply', points)
    summary = {
        'source_video_frames': len(list((args.source_dataset / 'images').glob('*.jpg'))),
        'vggt_validated_depth_frames': len(frame_counts),
        'sparse_starting_points': sparse_count,
        'vggt_starting_points': len(points) - sparse_count,
        'total_starting_points': len(points),
        'vggt_grid_step': args.grid_step,
        'per_frame_points': frame_counts,
    }
    (output / 'vggt-initialization-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({key: value for key, value in summary.items() if key != 'per_frame_points'}, indent=2))


if __name__ == '__main__':
    main()
