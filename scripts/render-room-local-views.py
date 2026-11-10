"""Render the same held-out video views from a local msplat checkpoint."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from msplat import Dataset, GaussianTrainer, TrainingConfig, cleanup


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model_dataset", type=Path)
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("normalization", type=Path)
    parser.add_argument("source_dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--frames", nargs="+", default=[
        "frame_0001.jpg", "frame_0065.jpg", "frame_0121.jpg", "frame_0225.jpg"])
    args = parser.parse_args()
    source = json.loads((args.source_dataset / "transforms.json").read_text())
    by_name = {Path(frame["file_path"]).name: frame for frame in source["frames"]}
    transform = json.loads(args.normalization.read_text())
    translation = np.asarray(transform["transform"], dtype=np.float32)[:, 3]
    scale = np.float32(transform["scale"])
    dataset = Dataset(str(args.model_dataset.resolve()), downscale_factor=0.5,
                      eval_mode=True, test_every=8)
    config = TrainingConfig(iterations=20000, downscale_factor=0.5,
                            num_downscales=1, resolution_schedule=2000,
                            refine_every=500, densify_grad_thresh=0.0005,
                            bg_color=[0.0, 0.0, 0.0])
    trainer = GaussianTrainer(dataset, config)
    trainer.load_checkpoint(str(args.checkpoint.resolve()))
    rows = []
    try:
        for name in args.frames:
            frame = by_name[name]
            pose = np.asarray(frame["transform_matrix"], dtype=np.float32).copy()
            pose[:3, 3] = (pose[:3, 3] + translation) * scale
            render = np.asarray(trainer.render_from_pose(np.ascontiguousarray(pose),
                                                          ref_cam_idx=0))
            rendered = Image.fromarray(np.uint8(np.clip(render * 255, 0, 255)))
            original = Image.open(args.source_dataset / "images" / name).convert("RGB")
            size = (640, 360)
            original = original.resize(size, Image.Resampling.LANCZOS)
            rendered = rendered.resize(size, Image.Resampling.LANCZOS)
            row = Image.new("RGB", (1280, 388), "#101820")
            row.paste(original, (0, 28))
            row.paste(rendered, (640, 28))
            draw = ImageDraw.Draw(row)
            draw.text((12, 7), f"{name}  recorded video", fill="white")
            draw.text((652, 7), f"{name}  reconstructed view", fill="white")
            rows.append(row)
    finally:
        cleanup()
    montage = Image.new("RGB", (1280, 388 * len(rows)), "#101820")
    for index, row in enumerate(rows):
        montage.paste(row, (0, 388 * index))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    montage.save(args.output)
    print(f"Saved {len(rows)} paired views to {args.output}")


if __name__ == "__main__":
    main()
