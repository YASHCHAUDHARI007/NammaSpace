"""Check VGGT video depth against independently triangulated camera points."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pycolmap
from scipy.stats import spearmanr


def sample_bilinear(image: np.ndarray, xy: np.ndarray) -> np.ndarray:
    height, width = image.shape
    x = np.clip(xy[:, 0], 0, width - 1.001)
    y = np.clip(xy[:, 1], 0, height - 1.001)
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    dx = x - x0
    dy = y - y0
    return (
        image[y0, x0] * (1 - dx) * (1 - dy)
        + image[y0, x0 + 1] * dx * (1 - dy)
        + image[y0 + 1, x0] * (1 - dx) * dy
        + image[y0 + 1, x0 + 1] * dx * dy
    )


def fit_depth(predicted: np.ndarray, reference: np.ndarray) -> tuple[float, float, np.ndarray]:
    valid = np.isfinite(predicted) & np.isfinite(reference) & (predicted > 0) & (reference > 0)
    for _ in range(5):
        if valid.sum() < 20:
            raise ValueError("Too few depth matches")
        slope, offset = np.linalg.lstsq(
            np.column_stack((predicted[valid], np.ones(valid.sum()))), reference[valid], rcond=None
        )[0]
        residual = reference - (slope * predicted + offset)
        median = np.median(residual[valid])
        mad = np.median(np.abs(residual[valid] - median))
        limit = max(0.05 * np.median(reference[valid]), 2.5 * 1.4826 * mad)
        valid &= np.abs(residual - median) <= limit
    return float(slope), float(offset), valid


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("depth", type=Path)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    inference = np.load(args.depth)
    model = pycolmap.Reconstruction(str(args.model))
    depth_maps = np.squeeze(inference["depth"])
    confidence_maps = np.squeeze(inference["confidence"])
    names = [str(name) for name in inference["names"]]
    rows = []
    for index, name in enumerate(names):
        image = next((image for image in model.images.values() if image.name == name), None)
        if image is None or not image.has_pose:
            rows.append({"image": name, "error": "No registered COLMAP pose"})
            continue
        observations = [point for point in image.points2D if point.has_point3D()]
        xyz = np.asarray([model.points3D[point.point3D_id].xyz for point in observations])
        pixels = np.asarray([point.xy for point in observations])
        pose = image.cam_from_world().matrix()
        reference = (xyz @ pose[:, :3].T + pose[:, 3])[:, 2]
        coords = inference["coords"][index]
        square_xy = np.column_stack((
            coords[0] + pixels[:, 0] * (coords[2] - coords[0]) / coords[4],
            coords[1] + pixels[:, 1] * (coords[3] - coords[1]) / coords[5],
        ))
        predicted = sample_bilinear(depth_maps[index], square_xy)
        confidence = sample_bilinear(confidence_maps[index], square_xy)
        try:
            slope, offset, valid = fit_depth(predicted, reference)
        except ValueError as error:
            rows.append({"image": name, "error": str(error)})
            continue
        error = np.abs(reference[valid] - (slope * predicted[valid] + offset))
        rows.append({
            "image": name,
            "observations": len(observations),
            "fitted_points": int(valid.sum()),
            "slope": round(slope, 6),
            "offset": round(offset, 6),
            "median_absolute_error_model_units": round(float(np.median(error)), 4),
            "median_relative_error": round(float(np.median(error / reference[valid])), 4),
            "spearman_depth_correlation": round(float(spearmanr(predicted[valid], reference[valid]).statistic), 4),
            "median_vggt_confidence": round(float(np.median(confidence[valid])), 3),
        })
    result = {"source": str(args.depth), "frames": rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    good = [row for row in rows if "median_relative_error" in row and row["slope"] > 0]
    print(json.dumps({
        "frames": len(rows),
        "valid_positive_scale_frames": len(good),
        "median_relative_error": float(np.median([row["median_relative_error"] for row in good])) if good else None,
        "median_depth_correlation": float(np.median([row["spearman_depth_correlation"] for row in good])) if good else None,
        "output": str(args.output),
    }, indent=2))


if __name__ == "__main__":
    main()
