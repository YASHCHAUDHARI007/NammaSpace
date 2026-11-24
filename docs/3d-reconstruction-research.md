# 3D reconstruction research for Namma Space

Updated: 30 October 2026. This note extends the [Matterport study](namma-space-matterport-research.md), [capture SOP](capture-sop.md), [reconstruction workflow](reconstruction-workflow.md), and [real-scan pilot guide](real-scan-pilot.md).

## Scope and source status

The [Namma Space brief](https://techfest.org/media/compiProbStatement/Namma_Space.docx_2_compressed.pdf) was supplied for this research. The PDF did not load in the research tools during this pass. The earlier [Matterport study](namma-space-matterport-research.md#5-product-requirements-and-implications-for-namma-space) records its Round 1 requirements: a phone capture procedure, automatic reconstruction of a photorealistic indoor space, and continuous browser roaming with WASD and mouse look. The [official Techfest description](https://techfest.org/competitions/hack-aI/register) also describes smartphone captures, digital twins, virtual walkthroughs, POI search, and indoor paths. Treat the earlier PDF summary as project evidence until the PDF can be checked directly again. This note does not claim a judging rubric or a new deadline.

The repository already has a browser loader for `.glb` and standard 32-byte `.splat`, first-person controls, and explicit collision proxies. The generated fixtures are separate from the [real Sony camera pilot](classroom-capture-pilot-2026-10-30.md). That pilot proves one captured-room pipeline with estimated metric scale and a walkable aisle. A phone capture and measured room bounds remain open.

## What the methods actually produce

| Route | Output and strength | Main limit for this project | Use |
| --- | --- | --- | --- |
| Structure-from-Motion (SfM) + Multi-View Stereo (MVS) | [COLMAP](https://colmap.github.io/tutorial) estimates camera poses, dense points, and a surface mesh. Current COLMAP documentation also describes a separate [mesh texturing step](https://colmap.github.io/cli.html) that builds UVs and a texture atlas. A textured mesh can be converted to GLB for the current viewer. | Indoor blank walls, reflections, missed surfaces, and heavy dense reconstruction can reduce quality. A visual mesh still needs checked collision and floor data. | Best open-source mesh route when a continuous, inspectable surface is important. |
| 3D Gaussian Splatting (3DGS) | [Nerfstudio Splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html) trains a view-synthesis scene from aligned images. Its default configuration is documented at about 6 GB of GPU memory. A `.ply` export can be converted to the viewer's `.splat` format. | Splats are visual primitives, not a reliable walkable surface. They need separately measured bounds and obstacle proxies. Training and browser performance depend on the capture and hardware. | Best first choice for photographic appearance if a supported CUDA machine is ready. |
| NeRF / Nerfacto | Nerfstudio can train [Nerfacto and export geometry](https://docs.nerf.studio/quickstart/export_geometry.html). This gives a research route to a mesh and novel views. | It adds training and export steps; the resulting mesh still needs cleanup, scale, and browser checks. | A second-line experiment, not the shortest path to the current viewer. |
| Feed-forward geometry models | [VGGT](https://github.com/facebookresearch/vggt) predicts camera parameters, depth, points, and tracks, and can export a COLMAP-format sparse scene. | This is not a textured, collision-ready room asset by itself. The team has not tested its accuracy on its indoor capture; checkpoint terms also need review. | Investigate as a pose-estimation fallback if conventional SfM fails, after a real baseline exists. |
| Hosted phone scanning | [Polycam documents a GLB export workflow](https://learn.poly.cam/hc/en-us/articles/42497420365716-How-to-Optimize-Your-Captures-in-Blender). A hosted service can reduce local setup work. | Export access, processing time, data handling, and reproducibility depend on the service and account. The team must still show its own capture procedure, viewer, calibration, and attribution. | Time-sensitive fallback for obtaining a genuine GLB. Check export availability before relying on it. |

These are engineering choices, not measured rankings on this team's room. The original [3DGS paper](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) supports fast rendering after optimization; it does not show that phone capture, training, and deployment happen in real time. The [Matterport reference](namma-space-matterport-research.md) shows high-quality panoramic viewpoints and a mesh, but its sweep navigation is not the continuous movement required here.

## Recommended experiment

Capture **one small, static room** with a standard phone. Keep the raw capture, select sharp overlapping views, and record two physical reference distances. [COLMAP recommends](https://colmap.github.io/tutorial) high overlap, varied camera positions, similar light, and multiple views of each object. It specifically warns that pure camera rotation gives no triangulation baseline. The frame count, 4K setting, and overlap percentage in the current [capture SOP](capture-sop.md) are starting hypotheses, not validated thresholds for this room.

First, run the route that is already available to the team:

1. **CUDA machine ready:** process phone video with `ns-process-data video`, train `splatfacto`, export Gaussian PLY, convert it to `.splat`, then load it in Namma Space. Nerfstudio [requires camera poses](https://docs.nerf.studio/quickstart/custom_dataset.html) and uses COLMAP for ordinary images or video. Its [splat export is PLY](https://docs.nerf.studio/nerfology/methods/splat.html), not a ready-made Namma Space `.splat`. The [antimatter15 converter](https://github.com/antimatter15/splat/blob/main/convert.py) writes the 32-byte format accepted by the viewer. Keep the conversion script/version and the original PLY with the capture record.
2. **No working CUDA pipeline:** produce a **textured** mesh through COLMAP MVS plus texturing, or use a documented GLB export from a phone scanning service. Convert the textured mesh to a self-contained GLB, then load it. COLMAP's [CLI example](https://colmap.github.io/cli.html) shows `image_undistorter`, `patch_match_stereo`, `stereo_fusion`, meshing, and `mesh_texturer`. Check the installed COLMAP version before using that command; its current documentation describes a development version. [OpenMVS](https://github.com/cdcseacave/openMVS/blob/develop/docs/wiki/Usage.md) is another documented texturing route. [Blender's glTF exporter](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html) can package the final mesh and textures as GLB.

Do not infer scale or collision from the scene's appearance. Align the **asset and all navigation coordinates** to the same meter-based, Y-up frame. If the physical reference length is `L_m` meters and the corresponding unscaled asset segment is `L_u` units, use `scale = L_m / L_u`; then verify a second independent length. Mark the floor, wall limits, door openings, furniture boxes, spawn, and POI approach points in that frame. The current viewer uses [explicit room bounds and collider boxes](../src/viewer/sceneLoader.js); it does not derive them from mesh triangles or Gaussians. Follow the [real-scan pilot guide](real-scan-pilot.md) when registering a new scene.

## Evidence to collect before claiming success

| Check | Record |
| --- | --- |
| Capture and reconstruction | Room permission, phone/lens, raw capture date, selected frame count, registered frame count, tool versions, commands or service settings, output hash, and processing time. |
| Visual quality | Screenshots from viewpoints outside the training frames; visible holes, floaters, texture errors, and reflections. If a separate evaluation set is prepared, Nerfstudio supports [separate training and evaluation data](https://docs.nerf.studio/quickstart/custom_dataset.html) and [`ns-eval`](https://docs.nerf.studio/reference/cli/ns_eval.html). Image scores do not measure navigation safety. |
| Geometry and scale | At least two physical lengths and matching asset lengths; report each absolute and percentage error. Check floor height and a doorway from more than one viewpoint. |
| Roaming and routes | Demonstrate continuous camera motion through the reconstructed space; test contact with every wall and major object, door clearance, and a complete route to each POI. Compare collider wireframes with the actual surfaces. |
| Browser delivery | Asset bytes, first usable frame time, frame rate while moving, memory behavior, browser/device, and any failed decoder or network request. Test the exact deployed build. |

The acceptance thresholds must be set from a real pilot and intended devices. A synthetic scene, successful import, or green build alone does not establish reconstruction quality or metric accuracy.

## Decisions and risks

- **Keep 3DGS and collision separate.** A splat can look complete from one angle while hiding missing floors or walls. Use a measured walkable model and inspect it in the browser.
- **Keep mesh and splat exports distinct.** Nerfstudio's [Gaussian export produces PLY](https://docs.nerf.studio/nerfology/methods/splat.html). Its [Poisson mesh export](https://docs.nerf.studio/quickstart/export_geometry.html) requires a model that predicts normals, such as a suitable Nerfacto configuration. It is not a direct `splatfacto → GLB` step.
- **Credit actual tools and check licenses.** The [original Inria 3DGS code license](https://github.com/graphdeco-inria/gaussian-splatting/blob/main/LICENSE.md) limits use to research and evaluation without separate commercial permission. Avoid treating all implementations as having that license; check the exact tool and version used in the submission.
- **Do not promise an unmeasured processing time.** COLMAP notes that matching hundreds of images can take much longer than a few minutes, depending on setup and matching mode ([tutorial](https://colmap.github.io/tutorial)). Measure a complete capture-to-deployment run on the intended machine before making an on-site timing claim.

**Next concrete milestone:** repeat the [classroom pilot](classroom-capture-pilot-2026-10-30.md) with a phone capture. Measure the room and a second fixed reference, refine the collision proxies, and check visual quality and movement on the target device before claiming the phone requirement is met.
