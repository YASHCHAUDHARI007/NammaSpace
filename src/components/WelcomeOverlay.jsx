import React from 'react';
import { Compass, Map, Sparkles, ShieldAlert } from 'lucide-react';

/**
 * NAMMA SPACE — Welcome Overlay ("Step inside.")
 */
export default function WelcomeOverlay({
  sceneConfig,
  onStartExplore,
  onOpenFloorMap
}) {
  if (!sceneConfig) return null;

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
            Explore smartphone-captured indoor spaces and architectural baselines in real time with
            first-person collision physics and obstacle-aware pathfinding.
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
              <span className="welcome-tile-label">Walk &amp; strafe with wall/obstacle collision</span>
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
              onClick={onOpenFloorMap}
              title="Search any room on the floor and get a walking route"
            >
              <Map size={16} />
              <span>Floor map &amp; routes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
