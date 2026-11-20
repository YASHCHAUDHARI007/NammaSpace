import React from 'react';
import { Compass, Loader2, Map } from 'lucide-react';

const CONTROLS = [
  { keys: 'W A S D', label: 'Walk around' },
  { keys: 'Mouse / drag', label: 'Look around' },
  { keys: 'E / click', label: 'Go to a labelled place' }
];

/**
 * NAMMA SPACE — Welcome dialog. The primary action stays disabled (with live progress) until the
 * scan is on screen, so "Start exploring" never drops the user into a blank viewport.
 */
export default function WelcomeOverlay({ sceneConfig, isReady, progress, onStartExplore, onOpenFloorMap }) {
  const percent = progress?.percent;
  if (!sceneConfig) return null;

  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-heading">
      <div className="welcome-dialog">
        <div className="welcome-hero-banner">
          <span className="welcome-eyebrow">IIT Bombay Techfest 2026–27 · Namma Space</span>
          <h1 id="welcome-heading" className="welcome-title">
            Step inside.
          </h1>
          <p className="welcome-subtitle">
            Walk through photoreal scans of real rooms, search any place on the floor and follow a route
            straight to it.
          </p>
        </div>

        <div className="welcome-body">
          <div className="welcome-scene-summary">
            <div className="welcome-scene-row">
              <span className="welcome-scene-name">{sceneConfig.name}</span>
              <span className="welcome-scene-badge">{sceneConfig.sceneType}</span>
            </div>
            <p className="welcome-scene-note">{sceneConfig.description}</p>
          </div>

          <ul className="welcome-controls-grid" aria-label="Controls">
            {CONTROLS.map((c) => (
              <li key={c.keys} className="welcome-control-tile">
                <span className="welcome-tile-keys">{c.keys}</span>
                <span className="welcome-tile-label">{c.label}</span>
              </li>
            ))}
          </ul>

          <div className="welcome-actions">
            <button
              type="button"
              className="btn-explore-primary"
              onClick={onStartExplore}
              disabled={!isReady}
              autoFocus={isReady}
            >
              {isReady ? (
                <>
                  <Compass size={18} />
                  <span>Start exploring</span>
                </>
              ) : (
                <>
                  <Loader2 size={17} className="spin" />
                  <span>
                    {progress?.preparing
                      ? 'Preparing view…'
                      : `Loading scan${typeof percent === 'number' ? ` · ${Math.round(percent)}%` : '…'}`}
                  </span>
                </>
              )}
            </button>
            <button type="button" className="btn-secondary-light" onClick={onOpenFloorMap}>
              <Map size={16} />
              <span>Floor map</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
