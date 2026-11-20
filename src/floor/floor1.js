/**
 * NAMMA SPACE — Floor 1 (venue floor captured on 26 Nov)
 *
 * The sketch gives rooms, doors, walls, stairs and the lift. This file adds what the sketch cannot
 * express: the outline of the shared walkable space, named zones for turn-by-turn instructions,
 * room labels/aliases for search, and extra points of interest.
 *
 * Coordinates: plan metres, +x east, +y south.
 */
import { FLOOR_1_SKETCH } from './floor1Sketch.js';
import { buildFloorModel } from './floorPlan.js';
import { FloorNavigator } from './floorNavigator.js';
import { buildScanPois, scanBoxToPlanRect, scanToPlan } from './scanPlacement.js';
import { CLASSROOM_SCENE } from '../config/classroomScene.js';

const SCANNED_SCENES = { [CLASSROOM_SCENE.id]: CLASSROOM_SCENE };

export const FLOOR_1_ANNOTATIONS = {
  name: 'Namma Space — Floor 1',
  level: 1,
  // Walled boundary of corridor + lobby + passage to 503 (traced from the sketch's wall items).
  outlines: [
    [
      [14.0, 22.01], [14.0, -21.64], [5.33, -21.64], [5.33, -24.95], [16.7, -24.95],
      [16.86, 2.93], [25.53, 2.93], [25.53, 7.63], [16.83, 7.63], [16.83, 22.01]
    ]
  ],
  zones: [
    {
      id: 'zone-corridor',
      name: 'Main Corridor',
      walkable: true,
      polygon: [[14.0, 22.01], [16.83, 22.01], [16.83, 2.93], [16.86, 2.93], [16.7, -21.64], [14.0, -21.64]]
    },
    {
      id: 'zone-lobby',
      name: 'Lift Lobby',
      walkable: true,
      polygon: [[16.86, 2.93], [25.53, 2.93], [25.53, 7.63], [16.83, 7.63]]
    },
    {
      id: 'zone-passage',
      name: 'Passage to 503',
      walkable: true,
      polygon: [[5.33, -21.64], [16.7, -21.64], [16.7, -24.95], [5.33, -24.95]]
    },
    {
      id: 'zone-restricted',
      name: 'Restricted Area',
      walkable: false,
      polygon: [[16.9, -24.96], [25.53, -24.96], [25.53, 2.9], [16.9, 2.9]]
    }
  ],
  rooms: {
    '401': { aliases: ['four zero one', 'r401'], category: 'Room' },
    '402': { aliases: ['four zero two', 'r402'], category: 'Room' },
    '503': { aliases: ['five zero three', 'r503'], category: 'Room' },
    '504': { name: 'Classroom 504', aliases: ['five zero four', 'r504', 'classroom', 'class room', 'lecture room'], category: 'Classroom' },
    '505': { aliases: ['five zero five', 'r505', 'long hall'], category: 'Room' }
  },
  // Extra destinations. `at` is the routing target (a walkable spot in front of the feature).
  pois: [
    {
      id: 'poi-lift',
      name: 'Lift',
      category: 'Vertical Access',
      aliases: ['elevator', 'lift lobby'],
      description: 'Passenger lift in the lobby.',
      position: [22.9, 5.44],
      at: [21.35, 5.44]
    },
    {
      id: 'poi-stairs-north',
      name: 'Staircase (north flight)',
      category: 'Vertical Access',
      aliases: ['stairs', 'staircase', 'steps', 'exit'],
      description: 'Stair flight on the north side of the lobby.',
      position: [23.0, 3.7],
      at: [20.1, 3.7]
    },
    {
      id: 'poi-stairs-south',
      name: 'Staircase (south flight)',
      category: 'Vertical Access',
      aliases: ['stairs', 'staircase', 'steps', 'exit'],
      description: 'Stair flight on the south side of the lobby.',
      position: [23.0, 7.0],
      at: [20.1, 7.0]
    },
    {
      id: 'poi-lobby',
      name: 'Lift Lobby',
      category: 'Common Area',
      aliases: ['lobby', 'entrance', 'reception', 'start'],
      description: 'Arrival lobby beside the lift and stairs.',
      position: [18.6, 5.3],
      at: [18.6, 5.3]
    },
    {
      id: 'poi-corridor',
      name: 'Main Corridor',
      category: 'Common Area',
      aliases: ['corridor', 'hallway', 'hall'],
      description: 'North–south corridor linking every room.',
      position: [15.4, 10.0],
      at: [15.4, 10.0]
    }
  ],
  defaultStartPoiId: 'poi-lobby',
  // 3D scans pinned into rooms. origin = where the scan's (0, 0) sits on the plan; rotationDeg 0
  // would put the scan's −Z (the stage) to the north. The room is 8.7 m × 14.4 m and the scan
  // 8.1 m × 13.7 m, so only 0° or 180° fit. 180°: stage at the south end beside the door (on the
  // corridor wall), BUILD mural / tiers at the north end.
  scans: [
    {
      sceneId: 'nammaspace-classroom',
      roomNumber: '504',
      label: 'Classroom 504',
      origin: [21.18, 14.82],
      rotationDeg: 180,
      // Scan colliders that also block walking on the plan (desk blocks). The stage and tiers are
      // full-width steps people can still stand on, so they stay walkable.
      obstacleIds: ['desks-left', 'desks-right']
    }
  ]
};

export const FLOOR_1 = buildFloorModel(FLOOR_1_SKETCH, FLOOR_1_ANNOTATIONS);

/** Scan placements resolved against the floor model (room id attached). */
export const FLOOR_1_SCANS = FLOOR_1_ANNOTATIONS.scans
  .map((placement) => {
    const room = FLOOR_1.rooms.find((r) => r.number === placement.roomNumber);
    const scene = SCANNED_SCENES[placement.sceneId];
    return room && scene ? { ...placement, roomId: room.id, scene } : null;
  })
  .filter(Boolean);

export const scanPlacementForScene = (sceneId) => FLOOR_1_SCANS.find((s) => s.sceneId === sceneId) || null;
export const scanPlacementForRoom = (roomId) => FLOOR_1_SCANS.find((s) => s.roomId === roomId) || null;

/** Scene id of the temporary whole-floor 3D model (its world frame is the plan frame). */
export const FLOOR_MODEL_SCENE_ID = 'floor-1-model';

/** Plan position of a camera inside a placed scan, or null when the scene is not on this floor. */
export function planPositionFromScan(sceneId, x, z) {
  if (sceneId === FLOOR_MODEL_SCENE_ID) return [Number(x), Number(z)];
  const placement = scanPlacementForScene(sceneId);
  return placement ? scanToPlan(placement, [Number(x), Number(z)]) : null;
}

const scanPois = FLOOR_1_SCANS.flatMap((s) => buildScanPois(s, s.scene, s.roomId));
const scanObstacles = FLOOR_1_SCANS.flatMap((s) =>
  (s.scene.colliders || [])
    .filter((c) => s.obstacleIds?.includes(c.id))
    .map((c) => scanBoxToPlanRect(s, c))
);

let floor1Navigator = null;
/** Shared navigator (grid + search index) built on first use and reused by every UI surface. */
export const getFloor1Navigator = () =>
  (floor1Navigator ??= new FloorNavigator(
    FLOOR_1,
    { ...FLOOR_1_ANNOTATIONS, pois: [...FLOOR_1_ANNOTATIONS.pois, ...scanPois] },
    { obstacles: scanObstacles }
  ));
