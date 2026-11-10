# One-video classroom reconstruction

## Source and scope

This model uses **one source file only**: `assets/C5304.MP4`. Its SHA-256 is
`a1d92c06896efdaa50fc0cac56152ffd3a18e701ad4424e91d0ae75e183ccaf8`.
The Sony video is 3840 × 2160, 50 fps, and 60.48 seconds long. No photograph,
other clip, old camera pose, or measured room dimension enters this model.

The output is `public/scenes/classroom-single-video.splat`. It has 776,728
Gaussian records, is 24,855,296 bytes, and has SHA-256
`e656fe712bdd93e266d980614fa19b90ac92e19f11d5d05b8376e2f640ae946c`.
The raw video and training files stay outside Git. The `tests/data/single-video-C5304`
folder contains 24 short-sequence frames from this video for a pipeline smoke test.
It is not the complete training set.

## Capture SOP for a repeat run

1. Select one room and one continuous video. Keep the camera lens fixed.
2. Keep the room static. Keep people and moving objects out of the scene.
3. Use steady light and a steady exposure. Move slowly enough to limit blur.
4. Walk with camera translation. Show each wall, floor edge, ceiling, and large
   object from several positions. Keep adjacent views overlapping.
5. Check the video for fast pans, repeated textures, reflections, and gaps.
6. Keep the original file and record its SHA-256. Record camera metadata.
7. Extract candidate frames. Accept only a coherent camera path. Train only
   from accepted frames of this one video.

This is the SOP for a repeat capture. The provided video already existed. Its
recording conditions were not controlled or measured during this project. Its
late fast pan did not yield a coherent camera path. We did not claim that this
capture follows every recommendation above.

## Reproduce the completed pipeline

Use `ffmpeg`, Python with `pycolmap` and NumPy, and Nerfstudio 1.1.5 on a CUDA
machine. The app uses Node.js and npm. Commands below run from the repository
root. Keep the work directory outside Git.

```bash
mkdir -p outputs/classroom/single-video-C5304/frames
ffmpeg -i assets/C5304.MP4 -t 55 -vf 'fps=2,scale=1920:-2' \
  -q:v 2 outputs/classroom/single-video-C5304/frames/frame_%04d.jpg

python scripts/reconstruct-sfm.py \
  outputs/classroom/single-video-C5304/frames \
  outputs/classroom/single-video-C5304/sfm \
  --matching sequential --device cuda

python scripts/check-sfm-trajectory.py \
  outputs/classroom/single-video-C5304/sfm/sparse/0

python scripts/package-classroom-cluster.py \
  outputs/classroom/single-video-C5304/frames \
  outputs/classroom/single-video-C5304/sfm/sparse/0 \
  outputs/classroom/single-video-C5304/dataset --video-only

ns-train splatfacto \
  --data outputs/classroom/single-video-C5304/dataset \
  --output-dir outputs/classroom/single-video-C5304/train-outputs \
  --experiment-name classroom-single-video \
  --max-num-iterations 10000 --steps-per-save 1000 \
  --pipeline.model.use-scale-regularization False \
  --pipeline.model.camera-optimizer.mode off --vis tensorboard
```

Export the trained Gaussian PLY with Nerfstudio. Use the config produced by
the training command. Save the run's dataparser transform and scale as JSON
with the `transform` and `scale` keys; `scripts/export-metric-splat.py` needs
this record to map the Gaussian coordinates back to the camera model.

```bash
ns-export gaussian-splat \
  --load-config outputs/classroom/single-video-C5304/train-outputs/classroom-single-video/splatfacto/<run>/config.yml \
  --output-dir outputs/classroom/single-video-C5304/export

# If the exporter writes splat.ply.gz, decompress it first.

python scripts/calibrate-relative-room.py \
  outputs/classroom/single-video-C5304/sfm/sparse/0 \
  docs/single-video-C5304-screen-observations.json \
  outputs/classroom/single-video-C5304/relative-calibration.json

python scripts/export-metric-splat.py \
  outputs/classroom/single-video-C5304/export/splat.ply \
  outputs/classroom/single-video-C5304/dataparser.json \
  outputs/classroom/single-video-C5304/relative-calibration.json \
  public/scenes/classroom-single-video.splat \
  --crop-min -7 -1.5 -2 --crop-max 6 5 17
```

The export paths and PLY compression can differ by Nerfstudio version. Check
the generated run directory, exported PLY, and saved dataparser JSON before
running the last command. The crop is an outlier cleanup envelope in scene
units. It is not a room measurement.

## Checks and measured results

| Check | Result |
| --- | --- |
| Candidate frames | 110 from the first 55 seconds at 2 fps; 1920 × 1080 |
| Accepted frames | 99 in one continuous sequential SfM model |
| Rejected frames | 100–110 did not join the continuous model |
| Sparse points | 18,500 before quality filtering; 17,617 starting points for training |
| Mean SfM reprojection error | 0.633 pixels on registered observations |
| Adjacent camera step | Median 0.2433; maximum 0.2877 in arbitrary SfM units |
| Splat training | 10,000 Splatfacto steps completed on `nst-n6` |
| Exported splats | 776,728; 23.70 MiB browser asset |
| Browser check | Chrome loaded the asset; the screen route reached its waypoint |

An exhaustive matching attempt registered all 110 frames, but it folded the
camera path. The frame 99→100 step was about 9.43 model units. A second seeded
attempt still jumped about 8.95 units. Both were rejected before training.
The continuity gate uses a ratio to adjacent camera steps. It does not depend
on physical room size.

## Scale, navigation, and visual limits

The screen border was marked in three frames of the same video. The screen
height is set to **two arbitrary scene units**. A fitted floor gives the viewer
a Y-up axis and a floor at Y = 0. The screen marks reproject with about
1.4–6.0 pixels of error. No physical screen or room size was measured. No
position or route length in this scene is a distance in meters.

The screen and front seats are recognizable in the viewer. Dark gaps and
floating or duplicated detail remain near view edges and from some novel
viewpoints. The single pass has weak coverage of some surfaces. The capture
contains plain screens, reflective areas, and a late rapid pan. More training
steps alone cannot recover surfaces that the accepted frames did not observe.
The floor plan and 12 collision boxes are visual estimates. They support a
navigation demonstration; they are not a safety or accessibility map.

The 0.633-pixel value measures fit to matched SfM features. It does not measure
novel-view image quality. No held-out render score, measured room dimensions,
mobile frame-rate benchmark, or full physical collision survey is available.

## App setup

Run `npm ci`, `npm test`, `npm run build`, and `npm run start`. Open the app in a
WebGL-capable browser. The one-video classroom is the default scene. Use WASD
or arrow keys to walk, drag or lock the pointer to look, and search for a point
of interest to show an obstacle-aware route. Use **Colliders** to inspect the
estimated collision volumes.
