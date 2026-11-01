import React from 'react';
import { Compass, Upload, Sparkles, ShieldAlert } from 'lucide-react';

/**
 * NAMMA SPACE — Welcome Overlay ("Step inside.")
 */
export default function WelcomeOverlay({
  sceneConfig,
  onStartExplore,
  onTriggerFileUpload
}) {
  if (!sceneConfig) return null;
  const hasObstacleProxies = sceneConfig.colliders?.length > 0;
  const sourceDescription = sceneConfig.id === 'classroom-pilot'
    ? 'Explore this room reconstructed from the supplied videos.'
    : ['classroom-c5306-single-video', 'classroom-c5307-single-video', 'classroom-single-video'].includes(sceneConfig.id)
      ? 'Explore this room reconstructed from one continuous video.'
      : 'Explore this spatial scene.';

  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-heading">
      <div className="welcome-dialog">
        <div className="welcome-hero-banner">
          <div className="welcome-eyebrow">
            <Sparkles size={12} />
            <span>IIT Bombay Techfest 2026–27 • Indoor Digital Twin</span>
          </div>
          <h1 id="welcome-heading" className="welcome-title">
            Step inside.
          </h1>
          <p className="welcome-subtitle">
            {`${sourceDescription} Walk through the 3D view`
              + (hasObstacleProxies
                ? ', inspect the navigation preview, and try obstacle-aware routes.'
                : ' and inspect the areas recorded by the camera.')}
          </p>
        </div>

        <div className="welcome-body">
          {/* Active Scene Summary & Honest Provenance Callout */}
          <div className="welcome-scene-summary">
            <div className="welcome-scene-row">
              <span className="welcome-scene-name">{sceneConfig.name}</span>
              <span className="welcome-scene-badge">{sceneConfig.mode.toUpperCase()} MODE</span>
            </div>
            <p className="welcome-scene-note">{sceneConfig.description}</p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '4px',
                fontSize: '11.5px',
                color: sceneConfig.isReconstructed ? '#1b4d32' : '#7a4f13',
                fontWeight: 600
              }}
            >
              <ShieldAlert size={13} />
              <span>Provenance: {sceneConfig.reconstructionStatus}</span>
            </div>
          </div>

          {/* Brief Control Instructions */}
          <div className="welcome-controls-grid" aria-label="Viewer Control Instructions">
            <div className="welcome-control-tile">
              <span className="welcome-tile-keys">W A S D / Arrows</span>
              <span className="welcome-tile-label">{hasObstacleProxies
                ? 'Walk & strafe with wall/obstacle collision'
                : 'Walk & strafe within visual preview limits'}</span>
            </div>
            <div className="welcome-control-tile">
              <span className="welcome-tile-keys">Mouse / Drag</span>
              <span className="welcome-tile-label">360° first-person look direction</span>
            </div>
            <div className="welcome-control-tile">
              <span className="welcome-tile-keys">ESC / R / E</span>
              <span className="welcome-tile-label">Release cursor, reset view, or route to POI</span>
            </div>
          </div>

          {/* Primary & Secondary Actions */}
          <div className="welcome-actions">
            <button
              type="button"
              className="btn-explore-primary"
              onClick={onStartExplore}
              autoFocus
            >
              <Compass size={18} />
              <span>Explore the space</span>
            </button>

            <button
              type="button"
              className="btn-secondary-light"
              onClick={onTriggerFileUpload}
              title="Load a custom .glb or .splat reconstruction file from your device"
            >
              <Upload size={16} />
              <span>Import .glb / .splat</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
