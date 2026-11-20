import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR_1, FLOOR_1_ANNOTATIONS } from '../src/floor/floor1.js';
import { FLOOR_1_SKETCH } from '../src/floor/floor1Sketch.js';
import { buildFloorModel, distanceToSegment } from '../src/floor/floorPlan.js';
import { NavGrid } from '../src/floor/navGrid.js';
import { FloorNavigator, describeRoute } from '../src/floor/floorNavigator.js';
import { SpatialIndex } from '../src/floor/spatialIndex.js';
import { searchPois, editDistance } from '../src/floor/search.js';

const nav = new FloorNavigator(FLOOR_1, FLOOR_1_ANNOTATIONS);
const poi = (id) => nav.pois.find((p) => p.id === id);

test('floor plan import: five rooms, every door snapped onto its room wall', () => {
  assert.deepEqual(FLOOR_1.rooms.map((r) => r.number).sort(), ['401', '402', '503', '504', '505']);
  assert.equal(FLOOR_1.doors.length, 5);
  for (const door of FLOOR_1.doors) {
    const room = FLOOR_1.rooms.find((r) => r.id === door.roomId);
    const { minX, maxX, minY, maxY } = room.rect;
    const onWall = [minX, maxX].some((x) => Math.abs(door.center[0] - x) < 1e-6) ||
      [minY, maxY].some((y) => Math.abs(door.center[1] - y) < 1e-6);
    assert.ok(onWall, `${door.id} sits on a wall of ${room.number}`);
  }
  assert.throws(() => buildFloorModel({ ...FLOOR_1_SKETCH, unit: 'ft' }), /metres/);
});

test('rotated stair block keeps its footprint when the sketch rotates it a quarter turn', () => {
  const stairs = FLOOR_1.blocks.find((b) => b.id === 'block-t55ssrt');
  assert.ok(Math.abs(stairs.rect.maxX - stairs.rect.minX - 1.56) < 1e-6);
  assert.ok(Math.abs(stairs.rect.maxY - stairs.rect.minY - 1.86) < 1e-6);
});

test('walls are cut open at doorways and nowhere else', () => {
  for (const door of FLOOR_1.doors) {
    const nearest = Math.min(...FLOOR_1.walls.map((w) => distanceToSegment(door.center, w.a, w.b)));
    assert.ok(nearest >= door.width / 2 - 0.02, `doorway ${door.id} is open (${nearest.toFixed(2)} m)`);
  }
  const grid = nav.grid;
  // Middle of the solid wall between 401 and the corridor is blocked.
  assert.equal(grid.isPointWalkable([14.0, 10.0]), false);
  // Restricted area, lift and stair blocks are never walkable.
  assert.equal(grid.isPointWalkable([21, -10]), false);
  assert.equal(grid.isPointWalkable([22.9, 5.44]), false);
  assert.equal(grid.isPointWalkable([23, 3.7]), false);
});

test('routes go through doorways and never cross a wall or obstacle', () => {
  const field = nav.grid.distanceField(nav.defaultStart);
  for (const room of FLOOR_1.rooms) {
    const route = nav.route(nav.defaultStart, poi(room.id));
    assert.ok(route, `route to ${room.number}`);
    for (let i = 1; i < route.points.length; i++) {
      const [a, b] = [route.points[i - 1], route.points[i]];
      for (const w of FLOOR_1.walls) {
        // Each leg keeps the player clearance from every wall except at its endpoints.
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        assert.ok(distanceToSegment(mid, w.a, w.b) > 0.2, `leg ${i} to ${room.number} clear of walls`);
      }
    }
    const straight = Math.hypot(route.points.at(-1)[0] - nav.defaultStart[0], route.points.at(-1)[1] - nav.defaultStart[1]);
    assert.ok(route.distanceMeters >= straight - 1e-6, 'walking distance is never shorter than straight-line');
    assert.ok(Math.abs(nav.grid.distanceTo(field, poi(room.id).at) - route.distanceMeters) < 2, 'field agrees with path length');
  }
});

test('lobby to 503 runs down the corridor and through the passage, with turn-by-turn steps', () => {
  const route = nav.route(nav.defaultStart, poi('room-503'));
  assert.ok(route.distanceMeters > 35 && route.distanceMeters < 45);
  const texts = route.steps.map((s) => s.text);
  assert.match(texts[0], /^Head /);
  assert.ok(texts.some((t) => /Main Corridor/.test(t)));
  assert.ok(texts.some((t) => /Passage to 503/.test(t)));
  assert.equal(texts.at(-1), 'Arrive at Room 503');
  assert.equal(route.etaSeconds, Math.round(route.distanceMeters / 1.2));
});

test('turn direction follows the plan axes (+y is south)', () => {
  const steps = describeRoute(FLOOR_1, [[15, 10], [15, 5], [20, 5]], 'X'); // north, then east
  assert.equal(steps[1].side, 'right');
  const left = describeRoute(FLOOR_1, [[15, 10], [15, 5], [10, 5]], 'X'); // north, then west
  assert.equal(left[1].side, 'left');
});

test('search: room numbers, aliases, typos and "nearest" queries', () => {
  assert.equal(nav.search('503')[0].poi.id, 'room-503');
  assert.equal(nav.search('elevator')[0].poi.id, 'poi-lift');
  assert.equal(nav.search('elevatr')[0].poi.id, 'poi-lift');
  const stairs = nav.search('nearest stairs');
  assert.ok(stairs.length >= 2 && stairs.every((r) => r.poi.category === 'Vertical Access'));
  assert.ok(stairs[0].distance <= stairs[1].distance);
  assert.equal(nav.search('401 door')[0].poi.id, 'door-ffarrax');
  assert.equal(nav.search('zzzz').length, 0);
  // Equal text matches are ordered by walking distance from where you stand.
  const fromNear505 = nav.search('room', [16, 24]);
  assert.equal(fromNear505[0].poi.id, 'room-505');
  assert.equal(editDistance('kitten', 'sitting'), 3);
});

test('unreachable destinations are dropped from search results', () => {
  const pois = [{ id: 'a', name: 'Alpha', category: 'Room' }, { id: 'b', name: 'Alpha Annex', category: 'Room' }];
  const results = searchPois(pois, 'alpha', (p) => (p.id === 'b' ? Infinity : 3));
  assert.deepEqual(results.map((r) => r.poi.id), ['a']);
});

test('spatial index answers radius and nearest queries', () => {
  const index = new SpatialIndex(2);
  index.insert('a', [0, 0]);
  index.insert('b', [3, 0]);
  index.insert('c', [10, 10]);
  assert.deepEqual(index.queryRadius([0.5, 0], 3).map((h) => h.item), ['a', 'b']);
  assert.equal(index.nearest([9, 9]).item, 'c');
  assert.equal(index.nearest([0, 0], (item) => item === 'c').item, 'c');
  assert.equal(nav.poiNear([22.9, 5.44]).id, 'poi-lift');
  assert.equal(nav.poiNear([10, 10]).id, 'room-401');
});

test('extra obstacles (e.g. scanned furniture) block the grid', () => {
  const grid = new NavGrid(FLOOR_1, { obstacles: [{ minX: 8, maxX: 11, minY: 8, maxY: 12 }] });
  assert.equal(grid.isPointWalkable([9.5, 10]), false);
  assert.equal(nav.grid.isPointWalkable([9.5, 10]), true);
});
