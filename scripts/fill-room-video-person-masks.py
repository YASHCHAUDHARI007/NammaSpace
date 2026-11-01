"""Replace masked people with same-video room renders for a second training trial."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from msplat import Dataset, GaussianTrainer, TrainingConfig, cleanup


def camera_and_crop(frame: dict) -> tuple[np.ndarray, np.ndarray, tuple[int, int, int, int]]:
    width, height = frame["w"], frame["h"]
    intrinsic = np.array([[frame["fl_x"], 0, frame["cx"]],
                          [0, frame["fl_y"], frame["cy"]],
                          [0, 0, 1]], dtype=np.float32)
    distortion = np.array([frame.get(key, 0.0) for key in
                           ("k1", "k2", "p1", "p2", "k3")], dtype=np.float32)
    t = np.linspace(0, 1, 200, dtype=np.float32)
    borders = (
        np.column_stack((np.zeros_like(t), t * height)),
        np.column_stack((t * width, np.zeros_like(t))),
        np.column_stack(((width - 1) * np.ones_like(t), t * height)),
        np.column_stack((t * width, (height - 1) * np.ones_like(t))),
    )
    left, top, right, bottom = [cv2.undistortPoints(edge[:, None, :], intrinsic,
                                                      distortion, P=intrinsic)[:, 0]
                                for edge in borders]
    crop_x = max(0, int(np.ceil(left[:, 0].max())))
    crop_y = max(0, int(np.ceil(top[:, 1].max())))
    crop_w = min(width, int(np.floor(right[:, 0].min()))) - crop_x
    crop_h = min(height, int(np.floor(bottom[:, 1].min()))) - crop_y
    if crop_w < 1 or crop_h < 1:
        raise ValueError("Invalid camera crop")
    return intrinsic, distortion, (crop_x, crop_y, crop_w, crop_h)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Full 242-frame same-video dataset")
    parser.add_argument("clean", type=Path, help="Person-free training dataset")
    parser.add_argument("checkpoint", type=Path, help="Clean-model checkpoint")
    parser.add_argument("transform", type=Path, help="Clean-model msplat normalization")
    parser.add_argument("mask_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output must not exist")
    manifest = json.loads((args.source / "transforms.json").read_text())
    frames = manifest["frames"]
    if len(frames) < 200:
        raise ValueError("Expected the full video camera path")
    intrinsic, distortion, crop = camera_and_crop(frames[0])
    width, height = frames[0]["w"], frames[0]["h"]
    grid_x, grid_y = np.meshgrid(np.arange(width, dtype=np.float32),
                                 np.arange(height, dtype=np.float32))
    coords = np.stack((grid_x, grid_y), axis=-1)
    undistorted = cv2.undistortPoints(coords.reshape(-1, 1, 2), intrinsic,
                                      distortion, P=intrinsic).reshape(height, width, 2)
    map_x = np.ascontiguousarray(undistorted[..., 0] - crop[0])
    map_y = np.ascontiguousarray(undistorted[..., 1] - crop[1])
    del undistorted, coords, grid_x, grid_y
    transform = json.loads(args.transform.read_text())
    translation = np.asarray(transform["transform"], dtype=np.float32)[:, 3]
    scale = np.float32(transform["scale"])
    dataset = Dataset(str(args.clean.resolve()), downscale_factor=0.5,
                      eval_mode=True, test_every=8)
    config = TrainingConfig(iterations=20000, downscale_factor=0.5,
                            num_downscales=1, resolution_schedule=2000,
                            refine_every=500, densify_grad_thresh=0.0005,
                            bg_color=[0.0, 0.0, 0.0])
    trainer = GaussianTrainer(dataset, config)
    trainer.load_checkpoint(str(args.checkpoint.resolve()))
    output_images = args.output / "images"
    output_images.mkdir(parents=True)
    counts = {"source_frames": len(frames), "masked_frames_filled": 0,
              "clear_frames_linked": 0, "masked_pixels": 0,
              "low_signal_render_pixels": 0, "render_crop": crop}
    try:
        for frame in frames:
            name = Path(frame["file_path"]).name
            source_image = args.source / "images" / name
            output_image = output_images / name
            with Image.open(args.mask_dir / f"{name}.png") as mask_image:
                person = np.asarray(mask_image.convert("L")) == 0
            frame["file_path"] = f"images/{name}"
            if not person.any():
                os.link(source_image, output_image)
                counts["clear_frames_linked"] += 1
                continue
            pose = np.asarray(frame["transform_matrix"], dtype=np.float32).copy()
            pose[:3, 3] = (pose[:3, 3] + translation) * scale
            rendered = np.asarray(trainer.render_from_pose(np.ascontiguousarray(pose),
                                                            ref_cam_idx=0), dtype=np.float32)
            if rendered.shape[:2] != (crop[3], crop[2]):
                raise ValueError(f"Render shape mismatch for {name}: {rendered.shape}")
            warped = cv2.remap(rendered, map_x, map_y, cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REPLICATE)
            original = np.asarray(Image.open(source_image).convert("RGB"), dtype=np.float32) / 255
            person = cv2.dilate(person.astype(np.uint8), np.ones((5, 5), np.uint8))
            alpha = cv2.GaussianBlur(person.astype(np.float32), (0, 0), 2)
            filled = original * (1 - alpha[..., None]) + warped * alpha[..., None]
            Image.fromarray(np.uint8(np.clip(filled * 255, 0, 255))).save(
                output_image, quality=95, subsampling=0)
            counts["masked_frames_filled"] += 1
            counts["masked_pixels"] += int(person.sum())
            counts["low_signal_render_pixels"] += int(((warped.mean(axis=2) < 0.03)
                                                        & (person > 0)).sum())
            if counts["masked_frames_filled"] % 12 == 0:
                print(json.dumps(counts), flush=True)
    finally:
        cleanup()
    (args.output / "sparse_pc.ply").symlink_to((args.source / "sparse_pc.ply").resolve())
    (args.output / "transforms.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (args.output / "fill-summary.json").write_text(json.dumps(counts, indent=2) + "\n")
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
