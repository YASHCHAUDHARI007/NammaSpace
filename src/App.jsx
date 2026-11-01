'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Layers,
  Upload,
  Navigation,
  X,
  Camera,
  Cpu,
  FileCode
} from 'lucide-react';
import Header from './components/Header.jsx';
import WelcomeOverlay from './components/WelcomeOverlay.jsx';
import ViewerControls from './components/ViewerControls.jsx';
import LoadingState from './components/LoadingState.jsx';
import ErrorState from './components/ErrorState.jsx';
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
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneReloadToken, setSceneReloadToken] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showGuideDrawer, setShowGuideDrawer] = useState(false);

  // Loading & Error lifecycle state
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sceneStats, setSceneStats] = useState(null);

  // Viewer interaction state
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [moveSpeed, setMoveSpeed] = useState(3.2);
  const [showCollisionBounds, setShowCollisionBounds] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraCoords, setCameraCoords] = useState(() => {
    const [x, y, z] = SCENES[DEFAULT_SCENE_ID].spawn.position;
    return { x: x.toFixed(2), y: y.toFixed(2), z: z.toFixed(2) };
  });

  // Round 2 Extension: Active POI & Obstacle-Aware A* Route
  const [activePoi, setActivePoi] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);

  const allScenesMap = { ...SCENES, ...customScenes };
  const activeScene = allScenesMap[activeSceneId] || SCENES[DEFAULT_SCENE_ID];
  const sceneList = [...getSceneList(), ...Object.values(customScenes)];

  useEffect(() => {
    const requestedScene = new URLSearchParams(window.location.search).get('scene');
    if (requestedScene && SCENES[requestedScene]) {
      setActiveSceneId(requestedScene);
    }
    setSceneReady(true);
  }, []);

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
    const url = new URL(window.location.href);
    if (SCENES[sceneId]) {
      url.searchParams.set('scene', sceneId);
    } else {
      url.searchParams.delete('scene');
    }
    window.history.replaceState(null, '', url);
  }, []);

  const handleStartExplore = useCallback(() => {
    setShowWelcome(false);
    viewerRef.current?.lockPointer();
  }, []);

  const handleSelectPoi = useCallback((poi, shouldTransition = false) => {
    setActivePoi(poi);
    viewerRef.current?.focusOnPoi(poi, shouldTransition);
  }, []);

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
    <div className="app-shell">
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
        showCollisionBounds={showCollisionBounds}
        onToggleCollisionBounds={() => setShowCollisionBounds((v) => !v)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenGuide={() => {
          viewerRef.current?.unlockPointer();
          setShowGuideDrawer(true);
        }}
        activePoi={activePoi}
        onSelectPoi={handleSelectPoi}
        onClearPoi={handleClearPoi}
      />

      {/* B. Main 3D Viewport */}
      {sceneReady && <SceneViewer
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
      />}

      {/* E. Scene Information & Telemetry Card (Bottom Left) */}
      <section className="scene-info-card" aria-label="Scene Information and Telemetry">
        <div>
          <div className="scene-info-top">
            <span
              className={`scene-type-chip ${activeScene.mode === 'demo' ? 'chip-demo' : ''}`}
            >
              <Layers size={11} />
              <span>{activeScene.sceneType}</span>
            </span>

            <button
              type="button"
              className="upload-trigger-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Import your own reconstructed .glb or .splat file"
            >
              <Upload size={11} />
              <span>Import Asset</span>
            </button>
          </div>

          <h2 className="scene-info-name">{activeScene.name}</h2>
        </div>

        {/* Honest Reconstruction Provenance Banner */}
        <div className="provenance-banner">
          <span>
            <strong>Status:</strong> {activeScene.reconstructionStatus}
            {activeScene.navigationStatus === 'preview' && (
              <><br /><strong>Navigation:</strong> Placeholder room bounds; no measured collision proxies or POIs.</>
            )}
          </span>
        </div>

        {/* Active A* Obstacle-Aware Route Banner (when POI is selected) */}
        {activeRoute && activeRoute.poi && (
          <div className="route-active-bar">
            <div className="route-active-meta">
              <span className="route-active-title">
                <Navigation size={11} style={{ display: 'inline', marginRight: 4 }} />
                A* Route: {activeRoute.poi.name}
              </span>
              <span className="route-active-sub">
                Walkable path: {activeRoute.distanceMeters}{activeScene.calibration?.scaleType === 'relative' ? ' scene units' : ' m'} ({activeRoute.points.length} waypoints)
              </span>
            </div>
            <button
              type="button"
              className="search-clear-btn"
              onClick={handleClearPoi}
              aria-label="Clear active route"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Real-Time Spatial Telemetry Grid */}
        <div className="scene-telemetry-grid">
          <div className="telemetry-cell">
            <span className="telemetry-label">
              {sceneStats?.mode === 'splat' ? 'Gaussian Splats' : 'Mesh Geometry'}
            </span>
            <span className="telemetry-val">
              {sceneStats?.mode === 'splat'
                ? `${(sceneStats.splatCount || 0).toLocaleString()} splats`
                : `${(sceneStats?.triangleCount || 0).toLocaleString()} tris`}
            </span>
          </div>

          <div className="telemetry-cell">
            <span className="telemetry-label">Collision Volumes</span>
            <span className="telemetry-val">
              {sceneStats?.collisionCount ?? activeScene.colliders?.length ?? 0} AABBs + {activeScene.roomBoundsKnown === false ? 'Preview Limits' : 'Walls'}
            </span>
          </div>

          <div className="telemetry-cell">
            <span className="telemetry-label">Camera Position</span>
            <span className="telemetry-val">
              {cameraCoords.x}, {cameraCoords.y}, {cameraCoords.z}{activeScene.calibration?.scaleType === 'relative' ? ' units' : ' m'}
            </span>
          </div>

          <div className="telemetry-cell">
            <span className="telemetry-label">Points of Interest</span>
            <span className="telemetry-val">{activeScene.pois?.length || 0} Anchors</span>
          </div>
        </div>
      </section>

      {/* D. Viewer Controls Dock (Bottom Right) */}
      <ViewerControls
        isPointerLocked={isPointerLocked}
        onEngagePointerLock={() => viewerRef.current?.lockPointer()}
        onReleasePointerLock={() => viewerRef.current?.unlockPointer()}
        onResetView={() => viewerRef.current?.resetCameraView()}
        moveSpeed={moveSpeed}
        onChangeMoveSpeed={setMoveSpeed}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onVirtualMove={(dir, active) => viewerRef.current?.setVirtualKey(dir, active)}
      />

      {/* C. Welcome Overlay ("Step inside.") */}
      {sceneReady && showWelcome && !loadError && (
        <WelcomeOverlay
          sceneConfig={activeScene}
          onStartExplore={handleStartExplore}
          onTriggerFileUpload={() => fileInputRef.current?.click()}
        />
      )}

      {/* Loading Overlay */}
      {isLoading && <LoadingState sceneConfig={activeScene} progress={loadProgress} />}

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
            if (activeSceneId === 'demo-studio') {
              setSceneReloadToken((token) => token + 1);
            } else {
              setActiveSceneId('demo-studio');
            }
          }}
        />
      )}

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
              {activeSceneId === 'classroom-c5306-single-video' ? (
                <>
                  <div className="drawer-section">
                    <h4><Camera size={15} /><span>1. Video Source</span></h4>
                    <p>
                      This room uses only <code>C5306.MP4</code>, one continuous 49.44-second
                      Sony video. It does not use still photos or frames from other videos.
                    </p>
                  </div>
                  <div className="drawer-section">
                    <h4><Cpu size={15} /><span>2. Reconstruction</span></h4>
                    <p>
                      All 198 frames sampled at 4 fps registered in one continuous camera route.
                      VGGT supplied depth for validated points. Nerfstudio Splatfacto trained the
                      Gaussian model for 20,000 steps on the NST GPU cluster.
                    </p>
                    <p>
                      The video camera poses are used because the VGGT pose estimate was less
                      consistent along this route. The model uses relative scene units.
                    </p>
                  </div>
                  <div className="drawer-section">
                    <h4><Navigation size={15} /><span>3. Coverage and Navigation</span></h4>
                    <p>
                      The camera shows the floor, stage, and seating. It points down for much of
                      the video, so the ceiling and upper walls have limited coverage. The floor
                      sets the scene orientation. No physical room size was measured.
                    </p>
                    <p>
                      The front-aisle route follows recorded camera positions. Walking limits are
                      visual estimates. Furniture collision has not been verified for this scene.
                    </p>
                  </div>
                </>
              ) : (
              <>
              <div className="drawer-section">
                <h4>
                  <Camera size={15} />
                  <span>1. One-Video Capture SOP</span>
                </h4>
                <ul>
                  <li>
                    Keep the room static. Turn on steady lights. Keep people and moving objects
                    out of the capture.
                  </li>
                  <li>
                    Record one continuous video with one lens and steady exposure. This case study
                    used <code>C5304.MP4</code> at 3840 × 2160 and 50 fps.
                  </li>
                  <li>
                    Move slowly with overlap and lateral translation. Show walls, floor edges,
                    furniture, and the room centre from several positions. Avoid fast pans.
                  </li>
                </ul>
              </div>

              <div className="drawer-section">
                <h4>
                  <Cpu size={15} />
                  <span>2. Reconstruct the Video</span>
                </h4>
                <p>
                  Extract frames from the first 55 seconds at 2 fps. Keep only a continuous camera
                  path, then train a Gaussian splat from those frames.
                </p>
                <ul>
                  <li>
                    <strong>Camera poses:</strong> PyCOLMAP registered 99 of 110 candidate frames.
                    The last 11 did not join the continuous path and were excluded.
                  </li>
                  <li>
                    <strong>Appearance:</strong> Nerfstudio Splatfacto trained for 10,000 steps.
                    Its Gaussian PLY was aligned to the floor and converted to a 32-byte `.splat`.
                  </li>
                </ul>
              </div>

              <div className="drawer-section">
                <h4>
                  <FileCode size={15} />
                  <span>3. Scale and Navigation Limits</span>
                </h4>
                <p>
                  The visible screen sets an arbitrary scale of two scene units. No physical room
                  or screen size was measured. The walking limits and furniture collision boxes
                  are visual estimates. Check the floor and all routes before relying on them.
                </p>
                <p style={{ fontSize: '12px', color: '#5b635e' }}>
                  Read <code>docs/single-video-reconstruction.md</code> for the exact commands,
                  results, source checks, and limitations.
                </p>
              </div>
              </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
