// Live ADS-B traffic from the free readsb-style community APIs, with fallbacks.
// fetch-only, so it runs in Node 18+ and Cloudflare Workers.

const SOURCES = [
  (la, lo, r) => `https://api.airplanes.live/v2/point/${la}/${lo}/${r}`,
  (la, lo, r) => `https://api.adsb.lol/v2/point/${la}/${lo}/${r}`,
  (la, lo, r) => `https://opendata.adsb.fi/api/v3/lat/${la}/lon/${lo}/dist/${r}`,
];

export const GA_TYPES = new Set([
  'C150', 'C152', 'C172', 'C182', 'C206', 'C210', 'P28A', 'P28B', 'P28R', 'PA28', 'PA32', 'PA34', 'PA44',
  'SR20', 'SR22', 'DA20', 'DA40', 'DA42', 'DA62', 'BE35', 'BE36', 'BE58', 'M20P', 'M20T', 'C208', 'PC12', 'TBM9',
]);

const toRad = (d) => (d * Math.PI) / 180;

export function distanceNm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchTraffic({ lat, lon, radiusNm, fieldElevFt = 0, userAgent = 'solidpixels-aviation/1.0' }) {
  let raw = null;
  let lastErr;
  for (const url of SOURCES) {
    try {
      const res = await fetch(url(lat, lon, radiusNm), {
        headers: { Accept: 'application/json', 'User-Agent': userAgent },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) { lastErr = new Error(`${res.status} from ${url(lat, lon, radiusNm)}`); continue; }
      const data = await res.json();
      raw = data.ac || data.aircraft || [];
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (raw === null) throw lastErr || new Error('no ADS-B source reachable');
  return normalize(raw, { lat, lon, radiusNm, fieldElevFt });
}

export function normalize(list, { lat, lon, radiusNm, fieldElevFt = 0 }) {
  const out = [];
  for (const ac of list) {
    if (typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue;
    const onGround = ac.alt_baro === 'ground';
    const alt = onGround ? fieldElevFt : (typeof ac.alt_baro === 'number' ? ac.alt_baro : ac.alt_geom);
    if (typeof alt !== 'number') continue;

    const dist = distanceNm(lat, lon, ac.lat, ac.lon);
    if (dist > radiusNm) continue;

    const type = String(ac.t || '').toUpperCase();
    const cat = String(ac.category || '').toUpperCase();
    const callsign = String(ac.flight || '').trim().toUpperCase();
    const vrate = Number(ac.baro_rate ?? ac.geom_rate ?? 0);

    let kind = 'airline';
    if ((Number(ac.dbFlags) & 1) === 1) kind = 'mil';
    else if (cat === 'A7') kind = 'heli';
    else if (GA_TYPES.has(type) || cat === 'A1') kind = 'ga';

    out.push({
      hex: ac.hex,
      callsign,
      reg: String(ac.r || '').toUpperCase(),
      type,
      kind,
      onGround,
      lat: ac.lat,
      lon: ac.lon,
      alt,
      agl: alt - fieldElevFt,
      gs: Number(ac.gs || 0),
      track: Number(ac.track ?? ac.true_heading ?? 0),
      vrate,
      trend: vrate > 400 ? 1 : vrate < -400 ? -1 : 0,
      dist,
      // east / north offsets in nm from the reference point
      dx: (ac.lon - lon) * Math.cos(toRad(lat)) * 60,
      dy: (ac.lat - lat) * 60,
    });
  }
  return out.sort((a, b) => a.dist - b.dist);
}
