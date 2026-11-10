/**
 * NAMMA SPACE — Scene Configuration Registry
 *
 * Only real reconstructions are registered here, so the viewer lists only rendered rooms.
 * Synthetic test scenes live in `fixtureScenes.js` and are used by the test suite only.
 *
 * Architectural Separation Note:
 * - `mode: 'demo'` uses procedural Three.js geometry (`src/viewer/createScene.js`) strictly as a
 *   baseline test environment for controls, collision physics, and Round 2 wayfinding hooks.
 *   It is NEVER misrepresented as AI-reconstructed output.
 * - `mode: 'glb'` loads external polygon mesh reconstructions (.glb / .gltf) via Three.js GLTFLoader.
 * - `mode: 'splat'` loads standard 32-byte 3D Gaussian Splat assets (.splat) via the Gaussian Splat
 *   pipeline with a separate proxy collision layout (since splats are volumetric Gaussians without mesh faces).
 */

export const DEFAULT_STANDING_HEIGHT = 1.68; // meters (average human eye level)
export const PLAYER_RADIUS = 0.36; // meters horizontal collision cylinder radius

export const SCENES = {
  'nammaspace-classroom': {
    id: 'nammaspace-classroom',
    name: 'NammaSpace Classroom — Gaussian Splat Scan',
    shortLabel: 'Classroom Scan (.splat)',
    mode: 'splat',
    sceneType: '3D Gaussian Splatting (.splat)',
    reconstructionStatus:
      'Reconstructed from on-site footage: COLMAP 4.2 poses (597/599 frames, 0.62 px reprojection) + Brush 0.3 splat training',
    isReconstructed: true,
    assetUrl: '/scenes/nammaspace-classroom.splat',
    dimensionsLabel: '8.2m × 13.7m × 2.85m',
    description:
      'Tiered classroom with a raised stage and projector screen at the front, two desk blocks split by a centre aisle, and the BUILD mural above the stepped seating at the back. Captured with 9 handheld 4K clips and 46 stills.',
    calibration: {
      captureSource:
        'nammaspace-videos&photos: C5304–C5312.MP4 (4K, sampled at 2 fps → 553 frames) + DSC01816–DSC01861.JPG (46 stills)',
      originDescription:
        'Centre of the room footprint on the main (lower) floor; -Z points to the stage/projector screen, +Z to the BUILD mural tiers.',
      upAxis: 'Y',
      metersPerAssetUnit: 1,
      // Scale is set from the desk-top plane (0.70 COLMAP units above the floor) using a standard
      // 0.75 m desk height. It is an assumed reference, not a tape measurement; cross-checks:
      // camera height ≈ 1.35 m, ceiling ≈ 2.85 m. Tape-measure one desk to confirm.
      referenceDistanceMeters: 0.75,
      referenceDistanceAssetUnits: 0.7,
      referenceIsAssumed: true
    },
    spawn: {
      // Back of the centre aisle, facing the stage.
      position: [0.3, DEFAULT_STANDING_HEIGHT, 4.47],
      yaw: 0,
      pitch: -0.08
    },
    roomBounds: {
      minX: -4.05,
      maxX: 4.05,
      minZ: -6.85,
      maxZ: 6.85,
      floorY: 0,
      ceilingY: 2.85
    },
    colliders: [
      {
        id: 'desks-left',
        label: 'Left Desk & Chair Block',
        minX: -2.95,
        maxX: -0.25,
        minY: 0,
        maxY: 0.95,
        minZ: -3.5,
        maxZ: 4.0
      },
      {
        id: 'desks-right',
        label: 'Right Desk & Chair Block',
        minX: 0.85,
        maxX: 2.95,
        minY: 0,
        maxY: 0.95,
        minZ: -3.5,
        maxZ: 4.0
      },
      {
        id: 'stage',
        label: 'Raised Stage (≈0.3 m)',
        minX: -4.05,
        maxX: 4.05,
        minY: 0,
        maxY: 0.35,
        minZ: -6.85,
        maxZ: -5.15
      },
      {
        id: 'tiered-seating',
        label: 'Stepped Seating Tiers',
        minX: -4.05,
        maxX: 4.05,
        minY: 0,
        maxY: 1.2,
        minZ: 4.95,
        maxZ: 6.85
      }
    ],
    pois: [
      {
        id: 'poi-stage',
        name: 'Stage & Projector Screen',
        category: 'Teaching',
        description: 'Raised lecture stage with the projector screen, podium and whiteboard.',
        position: [0, 1.6, -6.2],
        waypoint: [0.3, -4.45],
        lookAt: [0, 1.5, -6.8]
      },
      {
        id: 'poi-build-wall',
        name: 'BUILD Mural & Stepped Seating',
        category: 'Seating',
        description: 'Tiered steps with floor cushions below the BUILD wall graphic.',
        position: [0, 1.6, 5.8],
        waypoint: [-3.5, 4.45],
        lookAt: [0, 1.4, 6.6]
      },
      {
        id: 'poi-desks-left',
        name: 'Left Desk Block',
        category: 'Workspace',
        description: 'Rows of white trapezoid desks with grey shell chairs, left of the centre aisle.',
        position: [-1.6, 1.2, 0],
        waypoint: [-3.5, 0],
        lookAt: [-1.6, 0.75, 0]
      },
      {
        id: 'poi-desks-right',
        name: 'Right Desk Block',
        category: 'Workspace',
        description: 'Rows of white trapezoid desks with grey shell chairs, right of the centre aisle.',
        position: [1.9, 1.2, 0],
        waypoint: [3.5, 0],
        lookAt: [1.9, 0.75, 0]
      }
    ]
  }
};

export const DEFAULT_SCENE_ID = 'nammaspace-classroom';

export function getSceneConfig(sceneId) {
  return SCENES[sceneId] || SCENES[DEFAULT_SCENE_ID];
}

export function getSceneList() {
  return Object.values(SCENES);
}
