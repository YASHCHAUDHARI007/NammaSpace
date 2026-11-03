# Namma Space

A browser-based viewer for reconstructed indoor spaces, with first-person exploration and configurable navigation.

Namma Space displays 3D Gaussian splats and glTF meshes through a Next.js, React, and Three.js interface. Capture and reconstruction run outside the browser. The viewer loads the resulting assets for interactive walkthroughs, scene comparison, and navigation previews.

Developed for **IIT Bombay Techfest 2026–27**.

## Getting started

Requirements: Node.js 20.9 or later, npm, and a browser with WebGL support.

```bash
git clone https://github.com/LiteralKrishu/NammaSpace.git
cd NammaSpace
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) and select **Explore the space**. The repository includes the viewer assets. Source videos and Python tools are not required to run the application.

The default scene is the C5307 classroom, reconstructed from one continuous Sony video. Use the scene menu to compare reconstruction variants or open the procedural reference room. To open a scene directly, use its registry ID in the URL, for example:

```text
http://localhost:3000/?scene=demo-studio
```

## Features

- **Scene rendering:** Load standard `.splat` Gaussian splats, `.glb` meshes, and `.gltf` scenes.
- **First-person controls:** Walk with the keyboard, look with the mouse or drag gestures, and use touch movement controls on mobile.
- **Local asset import:** Preview compatible files from your device through **Import Asset**.
- **Navigation previews:** Search configured points of interest and display A* routes around defined obstacles.
- **Collision inspection:** Show room boundaries and obstacle volumes with the **Colliders** overlay.
- **Scene metadata:** Inspect capture sources, calibration status, loading progress, and scene statistics.

Navigation features depend on each scene's configuration. The procedural reference room includes obstacle volumes and points of interest for testing these features.

## Controls

| Input | Action |
| --- | --- |
| `W`, `A`, `S`, `D` or arrow keys | Move |
| Mouse with cursor locked, or click and drag | Look around |
| `Shift` | Increase movement speed while held |
| `R` | Reset the camera |
| `E` | Select the point of interest under the reticle |
| `Esc` | Release the cursor |

The viewer also provides speed, fullscreen, and camera reset controls. On mobile, use the on-screen movement pad.

## Importing a scene

### Preview a local file

Select **Import Asset** in the scene information panel, or **Import .glb / .splat** on the welcome screen.

Supported formats are `.glb`, `.gltf`, and standard 32-byte `.splat` files. For local `.gltf` imports, embed all buffers and textures in the file. Use `.glb` for scenes with separate resources. Convert Gaussian PLY files and other splat containers before import.

Local imports use placeholder navigation bounds. They need calibration before they can support accurate navigation.

### Register a scene

1. Place mesh assets in `public/models/` or splat assets in `public/scenes/`.
2. Add an entry to [src/config/scenes.js](src/config/scenes.js) with the asset path and mode: `glb` or `splat`.
3. Align the scene to Y-up with the floor at `Y = 0`. Define its scale, camera spawn, room bounds, obstacle volumes, and points of interest in the same coordinate system.
4. Inspect the **Colliders** overlay and test each boundary and route.

See the [reconstruction workflow](docs/reconstruction-workflow.md) for asset preparation and the [scene calibration guide](docs/real-scan-pilot.md) for configuration requirements.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm test` | Run asset validation, collision, and pathfinding tests |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |

Run `npm run build` before `npm run start`. Both servers use port 3000 by default. To use another port, append `-- -p 3001` to either server command.

### Project structure

```text
src/
  app/          Next.js routes, layout, and metadata
  components/   Viewer interface and controls
  config/       Scene registry and navigation configuration
  styles/       Global and viewer styles
  viewer/       Rendering, asset loading, movement, collision, and routing
  App.jsx       Application state and viewer composition
public/
  models/       Mesh assets
  scenes/       Gaussian splat assets
scripts/        Capture processing, reconstruction, training, and export tools
tests/          Spatial engine tests and sample capture frames
docs/           Capture, reconstruction, architecture, and verification guides
```

## Deployment

For a Node.js host, install dependencies with `npm ci`, build with `npm run build`, and start with `npm run start`. The production build is written to `.next/`.

For Vercel, import the repository as a Next.js project. Use `npm ci` as the install command and `npm run build` as the build command. Keep the framework's default output settings.

To create a static export:

```bash
NAMMA_STATIC_EXPORT=1 npm run build
```

Serve the generated `out/` directory over HTTP.

## Reconstruction and navigation limits

The default C5307 classroom uses only `assets/C5307.MP4`. Its physical dimensions are unknown, so camera positions and route lengths use relative scene units. Walking boundaries are visual estimates. Furniture collision volumes and points of interest are not configured for this scene.

Reconstruction detail depends on capture coverage. Surfaces with limited visibility can appear blurred, incomplete, or duplicated when viewed from new angles.

Collision and routing use explicitly configured obstacle volumes. The viewer does not infer walkable areas from mesh geometry or Gaussian splats. Generated sample assets and the procedural reference room serve as test fixtures. Raw source videos and intermediate reconstruction outputs are excluded from Git.

## Documentation

| Guide | Contents |
| --- | --- |
| [Capture procedure](docs/capture-sop.md) | How to record a room for reconstruction |
| [Reconstruction workflow](docs/reconstruction-workflow.md) | Prepare meshes and splats for the viewer |
| [C5307 reconstruction](docs/c5307-reconstruction.md) | Rebuild the default classroom on Apple Silicon |
| [C5304 reconstruction](docs/single-video-reconstruction.md) | Earlier one-video experiment, results, and limitations |
| [Scene calibration](docs/real-scan-pilot.md) | Configure scale, bounds, obstacles, and points of interest |
| [Architecture](docs/architecture.md) | Viewer modules and data flow |

## Contributing

Use GitHub issues to report problems or discuss proposed changes. Include reproduction steps for bug reports. For code changes, run `npm test` and `npm run build` before opening a pull request.

## License

This project is licensed under the [MIT License](LICENSE).
