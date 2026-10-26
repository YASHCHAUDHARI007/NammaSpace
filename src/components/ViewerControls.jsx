import React from 'react';
import {
  MousePointerClick,
  RotateCcw,
  Maximize2,
  Minimize2,
  Gauge,
  Unlock
} from 'lucide-react';

const SPEED_OPTIONS = [
  { label: 'Slow', value: 2.0 },
  { label: 'Normal', value: 3.2 },
  { label: 'Fast', value: 4.8 }
];

/**
 * NAMMA SPACE — Viewer Controls Dock & Mobile Touch Controller
 */
export default function ViewerControls({
  isPointerLocked,
  onEngagePointerLock,
  onReleasePointerLock,
  onResetView,
  moveSpeed,
  onChangeMoveSpeed,
  isFullscreen,
  onToggleFullscreen,
  onVirtualMove
}) {
  return (
    <>
      {/* Mobile Touch D-Pad (Visible on mobile viewports <= 640px) */}
      <div className="mobile-touch-pad" aria-label="Touch Movement Controls">
        <div />
        <button
          type="button"
          className="touch-move-btn"
          onPointerDown={() => onVirtualMove?.('forward', true)}
          onPointerUp={() => onVirtualMove?.('forward', false)}
          onPointerLeave={() => onVirtualMove?.('forward', false)}
          aria-label="Move Forward"
        >
          W
        </button>
        <div />
        <button
          type="button"
          className="touch-move-btn"
          onPointerDown={() => onVirtualMove?.('left', true)}
          onPointerUp={() => onVirtualMove?.('left', false)}
          onPointerLeave={() => onVirtualMove?.('left', false)}
          aria-label="Strafe Left"
        >
          A
        </button>
        <button
          type="button"
          className="touch-move-btn"
          onPointerDown={() => onVirtualMove?.('backward', true)}
          onPointerUp={() => onVirtualMove?.('backward', false)}
          onPointerLeave={() => onVirtualMove?.('backward', false)}
          aria-label="Move Backward"
        >
          S
        </button>
        <button
          type="button"
          className="touch-move-btn"
          onPointerDown={() => onVirtualMove?.('right', true)}
          onPointerUp={() => onVirtualMove?.('right', false)}
          onPointerLeave={() => onVirtualMove?.('right', false)}
          aria-label="Strafe Right"
        >
          D
        </button>
      </div>

      {/* Desktop & Tablet Controls Dock (Bottom Right) */}
      <aside className="viewer-controls-dock" aria-label="Viewer Controls">
        <div className="controls-card">
          <div className="controls-row">
            {isPointerLocked ? (
              <button
                type="button"
                className="controls-primary-btn is-locked-active"
                onClick={onReleasePointerLock}
              >
                <Unlock size={14} />
                <span>Mouse Look Active (ESC to exit)</span>
              </button>
            ) : (
              <button
                type="button"
                className="controls-primary-btn"
                onClick={onEngagePointerLock}
              >
                <MousePointerClick size={15} />
                <span>Lock Cursor (First-Person Look)</span>
              </button>
            )}

            <button
              type="button"
              className="icon-btn icon-btn-square"
              onClick={onResetView}
              title="Reset Camera Position (Key: R)"
              aria-label="Reset Camera Position"
            >
              <RotateCcw size={15} />
            </button>

            <button
              type="button"
              className="icon-btn icon-btn-square"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>

          {/* Configurable Movement Speed */}
          <div className="speed-control-wrap">
            <span className="speed-label">
              <Gauge size={14} />
              <span>Walk Speed</span>
            </span>
            <div className="speed-pills" role="group" aria-label="Walking Speed">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className={`speed-pill ${moveSpeed === opt.value ? 'is-active' : ''}`}
                  onClick={() => onChangeMoveSpeed(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Compact Keyboard Hints Strip */}
          <div className="keyhints-strip" aria-label="Keyboard Shortcuts">
            <span className="keycap-group">
              <kbd className="keycap">W</kbd>
              <kbd className="keycap">A</kbd>
              <kbd className="keycap">S</kbd>
              <kbd className="keycap">D</kbd>
              <span>Move</span>
            </span>
            <span className="keycap-group">
              <kbd className="keycap">Shift</kbd>
              <span>Pace</span>
            </span>
            <span className="keycap-group">
              <kbd className="keycap">R</kbd>
              <span>Reset</span>
            </span>
            <span className="keycap-group">
              <kbd className="keycap">ESC</kbd>
              <span>Cursor</span>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
