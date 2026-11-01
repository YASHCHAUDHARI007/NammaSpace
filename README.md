# NAMMA SPACE
### *Your space, reimagined.*
**IIT Bombay Techfest 2026–27 | Indoor 3D Digital Twin & Spatial Navigation Platform**

**Namma Space** is a browser viewer for indoor 3D scenes. Its default classroom was reconstructed from one continuous Sony video, `assets/C5307.MP4`. Built with **Next.js App Router**, **React**, and **Three.js**, it renders `.splat` Gaussian Splats and `.glb` meshes with first-person movement. The classroom's physical dimensions are unknown; its navigation scale is relative.

Run `npm ci` and `npm run dev` to open the current model. The scene menu starts with the best C5307 model. It also lets you switch to the other completed one-video attempts: three C5307 comparisons and the C5306, C5305, and C5304 models. Each model uses only its named source video. Add `?scene=<scene-id>` to the viewer URL to open a specific attempt. The source videos are not in Git. The current C5307 submission files are local.

---

## 1. Key Capabilities (Round 1 + Round 2 Architecture Foundations)

- **Three Modular Scene Modes (`src/viewer/sceneLoader.js`):**
  1. **Procedural Baseline (`mode: 'demo'`):** A manually built 10m × 8m × 3.2m reference interior. This separate scene is a viewer fixture, not part of the one-video classroom reconstruction.
  2. **Reconstructed Mesh Pipeline (`mode: 'glb'`):** Loads standard binary glTF 2.0 (`.glb` / `.gltf`) scans via Three.js `GLTFLoader` + `DRACOLoader` with real byte-transfer progress and explicitly configured AABB collision volumes.
  3. **3D Gaussian Splat Pipeline (`mode: 'splat'`):** Validates standard 32-byte `.splat` files, then renders them through `@mkkellogg/gaussian-splats-3d` with anisotropic scale, quaternion rotation, RGBA opacity, depth sorting, and explicit proxy collision bounds.
- **Instant Local Asset Import:** Click **"Import Asset"** (or **"Import .glb / .splat"** on the Welcome screen) to load any `.glb`, `.gltf`, or `.splat` file directly from your device without modifying code.
- **First-Person Spatial Controller (`src/viewer/controls.js`):**
  - `PointerLockControls` mouse look + drag-to-look fallback and mobile touch D-pad.
  - Normalized horizontal movement vector so diagonal `W+A` / `W+D` movement is never faster than straight movement.
  - Configurable walking speed and a standing eye height. The classroom reports position and route length in scene units because its physical scale is unknown.
  - Automatic key release on `ESC`, pointer-lock exit, window blur, or tab switch.
- **Deterministic Collision & Obstacle-Aware A* Wayfinding (`src/viewer/collision.js`):**
  - Circle-vs-AABB horizontal collision resolution with smooth wall and furniture sliding.
  - Live toggleable **Collider Wireframes** (`Colliders` button in the header) to inspect room boundaries and furniture collision volumes.
  - Searchable **Points of Interest (POIs)** with real 2D walkable-grid **A* pathfinding** and line-of-sight smoothing that routes around furniture obstacles.

---

## 2. Project Structure

```text
src/
  app/
    layout.jsx           # HTML shell, global CSS, metadata, fonts, and theme color
    page.jsx             # Server-rendered home route
  components/
    Header.jsx            # Brand bar, scene switcher, POI search, collider & SOP toggles
    WelcomeOverlay.jsx    # "Step inside." entry modal with provenance & control guide
    ViewerControls.jsx    # Pointer-lock toggle, speed selector, reset view, mobile D-pad
    LoadingState.jsx      # Real byte-progress loading overlay (no fake percentages)
    ErrorState.jsx        # Actionable error diagnostics with 1-click baseline fallback
  viewer/
    createScene.js        # WebGL stage setup, procedural demo room, POI & A* route visuals
    SceneViewer.jsx       # React Three.js lifecycle, resize, raycasting, telemetry loop
    sceneLoader.js        # Modular loader for 'demo', 'glb', and 'splat' modes
    controls.js           # First-person WASD + PointerLock + drag fallback controller
    collision.js          # Circle-vs-AABB collision solver & 2D walkable grid A* pathfinder
  config/
    scenes.js             # Scene registry, spawn poses, roomBounds, colliders, and POIs
  styles/
    global.css            # Design tokens (Warm Ivory, Deep Forest Green, Muted Sage, Charcoal)
    viewer.css            # Translucent glass overlays, typography, responsive & mobile rules
  App.jsx                 # Client-side application state & layout orchestrator
next.config.mjs           # Next.js and output tracing configuration
public/
  models/
    sample-room-scan.glb  # Generated glTF 2.0 demonstration mesh for pipeline verification
  scenes/
    sample-capture.splat  # Synthetic 32-byte `.splat` demonstration asset (2,153 splats)
    classroom-metric.splat # Screen-scaled Sony camera capture pilot (558,361 splats)
    classroom-c5307-single-video.splat # Current one-video classroom
    classroom-c5307-colmap-clean-20k.splat # Local clean-frame trial without VGGT
    classroom-c5307-vggt-filled-20k.splat # Local masked-and-filled trial
    classroom-c5307-first15-baseline.splat # Earlier C5307 model
    classroom-c5305-one-video.splat # Earlier ceiling-heavy one-video trial
    classroom-single-video.splat # Earlier C5304 one-video classroom
docs/
  single-video-reconstruction.md # Source, capture SOP, pipeline, checks, and limits
  capture-sop.md          # Smartphone room capture Standard Operating Procedure
  reconstruction-workflow.md # Guide for Polycam/Luma/Nerfstudio/COLMAP -> Namma Space
  classroom-capture-pilot-2026-10-30.md # Results and limits of the real-camera pilot
  architecture.md         # System architecture & Round 2 extension design
tests/data/single-video-C5304/ # 24 sample frames from the earlier C5304 video
submission/
  technical-abstract.pdf # Four-page Round 1 abstract
  round1-demonstration.mp4 # Narrated 3:34 capture and walkthrough
```

---

## 3. Local Setup & Commands

### Prerequisites
- **Node.js** `>= 18.18.0` and **npm** `>= 9.0.0`

### Install & Run Development Server
```bash
npm ci
npm run dev
```
Open `http://localhost:3000` in Chrome, Edge, Firefox, or Safari.

### Tests, Production Build & Startup
```bash
npm test
npm run build
npm run start
```
The App Router prerenders the page shell. The interactive application is a Client Component, and the WebGL viewport loads only in the browser. The existing styles, scene registry, and assets remain in place.

---

## Rebuild the C5307 classroom on Apple Silicon

Use only `assets/C5307.MP4` as the image source. Check that its SHA-256 is
`578dd301276d1dfa93e1cd3758fa62bb2c92fdf2e23db2c3b0255196bf38730d`.
The file is not in Git. Keep generated data under `outputs/`.

Create three Python environments. Install PyCOLMAP 4.2.1, NumPy, SciPy, Pillow,
and plyfile in Python 3.11 for camera reconstruction. Install PyTorch,
TorchVision, OpenCV, and the [official VGGT code](https://github.com/facebookresearch/vggt)
in Python 3.12 for masks and depth. Install `msplat==1.1.4`, NumPy, Pillow,
plyfile, and OpenCV in a separate Python 3.12 environment for Metal training.
Set `SFM_PY`, `VGGT_PY`, and `METAL_PY` to their Python executables.
VGGT downloads its official model weights on the first run unless you pass
`--weights /path/to/model.pt`.

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

Check `tests/data/single-video-C5304/` for small sample frames and run `npm test`
to verify the viewer asset parser. These sample frames come from an earlier
video. They are not training input for the C5307 room.

The C5307 comparison menu also contains a 20,000-step COLMAP-only run on 146
person-free frames, a 20,000-step VGGT run on 242 frames with same-video fills
for masked people, and the earlier 15-second model. The fill trial uses
`scripts/fill-room-video-person-masks.py`. C5305 is an earlier 7,000-step
ceiling-heavy one-video preview. The selected C5307 model remains the default.

---

## 4. How to Capture & Import Your Own Reconstructed Room

1. **Capture the Room:** Follow [`docs/capture-sop.md`](./docs/capture-sop.md) to record overlapping perimeter and interior passes using a smartphone.
2. **Choose and test a reconstruction route:** Read the [3D reconstruction research](./docs/3d-reconstruction-research.md), then follow the [reconstruction workflow](./docs/reconstruction-workflow.md) to produce a textured `.glb` or convert an exported Gaussian PLY to standard `.splat`.
3. **Load into Namma Space:**
   - **Quick Browser Test:** Click **Import Asset** in the bottom-left Scene Information panel and select a `.glb`, `.splat`, or self-contained `.gltf` file. A `.gltf` that references separate buffers or textures needs those files at resolvable URLs; for local import, package the scene as `.glb` instead.
   - **Permanent Configuration:** Copy your file into `public/models/` or `public/scenes/` and add an entry in [`src/config/scenes.js`](./src/config/scenes.js).

---

## 5. Deployment

Next.js writes its production output to `.next/`. The old Vite SPA rewrite was removed because it would route Next.js assets and pages to a nonexistent `index.html`.

- **Vercel:** Import the repository as a Next.js project. Use `npm ci` and `npm run build`; keep the framework's default output settings.
- **Other Node hosts:** Run `npm ci`, `npm run build`, then `npm run start`. Use a Next.js-compatible platform integration when deploying to a managed static host.

For a local static package, run `NAMMA_STATIC_EXPORT=1 npm run build`. Serve the generated `out/` folder over HTTP.

---

## Asset format and spatial calibration

The sample GLB and `sample-capture.splat` are generated demonstration fixtures. The default `classroom-single-video.splat` uses only `C5304.MP4`. The older `classroom-metric.splat` is a separate multi-video pilot; see the [pilot report](./docs/classroom-capture-pilot-2026-10-30.md). The supported `.splat` format is the standard 32-byte little-endian layout: float32 XYZ position (bytes 0–11), float32 XYZ scale (12–23), uint8 RGBA (24–27), and uint8 quaternion WXYZ (28–31, mapped from bytes with `(value - 128) / 128`). The installed `@mkkellogg/gaussian-splats-3d` 0.4.7 parser handles covariance, rotation, opacity, and depth sorting; the loader rejects incomplete or invalid records. Other splat containers and PLY files require an explicit import pipeline.

The current C5307 classroom's physical dimensions are unknown. Its walking floor is aligned to Y = 0, and the median camera clearance defines one relative scene unit. The walking limits are visual estimates. No furniture collision is verified for this model. Detail can blur in views that the recording does not cover well.

Imported assets use placeholder navigation bounds. Before enabling trustworthy navigation, measure the reconstructed scene's origin, orientation, floor height, and scale in meters. Set `spawn`, `roomBounds`, `colliders`, `pois`, and each POI `waypoint` in the same world coordinate frame. The viewer does not infer physical walkability from arbitrary mesh bounds or radiance splats. Toggle **Colliders** to inspect the proxies, then walk every boundary and route in the browser.
