import React from 'react';

/**
 * NAMMA SPACE — Honest Asset Loading State
 *
 * Only renders a numeric percentage bar when genuine byte transfer progress
 * (`progress.percent !== null`) is reported by XHR/fetch. Never fabricates AI processing percentages.
 */
export default function LoadingState({ sceneConfig, progress }) {
  const hasRealByteProgress =
    progress && typeof progress.percent === 'number' && !Number.isNaN(progress.percent);

  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="state-overlay" role="status" aria-live="polite">
      <div className="state-card">
        <div className="loader-ring" aria-hidden="true" />
        <div>
          <h2 className="heading-font" style={{ fontSize: '19px', marginBottom: '6px' }}>
            Loading {sceneConfig?.name || 'Spatial Environment'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-ivory-subtle)' }}>
            {sceneConfig?.mode === 'splat'
              ? 'Streaming 3D Gaussian Splat buffer and initializing proxy collision bounds…'
              : sceneConfig?.mode === 'glb'
                ? 'Decoding glTF 2.0 binary mesh and registering obstacle colliders…'
                : 'Initializing Three.js architectural stage…'}
          </p>
        </div>

        {hasRealByteProgress && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
              />
            </div>
            <div
              className="mono"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                color: 'var(--color-sage-bright)'
              }}
            >
              <span>
                {formatBytes(progress.loadedBytes)} / {formatBytes(progress.totalBytes)}
              </span>
              <span>{progress.percent}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
