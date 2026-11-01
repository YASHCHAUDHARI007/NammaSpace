"""Train a one-video room dataset on Apple Silicon with resumable checkpoints."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import time

import numpy as np
from PIL import Image

from msplat import Dataset, GaussianTrainer, TrainingConfig, cleanup, sync


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--steps", type=int, default=20000)
    parser.add_argument("--checkpoint-every", type=int, default=2500)
    parser.add_argument("--resume", type=Path)
    parser.add_argument("--downscale", type=float, default=0.5)
    parser.add_argument("--refine-every", type=int, default=500)
    parser.add_argument("--grad-threshold", type=float, default=0.0005)
    args = parser.parse_args()
    if args.steps < 1 or args.checkpoint_every < 1:
        parser.error("Step counts must be positive")
    args.output.mkdir(parents=True, exist_ok=True)
    dataset = Dataset(str(args.dataset.resolve()), downscale_factor=args.downscale,
                      eval_mode=True, test_every=8)
    config = TrainingConfig(
        iterations=args.steps,
        downscale_factor=args.downscale,
        num_downscales=1,
        resolution_schedule=2000,
        refine_every=args.refine_every,
        densify_grad_thresh=args.grad_threshold,
        bg_color=[0.0, 0.0, 0.0],
    )
    trainer = GaussianTrainer(dataset, config)
    if args.resume:
        trainer.load_checkpoint(str(args.resume))
    started = time.monotonic()
    previous = 0
    try:
        while previous < args.steps:
            stats = trainer.step()
            previous = stats.iteration
            if previous % 100 == 0:
                print(json.dumps({"step": previous, "splats": stats.splat_count,
                                  "step_ms": round(stats.ms_per_step, 1),
                                  "elapsed_s": round(time.monotonic() - started)}), flush=True)
            if previous % args.checkpoint_every == 0 or previous == args.steps:
                sync()
                stem = f"step-{previous:06d}"
                checkpoint = args.output / f"{stem}.msplat"
                temporary = checkpoint.with_suffix(".msplat.tmp")
                trainer.save_checkpoint(str(temporary))
                os.replace(temporary, checkpoint)
                trainer.export_ply(str(args.output / f"{stem}.ply"))
                if dataset.num_test:
                    rgb = np.asarray(trainer.render(0, use_test=True))
                    rgb = np.uint8(np.clip(rgb * 255.0, 0, 255))
                    Image.fromarray(rgb).save(args.output / f"{stem}-preview.png")
                    metrics = trainer.evaluate()
                    print(json.dumps({"step": previous, "checkpoint": str(checkpoint),
                                      "metrics": metrics}), flush=True)
    finally:
        cleanup()


if __name__ == "__main__":
    main()
