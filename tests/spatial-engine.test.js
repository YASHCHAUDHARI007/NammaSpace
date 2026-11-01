import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SplatParser } from '@mkkellogg/gaussian-splats-3d';
import { CollisionSystem } from '../src/viewer/collision.js';
import { FirstPersonController } from '../src/viewer/controls.js';
import { SCENES, DEFAULT_SCENE_ID } from '../src/config/scenes.js';
import { validateSplatBuffer, validateSceneConfig, loadSpatialScene } from '../src/viewer/sceneLoader.js';

const room = {
  roomBounds: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 },
  colliders: [{ id: 'table', minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 }]
};
const vec = (x, z) => new THREE.Vector3(x, 1.68, z);

test('standard .splat fixture preserves anisotropic scale, RGBA and quaternion', () => {
  const bytes = new ArrayBuffer(32);
  const view = new DataView(bytes);
  [1, 2, 3, 0.1, 0.2, 0.3].forEach((value, i) => view.setFloat32(i * 4, value, true));
  [10, 20, 30, 40, 255, 128, 128, 128].forEach((value, i) => view.setUint8(24 + i, value));
  assert.equal(validateSplatBuffer(bytes), 1);
  const splat = SplatParser.parseStandardSplatToUncompressedSplatArray(bytes).splats[0];
  assert.deepEqual(splat.slice(0, 3), [1, 2, 3]);
  assert.ok(Math.abs(splat[3] - 0.1) < 1e-6);
  assert.ok(Math.abs(splat[4] - 0.2) < 1e-6);
  assert.ok(Math.abs(splat[5] - 0.3) < 1e-6);
  assert.deepEqual(splat.slice(6, 10), [1, 0, 0, 0]);
  assert.deepEqual(splat.slice(10, 14), [10, 20, 30, 40]);
});

test('sample .splat is well formed and accepted by installed parser', () => {
  const file = readFileSync(new URL('../public/scenes/sample-capture.splat', import.meta.url));
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  assert.equal(validateSplatBuffer(bytes), 2153);
  assert.equal(SplatParser.parseStandardSplatToUncompressedSplatArray(bytes).splats.length, 2153);
  assert.throws(() => validateSplatBuffer(bytes.slice(0, 31)), /multiple of 32/);
});

test('metric classroom asset contains valid Gaussian records', () => {
  const file = readFileSync(new URL('../public/scenes/classroom-metric.splat', import.meta.url));
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  assert.equal(validateSplatBuffer(bytes), 558361);
});

test('default one-video room has valid splats and explicit relative scale', () => {
  assert.equal(DEFAULT_SCENE_ID, 'classroom-c5307-single-video');
  const scene = SCENES[DEFAULT_SCENE_ID];
  assert.equal(scene.calibration.scaleType, 'relative');
  assert.equal(scene.roomBoundsKnown, false);
  assert.match(scene.calibration.captureSource, /C5307\.MP4/);
  const file = readFileSync(new URL('../public/scenes/classroom-c5307-single-video.splat', import.meta.url));
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  assert.equal(validateSplatBuffer(bytes), 324633);
  assert.doesNotThrow(() => validateSceneConfig(scene));
  assert.throws(() => validateSceneConfig({ ...scene, calibration: { ...scene.calibration, scaleType: 'metric' } }), /calibration/);
});

test('scene ingestion rejects missing or invalid navigation calibration before loading', async () => {
  for (const scene of Object.values(SCENES)) assert.doesNotThrow(() => validateSceneConfig(scene));
  const missingBounds = { ...SCENES['reconstructed-glb'], roomBounds: undefined };
  await assert.rejects(loadSpatialScene(missingBounds), /roomBounds/);
  const missingColliders = { ...SCENES['reconstructed-glb'], colliders: undefined };
  assert.throws(() => validateSceneConfig(missingColliders), /colliders/);
  const invalidCollider = { ...SCENES['reconstructed-glb'], colliders: [{ id: 'bad', minX: 2, maxX: 1, minZ: 0, maxZ: 1 }] };
  assert.throws(() => validateSceneConfig(invalidCollider), /collider/);
  const badFloor = { ...SCENES['reconstructed-glb'], roomBounds: { ...SCENES['reconstructed-glb'].roomBounds, floorY: 1 } };
  assert.throws(() => validateSceneConfig(badFloor), /floorY/);
  const unverifiedReal = { ...SCENES['reconstructed-glb'], isReconstructed: true };
  assert.throws(() => validateSceneConfig(unverifiedReal), /calibration/);
  const declaredCalibration = { ...unverifiedReal, calibration: { captureSource: 'unit-test fixture', upAxis: 'Y', metersPerAssetUnit: 1, originDescription: 'unit-test origin', referenceDistanceMeters: 1, referenceDistanceAssetUnits: 1 } };
  assert.doesNotThrow(() => validateSceneConfig(declaredCalibration));
  assert.throws(() => validateSceneConfig({ ...SCENES['demo-studio'], isReconstructed: true }), /Procedural demo/);
  const unreachablePoi = { ...SCENES['reconstructed-glb'], pois: [{ ...SCENES['reconstructed-glb'].pois[0], waypoint: [0, 0] }] };
  assert.throws(() => validateSceneConfig(unreachablePoi), /Invalid POI/);
});

test('mesh loader rejects an empty glTF scene instead of reporting a successful import', async () => {
  const originalProgressEvent = globalThis.ProgressEvent;
  globalThis.ProgressEvent ??= class { constructor(_type, options) { Object.assign(this, options); } };
  const emptyGltf = 'data:model/gltf+json,' + encodeURIComponent(JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }));
  try {
    await assert.rejects(loadSpatialScene({ ...SCENES['reconstructed-glb'], assetUrl: emptyGltf }), /no renderable mesh/i);
  } finally {
    if (originalProgressEvent === undefined) delete globalThis.ProgressEvent;
  }
});

test('walls stop movement at player radius and furniture cannot be tunneled through', () => {
  const collision = new CollisionSystem(room);
  const wall = collision.resolveMovement(vec(2, 2), vec(9, 2));
  assert.equal(wall.position.x, 3 - collision.playerRadius);
  assert.equal(wall.collided, true);
  const table = collision.resolveMovement(vec(0, 1), vec(0, -1));
  assert.ok(table.position.z >= 0.5 + collision.playerRadius - 1e-4);
  assert.equal(table.collided, true);
});

test('captured classroom supports a continuous aisle and blocks the raised stage', () => {
  const collision = new CollisionSystem(SCENES['classroom-pilot']);
  const spawn = vec(0.65, 5.8);
  const towardScreen = collision.resolveMovement(spawn, vec(0.65, 2.8));
  assert.equal(towardScreen.collided, false);
  const towardRear = collision.resolveMovement(spawn, vec(0.55, 10));
  assert.equal(towardRear.collided, false);
  const stage = collision.resolveMovement(towardScreen.position, vec(0.65, 0.2));
  assert.equal(stage.collided, true);
  assert.ok(stage.position.z >= 2.25 + collision.playerRadius - 0.02);
  const table = collision.resolveMovement(vec(0.65, 4.7), vec(-2, 4.7));
  assert.equal(table.collided, true);
  assert.ok(table.position.x >= -0.65 + collision.playerRadius - 0.02);
});

test('diagonal movement slides around corners without entering furniture', () => {
  const collision = new CollisionSystem(room);
  const result = collision.resolveMovement(vec(1, 1), vec(0, 0));
  assert.equal(collision.isPointWalkable(result.position.x, result.position.z), true);
  assert.equal(result.collided, true);
  assert.ok(result.position.x < 1 || result.position.z < 1);
});

test('registered spawns and POI waypoints are walkable and routeable', () => {
  for (const scene of Object.values(SCENES)) {
    const collision = new CollisionSystem(scene);
    const start = [scene.spawn.position[0], scene.spawn.position[2]];
    assert.equal(collision.isPointWalkable(...start, 0.42), true, scene.id);
    for (const poi of scene.pois) {
      assert.equal(collision.isPointWalkable(...poi.waypoint, 0.42), true, poi.id);
      const route = collision.computeObstacleAwarePath(start, poi.waypoint);
      assert.ok(route && route.points.length >= 2, poi.id);
      assert.deepEqual(route.points.at(-1), poi.waypoint, poi.id);
    }
  }
});

test('unreachable and invalid goals return no route; smoothing stays clear', () => {
  const collision = new CollisionSystem({
    roomBounds: room.roomBounds,
    colliders: [{ id: 'divider', minX: -3, maxX: 3, minZ: -0.1, maxZ: 0.1 }]
  });
  assert.equal(collision.computeObstacleAwarePath([0, 1], [0, -1]), null);
  assert.equal(collision.computeObstacleAwarePath([0, 1], [0, 0]), null);
  const open = new CollisionSystem(room);
  const route = open.computeObstacleAwarePath([0, 1.5], [0, -1.5]);
  assert.ok(route.points.length > 2);
  for (let i = 1; i < route.points.length; i++) {
    const [a, b] = [route.points[i - 1], route.points[i]];
    for (let t = 0; t <= 1; t += 0.01) {
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      assert.equal(open.isPointWalkable(x, z, 0.42), true);
    }
  }
});

test('nearby distinct points in one grid cell retain both route endpoints', () => {
  const collision = new CollisionSystem({ roomBounds: room.roomBounds, colliders: [] });
  const route = collision.computeObstacleAwarePath([1, 1], [1.05, 1.05]);
  assert.deepEqual(route.points, [[1, 1], [1.05, 1.05]]);
  assert.equal(route.distanceMeters, 0.07);
});

test('A* route segments preserve collider clearance between grid cells', () => {
  const collision = new CollisionSystem(SCENES['demo-studio']);
  const start = [4.345263509006003, -0.9425950633755837];
  const goal = [0.6632755170113409, 2.8791527685123417];
  const route = collision.computeObstacleAwarePath(start, goal);
  assert.ok(route);
  assert.deepEqual(route.points[0], start);
  assert.deepEqual(route.points.at(-1), goal);
  for (let i = 1; i < route.points.length; i++) {
    const [a, b] = [route.points[i - 1], route.points[i]];
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.0025);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      assert.equal(collision.isPointWalkable(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.42), true);
    }
  }
});

test('clearing a POI route stops its camera travel', () => {
  // Exercise the controller's real transition/update behavior without DOM event setup.
  const controller = Object.create(FirstPersonController.prototype);
  controller.camera = new THREE.PerspectiveCamera();
  controller.camera.position.set(0, 1.68, 3);
  controller.standingHeight = 1.68;
  controller.keys = { forward: false, backward: false, left: false, right: false };

  controller.transitionToTarget([0, 1], [0, 1, 0], 1);
  controller.update(0.1);
  const stoppedAt = controller.camera.position.clone();
  assert.ok(stoppedAt.z < 3, 'the camera began traveling before route clear');

  controller.cancelTransition();
  controller.update(0.1);
  assert.ok(controller.camera.position.equals(stoppedAt), 'the camera stayed in place after route clear');
});
