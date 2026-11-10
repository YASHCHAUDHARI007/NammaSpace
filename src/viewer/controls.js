import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { DEFAULT_STANDING_HEIGHT } from '../config/scenes.js';

/**
 * NAMMA SPACE — First-Person Spatial Controller
 *
 * Wraps Three.js PointerLockControls with:
 * - Normalized horizontal movement vector (diagonal movement is never faster than cardinal movement).
 * - Standing eye-height constraint.
 * - Collision resolution hook via CollisionSystem.
 * - Graceful recovery on pointer-lock exit, ESC, window blur, and tab visibility change.
 * - Drag-to-look fallback & mobile touch input support when pointer lock is unavailable.
 * - Smooth animated camera pose transitions for POI inspection & view resets.
 */
export class FirstPersonController {
  constructor(camera, domElement, collisionSystem, callbacks = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.collisionSystem = collisionSystem;
    this.onLockChange = callbacks.onLockChange || (() => { });
    this.onCollision = callbacks.onCollision || (() => { });

    this.pointerLock = new PointerLockControls(this.camera, this.domElement);
    this.pointerLock.minPolarAngle = Math.PI * 0.12; // prevent flipping overhead
    this.pointerLock.maxPolarAngle = Math.PI * 0.88; // prevent flipping underfoot

    this.moveSpeed = 3.2; // world units per second (configurable)
    this.standingHeight = DEFAULT_STANDING_HEIGHT;

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false
    };

    // Drag-to-look fallback state (for unlocked exploration or touch devices)
    this.isDragging = false;
    this.prevPointer = { x: 0, y: 0 };
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');

    // Smooth camera transition state (for POI focus / Reset view)
    this.activeTransition = null;

    // Reusable math vectors
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();
    this._desiredPos = new THREE.Vector3();

    this._bindEvents();
  }

  _bindEvents() {
    this._onPointerLockChange = () => {
      const locked = this.pointerLock.isLocked;
      if (!locked) {
        this.clearKeys();
      }
      this.onLockChange(locked);
    };

    this._onPointerLockError = () => {
      // Gracefully fall back to drag-to-look if browser blocks PointerLock
      this.clearKeys();
      this.onLockChange(false);
    };

    this._onKeyDown = (event) => {
      // Ignore keyboard movement when typing in the POI search input
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          this.activeTransition = null;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          this.activeTransition = null;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          this.activeTransition = null;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          this.activeTransition = null;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = true;
          break;
        default:
          break;
      }
    };

    this._onKeyUp = (event) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = false;
          break;
        default:
          break;
      }
    };

    this._onWindowBlur = () => {
      this.clearKeys();
      this.isDragging = false;
    };

    this._onVisibilityChange = () => {
      if (document.hidden) {
        this.clearKeys();
        this.isDragging = false;
      }
    };

    // Mouse / Touch drag-to-look when pointer lock is not engaged
    this._onPointerDown = (e) => {
      if (this.pointerLock.isLocked) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      this.isDragging = true;
      this.prevPointer.x = e.clientX;
      this.prevPointer.y = e.clientY;
    };

    this._onPointerMove = (e) => {
      if (this.pointerLock.isLocked || !this.isDragging) return;
      const dx = e.clientX - this.prevPointer.x;
      const dy = e.clientY - this.prevPointer.y;
      this.prevPointer.x = e.clientX;
      this.prevPointer.y = e.clientY;

      const sensitivity = 0.0032;
      this.euler.setFromQuaternion(this.camera.quaternion);
      this.euler.y -= dx * sensitivity;
      this.euler.x -= dy * sensitivity;
      const maxPitch = Math.PI * 0.38;
      this.euler.x = Math.max(-maxPitch, Math.min(maxPitch, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    };

    this._onPointerUp = () => {
      this.isDragging = false;
    };

    this.pointerLock.addEventListener('lock', this._onPointerLockChange);
    this.pointerLock.addEventListener('unlock', this._onPointerLockChange);
    document.addEventListener('pointerlockerror', this._onPointerLockError);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onWindowBlur);
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
  }

  /**
   * Reset all movement keys to false (prevents stuck movement on focus loss or ESC).
   */
  clearKeys() {
    this.keys.forward = false;
    this.keys.backward = false;
    this.keys.left = false;
    this.keys.right = false;
    this.keys.sprint = false;
  }

  /**
   * Programmatically set a virtual movement key (used by mobile touch D-pad).
   */
  setVirtualKey(direction, active) {
    if (direction in this.keys) {
      this.keys[direction] = Boolean(active);
      if (active) {
        this.activeTransition = null;
      }
    }
  }

  /**
   * Engage pointer lock on the 3D canvas.
   */
  lock() {
    try {
      const policy = document.permissionsPolicy || document.featurePolicy;
      if (policy?.allowsFeature && !policy.allowsFeature('pointer-lock')) {
        this.onLockChange(false);
        return;
      }
      if (!this.pointerLock.isLocked && this.domElement?.requestPointerLock) {
        const request = this.domElement.requestPointerLock();
        if (request?.catch) request.catch(() => this._onPointerLockError());
      }
    } catch {
      this.onLockChange(false);
    }
  }

  /**
   * Release pointer lock.
   */
  unlock() {
    try {
      if (this.pointerLock.isLocked) {
        this.pointerLock.unlock();
      }
    } catch {
      // Ignore unlock errors
    }
    this.clearKeys();
  }

  setMoveSpeed(speedMetersPerSec) {
    const numeric = Number(speedMetersPerSec);
    if (!Number.isNaN(numeric) && numeric >= 1.0 && numeric <= 8.0) {
      this.moveSpeed = numeric;
    }
  }

  /**
   * Instantly set camera pose (position + yaw/pitch).
   */
  setPose(positionArray, yaw = 0, pitch = -0.04) {
    this.activeTransition = null;
    this.clearKeys();
    const [x, y, z] = positionArray || [0, this.standingHeight, 3.0];
    this.camera.position.set(x, y ?? this.standingHeight, z);
    this.euler.set(pitch, yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);
  }

  cancelTransition() {
    this.activeTransition = null;
  }

  /**
   * Smoothly transition camera to a waypoint and look at a 3D target (used by POI selection).
   */
  transitionToTarget(waypointXZ, lookAtXYZ, durationSec = 1.05, pathPointsXZ = null) {
    const startPos = this.camera.position.clone();
    const endPos = new THREE.Vector3(
      waypointXZ[0],
      this.standingHeight,
      waypointXZ[1]
    );

    const startQuat = this.camera.quaternion.clone();
    const dummyCam = this.camera.clone();
    dummyCam.position.copy(endPos);
    dummyCam.lookAt(new THREE.Vector3(lookAtXYZ[0], lookAtXYZ[1], lookAtXYZ[2]));
    const endQuat = dummyCam.quaternion.clone();

    const path = Array.isArray(pathPointsXZ) && pathPointsXZ.length > 1
      ? pathPointsXZ.map(([x, z]) => new THREE.Vector3(x, this.standingHeight, z))
      : [startPos, endPos];
    const distances = [0];
    for (let i = 1; i < path.length; i++) {
      distances.push(distances[i - 1] + path[i].distanceTo(path[i - 1]));
    }

    this.activeTransition = {
      startPos,
      endPos,
      startQuat,
      endQuat,
      path,
      distances,
      elapsed: 0,
      duration: Math.max(0.25, durationSec)
    };
  }

  /**
   * Frame update step called inside requestAnimationFrame.
   */
  update(deltaSeconds) {
    // Clamp delta to avoid teleporting after tab switch
    const dt = Math.min(deltaSeconds, 0.1);

    // 1. Handle smooth animated POI / Reset transitions
    if (this.activeTransition) {
      const tr = this.activeTransition;
      tr.elapsed += dt;
      const rawT = Math.min(1, tr.elapsed / tr.duration);
      // Cubic ease-in-out
      const t = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

      const travel = t * tr.distances[tr.distances.length - 1];
      let segment = 1;
      while (segment < tr.distances.length - 1 && tr.distances[segment] < travel) segment++;
      const start = tr.distances[segment - 1];
      const length = tr.distances[segment] - start;
      const fraction = length > 0 ? (travel - start) / length : 1;
      this.camera.position.lerpVectors(tr.path[segment - 1], tr.path[segment], fraction);
      this.camera.position.y = this.standingHeight;
      this.camera.quaternion.slerpQuaternions(tr.startQuat, tr.endQuat, t);

      if (rawT >= 1) {
        this.activeTransition = null;
      }
      return;
    }

    // 2. Calculate local input vector
    const inputZ = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0);
    const inputX = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);

    if (inputX === 0 && inputZ === 0) {
      // Ensure standing height remains constrained
      this.camera.position.y = this.standingHeight;
      return;
    }

    // Extract horizontal forward & right vectors from camera orientation
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    if (this._forward.lengthSq() > 1e-6) {
      this._forward.normalize();
    } else {
      this._forward.set(0, 0, -1);
    }

    this._right.crossVectors(this._forward, this.camera.up).normalize();

    // Combine and NORMALIZE so diagonal movement speed equals straight movement speed
    this._moveDir
      .set(0, 0, 0)
      .addScaledVector(this._forward, inputZ)
      .addScaledVector(this._right, inputX);

    if (this._moveDir.lengthSq() > 1e-6) {
      this._moveDir.normalize();
    }

    const effectiveSpeed = this.moveSpeed * (this.keys.sprint ? 1.45 : 1.0);
    const stepDistance = effectiveSpeed * dt;

    this._desiredPos.copy(this.camera.position).addScaledVector(this._moveDir, stepDistance);
    this._desiredPos.y = this.standingHeight;

    // 3. Resolve against room boundaries and furniture collision geometry
    if (this.collisionSystem) {
      const result = this.collisionSystem.resolveMovement(
        this.camera.position,
        this._desiredPos
      );
      this.camera.position.copy(result.position);
      if (result.collided) {
        this.onCollision(result.hitLabel);
      }
    } else {
      this.camera.position.copy(this._desiredPos);
    }
  }

  dispose() {
    this.unlock();
    this.pointerLock.removeEventListener('lock', this._onPointerLockChange);
    this.pointerLock.removeEventListener('unlock', this._onPointerLockChange);
    document.removeEventListener('pointerlockerror', this._onPointerLockError);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onWindowBlur);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    this.pointerLock.dispose();
  }
}
