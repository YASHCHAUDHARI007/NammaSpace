/**
 * NAMMA SPACE — Floor occupancy grid + obstacle-aware routing
 *
 * 1. Rasterise the floor model into a 10 cm occupancy grid. A cell is walkable when it lies inside a
 *    room or the shared-space outline, is at least `clearance` from every wall (door gaps are cut out
 *    of the walls, so doorways stay open) and is outside every block (stairs, lift, furniture).
 * 2. Dijkstra from the start cell builds a distance field over the whole floor in one pass, so every
 *    destination's true walking distance is known at once (used to rank search results).
 * 3. The path to any goal is read back from the field and string-pulled with grid line-of-sight.
 */
import { distanceToSegment, pointInPolygon, pointInRect } from './floorPlan.js';

const SQRT2 = Math.SQRT2;
const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]
];

/** Minimal binary min-heap keyed by Float64 priority. */
class MinHeap {
  constructor() {
    this.items = [];
    this.prio = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, priority) {
    const { items, prio } = this;
    let i = items.length;
    items.push(item);
    prio.push(priority);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (prio[parent] <= priority) break;
      items[i] = items[parent];
      prio[i] = prio[parent];
      i = parent;
    }
    items[i] = item;
    prio[i] = priority;
  }
  pop() {
    const { items, prio } = this;
    const top = items[0];
    const lastItem = items.pop();
    const lastPrio = prio.pop();
    if (items.length > 0) {
      let i = 0;
      const n = items.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && prio[r] < prio[l] ? r : l;
        if (prio[c] >= lastPrio) break;
        items[i] = items[c];
        prio[i] = prio[c];
        i = c;
      }
      items[i] = lastItem;
      prio[i] = lastPrio;
    }
    return top;
  }
}

export class NavGrid {
  /**
   * @param {object} model   Output of buildFloorModel.
   * @param {object} options { cellSize = 0.1, clearance = 0.25, obstacles = [] (extra rects) }
   */
  constructor(model, { cellSize = 0.1, clearance = 0.25, obstacles = [] } = {}) {
    this.model = model;
    this.cellSize = cellSize;
    this.clearance = clearance;
    const b = model.bounds;
    this.originX = b.minX;
    this.originY = b.minY;
    this.cols = Math.ceil((b.maxX - b.minX) / cellSize);
    this.rows = Math.ceil((b.maxY - b.minY) / cellSize);
    this.walkable = new Uint8Array(this.cols * this.rows);
    this.obstacles = [...model.blocks.map((blk) => blk.rect), ...obstacles];
    this.rasterise();
  }

  rasterise() {
    const { cols, rows, model, clearance } = this;
    const walls = model.walls;
    const insideSpace = (p) =>
      model.rooms.some((r) => pointInRect(p, r.rect)) || model.outlines.some((poly) => pointInPolygon(p, poly));
    const blocked = model.zones.filter((z) => !z.walkable);
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const p = this.toWorld(gx, gy);
        if (!insideSpace(p)) continue;
        if (blocked.some((z) => pointInPolygon(p, z.polygon))) continue;
        if (this.obstacles.some((r) => pointInRect(p, r, clearance))) continue;
        let clear = true;
        for (let i = 0; i < walls.length; i++) {
          if (distanceToSegment(p, walls[i].a, walls[i].b) < clearance) {
            clear = false;
            break;
          }
        }
        if (clear) this.walkable[gy * cols + gx] = 1;
      }
    }
  }

  toWorld(gx, gy) {
    return [this.originX + (gx + 0.5) * this.cellSize, this.originY + (gy + 0.5) * this.cellSize];
  }

  toCell([x, y]) {
    return [Math.floor((x - this.originX) / this.cellSize), Math.floor((y - this.originY) / this.cellSize)];
  }

  isFree(gx, gy) {
    return gx >= 0 && gy >= 0 && gx < this.cols && gy < this.rows && this.walkable[gy * this.cols + gx] === 1;
  }

  isPointWalkable(p) {
    const [gx, gy] = this.toCell(p);
    return this.isFree(gx, gy);
  }

  /** Nearest walkable cell to a world point (spiral search up to `maxRadius` metres). */
  snap(p, maxRadius = 2) {
    const [cx, cy] = this.toCell(p);
    if (this.isFree(cx, cy)) return [cx, cy];
    const maxR = Math.ceil(maxRadius / this.cellSize);
    let best = null;
    let bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isFree(cx + dx, cy + dy)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = [cx + dx, cy + dy];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Dijkstra distance field (metres) from a world start point.
   * @returns {{ start:[number,number], startCell:number, dist:Float64Array, parent:Int32Array } | null}
   */
  distanceField(start) {
    const cell = this.snap(start);
    if (!cell) return null;
    const { cols, rows, cellSize } = this;
    const n = cols * rows;
    const dist = new Float64Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const startIdx = cell[1] * cols + cell[0];
    dist[startIdx] = 0;
    const heap = new MinHeap();
    heap.push(startIdx, 0);
    while (heap.size) {
      const idx = heap.pop();
      const d = dist[idx];
      const gx = idx % cols;
      const gy = (idx - gx) / cols;
      for (const [dx, dy, w] of NEIGHBOURS) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (!this.isFree(nx, ny)) continue;
        if (dx && dy && (!this.isFree(gx + dx, gy) || !this.isFree(gx, gy + dy))) continue; // no corner cutting
        const nIdx = ny * cols + nx;
        const nd = d + w * cellSize;
        if (nd < dist[nIdx]) {
          dist[nIdx] = nd;
          parent[nIdx] = idx;
          heap.push(nIdx, nd);
        }
      }
    }
    return { start: [...start], startCell: startIdx, dist, parent };
  }

  /** Walking distance (m) from the field's start to a world point, or Infinity if unreachable. */
  distanceTo(field, goal) {
    const cell = this.snap(goal);
    if (!cell) return Infinity;
    const idx = cell[1] * this.cols + cell[0];
    const [cx, cy] = this.toWorld(cell[0], cell[1]);
    return field.dist[idx] + Math.hypot(cx - goal[0], cy - goal[1]);
  }

  /**
   * Obstacle-aware path from the field's start to `goal`.
   * @returns {{ points: Array<[number,number]>, distanceMeters: number } | null}
   */
  pathTo(field, goal) {
    const cell = this.snap(goal);
    if (!cell) return null;
    let idx = cell[1] * this.cols + cell[0];
    if (!Number.isFinite(field.dist[idx])) return null;
    const cells = [];
    while (idx !== -1) {
      cells.push(idx);
      if (idx === field.startCell) break;
      idx = field.parent[idx];
    }
    cells.reverse();
    const raw = cells.map((i) => this.toWorld(i % this.cols, Math.floor(i / this.cols)));
    const points = this.smooth([field.start, ...raw, [...goal]]);
    let distanceMeters = 0;
    for (let i = 1; i < points.length; i++) {
      distanceMeters += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }
    return { points, distanceMeters: Number(distanceMeters.toFixed(2)) };
  }

  /** True when the straight segment a→b stays on walkable cells (sampled every half cell). */
  lineOfSight(a, b) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len / (this.cellSize * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isPointWalkable([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
    }
    return true;
  }

  smooth(points) {
    // Endpoints may sit just off the grid (e.g. a POI inside a block); keep them, smooth the middle.
    if (points.length <= 2) return points;
    const out = [points[0]];
    let anchor = 0;
    while (anchor < points.length - 1) {
      let next = anchor + 1;
      for (let j = points.length - 1; j > anchor + 1; j--) {
        if (this.lineOfSight(points[anchor], points[j])) {
          next = j;
          break;
        }
      }
      out.push(points[next]);
      anchor = next;
    }
    return out;
  }
}
