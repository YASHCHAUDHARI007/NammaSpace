/**
 * NAMMA SPACE — Three.js geometry for the temporary Floor 1 model.
 * Turns the pure-data layout from `src/floor/floorPreviewLayout.js` into meshes. Repeated items
 * (desks, chairs, wall panels, ceiling lights) are instanced so the whole floor stays cheap to draw.
 * World frame = plan frame: x east, z south (plan y), y up.
 */
import * as THREE from 'three';
import { CEILING_HEIGHT, DOOR_HEIGHT, WALL_THICKNESS } from '../floor/floorPreviewLayout.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...extra });

const MATERIALS = () => ({
  wall: mat(0xeeeae2),
  corridorFloor: mat(0xb9b8b2, { roughness: 0.6, side: THREE.DoubleSide }),
  roomFloor: mat(0xa98a6a, { roughness: 0.7 }),
  ceiling: mat(0xf4f3ef, { side: THREE.DoubleSide }),
  frame: mat(0x4b3a2c, { roughness: 0.6 }),
  stage: mat(0x7b6450, { roughness: 0.65 }),
  stageEdge: mat(0x2e2a26),
  screen: mat(0xf7f7f4, { emissive: 0xe9ece8, emissiveIntensity: 0.25 }),
  screenFrame: mat(0x202224),
  board: mat(0xe9ece6, { roughness: 0.35 }),
  deskTop: mat(0xf5f5f2, { roughness: 0.5 }),
  deskLeg: mat(0x9a9ea2, { metalness: 0.4, roughness: 0.4 }),
  chair: mat(0x8b9095, { roughness: 0.55 }),
  panelBlue: mat(0x2f62b8),
  panelGrey: mat(0x7d8389),
  panelPale: mat(0xc9ccd1),
  lightFrame: mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 }),
  lightInner: mat(0x6d93e0, { emissive: 0x4d7ad8, emissiveIntensity: 0.55 }),
  liftBody: mat(0x9aa0a6, { metalness: 0.5, roughness: 0.35 }),
  liftDoor: mat(0xc7ccd1, { metalness: 0.75, roughness: 0.25 }),
  stairs: mat(0xc4c0b8),
  sign: null
});

const yawFor = ([fx, fy]) => Math.atan2(fx, fy); // rotation.y that turns local +z towards (fx, fy)

function box(w, h, d, material, x, y, z, yaw = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  return m;
}

function rectFloor(rect, material, y = 0.001) {
  const w = rect.maxX - rect.minX;
  const d = rect.maxY - rect.minY;
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.position.set((rect.minX + rect.maxX) / 2, y, (rect.minY + rect.maxY) / 2);
  return m;
}

function polygonFloor(poly, material) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2); // (x, y) → (x, 0, y)
  return new THREE.Mesh(geo, material);
}

/** Instanced unit boxes; each entry is { x, y, z, sx, sy, sz, yaw }. */
function instancedBoxes(entries, material, name) {
  if (!entries.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length);
  mesh.name = name;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  entries.forEach((e, i) => {
    q.setFromAxisAngle(up, e.yaw || 0);
    m.compose(new THREE.Vector3(e.x, e.y, e.z), q, new THREE.Vector3(e.sx, e.sy, e.sz));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function signTexture(number, name) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1f3a2e';
  ctx.fillRect(0, 0, 512, 180);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 96px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(number, 256, 76);
  ctx.font = '500 34px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#bfe0cf';
  ctx.fillText(name.replace(/^Room \d+$/, 'Classroom').toUpperCase(), 256, 146);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * @param {object} layout  from buildFloorPreviewLayout()
 * @param {{ loadedScanRoomIds?: Set<string> }} options  rooms whose real scan is shown (skip their
 *        procedural floor/ceiling so the splat is not hidden)
 */
export function buildFloorPreview(layout, { loadedScanRoomIds = new Set() } = {}) {
  const root = new THREE.Group();
  root.name = 'FloorPreviewModel';
  const M = MATERIALS();
  const scannedRooms = new Set(layout.scannedRooms.map((r) => r.roomId));

  root.add(new THREE.AmbientLight(0xffffff, 0.55));

  // Floors: corridor / lobby outline in tile grey, rooms in warm laminate.
  for (const poly of layout.outlines) root.add(polygonFloor(poly, M.corridorFloor));
  for (const room of layout.rooms) {
    if (loadedScanRoomIds.has(room.id)) continue;
    root.add(rectFloor(room.rect, M.roomFloor, 0.002));
  }

  // Ceiling over everything except rooms showing a real scan (the scan has its own ceiling).
  const b = layout.bounds;
  const ceilingParts = loadedScanRoomIds.size
    ? [...layout.outlines.map((p) => polygonFloor(p, M.ceiling)), ...layout.rooms.filter((r) => !loadedScanRoomIds.has(r.id)).map((r) => rectFloor(r.rect, M.ceiling, 0))]
    : [rectFloor(b, M.ceiling, 0)];
  for (const part of ceilingParts) {
    part.position.y = CEILING_HEIGHT;
    root.add(part);
  }

  // Walls (door gaps are already cut in the plan).
  for (const w of layout.walls) {
    const dx = w.b[0] - w.a[0];
    const dy = w.b[1] - w.a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.02) continue;
    root.add(box(len + WALL_THICKNESS, CEILING_HEIGHT, WALL_THICKNESS, M.wall, (w.a[0] + w.b[0]) / 2, CEILING_HEIGHT / 2, (w.a[1] + w.b[1]) / 2, -Math.atan2(dy, dx)));
  }

  // Doorways: lintel above the opening, dark frame, and a room sign on the corridor side.
  for (const d of layout.doors) {
    const alongX = d.side === 'N' || d.side === 'S';
    const yaw = alongX ? 0 : Math.PI / 2;
    const [cx, cy] = d.center;
    root.add(box(d.width + 0.02, CEILING_HEIGHT - DOOR_HEIGHT, WALL_THICKNESS, M.wall, cx, (CEILING_HEIGHT + DOOR_HEIGHT) / 2, cy, yaw));
    root.add(box(d.width + 0.12, 0.06, WALL_THICKNESS + 0.04, M.frame, cx, DOOR_HEIGHT, cy, yaw));
    for (const s of [-1, 1]) {
      const ox = alongX ? s * (d.width / 2 + 0.03) : 0;
      const oy = alongX ? 0 : s * (d.width / 2 + 0.03);
      root.add(box(0.06, DOOR_HEIGHT, WALL_THICKNESS + 0.04, M.frame, cx + ox, DOOR_HEIGHT / 2, cy + oy, yaw));
    }
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.25),
      new THREE.MeshBasicMaterial({ map: signTexture(d.roomNumber, d.roomName), toneMapped: false })
    );
    sign.position.set(cx + d.outward[0] * (WALL_THICKNESS / 2 + 0.01), 2.47, cy + d.outward[1] * (WALL_THICKNESS / 2 + 0.01));
    sign.rotation.y = yawFor(d.outward);
    sign.name = `Sign_${d.roomNumber}`;
    root.add(sign);
  }

  // Furnished classrooms (504 layout).
  const deskTops = [];
  const deskLegs = [];
  const chairSeats = [];
  const chairBacks = [];
  const panels = { blue: [], grey: [], pale: [] };
  for (const c of layout.classrooms) {
    const s = c.stage;
    const sw = s.rect.maxX - s.rect.minX;
    const sd = s.rect.maxY - s.rect.minY;
    const scx = (s.rect.minX + s.rect.maxX) / 2;
    const scy = (s.rect.minY + s.rect.maxY) / 2;
    root.add(box(sw, s.height, sd, M.stage, scx, s.height / 2, scy));

    for (const [item, material] of [[c.screen, M.screen], [c.board, M.board]]) {
      const yaw = yawFor(item.facing);
      const y = item.bottom + item.height / 2;
      const [x, z] = item.center;
      root.add(box(item.width + 0.08, item.height + 0.08, 0.03, M.screenFrame, x + item.facing[0] * 0.02, y, z + item.facing[1] * 0.02, yaw));
      root.add(box(item.width, item.height, 0.02, material, x + item.facing[0] * 0.045, y, z + item.facing[1] * 0.045, yaw));
    }

    for (const d of c.desks) {
      const yaw = yawFor(d.facing);
      const [x, z] = d.position;
      const [ax, az] = [Math.cos(yaw), -Math.sin(yaw)]; // desk's long (local x) axis in world
      deskTops.push({ x, y: 0.74, z, sx: 1.1, sy: 0.035, sz: 0.55, yaw });
      for (const k of [-1, 1]) deskLegs.push({ x: x + ax * k * 0.48, y: 0.37, z: z + az * k * 0.48, sx: 0.04, sy: 0.72, sz: 0.45, yaw });
      const [chx, chz] = d.chair;
      chairSeats.push({ x: chx, y: 0.45, z: chz, sx: 0.44, sy: 0.05, sz: 0.42, yaw });
      chairBacks.push({ x: chx - d.facing[0] * 0.21, y: 0.72, z: chz - d.facing[1] * 0.21, sx: 0.42, sy: 0.42, sz: 0.04, yaw });
    }
    for (const p of c.panels) {
      const [x, z] = p.center;
      panels[p.tone].push({ x: x + p.facing[0] * 0.015, y: p.bottom + p.height / 2, z: z + p.facing[1] * 0.015, sx: p.width, sy: p.height, sz: 0.03, yaw: yawFor(p.facing) });
    }
  }
  [
    instancedBoxes(deskTops, M.deskTop, 'DeskTops'),
    instancedBoxes(deskLegs, M.deskLeg, 'DeskLegs'),
    instancedBoxes(chairSeats, M.chair, 'ChairSeats'),
    instancedBoxes(chairBacks, M.chair, 'ChairBacks'),
    instancedBoxes(panels.blue, M.panelBlue, 'PanelsBlue'),
    instancedBoxes(panels.grey, M.panelGrey, 'PanelsGrey'),
    instancedBoxes(panels.pale, M.panelPale, 'PanelsPale')
  ].forEach((m) => m && root.add(m));

  // Ceiling light panels (504 style: white frame, blue centre). None inside a shown scan.
  const inScan = ([x, y]) =>
    layout.rooms.some((r) => loadedScanRoomIds.has(r.id) && x > r.rect.minX && x < r.rect.maxX && y > r.rect.minY && y < r.rect.maxY);
  const lights = layout.lights.filter((p) => !inScan(p));
  const frames = instancedBoxes(lights.map(([x, z]) => ({ x, y: CEILING_HEIGHT - 0.02, z, sx: 0.62, sy: 0.03, sz: 0.62 })), M.lightFrame, 'CeilingLights');
  const inners = instancedBoxes(lights.map(([x, z]) => ({ x, y: CEILING_HEIGHT - 0.035, z, sx: 0.42, sy: 0.01, sz: 0.42 })), M.lightInner, 'CeilingLightCentres');
  if (frames) root.add(frames);
  if (inners) root.add(inners);

  // Lift and stairs.
  for (const blk of layout.blocks) {
    const r = blk.rect;
    const w = r.maxX - r.minX;
    const d = r.maxY - r.minY;
    const cx = (r.minX + r.maxX) / 2;
    const cy = (r.minY + r.maxY) / 2;
    if (blk.kind === 'lift') {
      root.add(box(w, CEILING_HEIGHT, d, M.liftBody, cx, CEILING_HEIGHT / 2, cy));
      for (const k of [-1, 1]) root.add(box(0.03, 2.05, d * 0.32, M.liftDoor, r.minX - 0.016, 1.03, cy + k * d * 0.165));
      continue;
    }
    // Stair flights rise eastward from the lobby; the short block is the landing.
    const isLanding = w < 2;
    if (isLanding) {
      root.add(box(w, 1.4, d, M.stairs, cx, 0.7, cy));
      continue;
    }
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      const h = (1.4 * (i + 1)) / steps;
      const sx = r.minX + (w / steps) * (i + 0.5);
      root.add(box(w / steps, h, d, M.stairs, sx, h / 2, cy));
    }
  }

  // Rooms with a scan that did not load still get their floor/ceiling (handled above) and nothing
  // else; mark them so the viewer can say so.
  root.userData.scannedRoomIds = [...scannedRooms];
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return root;
}
