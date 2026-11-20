/**
 * NAMMA SPACE — Scan ↔ floor-plan placement
 *
 * A 3D scan is authored in its own frame (metres, +x right, +z towards the viewer, y up). A
 * placement pins that frame inside a room of the floor plan (metres, +x east, +y south):
 *
 *   plan = origin + R(rotationDeg) · [scanX, scanZ]
 *
 * rotationDeg 0 means scan −Z points north and scan +X points east.
 */

const rad = (deg) => (deg * Math.PI) / 180;

/** Scan [x, z] → plan [x, y]. */
export function scanToPlan(placement, [x, z]) {
  const t = rad(placement.rotationDeg || 0);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [placement.origin[0] + x * c - z * s, placement.origin[1] + x * s + z * c];
}

/** Plan [x, y] → scan [x, z]. */
export function planToScan(placement, [px, py]) {
  const t = rad(placement.rotationDeg || 0);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const dx = px - placement.origin[0];
  const dy = py - placement.origin[1];
  return [dx * c + dy * s, -dx * s + dy * c];
}

/** Scan axis-aligned box (minX..maxX, minZ..maxZ) → plan rect (exact for quarter turns). */
export function scanBoxToPlanRect(placement, box) {
  const corners = [
    [box.minX, box.minZ],
    [box.maxX, box.minZ],
    [box.minX, box.maxZ],
    [box.maxX, box.maxZ]
  ].map((p) => scanToPlan(placement, p));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * Floor destinations for every place marked in a scan. Each keeps a link back to the scan
 * (`scan.sceneId`, `scan.poiId`) so the map can open it in 3D.
 */
export function buildScanPois(placement, scene, roomId) {
  return (scene.pois || []).map((poi) => {
    const position = scanToPlan(placement, [poi.position[0], poi.position[2]]);
    const at = poi.waypoint ? scanToPlan(placement, poi.waypoint) : position;
    return {
      id: `scan-${scene.id}-${poi.id}`,
      kind: 'scan',
      name: poi.name,
      category: `${placement.label || scene.name} · 3D scan`,
      aliases: poi.aliases || [],
      description: poi.description,
      position,
      at,
      roomId,
      scan: { sceneId: scene.id, poiId: poi.id }
    };
  });
}
