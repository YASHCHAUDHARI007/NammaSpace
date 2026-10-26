import React from 'react';
import { AlertTriangle, RotateCcw, Layers } from 'lucide-react';

/**
 * NAMMA SPACE — Actionable Scene Error & Fallback State
 */
export default function ErrorState({
  errorMessage,
  sceneConfig,
  onRetry,
  onFallbackToDemo
}) {
  return (
    <div className="state-overlay" role="alert">
      <div className="state-card">
        <div className="error-icon-box" aria-hidden="true">
          <AlertTriangle size={24} />
        </div>

        <div>
          <h2 className="heading-font" style={{ fontSize: '19px', marginBottom: '6px' }}>
            Unable to Load Spatial Asset
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-ivory-subtle)',
              lineHeight: 1.5,
              marginBottom: '10px'
            }}
          >
            {errorMessage || 'An unexpected error occurred while initializing the 3D scene.'}
          </p>
          {sceneConfig?.assetUrl && (
            <div
              className="mono"
              style={{
                fontSize: '11.5px',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'rgba(246, 244, 239, 0.06)',
                color: 'var(--color-sage-bright)'
              }}
            >
              Target Path: {sceneConfig.assetUrl}
            </div>
          )}
        </div>

        <div className="state-actions">
          <button
            type="button"
            className="state-btn state-btn-primary"
            onClick={onFallbackToDemo}
          >
            <Layers size={15} />
            <span>Load Baseline Scene</span>
          </button>

          <button
            type="button"
            className="state-btn state-btn-ghost"
            onClick={onRetry}
          >
            <RotateCcw size={15} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    </div>
  );
}
