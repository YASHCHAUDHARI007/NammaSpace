import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { CollisionSystem } from './collision.js';
import { DEFAULT_STANDING_HEIGHT, PLAYER_RADIUS } from '../config/scenes.js';
import {
  buildProceduralDemoRoom,
  buildReconstructionCalibrationStage,
  disposeObject3D
} from './createScene.js';

/**
 * NAMMA SPACE — Modular Scene Loader Architecture
 *
 * Supports three explicit scene pipelines:
 * 1. `demo`: Procedural Three.js baseline interior (clearly labeled as non-AI reference geometry).
 * 2. `glb` : glTF 2.0 / GLB polygon mesh reconstructions loaded via Three.js GLTFLoader.
 * 3. `splat`: 3D Gaussian Splat (.splat) captures rendered in Three.js with an explicit
 *             proxy collision layout (since Gaussian splats do not provide triangle collision meshes).
 *
 * Progress Reporting Policy:
 * Only genuine byte transfer metrics from XHR/fetch (`loadedBytes`, `totalBytes`) are reported.
 * Fake percentages are never fabricated.
 */

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
gltfLoader.setDRACOLoader(dracoLoader);

export function validateSceneConfig(scene) {
  if (!scene || !['demo', 'glb', 'splat'].includes(scene.mode)) {
    throw new Error('Invalid scene configuration: mode must be demo, glb, or splat.');
  }
  if (scene.mode === 'demo' && scene.isReconstructed) {
    throw new Error('Procedural demo geometry cannot be declared a real reconstruction.');
  }
  const b = scene.roomBounds;
  if (!b || !['minX', 'maxX', 'minZ', 'maxZ', 'floorY', 'ceilingY'].every((key) => Number.isFinite(b[key])) ||
      b.minX >= b.maxX || b.minZ >= b.maxZ || b.floorY !== 0 || b.ceilingY <= DEFAULT_STANDING_HEIGHT) {
    throw new Error('Invalid roomBounds: set finite X/Z limits, floorY=0, and ceilingY above standing eye height after aligning the asset to meters and Y-up.');
  }
  if (!Array.isArray(scene.colliders)) {
    throw new Error('Missing colliders: provide an explicit array of measured furniture/wall AABBs (or [] for a verified empty room).');
  }
  for (const collider of scene.colliders) {
    if (!collider || !['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'].every((key) => Number.isFinite(collider[key])) ||
        collider.minX >= collider.maxX || collider.minY >= collider.maxY || collider.minZ >= collider.maxZ) {
      throw new Error(`Invalid collider "${collider?.id || 'unnamed'}": use finite ordered min/max X, Y, and Z bounds in meters.`);
    }
  }
  const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
  if (!vector(scene.spawn?.position, 3) || scene.spawn.position[1] !== DEFAULT_STANDING_HEIGHT ||
      !Number.isFinite(scene.spawn.yaw) || !Number.isFinite(scene.spawn.pitch)) {
    throw new Error(`Invalid spawn: set finite [x, ${DEFAULT_STANDING_HEIGHT}, z], yaw, and pitch in the aligned world frame.`);
  }
  if (!Array.isArray(scene.pois)) throw new Error('Missing pois: provide an array, even when empty.');
  const collision = new CollisionSystem(scene);
  const start = [scene.spawn.position[0], scene.spawn.position[2]];
  if (!collision.isPointWalkable(...start, PLAYER_RADIUS + 0.06)) {
    throw new Error('Invalid spawn: position intersects room bounds or a collider at player clearance.');
  }
  for (const poi of scene.pois) {
    if (!poi || !vector(poi.position, 3) || !vector(poi.lookAt, 3) || !vector(poi.waypoint, 2) ||
        !collision.computeObstacleAwarePath(start, poi.waypoint)) {
      throw new Error(`Invalid POI "${poi?.id || 'unnamed'}": set finite position/lookAt and a reachable, clear waypoint.`);
    }
  }
  if (scene.isReconstructed) {
    const c = scene.calibration;
    if (!c || typeof c.captureSource !== 'string' || !c.captureSource.trim() ||
        c.upAxis !== 'Y' || c.metersPerAssetUnit !== 1 ||
        typeof c.originDescription !== 'string' || !c.originDescription.trim() ||
        !Number.isFinite(c.referenceDistanceMeters) || c.referenceDistanceMeters <= 0 ||
        !Number.isFinite(c.referenceDistanceAssetUnits) || c.referenceDistanceAssetUnits <= 0) {
      throw new Error('Real capture calibration is incomplete: document captureSource, Y-up, 1 meter per asset unit, originDescription, and positive measured reference distances.');
    }
  }
}

/**
 * Load a scene according to its configuration object.
 *
 * @param {object} sceneConfig - Entry from `src/config/scenes.js` or custom user file config.
 * @param {object} callbacks - `{ onProgress: ({ loadedBytes, totalBytes, percent }) => void }`
 * @returns {Promise<{ rootGroup: THREE.Group, stats: object, extractedColliders: Array }>}
 */
export async function loadSpatialScene(sceneConfig, callbacks = {}) {
  const onProgress = callbacks.onProgress || (() => { });
  validateSceneConfig(sceneConfig);

  switch (sceneConfig.mode) {
    case 'demo':
      return loadProceduralDemoScene(sceneConfig);

    case 'glb':
      return loadGlbMeshScene(sceneConfig, onProgress);

    case 'splat':
      // Spark 2 (level-of-detail splat renderer) is the default whenever the caller hands us the
      // WebGL renderer; `renderer: 'gs3d'` keeps the previous GaussianSplats3D path as a fallback.
      if (callbacks.renderer && sceneConfig.renderer !== 'gs3d') {
        return loadSparkSplatScene(sceneConfig, onProgress, callbacks.signal, callbacks.renderer);
      }
      return loadGaussianSplatScene(sceneConfig, onProgress, callbacks.signal);

    default:
      throw new Error(`Unsupported scene mode "${sceneConfig.mode}". Expected "demo", "glb", or "splat".`);
  }
}

/**
 * Mode 1: Procedural Baseline Room (No fake network delay or fabricated progress).
 */
async function loadProceduralDemoScene(sceneConfig) {
  const rootGroup = buildProceduralDemoRoom();

  let vertexCount = 0;
  let triangleCount = 0;
  rootGroup.traverse((obj) => {
    if (obj.isMesh && obj.geometry) {
      const pos = obj.geometry.attributes.position;
      if (pos) vertexCount += pos.count;
      if (obj.geometry.index) {
        triangleCount += obj.geometry.index.count / 3;
      } else if (pos) {
        triangleCount += pos.count / 3;
      }
    }
  });

  return {
    rootGroup,
    extractedColliders: [],
    stats: {
      mode: 'demo',
      isReconstructed: false,
      vertexCount: Math.round(vertexCount),
      triangleCount: Math.round(triangleCount),
      splatCount: null,
      collisionCount: sceneConfig.colliders?.length || 0,
      provenanceNote: 'Procedural Three.js baseline geometry (not AI-reconstructed)'
    }
  };
}

/**
 * Mode 2: Reconstructed GLB / glTF Mesh Loader via Three.js GLTFLoader.
 */
async function loadGlbMeshScene(sceneConfig, onProgress) {
  if (!sceneConfig.assetUrl) {
    throw new Error('glTF scene configuration is missing `assetUrl`. Add a .glb or .gltf asset URL.');
  }

  const gltf = await new Promise((resolve, reject) => {
    gltfLoader.load(
      sceneConfig.assetUrl,
      (loaded) => resolve(loaded),
      (event) => {
        if (event && event.lengthComputable && event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress({
            loadedBytes: event.loaded,
            totalBytes: event.total,
            percent
          });
        } else {
          onProgress({
            loadedBytes: event?.loaded || 0,
            totalBytes: null,
            percent: null
          });
        }
      },
      (err) => {
        reject(
          new Error(
            `Failed to load glTF asset "${sceneConfig.name || sceneConfig.assetUrl}". Verify the URL or local file is valid glTF 2.0 (.glb or .gltf). Local .gltf imports need embedded buffers and textures; otherwise provide those files at resolvable URLs. (${err?.message || 'Loader error'})`
          )
        );
      }
    );
  });

  const modelRoot = gltf.scene || gltf.scenes?.[0];
  if (!modelRoot) {
    throw new Error(`glTF asset "${sceneConfig.name || sceneConfig.assetUrl}" contains no valid scene graph.`);
  }

  let vertexCount = 0;
  let triangleCount = 0;
  const extractedColliders = [];

  modelRoot.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.geometry) {
        const pos = child.geometry.attributes.position;
        if (pos) vertexCount += pos.count;
        if (child.geometry.index) {
          triangleCount += child.geometry.index.count / 3;
        } else if (pos) {
          triangleCount += pos.count / 3;
        }
      }

    }
  });

  if (!vertexCount) {
    throw new Error(`glTF asset "${sceneConfig.name || sceneConfig.assetUrl}" contains no renderable mesh. Export a GLB/glTF with visible mesh geometry.`);
  }
  const rootGroup = new THREE.Group();
  rootGroup.name = `GLBScene_${sceneConfig.id}`;
  // The placeholder grid floor is only for uncalibrated previews; it would z-fight a real scanned floor.
  if (!sceneConfig.isReconstructed) rootGroup.add(buildReconstructionCalibrationStage(sceneConfig.roomBounds));

  rootGroup.add(modelRoot);

  return {
    rootGroup,
    extractedColliders,
    stats: {
      mode: 'glb',
      isReconstructed: sceneConfig.isReconstructed === true,
      vertexCount: Math.round(vertexCount),
      triangleCount: Math.round(triangleCount),
      splatCount: null,
      collisionCount: (sceneConfig.colliders?.length || 0) + extractedColliders.length,
      provenanceNote: `Loaded glTF 2.0 mesh (${sceneConfig.assetUrl})`
    }
  };
}

/**
 * Standard antimatter15 .splat: 32-byte little-endian records containing
 * float32 position (xyz), float32 scale (xyz), uint8 RGBA, and uint8
 * quaternion (wxyz). The installed GaussianSplats3D parser owns decoding,
 * covariance projection, alpha blending, and depth sorting.
 */
export function validateSplatBuffer(buffer) {
  if (!buffer.byteLength || buffer.byteLength % 32 !== 0) {
    throw new Error('Invalid .splat file: size must be a nonzero multiple of 32 bytes (xyz, scale, RGBA, quaternion).');
  }
  const view = new DataView(buffer);
  for (let offset = 0; offset < buffer.byteLength; offset += 32) {
    for (let field = 0; field < 6; field++) {
      const value = view.getFloat32(offset + field * 4, true);
      if (!Number.isFinite(value) || (field >= 3 && value <= 0)) {
        throw new Error(`Invalid .splat record ${offset / 32 + 1}: position must be finite and scales must be positive.`);
      }
    }
    if (view.getUint8(offset + 28) === 128 && view.getUint8(offset + 29) === 128 &&
        view.getUint8(offset + 30) === 128 && view.getUint8(offset + 31) === 128) {
      throw new Error(`Invalid .splat record ${offset / 32 + 1}: zero-length quaternion.`);
    }
  }
  return buffer.byteLength / 32;
}

async function fetchSplatBuffer(url, onProgress, signal) {
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Could not request .splat asset "${url}": ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`Could not load .splat asset "${url}" (HTTP ${response.status}). Check the asset path and server response.`);
  }
  const headerLength = Number(response.headers.get('content-length'));
  const totalBytes = Number.isFinite(headerLength) && headerLength > 0 ? headerLength : null;
  const chunks = [];
  let loadedBytes = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loadedBytes += value.byteLength;
      onProgress({ loadedBytes, totalBytes, percent: totalBytes ? Math.min(100, Math.round(loadedBytes / totalBytes * 100)) : null });
    }
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer());
    chunks.push(bytes);
    loadedBytes = bytes.byteLength;
    onProgress({ loadedBytes, totalBytes, percent: totalBytes ? 100 : null });
  }
  if (totalBytes !== null && totalBytes !== loadedBytes) {
    throw new Error(`Incomplete .splat download from "${url}": received ${loadedBytes} of ${totalBytes} bytes.`);
  }
  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function loadGaussianSplatScene(sceneConfig, onProgress, signal) {
  if (!sceneConfig.assetUrl) {
    throw new Error('Splat scene configuration is missing assetUrl. Add a standard .splat file to public/scenes/.');
  }
  const buffer = await fetchSplatBuffer(sceneConfig.assetUrl, onProgress, signal);
  if (signal?.aborted) throw new DOMException('Scene load cancelled', 'AbortError');
  // .ksplat (the library's compressed format) can carry spherical harmonics, i.e. view-dependent
  // colour; plain .splat stores base colour only.
  const isKSplat = sceneConfig.splatFormat === 'ksplat' || /\.ksplat(?:$|[?#])/i.test(sceneConfig.assetUrl);
  const splatCount = isKSplat ? null : validateSplatBuffer(buffer);
  const shDegree = isKSplat ? Math.max(0, Math.min(2, sceneConfig.sphericalHarmonicsDegree ?? 0)) : 0;
  const rootGroup = new THREE.Group();
  rootGroup.name = `GaussianSplatScene_${sceneConfig.id}`;
  // The placeholder grid floor is only for uncalibrated previews; it would z-fight a real scanned floor.
  if (!sceneConfig.isReconstructed) rootGroup.add(buildReconstructionCalibrationStage(sceneConfig.roomBounds));
  const viewer = new GaussianSplats3D.DropInViewer({
    gpuAcceleratedSort: false,
    sharedMemoryForWorkers: false,
    sphericalHarmonicsDegree: shDegree,
    // The default reveal grows a visible sphere per rendered frame; on slower GPUs the far
    // end of a room stays black for many seconds. Show the whole capture at once.
    sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant
  });
  let blobUrl;
  try {
    blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }));
    const load = viewer.addSplatScene(blobUrl, {
      format: isKSplat ? GaussianSplats3D.SceneFormat.KSplat : GaussianSplats3D.SceneFormat.Splat,
      showLoadingUI: false,
      progressiveLoad: false,
      splatAlphaRemovalThreshold: 1
    });
    const abortLoad = () => load.abort('Scene replaced');
    signal?.addEventListener('abort', abortLoad, { once: true });
    try {
      await load.promise;
    } finally {
      signal?.removeEventListener('abort', abortLoad);
    }
    if (signal?.aborted) throw new DOMException('Scene load cancelled', 'AbortError');
    rootGroup.add(viewer);
    return {
      rootGroup,
      extractedColliders: [],
      stats: {
        mode: 'splat',
        isReconstructed: sceneConfig.isReconstructed === true,
        vertexCount: null,
        triangleCount: null,
        splatCount: viewer.splatMesh?.getSplatCount() ?? splatCount,
        collisionCount: sceneConfig.colliders?.length || 0,
        provenanceNote: isKSplat
          ? `Loaded .ksplat asset (spherical harmonics degree ${shDegree}) with explicit proxy collision bounds`
          : `Loaded standard 32-byte .splat asset with explicit proxy collision bounds`
      }
    };
  } catch (error) {
    await viewer.dispose().catch(() => {});
    disposeObject3D(rootGroup);
    if (signal?.aborted) throw new DOMException('Scene load cancelled', 'AbortError');
    throw new Error(`Could not render .splat asset "${sceneConfig.assetUrl}": ${error.message}`);
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

const SPARK_FILE_TYPES = { ksplat: 'ksplat', splat: 'splat', ply: 'ply', spz: 'spz', sog: 'pcsogszip', rad: 'rad' };

function splatFileType(sceneConfig) {
  if (sceneConfig.splatFormat) return SPARK_FILE_TYPES[sceneConfig.splatFormat] || sceneConfig.splatFormat;
  const ext = /\.([a-z0-9]+)(?:$|[?#])/i.exec(sceneConfig.assetUrl)?.[1]?.toLowerCase();
  return SPARK_FILE_TYPES[ext] || 'splat';
}

/**
 * Mode 3 (default): Spark 2 renderer.
 * - `.rad` assets are pre-built LoD trees streamed page by page with HTTP range requests, so the
 *   coarse room appears after the first pages and detail fills in while the user looks around.
 * - Other formats (.ksplat/.splat/.ply/.spz) are downloaded once and given a LoD tree in a worker.
 * Either way Spark draws a fixed per-device splat budget each frame (≈2.5M desktop, 1–1.5M mobile),
 * which keeps frame rates smooth on phones regardless of how large the capture is.
 */
async function loadSparkSplatScene(sceneConfig, onProgress, signal, renderer) {
  if (!sceneConfig.assetUrl) {
    throw new Error('Splat scene configuration is missing assetUrl. Add a splat asset to public/scenes/.');
  }
  const { SparkRenderer, SplatMesh } = await import('@sparkjsdev/spark');
  if (signal?.aborted) throw new DOMException('Scene load cancelled', 'AbortError');

  const fileType = splatFileType(sceneConfig);
  const streamed = fileType === 'rad';
  const rootGroup = new THREE.Group();
  rootGroup.name = `SparkSplatScene_${sceneConfig.id}`;
  if (!sceneConfig.isReconstructed) rootGroup.add(buildReconstructionCalibrationStage(sceneConfig.roomBounds));

  // Resolves once Spark has finished its first sort/LoD pass with the mesh in the scene, i.e. the
  // first frame that shows the room rather than an unsorted blur.
  // Spark raises `onDirty` once and then waits for the app to clear `dirty` (it expects on-demand
  // rendering). We render every frame, so clear it ourselves and resolve once the first sort has
  // produced visible splats (`activeSplats`), i.e. the first frame that shows the room.
  let markFirstFrame;
  let meshAdded = false;
  rootGroup.userData.firstFrameReady = new Promise((resolve) => {
    markFirstFrame = resolve;
  });
  const spark = new SparkRenderer({
    renderer,
    onDirty: () => {
      spark.dirty = false;
      if (meshAdded && spark.activeSplats > 0) markFirstFrame();
    },
    // Skip splats smaller than ~1.5 px on screen: visually identical, noticeably cheaper on phones.
    lodRenderScale: sceneConfig.lodRenderScale ?? 1.5
  });
  spark.name = 'SparkRenderer';
  rootGroup.add(spark);

  let mesh;
  try {
    if (streamed) {
      mesh = new SplatMesh({ url: sceneConfig.assetUrl, paged: true });
    } else {
      const buffer = await fetchSplatBuffer(sceneConfig.assetUrl, onProgress, signal);
      if (signal?.aborted) throw new DOMException('Scene load cancelled', 'AbortError');
      if (fileType === 'splat') validateSplatBuffer(buffer);
      mesh = new SplatMesh({ fileBytes: new Uint8Array(buffer), fileType, lod: true });
    }
    mesh.name = `SplatMesh_${sceneConfig.id}`;
    await mesh.initialized;
    if (signal?.aborted) throw new DOMException('Scene load cancelled', 'AbortError');
    rootGroup.add(mesh);
    meshAdded = true;
    spark.dirty = false;
    // Spark replaces the source splats with a LoD tree (original leaves + merged parent splats);
    // each frame draws a per-device subset of it.
    const lodCount = mesh.packedSplats?.lodSplats?.numSplats || mesh.extSplats?.lodSplats?.numSplats || 0;
    const sourceCount = mesh.packedSplats?.numSplats || mesh.splats?.getNumSplats?.() || 0;
    const splatCount = sourceCount || lodCount || null;
    return {
      rootGroup,
      stats: {
        mode: 'splat',
        triangleCount: null,
        splatCount,
        collisionCount: sceneConfig.colliders?.length || 0,
        provenanceNote: streamed
          ? 'Streaming .rad level-of-detail splats with Spark 2 (HTTP range pages) and explicit proxy collision bounds'
          : `Loaded .${fileType} with Spark 2 (level-of-detail tree of ${lodCount.toLocaleString()} splats built in a worker) and explicit proxy collision bounds`
      }
    };
  } catch (error) {
    mesh?.dispose();
    spark.dispose();
    if (signal?.aborted || error?.name === 'AbortError') throw new DOMException('Scene load cancelled', 'AbortError');
    throw new Error(`Could not render splat asset "${sceneConfig.assetUrl}" with Spark: ${error.message}`);
  }
}

/** Dispose Three.js resources and the splat viewer's worker, textures, and buffers. */
export async function disposeSpatialScene(rootGroup) {
  if (!rootGroup) return;
  const viewers = [];
  rootGroup.traverse((child) => {
    if (child instanceof GaussianSplats3D.DropInViewer) viewers.push(child);
  });
  for (const viewer of viewers) {
    viewer.removeFromParent();
    await viewer.dispose().catch(() => {});
    disposeObject3D(viewer.callbackMesh);
  }
  // Spark objects own GPU textures and worker state; release them before the generic traversal.
  const sparkObjects = [];
  rootGroup.traverse((child) => {
    if (child.name === 'SparkRenderer' || child.name?.startsWith('SplatMesh_')) sparkObjects.push(child);
  });
  for (const obj of sparkObjects) {
    obj.removeFromParent();
    try {
      obj.dispose?.();
    } catch {
      // Already released (e.g. load was cancelled mid-way).
    }
  }
  disposeObject3D(rootGroup);
}
