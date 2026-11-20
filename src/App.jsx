'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X, Camera, Cpu, FileCode } from 'lucide-react';
import Header from './components/Header.jsx';
import WelcomeOverlay from './components/WelcomeOverlay.jsx';
import ViewerControls from './components/ViewerControls.jsx';
import LoadingState from './components/LoadingState.jsx';
import ErrorState from './components/ErrorState.jsx';
import FloorNavigator from './components/FloorNavigator.jsx';
import SceneInfoCard from './components/SceneInfoCard.jsx';
import { FLOOR_MODEL_SCENE_ID, getFloor1Navigator, scanPlacementForScene } from './floor/floor1.js';
import {
  SCENES,
  DEFAULT_SCENE_ID,
  DEFAULT_STANDING_HEIGHT,
  getSceneList
} from './config/scenes.js';

const SceneViewer = dynamic(() => import('./viewer/SceneViewer.jsx'), { ssr: false });

export default function App() {
  const viewerRef = useRef(null);
  const fileInputRef = useRef(null);
  const importedUrlsRef = useRef(new Set());

  const [customScenes, setCustomScenes] = useState({});
  const [activeSceneId, setActiveSceneId] = useState(DEFAULT_SCENE_ID);
  const [sceneReloadToken, setSceneReloadToken] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showGuideDrawer, setShowGuideDrawer] = useState(false);
  const [showFloorMap, setShowFloorMap] = useState(false);
  const [floorDestination, setFloorDestination] = useState(null);

  // Loading & Error lifecycle state
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sceneStats, setSceneStats] = useState(null);
  // The canvas fades in only after the viewer reports its first finished frame, so the unsorted
  // first splat frame is never shown; the loading card stays up until then.
  const [isSceneRevealed, setIsSceneRevealed] = useState(false);

  // Viewer interaction state
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [moveSpeed, setMoveSpeed] = useState(3.2);
  const [showCollisionBounds, setShowCollisionBounds] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraCoords, setCameraCoords] = useState({ x: '0.00', y: '1.68', z: '3.10' });

  // Round 2 Extension: Active POI & Obstacle-Aware A* Route
  const [activePoi, setActivePoi] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);

  const allScenesMap = { ...SCENES, ...customScenes };
  const activeScene = allScenesMap[activeSceneId] || SCENES[DEFAULT_SCENE_ID];
  const sceneList = [...getSceneList(), ...Object.values(customScenes)];

  // Fullscreen state listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => () => {
    for (const url of importedUrlsRef.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (isLoading || loadError || !sceneStats) {
      setIsSceneRevealed(false);
      return undefined;
    }
    const timer = setTimeout(() => setIsSceneRevealed(true), 120);
    return () => clearTimeout(timer);
  }, [isLoading, loadError, sceneStats]);

  const openFloorMap = useCallback((destination = null) => {
    viewerRef.current?.unlockPointer();
    setShowWelcome(false);
    setFloorDestination(destination);
    setShowFloorMap(true);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => { });
    } else {
      document.exitFullscreen?.().catch(() => { });
    }
  }, []);

  const handleSelectScene = useCallback((sceneId) => {
    setActivePoi(null);
    setActiveRoute(null);
    setLoadError(null);
    setActiveSceneId(sceneId);
  }, []);

  const handleStartExplore = useCallback(() => {
    setShowWelcome(false);
    viewerRef.current?.lockPointer();
  }, []);

  const handleSelectPoi = useCallback((poi, shouldTransition = false) => {
    setActivePoi(poi);
    viewerRef.current?.focusOnPoi(poi, shouldTransition);
  }, []);

  // From the floor map: open the scan (switching scene if needed) and, when a place was picked,
  // fly to it once the scene is ready.
  const pendingScanPoiRef = useRef(null);
  const handleViewIn3D = useCallback(
    ({ sceneId, poiId }) => {
      setShowFloorMap(false);
      setShowWelcome(false);
      const scene = allScenesMap[sceneId];
      if (!scene) return;
      const poi = poiId ? scene.pois?.find((p) => p.id === poiId) : null;
      if (sceneId !== activeSceneId) {
        pendingScanPoiRef.current = poi;
        handleSelectScene(sceneId);
      } else if (poi) {
        handleSelectPoi(poi, true);
      }
    },
    [allScenesMap, activeSceneId, handleSelectScene, handleSelectPoi]
  );
  useEffect(() => {
    if (isLoading || !pendingScanPoiRef.current) return;
    const poi = pendingScanPoiRef.current;
    pendingScanPoiRef.current = null;
    handleSelectPoi(poi, true);
  }, [isLoading, handleSelectPoi]);

  const handleClearPoi = useCallback(() => {
    setActivePoi(null);
    setActiveRoute(null);
    viewerRef.current?.clearRoute();
  }, []);

  // Local .glb / .splat file import handler for instant reconstruction testing
  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf' && ext !== 'splat') {
      setLoadError(
        `Unsupported file extension ".${ext}". Please select a .glb, .gltf, or .splat asset.`
      );
      event.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    importedUrlsRef.current.add(objectUrl);
    const mode = ext === 'splat' ? 'splat' : 'glb';
    const customId = `custom-${Date.now()}`;

    const newSceneConfig = {
      id: customId,
      name: `Imported: ${file.name}`,
      shortLabel: `Custom ${mode.toUpperCase()}`,
      mode,
      sceneType:
        mode === 'splat'
          ? 'Imported 3D Gaussian Splat (.splat)'
          : `Imported glTF Mesh (.${ext})`,
      reconstructionStatus: 'User-imported asset; capture provenance and spatial calibration unverified',
      navigationStatus: 'preview',
      isReconstructed: false,
      assetUrl: objectUrl,
      dimensionsLabel: 'Uncalibrated bounds',
      description: `Local ${mode.toUpperCase()} asset (${(file.size / 1024).toFixed(1)} KB). Default navigation bounds are placeholders until measured against this asset.`,
      spawn: {
        position: [0, DEFAULT_STANDING_HEIGHT, 2.6],
        yaw: 0,
        pitch: -0.04
      },
      roomBounds: {
        minX: -4.5,
        maxX: 4.5,
        minZ: -4.5,
        maxZ: 4.5,
        floorY: 0,
        ceilingY: 3.2
      },
      colliders: [],
      pois: []
    };

    setCustomScenes((prev) => ({ ...prev, [customId]: newSceneConfig }));
    setActivePoi(null);
    setActiveRoute(null);
    setShowWelcome(false);
    setActiveSceneId(customId);
    event.target.value = '';
  };

  return (
    <div className={`app-shell ${isSceneRevealed ? 'is-scene-revealed' : ''}`}>
      {/* Hidden File Input for Local .glb / .splat Imports */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.splat"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* A. Top Spatial Computing Header */}
      <Header
        scenes={sceneList}
        activeScene={activeScene}
        onSelectScene={handleSelectScene}
        isLoading={isLoading}
        hasError={Boolean(loadError)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenGuide={() => {
          viewerRef.current?.unlockPointer();
          setShowGuideDrawer(true);
        }}
        onOpenFloorMap={openFloorMap}
        activePoi={activePoi}
        onSelectPoi={handleSelectPoi}
        onClearPoi={handleClearPoi}
      />

      {/* B. Main 3D Viewport */}
      <SceneViewer
        ref={viewerRef}
        sceneConfig={activeScene}
        reloadToken={sceneReloadToken}
        moveSpeed={moveSpeed}
        showCollisionBounds={showCollisionBounds}
        activePoi={activePoi}
        onLockChange={setIsPointerLocked}
        onLoadStart={() => {
          setIsLoading(true);
          setLoadError(null);
          setLoadProgress(null);
          setSceneStats(null);
        }}
        onLoadProgress={(prog) => setLoadProgress(prog)}
        onLoadSuccess={(stats) => {
          setIsLoading(false);
          setLoadError(null);
          setSceneStats(stats);
        }}
        onLoadError={(message) => {
          setIsLoading(false);
          setLoadError(message);
        }}
        onSelectPoi={(poi) => handleSelectPoi(poi, false)}
        onRouteComputed={(routeData) => setActiveRoute(routeData)}
        onTelemetryUpdate={setCameraCoords}
      />

      <SceneInfoCard
        scene={activeScene}
        stats={sceneStats}
        cameraCoords={cameraCoords}
        floorLabel={activeSceneId === FLOOR_MODEL_SCENE_ID ? 'Whole floor' : scanPlacementForScene(activeSceneId)?.label}
        onShowOnFloor={() => {
          const placement = scanPlacementForScene(activeSceneId);
          openFloorMap(placement ? getFloor1Navigator().pois.find((p) => p.id === placement.roomId) : null);
        }}
        activeRoute={activeRoute}
        onClearRoute={handleClearPoi}
        onImport={() => fileInputRef.current?.click()}
      />

      {/* D. Viewer Controls Dock (Bottom Right) */}
      <ViewerControls
        isPointerLocked={isPointerLocked}
        onEngagePointerLock={() => viewerRef.current?.lockPointer()}
        onReleasePointerLock={() => viewerRef.current?.unlockPointer()}
        onResetView={() => viewerRef.current?.resetCameraView()}
        showCollisionBounds={showCollisionBounds}
        onToggleCollisionBounds={() => setShowCollisionBounds((v) => !v)}
        moveSpeed={moveSpeed}
        onChangeMoveSpeed={setMoveSpeed}
        onVirtualMove={(dir, active) => viewerRef.current?.setVirtualKey(dir, active)}
      />

      {/* C. Welcome Overlay ("Step inside.") */}
      {showWelcome && !loadError && (
        <WelcomeOverlay
          sceneConfig={activeScene}
          onStartExplore={handleStartExplore}
          isReady={isSceneRevealed}
          progress={loadProgress}
          onOpenFloorMap={() => openFloorMap()}
        />
      )}

      {/* Loading Overlay */}
      {!loadError && !isSceneRevealed && !showWelcome && (
        <LoadingState sceneConfig={activeScene} progress={loadProgress} isPreparing={!isLoading} />
      )}

      {/* Error & Fallback Overlay */}
      {loadError && (
        <ErrorState
          errorMessage={loadError}
          sceneConfig={activeScene}
          onRetry={() => {
            setLoadError(null);
            setSceneReloadToken((token) => token + 1);
          }}
          onFallbackToDemo={() => {
            setLoadError(null);
            if (activeSceneId === DEFAULT_SCENE_ID) {
              setSceneReloadToken((token) => token + 1);
            } else {
              setActiveSceneId(DEFAULT_SCENE_ID);
            }
          }}
        />
      )}

      <FloorNavigator
        open={showFloorMap}
        initialDestination={floorDestination}
        onClose={() => setShowFloorMap(false)}
        currentSceneId={activeSceneId}
        cameraCoords={cameraCoords}
        onViewIn3D={handleViewIn3D}
      />

      {/* Smartphone Capture SOP & Reconstruction Pipeline Drawer */}
      {showGuideDrawer && (
        <div
          className="info-drawer-backdrop"
          onClick={() => setShowGuideDrawer(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
        >
          <aside className="info-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span
                  className="mono"
                  style={{ fontSize: '11px', color: 'var(--color-sage-bright)' }}
                >
                  DOCUMENTATION &amp; PIPELINE
                </span>
                <h3 id="drawer-title" className="heading-font" style={{ fontSize: '18px' }}>
                  Capture SOP &amp; Scene Integration
                </h3>
              </div>
              <button
                type="button"
                className="icon-btn icon-btn-square"
                onClick={() => setShowGuideDrawer(false)}
                aria-label="Close Guide"
              >
                <X size={16} />
              </button>
            </div>

            <div className="drawer-content">
              <div className="drawer-section">
                <h4>
                  <Camera size={15} />
                  <span>1. Smartphone Capture SOP</span>
                </h4>
                <ul>
                  <li>
                    <strong>Lighting &amp; Prep:</strong> Turn on all indoor lights, open blinds for
                    diffuse illumination, and remove moving people/pets.
                  </li>
                  <li>
                    <strong>Camera Settings:</strong> Record 4K @ 30/60fps (or RAW photo burst) with
                    ultra-wide/1x lens locked; disable auto-exposure flicker and motion blur.
                  </li>
                  <li>
                    <strong>Perimeter Loop + Inside-Out Sweep:</strong> Walk slowly along the room
                    perimeter facing inward (70%+ frame overlap) at two heights (chest level &amp;
                    eye level), then capture central furniture islands.
                  </li>
                </ul>
              </div>

              <div className="drawer-section">
                <h4>
                  <Cpu size={15} />
                  <span>2. External 3D Reconstruction Tools</span>
                </h4>
                <p>
                  Process extracted frames (`ffmpeg -i room.mp4 -vf fps=3 frames/frame_%04d.jpg`) in
                  an established reconstruction suite:
                </p>
                <ul>
                  <li>
                    <strong>Mesh (.glb):</strong> Polycam (LiDAR/Photo mode), RealityCapture, or
                    Nerfstudio (`ns-export poisson`) → Export binary `.glb` to `public/models/`.
                  </li>
                  <li>
                    <strong>3D Gaussian Splat (.splat):</strong> Luma AI, Postshot, or Nerfstudio
                    `splatfacto` → Export `.splat` to `public/scenes/`.
                  </li>
                </ul>
              </div>

              <div className="drawer-section">
                <h4>
                  <FileCode size={15} />
                  <span>3. Registering Your Scene in Code</span>
                </h4>
                <p>
                  Use <strong>Import Asset</strong> for an uncalibrated preview. To enable trustworthy
                  navigation, align the asset to meters with a Y-up floor at zero, then register its
                  measured spawn, room bounds, colliders, POIs, and capture evidence in
                  <code>src/config/scenes.js</code>.
                </p>
                <p style={{ fontSize: '12px', color: '#5b635e' }}>
                  Full detailed guides are located in <code>docs/capture-sop.md</code>,{' '}
                  <code>docs/reconstruction-workflow.md</code>, <code>docs/real-scan-pilot.md</code>, and{' '}
                  <code>docs/architecture.md</code>.
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
