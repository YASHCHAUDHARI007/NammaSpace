import React from 'react';

const formatMB = (bytes) => `${((bytes || 0) / (1024 * 1024)).toFixed(1)} MB`;

/**
 * NAMMA SPACE — Loading card. Shows a progress bar only for real byte progress; after the download
 * it says the view is being prepared (LoD build + first splat sort) instead of inventing a percent.
 */
export default function LoadingState({ sceneConfig, progress, isPreparing: preparingProp }) {
  const isPreparing = preparingProp || Boolean(progress?.preparing);
  const hasProgress = !isPreparing && typeof progress?.percent === 'number' && !Number.isNaN(progress.percent);

  return (
    <div className="state-overlay" role="status" aria-live="polite">
      <div className="state-card">
        <div className="loader-ring" aria-hidden="true" />
        <div>
          <h2 className="state-title">Loading {sceneConfig?.name || 'scene'}</h2>
          <p className="state-sub">{isPreparing ? 'Preparing the view…' : 'Downloading the scan…'}</p>
        </div>
        {hasProgress && (
          <div className="state-progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }} />
            </div>
            <div className="state-progress-meta mono">
              <span>
                {formatMB(progress.loadedBytes)} of {formatMB(progress.totalBytes)}
              </span>
              <span>{Math.round(progress.percent)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
