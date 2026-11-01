"""Compare VGGT camera centers with independent one-video COLMAP centers."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pycolmap


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inference', type=Path)
    parser.add_argument('model', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    inference = np.load(args.inference)
    reconstruction = pycolmap.Reconstruction(str(args.model))
    images = {image.name: image for image in reconstruction.images.values() if image.has_pose}
    names = [str(name) for name in inference['names']]
    predicted, reference, used = [], [], []
    for name, extrinsic in zip(names, inference['extrinsic']):
        if name not in images:
            continue
        predicted.append(-extrinsic[:, :3].T @ extrinsic[:, 3])
        reference.append(images[name].projection_center())
        used.append(name)
    if len(used) < 10:
        raise ValueError(f'Only {len(used)} paired cameras')
    x, y = np.asarray(predicted), np.asarray(reference)
    mx, my = x.mean(0), y.mean(0)
    u, singular, vt = np.linalg.svd((x - mx).T @ (y - my))
    reflection = np.eye(3)
    reflection[-1, -1] = np.linalg.det(u @ vt)
    rotation = u @ reflection @ vt
    scale = float(np.sum(singular * np.diag(reflection)) / np.sum((x - mx) ** 2))
    aligned = (x - mx) @ rotation * scale + my
    error = np.linalg.norm(aligned - y, axis=1)
    step = np.linalg.norm(np.diff(y, axis=0), axis=1)
    result = {
        'paired_frames': len(used), 'first_frame': used[0], 'last_frame': used[-1],
        'median_center_error_model_units': float(np.median(error)),
        'max_center_error_model_units': float(np.max(error)),
        'median_reference_step_model_units': float(np.median(step)),
        'median_error_to_step_ratio': float(np.median(error) / np.median(step)),
        'positive_similarity_scale': bool(scale > 0),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
