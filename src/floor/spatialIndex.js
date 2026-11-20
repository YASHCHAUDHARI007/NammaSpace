/**
 * NAMMA SPACE — Uniform-grid spatial hash for points of interest.
 * O(1) bucket lookup for "what is near this point" (map clicks, nearest-of-category queries).
 */
export class SpatialIndex {
  constructor(bucketSize = 2) {
    this.bucketSize = bucketSize;
    this.buckets = new Map();
    this.items = [];
  }

  keyFor(x, y) {
    return `${Math.floor(x / this.bucketSize)},${Math.floor(y / this.bucketSize)}`;
  }

  insert(item, [x, y]) {
    const entry = { item, x, y };
    this.items.push(entry);
    const key = this.keyFor(x, y);
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(entry);
  }

  /** Items within `radius` metres of p, nearest first. */
  queryRadius([x, y], radius) {
    const b = this.bucketSize;
    const out = [];
    for (let bx = Math.floor((x - radius) / b); bx <= Math.floor((x + radius) / b); bx++) {
      for (let by = Math.floor((y - radius) / b); by <= Math.floor((y + radius) / b); by++) {
        for (const e of this.buckets.get(`${bx},${by}`) || []) {
          const d = Math.hypot(e.x - x, e.y - y);
          if (d <= radius) out.push({ item: e.item, distance: d });
        }
      }
    }
    return out.sort((a, b2) => a.distance - b2.distance);
  }

  /** Nearest item (optionally filtered), widening the search ring until something matches. */
  nearest(p, filter = () => true, maxRadius = 100) {
    for (let r = this.bucketSize; r <= maxRadius * 2; r *= 2) {
      const hit = this.queryRadius(p, Math.min(r, maxRadius)).find((h) => filter(h.item));
      if (hit) return hit;
      if (r >= maxRadius) break;
    }
    return null;
  }
}
