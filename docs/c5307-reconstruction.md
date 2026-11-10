# C5307 classroom reconstruction

This guide describes the Apple Silicon reconstruction procedure for the default classroom in Namma Space. Run all commands from the repository root.

## Source video

Use only `assets/C5307.MP4` as the image source. Check that its SHA-256 is
`578dd301276d1dfa93e1cd3758fa62bb2c92fdf2e23db2c3b0255196bf38730d`.
The file is not in Git. Keep generated data under `outputs/`.

## Requirements

Install FFmpeg for frame extraction. Create three Python environments. Install PyCOLMAP 4.2.1, NumPy, SciPy, Pillow,
and plyfile in Python 3.11 for camera reconstruction. Install PyTorch,
TorchVision, OpenCV, and the [official VGGT code](https://github.com/facebookresearch/vggt)
in Python 3.12 for masks and depth. Install `msplat==1.1.4`, NumPy, Pillow,
plyfile, and OpenCV in a separate Python 3.12 environment for Metal training.
Set `SFM_PY`, `VGGT_PY`, and `METAL_PY` to their Python executables.
VGGT downloads its official model weights on the first run unless you pass
`--weights /path/to/model.pt`.

## Rebuild

```bash
ROOM_RUN=outputs/classroom/c5307-rebuild
mkdir -p "$ROOM_RUN/frames"
ffmpeg -nostdin -i assets/C5307.MP4 -vf 'fps=8,scale=1920:1080' -q:v 2 "$ROOM_RUN/frames/frame_%04d.jpg"
"$SFM_PY" scripts/reconstruct-sfm.py "$ROOM_RUN/frames" "$ROOM_RUN/sfm" --device cpu --matching sequential --max-image-size 1920
"$SFM_PY" scripts/mask-single-video-people.py "$ROOM_RUN/frames" "$ROOM_RUN/masks-broad" --colmap-only --plan scripts/c5307-person-mask-plan-refined.json
"$VGGT_PY" scripts/refine-person-masks-local.py "$ROOM_RUN/frames" "$ROOM_RUN/masks-broad" "$ROOM_RUN/masks-tight" --device mps
"$SFM_PY" scripts/finalize-c5307-person-masks.py "$ROOM_RUN/masks-tight" "$ROOM_RUN/masks-final"
"$SFM_PY" scripts/package-classroom-cluster.py "$ROOM_RUN/frames" "$ROOM_RUN/sfm/sparse/0" "$ROOM_RUN/nerfstudio" --video-only --mask-dir "$ROOM_RUN/masks-final"
"$VGGT_PY" scripts/run-vggt-depth.py "$ROOM_RUN/frames" "$ROOM_RUN/vggt-first.npz" --max-frame 120 --stride 5 --device mps
"$VGGT_PY" scripts/run-vggt-depth.py "$ROOM_RUN/frames" "$ROOM_RUN/vggt-last.npz" --start-index 220 --max-frame 242 --stride 2 --device mps
"$SFM_PY" scripts/merge-vggt-depth.py "$ROOM_RUN/vggt.npz" "$ROOM_RUN/vggt-first.npz" "$ROOM_RUN/vggt-last.npz"
"$SFM_PY" scripts/evaluate-vggt-depth.py "$ROOM_RUN/vggt.npz" "$ROOM_RUN/sfm/sparse/0" "$ROOM_RUN/vggt-validation.json"
"$SFM_PY" scripts/build-vggt-initialization.py "$ROOM_RUN/nerfstudio" "$ROOM_RUN/sfm/sparse/0" "$ROOM_RUN/vggt.npz" "$ROOM_RUN/vggt-validation.json" "$ROOM_RUN/nerfstudio-vggt" --mask-dir "$ROOM_RUN/masks-final"
"$SFM_PY" scripts/prepare-local-msplat-dataset.py "$ROOM_RUN/nerfstudio-vggt" "$ROOM_RUN/masks-final" "$ROOM_RUN/train"
"$SFM_PY" scripts/write-msplat-transform.py "$ROOM_RUN/train" "$ROOM_RUN/msplat-transform.json"
"$METAL_PY" scripts/train-room-local-msplat.py "$ROOM_RUN/train" "$ROOM_RUN/checkpoints" --steps 20000 --checkpoint-every 2500 --downscale 0.5 --refine-every 500 --grad-threshold 0.0005
"$SFM_PY" scripts/export-metric-splat.py "$ROOM_RUN/checkpoints/step-020000.ply" "$ROOM_RUN/msplat-transform.json" scripts/c5307-walking-floor-calibration.json "$ROOM_RUN/rebuilt.splat" --crop-min -4 -0.25 -3 --crop-max 5 3 9 --max-axis-scale-m 0.25
```

## Checks and comparison scenes

Check `tests/data/single-video-C5304/` for small sample frames and run `npm test`
to verify the viewer asset parser. These sample frames come from an earlier
video. They are not training input for the C5307 room.

The C5307 comparison menu also contains a 20,000-step COLMAP-only run on 146
person-free frames, a 20,000-step VGGT run on 242 frames with same-video fills
for masked people, and the earlier 15-second model. The fill trial uses
`scripts/fill-room-video-person-masks.py`. C5305 is an earlier 7,000-step
ceiling-heavy one-video preview. The default C5307 model uses 149 person-free training frames.

## Preview the result

The exported file remains under `outputs/`. Use **Import Asset** to inspect it in the viewer. Its scale is relative despite the export script's name. Physical room dimensions are unknown.

See the [README](../README.md) for viewer setup and the [scene calibration guide](real-scan-pilot.md) for navigation requirements.
