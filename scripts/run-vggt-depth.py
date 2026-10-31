"""Infer VGGT depth on sampled frames from one recorded room video."""

from __future__ import annotations

import argparse
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
    args = parser.parse_args()
    if args.stride < 1 or args.max_frame < 1:
        parser.error("Frame limit and stride must be positive")
    paths = sorted(args.frames.glob("frame_*.jpg"))[: args.max_frame : args.stride]
    if len(paths) < 2:
        parser.error("At least two source frames are required")

    device = torch.device("cuda")
    if not torch.cuda.is_available():
        parser.error("VGGT inference must run on the cluster GPU")
    model = VGGT().to(device)
    model.load_state_dict(torch.hub.load_state_dict_from_url(WEIGHTS, map_location="cpu"))
    model.eval()
    images, coords = load_and_preprocess_images_square([str(path) for path in paths], 518)
    images = images.to(device)[None]
    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
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
