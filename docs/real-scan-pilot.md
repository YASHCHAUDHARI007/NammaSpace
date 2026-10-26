# Real-scan pilot: ingestion and calibration

This is the handoff for a **genuine indoor capture**. The bundled GLB and SPLAT are synthetic test fixtures. Local **Import Asset** is an uncalibrated visual preview with placeholder room bounds, no measured obstacle colliders, and no POIs. Do not use that preview to certify navigation.

## 1. Capture and export

1. Choose a permitted, static indoor room. Record its identity, capture date, phone and lens, reconstruction tool/version, and export/conversion steps. Keep the original photos or video outside Git. Follow the [capture SOP](capture-sop.md) for lighting, overlap and coverage.
2. Measure at least one unambiguous physical distance in meters and identify the same endpoints in the reconstruction. Record both values, measurement method, and uncertainty. A second independent dimension is useful for detecting scale drift.
3. Export a **self-contained `.glb`** when possible. The viewer also accepts a `.gltf` with embedded buffers/textures or resources hosted at resolvable URLs. Local multi-file `.gltf` import does not upload its separate files; package it as `.glb`. The Gaussian viewer accepts standard **32-byte-per-record `.splat`** (position, positive scales, RGBA, quaternion). Convert `.ply`, packed, or compressed splat formats externally before import.
4. Test an uncompressed GLB first. Draco-compressed glTF uses a decoder fetched from `gstatic.com`; Draco assets may fail offline or if the decoder is blocked. Meshopt and KTX2 decoders are not configured. Record the asset's byte size and any texture/decoder dependencies.

Local imported files remain selectable for the browser session. Their object URLs are revoked when the app unmounts, so importing many large files in one session can retain substantial memory until then.

## 2. Align the asset before configuring navigation

The viewer has no runtime model transform or calibration editor. Calibrate in the reconstruction/export tool, then inspect the resulting file. These are independent checks; changing mesh scale alone does not update navigation coordinates.

| Quantity | Required exported frame | How to verify |
| --- | --- | --- |
| Scale | 1 asset unit = 1 meter | Before baking, compute `measured physical distance (m) / corresponding asset distance (units)`. Apply that factor to the entire reconstruction, then remeasure the exported distance. |
| Up and floor | `+Y` up; walkable floor lies on `XZ` at `Y=0` | Inspect at least three floor points and a vertical wall/doorway. |
| Origin | Document a repeatable physical point and its exported `(0, 0, 0)` relationship | Check it in the exported viewer/authoring tool. |
| Rotation | Document which physical direction corresponds to `+X` and `+Z` | Check a second landmark. |

For splats, an external transform must rotate/translate **positions and orientations** and scale **positions and Gaussian sizes** consistently. Do not change only the displayed camera pose. Preserve the original asset and record the conversion command or export settings.

## 3. Register measured navigation metadata

Place the asset under `public/models/` or `public/scenes/`, then add an entry to [`src/config/scenes.js`](../src/config/scenes.js) by copying the existing GLB or SPLAT entry and replacing **every** fixture-specific coordinate and description. Review the complete entry in a diff before testing it. The loader rejects missing/nonfinite room bounds, collider boxes, spawn data, and POI waypoints; it also checks that the spawn and each waypoint have a reachable path with player clearance. These checks cannot prove the metadata matches the physical room.

- `mode` and `assetUrl`: `glb` for glTF mesh or `splat` for the standard splat format; point to the actual exported file.
- `roomBounds`: measured interior `minX/maxX/minZ/maxZ` in meters, `floorY: 0`, and measured `ceilingY` above the 1.68 m eye height. Outer bounds stop the player at the room perimeter; include interior walls, partitions, doors that must remain closed, and furniture as separate `colliders`.
- `colliders`: explicit array of world-space axis-aligned boxes, each with ordered `minX/maxX/minY/maxY/minZ/maxZ`. Use `[]` only after verifying the room has no interior obstacles. Colliders are proxy geometry; neither triangle meshes nor splats automatically supply them. Inspect them with the collider overlay.
- `spawn`: measured clear `[x, 1.68, z]`, `yaw` and `pitch` in radians. The standing eye height is fixed by the current controller; choose a floor-level position that leaves at least the 0.36 m player radius plus route clearance around walls/obstacles.
- `pois`: explicit array, or `[]`. For each POI set a visible 3D `position` and `lookAt`, plus a **separate** walkable `[x, z]` `waypoint` outside the object's collision volume. The route planner checks reachability from spawn.
- `reconstructionStatus`, `description`, and `isReconstructed`: describe the actual source. Set `isReconstructed: true` only for a genuine capture with measured, reviewed calibration. Also supply `calibration` with `captureSource` (capture record or file reference), `originDescription`, `upAxis: 'Y'`, `metersPerAssetUnit: 1`, and positive `referenceDistanceMeters` and `referenceDistanceAssetUnits` recorded **before** the scale bake. The app validates presence and format, not the truth of those claims.

Run `npm test` and `npm run build` after editing the registry. A rejected entry should show its validation error rather than silently use demo bounds. Compare the exported model, collider overlay, spawn, and POI targets in the browser before treating the entry as usable.

## 4. Acceptance evidence

Record the tested commit, asset hash/size, capture provenance, original and exported coordinate measurements, and the final scene config. Then capture desktop and phone evidence of:

- The asset loading without console errors, visual holes or major floaters; note any missing surfaces and lighting/texture artifacts.
- A known distance and doorway/furniture size matching measurements within a tolerance agreed for the pilot. Do not infer metric accuracy from appearance alone.
- Spawn on the floor with correct eye level and facing direction; wall and furniture contacts stop movement while parallel movement slides along them.
- Collider overlay enclosing the intended obstacles and all room boundaries; no unblocked interior walls, unexpected blockers, or routes through furniture.
- Search and travel to every configured POI, clear route endpoints, route cancellation, scene switching, and recovery after an invalid import.
- Browser/device, load time, asset size, responsiveness, and memory behavior during repeated loads. Record actual observations rather than a target budget as a pass.

The pilot is successful only after the real asset and measured configuration satisfy those checks on the intended devices. Synthetic fixtures and a green build establish pipeline health, not real-world calibration.

**Needed from the owner:** a genuine room capture or exported `.glb`/standard `.splat`; the room/capture provenance and reconstruction/export settings; at least one measured physical reference distance with identifiable asset endpoints; and intended spawn, obstacles, and POI locations. No genuine scan is checked into this repository at this stage.
