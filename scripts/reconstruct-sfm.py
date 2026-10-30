"""Reconstruct camera poses and sparse points from an ordered image folder.

Run this on the GPU node with a CUDA-enabled PyCOLMAP installation. Outputs stay
outside Git. The resulting COLMAP model is in arbitrary units until calibrated.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from time import monotonic

import pycolmap


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--matching", choices=("sequential", "exhaustive"), default="exhaustive")
    args = parser.parse_args()

    images = args.images.resolve()
    output = args.output.resolve()
    if not images.is_dir():
        parser.error(f"Image folder does not exist: {images}")
    image_count = len(list(images.glob("*.jpg")))
    if image_count < 20:
        parser.error(f"Expected at least 20 JPG frames; found {image_count}")
    output.mkdir(parents=True, exist_ok=True)
    database = output / "database.db"
    sparse = output / "sparse"
    sparse.mkdir(exist_ok=True)
    started = monotonic()

    print(f"Extracting GPU SIFT from {image_count} frames", flush=True)
    reader = pycolmap.ImageReaderOptions(camera_model="SIMPLE_RADIAL")
    pycolmap.extract_features(
        database,
        images,
        camera_mode=pycolmap.CameraMode.SINGLE,
        reader_options=reader,
        device=pycolmap.Device.cuda,
    )

    print(f"Matching: {args.matching}", flush=True)
    if args.matching == "sequential":
        pairing = pycolmap.SequentialPairingOptions(overlap=15, quadratic_overlap=True)
        pycolmap.match_sequential(database, pairing_options=pairing, device=pycolmap.Device.cuda)
    else:
        pycolmap.match_exhaustive(database, device=pycolmap.Device.cuda)

    print("Mapping camera poses and sparse points", flush=True)
    models = pycolmap.incremental_mapping(database, images, sparse)
    summary = {
        "source": str(images),
        "input_frames": image_count,
        "matching": args.matching,
        "pycolmap_version": pycolmap.__version__,
        "elapsed_seconds": round(monotonic() - started, 1),
        "models": [
            {
                "index": index,
                "registered_images": model.num_reg_images(),
                "points3d": model.num_points3D(),
                "mean_reprojection_error_px": round(model.compute_mean_reprojection_error(), 3),
            }
            for index, model in sorted(models.items())
        ],
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
