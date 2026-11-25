"""CPU check for gsplat-dense-depth.patch: the depth warp and the loss block, on a patched gsplat checkout.

    uv run --python cpython-3.12-macos-aarch64-none --with torch --with numpy \
        --with opencv-python-headless python -I scripts/training/test-gsplat-dense-depth.py /path/to/gsplat

(On the cluster, the training venv's python works too.) gsplat's other imports are stubbed:
only the numpy/cv2 depth loader and the torch loss block are exercised.
"""
import os
import sys
import tempfile
import textwrap
import types
from types import SimpleNamespace

import cv2
import numpy as np
import torch
import torch.nn.functional as F

gsplat_root = sys.argv[1]
examples = os.path.join(gsplat_root, "examples")
sys.path.insert(0, examples)
for name in ["pycolmap", "imageio", "imageio.v2", "PIL", "PIL.Image", "tqdm", "exif"]:
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules["PIL"].Image = sys.modules["PIL.Image"]
sys.modules["imageio"].v2 = sys.modules["imageio.v2"]
sys.modules["tqdm"].tqdm = getattr(sys.modules["tqdm"], "tqdm", lambda x, **k: x)
sys.modules["exif"].compute_exposure_from_exif = None

from datasets.colmap import Dataset  # noqa: E402


def check_depth_warp():
    # Piecewise-constant full-resolution depth: background 3.0, a "chair" at 1.0, an unmeasured corner.
    depth_full = np.full((600, 800), 3.0, np.float32)
    depth_full[200:420, 300:520] = 1.0
    depth_full[:80, :120] = 0.0

    # Training resolution (data_factor 2) and a distorted camera, set up the way gsplat's Parser does.
    w, h = 400, 300
    K = np.array([[320.0, 0, 200.0], [0, 320.0, 150.0], [0, 0, 1]])
    params = np.array([-0.12, 0.03, 0.001, -0.001], np.float32)
    K_undist, roi = cv2.getOptimalNewCameraMatrix(K, params, (w, h), 0)
    mapx, mapy = cv2.initUndistortRectifyMap(K, params, None, K_undist, (w, h), cv2.CV_32FC1)

    # Uniform-scale similarity, as Parser(normalize=True) builds it.
    a = 0.3
    transform = np.eye(4)
    transform[:3, :3] = 0.5 * np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    transform[:3, 3] = [1.0, -2.0, 0.5]

    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "C1"))
        np.save(os.path.join(tmp, "C1", "frame_0001.npy"), depth_full.astype(np.float16))
        parser = SimpleNamespace(
            image_names=["C1/frame_0001.jpg"],
            camera_ids=[1],
            params_dict={1: params},
            mapx_dict={1: mapx},
            mapy_dict={1: mapy},
            roi_undist_dict={1: roi},
            transform=transform,
        )
        ds = SimpleNamespace(indices=np.array([0]), parser=parser, depth_dir=tmp)

        # What the image path does to a training-resolution frame (nearest here, so values compare exactly).
        x, y, rw, rh = roi
        image = cv2.resize(depth_full, (w, h), interpolation=cv2.INTER_NEAREST)
        expected = cv2.remap(image, mapx, mapy, cv2.INTER_NEAREST)[y : y + rh, x : x + rw]

        got = Dataset._load_dense_depth(ds, 0, rh, rw)
        assert got.shape == (rh, rw), got.shape
        np.testing.assert_allclose(got, expected * 0.5, rtol=1e-6)
        assert set(np.unique(got / 0.5).round(4)) <= {0.0, 1.0, 3.0}, "depths blended across an edge"

        # Undistorted camera: plain nearest resize to the image size.
        parser.params_dict = {1: np.empty(0)}
        np.testing.assert_allclose(Dataset._load_dense_depth(ds, 0, h, w), image * 0.5, rtol=1e-6)


def check_loss():
    src = open(os.path.join(examples, "simple_trainer.py")).read()
    start = src.index("            if cfg.depth_dir is not None:\n                # Dense depth:")
    tail = "loss += dense_depthloss * cfg.dense_depth_lambda"
    block = compile(textwrap.dedent(src[start : src.index(tail) + len(tail)]), "dense_depth_block", "exec")

    def run(depths, gt, pixels, scene_scale=2.0, lam=0.1):
        env = dict(
            torch=torch, F=F, depths=depths, dense_depths_gt=gt, pixels=pixels, loss=torch.zeros(()),
            cfg=SimpleNamespace(depth_dir="x", dense_depth_lambda=lam),
            self=SimpleNamespace(scene_scale=scene_scale),
        )
        exec(block, env)
        return env["loss"], env["dense_depthloss"]

    H, W = 4, 5
    flat = torch.full((1, H, W, 3), 0.5)  # no image edges, so every weight is 1

    gt = torch.full((1, H, W), 2.0)
    assert run(gt[..., None].clone(), gt, flat)[0].item() == 0.0, "rendered == measured must be zero"

    pred = torch.full((1, H, W, 1), 2.0, requires_grad=True)
    gt[0, 0, 0] = 1.0  # measured, disparity error |1/2 - 1/1| = 0.5
    gt[0, 1, 1] = 0.0  # unmeasured
    loss, dense = run(pred, gt, flat)
    expected = 0.5 / (H * W - 1) * 2.0  # mean over measured pixels, times scene_scale
    assert abs(dense.item() - expected) < 1e-6, (dense.item(), expected)
    assert abs(loss.item() - 0.1 * expected) < 1e-7
    loss.backward()
    assert pred.grad[0, 1, 1, 0] == 0, "unmeasured pixel must get no gradient"
    assert pred.grad[0, 0, 0, 0] != 0 and torch.isfinite(pred.grad).all()

    empty = torch.zeros((1, H, W, 1), requires_grad=True)
    assert run(empty, torch.zeros((1, H, W)), flat)[0].item() == 0.0, "no measured pixel must give 0, not NaN"

    edgy = flat.clone()
    edgy[0, :, 3:, :] = 1.0  # a vertical image edge lowers the weight there
    pred = torch.full((1, H, W, 1), 2.0)
    assert run(pred, torch.ones((1, H, W)), edgy)[1] < run(pred, torch.ones((1, H, W)), flat)[1]


check_depth_warp()
check_loss()
print("gsplat dense depth: OK (warp matches image, scale, no edge blending; loss value, masking, no NaN, edge weight)")
