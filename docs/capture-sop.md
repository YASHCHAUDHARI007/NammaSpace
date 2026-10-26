# Smartphone Indoor Capture Standard Operating Procedure (SOP)
## Namma Space — IIT Bombay Techfest 2026–27

This document proposes a reproducible smartphone capture workflow for structure-from-motion (SfM), Multi-View Stereo (MVS), or 3D Gaussian Splatting (3DGS). It has not yet been validated with a genuine room capture in this project; metric accuracy must be measured after reconstruction.

---

## 1. Room Preparation & Lighting

1. **Maximize Diffuse, Static Illumination:**
   - Turn on all overhead and task lights before starting capture.
   - Open curtains/blinds if daylight is diffuse, but **avoid harsh direct sunbeams** that create high-contrast blown-out patches on floors.
2. **Eliminate Dynamic Objects:**
   - Ensure no people, pets, spinning ceiling fans, or oscillating monitors are moving during the capture pass. Moving objects violate the static-scene assumption of COLMAP/SfM and create floating artifacts ("floaters").
3. **Feature-Poor Surface Mitigation:**
   - Plain white walls and glossy floor tiles lack texture keypoints for COLMAP feature matching.
   - Place temporary visual anchors (e.g., sticky notes with high-contrast markers, magazines, or textured mats) near blank corners if a wall spans more than 3 meters without furniture or artwork.
4. **Metric Scale Reference:**
   - Measure one known physical distance in the room (e.g., table length = `2.10 m` or doorway width = `0.90 m`) so the exported mesh/splat can be scaled to 1:1 metric units (`1 Three.js unit = 1 meter`).

---

## 2. Smartphone Camera Configuration

- **Lens Selection:** Use the **main wide (1x) camera** (typically 24mm–26mm equivalent). Avoid switching lenses mid-capture, and avoid ultra-wide (0.5x) unless radial distortion calibration is handled by COLMAP (`OPENCV` camera model).
- **Resolution & Frame Rate:**
  - **Video Mode:** `4K (3840 × 2160)` at `30 fps` or `60 fps`.
  - **Stills Mode (Higher Fidelity):** 12MP–24MP JPEG/HEIC burst (`1–2 photos per second`).
- **Lock Optical Settings:**
  - **Lock Auto-Exposure (AE) & White Balance (AWB):** Tap and hold on a mid-tone area of the room before recording so brightness and color temperature remain constant across views.
  - **Disable Video Stabilization Warp ("Action Mode" / EIS crop):** Electronic horizon leveling warps the principal point per frame, degrading camera pose estimation.
  - **Shutter Speed:** Keep shutter speed faster than `1/120s` to prevent motion blur.

---

## 3. Trajectory & Overlapping Coverage Protocol

Follow a structured **3-Loop Capture Trajectory**:

```
   +---------------------------------------+
   |  [Loop 1: Perimeter Walk Looking In]  |
   |   --->   --->   --->   --->   --->    |
   |  ^                                 |  |
   |  |      +-------------------+      v  |
   |  |      | Central Furniture |      |  |
   |  |      |  [Loop 3: Orbit]  |      |  |
   |  ^      +-------------------+      v  |
   |   <---   <---   <---   <---   <---    |
   +---------------------------------------+
```

1. **Loop 1 — Outer Perimeter (Eye Level ~1.65m, Facing Inward):**
   - Stand with your back near the wall and walk slowly sideways (`~0.25 m/s`) around the entire perimeter looking across the room toward the opposite wall and center furniture.
   - Maintain **70%–80% visual overlap** between consecutive keyframes.
2. **Loop 2 — Elevated & Low Tilt Pass (~1.2m Chest Level, Angled Down 15°):**
   - Repeat the perimeter path with the camera slightly lower and tilted toward the floor-furniture junctions. This captures table legs, floor boundaries, and sofa bases needed for walkable floor extraction.
3. **Loop 3 — Central Furniture Island Orbit:**
   - Walk a slow loop around central obstacles (tables, sofas, islands) facing outward/downward at the furniture surfaces.
   - **Never pivot in place without translation:** Pure rotation (`panning from a fixed spot`) provides zero parallax baseline for depth triangulation. Always translate the camera laterally while rotating smoothly.

---

## 4. Frame Extraction & Source Preservation

1. Archive the original raw video (`raw_capture.mp4` or `.mov`) in an immutable folder outside the Git repository (`captures/YYYY-MM-DD-room-name/raw/`).
2. Extract sharp keyframes at `2–3 fps` using `ffmpeg`:
   ```bash
   mkdir -p captures/room_01/frames
   ffmpeg -i captures/room_01/raw_capture.mp4 -vf "fps=3,scale=1920:-1" -qscale:v 2 captures/room_01/frames/frame_%04d.jpg
   ```
3. Target **180 to 350 sharp frames** for a standard single room (`8m × 10m`). Discard any motion-blurred frames before running COLMAP.

---

## 5. Post-Reconstruction Validation Checklist

Before importing the asset into Namma Space (`public/models/` or `public/scenes/`):
- [ ] **Coordinate Orientation:** Floor lies on the horizontal `XZ` plane (`Y = 0`), with `+Y` pointing up.
- [ ] **Metric Scale:** `1.0` scene unit equals `1.0 meter` (standing eye height `1.68m` feels natural).
- [ ] **File Size Budget:** Prefer an uncompressed `.glb` for offline checks, or Draco compression when the external decoder is reachable (`< 25 MB` is a starting target, not a validated device limit). Meshopt is not configured in this viewer. Prune exterior floaters from `.splat` (`< 35 MB` is likewise a starting target).
- [ ] **Collision Proxy Defined:** Outer room `roomBounds` (`minX`, `maxX`, `minZ`, `maxZ`) and major furniture `colliders` are recorded in `src/config/scenes.js`.
