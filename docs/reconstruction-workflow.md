# External 3D Reconstruction & Web Integration Workflow
## Namma Space — From Smartphone Footage to Interactive Browser Twin

> **Engineering Transparency Note:**
> Photogrammetric Structure-from-Motion (COLMAP), Neural Radiance Fields (NeRF), and 3D Gaussian Splatting (3DGS) training require CUDA/Metal GPU compute and take 5–45 minutes per room. Namma Space does **not** fabricate an in-browser AI reconstruction API. Instead, it provides a modular, web runtime (`src/viewer/sceneLoader.js`) that ingests standardized `.glb` and `.splat` outputs from established reconstruction pipelines.

---

## 1. Supported Reconstruction Pipelines

You can generate compatible 3D assets using any of the following tools:

### Option A: Polycam / Luma AI (Fastest Smartphone-to-Web Workflow)
1. Capture the room following [`docs/capture-sop.md`](./capture-sop.md).
2. Process the capture in **Luma AI** (Gaussian Splat + Mesh) or **Polycam** (LiDAR / Photo Mode).
3. Export:
   - **GLB Mesh:** Download `.glb` → Copy to `public/models/<your-scene>.glb`.
   - **Gaussian Splat:** Download `.splat` → Copy to `public/scenes/<your-scene>.splat`.

### Option B: Open-Source Desktop Pipeline (COLMAP + Nerfstudio / Splatfacto)
If running locally on an NVIDIA GPU workstation or Google Colab:
```bash
# 1. Extract frames and run COLMAP camera pose estimation
ns-process-data video --data raw_capture.mp4 --output-dir processed_room --num-frames-target 250

# 2A. Train 3D Gaussian Splatting (splatfacto)
ns-train splatfacto --data processed_room

# Export .splat or .ply and convert to standard 32-byte .splat format
ns-export gaussian-splat --load-config outputs/.../config.yml --output-dir public/scenes/

# 2B. Or train baked mesh / Poisson surface reconstruction for .glb
ns-export poisson --load-config outputs/.../config.yml --output-dir public/models/
```

### Option C: RealityCapture / Blender Cleanup (Recommended for Metric Alignment)
1. Import the reconstructed `.glb` or `.obj` into **Blender**.
2. Rotate the model so the floor is level with Blender's `XY` ground plane (which exports to glTF `+Y Up` / `XZ` floor automatically).
3. Translate the room center to `(0, 0, 0)` with the floor surface at elevation `0.0m`.
4. Scale using your physical reference measurement so `1 unit = 1 meter`.
5. Export as **glTF 2.0 Binary (`.glb`)** with Draco compression optional → save to `public/models/`.

---

## 2. Asset Path Conventions

```text
public/
  models/
    sample-room-scan.glb      # Included generated GLB demonstration asset
    your-room-scan.glb        # Place your exported GLB/glTF meshes here
  scenes/
    sample-capture.splat      # Included synthetic 32-byte Gaussian Splat demonstration asset
    your-capture.splat        # Place your exported .splat captures here
```

---

## 3. Replacing or Adding a Reconstructed Scene in `src/config/scenes.js`

Open [`src/config/scenes.js`](../src/config/scenes.js) and add an entry using measured values from your own asset. The old example dimensions were illustrative, not a real calibration. Follow the field-by-field [real-scan pilot guide](real-scan-pilot.md) before setting `isReconstructed: true`. The loader checks room bounds, spawn, collider boxes and reachable POI waypoints before loading. A real-capture entry also needs documented `calibration` evidence.

### Instant Browser Preview (Zero Code Changes)
You can also click **"Import Asset"** (bottom-left Scene Info card) or **"Import .glb / .splat"** (on the Welcome screen) to load any `.glb`, `.gltf`, or `.splat` file directly from your computer into the live viewer.
This is an **uncalibrated preview** with placeholder room bounds and no measured collision proxies. A local `.gltf` must embed its buffers and textures; package multi-file scenes as `.glb` for local import.

---

## 4. Why Proxy Collision Geometry is Used for Gaussian Splats

3D Gaussian Splatting represents a scene as a volumetric cloud of anisotropic 3D Gaussians rather than watertight polygonal triangles. Raycasting or colliding directly against millions of fuzzy Gaussian ellipsoids is noisy and computationally expensive in real time.

Namma Space solves this cleanly by decoupling **Visual Radiance Rendering** (`sceneLoader.js`) from **Spatial Physics & Walkable Navigation** (`collision.js`):
- Both `.glb` and `.splat` scenes use lightweight, deterministic Axis-Aligned Bounding Boxes (`colliders`) and `roomBounds`.
- Toggle the **"Colliders"** button in the top-right header at any time to inspect the wireframe collision and walkable boundary volumes overlaid on the 3D scene.


## Standard `.splat` handoff

Export a standard antimatter15-style 32-byte `.splat` file. Each record is little-endian float32 position XYZ, float32 scale XYZ, uint8 RGBA, and uint8 quaternion WXYZ. `@mkkellogg/gaussian-splats-3d` 0.4.7 renders the visual splats. A PLY or another packed container must be converted to this format before import. The provided sample is synthetic, so use an independently reconstructed room asset for capture validation.

After placing the real asset, measure its transform and floor level, register the corrected spawn and room bounds in `src/config/scenes.js`, build explicit furniture and wall proxies, and test every POI waypoint and route with the collider overlay enabled. Browser imports use placeholder bounds for preview only.
