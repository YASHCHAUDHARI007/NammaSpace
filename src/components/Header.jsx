import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Compass,
  Maximize2,
  Minimize2,
  Search,
  ShieldCheck,
  BookOpen,
  Navigation,
  X
} from 'lucide-react';

/**
 * NAMMA SPACE — Spatial Computing Header Bar
 */
export default function Header({
  scenes,
  activeScene,
  onSelectScene,
  isLoading,
  hasError,
  showCollisionBounds,
  onToggleCollisionBounds,
  isFullscreen,
  onToggleFullscreen,
  onOpenGuide,
  activePoi,
  onSelectPoi,
  onClearPoi
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchWrapRef = useRef(null);

  const pois = activeScene?.pois || [];
  const filteredPois = pois.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleClickOutside);
    return () => window.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  useEffect(() => {
    setSearchQuery('');
    setIsSearchOpen(false);
  }, [activeScene?.id]);

  let statusClass = 'status-dot';
  let statusText = activeScene?.navigationStatus === 'preview'
    ? 'Uncalibrated Preview • Placeholder Bounds'
    : activeScene?.roomBoundsKnown === false
      ? 'Room Size Unknown'
    : activeScene?.isReconstructed
      ? 'Calibrated Capture'
      : 'Synthetic Fixture';

  if (isLoading) {
    statusClass = 'status-dot status-loading';
    statusText = 'Loading Spatial Asset…';
  } else if (hasError) {
    statusClass = 'status-dot status-error';
    statusText = 'Asset Load Error';
  } else if (activeScene?.mode === 'demo') {
    statusClass = 'status-dot status-demo';
    statusText = 'Baseline Geometry (Demo)';
  }

  return (
    <header className="spatial-header" role="banner">
      {/* Left Cluster: Brand + Scene Selector + Rendering Status */}
      <div className="header-cluster">
        <div className="brand-mark">
          <div className="brand-logo-box" aria-hidden="true">
            <Box size={18} strokeWidth={2.2} />
          </div>
          <div className="brand-text">
            <span className="brand-title">NAMMA SPACE</span>
            <span className="brand-tagline">Your space, reimagined.</span>
          </div>
        </div>

        <div className="scene-selector-wrap">
          <label htmlFor="scene-mode-select" className="sr-only">
            Select Spatial Scene
          </label>
          <select
            id="scene-mode-select"
            className="scene-select"
            value={activeScene?.id || ''}
            onChange={(e) => onSelectScene(e.target.value)}
            aria-label="Active Spatial Environment"
          >
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="status-badge" role="status" aria-live="polite">
          <span className={statusClass} />
          <span>{statusText}</span>
        </div>
      </div>

      {/* Center Cluster: Searchable Points of Interest & Obstacle-Aware Wayfinding */}
      <div className="header-search-cluster" ref={searchWrapRef}>
        <div className="search-input-wrap">
          <Search size={15} className="search-input-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search rooms, furniture, or POIs for A* route…"
            value={searchQuery}
            onFocus={() => setIsSearchOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            aria-label="Search Points of Interest"
          />
          {(searchQuery || activePoi) && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setSearchQuery('');
                onClearPoi?.();
              }}
              title="Clear destination route"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {isSearchOpen && pois.length > 0 && (
          <div className="poi-dropdown" role="listbox" aria-label="Points of Interest">
            <div className="poi-dropdown-header">
              <span>Spatial Points of Interest ({filteredPois.length})</span>
              <span>{activeScene.colliders?.length ? 'A* Obstacle Route' : 'A* Aisle Route'}</span>
            </div>
            {filteredPois.length === 0 ? (
              <div style={{ padding: '10px', fontSize: '12.5px', color: 'var(--color-ivory-dim)' }}>
                No matching rooms or furniture in current scene.
              </div>
            ) : (
              filteredPois.map((poi) => {
                const isSelected = activePoi?.id === poi.id;
                return (
                  <button
                    key={poi.id}
                    type="button"
                    className={`poi-item-btn ${isSelected ? 'is-active' : ''}`}
                    onClick={() => {
                      onSelectPoi(poi, true);
                      setIsSearchOpen(false);
                    }}
                  >
                    <div className="poi-item-main">
                      <span className="poi-item-title">{poi.name}</span>
                      <span className="poi-item-meta">
                        {poi.category} — {poi.description}
                      </span>
                    </div>
                    <span className="poi-route-tag">
                      <Navigation size={10} style={{ display: 'inline', marginRight: 4 }} />
                      Route
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Right Cluster: Utility & Diagnostics Controls */}
      <div className="header-cluster header-actions">
        <button
          type="button"
          className={`icon-btn ${showCollisionBounds ? 'is-active' : ''}`}
          onClick={onToggleCollisionBounds}
          title="Toggle AABB Collision & Walkable Boundary Wireframes"
        >
          <ShieldCheck size={15} />
          <span>Colliders</span>
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onOpenGuide}
            title="One-video capture SOP & reconstruction pipeline guide"
        >
          <BookOpen size={15} />
          <span>Capture SOP</span>
        </button>

        <button
          type="button"
          className="icon-btn icon-btn-square"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
    </header>
  );
}
