# Phase 7 ingestion and calibration readiness verification

Checked 29 October 2026 (IST) on branch `codex/phase-7-scan-readiness` from `b6c6fc4a12e0731c4deefaee13498b8ca50fe05f`. The initial working tree was clean. The attached NammaSpace checkout is `/Users/yash/gen_z_studio_work/Hackethon/NammaSpace`; `/Users/yash/vedonyx` is a different repository. Before publishing, `git ls-remote https://github.com/YASHCHAUDHARI007/NammaSpace.git refs/heads/main` confirmed that GitHub `main` was the same base SHA. The SSH remote rejected authentication (`Permission denied (publickey)`), so HTTPS is required for the push.

## Commands

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm ci` | 0 | Added 26 packages; dependency manifest and lockfile unchanged. |
| `npm test` on initial baseline | 0 | 9 passed, 0 failed. |
| `npm run build` on initial baseline | 0 | Next.js 15.5.28 compiled and prerendered `/`. |
| `npm test` after adding the empty-glTF regression, before its fix | 1 | 10 passed, 1 failed; the empty scene was incorrectly accepted. |
| `npm test` after fixes | 0 | 11 passed, 0 failed. |
| `npm run build` after fixes | 0 | Compiled, lint/type stage, and static generation passed. |
| `git diff --check` | 0 | No whitespace errors. |

The new scene-config test first failed because `validateSceneConfig` did not exist, then passed after implementation. `npm ci` was run before edits; no dependency files changed afterward.

## Browser evidence

Tested the production build using the ChatGPT in-app browser at `http://127.0.0.1:3000/`. The first build was restarted and reloaded after the empty-scene fix.

| Check | Result | Observation |
| --- | --- | --- |
| Procedural baseline | PASS | Loaded with 564 triangles and 7 configured AABBs. |
| Local valid GLB | PASS | Bundled synthetic `sample-room-scan.glb` loaded with 84 triangles; header and scene card marked it an uncalibrated preview with placeholder bounds and 0 measured AABBs. Visual mesh rendered. |
| Local valid SPLAT | PASS | Bundled synthetic `sample-capture.splat` loaded with 2,153 splats and the same uncalibrated warning. |
| Malformed GLB | PASS | Parser error identified invalid glTF and recovery selector remained usable. |
| Malformed SPLAT | PASS | Rejected non-multiple-of-32-byte file with record-format guidance; baseline fallback restored 564 triangles. |
| Separate-file glTF with missing buffer | PASS (rejection) | Error named `missing.bin` and explained that local `.gltf` needs embedded resources or packaging as GLB. |
| Structurally valid empty glTF | PASS (rejection after fix) | Initially loaded as 0 triangles. Final build rejected it with “contains no renderable mesh.” |
| Unsupported `.txt` | PASS (rejection) | Error shown while the baseline scene remained selected and rendered. |
| Failure recovery / renderer count | PASS | Switching back to the valid SPLAT or baseline after an invalid import loaded successfully. After the final valid GLB recovery, the page had one canvas. |
| Real calibration and navigation | NOT RUN | No genuine scan or measured calibration configuration exists. |

An intentionally malformed glTF produced one Three.js console warning about missing accessor min/max during testing. The valid GLB rendering did not show a fatal error. Pointer lock, DRACO decoding, offline decoder behavior, mobile hardware, and repeated-import memory use were not re-tested in Phase 7; see the [Phase 6 report](verification-report.md) for earlier browser coverage and limits.

## Scope and remaining handoff

`validateSceneConfig` now rejects absent/nonfinite room bounds, colliders, spawn and POI fields, blocked spawn/waypoints, and a declared real capture without calibration metadata. It checks consistency of declared coordinates, not the physical truth of a scan. The viewer still uses a fixed 1.68 m eye height and `Y=0` floor. Asset alignment must be baked before registering navigation coordinates. See the [real-scan pilot guide](real-scan-pilot.md) for capture evidence, export formats, calibration fields and acceptance checks.

No real smartphone scan is present in `public/`; only the two synthetic fixtures above were found. The owner must provide a genuine asset or capture, provenance/export settings, a measured reference distance identifiable in the asset, and desired spawn/obstacle/POI locations before a real-world pilot can be validated.
