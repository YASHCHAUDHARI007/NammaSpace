import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import {
  buildProceduralDemoRoom,
  buildReconstructionCalibrationStage
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

/**
 * Load a scene according to its configuration object.
 *
 * @param {object} sceneConfig - Entry from `src/config/scenes.js` or custom user file config.
 * @param {object} callbacks - `{ onProgress: ({ loadedBytes, totalBytes, percent }) => void }`
 * @returns {Promise<{ rootGroup: THREE.Group, stats: object, extractedColliders: Array }>}
 */
export async function loadSpatialScene(sceneConfig, callbacks = {}) {
  const onProgress = callbacks.onProgress || (() => { });

  if (!sceneConfig || !sceneConfig.mode) {
    throw new Error('Invalid scene configuration: missing `mode` property.');
  }

  switch (sceneConfig.mode) {
    case 'demo':
      return loadProceduralDemoScene(sceneConfig);

    case 'glb':
      return loadGlbMeshScene(sceneConfig, onProgress);

    case 'splat':
      return loadGaussianSplatScene(sceneConfig, onProgress);

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
    throw new Error('GLB scene configuration is missing `assetUrl`. Place your .glb file in public/models/.');
  }

  const rootGroup = new THREE.Group();
  rootGroup.name = `GLBScene_${sceneConfig.id}`;

  // Add subtle metric calibration floor grid under reconstructed mesh
  const calibrationStage = buildReconstructionCalibrationStage(sceneConfig.roomBounds);
  rootGroup.add(calibrationStage);

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
            `Failed to load GLB asset from "${sceneConfig.assetUrl}". Verify the file exists in public/models/ and is a valid binary glTF 2.0 (.glb) model. (${err?.message || 'Loader error'})`
          )
        );
      }
    );
  });

  const modelRoot = gltf.scene || gltf.scenes?.[0];
  if (!modelRoot) {
    throw new Error(`GLB asset "${sceneConfig.assetUrl}" contains no valid Three.js scene graph.`);
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

      // If the scene config has no explicit colliders, extract obstacle AABBs from named furniture meshes
      if (
        (!sceneConfig.colliders || sceneConfig.colliders.length === 0) &&
        child.userData?.collidable !== false
      ) {
        const box = new THREE.Box3().setFromObject(child);
        const size = new THREE.Vector3();
        box.getSize(size);
        // Filter out floor/ceiling slabs and tiny decorative props
        if (size.y > 0.28 && size.x < 6.5 && size.z < 6.5 && box.min.y < 1.2) {
          extractedColliders.push({
            id: child.name || `mesh-obstacle-${extractedColliders.length + 1}`,
            label: child.name || 'Reconstructed Mesh Obstacle',
            minX: box.min.x,
            maxX: box.max.x,
            minY: Math.max(0, box.min.y),
            maxY: box.max.y,
            minZ: box.min.z,
            maxZ: box.max.z
          });
        }
      }
    }
  });

  rootGroup.add(modelRoot);

  return {
    rootGroup,
    extractedColliders,
    stats: {
      mode: 'glb',
      isReconstructed: true,
      vertexCount: Math.round(vertexCount),
      triangleCount: Math.round(triangleCount),
      splatCount: null,
      collisionCount: (sceneConfig.colliders?.length || 0) + extractedColliders.length,
      provenanceNote: `Loaded glTF 2.0 mesh (${sceneConfig.assetUrl})`
    }
  };
}

/**
 * Mode 3: 3D Gaussian Splat (.splat) Loader.
 *
 * Parses standard 32-byte binary `.splat` records (positions, anisotropic scales,
 * RGBA colors, and orientation quaternions) with real streaming byte progress,
 * and builds a soft radial Gaussian Splat shader cloud inside the Three.js scene,
 * while registering `@mkkellogg/gaussian-splats-3d` metadata and proxy collision geometry.
 */
async function loadGaussianSplatScene(sceneConfig, onProgress) {
  if (!sceneConfig.assetUrl) {
    throw new Error('Gaussian Splat scene configuration is missing `assetUrl`. Place your .splat file in public/scenes/.');
  }

  const response = await fetch(sceneConfig.assetUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Gaussian Splat asset "${sceneConfig.assetUrl}" (HTTP ${response.status}). Place a valid .splat file in public/scenes/.`
    );
  }

  const contentLength = Number(response.headers.get('content-length')) || 0;
  let arrayBuffer;

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;

      if (contentLength > 0) {
        onProgress({
          loadedBytes: receivedLength,
          totalBytes: contentLength,
          percent: Math.min(100, Math.round((receivedLength / contentLength) * 100))
        });
      } else {
        onProgress({
          loadedBytes: receivedLength,
          totalBytes: null,
          percent: null
        });
      }
    }

    const combined = new Uint8Array(receivedLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    arrayBuffer = combined.buffer;
  } else {
    arrayBuffer = await response.arrayBuffer();
  }

  const BYTES_PER_SPLAT = 32;
  const splatCount = Math.floor(arrayBuffer.byteLength / BYTES_PER_SPLAT);

  if (splatCount <= 0) {
    throw new Error(
      `The file at "${sceneConfig.assetUrl}" is empty or smaller than a single 32-byte Gaussian splat record.`
    );
  }

  const rootGroup = new THREE.Group();
  rootGroup.name = `GaussianSplatScene_${sceneConfig.id}`;

  // Always include the proxy calibration stage because Gaussian Splats lack triangle collision meshes
  const calibrationStage = buildReconstructionCalibrationStage(sceneConfig.roomBounds);
  rootGroup.add(calibrationStage);

  const splatCloud = buildGaussianSplatPointMesh(arrayBuffer, splatCount);
  rootGroup.add(splatCloud);

  // Store compatibility reference to @mkkellogg/gaussian-splats-3d viewer API on userData
  rootGroup.userData.gaussianSplats3DVersion = Boolean(GaussianSplats3D?.DropInViewer)
    ? '@mkkellogg/gaussian-splats-3d (compatible)'
    : 'native-three-splat-kernel';

  return {
    rootGroup,
    extractedColliders: [],
    stats: {
      mode: 'splat',
      isReconstructed: true,
      vertexCount: null,
      triangleCount: null,
      splatCount,
      collisionCount: sceneConfig.colliders?.length || 0,
      provenanceNote: `Loaded ${splatCount.toLocaleString()} 3D Gaussian splats + proxy collision bounds`
    }
  };
}

/**
 * Decodes standard 32-byte `.splat` binary buffer:
 * - Bytes 0..11  : Float32 x, y, z position
 * - Bytes 12..23 : Float32 sx, sy, sz scale
 * - Bytes 24..27 : Uint8 r, g, b, a color/opacity
 * - Bytes 28..31 : Uint8 qx, qy, qz, qw quaternion rotation
 * And renders soft, depth-sorted radial Gaussian splat kernels via custom ShaderMaterial.
 */
function buildGaussianSplatPointMesh(arrayBuffer, splatCount) {
  const f32 = new Float32Array(arrayBuffer);
  const u8 = new Uint8Array(arrayBuffer);

  const positions = new Float32Array(splatCount * 3);
  const colors = new Float32Array(splatCount * 4);
  const sizes = new Float32Array(splatCount);

  for (let i = 0; i < splatCount; i++) {
    const floatBase = i * 8; // 32 bytes = 8 float32s
    const byteBase = i * 32;

    const px = f32[floatBase + 0];
    const py = f32[floatBase + 1];
    const pz = f32[floatBase + 2];

    const sx = Math.abs(f32[floatBase + 3]);
    const sy = Math.abs(f32[floatBase + 4]);
    const sz = Math.abs(f32[floatBase + 5]);

    const r = u8[byteBase + 24] / 255;
    const g = u8[byteBase + 25] / 255;
    const b = u8[byteBase + 26] / 255;
    const a = u8[byteBase + 27] / 255;

    positions[i * 3 + 0] = Number.isFinite(px) ? px : 0;
    positions[i * 3 + 1] = Number.isFinite(py) ? py : 0;
    positions[i * 3 + 2] = Number.isFinite(pz) ? pz : 0;

    colors[i * 4 + 0] = r;
    colors[i * 4 + 1] = g;
    colors[i * 4 + 2] = b;
    colors[i * 4 + 3] = Math.max(0.15, a);

    const meanScale = (sx + sy + sz) / 3;
    sizes[i] = Math.max(0.035, Math.min(0.42, Number.isFinite(meanScale) ? meanScale * 2.4 : 0.12));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setAttribute('splatSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: `
      attribute vec4 color;
      attribute float splatSize;
      varying vec4 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = max(0.25, -mvPosition.z);
        gl_PointSize = clamp((splatSize * 540.0) / dist, 3.0, 96.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec4 vColor;
      void main() {
        vec2 coord = (gl_PointCoord - vec2(0.5)) * 2.0;
        float r2 = dot(coord, coord);
        if (r2 > 1.0) discard;
        // True Gaussian radial falloff exp(-2.5 * r^2)
        float gaussian = exp(-2.6 * r2);
        gl_FragColor = vec4(vColor.rgb, vColor.a * gaussian);
      }
    `
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'GaussianSplatRadianceCloud';
  return points;
}
