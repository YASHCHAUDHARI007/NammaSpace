/**
 * NAMMA SPACE — Floor plan model
 *
 * Turns a Floor Plan Sketcher export into a navigable floor model:
 *   rooms (rectangles), doors (gaps snapped onto walls), wall segments with the door gaps cut out,
 *   blocks (stairs / lift) and annotated shared zones (corridor, lobby, passage, restricted).
 *
 * All coordinates are plan metres: +x east, +y south (the sketcher's screen-down axis).
 */

const DOOR_SNAP_TOLERANCE = 0.3; // metres a door centre may sit off its wall line in the sketch

// Sketcher items are axis-aligned boxes rotated about their centre; quarter turns swap w and h.
const rectFromItem = (it) => {
  const quarterTurn = Math.abs(Math.round((it.rot ?? 0) / 90)) % 2 === 1;
  const w = quarterTurn ? it.h : it.w;
  const h = quarterTurn ? it.w : it.h;
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  return { minX: cx - Math.abs(w) / 2, maxX: cx + Math.abs(w) / 2, minY: cy - Math.abs(h) / 2, maxY: cy + Math.abs(h) / 2 };
};

const rectEdges = (r) => [
  { a: [r.minX, r.minY], b: [r.maxX, r.minY], side: 'N' },
  { a: [r.maxX, r.minY], b: [r.maxX, r.maxY], side: 'E' },
  { a: [r.maxX, r.maxY], b: [r.minX, r.maxY], side: 'S' },
  { a: [r.minX, r.maxY], b: [r.minX, r.minY], side: 'W' }
];

export const rectCenter = (r) => [(r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2];

export function pointInRect([x, y], r, pad = 0) {
  return x >= r.minX - pad && x <= r.maxX + pad && y >= r.minY - pad && y <= r.maxY + pad;
}

export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Project p onto segment a→b; returns { t (0..1), along (m), offset (m) }. */
function projectOnSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const along = (px - ax) * ux + (py - ay) * uy;
  const offset = Math.abs((px - ax) * -uy + (py - ay) * ux);
  return { along, offset, len, ux, uy };
}

/** Split a wall segment by every door gap lying on it. */
function cutDoorGaps(edge, doors) {
  const gaps = [];
  for (const door of doors) {
    const { along, offset, len } = projectOnSegment(door.center, edge.a, edge.b);
    if (offset > DOOR_SNAP_TOLERANCE || along < -0.05 || along > len + 0.05) continue;
    gaps.push([Math.max(0, along - door.width / 2), Math.min(len, along + door.width / 2)]);
  }
  const { len, ux, uy } = projectOnSegment(edge.b, edge.a, edge.b);
  gaps.sort((g1, g2) => g1[0] - g2[0]);
  const pieces = [];
  let cursor = 0;
  for (const [g0, g1] of gaps) {
    if (g0 > cursor + 1e-3) pieces.push([cursor, g0]);
    cursor = Math.max(cursor, g1);
  }
  if (cursor < len - 1e-3) pieces.push([cursor, len]);
  const at = (s) => [edge.a[0] + ux * s, edge.a[1] + uy * s];
  return pieces.map(([s0, s1]) => ({ a: at(s0), b: at(s1) }));
}

/**
 * @param {object} sketch      Floor Plan Sketcher JSON (metres).
 * @param {object} annotations Shared zones and labels the sketch does not carry (see floor1.js).
 */
export function buildFloorModel(sketch, annotations = {}) {
  if (!sketch || !Array.isArray(sketch.items)) throw new Error('Floor plan sketch has no items array.');
  if (sketch.unit !== 'm') throw new Error(`Floor plan unit must be metres, got "${sketch.unit}".`);

  const rooms = [];
  const doors = [];
  const blocks = [];
  const extraWalls = [];

  for (const it of sketch.items) {
    if (it.type === 'room') {
      const meta = annotations.rooms?.[it.name] || {};
      rooms.push({
        id: `room-${it.name}`,
        number: it.name,
        name: meta.name || `Room ${it.name}`,
        aliases: meta.aliases || [],
        category: meta.category || 'Room',
        rect: rectFromItem(it)
      });
    } else if (it.type === 'door') {
      doors.push({ id: `door-${it.id}`, center: [it.x, it.y], width: it.w, rot: it.rot ?? 0 });
    } else if (it.type === 'block') {
      blocks.push({ id: `block-${it.id}`, kind: it.kind, name: it.name, rect: rectFromItem(it) });
    } else if (it.type === 'wall') {
      extraWalls.push({ a: [it.x1, it.y1], b: [it.x2, it.y2] });
    }
  }

  // Assign each door to the room whose wall it sits on, and snap its centre onto that wall.
  for (const door of doors) {
    let best = null;
    for (const room of rooms) {
      for (const edge of rectEdges(room.rect)) {
        const p = projectOnSegment(door.center, edge.a, edge.b);
        if (p.offset > DOOR_SNAP_TOLERANCE || p.along < 0 || p.along > p.len) continue;
        if (!best || p.offset < best.p.offset) best = { room, edge, p };
      }
    }
    if (!best) throw new Error(`Door ${door.id} at (${door.center}) is not on any room wall.`);
    const { room, edge, p } = best;
    door.roomId = room.id;
    door.side = edge.side;
    door.center = [edge.a[0] + p.ux * p.along, edge.a[1] + p.uy * p.along];
    // Unit normal pointing out of the room (into the corridor).
    door.outward = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[edge.side];
    room.doors = [...(room.doors || []), door.id];
  }

  // Named areas outside rooms (corridor, lobby, …) are used for labels and turn instructions.
  // `outlines` are the walled boundaries of the shared walkable space; they become walls.
  const zones = (annotations.zones || []).map((z) => ({ ...z }));
  const walkablePolygons = annotations.outlines || [];

  // Walls = every room outline + every shared-space outline, with door gaps removed.
  const rawEdges = [
    ...rooms.flatMap((r) => rectEdges(r.rect)),
    ...walkablePolygons.flatMap((poly) =>
      poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length] }))
    )
  ];
  const walls = rawEdges.flatMap((edge) => cutDoorGaps(edge, doors));

  const xs = [];
  const ys = [];
  for (const r of rooms) xs.push(r.rect.minX, r.rect.maxX), ys.push(r.rect.minY, r.rect.maxY);
  for (const poly of walkablePolygons) for (const [x, y] of poly) xs.push(x), ys.push(y);
  for (const w of extraWalls) xs.push(w.a[0], w.b[0]), ys.push(w.a[1], w.b[1]);
  const bounds = {
    minX: Math.min(...xs) - 0.5,
    maxX: Math.max(...xs) + 0.5,
    minY: Math.min(...ys) - 0.5,
    maxY: Math.max(...ys) + 0.5
  };

  const model = {
    name: annotations.name || sketch.name,
    level: annotations.level ?? 1,
    rooms,
    doors,
    blocks,
    zones,
    outlines: walkablePolygons,
    walls,
    sketchWalls: extraWalls,
    bounds
  };
  model.regionAt = (p) => regionAt(model, p);
  return model;
}

/** Which named region (room or zone) contains plan point p. */
export function regionAt(model, p) {
  for (const room of model.rooms) if (pointInRect(p, room.rect)) return { kind: 'room', id: room.id, name: room.name };
  for (const zone of model.zones) {
    if (zone.walkable && pointInPolygon(p, zone.polygon)) return { kind: 'zone', id: zone.id, name: zone.name };
  }
  return null;
}
