# NAMMA SPACE
### *Your space, reimagined.*
**IIT Bombay Techfest 2026–27 | Indoor 3D Digital Twin & Spatial Navigation Platform**

**Namma Space** is a web-based indoor spatial computing platform that converts smartphone-captured indoor environments into interactive, navigable 3D digital twins. Built with **React**, **Vite**, and **Three.js**, it pairs a modular 3D asset ingestion layer (`.glb` meshes and `.splat` 3D Gaussian Splats) with genuine first-person kinematics, Circle-vs-AABB sliding collision physics, and obstacle-aware A* floor pathfinding.

---

## 1. Key Capabilities (Round 1 + Round 2 Architecture Foundations)

- **Three Modular Scene Modes (`src/viewer/sceneLoader.js`):**
  1. **Procedural Baseline (`mode: 'demo'`):** Full-scale `10m × 8m × 3.2m` reference interior built with Three.js geometry (work table, modular L-sofa, coffee table, walnut storage cabinet, central calibration plinth, and east telemetry console). Clearly labeled as manual baseline geometry—never misrepresented as AI output.
  2. **Reconstructed Mesh Pipeline (`mode: 'glb'`):** Loads standard binary glTF 2.0 (`.glb` / `.gltf`) scans via Three.js `GLTFLoader` + `DRACOLoader` with real byte-transfer progress and automatic/configured AABB collision volumes.
  3. **3D Gaussian Splat Pipeline (`mode: 'splat'`):** Streams binary 32-byte `.splat` radiance field captures with custom Gaussian radial kernel rendering and explicit proxy collision bounds.
- **Instant Local Asset Import:** Click **"Import Asset"** (or **"Import .glb / .splat"** on the Welcome screen) to load any `.glb`, `.gltf`, or `.splat` file directly from your device without modifying code.
- **First-Person Spatial Controller (`src/viewer/controls.js`):**
  - `PointerLockControls` mouse look + drag-to-look fallback and mobile touch D-pad.
  - Normalized horizontal movement vector so diagonal `W+A` / `W+D` movement is never faster than straight movement.
  - Standing eye-height constraint (`1.68m`) and configurable walking speed (`Slow 2.0m/s`, `Normal 3.2m/s`, `Fast 4.8m/s`, plus `Shift` pace boost).
  - Automatic key release on `ESC`, pointer-lock exit, window blur, or tab switch.
- **Deterministic Collision & Obstacle-Aware A* Wayfinding (`src/viewer/collision.js`):**
  - Circle-vs-AABB horizontal collision resolution with smooth wall and furniture sliding.
  - Live toggleable **Collider Wireframes** (`Colliders` button in the header) to inspect room boundaries and furniture collision volumes.
  - Searchable **Points of Interest (POIs)** with real 2D walkable-grid **A* pathfinding** and line-of-sight smoothing that routes around furniture obstacles.

---

## 2. Project Structure

```text
src/
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
  App.jsx                 # Application state & layout orchestrator
  main.jsx                # React root mount
public/
  models/
    sample-room-scan.glb  # Sample binary glTF 2.0 room mesh for pipeline verification
  scenes/
    sample-capture.splat  # Sample 32-byte binary 3D Gaussian Splat asset (2,153 splats)
docs/
  capture-sop.md          # Smartphone room capture Standard Operating Procedure
  reconstruction-workflow.md # Guide for Polycam/Luma/Nerfstudio/COLMAP -> Namma Space
  architecture.md         # System architecture & Round 2 extension design
```

---

## 3. Local Setup & Commands

### Prerequisites
- **Node.js** `>= 18.0.0` and **npm** `>= 9.0.0`

### Install & Run Development Server
```bash
npm install
npm run dev
```
Open `http://localhost:5173` in Chrome, Edge, Firefox, or Safari.

### Production Build & Local Preview
```bash
npm run build
npm run preview
```

---

## 4. How to Capture & Import Your Own Reconstructed Room

1. **Capture the Room:** Follow [`docs/capture-sop.md`](./docs/capture-sop.md) to record overlapping perimeter and interior passes using a smartphone.
2. **Reconstruct to `.glb` or `.splat`:** Follow [`docs/reconstruction-workflow.md`](./docs/reconstruction-workflow.md) using Polycam, Luma AI, RealityCapture, or COLMAP + Nerfstudio.
3. **Load into Namma Space:**
   - **Quick Browser Test:** Click **Import Asset** in the bottom-left Scene Information panel and select your `.glb` or `.splat` file.
   - **Permanent Configuration:** Copy your file into `public/models/` or `public/scenes/` and add an entry in [`src/config/scenes.js`](./src/config/scenes.js).

---

## 5. Deployment (Vercel / Netlify)

The project builds to a static Vite bundle in `dist/` and includes [`vercel.json`](./vercel.json) for SPA routing.

- **Vercel:** Run `npx vercel` or connect the Git repository with Build Command `npm run build` and Output Directory `dist`.
- **Netlify:** Set Build Command to `npm run build` and Publish Directory to `dist`.
