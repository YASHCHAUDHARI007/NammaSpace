# Classroom reconstruction update

Updated: 2026-11-01

## Source and method

The current classroom model uses one recording: `assets/C5304.MP4`. No still
photo, other clip, old camera pose, or measured room dimension enters this
model. The recording is 60.48 seconds long at 3840 × 2160 and 50 fps. The
[reconstruction report](single-video-reconstruction.md) records the source
checksum, capture SOP, commands, and checks.

The pipeline sampled the first 55 seconds at 2 fps. PyCOLMAP accepted 99 of
110 candidate frames on one continuous camera path. A fresh Splatfacto run
completed 10,000 training steps. The exported model contains 776,728 Gaussian
splats and occupies 23.70 MiB.

## Current result

The browser loads the model as the default scene. The projector screen,
ceiling, tables, and chairs are recognizable. WASD movement, mouse look,
camera reset, preview collision boxes, and point-of-interest routes work in
the local viewer. The model, viewer code, and 24 sample frames are on
[GitHub `main`](https://github.com/LiteralKrishu/NammaSpace/tree/main).

The original 1.5 GB video is not in Git. The sample frames support a setup
check; full retraining needs the original recording. A [3:34 narrated
walkthrough](../submission/round1-demonstration.mp4) is also in the repository.

## Checks and limits

- All 14 automated tests pass. The production build succeeds.
- Desktop Chrome loads the 23.70 MiB model and responds to movement. No
  mobile frame-rate or load-time benchmark is available.
- Physical room dimensions are unknown. The screen height is set to two
  arbitrary scene units. The navigation bounds and furniture boxes are
  visual estimates.
- Ghosting and gaps remain near the projector screen, at view edges, and in
  views with weak source coverage. The 0.633-pixel camera-fit error does not
  measure the quality of new viewpoints.
- This repository does not record a verified hosted viewer URL.
