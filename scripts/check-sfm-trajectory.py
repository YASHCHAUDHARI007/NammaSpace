"""Reject folded camera paths before training a room from one video.

Frame names must contain a trailing frame number. The threshold is relative to
the median adjacent camera step, so it does not assume metric room dimensions.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pycolmap


def frame_number(name: str) -> int:
    match = re.search(r"(\d+)(?:\.[^.]+)?$", name)
    if not match:
        raise ValueError(f"No frame number in {name}")
    return int(match.group(1))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("--max-step-ratio", type=float, default=5.0)
    parser.add_argument("--max-frame-gap", type=int, default=1)
    args = parser.parse_args()
    if args.max_step_ratio <= 1 or args.max_frame_gap < 1:
        parser.error("Use a step ratio above one and a positive frame gap")
    model = pycolmap.Reconstruction(str(args.model))
    frames = sorted(
        ((frame_number(image.name), image) for image in model.images.values() if image.has_pose),
        key=lambda entry: entry[0],
    )
    if len(frames) < 2 or len({number for number, _ in frames}) != len(frames):
        raise ValueError("Need at least two uniquely numbered registered frames")
    transitions = []
    for (first, image_a), (second, image_b) in zip(frames, frames[1:]):
        distance = float(np.linalg.norm(np.asarray(image_b.projection_center()) - image_a.projection_center()))
        transitions.append({"from": first, "to": second, "frame_gap": second - first, "step_model_units": distance})
    adjacent = np.array([row["step_model_units"] for row in transitions if row["frame_gap"] == 1])
    if not len(adjacent) or float(np.median(adjacent)) <= 0:
        raise ValueError("No valid adjacent camera steps")
    median_step = float(np.median(adjacent))
    bad = [row for row in transitions if row["frame_gap"] > args.max_frame_gap or
           row["step_model_units"] > args.max_step_ratio * median_step]
    result = {
        "registered_frames": len(frames),
        "first_frame": frames[0][0],
        "last_frame": frames[-1][0],
        "median_adjacent_step_model_units": round(median_step, 6),
        "max_step_model_units": round(max(row["step_model_units"] for row in transitions), 6),
        "max_allowed_step_ratio": args.max_step_ratio,
        "bad_transitions": bad,
        "continuous": not bad,
        "metric_scale_known": False,
    }
    print(json.dumps(result, indent=2))
    if bad:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
