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
- **Choose the LiDAR app by its export.** It needs per-frame depth, confidence, camera poses, intrinsics and an RGB stream that COLMAP can register (see section 2). Stray Scanner's documented format has all of these. During S11, keep markers and furniture in view as in the 4K passes, because the LiDAR session's RGB frames are how it gets aligned.
- Rule 1 (nothing moves) is already in the plan and remains essential.

### 2. Training on the cluster

Checked on 24 Nov against the source code of gsplat, DN-Splatter, Difix3D and the Stray Scanner format docs. Nothing was run on the cluster.

#### The plan's "LiDAR depth loss" does not exist yet

Stage 3 of the shoot plan says "gsplat MCMC, exposure correction, LiDAR depth loss". Three things stand in the way:

- **gsplat's `--depth_loss` cannot read depth maps.** It projects the COLMAP 3D points of each image and applies L1 on disparity at those few pixels (`depth_lambda` 0.01). There is no option to load dense depth. The current asset's "depth-regularised" label most likely means this sparse loss. Check the run's `cfg.yml` on the cluster to confirm.
- **The LiDAR depth belongs to other frames.** The LiDAR pass (S11) is a separate app session. Stray Scanner, for example, writes 256 × 192 16-bit PNG depth in millimetres, a confidence map (0, 1 or 2) and ARKit poses in `odometry.csv`, all for its own frames. gsplat trains on the 4K Blackmagic frames, which have no depth.
- **No ready converter.** Neither gsplat nor nerfstudio's `ns-process-data` reads Stray Scanner. DN-Splatter's documented iPhone path is the Spectacular AI app (`process_sai.py`). DN-Splatter also pins nerfstudio 1.1.3 and gsplat 1.0.0, older than the MCMC trainer used for the current asset.

So LiDAR depth supervision needs three pieces of code before the training night of 26–27 Nov:

Steps 1 and 2 are drafted as [`scripts/training/lidar-depth-for-gsplat.py`](../scripts/training/lidar-depth-for-gsplat.py). It reads Stray Scanner sessions and has three subcommands: `extract`, `align` and `render`.

1. **Register the LiDAR session into the COLMAP model.**
   - `extract` saves every 30th LiDAR RGB frame and prints the three COLMAP commands that register those frames into a copy of the training database.
   - `align` fits the similarity transform between the ARKit and COLMAP camera centres (Umeyama with RANSAC). It also checks the camera-axis convention against the COLMAP rotations, and reports the scale in COLMAP units per metre. Cross-check that scale against the AprilTag and laser readings.
2. **Render a depth map for every 4K training camera.**
   - `render` fuses the confidence-2 LiDAR depth within 4 m into a TSDF mesh (Open3D). It moves the mesh into the COLMAP frame and raycasts camera z-depth for each training camera, distortion included.
   - A pixel keeps its depth only if LiDAR saw the space in front of the surface as empty. Otherwise a ray passes through anything LiDAR missed, such as a dark chair or the underside of a desk seen only from the 0.8 m pass, and returns the depth of the wall behind it.
   - In the synthetic test room, a low-confidence box gets depth on 35 of 15,788 pixels with this check. With the check off, it gets depth on 10,019, with errors up to 4 m.
   - Elsewhere the depth error has a median of 0.7–1.2 cm and a 95th percentile of 3–4 cm.
   - Not yet tried on real Stray data. The COLMAP commands, the vocab-tree file and HEVC decoding on the cluster are untested.
3. **Add a dense depth term to the gsplat trainer.** Drafted 24 Nov as [`scripts/training/gsplat-dense-depth.patch`](../scripts/training/gsplat-dense-depth.patch), against gsplat 1.6.0. It adds `--depth_dir` and `--dense_depth_lambda`. The patch header gives the depth-file format that step 2 must write. [`scripts/training/test-gsplat-dense-depth.py`](../scripts/training/test-gsplat-dense-depth.py) checks it on CPU. It has not been run on a GPU yet.

Two caveats:

- A 256 × 192 depth map fused into a mesh loses thin parts such as chair legs. The rendered depth there shows the floor behind the leg, and the loss would push the leg's splats away. Down-weight pixels at strong image edges; DN-Splatter's `EdgeAwareLogL1` loss does this.
- Weights: the patch uses the same loss as gsplat's sparse depth loss, so start at gsplat's default of 0.01, then try 0.05 and 0.2. Pick by PSNR/LPIPS on the held-out route clip. DN-Splatter's 0.1–0.2 are for its own loss and do not carry over.

#### Fallback with no LiDAR registration: monocular depth

Run a monocular depth model on every 4K frame and fit a scale and shift per frame to the COLMAP sparse depths. DN-Splatter's `align_depth.py` does this with ZoeDepth; it is hard-coded to ZoeDepth, so using Depth Anything V2 needs a code change. Supervise with a Pearson correlation loss, which DN-Splatter recommends for monocular depth.

This fallback works on the old classroom footage and poses already on the cluster, so it can be tested before the shoot. Retrain the classroom with it and render the same six poses for comparison. If LiDAR registration (step 1) works, align the monocular maps to the LiDAR mesh depth instead of the sparse points. That gives metric scale from LiDAR and sharp edges from the monocular model.

#### Other training changes

- **MCMC regularisation.** gsplat's base config sets `opacity_reg` and `scale_reg` to 0. The `mcmc` preset sets both to 0.01 (checked in gsplat 1.6.0). Check the current run's `cfg.yml` to see which preset it used.
- **Difix3D (NVIDIA, CVPR 2025).** It renders novel views, cleans them with a single-step diffusion model, and distils them back into the splats.
  - Inputs: a trained gsplat checkpoint (`--ckpt ckpt_*.pt`) and the COLMAP data. The `.ksplat` is not enough, so keep checkpoints from the 26–27 Nov runs.
  - Novel views: it uses the validation cameras, shifted 0.5 scene units in each fix round. There is no flag for custom poses. Using the viewer's walking route at 1.5 m needs a change in `fix()`. Sample those poses from walkable aisles, not from the held-out clip, so the evaluation stays fair.
  - It downloads `nvidia/difix_ref` from Hugging Face at start, so the cluster needs internet or a pre-download.
  - GPU memory is not stated anywhere; the model card's figure is a placeholder. Measure one fix step with `torch.cuda.max_memory_allocated()` at `data_factor` 4 first.
  - Licence: NVIDIA licence, non-commercial (research or evaluation only). That suits the Techfest evaluation. Check it before using Difix-trained assets in any commercial deployment.
- **Depth-based free-space pruning.** `scripts/filter-splat-vggt-depth.py` exists only on `origin/backup/main-before-force-push-20261110`. Once step 2 above produces per-camera depth maps, they can replace VGGT depth in that script to remove splats in front of measured surfaces.

### 3. Viewer, for the current asset

- The 1.5 m eye and pitch limit already reduce smear on the old scan (captured at about 1.35 m). Going lower would need a per-scene height, because `sceneLoader.js` requires `spawn.position[1] === DEFAULT_STANDING_HEIGHT`.
- Longer term, use the Matterport approach: show the captured photo when the visitor stops at a capture point. This needs frames and poses, which are not in this repository.

## Sources

- [Difix3D+ paper](https://arxiv.org/abs/2503.01774), [code](https://github.com/nv-tlabs/Difix3D), [model](https://huggingface.co/nvidia/difix), [licence](https://github.com/nv-tlabs/Difix3D/blob/main/LICENSE.txt)
- [DN-Splatter: depth and normal priors](https://arxiv.org/pdf/2403.17822), [code](https://github.com/maturk/dn-splatter)
- gsplat [`simple_trainer.py`](https://github.com/nerfstudio-project/gsplat/blob/main/examples/simple_trainer.py) and [`datasets/colmap.py`](https://github.com/nerfstudio-project/gsplat/blob/main/examples/datasets/colmap.py) (depth loss and MCMC defaults)
- [Stray Scanner data format](https://github.com/strayrobots/scanner/blob/main/docs/format.md)
- [nerfstudio custom data](https://docs.nerf.studio/quickstart/custom_dataset.html) (apps `ns-process-data` supports)
- [StableGS: floater-free 3DGS](https://arxiv.org/abs/2503.18458v3)
- [GSFix3D: diffusion-guided novel-view repair](https://arxiv.org/pdf/2508.14717)
