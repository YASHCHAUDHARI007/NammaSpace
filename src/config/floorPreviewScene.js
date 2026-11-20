/**
 * NAMMA SPACE — "Floor 1 (model)": a temporary walk-through of the whole floor.
 *
 * Geometry is generated from the measured floor plan (walls, doors, corridor, lift, stairs).
 * Unscanned rooms are furnished from the Room 504 layout; Room 504 shows its real Gaussian-splat
 * scan in place. Clearly marked as a preview (isReconstructed: false) until the other rooms are
 * scanned.
 */
import { DEFAULT_STANDING_HEIGHT } from './classroomScene.js';
import { FLOOR_1, FLOOR_MODEL_SCENE_ID } from '../floor/floor1.js';
import { buildFloorPreviewLayout, CEILING_HEIGHT } from '../floor/floorPreviewLayout.js';

export const FLOOR_PREVIEW_SCENE_ID = FLOOR_MODEL_SCENE_ID;

const layout = buildFloorPreviewLayout();
const b = layout.bounds;

const roomPoi = (room) => {
  const door = FLOOR_1.doors.find((d) => d.roomId === room.id);
  const cx = (room.rect.minX + room.rect.maxX) / 2;
  const cy = (room.rect.minY + room.rect.maxY) / 2;
  // Stand 1 m inside the doorway, looking into the room.
  const waypoint = [door.center[0] - door.outward[0], door.center[1] - door.outward[1]];
  const classroom = layout.classrooms.find((c) => c.roomId === room.id);
  const look = classroom ? classroom.screen.center : [cx, cy];
  return {
    id: room.id,
    name: room.name,
    category: room.id === 'room-504' ? 'Scanned classroom' : 'Classroom (model)',
    description: room.id === 'room-504'
      ? 'The real 3D scan of this classroom, placed on the floor.'
      : `${(room.rect.maxX - room.rect.minX).toFixed(1)} m × ${(room.rect.maxY - room.rect.minY).toFixed(1)} m, laid out like the scanned classroom until this room is scanned.`,
    position: [cx, 1.6, cy],
    waypoint,
    lookAt: [look[0], 1.3, look[1]]
  };
};

const pois = [
  ...FLOOR_1.rooms.map(roomPoi),
  {
    id: 'poi-lift',
    name: 'Lift',
    category: 'Vertical Access',
    description: 'Passenger lift in the lobby.',
    position: [21.75, 2.35, 5.44],
    waypoint: [21.3, 5.44],
    lookAt: [22.9, 1.3, 5.44]
  },
  {
    id: 'poi-stairs-north',
    name: 'Staircase (north flight)',
    category: 'Vertical Access',
    description: 'Stair flight on the north side of the lobby.',
    position: [23.0, 1.6, 3.7],
    waypoint: [19.9, 3.7],
    lookAt: [23.0, 1.0, 3.7]
  },
  {
    id: 'poi-stairs-south',
    name: 'Staircase (south flight)',
    category: 'Vertical Access',
    description: 'Stair flight on the south side of the lobby.',
    position: [23.0, 1.6, 7.0],
    waypoint: [19.9, 7.0],
    lookAt: [23.0, 1.0, 7.0]
  },
  {
    id: 'poi-corridor',
    name: 'Main Corridor',
    category: 'Common Area',
    description: 'North–south corridor linking every room.',
    position: [15.4, 1.6, 10.0],
    waypoint: [15.4, 10.0],
    lookAt: [15.4, 1.6, 0]
  }
];

export const FLOOR_PREVIEW_SCENE = {
  id: FLOOR_PREVIEW_SCENE_ID,
  name: 'Floor 1 (model)',
  shortLabel: 'Floor 1',
  mode: 'floor',
  sceneType: 'Floor-plan model',
  isReconstructed: false,
  isPreview: true,
  reconstructionStatus:
    'Temporary model generated from the measured floor plan. Rooms other than 504 are furnished from the Room 504 layout until they are scanned; Room 504 shows its real scan.',
  dimensionsLabel: `${(b.maxX - b.minX).toFixed(1)}m × ${(b.maxY - b.minY).toFixed(1)}m × ${CEILING_HEIGHT}m`,
  description:
    'Walk the whole floor: corridor, lobby, lift and stairs, with every classroom laid out like Room 504. Room 504 is the real scan.',
  layout,
  spawn: {
    // Lift lobby, facing west towards the corridor.
    position: [18.6, DEFAULT_STANDING_HEIGHT, 5.3],
    yaw: Math.PI / 2,
    pitch: -0.05
  },
  roomBounds: { minX: b.minX, maxX: b.maxX, minZ: b.minY, maxZ: b.maxY, floorY: 0, ceilingY: CEILING_HEIGHT },
  colliders: layout.colliders,
  pois
};
