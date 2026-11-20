import React from 'react';
import { Footprints, LogOut, RotateCcw, ShieldCheck } from 'lucide-react';

const SPEED_OPTIONS = [
  { label: 'Slow', value: 2.0 },
  { label: 'Normal', value: 3.2 },
  { label: 'Fast', value: 4.8 }
];

const TOUCH_KEYS = [
  { dir: 'forward', label: 'Move forward', glyph: '↑', area: 'up' },
  { dir: 'left', label: 'Step left', glyph: '←', area: 'left' },
  { dir: 'backward', label: 'Move back', glyph: '↓', area: 'down' },
  { dir: 'right', label: 'Step right', glyph: '→', area: 'right' }
];

/**
 * NAMMA SPACE — Viewer controls dock (desktop) and touch movement pad (phones).
 */
export default function ViewerControls({
  isPointerLocked,
  onEngagePointerLock,
  onReleasePointerLock,
  onResetView,
  showCollisionBounds,
  onToggleCollisionBounds,
  moveSpeed,
  onChangeMoveSpeed,
  onVirtualMove
}) {
  return (
    <>
      <div className="mobile-touch-pad" aria-label="Touch movement controls">
        {TOUCH_KEYS.map((k) => (
          <button
            key={k.dir}
            type="button"
            className={`touch-move-btn touch-${k.area}`}
            onPointerDown={() => onVirtualMove?.(k.dir, true)}
            onPointerUp={() => onVirtualMove?.(k.dir, false)}
            onPointerLeave={() => onVirtualMove?.(k.dir, false)}
            onPointerCancel={() => onVirtualMove?.(k.dir, false)}
            aria-label={k.label}
          >
            {k.glyph}
          </button>
        ))}
      </div>

      <aside className="viewer-controls-dock" aria-label="Viewer controls">
        <div className="controls-card">
          <div className="controls-row">
            {isPointerLocked ? (
              <button type="button" className="controls-primary-btn is-locked-active" onClick={onReleasePointerLock}>
                <LogOut size={14} />
                <span>Exit walk mode</span>
                <kbd className="keycap keycap-inline">Esc</kbd>
              </button>
            ) : (
              <button type="button" className="controls-primary-btn" onClick={onEngagePointerLock}>
                <Footprints size={15} />
                <span>Walk mode</span>
              </button>
            )}
            <button
              type="button"
              className="icon-btn icon-btn-square"
              onClick={onResetView}
              title="Back to start (R)"
              aria-label="Back to start position"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              className={`icon-btn icon-btn-square ${showCollisionBounds ? 'is-active' : ''}`}
              onClick={onToggleCollisionBounds}
              aria-pressed={showCollisionBounds}
              title="Show walkable area and obstacles"
              aria-label="Show walkable area and obstacles"
            >
              <ShieldCheck size={15} />
            </button>
          </div>

          <div className="speed-control-wrap">
            <span className="speed-label">Walking speed</span>
            <div className="speed-pills" role="group" aria-label="Walking speed">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  aria-pressed={moveSpeed === opt.value}
                  className={`speed-pill ${moveSpeed === opt.value ? 'is-active' : ''}`}
                  onClick={() => onChangeMoveSpeed(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="keyhints-strip" aria-label="Keyboard shortcuts">
            <span className="keycap-group">
              <kbd className="keycap">W</kbd>
              <kbd className="keycap">A</kbd>
              <kbd className="keycap">S</kbd>
              <kbd className="keycap">D</kbd>
              <span>Move</span>
            </span>
            <span className="keycap-group">
              <kbd className="keycap">Shift</kbd>
              <span>Faster</span>
            </span>
            <span className="keycap-group">
              <kbd className="keycap">E</kbd>
              <span>Go to place</span>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
