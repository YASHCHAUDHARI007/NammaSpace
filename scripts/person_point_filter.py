"""Exclude sparse points observed only inside reviewed moving-person masks."""

from pathlib import Path

import numpy as np
from PIL import Image


class PersonPointFilter:
    def __init__(self, model, mask_dir: Path | None):
        self.model = model
        self.mask_dir = mask_dir
        self.masks = {}
        if mask_dir is not None and not mask_dir.is_dir():
            raise ValueError(f"Missing person mask folder: {mask_dir}")

    def count_clean_views(self, point, selected_ids: set[int] | None = None) -> int:
        count = 0
        for element in point.track.elements:
            if selected_ids is not None and element.image_id not in selected_ids:
                continue
            if self.mask_dir is not None:
                image = self.model.images[element.image_id]
                name = image.name.split('/')[-1]
                if name not in self.masks:
                    path = self.mask_dir / f'{name}.png'
                    if not path.is_file():
                        raise ValueError(f'Missing mask: {path}')
                    self.masks[name] = np.asarray(Image.open(path).convert('L'))
                mask = self.masks[name]
                x, y = np.rint(image.points2D[element.point2D_idx].xy).astype(int)
                if x < 0 or y < 0 or y >= mask.shape[0] or x >= mask.shape[1] or mask[y, x] == 0:
                    continue
            count += 1
        return count
