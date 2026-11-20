import React, { useState } from 'react';
import { ChevronDown, Navigation, Upload, X } from 'lucide-react';

const compactNumber = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n ?? 0);

/**
 * NAMMA SPACE — Scene summary card (bottom left).
 * Shows what you are looking at in one glance; capture provenance and live telemetry are one tap away.
 */
export default function SceneInfoCard({ scene, stats, cameraCoords, activeRoute, onClearRoute, onImport }) {
  const [showDetails, setShowDetails] = useState(false);
  const isSplat = (stats?.mode ?? scene.mode) === 'splat';
  const primaryStat = isSplat
    ? `${compactNumber(stats?.splatCount)} splats`
    : `${compactNumber(stats?.triangleCount)} triangles`;
  const placeCount = scene.pois?.length || 0;

  return (
    <section className="scene-card" aria-label="Current scene">
      <div className="scene-card-kicker">
        <span className={`scene-card-dot ${scene.isReconstructed ? '' : 'is-preview'}`} aria-hidden="true" />
        <span>{scene.isReconstructed ? 'Real-world scan' : 'Uncalibrated preview'}</span>
        <span className="scene-card-sep" aria-hidden="true">·</span>
        <span>{scene.sceneType}</span>
      </div>

      <h2 className="scene-card-title">{scene.name}</h2>
      {scene.description && <p className="scene-card-desc">{scene.description}</p>}

      <dl className="scene-card-stats">
        <div>
          <dt>Detail</dt>
          <dd>{stats ? primaryStat : '—'}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{scene.dimensionsLabel?.replace(/ × [\d.]+m$/, '') || '—'}</dd>
        </div>
        <div>
          <dt>Places</dt>
          <dd>{placeCount}</dd>
        </div>
      </dl>

      {activeRoute?.poi && (
        <div className="scene-card-route" role="status">
          <Navigation size={14} />
          <div>
            <strong>{activeRoute.poi.name}</strong>
            <span>
              {activeRoute.distanceMeters} m · about {Math.max(1, Math.round(activeRoute.distanceMeters / 1.2))} s walk
            </span>
          </div>
          <button type="button" className="scene-card-icon-btn" onClick={onClearRoute} aria-label="Clear route">
            <X size={13} />
          </button>
        </div>
      )}

      <button
        type="button"
        className="scene-card-toggle"
        aria-expanded={showDetails}
        onClick={() => setShowDetails((v) => !v)}
      >
        <span>Capture details</span>
        <ChevronDown size={14} className={showDetails ? 'is-flipped' : ''} />
      </button>

      {showDetails && (
        <div className="scene-card-details">
          <p>{scene.reconstructionStatus}</p>
          {scene.navigationStatus === 'preview' && (
            <p>Navigation uses placeholder room bounds; no measured obstacles or places yet.</p>
          )}
          <dl>
            <div>
              <dt>Camera</dt>
              <dd>
                {cameraCoords.x}, {cameraCoords.y}, {cameraCoords.z} m
              </dd>
            </div>
            <div>
              <dt>Obstacles</dt>
              <dd>{stats?.collisionCount ?? scene.colliders?.length ?? 0} volumes + walls</dd>
            </div>
            {isSplat && stats?.splatCount && (
              <div>
                <dt>Splats</dt>
                <dd>{stats.splatCount.toLocaleString()}</dd>
              </div>
            )}
          </dl>
          <button type="button" className="scene-card-link" onClick={onImport}>
            <Upload size={12} />
            <span>Open your own .glb or .splat</span>
          </button>
        </div>
      )}
    </section>
  );
}
