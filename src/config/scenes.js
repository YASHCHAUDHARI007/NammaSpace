/**
 * NAMMA SPACE — Scene Configuration Registry
 *
 * Only real reconstructions are registered here, so the viewer lists only rendered rooms.
 * Synthetic test scenes live in `fixtureScenes.js` and are used by the test suite only.
 *
 * Architectural Separation Note:
 * - `mode: 'demo'` uses procedural Three.js geometry (`src/viewer/createScene.js`) strictly as a
 *   baseline test environment for controls, collision physics, and Round 2 wayfinding hooks.
 *   It is NEVER misrepresented as AI-reconstructed output.
 * - `mode: 'glb'` loads external polygon mesh reconstructions (.glb / .gltf) via Three.js GLTFLoader.
 * - `mode: 'splat'` loads standard 32-byte 3D Gaussian Splat assets (.splat) via the Gaussian Splat
 *   pipeline with a separate proxy collision layout (since splats are volumetric Gaussians without mesh faces).
 */

import { CLASSROOM_SCENE, DEFAULT_STANDING_HEIGHT, PLAYER_RADIUS } from './classroomScene.js';
import { FLOOR_PREVIEW_SCENE } from './floorPreviewScene.js';

export { DEFAULT_STANDING_HEIGHT, PLAYER_RADIUS };

export const SCENES = {
  [CLASSROOM_SCENE.id]: CLASSROOM_SCENE,
  [FLOOR_PREVIEW_SCENE.id]: FLOOR_PREVIEW_SCENE
};

export const DEFAULT_SCENE_ID = 'nammaspace-classroom';

export function getSceneConfig(sceneId) {
  return SCENES[sceneId] || SCENES[DEFAULT_SCENE_ID];
}

export function getSceneList() {
  return Object.values(SCENES);
}
