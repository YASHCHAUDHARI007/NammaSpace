# NAMMA SPACE
### *Your space, reimagined.*
**IIT Bombay Techfest 2026–27 | Indoor 3D Digital Twin & Spatial Navigation Platform**

**Namma Space** is a browser viewer for indoor 3D scenes. Its default classroom was reconstructed from one continuous Sony video, `assets/C5304.MP4`. Built with **Next.js App Router**, **React**, and **Three.js**, it renders `.splat` Gaussian Splats and `.glb` meshes, with first-person movement, preview collision boxes, and A* floor routes. The classroom's physical dimensions are unknown; its navigation scale is relative.

For the Round 1 source, capture SOP, exact pipeline, checks, and known visual limits, see [the one-video reconstruction report](./docs/single-video-reconstruction.md). The [four-page technical abstract](./submission/technical-abstract.pdf) summarizes the result. The [3:34 demonstration](./submission/round1-demonstration.mp4) shows the source, pipeline, and browser walkthrough. The [Round 1 submission check](./submission/round1-readiness.md) tracks each required item and the remaining publication checks.

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
    classroom-single-video.splat # Default one-video classroom (776,728 splats)
docs/
  single-video-reconstruction.md # Source, capture SOP, pipeline, checks, and limits
  capture-sop.md          # Smartphone room capture Standard Operating Procedure
  reconstruction-workflow.md # Guide for Polycam/Luma/Nerfstudio/COLMAP -> Namma Space
  classroom-capture-pilot-2026-10-30.md # Results and limits of the real-camera pilot
  architecture.md         # System architecture & Round 2 extension design
tests/data/single-video-C5304/ # 24 frames derived from the one source video
submission/
  technical-abstract.pdf # Four-page Round 1 abstract
  round1-demonstration.mp4 # Narrated 3:34 capture and walkthrough
  round1-readiness.md   # Competition criteria and submission status
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

---

## Asset format and spatial calibration

The sample GLB and `sample-capture.splat` are generated demonstration fixtures. The default `classroom-single-video.splat` uses only `C5304.MP4`. The older `classroom-metric.splat` is a separate multi-video pilot; see the [pilot report](./docs/classroom-capture-pilot-2026-10-30.md). The supported `.splat` format is the standard 32-byte little-endian layout: float32 XYZ position (bytes 0–11), float32 XYZ scale (12–23), uint8 RGBA (24–27), and uint8 quaternion WXYZ (28–31, mapped from bytes with `(value - 128) / 128`). The installed `@mkkellogg/gaussian-splats-3d` 0.4.7 parser handles covariance, rotation, opacity, and depth sorting; the loader rejects incomplete or invalid records. Other splat containers and PLY files require an explicit import pipeline.

The one-video classroom's physical dimensions are unknown. Its screen height is set to two arbitrary scene units. The navigation limits and furniture collision boxes are preview estimates, and some ghosting remains. The quality review and limits are recorded in the [one-video report](./docs/single-video-reconstruction.md).

Imported assets use placeholder navigation bounds. Before enabling trustworthy navigation, measure the reconstructed scene's origin, orientation, floor height, and scale in meters. Set `spawn`, `roomBounds`, `colliders`, `pois`, and each POI `waypoint` in the same world coordinate frame. The viewer does not infer physical walkability from arbitrary mesh bounds or radiance splats. Toggle **Colliders** to inspect the proxies, then walk every boundary and route in the browser.
