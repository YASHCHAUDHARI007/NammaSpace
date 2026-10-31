# Round 1 submission check

This check follows the Round 1 criteria in the supplied competition image and
the [public Namma Space listing](https://unstop.com/competitions/namma-space-techfest-iit-bombay-1749529/amp).
The model uses frames from `assets/C5304.MP4` only. Its physical scale is unknown.

| Required item or evaluation area | Evidence | Status |
| --- | --- | --- |
| Defined capture SOP | `docs/single-video-reconstruction.md` records a repeat capture SOP and states how the existing video differs from it. | Ready locally |
| Sound reconstruction pipeline | The same report records frame selection, camera-path checks, training, export, checksums, and rejected path attempts. The code is in `scripts/`. | Ready locally |
| 3D model | `public/scenes/classroom-single-video.splat` contains 776,728 Gaussian splats from 99 accepted frames of the one video. | Ready locally |
| Free roaming | The classroom is the default browser scene. WASD, mouse look, reset, collider display, and point-of-interest routes work in the local production build. | Ready locally |
| Visual quality and fidelity | The screen, ceiling, tables, and chairs are recognizable. The model has visible ghosting and gaps near the screen, at view edges, and at weakly observed viewpoints. | Partial quality |
| Web viewer performance | The 23.70 MiB scene loads and responds in desktop Chrome. A mobile frame-rate or load-time benchmark has not been made. | Desktop check only |
| Technical abstract, at most 5 pages | `submission/technical-abstract.pdf` has 4 pages. It records the architecture, pipeline, SOP, and technical approach. | Ready locally |
| Proof of concept and working free-roam link | The production viewer runs locally and is shown in the demo. A public URL still needs deployment and a remote browser check. | Publication pending |
| Demonstration video, 3–5 minutes | `submission/round1-demonstration.mp4` is 3:34, 1920 × 1080, with narration. It shows project scope, the sole source recording, processing, free roaming, and visual limits. | Ready locally |
| Code repository with setup and sample test data | `README.md` and `docs/single-video-reconstruction.md` give setup and reconstruction steps. `tests/data/single-video-C5304/` has 24 frames derived from the one video. The current changes must be published. | Publication pending |
| Round 1 Google Drive folder | The PDF, demo, source recording, and links can be placed in a folder. Access must be set to anyone with the link and checked from outside the account. | Publication pending |
| Single master PDF | The public competition listing asks for supplementary links or Drive resources in one master PDF inside the main submission folder. Add the published viewer, repository, demo, and source links to the four-page abstract before upload. | Publication pending |

The source recording is not in Git. The 24 sample frames do not replace it for
full training. The local 3D asset and abstract are prepared for the repository.
The demo is kept outside Git because it is a submission file.

Before submission, publish the current code and model, deploy the viewer, upload
the PDF, demo, and source video, then check all links without signing in. Check
the competition portal's current status before submitting. The public listing
gives October 31, 2026 as the Round 1 deadline; it does not prove that the
submission portal will accept a late or extended entry.
