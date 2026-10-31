import * as THREE from 'three';
import { DEFAULT_STANDING_HEIGHT, PLAYER_RADIUS } from '../config/scenes.js';

/**
 * NAMMA SPACE — Spatial Collision & Walkable Grid A* Navigation System
 *
 * Responsibilities:
 * 1. Enforce outer room boundary limits with player cylinder radius.
 * 2. Resolve circle-vs-AABB horizontal collisions with smooth wall/furniture sliding.
 * 3. Maintain standing eye-height constraint.
 * 4. Provide a genuine obstacle-aware 2D grid A* pathfinder over the walkable floor area.
 */
export class CollisionSystem {
  constructor(sceneConfig = {}) {
    this.playerRadius = PLAYER_RADIUS;
    this.standingHeight = sceneConfig.eyeHeight ?? DEFAULT_STANDING_HEIGHT;
    this.roomBoundsKnown = sceneConfig.roomBoundsKnown !== false;
    this.roomBounds = sceneConfig.roomBounds || {
      minX: -4.85,
      maxX: 4.85,
      minZ: -3.85,
      maxZ: 3.85,
      floorY: 0,
      ceilingY: 3.2
    };
    this.colliders = Array.isArray(sceneConfig.colliders)
      ? sceneConfig.colliders.map((c) => ({ ...c }))
      : [];
    this.debugGroup = null;
  }

  /**
   * Update bounds and colliders when switching scenes or loading custom meshes.
   */
  configure(sceneConfig) {
    this.standingHeight = sceneConfig.eyeHeight ?? DEFAULT_STANDING_HEIGHT;
    this.roomBoundsKnown = sceneConfig.roomBoundsKnown !== false;
    if (sceneConfig.roomBounds) {
      this.roomBounds = { ...sceneConfig.roomBounds };
    }
    if (Array.isArray(sceneConfig.colliders)) {
      this.colliders = sceneConfig.colliders.map((c) => ({ ...c }));
    }
  }

  /**
   * Dynamically register additional AABB colliders extracted from a loaded GLB mesh.
   */
  addMeshColliders(boxes) {
    for (const box of boxes) {
      this.colliders.push(box);
    }
  }

  /**
   * Check whether a world (x, z) point is walkable with a given clearance radius.
   */
  isPointWalkable(x, z, clearance = this.playerRadius) {
    const b = this.roomBounds;
    if (
      x < b.minX + clearance ||
      x > b.maxX - clearance ||
      z < b.minZ + clearance ||
      z > b.maxZ - clearance
    ) {
      return false;
    }

    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      const closestX = Math.max(c.minX, Math.min(x, c.maxX));
      const closestZ = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < clearance * clearance) {
        return false;
      }
    }
    return true;
  }

  isSegmentWalkable(a, b, clearance) {
    // shortcut: sample clearance every 5 mm; use swept-circle geometry for sub-centimeter calibration.
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.005));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isPointWalkable(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, clearance)) return false;
    }
    return true;
  }

  /**
   * Resolve player movement from `currentPos` to `desiredPos` with smooth sliding
   * along room walls and furniture AABBs.
   *
   * @param {THREE.Vector3} currentPos
   * @param {THREE.Vector3} desiredPos
   * @returns {{ position: THREE.Vector3, collided: boolean, hitLabel: string | null }}
   */
  resolveMovement(currentPos, desiredPos) {
    const r = this.playerRadius;
    const b = this.roomBounds;
    const hitAt = (x, z) => {
      const boundary = this.roomBoundsKnown ? 'Perimeter Wall' : 'Preview Limit';
      if (x < b.minX + r) return `West ${boundary}`;
      if (x > b.maxX - r) return `East ${boundary}`;
      if (z < b.minZ + r) return `North ${boundary}`;
      if (z > b.maxZ - r) return `South ${boundary}`;
      for (const box of this.colliders) {
        const closestX = Math.max(box.minX, Math.min(x, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
        if ((x - closestX) ** 2 + (z - closestZ) ** 2 < r * r - 1e-9) {
          return box.label || box.id || 'Obstacle';
        }
      }
      return null;
    };

    const dx = desiredPos.x - currentPos.x;
    const dz = desiredPos.z - currentPos.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.25)));
    let x = currentPos.x;
    let z = currentPos.z;
    let hitLabel = null;
    for (let step = 0; step < steps; step++) {
      const nextX = Math.max(b.minX + r, Math.min(b.maxX - r, x + dx / steps));
      const xHit = hitAt(nextX, z);
      if (xHit) hitLabel = xHit;
      else x = nextX;

      const nextZ = Math.max(b.minZ + r, Math.min(b.maxZ - r, z + dz / steps));
      const zHit = hitAt(x, nextZ);
      if (zHit) hitLabel = zHit;
      else z = nextZ;
    }
    if (!hitLabel && (Math.abs(x - desiredPos.x) > 1e-6 || Math.abs(z - desiredPos.z) > 1e-6)) {
      hitLabel = this.roomBoundsKnown ? 'Perimeter Wall' : 'Preview Limit';
    }
    return {
      position: new THREE.Vector3(x, this.standingHeight, z),
      collided: Boolean(hitLabel),
      hitLabel
    };
  }

  /**
   * Build a Three.js wireframe visualization group for collision volumes & walkable bounds.
   */
  createDebugVisuals() {
    const group = new THREE.Group();
    group.name = 'CollisionDebugOverlay';

    // Room boundary perimeter outline
    const b = this.roomBounds;
    const width = b.maxX - b.minX;
    const depth = b.maxZ - b.minZ;
    const centerX = (b.minX + b.maxX) / 2;
    const centerZ = (b.minZ + b.maxZ) / 2;

    const borderGeo = new THREE.BoxGeometry(width, 0.04, depth);
    const borderEdges = new THREE.EdgesGeometry(borderGeo);
    borderGeo.dispose();
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x48b878,
      transparent: true,
      opacity: 0.65
    });
    const borderWire = new THREE.LineSegments(borderEdges, borderMat);
    borderWire.position.set(centerX, 0.03, centerZ);
    group.add(borderWire);

    // Individual obstacle AABBs
    const boxMat = new THREE.LineBasicMaterial({
      color: 0xd99b4e,
      transparent: true,
      opacity: 0.85
    });

    for (const c of this.colliders) {
      const w = c.maxX - c.minX;
      const h = (c.maxY ?? 1.0) - (c.minY ?? 0);
      const d = c.maxZ - c.minZ;
      const cx = (c.minX + c.maxX) / 2;
      const cy = ((c.minY ?? 0) + (c.maxY ?? 1.0)) / 2;
      const cz = (c.minZ + c.maxZ) / 2;

      const geo = new THREE.BoxGeometry(w, h, d);
      const edges = new THREE.EdgesGeometry(geo);
      geo.dispose();
      const wire = new THREE.LineSegments(edges, boxMat);
      wire.position.set(cx, cy, cz);
      group.add(wire);
    }

    return group;
  }

  /**
   * Genuine 2D Grid A* Pathfinding with Obstacle Avoidance (Round 2 Extension Ready).
   * Discretizes the floor into 0.20m cells, marks obstacle-buffered cells unwalkable,
   * searches via 8-way Octile distance heuristic, and applies line-of-sight smoothing.
   *
   * @param {[number, number]} startXZ - [x, z] start coordinates
   * @param {[number, number]} goalXZ  - [x, z] target coordinates
   * @returns {{ points: Array<[number, number]>, distanceMeters: number } | null}
   */
  computeObstacleAwarePath(startXZ, goalXZ) {
    const cellSize = 0.2;
    const clearance = this.playerRadius + 0.06;
    const b = this.roomBounds;
    if (!this.isPointWalkable(startXZ[0], startXZ[1], clearance) ||
        !this.isPointWalkable(goalXZ[0], goalXZ[1], clearance)) return null;

    const cols = Math.ceil((b.maxX - b.minX) / cellSize);
    const rows = Math.ceil((b.maxZ - b.minZ) / cellSize);

    const toGrid = (x, z) => ({
      gx: Math.max(0, Math.min(cols - 1, Math.floor((x - b.minX) / cellSize))),
      gz: Math.max(0, Math.min(rows - 1, Math.floor((z - b.minZ) / cellSize)))
    });

    const toWorld = (gx, gz) => [
      b.minX + (gx + 0.5) * cellSize,
      b.minZ + (gz + 0.5) * cellSize
    ];

    const isCellFree = (gx, gz) => {
      if (gx < 0 || gx >= cols || gz < 0 || gz >= rows) return false;
      const [wx, wz] = toWorld(gx, gz);
      return this.isPointWalkable(wx, wz, clearance);
    };

    // Map valid world endpoints to nearby walkable grid cells.
    const findNearestWalkableCell = (origin, point) => {
      const reachable = (gx, gz) => isCellFree(gx, gz) &&
        this.isSegmentWalkable(point, toWorld(gx, gz), clearance);
      if (reachable(origin.gx, origin.gz)) return origin;
      for (let radius = 1; radius <= 8; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            const nx = origin.gx + dx;
            const nz = origin.gz + dz;
            if (reachable(nx, nz)) {
              return { gx: nx, gz: nz };
            }
          }
        }
      }
      return null;
    };

    const startCell = findNearestWalkableCell(toGrid(startXZ[0], startXZ[1]), startXZ);
    const goalCell = findNearestWalkableCell(toGrid(goalXZ[0], goalXZ[1]), goalXZ);
    if (!startCell || !goalCell) return null;

    const key = (gx, gz) => gz * cols + gx;
    const startKey = key(startCell.gx, startCell.gz);
    const goalKey = key(goalCell.gx, goalCell.gz);

    const openSet = new Set([startKey]);
    const cameFrom = new Map();
    const gScore = new Map([[startKey, 0]]);
    const fScore = new Map();

    const heuristic = (gx, gz) => {
      const dx = Math.abs(gx - goalCell.gx);
      const dz = Math.abs(gz - goalCell.gz);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };

    fScore.set(startKey, heuristic(startCell.gx, startCell.gz));

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2]
    ];

    let iterations = 0;
    const maxIterations = cols * rows * 2;

    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++;

      // Pick node in openSet with lowest fScore
      let currentKey = null;
      let lowestF = Infinity;
      for (const k of openSet) {
        const f = fScore.get(k) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          currentKey = k;
        }
      }

      if (currentKey === null) break;
      if (currentKey === goalKey) {
        // Reconstruct raw grid path
        const rawPath = [];
        let curr = currentKey;
        while (curr !== undefined) {
          const gz = Math.floor(curr / cols);
          const gx = curr % cols;
          rawPath.push(toWorld(gx, gz));
          curr = cameFrom.get(curr);
        }
        rawPath.reverse();
        if (startXZ[0] === goalXZ[0] && startXZ[1] === goalXZ[1]) {
          rawPath[0] = [startXZ[0], startXZ[1]];
        } else {
          rawPath.unshift([startXZ[0], startXZ[1]]);
          rawPath.push([goalXZ[0], goalXZ[1]]);
        }

        const smoothed = this.smoothPath(rawPath, clearance);
        let distanceMeters = 0;
        for (let i = 1; i < smoothed.length; i++) {
          const dx = smoothed[i][0] - smoothed[i - 1][0];
          const dz = smoothed[i][1] - smoothed[i - 1][1];
          distanceMeters += Math.hypot(dx, dz);
        }

        return {
          points: smoothed,
          distanceMeters: Number(distanceMeters.toFixed(2))
        };
      }

      openSet.delete(currentKey);
      const cz = Math.floor(currentKey / cols);
      const cx = currentKey % cols;
      const currentG = gScore.get(currentKey) ?? Infinity;

      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!isCellFree(nx, nz)) continue;
        if (!this.isSegmentWalkable(toWorld(cx, cz), toWorld(nx, nz), clearance)) continue;

        // Prevent corner cutting on diagonal moves
        if (dx !== 0 && dz !== 0) {
          if (!isCellFree(cx + dx, cz) || !isCellFree(cx, cz + dz)) continue;
        }

        const nKey = key(nx, nz);
        const tentativeG = currentG + cost;
        if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
          cameFrom.set(nKey, currentKey);
          gScore.set(nKey, tentativeG);
          fScore.set(nKey, tentativeG + heuristic(nx, nz));
          openSet.add(nKey);
        }
      }
    }

    return null;
  }

  /**
   * Line-of-sight string-pulling smoother so the A* path forms natural architectural segments
   * without cutting through any obstacle AABB.
   */
  smoothPath(rawPoints, clearance) {
    if (rawPoints.length <= 2) return rawPoints;

    const smoothed = [rawPoints[0]];
    let anchorIdx = 0;

    while (anchorIdx < rawPoints.length - 1) {
      let furthestVisible = anchorIdx + 1;
      for (let testIdx = rawPoints.length - 1; testIdx > anchorIdx + 1; testIdx--) {
        if (this.isSegmentWalkable(rawPoints[anchorIdx], rawPoints[testIdx], clearance)) {
          furthestVisible = testIdx;
          break;
        }
      }
      smoothed.push(rawPoints[furthestVisible]);
      anchorIdx = furthestVisible;
    }

    return smoothed;
  }
}
