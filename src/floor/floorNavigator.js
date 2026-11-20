/**
 * NAMMA SPACE — Floor navigator
 *
 * One object per floor that ties together the floor model, occupancy grid, POI catalogue, spatial
 * index and search. The UI only talks to this class.
 */
import { NavGrid } from './navGrid.js';
import { SpatialIndex } from './spatialIndex.js';
import { searchPois } from './search.js';
import { rectCenter } from './floorPlan.js';

export const WALKING_SPEED = 1.2; // m/s, relaxed indoor pace

/** Build the destination list: every room, every doorway, plus annotated POIs. */
export function buildPois(model, extraPois = []) {
  const pois = [];
  for (const room of model.rooms) {
    pois.push({
      id: room.id,
      kind: 'room',
      name: room.name,
      number: room.number,
      category: room.category,
      aliases: room.aliases,
      description: `${room.name} — ${(room.rect.maxX - room.rect.minX).toFixed(1)} m × ${(room.rect.maxY - room.rect.minY).toFixed(1)} m`,
      position: rectCenter(room.rect),
      at: rectCenter(room.rect),
      roomId: room.id
    });
  }
  for (const door of model.doors) {
    const room = model.rooms.find((r) => r.id === door.roomId);
    pois.push({
      id: door.id,
      kind: 'door',
      name: `${room.name} entrance`,
      number: room.number,
      category: 'Doorway',
      aliases: ['door', 'entrance', 'entry'],
      description: `${door.width.toFixed(2)} m doorway on the ${{ N: 'north', S: 'south', E: 'east', W: 'west' }[door.side]} wall of ${room.name}.`,
      position: door.center,
      // Stand just outside the door, in the corridor.
      at: [door.center[0] + door.outward[0] * 0.6, door.center[1] + door.outward[1] * 0.6],
      roomId: room.id
    });
  }
  for (const poi of extraPois) pois.push({ kind: 'feature', ...poi, at: poi.at || poi.position });
  return pois;
}

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const compassOf = (dx, dy) => COMPASS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];

/** Turn-by-turn steps for a smoothed path. */
export function describeRoute(model, points, destinationName) {
  if (!points || points.length < 2) return [{ text: `You are at ${destinationName}.`, distance: 0, kind: 'arrive' }];
  const segs = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.05) continue;
    segs.push({ dx: (bx - ax) / len, dy: (by - ay) / len, len, region: model.regionAt([(ax + bx) / 2, (ay + by) / 2]), at: points[i - 1] });
  }
  if (!segs.length) return [{ text: `You are at ${destinationName}.`, distance: 0, kind: 'arrive' }];

  const steps = [];
  const where = (seg) => (seg.region ? ` through ${seg.region.name}` : '');
  steps.push({ kind: 'start', text: `Head ${compassOf(segs[0].dx, segs[0].dy)}${where(segs[0])}`, distance: segs[0].len, at: segs[0].at });
  for (let i = 1; i < segs.length; i++) {
    const p = segs[i - 1];
    const s = segs[i];
    const cross = p.dx * s.dy - p.dy * s.dx; // plan y points south, so cross > 0 is a right turn
    const angle = (Math.acos(Math.max(-1, Math.min(1, p.dx * s.dx + p.dy * s.dy))) * 180) / Math.PI;
    const regionChanged = s.region && s.region.id !== p.region?.id;
    // Straight on, or a sub-metre jog (e.g. lining up with a doorway): fold into the current step.
    if ((angle < 20 || (s.len < 1 && i < segs.length - 1) || s.len < 0.3) && !regionChanged) {
      steps[steps.length - 1].distance += s.len; // keep walking straight
      continue;
    }
    const side = cross > 0 ? 'right' : 'left';
    let turn = angle < 20 ? 'Continue' : angle < 50 ? `Bear ${side}` : angle < 135 ? `Turn ${side}` : 'Turn around';
    let text = turn;
    if (regionChanged) text += s.region.kind === 'room' ? ` into ${s.region.name}` : ` into the ${s.region.name}`;
    steps.push({ kind: 'turn', side: angle < 20 ? null : side, text, distance: s.len, at: s.at });
  }
  steps.push({ kind: 'arrive', text: `Arrive at ${destinationName}`, distance: 0, at: points[points.length - 1] });
  return steps.map((st) => ({ ...st, distance: Number(st.distance.toFixed(1)) }));
}

export class FloorNavigator {
  constructor(model, annotations = {}, gridOptions = {}) {
    this.model = model;
    this.grid = new NavGrid(model, gridOptions);
    this.pois = buildPois(model, annotations.pois || []);
    this.index = new SpatialIndex(2);
    for (const poi of this.pois) this.index.insert(poi, poi.position);
    this.defaultStart = this.pois.find((p) => p.id === annotations.defaultStartPoiId)?.at || this.pois[0].at;
    this.fieldCache = { key: null, field: null };
  }

  field(start) {
    const key = `${start[0].toFixed(2)},${start[1].toFixed(2)}`;
    if (this.fieldCache.key !== key) this.fieldCache = { key, field: this.grid.distanceField(start) };
    return this.fieldCache.field;
  }

  isWalkable(p) {
    return this.grid.isPointWalkable(p);
  }

  /** Snap an arbitrary point (e.g. a map click) to the nearest walkable spot. */
  snapToWalkable(p) {
    const cell = this.grid.snap(p, 3);
    return cell ? this.grid.toWorld(cell[0], cell[1]) : null;
  }

  search(query, start = this.defaultStart, { includeDoors = false } = {}) {
    const field = this.field(start);
    const pool = includeDoors || /door|entr/i.test(query) ? this.pois : this.pois.filter((p) => p.kind !== 'door');
    return searchPois(pool, query, (poi) => (field ? this.grid.distanceTo(field, poi.at) : Infinity));
  }

  /** POI nearest to a map point (within `radius` m), preferring features and doors over room centres. */
  poiNear(p, radius = 1.5) {
    const hit = this.index.queryRadius(p, radius)[0];
    if (hit) return hit.item;
    const region = this.model.regionAt(p);
    if (region?.kind === 'room') return this.pois.find((poi) => poi.id === region.id) || null;
    return null;
  }

  route(start, poi) {
    const field = this.field(start);
    if (!field) return null;
    const path = this.grid.pathTo(field, poi.at);
    if (!path) return null;
    return {
      poi,
      start: [...start],
      points: path.points,
      distanceMeters: path.distanceMeters,
      etaSeconds: Math.round(path.distanceMeters / WALKING_SPEED),
      steps: describeRoute(this.model, path.points, poi.name)
    };
  }
}
