/**
 * NAMMA SPACE — Room 504 classroom: the real Gaussian-splat reconstruction.
 * Kept in its own module so the floor model can place it without importing the whole registry.
 */
// Matches the capture height (Namma Shoot Plan pass A1); a higher eye shows splat ghosting on near furniture.
export const DEFAULT_STANDING_HEIGHT = 1.5; // meters
export const PLAYER_RADIUS = 0.36; // meters horizontal collision cylinder radius

export const CLASSROOM_SCENE = {
  id: 'nammaspace-classroom',
  name: 'Classroom',
  shortLabel: 'Classroom',
  mode: 'splat',
  sceneType: 'Gaussian splat',
  reconstructionStatus:
    'Reconstructed from on-site footage: COLMAP 4.2 poses (1,038 frames, 0.73 px reprojection) + gsplat MCMC training (40k steps, 2400 px, depth-regularised, anti-aliased, bilateral-grid exposure correction)',
  isReconstructed: true,
  assetUrl: '/scenes/nammaspace-classroom.ksplat',
  // View-dependent colour (spherical harmonics) for realistic sheen on walls, screen and floor.
  sphericalHarmonicsDegree: 1,
  dimensionsLabel: '8.2m × 13.7m × 2.85m',
  description:
    'Tiered classroom with a raised stage and projector screen, two desk blocks split by a centre aisle, and stepped seating under the BUILD mural.',
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
};
