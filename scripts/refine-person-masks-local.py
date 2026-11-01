"""Tighten reviewed video person boxes with local semantic segmentation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
import torch
from torchvision.models.segmentation import (
    DeepLabV3_ResNet50_Weights,
    deeplabv3_resnet50,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path)
    parser.add_argument("broad_masks", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--device", choices=("auto", "mps", "cpu"), default="auto")
    parser.add_argument("--threshold", type=float, default=0.25)
    args = parser.parse_args()
    if args.output.exists() or not 0 < args.threshold < 1:
        parser.error("Output must be new and threshold must be in (0, 1)")
    paths = sorted(args.frames.glob("frame_*.jpg"))
    if len(paths) < 200:
        raise ValueError("Expected the full one-video frame set")
    device = "mps" if args.device == "auto" and torch.backends.mps.is_available() else (
        "cpu" if args.device == "auto" else args.device)
    if device == "mps" and not torch.backends.mps.is_available():
        parser.error("Apple GPU is unavailable")
    weights = DeepLabV3_ResNet50_Weights.DEFAULT
    person_class = weights.meta["categories"].index("person")
    model = deeplabv3_resnet50(weights=weights).to(device).eval()
    preprocess = weights.transforms()
    args.output.mkdir(parents=True)
    summary = {"frames": len(paths), "person_frames": 0, "fallback_frames": [],
               "broad_mask_pixels": 0, "refined_mask_pixels": 0,
               "model": "TorchVision DeepLabV3 ResNet50 COCO/VOC", "device": device}
    with torch.inference_mode():
        for index, path in enumerate(paths, 1):
            with Image.open(args.broad_masks / f"{path.name}.png") as mask_image:
                broad = np.asarray(mask_image.convert("L")) == 0
            if not broad.any():
                Image.fromarray(np.full(broad.shape, 255, dtype=np.uint8)).save(
                    args.output / f"{path.name}.png")
                continue
            summary["person_frames"] += 1
            with Image.open(path) as image:
                rgb = image.convert("RGB")
                tensor = preprocess(rgb).unsqueeze(0).to(device)
            prediction = model(tensor)["out"]
            probability = prediction.softmax(dim=1)[0, person_class].float().cpu().numpy()
            probability = cv2.resize(probability, (broad.shape[1], broad.shape[0]),
                                     interpolation=cv2.INTER_LINEAR)
            candidate_region = cv2.dilate(broad.astype(np.uint8),
                                          np.ones((41, 41), np.uint8)) > 0
            person = (probability >= args.threshold) & candidate_region
            count, labels, stats, _ = cv2.connectedComponentsWithStats(
                person.astype(np.uint8), connectivity=8)
            person[:] = False
            for component in range(1, count):
                if stats[component, cv2.CC_STAT_AREA] >= 300:
                    person |= labels == component
            if person.sum() < 800:
                person = broad
                summary["fallback_frames"].append(path.name)
            else:
                person = cv2.dilate(person.astype(np.uint8),
                                    np.ones((21, 21), np.uint8)) > 0
            mask = np.where(person, 0, 255).astype(np.uint8)
            Image.fromarray(mask).save(args.output / f"{path.name}.png")
            summary["broad_mask_pixels"] += int(broad.sum())
            summary["refined_mask_pixels"] += int(person.sum())
            if summary["person_frames"] % 12 == 0:
                print(json.dumps({"processed": index, "person_frames": summary["person_frames"],
                                  "refined_mask_pixels": summary["refined_mask_pixels"]}),
                      flush=True)
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
