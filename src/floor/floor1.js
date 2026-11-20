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
    '504': { aliases: ['five zero four', 'r504'], category: 'Room' },
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
  defaultStartPoiId: 'poi-lobby'
};

export const FLOOR_1 = buildFloorModel(FLOOR_1_SKETCH, FLOOR_1_ANNOTATIONS);
