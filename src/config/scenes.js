/**
 * NAMMA SPACE — Scene Configuration Registry
 *
 * Architectural Separation Note:
 * - `mode: 'demo'` uses procedural Three.js geometry (`src/viewer/createScene.js`) strictly as a
 *   baseline test environment for controls, collision physics, and Round 2 wayfinding hooks.
 *   It is NEVER misrepresented as AI-reconstructed output.
 * - `mode: 'glb'` loads external polygon mesh reconstructions (.glb / .gltf) via Three.js GLTFLoader.
 * - `mode: 'splat'` loads external 3D Gaussian Splat captures (.splat / .ply) via the Gaussian Splat
 *   pipeline with a separate proxy collision layout (since splats are volumetric Gaussians without mesh faces).
 */

export const DEFAULT_STANDING_HEIGHT = 1.68; // meters (average human eye level)
export const PLAYER_RADIUS = 0.36; // meters horizontal collision cylinder radius

export const SCENES = {
  'demo-studio': {
    id: 'demo-studio',
    name: 'Namma Studio — Procedural Baseline',
    shortLabel: 'Demo Baseline (Procedural)',
    mode: 'demo',
    sceneType: 'Procedural Three.js Baseline',
    reconstructionStatus: 'Manual Reference Geometry (Not AI-Reconstructed)',
    isReconstructed: false,
    assetUrl: null,
    dimensionsLabel: '10.0m × 8.0m × 3.2m',
    description:
      'A full-scale architectural reference interior built with procedural Three.js geometry to validate first-person kinematics, AABB wall/furniture collision, and obstacle-aware A* pathfinding prior to importing smartphone scans.',
    spawn: {
      position: [0, DEFAULT_STANDING_HEIGHT, 3.1],
      yaw: 0,
      pitch: -0.04
    },
    roomBounds: {
      minX: -4.85,
      maxX: 4.85,
      minZ: -3.85,
      maxZ: 3.85,
      floorY: 0,
      ceilingY: 3.2
    },
    // Explicit AABB collision boxes (meters, world space)
    colliders: [
      {
        id: 'work-table',
        label: 'Collaborative Dining & Work Table',
        minX: -3.75,
        maxX: -1.65,
        minY: 0,
        maxY: 0.82,
        minZ: -2.35,
        maxZ: -0.85
      },
      {
        id: 'lounge-sofa-main',
        label: 'Modular Lounge Sofa',
        minX: 1.35,
        maxX: 3.85,
        minY: 0,
        maxY: 0.9,
        minZ: -2.75,
        maxZ: -1.65
      },
      {
        id: 'lounge-sofa-chaise',
        label: 'Sofa Chaise Extension',
        minX: 2.85,
        maxX: 3.85,
        minY: 0,
        maxY: 0.9,
        minZ: -1.65,
        maxZ: -0.45
      },
      {
        id: 'coffee-table',
        label: 'Low Timber Coffee Table',
        minX: 1.65,
        maxX: 2.55,
        minY: 0,
        maxY: 0.45,
        minZ: -1.15,
        maxZ: -0.45
      },
      {
        id: 'storage-cabinet',
        label: 'Credenza & Archive Cabinet',
        minX: -4.85,
        maxX: -4.05,
        minY: 0,
        maxY: 1.95,
        minZ: 0.25,
        maxZ: 2.65
      },
      {
        id: 'media-console',
        label: 'East Wall Spatial Display Console',
        minX: 4.15,
        maxX: 4.85,
        minY: 0,
        maxY: 0.72,
        minZ: 0.65,
        maxZ: 2.75
      },
      {
        id: 'center-pedestal',
        label: 'Architectural Model Pedestal',
        minX: -0.35,
        maxX: 0.35,
        minY: 0,
        maxY: 1.15,
        minZ: -0.35,
        maxZ: 0.35
      }
    ],
    // Round 2 Extension: Searchable Points of Interest & Wayfinding Targets
    pois: [
      {
        id: 'poi-worktable',
        name: 'Collaborative Work & Dining Table',
        category: 'Workspace',
        description: 'Solid oak studio table with task lighting and seating for four.',
        position: [-2.7, 1.15, -1.6],
        waypoint: [-2.7, -0.25],
        lookAt: [-2.7, 0.85, -1.6]
      },
      {
        id: 'poi-sofa',
        name: 'Forest Lounge & Reading Zone',
        category: 'Seating',
        description: 'Upholstered L-shaped sofa and low coffee table in the northeast corner.',
        position: [2.4, 1.1, -2.1],
        waypoint: [2.0, 0.25],
        lookAt: [2.4, 0.65, -1.8]
      },
      {
        id: 'poi-cabinet',
        name: 'Material Archive & Storage Cabinet',
        category: 'Storage',
        description: 'Full-height walnut credenza and sample storage along the west wall.',
        position: [-4.35, 1.45, 1.45],
        waypoint: [-3.35, 1.45],
        lookAt: [-4.45, 1.1, 1.45]
      },
      {
        id: 'poi-pedestal',
        name: 'Central Digital Twin Plinth',
        category: 'Exhibition',
        description: 'Central inspection plinth showcasing LiDAR/Photogrammetry coordinate axes.',
        position: [0, 1.35, 0],
        waypoint: [0, 1.25],
        lookAt: [0, 0.95, 0]
      },
      {
        id: 'poi-console',
        name: 'East Telemetry Console',
        category: 'Equipment',
        description: 'Low media credenza and calibration wall board in the southeast alcove.',
        position: [4.4, 1.15, 1.7],
        waypoint: [3.35, 1.7],
        lookAt: [4.45, 0.9, 1.7]
      }
    ]
  },

  'reconstructed-glb': {
    id: 'reconstructed-glb',
    name: 'Sample Room — GLB Mesh Pipeline',
    shortLabel: 'Mesh Mode (.glb Asset)',
    mode: 'glb',
    sceneType: 'glTF 2.0 Binary Mesh (.glb)',
    reconstructionStatus: 'Generated demonstration mesh; capture provenance unverified',
    isReconstructed: false,
    assetUrl: '/models/sample-room-scan.glb',
    dimensionsLabel: '8.0m × 7.0m × 3.0m',
    description:
      'Loads the included generated GLB demonstration mesh via Three.js GLTFLoader. Replace it with a measured capture and calibrate collision proxies before using navigation.',
    spawn: {
      position: [0, DEFAULT_STANDING_HEIGHT, 2.5],
      yaw: 0,
      pitch: -0.05
    },
    roomBounds: {
      minX: -3.8,
      maxX: 3.8,
      minZ: -3.3,
      maxZ: 3.3,
      floorY: 0,
      ceilingY: 3.0
    },
    colliders: [
      {
        id: 'glb-center-table',
        label: 'Scanned Conference Table',
        minX: -1.3,
        maxX: 1.3,
        minY: 0,
        maxY: 0.85,
        minZ: -0.9,
        maxZ: 0.5
      },
      {
        id: 'glb-side-cabinet',
        label: 'Scanned Storage Unit',
        minX: -3.8,
        maxX: -2.9,
        minY: 0,
        maxY: 1.8,
        minZ: -1.8,
        maxZ: 1.2
      }
    ],
    pois: [
      {
        id: 'poi-glb-table',
        name: 'Scanned Center Table',
        category: 'Reconstructed Mesh',
        description: 'Primary table mesh loaded from /models/sample-room-scan.glb.',
        position: [0, 1.15, -0.2],
        waypoint: [0, 1.35],
        lookAt: [0, 0.75, -0.2]
      },
      {
        id: 'poi-glb-cabinet',
        name: 'West Wall Credenza Mesh',
        category: 'Reconstructed Mesh',
        description: 'Reconstructed cabinet geometry with proxy AABB collision volume.',
        position: [-3.2, 1.35, -0.3],
        waypoint: [-2.1, -0.3],
        lookAt: [-3.3, 0.9, -0.3]
      }
    ]
  },

  'reconstructed-splat': {
    id: 'reconstructed-splat',
    name: 'Sample Room — 3D Gaussian Splat Pipeline',
    shortLabel: 'Gaussian Splat Mode (.splat)',
    mode: 'splat',
    sceneType: '3D Gaussian Splatting (.splat)',
    reconstructionStatus: 'Synthetic demonstration splats; not a smartphone reconstruction',
    isReconstructed: false,
    assetUrl: '/scenes/sample-capture.splat',
    dimensionsLabel: '8.0m × 7.0m × 3.0m',
    description:
      'Loads the included synthetic .splat fixture with an example proxy floor plan. Replace it with a measured capture and calibrate proxies before using navigation.',
    spawn: {
      position: [0, DEFAULT_STANDING_HEIGHT, 2.5],
      yaw: 0,
      pitch: -0.04
    },
    roomBounds: {
      minX: -3.8,
      maxX: 3.8,
      minZ: -3.3,
      maxZ: 3.3,
      floorY: 0,
      ceilingY: 3.0
    },
    colliders: [
      {
        id: 'splat-proxy-island',
        label: 'Proxy Collision Volume (Center Table)',
        minX: -1.1,
        maxX: 1.1,
        minY: 0,
        maxY: 0.9,
        minZ: -0.8,
        maxZ: 0.6
      }
    ],
    pois: [
      {
        id: 'poi-splat-core',
        name: 'Gaussian Splat Focal Cluster',
        category: 'Radiance Field',
        description: '3D anisotropic Gaussian splat point cloud with proxy collision bounds.',
        position: [0, 1.2, -0.1],
        waypoint: [0, 1.5],
        lookAt: [0, 0.8, -0.1]
      }
    ]
  }
};

export const DEFAULT_SCENE_ID = 'demo-studio';

export function getSceneConfig(sceneId) {
  return SCENES[sceneId] || SCENES[DEFAULT_SCENE_ID];
}

export function getSceneList() {
  return Object.values(SCENES);
}
