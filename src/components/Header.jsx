import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Box, Map, Maximize2, Minimize2, Navigation, Search, X } from 'lucide-react';
import { getFloor1Navigator } from '../floor/floor1.js';
import { searchPois } from '../floor/search.js';

const MAX_FLOOR_RESULTS = 5;

/**
 * NAMMA SPACE — Top bar: brand + scene picker, one search for places in this scan and on the
 * floor, and the global actions (floor map, guide, fullscreen).
 */
export default function Header({
  scenes,
  activeScene,
  onSelectScene,
  isLoading,
  hasError,
  isFullscreen,
  onToggleFullscreen,
  onOpenGuide,
  onOpenFloorMap,
  activePoi,
  onSelectPoi,
  onClearPoi
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const scenePois = activeScene?.pois || [];
  const sceneResults = useMemo(
    () => searchPois(scenePois, query).map((r) => ({ type: 'scene', poi: r.poi })),
    [scenePois, query]
  );
  const scenePoiIds = useMemo(() => new Set(scenePois.map((p) => p.id)), [scenePois]);
  const floorResults = useMemo(() => {
    if (!isOpen || !query.trim()) return [];
    return getFloor1Navigator()
      .search(query)
      // Places of the open scan are already listed under "In this scan".
      .filter((r) => r.poi.scan?.sceneId !== activeScene?.id && !scenePoiIds.has(r.poi.id))
      .slice(0, MAX_FLOOR_RESULTS)
      .map((r) => ({ type: 'floor', poi: r.poi, distance: r.distance }));
  }, [isOpen, query, activeScene?.id, scenePoiIds]);
  const results = [...sceneResults, ...floorResults];

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    const handleSlash = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('keydown', handleSlash);
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('keydown', handleSlash);
    };
  }, []);

  useEffect(() => {
    setQuery('');
    setIsOpen(false);
  }, [activeScene?.id]);

  const choose = (result) => {
    if (!result) return;
    setIsOpen(false);
    inputRef.current?.blur();
    if (result.type === 'scene') onSelectPoi(result.poi, true);
    else onOpenFloorMap(result.poi);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      choose(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  let statusClass = 'status-dot';
  let statusText = activeScene?.isReconstructed ? 'Live scan' : 'Preview';
  if (isLoading) {
    statusClass = 'status-dot status-loading';
    statusText = 'Loading';
  } else if (hasError) {
    statusClass = 'status-dot status-error';
    statusText = 'Load error';
  } else if (!activeScene?.isReconstructed) {
    statusClass = 'status-dot status-demo';
  }

  const renderResult = (result, index) => {
    const { poi } = result;
    const isSelected = result.type === 'scene' && activePoi?.id === poi.id;
    return (
      <button
        key={`${result.type}-${poi.id}`}
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        className={`search-result ${index === activeIndex ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => choose(result)}
      >
        <span className={`search-result-icon ${result.type === 'floor' ? 'is-floor' : ''}`} aria-hidden="true">
          {result.type === 'floor' ? <Map size={13} /> : <Navigation size={13} />}
        </span>
        <span className="search-result-main">
          <span className="search-result-title">{poi.name}</span>
          <span className="search-result-meta">{poi.category}</span>
        </span>
        <span className="search-result-hint">
          {result.type === 'floor' ? `${Math.round(result.distance)} m` : 'Go'}
        </span>
      </button>
    );
  };

  return (
    <header className="spatial-header" role="banner">
      <div className="header-cluster">
        <div className="brand-mark">
          <div className="brand-logo-box" aria-hidden="true">
            <Box size={17} strokeWidth={2.2} />
          </div>
          <div className="brand-text">
            <span className="brand-title">NAMMA SPACE</span>
            <span className="brand-tagline">Indoor digital twin</span>
          </div>
        </div>

        <label htmlFor="scene-select" className="sr-only">
          Scene
        </label>
        <select
          id="scene-select"
          className="scene-select"
          value={activeScene?.id || ''}
          onChange={(e) => onSelectScene(e.target.value)}
        >
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="status-badge" role="status" aria-live="polite">
          <span className={statusClass} />
          <span>{statusText}</span>
        </div>
      </div>

      <div className="header-search-cluster" ref={wrapRef}>
        <div className="search-input-wrap">
          <Search size={15} className="search-input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search places — stage, 503, lift…"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls="header-search-results"
            aria-label="Search places in this scan and on the floor"
          />
          {query || activePoi ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setQuery('');
                onClearPoi?.();
              }}
              aria-label="Clear search and route"
            >
              <X size={12} />
            </button>
          ) : (
            <kbd className="keycap search-shortcut" aria-hidden="true">/</kbd>
          )}
        </div>

        {isOpen && (sceneResults.length > 0 || query.trim()) && (
          <div id="header-search-results" className="search-panel" role="listbox" aria-label="Places">
            {sceneResults.length > 0 && (
              <div className="search-group">
                <div className="search-group-label">In this scan</div>
                {sceneResults.map((r, i) => renderResult(r, i))}
              </div>
            )}
            {floorResults.length > 0 && (
              <div className="search-group">
                <div className="search-group-label">On the floor · opens the map</div>
                {floorResults.map((r, i) => renderResult(r, sceneResults.length + i))}
              </div>
            )}
            {results.length === 0 && <div className="search-empty">No places match “{query}”.</div>}
          </div>
        )}
      </div>

      <div className="header-cluster header-actions">
        <button
          type="button"
          className="icon-btn icon-btn-accent"
          onClick={() => onOpenFloorMap()}
          title="Floor map and walking routes"
        >
          <Map size={15} />
          <span>Floor map</span>
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-square"
          onClick={onOpenGuide}
          title="Capture guide"
          aria-label="Capture guide"
        >
          <BookOpen size={15} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-square"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
    </header>
  );
}
