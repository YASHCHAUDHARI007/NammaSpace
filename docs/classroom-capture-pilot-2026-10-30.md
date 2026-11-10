# Classroom capture pilot — 30 October 2026

## Capture and reference

The supplied `assets/` folder contains nine MP4 clips and 46 JPG/ARW still pairs of one classroom. The image metadata identifies a Sony ILCE-7SM3 and FE 16-35 mm F2.8 GM lens. This is a real camera capture. It is **not** evidence of a phone capture.

The owner measured the projector screen as **1.825 m high** and **about 2.40 m wide**. Use the height as the primary scale reference. Use the width as an approximate independent check. The screen corners must be identifiable in the reconstruction before either length can set its scale.

Some source images show people. Review permission and privacy before making any reconstruction public.

## Local mesh attempt

The first attempt used the 46 JPG stills with Apple RealityKit Object Capture. The reduced OBJ was converted to a 6.2 MB GLB and loaded in the Namma Space viewer. It contains 30,702 vertices and 48,343 triangles. Its unscaled bounds are approximately 3.915 × 0.577 × 5.258 units. In the viewer, it appears as a shallow floor with broken furniture and little usable wall geometry. This model fails the visual and walkable-room checks. Do not fit the screen measurement to it or use its bounds for collision.

The local preview correctly labeled this file as an uncalibrated import with zero obstacle colliders. The preview proves that the GLB loader works. It does not prove continuous roaming through the captured room.

## GPU pose reconstruction

The nine clips were sampled at **one frame per second** and downscaled to 1920 pixels wide. This produced **275 JPG frames** (47,637,229 bytes). The frames were copied to the `Krishu/NammaSpace` folder on `nst-n6`. The node has one NVIDIA RTX PRO 4000 Blackwell GPU with 24,467 MiB of memory. PyCOLMAP 4.2.1 with CUDA is installed in an isolated project environment. Nerfstudio 1.1.5 and gsplat 1.4.0 are installed in a separate Python 3.12 environment.

The camera-pose job uses a single SIMPLE_RADIAL camera, GPU SIFT features, exhaustive matching, and incremental mapping. It writes a COLMAP model and summary under `outputs/classroom/sfm-exhaustive/` on the cluster. The script is [`scripts/reconstruct-sfm.py`](../scripts/reconstruct-sfm.py). **Result: all 275 frames registered in one model, with 44,001 sparse 3D points and 0.79 px mean reprojection error.** The job took about six minutes.

Nerfstudio data conversion also found poses for all images. The first Gaussian training attempt stopped because `ninja` was outside the command's `PATH`. A second attempt completed **10,000 Splatfacto steps** on `nst-n6`. Its Gaussian PLY has 628,461 splats and is about 149 MB. The metric viewer export has **558,361 splats** in a **17,867,552-byte** standard `.splat` file at [`public/scenes/classroom-metric.splat`](../public/scenes/classroom-metric.splat). The conversion script is [`scripts/export-metric-splat.py`](../scripts/export-metric-splat.py). The PLY and checkpoints stay on the cluster.

## Metric alignment

[`scripts/calibrate-projector.py`](../scripts/calibrate-projector.py) triangulated manually marked outer screen corners from three registered frames. The measured **1.825 m screen height** gives **0.909231 m per COLMAP unit**. The reconstructed width is **2.3845 m**, which is 0.0155 m below the owner's approximate 2.40 m width. A plane fitted to 9,133 sparse floor points has a 0.0126 m residual standard deviation. The export puts this floor at viewer `Y=0`. The screen bottom is about 0.691 m above it.

The scale is approximate. The two separately reconstructed side heights are 1.8698 m and 1.7802 m after scaling. Manual corner placement, imperfect camera poses, and floor selection contribute error. The owner did not measure room length. The room limits and furniture boxes are visual estimates, not surveyed dimensions. The full calibration record is in the local ignored `outputs/classroom/screen-calibration.json` and can be regenerated from the script and registered model.

## Viewer and movement check

The `classroom-pilot` scene uses the metric asset and an estimated floor plan. It has 14 stage, step, whiteboard, cabinet, table, and seating collision boxes. The centre aisle remains open. The spawn is a recovered capture-camera position at `(0.72, 1.29, 5.82)` m. The camera height of 1.29 m matches that capture view; it is not a standard standing-eye measurement.

The production build ran privately on `nst-n6`, with a browser connected through an SSH tunnel. The browser loaded the complete 558,361-splat asset and showed the collider overlay. Continuous `W` movement from the spawn stopped at the stage at `Z=2.61` m. `S` movement, a short `A` correction around a table corner, and more `S` movement reached the rear boundary at `Z=11.84` m. These limits equal the proxy bounds plus the 0.36 m player radius. The route demonstrates a continuous centre aisle and active collision in the private production build. Local spatial tests pass and the production build succeeds.

The stage and room are recognizable from captured views, but novel views show blurred and ghosted furniture and people. This is a quality limit of the current pilot. Some source frames show people; inspect permissions and privacy before any public release. No public viewer was deployed.

## Remaining acceptance work

1. Capture the room with a phone and repeat the pipeline. The supplied videos came from a Sony camera, so this pilot does not meet a phone-capture claim.
2. Measure a second fixed distance and the room length. Check the screen marks and refine the floor and furniture proxies against those measurements.
3. Improve visual quality, especially people and furniture ghosting. Review all viewpoints before release.
4. Test the final viewer on the target phone and browser. Record load time and frame rate. The current browser check proves movement on a desktop browser through a private cluster build.
