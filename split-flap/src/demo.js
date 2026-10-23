// Synthetic traffic + routes so the board renders without network access (--demo).
import { normalize } from './adsb.js';

const FLIGHTS = [
  // callsign, type, cat, east nm, north nm, alt, gs, track, vrate, route (IATA)
  ['SWA1844', 'B38M', 'A3', -9, 1.2, 4200, 180, 75, -800, 'DEN-PHX'],
  ['UAL1520', 'B789', 'A5', 24, 9, 13000, 300, 245, -1500, 'SFO-PHX'],
  ['AAL1203', 'A321', 'A3', 3.5, 0.3, 2100, 150, 255, -700, 'ORD-PHX'],
  ['SKW3301', 'CRJ9', 'A3', -16, -6, 9000, 260, 70, -1200, 'LAX-PHX'],
  ['AAL2291', 'A321', 'A3', 9, -0.8, 6800, 230, 70, 1800, 'PHX-DFW'],
  ['DAL1123', 'A20N', 'A3', -18, -10, 18000, 380, 50, 2000, 'PHX-ATL'],
  ['SWA2210', 'B737', 'A3', 0.4, 0, 'ground', 12, 260, 0, 'PHX-LAS'],
  ['FFT1702', 'A20N', 'A3', -25, 18, 31000, 450, 230, 0, 'DEN-SAN'],
  ['N734P', 'P28A', 'A1', -3, 10, 3500, 105, 160, 0, null],
  ['N912C', 'C172', 'A1', 2, 2.5, 2900, 90, 300, -500, null],
];

export function demoTraffic({ lat, lon, radiusNm, fieldElevFt }) {
  const raw = FLIGHTS.map(([flight, t, category, x, y, alt, gs, track, vr]) => ({
    hex: flight.toLowerCase(), flight, t, category,
    lat: lat + y / 60,
    lon: lon + x / (60 * Math.cos((lat * Math.PI) / 180)),
    alt_baro: alt, gs, track, baro_rate: vr,
  }));
  return normalize(raw, { lat, lon, radiusNm: Math.max(radiusNm, 40), fieldElevFt });
}

export function demoRoutes() {
  const m = new Map();
  for (const f of FLIGHTS) {
    if (!f[9]) continue;
    const iata = f[9].split('-');
    m.set(f[0], { iata, icao: iata.map((c) => (c === 'PHX' ? 'KPHX' : `K${c}`)) });
  }
  return m;
}
