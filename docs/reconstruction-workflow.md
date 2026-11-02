# External 3D Reconstruction & Web Integration Workflow
## Namma Space — From Smartphone Footage to Interactive Browser Twin

> **Engineering Transparency Note:**
> Namma Space does **not** reconstruct a scene in the browser. Its web runtime (`src/viewer/sceneLoader.js`) loads `.glb` and standard 32-byte `.splat` outputs from external reconstruction tools. Processing time and hardware needs depend on the tool, image set, and machine. Record them during a real pilot. See the [current research note](3d-reconstruction-research.md) for the method comparison and evidence plan.

---

## 1. Supported Reconstruction Pipelines

You can generate compatible 3D assets using any of the following tools:

### Option A: Hosted phone capture to textured GLB
1. Capture the room following [`docs/capture-sop.md`](./capture-sop.md).
2. Use a service that can produce a textured indoor mesh and lets this account export `.glb`. [Polycam documents a GLB export workflow](https://learn.poly.cam/hc/en-us/articles/42497420365716-How-to-Optimize-Your-Captures-in-Blender); check the capture mode and export access before relying on it.
3. Download the `.glb` and place it in `public/models/`. Keep the raw capture, service settings, export file, and attribution details.

### Option B: Open-source Gaussian splat pipeline (COLMAP + Nerfstudio Splatfacto)
Run this on a supported CUDA workstation. [Nerfstudio documents](https://docs.nerf.studio/quickstart/custom_dataset.html) video processing and [Splatfacto training](https://docs.nerf.studio/nerfology/methods/splat.html):
```bash
ns-process-data video --data raw_capture.mp4 --output-dir processed_room --num-frames-target 250
ns-train splatfacto --data processed_room
ns-export gaussian-splat --load-config outputs/.../config.yml --output-dir exports/splat
```
The `250` frame target is an example, not a required count. Inspect the selected frames and camera registration. `ns-export gaussian-splat` writes a **Gaussian PLY**, not `.splat`. Convert the exported PLY with the [antimatter15 `convert.py` tool](https://github.com/antimatter15/splat/blob/main/convert.py) to a standard `.splat`, then place it in `public/scenes/`. Verify the output in the browser. Preserve the PLY and conversion settings.

Splatfacto does not provide a direct textured GLB export. Nerfstudio's [Poisson export](https://docs.nerf.studio/quickstart/export_geometry.html) needs a model that predicts normals, such as a suitable Nerfacto configuration; its mesh output also needs conversion to GLB. Do not point `ns-export poisson` at `public/models/` and assume it has written a browser-ready GLB.

### Option C: Open-source textured mesh pipeline (COLMAP MVS)
Use [COLMAP](https://colmap.github.io/tutorial) to estimate poses, dense points, and a mesh. The [current COLMAP CLI guide](https://colmap.github.io/cli.html) documents a separate `mesh_texturer` step that makes UVs and a texture atlas from undistorted images. Check that the installed version supports it. Alternatively, [OpenMVS](https://github.com/cdcseacave/openMVS/blob/develop/docs/wiki/Usage.md) documents mesh texturing and GLB export. Inspect and clean the result, align it to meters and Y-up, then export a self-contained GLB with [Blender](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html) if needed.

### Final alignment in Blender
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
