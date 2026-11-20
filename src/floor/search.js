/**
 * NAMMA SPACE — Destination search
 *
 * Text relevance (exact > prefix > word prefix > substring > typo-tolerant) on name, room number,
 * aliases and category; ties are broken by real walking distance from where the user stands.
 * A leading "nearest"/"closest" ("nearest stairs") ranks purely by walking distance.
 */

export const normalise = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Damerau-free Levenshtein distance, capped for speed. */
export function editDistance(a, b, cap = 3) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

function termScore(term, text) {
  if (!text) return 0;
  if (text === term) return 100;
  if (text.startsWith(term)) return 80;
  const words = text.split(' ');
  if (words.some((w) => w.startsWith(term))) return 65;
  if (text.includes(term)) return 45;
  if (term.length >= 4) {
    const allowed = term.length >= 7 ? 2 : 1;
    if (words.some((w) => editDistance(term, w.slice(0, term.length + 1), allowed) <= allowed)) return 30;
  }
  return 0;
}

const NEAREST_PREFIX = /^(nearest|closest|near me|nearby)\s*/;

/**
 * @param {Array} pois               Points of interest ({ name, number?, aliases, category, description }).
 * @param {string} query
 * @param {(poi) => number} distance Walking distance in metres (Infinity = unreachable).
 * @returns {Array<{ poi, score, distance }>}
 */
export function searchPois(pois, query, distance = () => 0) {
  let q = normalise(query);
  const nearestMode = NEAREST_PREFIX.test(q);
  if (nearestMode) q = q.replace(NEAREST_PREFIX, '');
  const terms = q ? q.split(' ') : [];

  const results = [];
  for (const poi of pois) {
    const fields = [
      [normalise(poi.name), 1],
      [normalise(poi.number), 1.1],
      ...(poi.aliases || []).map((a) => [normalise(a), 0.9]),
      [normalise(poi.category), 0.6],
      [normalise(poi.description), 0.35]
    ];
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      let best = 0;
      for (const [text, weight] of fields) best = Math.max(best, termScore(term, text) * weight);
      if (best === 0) matchedAll = false;
      score += best;
    }
    if (!matchedAll) continue;
    const d = distance(poi);
    if (!Number.isFinite(d)) continue;
    results.push({ poi, score: terms.length ? score / terms.length : 0, distance: d });
  }

  if (nearestMode && terms.length && results.length) {
    // "nearest X": keep only strong matches for X, then order by walking distance.
    const top = Math.max(...results.map((r) => r.score));
    const strong = results.filter((r) => r.score >= top * 0.75);
    results.length = 0;
    results.push(...strong);
  }

  results.sort((a, b) => {
    if (nearestMode || !terms.length) return a.distance - b.distance;
    // Treat scores within 5 points as equal so closer places win among near-equal matches.
    if (Math.abs(a.score - b.score) > 5) return b.score - a.score;
    return a.distance - b.distance;
  });
  return results;
}
