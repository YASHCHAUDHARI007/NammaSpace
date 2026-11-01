"""Select person-free frames from a one-video Nerfstudio dataset for msplat.

The input point cloud must already exclude points seen only inside the masks.
Images and the point cloud stay in the source dataset; this creates links and
one small camera manifest for a repeatable local training run.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("mask_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output must not exist")
    manifest = json.loads((args.source / "transforms.json").read_text())
    clean_frames = []
    masked_names = []
    for frame in manifest["frames"]:
        name = Path(frame["file_path"]).name
        mask_path = args.mask_dir / f"{name}.png"
        with Image.open(mask_path) as mask:
            has_person = mask.getextrema()[0] < 255
        if has_person:
            masked_names.append(name)
            continue
        frame["file_path"] = f"images/{name}"
        clean_frames.append(frame)
    if len(clean_frames) < 50:
        raise ValueError("Too few person-free frames")
    args.output.mkdir(parents=True)
    (args.output / "images").symlink_to(args.source.resolve() / "images")
    (args.output / "sparse_pc.ply").symlink_to(args.source.resolve() / "sparse_pc.ply")
    manifest["frames"] = clean_frames
    (args.output / "transforms.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({
        "source_frames": len(clean_frames) + len(masked_names),
        "clean_training_frames": len(clean_frames),
        "excluded_person_frames": len(masked_names),
        "first_clean_frame": Path(clean_frames[0]["file_path"]).name,
        "last_clean_frame": Path(clean_frames[-1]["file_path"]).name,
    }, indent=2))


if __name__ == "__main__":
    main()
