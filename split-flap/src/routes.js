// Callsign -> route (origin/destination) lookup via the community "routeset"
// API used by tar1090 (adsb.lol, with adsb.im as fallback). No key needed.
// fetch-only, so it runs in Node 18+ and Cloudflare Workers.
//
// Routes come from a crowd-maintained database, checked for plausibility
// against the aircraft's position. They are usually right for scheduled
// airline flights and absent for GA, charters and military.

const ENDPOINTS = [
  'https://api.adsb.lol/api/0/routeset',
  'https://adsb.im/api/0/routeset',
];

const HIT_TTL = 30 * 60 * 1000;  // a flight keeps its route for its whole trip
const MISS_TTL = 10 * 60 * 1000;
const cache = new Map();          // callsign -> { at, route | null }

const AIRLINE_CALLSIGN = /^[A-Z]{3}\d[A-Z0-9]*$/;

/**
 * @param {Array} aircraft  normalized list from adsb.js
 * @returns {Promise<Map<string, {iata: string[], icao: string[]}>>}
 */
export async function lookupRoutes(aircraft, { userAgent = 'solidpixels-aviation/1.0', now = Date.now() } = {}) {
  const want = aircraft.filter((a) => AIRLINE_CALLSIGN.test(a.callsign));
  const todo = want.filter((a) => {
    const c = cache.get(a.callsign);
    return !c || now - c.at > (c.route ? HIT_TTL : MISS_TTL);
  });

  for (let i = 0; i < todo.length; i += 100) {
    const batch = todo.slice(i, i + 100);
    const body = JSON.stringify({ planes: batch.map((a) => ({ callsign: a.callsign, lat: a.lat, lng: a.lon })) });
    const rows = await post(body, userAgent);
    if (!rows) break; // both endpoints down: keep whatever is cached
    const seen = new Set();
    for (const r of rows) {
      const cs = String(r.callsign || '').trim().toUpperCase();
      if (!cs) continue;
      seen.add(cs);
      cache.set(cs, { at: now, route: parse(r) });
    }
    for (const a of batch) if (!seen.has(a.callsign)) cache.set(a.callsign, { at: now, route: null });
  }

  const out = new Map();
  for (const a of want) {
    const c = cache.get(a.callsign);
    if (c?.route) out.set(a.callsign, c.route);
  }
  return out;
}

async function post(body, userAgent) {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': userAgent },
        body,
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch {
      // try the next endpoint
    }
  }
  return null;
}

// Accepts the field names tar1090 reads, and rejects routes flagged implausible.
function parse(r) {
  if (r.plausible === false || r.plausible === 0 || r.plausible === '0') return null;
  const iataStr = r._airport_codes_iata || r.airport_codes_iata || '';
  const icaoStr = r.airport_codes || '';
  let iata = split(iataStr);
  const icao = split(icaoStr);
  if (!iata.length && Array.isArray(r._airports)) iata = r._airports.map((p) => String(p.iata || p.icao || '').toUpperCase());
  if (iata.length < 2 && icao.length < 2) return null;
  return { iata: iata.length >= 2 ? iata : icao.map((c) => c.slice(-3)), icao };
}

function split(s) {
  s = String(s || '').trim().toUpperCase();
  if (!s || s === 'UNKNOWN') return [];
  return s.split('-').map((x) => x.trim()).filter(Boolean);
}

/**
 * Classify an aircraft relative to the home airport.
 * @returns {{kind: 'arr'|'dep'|'ovr', other: string, from?: string, to?: string}}
 */
export function classify(a, route, home) {
  const H = home.map((h) => h.toUpperCase());
  const codes = route.iata;
  const icao = route.icao || [];
  const idx = codes.findIndex((c, i) => H.includes(c) || H.includes(icao[i]));
  if (idx === -1) return { kind: 'ovr', from: codes[0], to: codes[codes.length - 1] };
  const prev = codes[idx - 1];
  const next = codes[idx + 1];
  if (prev && !next) return { kind: 'arr', other: prev };
  if (next && !prev) return { kind: 'dep', other: next };
  // multi-leg through home: descending or low and slow means it's arriving
  const arriving = a.trend < 0 || (!a.onGround && a.agl < 4000 && a.trend <= 0);
  return arriving ? { kind: 'arr', other: prev } : { kind: 'dep', other: next };
}
