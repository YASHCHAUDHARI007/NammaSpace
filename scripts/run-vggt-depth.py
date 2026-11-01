"""Infer VGGT depth on sampled frames from one recorded room video."""

from __future__ import annotations

import argparse
from contextlib import nullcontext
from pathlib import Path

import numpy as np
import torch
from vggt.models.vggt import VGGT
from vggt.utils.load_fn import load_and_preprocess_images_square
from vggt.utils.pose_enc import pose_encoding_to_extri_intri


WEIGHTS = "https://huggingface.co/facebook/VGGT-1B/resolve/main/model.pt"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-frame", type=int, default=99)
    parser.add_argument("--stride", type=int, default=5)
    parser.add_argument("--start-index", type=int, default=0)
    parser.add_argument("--device", choices=("auto", "cuda", "mps", "cpu"), default="auto")
    parser.add_argument("--weights", type=Path, help="Local VGGT model.pt; otherwise download the official weights")
    args = parser.parse_args()
    if args.stride < 1 or args.max_frame < 1 or args.start_index < 0:
        parser.error("Frame limit and stride must be positive")
    paths = sorted(args.frames.glob("frame_*.jpg"))[args.start_index : args.max_frame : args.stride]
    if len(paths) < 2:
        parser.error("At least two source frames are required")

    if args.device == "auto":
        device_name = "cuda" if torch.cuda.is_available() else (
            "mps" if torch.backends.mps.is_available() else "cpu"
        )
    else:
        device_name = args.device
    device = torch.device(device_name)
    if device.type == "cuda" and not torch.cuda.is_available():
        parser.error("CUDA is unavailable")
    if device.type == "mps" and not torch.backends.mps.is_available():
        parser.error("Apple GPU is unavailable")
    model = VGGT().to(device)
    weights = (torch.load(args.weights, map_location="cpu", weights_only=True)
               if args.weights else torch.hub.load_state_dict_from_url(WEIGHTS, map_location="cpu"))
    model.load_state_dict(weights)
    del weights
    model.eval()
    images, coords = load_and_preprocess_images_square([str(path) for path in paths], 518)
    images = images.to(device)[None]
    precision = (torch.autocast(device.type, dtype=torch.bfloat16)
                 if device.type in ("cuda", "mps") else nullcontext())
    with torch.inference_mode(), precision:
        tokens, ps_idx = model.aggregator(images)
        depth, confidence = model.depth_head(tokens, images, ps_idx)
        pose = model.camera_head(tokens)[-1]
        extrinsic, intrinsic = pose_encoding_to_extri_intri(pose, images.shape[-2:])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.output,
        names=np.asarray([path.name for path in paths]),
        coords=coords.numpy(),
        depth=depth.squeeze(0).float().cpu().numpy(),
        confidence=confidence.squeeze(0).float().cpu().numpy(),
        extrinsic=extrinsic.squeeze(0).float().cpu().numpy(),
        intrinsic=intrinsic.squeeze(0).float().cpu().numpy(),
    )
    print(f"Saved VGGT depth and cameras for {len(paths)} frames to {args.output}")


if __name__ == "__main__":
    main()
