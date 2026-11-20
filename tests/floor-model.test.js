import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR_1 } from '../src/floor/floor1.js';
import { buildFloorPreviewLayout, furnishClassroom, roomFrame } from '../src/floor/floorPreviewLayout.js';
import { FLOOR_PREVIEW_SCENE } from '../src/config/floorPreviewScene.js';
import { CollisionSystem } from '../src/viewer/collision.js';
import { validateSceneConfig } from '../src/viewer/sceneLoader.js';

const layout = buildFloorPreviewLayout();
const pointIn = ([x, y], r) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;

test('floor model furnishes every unscanned room and leaves 504 to its real scan', () => {
  const furnished = layout.classrooms.map((c) => c.roomId).sort();
  assert.deepEqual(furnished, ['room-401', 'room-402', 'room-503', 'room-505']);
  assert.deepEqual(layout.scannedRooms.map((r) => r.roomId), ['room-504']);
  for (const c of layout.classrooms) {
    const room = FLOOR_1.rooms.find((r) => r.id === c.roomId);
    assert.ok(c.desks.length >= 8, `${c.roomId} has only ${c.desks.length} desks`);
    for (const d of c.desks) assert.ok(pointIn(d.position, room.rect), `${c.roomId} desk outside room`);
    assert.ok(pointIn(c.screen.center, room.rect));
  }
});

test('stage is at the end of the room away from the door, like 504', () => {
  for (const room of FLOOR_1.rooms) {
    const door = FLOOR_1.doors.find((d) => d.roomId === room.id);
    const f = roomFrame(room, door);
    const [, doorV] = f.toLocal(door.center);
    assert.ok(doorV > f.length / 2 - 0.5, `${room.number}: door at v=${doorV.toFixed(1)} of ${f.length.toFixed(1)}`);
  }
  // Round trip of the room frame.
  const room = FLOOR_1.rooms[0];
  const f = roomFrame(room, null);
  const p = f.toPlan(1.2, 3.4);
  const [u, v] = f.toLocal(p);
  assert.ok(Math.abs(u - 1.2) < 1e-9 && Math.abs(v - 3.4) < 1e-9);
});

test('doorways stay open: walls are not thickened into the door gaps', () => {
  const collision = new CollisionSystem(FLOOR_PREVIEW_SCENE);
  for (const d of FLOOR_1.doors) {
    const inside = [d.center[0] - d.outward[0] * 0.8, d.center[1] - d.outward[1] * 0.8];
    const outside = [d.center[0] + d.outward[0] * 0.8, d.center[1] + d.outward[1] * 0.8];
    assert.ok(collision.isSegmentWalkable(outside, inside, 0.36), `door ${d.id} is blocked`);
  }
});

test('floor model scene validates and is labelled a temporary preview', () => {
  assert.doesNotThrow(() => validateSceneConfig(FLOOR_PREVIEW_SCENE));
  assert.equal(FLOOR_PREVIEW_SCENE.isReconstructed, false);
  assert.equal(FLOOR_PREVIEW_SCENE.isPreview, true);
  assert.equal(furnishClassroom(FLOOR_1.rooms[0], FLOOR_1.doors[0]).roomId, 'room-401');
});
