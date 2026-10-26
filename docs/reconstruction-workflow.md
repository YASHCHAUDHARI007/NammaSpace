# External 3D Reconstruction & Web Integration Workflow
## Namma Space — From Smartphone Footage to Interactive Browser Twin

> **Engineering Transparency Note:**
> Photogrammetric Structure-from-Motion (COLMAP), Neural Radiance Fields (NeRF), and 3D Gaussian Splatting (3DGS) training require CUDA/Metal GPU compute and take 5–45 minutes per room. Namma Space does **not** fabricate an in-browser AI reconstruction API. Instead, it provides a modular, production-ready web runtime (`src/viewer/sceneLoader.js`) that ingests standardized `.glb` and `.splat` outputs from established reconstruction pipelines.

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
    sample-room-scan.glb      # Included sample GLB mesh asset
    your-room-scan.glb        # Place your exported GLB/glTF meshes here
  scenes/
    sample-capture.splat      # Included sample 32-byte binary Gaussian Splat asset
    your-capture.splat        # Place your exported .splat captures here
```

---

## 3. Replacing or Adding a Reconstructed Scene in `src/config/scenes.js`

Open [`src/config/scenes.js`](../src/config/scenes.js) and add or update an entry in the `SCENES` registry:

```javascript
'iitb-lab-scan': {
  id: 'iitb-lab-scan',
  name: 'IITB Innovation Lab — Reconstructed Twin',
  shortLabel: 'Lab Scan (.glb)',
  mode: 'glb', // Use 'glb' for meshes or 'splat' for 3D Gaussian Splats
  sceneType: 'glTF 2.0 Binary Mesh (.glb)',
  reconstructionStatus: 'Smartphone Photogrammetry Scan + Proxy Collision Bounds',
  isReconstructed: true,
  assetUrl: '/models/your-room-scan.glb',
  dimensionsLabel: '9.2m × 6.8m × 3.0m',
  description: 'Smartphone photogrammetry reconstruction of the indoor lab space.',
  spawn: {
    position: [0, 1.68, 2.5],
    yaw: 0,
    pitch: -0.04
  },
  roomBounds: {
    minX: -4.5,
    maxX: 4.5,
    minZ: -3.3,
    maxZ: 3.3,
    floorY: 0,
    ceilingY: 3.0
  },
  // Define AABB collision boxes for major furniture (required for .splat scenes)
  colliders: [
    {
      id: 'lab-bench-1',
      label: 'Central Electronics Workbench',
      minX: -1.5,
      maxX: 1.5,
      minY: 0,
      maxY: 0.9,
      minZ: -0.8,
      maxZ: 0.8
    }
  ],
  // Define searchable Points of Interest for A* Wayfinding
  pois: [
    {
      id: 'poi-workbench',
      name: 'Central Electronics Workbench',
      category: 'Lab Station',
      description: 'Oscilloscope and soldering station.',
      position: [0, 1.2, 0],
      waypoint: [0, 1.5],
      lookAt: [0, 0.85, 0]
    }
  ]
}
```

### Instant Browser Preview (Zero Code Changes)
You can also click **"Import Asset"** (bottom-left Scene Info card) or **"Import .glb / .splat"** (on the Welcome screen) to load any `.glb`, `.gltf`, or `.splat` file directly from your computer into the live viewer.

---

## 4. Why Proxy Collision Geometry is Used for Gaussian Splats

3D Gaussian Splatting represents a scene as a volumetric cloud of anisotropic 3D Gaussians rather than watertight polygonal triangles. Raycasting or colliding directly against millions of fuzzy Gaussian ellipsoids is noisy and computationally expensive in real time.

Namma Space solves this cleanly by decoupling **Visual Radiance Rendering** (`sceneLoader.js`) from **Spatial Physics & Walkable Navigation** (`collision.js`):
- Both `.glb` and `.splat` scenes use lightweight, deterministic Axis-Aligned Bounding Boxes (`colliders`) and `roomBounds`.
- Toggle the **"Colliders"** button in the top-right header at any time to inspect the wireframe collision and walkable boundary volumes overlaid on the 3D scene.
