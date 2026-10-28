# Reconstruction research and validation notes

Prepared: 23 November 2026  
Source reviewed: main at [8ef09eee6c2d426b94021265859ce5d6b6b9a9cd](https://github.com/YASHCHAUDHARI007/NammaSpace/tree/8ef09eee6c2d426b94021265859ce5d6b6b9a9cd).

This is a source review and a proposed validation plan. The observations below describe checked-in code and metadata; they are not new capture results, device benchmarks, or measurements of the physical venue.

## Representation choices

NammaSpace separates the visual reconstruction from the geometry used for movement and routing.

| Representation | Current role | What still needs separate validation |
| --- | --- | --- |
| Gaussian splats | The classroom registry points to `/scenes/nammaspace-classroom.ksplat`. The loader contains Spark-based rendering and a GaussianSplats3D implementation. | Physical scale, floor alignment, collision bounds, loading behaviour, and device performance. |
| glTF / GLB meshes | The loader supports polygonal reconstruction assets through GLTFLoader. | Whether surfaces are complete, appropriately scaled, and suitable for navigation. A renderable mesh alone does not establish walkability. |
| Generated floor model | A floor-plan preview can embed the registered classroom scan. Unscanned areas are generated geometry. | Agreement with the real building, doorway dimensions, obstacle placement, and the boundary between captured and generated areas. |

Relevant source: [scene registry](../src/config/scenes.js), [classroom configuration](../src/config/classroomScene.js), [scene loader](../src/viewer/sceneLoader.js).

The practical design decision is to keep appearance and navigation independently inspectable. A visually convincing reconstruction can still place a route through a desk; a correct route can still be overlaid on a badly aligned scan.

## Calibration findings

The classroom configuration records an assumed scale reference: a desk height of 0.75 m corresponding to 0.70 reconstruction units. It explicitly sets `referenceIsAssumed: true`. Treat the dimensions as configuration values until a physical reference is checked.

Before describing the model as metrically validated:

1. Measure a physical reference such as the actual desk height or a doorway width.
2. Record the same endpoints in reconstruction coordinates.
3. Record the scale transform and its direction rather than applying an unexplained multiplier.
4. Check at least one additional distance that was not used to choose the scale.
5. Verify the floor height, up axis, room orientation, spawn, colliders, and POI approach points together.

Changing visual scale without updating navigation data can misalign the camera and route. Preserve the transformation in a reproducible manifest.

## Coordinate systems and navigation

The floor navigator and the room viewer use related but distinct coordinate conventions. Room navigation uses horizontal X/Z coordinates with Y as height. Floor routes use two-dimensional plan coordinates; the route-description code treats positive plan y as south. Use [scanPlacement.js](../src/floor/scanPlacement.js) to convert between the two rather than copying coordinates by hand.

The floor grid defaults to 0.10 m cells and 0.25 m clearance. It builds a Dijkstra distance field from the start position, then reconstructs and smooths paths. The viewer's configured player radius is 0.36 m. These values belong to different parts of the implementation and should be reviewed together when assessing doorway or furniture clearance; they are not an accessibility certification.

Walking ETA is calculated from route length using 1.2 m/s. It is a modelled estimate, not a measured journey time for every user.

Relevant source: [grid](../src/floor/navGrid.js), [floor navigator](../src/floor/floorNavigator.js), [placement tests](../tests/scan-placement.test.js).

## Capture provenance to reconcile

The classroom metadata currently contains different capture counts in different fields:

- The reconstruction status mentions 1,038 frames.
- The capture-source description mentions 553 sampled video frames and 46 still images.

These may refer to different processing stages or revisions. The source does not establish that relationship. Reconcile them against the actual reconstruction logs before reusing either count in a report.

For each future reconstruction, keep a manifest containing:

| Group | Fields to record |
| --- | --- |
| Input | Capture date, room identifier, original filenames, SHA-256 checksums, camera/lens, source resolution and frame rate. |
| Sampling | Extraction command, frame selection rule, extracted count, rejected count, final training count, and rejection reasons. |
| Reconstruction | Tool and version, camera model, matching configuration, registered-image count, reprojection statistic and its definition, training settings, and output checksum. |
| Calibration | Measured reference, reconstruction reference, transform, up axis, origin, floor height, and independent distance checks. |
| Delivery | Asset format, byte size, renderer configuration, scene identifier, and the source commit that registers it. |

Keep large source footage outside Git when appropriate, but keep the manifest and a reproducible retrieval reference with the project.

## Proposed comparison protocol

Compare candidate reconstructions using the same held-out camera viewpoints and device conditions. Label the following results as pending until a run is performed.

| Question | Evidence to collect |
| --- | --- |
| Does it make the geometry plausible? | Inspect held-out viewpoints, missing surfaces, floating artifacts, doorway alignment, and known physical references. |
| Does it preserve appearance? | Capture the same viewpoints and lighting comparisons; record blur, exposure shifts, and view-dependent artifacts. |
| Does the navigation agree? | Check floor position, wall and furniture clearance, approach points, and route overlays against the physical layout. |
| Does it load and run acceptably? | Record asset bytes, time to first useful frame, device/browser, cache state, repeated runs, frame-time distribution, and available memory observations. |
| Is the process reproducible? | Keep the source manifest, tool versions, commands, output checksums, and a second rebuild or documented reason it could not be repeated. |

Do not compare a warm-cache desktop run with a cold-cache phone run as if the device were the only variable. Keep captured rooms and generated preview rooms labelled separately in screenshots and summaries.

## Follow-up work

- Confirm the assumed classroom scale with a physical measurement.
- Reconcile the capture counts in the scene metadata.
- Verify that scan transforms and obstacle clearances remain consistent across map and 3D navigation.
- Run and record the comparison protocol on representative desktop and mobile devices.
- Repeat capture and integration for a second room before generalising the workflow.

## Related documentation

- [Capture procedure](capture-sop.md)
- [Reconstruction workflow](reconstruction-workflow.md)
- [Real-scan pilot](real-scan-pilot.md)
- [Earlier Matterport research](namma-space-matterport-research.md)
