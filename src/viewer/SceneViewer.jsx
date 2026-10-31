import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef
} from 'react';
import * as THREE from 'three';
import {
  createThreeStage,
  createPOIMarkers,
  createRouteVisualization,
  disposeObject3D
} from './createScene.js';
import { CollisionSystem } from './collision.js';
import { FirstPersonController } from './controls.js';
import { loadSpatialScene, disposeSpatialScene } from './sceneLoader.js';

/**
 * NAMMA SPACE — 3D Viewport & Lifecycle Orchestrator
 */
const SceneViewer = forwardRef(function SceneViewer(
  {
    sceneConfig,
    reloadToken,
    moveSpeed,
    showCollisionBounds,
    activePoi,
    onLockChange,
    onLoadStart,
    onLoadProgress,
    onLoadSuccess,
    onLoadError,
    onSelectPoi,
    onRouteComputed,
    onTelemetryUpdate
  },
  ref
) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const controllerRef = useRef(null);
  const collisionRef = useRef(null);
  const currentSceneGroupRef = useRef(null);
  const debugBoundsGroupRef = useRef(null);
  const poiGroupRef = useRef(null);
  const poiInteractablesRef = useRef([]);
  const routeGroupRef = useRef(null);
  const hoveredPoiRef = useRef(null);
  const sceneConfigRef = useRef(sceneConfig);
  const showCollisionBoundsRef = useRef(showCollisionBounds);
  const loadedSceneIdRef = useRef(null);
  const callbacksRef = useRef({});
  sceneConfigRef.current = sceneConfig;
  showCollisionBoundsRef.current = showCollisionBounds;
  callbacksRef.current = { onLockChange, onLoadStart, onLoadProgress, onLoadSuccess, onLoadError, onSelectPoi, onRouteComputed, onTelemetryUpdate };

  const [hoveredPoi, setHoveredPoi] = useState(null);
  const [sceneStatsVersion, setSceneStatsVersion] = useState(0);

  // Expose imperative actions to parent App / Controls
  useImperativeHandle(ref, () => ({
    lockPointer() {
      controllerRef.current?.lock();
    },
    unlockPointer() {
      controllerRef.current?.unlock();
    },
    resetCameraView() {
      if (!controllerRef.current || !sceneConfigRef.current?.spawn) return;
      const { position, yaw, pitch } = sceneConfigRef.current.spawn;
      controllerRef.current.setPose(position, yaw, pitch);
    },
    focusOnPoi(poi, shouldTeleport = false) {
      if (!controllerRef.current || !collisionRef.current || !poi ||
          loadedSceneIdRef.current !== sceneConfigRef.current?.id) return;
      const camPos = stageRef.current?.camera?.position;
      let route = null;
      if (camPos && poi.waypoint) {
        route = collisionRef.current.computeObstacleAwarePath(
          [camPos.x, camPos.z],
          poi.waypoint
        );
        drawRoute(route?.points || []);
        callbacksRef.current.onRouteComputed?.(route ? { ...route, poi } : null);
      }
      if (shouldTeleport && route?.points?.length > 1 && poi.lookAt) {
        controllerRef.current.transitionToTarget(poi.waypoint, poi.lookAt, 1.0, route.points);
      }
    },
    clearRoute() {
      controllerRef.current?.cancelTransition();
      drawRoute([]);
      callbacksRef.current.onRouteComputed?.(null);
    },
    setVirtualKey(dir, active) {
      controllerRef.current?.setVirtualKey(dir, active);
    }
  }));

  // Helper to replace the 3D floor route ribbon
  const drawRoute = (pointsXZ) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (routeGroupRef.current) {
      stage.scene.remove(routeGroupRef.current);
      disposeObject3D(routeGroupRef.current);
      routeGroupRef.current = null;
    }
    if (pointsXZ && pointsXZ.length >= 2) {
      const routeGroup = createRouteVisualization(pointsXZ);
      stage.scene.add(routeGroup);
      routeGroupRef.current = routeGroup;
    }
  };

  // 1. Initialize WebGL Stage, Controller, and Animation Loop once on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const stage = createThreeStage(container);
    stageRef.current = stage;

    const collisionSystem = new CollisionSystem(sceneConfig);
    collisionRef.current = collisionSystem;

    const controller = new FirstPersonController(
      stage.camera,
      stage.renderer.domElement,
      collisionSystem,
      {
        onLockChange: (locked) => {
          callbacksRef.current.onLockChange?.(locked);
        }
      }
    );
    controllerRef.current = controller;

    // Raycaster for center-screen reticle / clicking on 3D POI markers
    const raycaster = new THREE.Raycaster();
    raycaster.far = 9.0;
    const centerNDC = new THREE.Vector2(0, 0);
    const pointerNDC = new THREE.Vector2();

    const handleCanvasClick = (event) => {
      // If pointer is locked, clicking selects whatever POI is under the center reticle
      if (controller.pointerLock.isLocked) {
        if (hoveredPoiRef.current) {
          callbacksRef.current.onSelectPoi?.(hoveredPoiRef.current);
        }
        return;
      }

      // If unlocked, check if user clicked directly on a 3D POI beacon
      const rect = stage.renderer.domElement.getBoundingClientRect();
      pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, stage.camera);

      const hits = raycaster.intersectObjects(poiInteractablesRef.current, false);
      if (hits.length > 0 && hits[0].object?.userData?.poi) {
        callbacksRef.current.onSelectPoi?.(hits[0].object.userData.poi);
      }
    };

    const handleKeyAction = (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.code === 'KeyE' && hoveredPoiRef.current) {
        callbacksRef.current.onSelectPoi?.(hoveredPoiRef.current);
      } else if (event.code === 'KeyR') {
        const spawn = sceneConfigRef.current?.spawn;
        if (spawn) {
          controller.setPose(spawn.position, spawn.yaw, spawn.pitch);
        }
      }
    };

    stage.renderer.domElement.addEventListener('click', handleCanvasClick);
    window.addEventListener('keydown', handleKeyAction);
    window.addEventListener('resize', stage.handleResize);

    const clock = new THREE.Clock();
    let frameId = null;
    let lastTelemetryTime = 0;

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      controller.update(delta);

      // Gently rotate central calibration sculpture in demo mode
      const sculpture = stage.scene.getObjectByName('PedestalOctahedron');
      if (sculpture) {
        sculpture.rotation.y = elapsed * 0.55;
        sculpture.position.y = 1.18 + Math.sin(elapsed * 2.0) * 0.03;
      }

      // Check center reticle hover against 3D POI beacons
      if (poiInteractablesRef.current.length > 0) {
        raycaster.setFromCamera(centerNDC, stage.camera);
        const hits = raycaster.intersectObjects(poiInteractablesRef.current, false);
        const foundPoi = hits[0]?.object?.userData?.poi || null;
        if (foundPoi?.id !== hoveredPoiRef.current?.id) {
          hoveredPoiRef.current = foundPoi;
          setHoveredPoi(foundPoi);
        }
      }

      // Throttled camera position telemetry update (every ~150ms)
      if (elapsed - lastTelemetryTime > 0.15) {
        lastTelemetryTime = elapsed;
        callbacksRef.current.onTelemetryUpdate?.({
          x: stage.camera.position.x.toFixed(2),
          y: stage.camera.position.y.toFixed(2),
          z: stage.camera.position.z.toFixed(2)
        });
      }

      stage.renderer.render(stage.scene, stage.camera);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      stage.renderer.domElement.removeEventListener('click', handleCanvasClick);
      window.removeEventListener('keydown', handleKeyAction);
      window.removeEventListener('resize', stage.handleResize);
      controller.dispose();
      if (currentSceneGroupRef.current) {
        stage.scene.remove(currentSceneGroupRef.current);
        void disposeSpatialScene(currentSceneGroupRef.current);
        currentSceneGroupRef.current = null;
      }
      disposeObject3D(stage.scene);
      stage.renderer.renderLists.dispose();
      stage.renderer.dispose();
      stage.renderer.domElement.remove();
      stageRef.current = null;
      controllerRef.current = null;
      collisionRef.current = null;
    };
  }, []);

  // 2. Sync movement speed setting with controller
  useEffect(() => {
    controllerRef.current?.setMoveSpeed(moveSpeed);
  }, [moveSpeed]);

  // 3. Dynamically load scene when `sceneConfig` changes
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    const stage = stageRef.current;
    const controller = controllerRef.current;
    const collision = collisionRef.current;
    if (!stage || !controller || !collision || !sceneConfig) return undefined;

    async function switchScene() {
      callbacksRef.current.onLoadStart?.();
      controller.cancelTransition();
      loadedSceneIdRef.current = null;
      hoveredPoiRef.current = null;
      setHoveredPoi(null);
      drawRoute([]);
      callbacksRef.current.onRouteComputed?.(null);

      // Remove visuals tied to the previous scene before the next asset loads.
      if (debugBoundsGroupRef.current) {
        stage.scene.remove(debugBoundsGroupRef.current);
        disposeObject3D(debugBoundsGroupRef.current);
        debugBoundsGroupRef.current = null;
      }

      // Dispose previous scene geometry
      if (currentSceneGroupRef.current) {
        stage.scene.remove(currentSceneGroupRef.current);
        void disposeSpatialScene(currentSceneGroupRef.current);
        currentSceneGroupRef.current = null;
      }

      try {
        const result = await loadSpatialScene(sceneConfig, {
          signal: abortController.signal,
          onProgress: (prog) => {
            if (!cancelled) callbacksRef.current.onLoadProgress?.(prog);
          }
        });

        if (cancelled) {
          void disposeSpatialScene(result.rootGroup);
          return;
        }

        // Mount new scene root
        stage.scene.add(result.rootGroup);
        currentSceneGroupRef.current = result.rootGroup;
        loadedSceneIdRef.current = sceneConfig.id;

        // Configure collision bounds + any dynamically extracted mesh AABBs
        collision.configure(sceneConfig);
        controller.standingHeight = collision.standingHeight;
        if (result.extractedColliders?.length > 0) {
          collision.addMeshColliders(result.extractedColliders);
        }

        // Position camera at scene spawn point
        const spawn = sceneConfig.spawn || {
          position: [0, 1.68, 3.0],
          yaw: 0,
          pitch: -0.04
        };
        controller.setPose(spawn.position, spawn.yaw, spawn.pitch);

        // Rebuild collision wireframe overlay if enabled
        if (debugBoundsGroupRef.current) {
          stage.scene.remove(debugBoundsGroupRef.current);
          disposeObject3D(debugBoundsGroupRef.current);
          debugBoundsGroupRef.current = null;
        }
        if (showCollisionBoundsRef.current) {
          const debugVisuals = collision.createDebugVisuals();
          stage.scene.add(debugVisuals);
          debugBoundsGroupRef.current = debugVisuals;
        }

        setSceneStatsVersion((version) => version + 1);
        callbacksRef.current.onLoadSuccess?.(result.stats);
      } catch (err) {
        if (!cancelled) {
          callbacksRef.current.onLoadError?.(err?.message || 'Failed to load 3D scene asset.');
        }
      }
    }

    switchScene();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [sceneConfig, reloadToken]);

  // 4. Toggle Collision Wireframe Overlay
  useEffect(() => {
    const stage = stageRef.current;
    const collision = collisionRef.current;
    if (!stage || !collision) return;

    if (debugBoundsGroupRef.current) {
      stage.scene.remove(debugBoundsGroupRef.current);
      disposeObject3D(debugBoundsGroupRef.current);
      debugBoundsGroupRef.current = null;
    }

    if (showCollisionBounds && loadedSceneIdRef.current === sceneConfig?.id) {
      const debugVisuals = collision.createDebugVisuals();
      stage.scene.add(debugVisuals);
      debugBoundsGroupRef.current = debugVisuals;
    }
  }, [showCollisionBounds]);

  // 5. Render 3D POI Beacons and update A* Floor Route when `activePoi` or `sceneConfig` changes
  useEffect(() => {
    const stage = stageRef.current;
    const collision = collisionRef.current;
    if (!stage) return;

    if (poiGroupRef.current) {
      stage.scene.remove(poiGroupRef.current);
      disposeObject3D(poiGroupRef.current);
      poiGroupRef.current = null;
      poiInteractablesRef.current = [];
    }

    if (loadedSceneIdRef.current !== sceneConfig?.id) {
      drawRoute([]);
      return;
    }

    const pois = sceneConfig?.pois || [];
    if (pois.length > 0) {
      const { group, interactables } = createPOIMarkers(pois, activePoi?.id || null);
      stage.scene.add(group);
      poiGroupRef.current = group;
      poiInteractablesRef.current = interactables;
    }

    if (activePoi && activePoi.waypoint && collision) {
      const camPos = stage.camera.position;
      const route = collision.computeObstacleAwarePath(
        [camPos.x, camPos.z],
        activePoi.waypoint
      );
      drawRoute(route?.points || []);
      callbacksRef.current.onRouteComputed?.(route ? { ...route, poi: activePoi } : null);
    } else {
      drawRoute([]);
      callbacksRef.current.onRouteComputed?.(null);
    }
  }, [sceneConfig, activePoi, sceneStatsVersion]);

  return (
    <div className="viewport-container" aria-label="Interactive 3D Spatial Viewport">
      <div ref={containerRef} className="viewport-canvas" />
      <div className="viewport-vignette" />

      {/* Center Spatial Reticle */}
      <div
        className={`reticle-crosshair ${hoveredPoi ? 'is-hovering-poi' : ''}`}
        aria-hidden="true"
      >
        <div className="reticle-ring" />
        <div className="reticle-dot" />
      </div>

      {/* Contextual Reticle Readout when aiming at a 3D POI Beacon */}
      {hoveredPoi && (
        <div className="reticle-poi-Readout">
          <span className="mono" style={{ color: '#f4c382' }}>
            [E / Click]
          </span>
          <span>Route to {hoveredPoi.name}</span>
        </div>
      )}
    </div>
  );
});

export default SceneViewer;
