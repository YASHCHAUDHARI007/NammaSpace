import test from 'node:test';
import assert from 'node:assert/strict';
import { scanToPlan, planToScan, scanBoxToPlanRect } from '../src/floor/scanPlacement.js';
import { FLOOR_1, FLOOR_1_SCANS, getFloor1Navigator, planPositionFromScan, scanPlacementForScene } from '../src/floor/floor1.js';
import { pointInRect } from '../src/floor/floorPlan.js';
import { SCENES } from '../src/config/scenes.js';

const close = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('scan ↔ plan transform round-trips for any rotation', () => {
  for (const rotationDeg of [0, 90, 180, 270, 37]) {
    const placement = { origin: [21.18, 14.82], rotationDeg };
    const p = [-2.4, 3.1];
    assert.ok(close(planToScan(placement, scanToPlan(placement, p)), p));
  }
  // 0°: scan −Z (stage) is north (smaller plan y); 180° flips it south.
  assert.ok(close(scanToPlan({ origin: [0, 0], rotationDeg: 0 }, [1, -2]), [1, -2]));
  assert.ok(close(scanToPlan({ origin: [0, 0], rotationDeg: 180 }, [1, -2]), [-1, 2]));
  const r = scanBoxToPlanRect({ origin: [0, 0], rotationDeg: 90 }, { minX: 0, maxX: 2, minZ: 0, maxZ: 1 });
  assert.ok(close([r.minX, r.maxX, r.minY, r.maxY], [-1, 0, 0, 2]));
});

test('classroom scan is placed in room 504 and its whole footprint fits the room', () => {
  const placement = scanPlacementForScene('nammaspace-classroom');
  assert.ok(placement);
  const room = FLOOR_1.rooms.find((r) => r.id === placement.roomId);
  assert.equal(room.number, '504');
  const b = SCENES['nammaspace-classroom'].roomBounds;
  const footprint = scanBoxToPlanRect(placement, { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ });
  for (const corner of [[footprint.minX, footprint.minY], [footprint.maxX, footprint.maxY]]) {
    assert.ok(pointInRect(corner, room.rect), `scan corner ${corner} outside room 504`);
  }
  assert.equal(FLOOR_1_SCANS.length, 1);
});

test('places marked in the scan are floor destinations reachable from the lobby', () => {
  const nav = getFloor1Navigator();
  const scanPois = nav.pois.filter((p) => p.kind === 'scan');
  assert.equal(scanPois.length, SCENES['nammaspace-classroom'].pois.length);
  for (const poi of scanPois) {
    assert.equal(poi.roomId, 'room-504');
    const route = nav.route(nav.defaultStart, poi);
    assert.ok(route, `no route to ${poi.name}`);
    assert.ok(route.steps.some((s) => /Classroom 504/.test(s.text)), `${poi.name} route never enters 504`);
  }
  assert.equal(nav.search('classroom')[0].poi.id, 'room-504');
  assert.equal(nav.search('stage')[0].poi.scan.poiId, 'poi-stage');
});

test('scan desks block the floor grid; the 3D camera maps to a walkable plan spot', () => {
  const nav = getFloor1Navigator();
  const desk = planPositionFromScan('nammaspace-classroom', -1.6, 0);
  assert.equal(nav.isWalkable(desk), false);
  const spawn = planPositionFromScan('nammaspace-classroom', '0.30', '4.47');
  assert.ok(close(spawn, [21.48, 19.29], 1e-6));
  assert.equal(FLOOR_1.regionAt(nav.snapToWalkable(spawn)).id, 'room-504');
  assert.equal(planPositionFromScan('not-a-scene', 0, 0), null);
});
