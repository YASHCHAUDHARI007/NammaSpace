"""Apply video-reviewed corrections to the C5307 person segmentation masks."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output must not exist")
    paths = sorted(args.source.glob("frame_*.jpg.png"))
    if len(paths) != 242:
        raise ValueError(f"Expected 242 masks, found {len(paths)}")
    args.output.mkdir(parents=True)
    patched = []
    cleared = []
    for path in paths:
        index = int(path.name[6:10])
        destination = args.output / path.name
        if 198 <= index <= 205:
            with Image.open(path) as source:
                mask = source.convert("L")
            width, height = mask.size
            ImageDraw.Draw(mask).rectangle((round(.94 * width), round(.20 * height),
                                            round(.99 * width), round(.75 * height)), fill=0)
            mask.save(destination)
            patched.append(path.name)
        elif 218 <= index <= 220:
            with Image.open(path) as source:
                Image.new("L", source.size, 255).save(destination)
            cleared.append(path.name)
        else:
            os.link(path, destination)
    result = {"source_masks": len(paths), "patched_second_person": patched,
              "cleared_after_people_exit": cleared}
    (args.output / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
