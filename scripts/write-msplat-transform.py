"""Record msplat's camera-centering transform for floor-aligned export."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


WORLD_TO_NERFSTUDIO = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=float)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    frames = json.loads((args.dataset / "transforms.json").read_text())["frames"]
    centers = np.array([np.asarray(frame["transform_matrix"], dtype=float)[:3, 3]
                        for frame in frames])
    if len(centers) < 20 or not np.isfinite(centers).all():
        raise ValueError("Need valid camera centers")
    mean = centers.mean(axis=0)
    max_abs = np.max(np.abs(centers - mean))
    if max_abs <= 0:
        raise ValueError("Camera path has no translation")
    transform = np.c_[WORLD_TO_NERFSTUDIO, -mean]
    result = {"transform": transform.tolist(), "scale": float(1 / max_abs),
              "camera_count": len(centers), "normalization": "msplat autoScaleAndCenter"}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
