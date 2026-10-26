# Phase 6 verification and real-scan pilot preparation

Checked 29 October 2026 (IST). Status: **PARTIAL**. The synthetic-fixture app passes install, tests, build, and the browser checks below. A real capture and some device-specific checks remain outstanding.

## Checkout and evidence

- NammaSpace checkout: `/Users/yash/gen_z_studio_work/Hackethon/NammaSpace`; verification branch `codex/phase-6-verification`; tested base commit `4c51a993675dee17ae1f884a7d3a00e5c5d2314f`.
- The initially requested `/Users/yash/vedonyx` path is a different repository (`YASHCHAUDHARI007.git`), so no NammaSpace commands or edits were run there beyond identification.
- The NammaSpace working tree was clean before changes. No prior verification report or recorded check results existed in this checkout.
- [GitHub `main` commit history](https://github.com/YASHCHAUDHARI007/NammaSpace/commits/main) showed `4c51a993675dee17ae1f884a7d3a00e5c5d2314f` as its head during this check. Thus the tested base matched GitHub `main`. `git ls-remote origin refs/heads/main` exited 128 because SSH DNS resolution failed, so the web commit page supplied the remote comparison.
- `public/models/sample-room-scan.glb` is a 7,728-byte generated glTF demo asset. `public/scenes/sample-capture.splat` is a 68,896-byte synthetic fixture with 2,153 records. No real capture asset was present under `public/`.

## Commands and results

| Command | Exit/result | Evidence |
| --- | --- | --- |
| `pwd`, `git status --short`, `git branch --show-current`, `git log -5 --oneline`, `git remote -v`, `git rev-parse HEAD` in NammaSpace | 0 each | Clean `main`, expected origin, SHA above. |
| `git ls-remote origin refs/heads/main` | 128 | `ssh: Could not resolve hostname github.com: -65563`. Web history checked separately. |
| `git switch -c codex/phase-6-verification` | 128 in sandbox, then 0 with approved Git-ref write | Dedicated branch created without moving or discarding files. |
| `npm ci` | 0 | Added 26 packages; lockfile unchanged. |
| `npm test` on base | 0 | 7 passed, 0 failed. |
| `npm run build` on base | 0 | Next.js 15.5.28 compiled and prerendered `/`. |
| `npm test` with new regression cases before their fixes | 1, expected | Same-cell endpoint and collider-crossing cases failed reproducibly. |
| `npm test` after route fix | 0 | 9 passed, 0 failed. |
| `npm run build` after code and CSS fixes | 0 | Compiled, type/lint stage and static page generation passed. |
| `git diff --check` | 0 | No whitespace errors. |
| `npm run start -- -p 3000` and `npm run start -- -H 127.0.0.1 -p 3000` in sandbox | 1 each | Local bind denied with `EPERM`. The approved localhost run became ready at `http://127.0.0.1:3000/`. |

The Playwright skill's own server-detection command exited 1 because its installation lacked the `playwright` module. Browser checks used the available ChatGPT in-app browser against the production server instead.

## Confirmed fixes

- `src/viewer/collision.js`: A* previously returned one point and zero distance for distinct endpoints in one grid cell. It also accepted grid links or smoothed links that crossed collider clearance. The pathfinder now retains the actual endpoints and checks walkability along endpoint links, grid links, and smoothed segments. The 5 mm segment sampling is an approximation; exact swept-circle geometry would be required for sub-centimeter calibration.
- `tests/spatial-engine.test.js`: Added failing-then-passing regressions for both cases. A separate deterministic diagnostic checked 1,464 returned routes across the three configured scenes at 2.5 mm intervals and found no clearance violations; this is sampled evidence, not a proof for every route.
- `src/styles/viewer.css`: At a 390 px viewport, the scene selector ended at x=453 and was clipped. The mobile header now wraps and its selector shrinks; after rebuilding, the selector ended at x=365 within the 390 px viewport.

## Real-browser acceptance

Browser: ChatGPT in-app browser, production Next.js server on localhost. Console warning/error log was empty during the checked flows.

| Check | Status | Evidence |
| --- | --- | --- |
| 1. Home opens without fatal console errors | PASS | Page title and app controls rendered; no console errors or warnings. |
| 2. Procedural room renders | PASS | One WebGL canvas, visible room, 564 triangles, 7 configured colliders. |
| 3. Enter exploration | PASS | Welcome overlay closed and room remained interactive. |
| 4. Mouse look, keyboard, pointer-lock exit, reset | PASS for drag, `W`, reset; BLOCKED for pointer lock/ESC exit | Drag changed the view. Holding `W` moved telemetry from z=3.10 to z=0.76, where the central obstacle stopped it. Reset returned to z=3.10. The in-app browser never reported a locked state after the lock button, so lock exit could not be tested. |
| 5. Walls/furniture block and allow sliding | PASS | Browser stopped at the pedestal; automated wall, tunneling, corner sliding, and route-clearance tests passed. Browser diagonal sliding was NOT RUN. |
| 6. Search, route, travel, cancellation | PASS | Sofa search produced a 3.48 m route; travel reached `(2.00, 1.68, 0.25)`. Clearing a cabinet route during travel stopped telemetry at `(-0.30, 1.68, 2.95)` and removed the route. |
| 7. Scene switching and failure recovery | PASS | Demo → GLB → SPLAT and rapid switches returned to demo with one canvas. Invalid GLB retry showed the same actionable error; baseline fallback recovered. |
| 8. Valid GLB and SPLAT | PASS | Bundled and local-file GLB loaded with 84 triangles; bundled and local-file SPLAT loaded with 2,153 splats. These are synthetic fixtures. |
| 9. Invalid and unsupported files | PASS | Invalid GLB showed glTF parsing guidance; invalid SPLAT reported non-multiple-of-32 size; `.txt` reported unsupported extension. App recovered via baseline fallback. |
| 10. Colliders, fullscreen, mobile controls | PASS | Collider wireframes appeared; fullscreen control changed to Exit Fullscreen and expanded the view; 390 px touch pad appeared and a held forward button moved the view. |
| 11. Resize and duplicate lifecycle | PASS for resize/canvas count; NOT RUN for animation-loop count | Canvas fitted both 390 px and default 753 px views; one canvas remained after rapid scene switches. The browser tool did not expose an animation-loop counter. |

DRACO-compressed GLB loading, separate-file `.gltf` imports, true pointer lock/ESC exit, and a real smartphone reconstruction were not exercised. The included GLB is not DRACO-compressed. The loader currently fetches its DRACO decoder from `gstatic.com`, so offline use of DRACO assets needs a separate check. Local imports retain object URLs while their scene options remain selectable and revoke them when the app unmounts; long sessions with many imports can retain those assets in memory.

## Real-world scan pilot handoff

Use the existing [capture SOP](capture-sop.md), [reconstruction workflow](reconstruction-workflow.md), and [architecture](architecture.md). The next pilot needs a real, permitted indoor room and the following evidence:

- [ ] Identify the room and capture date, obtain access, make lighting diffuse and stable, remove moving people, record the phone model/lens and one physically measured reference distance. Preserve raw video or photos outside Git.
- [ ] Capture overlapping perimeter passes at eye and lower height plus furniture coverage with the same 1x lens. Keep original footage and note blurred or missing areas.
- [ ] Produce a self-contained `.glb` or a standard 32-byte `.splat` (convert other PLY/packed outputs first). Record the reconstruction tool, export settings, provenance, file size, and conversion steps.
- [ ] In the exported coordinate frame, measure the scale (`1 unit = 1 m`), `+Y` up axis, `XZ` floor, floor height, origin, room extents, and at least one cross-check against the physical reference. Do not copy the synthetic scene's measurements.
- [ ] Register the real asset and measured `spawn`, `roomBounds`, furniture/wall `colliders`, `pois`, and walkable `waypoint` coordinates in `src/config/scenes.js`. Check every start and endpoint for player clearance. Browser import's placeholder bounds are preview-only.
- [ ] Inspect the reconstruction for holes, floaters, missing furniture, scale drift and texture/splat artifacts. Record browser, device, load time, file size, console output and interaction responsiveness on desktop and phone.
- [ ] With collider overlay on, walk boundaries and obstacles, test sliding, search and travel to every POI, and inspect every route for floor and obstacle clearance. Capture screenshots/video and command/browser results for the pilot report.

**Needed from the user:** a real room capture or exported `.glb`/standard `.splat`, its capture provenance and export workflow, one measured physical distance, and the intended spawn and POI locations. A successful pilot requires that evidence plus visually and metrically plausible rendering and collision-safe navigation in a real browser. The synthetic fixtures cannot establish it.
