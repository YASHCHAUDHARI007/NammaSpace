# Classroom ghosting: cause and fixes

Prepared: 24 November 2026
Asset tested: `public/scenes/nammaspace-classroom.ksplat` (1,285,266 splats, gsplat MCMC run from `nst-n6`).

These are offline renders of the shipped asset with Spark 2 at six fixed poses (960 × 540, 68° vertical FOV). They are not held-out photo comparisons. No source footage or camera poses were available on this machine, so no retraining was attempted.

## What the ghosting is

Near furniture (about 1–2.5 m from the eye) renders as offset translucent copies with radial streaks. Far furniture, walls and the stage look clean from the same pose. The artefact appears when the eye is somewhere the capture camera never was: higher than the capture height (about 1.35 m), or close above chair backs.

## Ruled out

| Hypothesis | Test | Result |
| --- | --- | --- |
| Furniture moved between the nine clips | Top-down alpha-density slices at seat (0.40–0.50 m), chair-back (0.55–0.85 m) and desk-top (0.70–0.78 m) height | Every chair and desk appears once and sharp. No duplicated furniture in 3D. |
| Floaters in free air | Map of low-alpha (< 0.1) and opaque (≥ 0.3) splats at seat height | Low-alpha splats sit inside the chairs, not in the aisles. Free-space carving would not remove the ghosts. |
| View-dependent colour | SH degree 1 against SH degree 0 | No visible difference. |
| Splat shape (needles) | Scale all splats × 0.6; cap the longest axis at 3× and 1.5× the middle axis | Streaks shorten or vanish. The ghost chairs stay and walls turn blotchy. |
| Viewer settings (earlier session) | `minAlpha`, `maxStdDev`, LoD, `maxPixelRadius`, sort mode, pruning needle splats | No useful change. |

Conclusion: the ghosts come from splat positions that only line up from the captured viewpoints. No post-processing of this file fixes that. It is a capture-coverage and training problem.

## Confirmed: eye height matters

Renders at 1.20, 1.35, 1.50 and 1.68 m with the same pitch show the least smear near the capture height. At 1.68 m, the viewer's former `DEFAULT_STANDING_HEIGHT`, the near-left chairs smear heavily. At 1.20 m, chair backs within about 1 m smear instead. The viewer allowed pitch down to 68° until 24 Nov. Captured views stay near level.

## Fixes, in priority order

### 1. Before the 26 November shoot (Namma Shoot Plan)

- **Capture height and viewer eye height now match.** Done 24 Nov: `DEFAULT_STANDING_HEIGHT` is 1.5 m, the height of pass A1. Film A1 at 1.5 m as planned.
- **Cover the views people will actually take.** Done 24 Nov: viewer pitch is limited to 35° down and 45° up (`src/viewer/controls.js`). Pass C tilts 15° down. A second C pass at about 35° down would cover the whole allowed range.
- **Film one held-out route clip.** Walk the viewer's main route at viewer eye height and leave the clip out of training. PSNR/LPIPS against it turns "ghosting" into a measurable number for comparing runs.
- Rule 1 (nothing moves) is already in the plan and remains essential.

### 2. Training on the cluster

- **LiDAR depth supervision.** The plan already records iPhone LiDAR. Depth supervision directly constrains the depth ambiguity that produces offset copies. DN-Splatter used iPhone sensor depth with a depth weight of 0.1 and a normal weight of 0.05. Phone depth is noisy at object edges.
- **Keep MCMC opacity and scale regularisation**, and check that their weights are not zero.
- **Difix3D (NVIDIA, CVPR 2025).** It renders novel views, cleans them with a single-step diffusion model, and distils them back into the splats. Use viewpoints along the viewer's walking route at viewer eye height. The repository has a gsplat example (`examples/gsplat/simple_trainer_difix3d.py`) and weights at `nvidia/difix`. Not yet run here. Check GPU memory on `nst-n6` first.
- **Depth-based free-space pruning.** `scripts/filter-splat-vggt-depth.py` exists only on `origin/backup/main-before-force-push-20261110`. With LiDAR depth instead of VGGT depth, it can remove splats in front of measured surfaces.

### 3. Viewer, for the current asset

- The 1.5 m eye and pitch limit already reduce smear on the old scan (captured at about 1.35 m). Going lower would need a per-scene height, because `sceneLoader.js` requires `spawn.position[1] === DEFAULT_STANDING_HEIGHT`.
- Longer term, use the Matterport approach: show the captured photo when the visitor stops at a capture point. This needs frames and poses, which are not in this repository.

## Sources

- [Difix3D+ paper](https://arxiv.org/abs/2503.01774), [code](https://github.com/nv-tlabs/Difix3D), [model](https://huggingface.co/nvidia/difix)
- [DN-Splatter: depth and normal priors](https://arxiv.org/pdf/2403.17822)
- [StableGS: floater-free 3DGS](https://arxiv.org/abs/2503.18458v3)
- [GSFix3D: diffusion-guided novel-view repair](https://arxiv.org/pdf/2508.14717)
