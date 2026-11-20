import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CornerUpLeft,
  Crosshair,
  Flag,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  X
} from 'lucide-react';
import { FLOOR_1, FLOOR_1_ANNOTATIONS } from '../floor/floor1.js';
import { FloorNavigator as Navigator } from '../floor/floorNavigator.js';

let sharedNavigator = null;
const getNavigator = () => (sharedNavigator ??= new Navigator(FLOOR_1, FLOOR_1_ANNOTATIONS));

const formatEta = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`);

const STEP_ICON = {
  start: Navigation,
  arrive: Flag,
  left: ArrowLeft,
  right: ArrowRight,
  around: CornerUpLeft,
  straight: ArrowUp
};
const stepIcon = (step) => {
  if (step.kind !== 'turn') return STEP_ICON[step.kind];
  if (step.text.startsWith('Turn around')) return STEP_ICON.around;
  return STEP_ICON[step.side || 'straight'];
};

/**
 * Plan → map view transform. Portrait keeps plan axes (north up). Landscape rotates the plan a
 * quarter turn so the long north–south floor fills a wide screen (north then points left).
 */
function useViewTransform(model, landscape) {
  return useMemo(() => {
    const b = model.bounds;
    const pad = 1;
    if (!landscape) {
      return {
        landscape,
        width: b.maxX - b.minX + pad * 2,
        height: b.maxY - b.minY + pad * 2,
        tv: ([x, y]) => [x - b.minX + pad, y - b.minY + pad],
        fromView: ([vx, vy]) => [vx + b.minX - pad, vy + b.minY - pad],
        rect: (r) => ({ x: r.minX - b.minX + pad, y: r.minY - b.minY + pad, w: r.maxX - r.minX, h: r.maxY - r.minY })
      };
    }
    return {
      landscape,
      width: b.maxY - b.minY + pad * 2,
      height: b.maxX - b.minX + pad * 2,
      tv: ([x, y]) => [y - b.minY + pad, b.maxX - x + pad],
      fromView: ([vx, vy]) => [b.maxX + pad - vy, vx + b.minY - pad],
      rect: (r) => ({ x: r.minY - b.minY + pad, y: b.maxX - r.maxX + pad, w: r.maxY - r.minY, h: r.maxX - r.minX })
    };
  }, [model, landscape]);
}

const pointsAttr = (pts, tv) => pts.map((p) => tv(p).map((v) => v.toFixed(2)).join(',')).join(' ');

function FloorMapSvg({ navigator, view, start, route, destination, hoverStep, onMapPoint }) {
  const svgRef = useRef(null);
  const model = navigator.model;
  const { tv, rect } = view;

  const handleClick = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(svg.getScreenCTM().inverse());
    onMapPoint(view.fromView([local.x, local.y]));
  };

  const features = navigator.pois.filter((p) => p.kind === 'feature' && p.category === 'Vertical Access');
  const restricted = model.zones.filter((z) => !z.walkable);

  return (
    <svg
      ref={svgRef}
      className="floor-map-svg"
      viewBox={`0 0 ${view.width.toFixed(2)} ${view.height.toFixed(2)}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={handleClick}
      role="img"
      aria-label={`${model.name} floor map. Click a room or feature to route there.`}
    >
      <defs>
        <pattern id="fm-hatch" width="0.8" height="0.8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="0.8" stroke="var(--fm-hatch)" strokeWidth="0.18" />
        </pattern>
      </defs>

      {restricted.map((z) => (
        <polygon key={z.id} points={pointsAttr(z.polygon, tv)} fill="url(#fm-hatch)" />
      ))}
      {model.outlines.map((poly, i) => (
        <polygon key={i} points={pointsAttr(poly, tv)} className="fm-corridor" />
      ))}
      {model.rooms.map((room) => {
        const r = rect(room.rect);
        const isDest = destination?.roomId === room.id;
        return (
          <g key={room.id}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} className={`fm-room ${isDest ? 'is-dest' : ''}`} />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2 + (isDest ? 1.4 : 0)} className="fm-room-label" textAnchor="middle" dominantBaseline="middle">
              {room.number}
            </text>
          </g>
        );
      })}
      {model.blocks.map((blk) => {
        const r = rect(blk.rect);
        return <rect key={blk.id} x={r.x} y={r.y} width={r.w} height={r.h} className={`fm-block fm-${blk.kind}`} />;
      })}
      {model.walls.map((w, i) => {
        const [x1, y1] = tv(w.a);
        const [x2, y2] = tv(w.b);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="fm-wall" />;
      })}
      {model.doors.map((d) => {
        const [x, y] = tv(d.center);
        return <circle key={d.id} cx={x} cy={y} r={0.32} className="fm-door" />;
      })}
      {features.map((f) => {
        const [x, y] = tv(f.position);
        return (
          <g key={f.id} className={`fm-feature ${destination?.id === f.id ? 'is-dest' : ''}`}>
            <circle cx={x} cy={y} r={0.75} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central">
              {f.id === 'poi-lift' ? 'L' : 'S'}
            </text>
          </g>
        );
      })}

      {route && (
        <>
          <polyline points={pointsAttr(route.points, tv)} className="fm-route-casing" />
          <polyline points={pointsAttr(route.points, tv)} className="fm-route" />
        </>
      )}
      {hoverStep?.at && (() => {
        const [x, y] = tv(hoverStep.at);
        return <circle cx={x} cy={y} r={0.9} className="fm-step-focus" />;
      })()}
      {destination && (() => {
        const [x, y] = tv(destination.at);
        return (
          <g className="fm-dest-pin" transform={`translate(${x} ${y})`}>
            <path d="M0 0 C -0.9 -1.1 -1.1 -1.5 -1.1 -2 A 1.1 1.1 0 1 1 1.1 -2 C 1.1 -1.5 0.9 -1.1 0 0 Z" />
            <circle cx="0" cy="-2" r="0.4" />
          </g>
        );
      })()}
      {start && (() => {
        const [x, y] = tv(start);
        return (
          <g className="fm-you">
            <circle cx={x} cy={y} r={1.3} className="fm-you-halo" />
            <circle cx={x} cy={y} r={0.55} className="fm-you-dot" />
          </g>
        );
      })()}

      <g className="fm-compass" transform={`translate(${view.width - 2.2} 2.2) rotate(${view.landscape ? -90 : 0})`}>
        <circle r="1.4" />
        <path d="M0 -1.05 L0.45 0.3 L0 0.05 L-0.45 0.3 Z" />
        <text y="0.95" textAnchor="middle">N</text>
      </g>
    </svg>
  );
}

export default function FloorNavigator({ open, onClose }) {
  const navigator = useMemo(() => (open || sharedNavigator ? getNavigator() : null), [open]);
  const [query, setQuery] = useState('');
  const [start, setStart] = useState(null);
  const [startLabel, setStartLabel] = useState('Lift Lobby');
  const [destination, setDestination] = useState(null);
  const [tapMode, setTapMode] = useState('destination');
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoverStep, setHoverStep] = useState(null);
  const [landscape, setLandscape] = useState(true);
  const [notice, setNotice] = useState(null);
  const mapWrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (navigator && !start) setStart(navigator.defaultStart);
  }, [navigator, start]);

  useLayoutEffect(() => {
    if (!open || !mapWrapRef.current) return undefined;
    const el = mapWrapRef.current;
    const update = () => setLandscape(el.clientWidth > el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  const view = useViewTransform(FLOOR_1, landscape);

  const results = useMemo(
    () => (navigator && start ? navigator.search(query, start).slice(0, 8) : []),
    [navigator, query, start]
  );
  useEffect(() => setActiveIndex(0), [query]);

  const route = useMemo(
    () => (navigator && start && destination ? navigator.route(start, destination) : null),
    [navigator, start, destination]
  );

  const chooseDestination = useCallback((poi) => {
    setDestination(poi);
    setNotice(null);
    setHoverStep(null);
  }, []);

  const handleMapPoint = useCallback(
    (p) => {
      if (!navigator) return;
      if (tapMode === 'start') {
        const snapped = navigator.snapToWalkable(p);
        if (!snapped) {
          setNotice('That spot is not walkable — tap inside a room or the corridor.');
          return;
        }
        setStart(snapped);
        setStartLabel(navigator.model.regionAt(snapped)?.name || 'Pinned spot');
        setTapMode('destination');
        setNotice(null);
        return;
      }
      const poi = navigator.poiNear(p);
      if (poi) chooseDestination(poi);
      else setNotice('No destination there — tap a room, the lift or the stairs.');
    },
    [navigator, tapMode, chooseDestination]
  );

  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      chooseDestination(results[activeIndex].poi);
    }
  };

  if (!open || !navigator) return null;

  return (
    <div className="floor-nav-backdrop" role="dialog" aria-modal="true" aria-labelledby="floor-nav-title" onClick={onClose}>
      <section className="floor-nav" onClick={(e) => e.stopPropagation()}>
        <aside className="floor-nav-side">
          <div className="floor-nav-head">
            <div>
              <span className="floor-nav-kicker mono">FLOOR {navigator.model.level} · INDOOR ROUTING</span>
              <h3 id="floor-nav-title" className="heading-font">{navigator.model.name}</h3>
            </div>
            <button type="button" className="icon-btn icon-btn-square" onClick={onClose} aria-label="Close floor map">
              <X size={16} />
            </button>
          </div>

          <div className="floor-nav-from">
            <span className="floor-nav-from-dot" aria-hidden="true" />
            <span className="floor-nav-from-text">
              From <strong>{startLabel}</strong>
            </span>
            <button
              type="button"
              className={`floor-nav-chip ${tapMode === 'start' ? 'is-active' : ''}`}
              onClick={() => setTapMode((m) => (m === 'start' ? 'destination' : 'start'))}
              title="Tap the map to set where you are"
            >
              <LocateFixed size={12} />
              <span>{tapMode === 'start' ? 'Tap the map…' : 'Set my location'}</span>
            </button>
          </div>

          <div className="search-input-wrap floor-nav-search">
            <Search size={15} className="search-input-icon" />
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder="Search: 503, lift, nearest stairs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              aria-label="Search destinations on this floor"
              aria-controls="floor-nav-results"
            />
            {query && (
              <button type="button" className="search-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={12} />
              </button>
            )}
          </div>

          {!route && (
            <div id="floor-nav-results" className="floor-nav-results" role="listbox" aria-label="Destinations">
              {results.length === 0 && <div className="floor-nav-empty">No place on this floor matches “{query}”.</div>}
              {results.map(({ poi, distance }, i) => (
                <button
                  key={poi.id}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`poi-item-btn ${i === activeIndex ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => chooseDestination(poi)}
                >
                  <div className="poi-item-main">
                    <span className="poi-item-title">{poi.name}</span>
                    <span className="poi-item-meta">{poi.category}</span>
                  </div>
                  <span className="poi-route-tag">{distance < 1 ? 'here' : `${Math.round(distance)} m`}</span>
                </button>
              ))}
            </div>
          )}

          {route && (
            <div className="floor-nav-route">
              <div className="floor-nav-route-head">
                <div>
                  <span className="floor-nav-route-to">
                    <MapPin size={13} /> {route.poi.name}
                  </span>
                  <span className="floor-nav-route-stats mono">
                    {route.distanceMeters.toFixed(1)} m · {formatEta(route.etaSeconds)} walk
                  </span>
                </div>
                <button type="button" className="search-clear-btn" onClick={() => setDestination(null)} aria-label="Clear route">
                  <X size={12} />
                </button>
              </div>
              <ol className="floor-nav-steps">
                {route.steps.map((step, i) => {
                  const Icon = stepIcon(step);
                  return (
                    <li
                      key={i}
                      onMouseEnter={() => setHoverStep(step)}
                      onMouseLeave={() => setHoverStep(null)}
                      className={step.kind === 'arrive' ? 'is-arrive' : ''}
                    >
                      <Icon size={14} />
                      <span>{step.text}</span>
                      {step.distance > 0 && <span className="mono floor-nav-step-dist">{step.distance} m</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {!route && destination && (
            <div className="floor-nav-empty">No walkable route to {destination.name} from here.</div>
          )}
        </aside>

        <div className="floor-nav-map" ref={mapWrapRef}>
          <FloorMapSvg
            navigator={navigator}
            view={view}
            start={start}
            route={route}
            destination={destination}
            hoverStep={hoverStep}
            onMapPoint={handleMapPoint}
          />
          <div className="floor-nav-map-hint">
            <Crosshair size={12} />
            <span>{notice || (tapMode === 'start' ? 'Tap where you are standing' : 'Tap a room, the lift or the stairs')}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
