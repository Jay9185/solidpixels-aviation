// Synthetic traffic so the plugin renders without network access (--demo).
import { normalize } from './adsb.js';

export function demoTraffic({ lat, lon, radiusNm, fieldElevFt }) {
  const nm = (dxNm, dyNm) => ({
    lat: lat + dyNm / 60,
    lon: lon + dxNm / (60 * Math.cos((lat * Math.PI) / 180)),
  });
  const raw = [
    { flight: 'SWA1844', t: 'B38M', category: 'A3', ...nm(-7, 1.2), alt_baro: 4200, gs: 180, track: 75, baro_rate: -800 },
    { flight: 'AAL2291', t: 'A321', category: 'A3', ...nm(9, -0.8), alt_baro: 6800, gs: 230, track: 70, baro_rate: 1800 },
    { flight: 'N734P', t: 'P28A', category: 'A1', ...nm(-3, 10), alt_baro: 3500, gs: 105, track: 160, baro_rate: 0 },
    { flight: 'N912C', t: 'C172', category: 'A1', ...nm(2, 2.5), alt_baro: 2900, gs: 90, track: 300, baro_rate: -500 },
    { flight: 'UAL1520', t: 'B789', category: 'A5', ...nm(14, 8), alt_baro: 15000, gs: 310, track: 245, baro_rate: -1500 },
    { flight: 'LIFE31', t: 'EC35', category: 'A7', ...nm(-11, -6), alt_baro: 2200, gs: 120, track: 40, baro_rate: 0 },
    { flight: 'DAL1123', t: 'A20N', category: 'A3', ...nm(-15, -10), alt_baro: 22000, gs: 410, track: 50, baro_rate: 2000 },
    { flight: 'RCH407', t: 'C17', category: 'A5', dbFlags: 1, ...nm(17, -4), alt_baro: 19000, gs: 380, track: 280, baro_rate: 0 },
  ];
  return normalize(raw, { lat, lon, radiusNm, fieldElevFt });
}
