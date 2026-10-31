"""Reconstruct camera poses and sparse points from an ordered image folder.

Use --device cpu on a Mac or the default CUDA device on the GPU node. Outputs
stay outside Git. Use --seed-images when exhaustive matching folds repeated
room views together. The resulting COLMAP model has arbitrary scale until calibrated.
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
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cuda")
    parser.add_argument("--threads", type=int, default=-1)
    parser.add_argument("--max-image-size", type=int, default=-1)
    parser.add_argument("--camera-params", default="", help="Optional focal length, principal point, and radial distortion")
    parser.add_argument("--seed-images", type=Path,
                        help="Folder containing a coherent subset; register it first, then add the remaining images while fixing its poses")
    args = parser.parse_args()

    images = args.images.resolve()
    output = args.output.resolve()
    if not images.is_dir():
        parser.error(f"Image folder does not exist: {images}")
    image_count = sum(path.suffix.lower() == ".jpg" for path in images.iterdir())
    if image_count < 20:
        parser.error(f"Expected at least 20 JPG frames; found {image_count}")
    seed_names = None
    if args.seed_images:
        if not args.seed_images.is_dir():
            parser.error(f"Seed image folder does not exist: {args.seed_images}")
        seed_names = sorted(path.name for path in args.seed_images.iterdir() if path.suffix.lower() == ".jpg")
        available_names = {path.name for path in images.iterdir() if path.suffix.lower() == ".jpg"}
        if len(seed_names) < 20 or not set(seed_names) <= available_names:
            parser.error("Seed folder must contain at least 20 JPG images also present in the input folder")
    output.mkdir(parents=True, exist_ok=True)
    database = output / "database.db"
    sparse = output / "sparse"
    sparse.mkdir(exist_ok=True)
    started = monotonic()

    device = pycolmap.Device.cpu if args.device == "cpu" else pycolmap.Device.cuda
    print(f"Extracting {args.device.upper()} SIFT from {image_count} images", flush=True)
    reader = pycolmap.ImageReaderOptions(camera_model="SIMPLE_RADIAL", camera_params=args.camera_params)
    extraction = pycolmap.FeatureExtractionOptions(num_threads=args.threads, max_image_size=args.max_image_size)
    pycolmap.extract_features(
        database,
        images,
        camera_mode=pycolmap.CameraMode.SINGLE,
        reader_options=reader,
        extraction_options=extraction,
        device=device,
    )

    print(f"Matching: {args.matching}", flush=True)
    matching = pycolmap.FeatureMatchingOptions(num_threads=args.threads)
    if args.matching == "sequential":
        pairing = pycolmap.SequentialPairingOptions(overlap=15, quadratic_overlap=True)
        pycolmap.match_sequential(database, matching_options=matching, pairing_options=pairing, device=device)
    else:
        pycolmap.match_exhaustive(database, matching_options=matching, device=device)

    print("Mapping camera poses and sparse points", flush=True)
    seed_models = None
    if seed_names:
        seed_output = output / "seed"
        seed_output.mkdir(exist_ok=True)
        seed_options = pycolmap.IncrementalPipelineOptions()
        seed_options.image_names = seed_names
        seed_options.multiple_models = False
        seed_options.num_threads = args.threads
        seed_options.mapper.num_threads = args.threads
        seed_models = pycolmap.incremental_mapping(database, images, seed_output, options=seed_options)
        if not seed_models:
            raise RuntimeError("Could not reconstruct the seed image subset")
        seed_index, seed_model = max(seed_models.items(), key=lambda item: item[1].num_reg_images())
        if seed_model.num_reg_images() < len(seed_names) * 0.95:
            raise RuntimeError(f"Seed model registered only {seed_model.num_reg_images()} of {len(seed_names)} images")
        print(f"Adding remaining images to {seed_model.num_reg_images()} fixed seed poses", flush=True)
        continuation = pycolmap.IncrementalPipelineOptions()
        continuation.multiple_models = False
        continuation.num_threads = args.threads
        continuation.mapper.num_threads = args.threads
        continuation.fix_existing_frames = True
        continuation.mapper.fix_existing_frames = True
        continuation.ba_refine_focal_length = False
        continuation.ba_refine_extra_params = False
        continuation.mapper.abs_pose_refine_focal_length = False
        continuation.mapper.abs_pose_refine_extra_params = False
        models = pycolmap.incremental_mapping(
            database, images, sparse, options=continuation, input_path=seed_output / str(seed_index)
        )
    else:
        models = pycolmap.incremental_mapping(database, images, sparse)
    summary = {
        "source": str(images),
        "input_frames": image_count,
        "matching": args.matching,
        "device": args.device,
        "camera_params_initial": args.camera_params or None,
        "seed_images": len(seed_names) if seed_names else None,
        "seed_registered_images": seed_model.num_reg_images() if seed_models else None,
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
