/**
 * NAMMA SPACE — Temporary 3D layout of Floor 1, generated from the measured floor plan.
 *
 * Until every room is scanned, each unscanned room is furnished with the layout measured in the
 * Room 504 scan: a raised stage with the projector screen at the front, two desk blocks split by a
 * centre aisle, side aisles, and blue/grey acoustic wall panels. Room 504 shows the real scan.
 *
 * Pure data (no Three.js) so it can be tested in Node. World frame = plan frame:
 *   world x = plan x (east), world z = plan y (south), y up, floor at 0.
 */
import { FLOOR_1, FLOOR_1_SCANS } from './floor1.js';
import { planToScan, scanBoxToPlanRect } from './scanPlacement.js';

export const CEILING_HEIGHT = 2.85;
export const WALL_THICKNESS = 0.14;
export const DOOR_HEIGHT = 2.1;

// Proportions measured in the Room 504 scan (metres).
export const CLASSROOM_TEMPLATE = {
  stageDepth: 1.7,
  stageHeight: 0.35,
  frontGap: 1.4, // stage edge → first desk row
  backGap: 1.6, // last row → back wall
  sideAisle: 1.1,
  doorSideAisle: 1.6, // wider aisle along the wall that has the door
  centreAisle: 1.1,
  rowPitch: 1.25,
  deskWidth: 1.1,
  deskDepth: 0.55,
  deskPitch: 1.2,
  deskHeight: 0.75,
  blockHeight: 0.95
};

/** Rect (plan) covering a list of plan points. */
const rectOf = (pts) => ({
  minX: Math.min(...pts.map((p) => p[0])),
  maxX: Math.max(...pts.map((p) => p[0])),
  minY: Math.min(...pts.map((p) => p[1])),
  maxY: Math.max(...pts.map((p) => p[1]))
});

/**
 * Local frame of a room: u runs across the room, v runs from the front wall (stage) to the back.
 * The stage goes at the end of the long axis farthest from the door, as in 504.
 */
export function roomFrame(room, door) {
  const r = room.rect;
  const w = r.maxX - r.minX;
  const h = r.maxY - r.minY;
  const longIsY = h >= w;
  const cx = (r.minX + r.maxX) / 2;
  const cy = (r.minY + r.maxY) / 2;
  const doorAlong = door ? (longIsY ? door.center[1] : door.center[0]) : longIsY ? r.maxY : r.maxX;
  const frontAtMin = longIsY ? doorAlong > cy : doorAlong > cx;
  const length = longIsY ? h : w;
  const width = longIsY ? w : h;
  // forward = direction from the back wall towards the stage; across = forward rotated 90°.
  const forward = longIsY ? [0, frontAtMin ? -1 : 1] : [frontAtMin ? -1 : 1, 0];
  const across = [-forward[1], forward[0]];
  const front = longIsY ? [cx, frontAtMin ? r.minY : r.maxY] : [frontAtMin ? r.minX : r.maxX, cy];
  const toPlan = (u, v) => [front[0] + across[0] * u - forward[0] * v, front[1] + across[1] * u - forward[1] * v];
  const toLocal = ([x, y]) => {
    const dx = x - front[0];
    const dy = y - front[1];
    return [dx * across[0] + dy * across[1], -(dx * forward[0] + dy * forward[1])];
  };
  return { length, width, forward, across, front, toPlan, toLocal };
}

/** Furnish one unscanned room with the 504 classroom layout. */
export function furnishClassroom(room, door, t = CLASSROOM_TEMPLATE) {
  const f = roomFrame(room, door);
  const half = f.width / 2;
  const box = (u0, u1, v0, v1) => rectOf([f.toPlan(u0, v0), f.toPlan(u1, v1)]);

  // Which side wall (u < 0 or u > 0) holds the door, if the door is on a long wall.
  const doorLocal = door ? f.toLocal(door.center) : null;
  const doorOnSide = doorLocal && Math.abs(Math.abs(doorLocal[0]) - half) < 0.3 ? Math.sign(doorLocal[0]) : 0;
  const aisleLow = doorOnSide < 0 ? t.doorSideAisle : t.sideAisle;
  const aisleHigh = doorOnSide > 0 ? t.doorSideAisle : t.sideAisle;
  const blocksWidth = f.width - aisleLow - aisleHigh - t.centreAisle;
  const blockW = blocksWidth / 2;
  const blocks = [
    [-half + aisleLow, -half + aisleLow + blockW],
    [half - aisleHigh - blockW, half - aisleHigh]
  ];
  const zoneStart = t.stageDepth + t.frontGap;
  const zoneEnd = f.length - t.backGap;

  const desks = [];
  const colliders = [];
  const perRow = Math.max(1, Math.floor((blockW + 0.1) / t.deskPitch));
  let lastRowV = zoneStart;
  for (let v = zoneStart + t.deskDepth / 2; v + t.deskDepth / 2 + 0.55 <= zoneEnd; v += t.rowPitch) {
    lastRowV = v;
    for (const [u0, u1] of blocks) {
      const span = u1 - u0;
      for (let i = 0; i < perRow; i++) {
        const u = u0 + (span / perRow) * (i + 0.5);
        desks.push({
          position: f.toPlan(u, v),
          chair: f.toPlan(u, v + t.deskDepth / 2 + 0.3),
          // Students face the stage: yaw of `forward` in world (x, z) terms.
          facing: f.forward
        });
      }
    }
  }
  if (lastRowV > zoneStart) {
    blocks.forEach(([u0, u1], i) => {
      colliders.push({
        id: `${room.id}-desks-${i ? 'b' : 'a'}`,
        label: `${room.name} desks`,
        rect: box(u0, u1, zoneStart, lastRowV + t.deskDepth / 2 + 0.6),
        minY: 0,
        maxY: t.blockHeight
      });
    });
  }

  const stage = { rect: box(-half, half, 0, t.stageDepth), height: t.stageHeight };
  colliders.push({ id: `${room.id}-stage`, label: `${room.name} stage`, rect: stage.rect, minY: 0, maxY: t.stageHeight });

  const screenWidth = Math.min(3.2, f.width * 0.42);
  const wallFace = WALL_THICKNESS / 2 + 0.01; // inner face of the front wall
  const screen = { center: f.toPlan(0, wallFace), width: screenWidth, bottom: 0.95, height: 1.75, facing: [-f.forward[0], -f.forward[1]] };
  const board = {
    center: f.toPlan(-(screenWidth / 2 + 1.3), wallFace),
    width: 2.0,
    bottom: 1.0,
    height: 1.2,
    facing: screen.facing
  };

  // Acoustic panels on both long walls, 504 style (alternating blue / grey / pale grey).
  const panels = [];
  const palette = ['blue', 'grey', 'pale', 'blue', 'pale', 'grey'];
  for (const side of [-1, 1]) {
    let k = side > 0 ? 2 : 0;
    for (let v = 2.2; v <= f.length - 0.8; v += 0.7) {
      if (doorLocal && side === doorOnSide && Math.abs(v - doorLocal[1]) < door.width / 2 + 0.5) continue;
      const p = f.toPlan(side * (half - WALL_THICKNESS / 2 - 0.02), v);
      panels.push({
        center: p,
        facing: [-f.across[0] * side, -f.across[1] * side],
        width: 0.62,
        bottom: k % 2 ? 0.9 : 1.25,
        height: k % 2 ? 1.5 : 1.05,
        tone: palette[k % palette.length]
      });
      k++;
    }
  }

  return { roomId: room.id, frame: f, stage, screen, board, desks, panels, colliders };
}

/** Ceiling light panels spread over a rect. */
function lightGrid(rect, spacing = 3) {
  const lights = [];
  const nx = Math.max(1, Math.round((rect.maxX - rect.minX) / spacing));
  const ny = Math.max(1, Math.round((rect.maxY - rect.minY) / spacing));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      lights.push([
        rect.minX + ((rect.maxX - rect.minX) / nx) * (i + 0.5),
        rect.minY + ((rect.maxY - rect.minY) / ny) * (j + 0.5)
      ]);
    }
  }
  return lights;
}

/** Wall footprint: thickened across the wall only, so door gaps keep their measured width. */
function wallRect(w) {
  const r = rectOf([w.a, w.b]);
  const d = WALL_THICKNESS / 2;
  const alongX = Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1]);
  return alongX ? { ...r, minY: r.minY - d, maxY: r.maxY + d } : { ...r, minX: r.minX - d, maxX: r.maxX + d };
}

const toCollider = (c) => ({
  id: c.id,
  label: c.label,
  minX: c.rect.minX,
  maxX: c.rect.maxX,
  minY: c.minY ?? 0,
  maxY: c.maxY ?? CEILING_HEIGHT,
  minZ: c.rect.minY,
  maxZ: c.rect.maxY
});

const DOOR_CLEAR_WIDTH = 2.0; // metres kept free inside a doorway, measured from the door wall

/**
 * Scan colliders to use inside the floor model. The scan's stage and stepped-seating boxes span the
 * full room width; where one sits in front of the room's door it would seal the doorway, so the
 * floor model trims it back from the door wall.
 */
function scanCollidersOnFloor(placement, door) {
  const doorScan = door ? planToScan(placement, door.center) : null;
  return (placement.scene.colliders || []).map((c) => {
    let box = c;
    if (doorScan) {
      const halfDoor = door.width / 2 + 0.5;
      const facesDoor = doorScan[1] + halfDoor > c.minZ && doorScan[1] - halfDoor < c.maxZ;
      const doorOnWestWall = doorScan[0] < c.minX + 0.6;
      const doorOnEastWall = doorScan[0] > c.maxX - 0.6;
      if (facesDoor && doorOnWestWall) box = { ...c, minX: Math.max(c.minX, doorScan[0] + DOOR_CLEAR_WIDTH) };
      else if (facesDoor && doorOnEastWall) box = { ...c, maxX: Math.min(c.maxX, doorScan[0] - DOOR_CLEAR_WIDTH) };
    }
    return { id: `scan-${c.id}`, label: c.label, rect: scanBoxToPlanRect(placement, box), minY: c.minY, maxY: c.maxY };
  });
}

export function buildFloorPreviewLayout(model = FLOOR_1, scans = FLOOR_1_SCANS) {
  const scannedRoomIds = new Set(scans.map((s) => s.roomId));
  const doorOf = (roomId) => model.doors.find((d) => d.roomId === roomId) || null;

  const walls = model.walls.map((w, i) => ({ id: `wall-${i}`, a: w.a, b: w.b }));
  const doors = model.doors.map((d) => {
    const room = model.rooms.find((r) => r.id === d.roomId);
    return { id: d.id, center: d.center, width: d.width, side: d.side, outward: d.outward, roomNumber: room.number, roomName: room.name };
  });

  const classrooms = model.rooms.filter((r) => !scannedRoomIds.has(r.id)).map((r) => furnishClassroom(r, doorOf(r.id)));
  const scannedRooms = scans.map((s) => ({ roomId: s.roomId, rect: model.rooms.find((r) => r.id === s.roomId).rect }));

  const colliders = [
    ...walls.map((w) => ({ id: w.id, label: 'Wall', rect: wallRect(w) })),
    ...model.blocks.map((b) => ({ id: b.id, label: b.kind === 'lift' ? 'Lift' : 'Staircase', rect: b.rect })),
    ...classrooms.flatMap((c) => c.colliders),
    ...scans.flatMap((s) => scanCollidersOnFloor(s, doorOf(s.roomId)))
  ].map(toCollider);

  const corridorRects = model.zones.filter((z) => z.walkable).map((z) => rectOf(z.polygon));
  const lights = [
    ...model.rooms.flatMap((r) => lightGrid(r.rect)),
    ...corridorRects.flatMap((r) => lightGrid(r, 3.2))
  ];

  return {
    bounds: rectOf(model.rooms.flatMap((r) => [[r.rect.minX, r.rect.minY], [r.rect.maxX, r.rect.maxY]]).concat(model.outlines.flat())),
    rooms: model.rooms.map((r) => ({ id: r.id, number: r.number, name: r.name, rect: r.rect, scanned: scannedRoomIds.has(r.id) })),
    outlines: model.outlines,
    walls,
    doors,
    blocks: model.blocks.map((b) => ({ id: b.id, kind: b.kind, rect: b.rect })),
    classrooms,
    scannedRooms,
    lights,
    colliders,
    embeddedScans: scans.map((s) => ({ sceneId: s.sceneId, roomId: s.roomId, origin: s.origin, rotationDeg: s.rotationDeg }))
  };
}
