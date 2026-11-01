"""Merge separate VGGT inference batches from one video into frame order."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np


FIELDS = ("names", "coords", "depth", "confidence", "extrinsic", "intrinsic")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("inputs", type=Path, nargs="+")
    args = parser.parse_args()
    if len(args.inputs) < 2 or args.output.exists():
        parser.error("Supply at least two input batches and a new output path")
    batches = [np.load(path) for path in args.inputs]
    try:
        joined = {key: np.concatenate([batch[key] for batch in batches], axis=0)
                  for key in FIELDS}
    finally:
        for batch in batches:
            batch.close()
    names = [str(value) for value in joined["names"]]
    if len(set(names)) != len(names):
        raise ValueError("VGGT batches contain duplicate frame names")
    order = np.argsort(names)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.output, **{key: values[order]
                                       for key, values in joined.items()})
    print(f"Saved {len(names)} VGGT frames to {args.output}")


if __name__ == "__main__":
    main()
