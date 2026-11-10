"""Add reviewed moving-person masks to a one-video reconstruction.

First use --colmap-only on the extracted video frames. Then run this script
on the exported Nerfstudio dataset with the same boxes. It writes a mask for
every frame in both stages. White pixels remain available; black pixels are
ignored.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import re
import shutil

from PIL import Image, ImageDraw


def link_or_copy(source: str, destination: str) -> None:
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def make_mask(image_path: Path, fps: float, boxes: list[list[float]]) -> tuple[Image.Image, bool]:
    match = re.fullmatch(r'frame_(\d+)\.jpg', image_path.name)
    if match is None:
        raise ValueError(f'Expected a numbered video frame: {image_path.name}')
    seconds = (int(match.group(1)) - 1) / fps
    with Image.open(image_path) as image:
        mask = Image.new('L', image.size, 255)
    draw = ImageDraw.Draw(mask)
    width, height = mask.size
    has_box = False
    for start, end, x_min, y_min, x_max, y_max in boxes:
        if start <= seconds < end:
            draw.rectangle(
                (round(x_min * width), round(y_min * height),
                 round(x_max * width), round(y_max * height)),
                fill=0,
            )
            has_box = True
    return mask, has_box


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset', type=Path, help='Image folder with --colmap-only; otherwise a Nerfstudio dataset')
    parser.add_argument('output', type=Path)
    parser.add_argument('--fps', type=float, help='Required with --box; --plan supplies its own fps')
    parser.add_argument('--colmap-only', action='store_true', help='Write COLMAP masks named frame_0001.jpg.png')
    mask_source = parser.add_mutually_exclusive_group(required=True)
    mask_source.add_argument(
        '--box', type=float, nargs=6, action='append',
        metavar=('START_SECONDS', 'END_SECONDS', 'X_MIN', 'Y_MIN', 'X_MAX', 'Y_MAX'),
        help='A reviewed person region in normalized image coordinates',
    )
    mask_source.add_argument('--plan', type=Path, help='JSON with fps and reviewed boxes')
    args = parser.parse_args()
    source = args.dataset.resolve()
    output = args.output.resolve()
    if not source.is_dir() or output.exists() or source == output:
        parser.error('Source must exist and output must be new')
    if args.plan:
        if args.fps is not None:
            parser.error('--plan already specifies fps')
        plan = json.loads(args.plan.read_text())
        fps = float(plan['fps'])
        boxes = plan['boxes']
    else:
        fps, boxes = args.fps, args.box
    if fps is None or not math.isfinite(fps) or fps <= 0 or not boxes:
        parser.error('Need a positive fps and at least one box')
    if any(len(box) != 6 for box in boxes):
        parser.error('Each mask box needs six numbers')
    for start, end, x_min, y_min, x_max, y_max in boxes:
        if not (0 <= start < end and 0 <= x_min < x_max <= 1 and 0 <= y_min < y_max <= 1):
            parser.error('Boxes need increasing time and normalized coordinates in [0, 1]')

    if args.colmap_only:
        images = sorted(source.glob('frame_*.jpg'))
        if len(images) < 20:
            parser.error('Expected at least 20 extracted JPG frames')
        output.mkdir(parents=True)
        masked_frames = 0
        for image_path in images:
            mask, has_box = make_mask(image_path, fps, boxes)
            mask.save(output / f'{image_path.name}.png')
            masked_frames += has_box
        print(json.dumps({'input_frames': len(images), 'frames_with_person_masks': masked_frames,
                          'mask_box_count': len(boxes), 'output': str(output)}, indent=2))
        return

    transforms = json.loads((source / 'transforms.json').read_text())
    frames = transforms.get('frames', [])
    if len(frames) < 20:
        parser.error('Expected at least 20 registered frames')
    names = [Path(frame['file_path']).name for frame in frames]
    if len(set(names)) != len(names):
        parser.error('Frame names must be unique')
    if any(re.fullmatch(r'frame_(\d+)\.jpg', name) is None for name in names):
        parser.error('Expected frame_NNNN.jpg names in the video dataset')

    shutil.copytree(source, output, copy_function=link_or_copy)
    masks = output / 'masks'
    masks.mkdir()
    masked_frames = 0
    for frame in frames:
        image_path = output / frame['file_path']
        if not image_path.is_file():
            raise FileNotFoundError(image_path)
        mask, has_box = make_mask(image_path, fps, boxes)
        mask_path = masks / f'{image_path.stem}.png'
        mask.save(mask_path)
        frame['mask_path'] = f'masks/{mask_path.name}'
        masked_frames += has_box

    (output / 'transforms.json').unlink()  # Break the hard link before writing.
    (output / 'transforms.json').write_text(json.dumps(transforms, indent=2) + '\n')
    print(json.dumps({
        'input_frames': len(frames),
        'frames_with_person_masks': masked_frames,
        'mask_box_count': len(boxes),
        'output': str(output),
    }, indent=2))


if __name__ == '__main__':
    main()
