// Synthetic, moving traffic for testing without network access.
// Positions are a function of time, so repeated renders show aircraft flying.

import { normalize } from './adsb.js';

export const SCENARIOS = {
  mixed: 'Airliners, GA, a helicopter and a military jet',
  busy: '24 aircraft spread across the scope',
  pattern: 'GA in the traffic pattern around the centre',
  alert: 'Low traffic inside 5 nm, red alert boxes',
  edge: 'Targets on and beyond the range ring',
  empty: 'No traffic',
};

const MIXED = [
  { flight: 'SWA1844', t: 'B38M', category: 'A3', x: -7, y: 1.2, alt: 4200, gs: 180, track: 75, vr: -800 },
  { flight: 'AAL2291', t: 'A321', category: 'A3', x: 9, y: -0.8, alt: 6800, gs: 230, track: 70, vr: 1800 },
  { flight: 'N734P', t: 'P28A', category: 'A1', x: -3, y: 10, alt: 3500, gs: 105, track: 160, vr: 0 },
  { flight: 'N912C', t: 'C172', category: 'A1', x: 2, y: 2.5, alt: 2900, gs: 90, track: 300, vr: -500 },
  { flight: 'UAL1520', t: 'B789', category: 'A5', x: 14, y: 8, alt: 15000, gs: 310, track: 245, vr: -1500 },
  { flight: 'LIFE31', t: 'EC35', category: 'A7', x: -11, y: -6, alt: 2200, gs: 120, track: 40, vr: 0 },
  { flight: 'DAL1123', t: 'A20N', category: 'A3', x: -15, y: -10, alt: 22000, gs: 410, track: 50, vr: 2000 },
  { flight: 'RCH407', t: 'C17', category: 'A5', dbFlags: 1, x: 17, y: -4, alt: 19000, gs: 380, track: 280, vr: 0 },
];

/**
 * @param {object} cfg  { lat, lon, radiusNm, fieldElevFt }
 * @param {object} [o]  { scenario, t } — t in seconds; defaults to wall clock
 */
export function demoTraffic(cfg, { scenario = 'mixed', t = Date.now() / 1000 } = {}) {
  const { lat, lon, radiusNm, fieldElevFt = 0 } = cfg;
  const R = radiusNm;
  const toLatLon = (x, y) => ({
    lat: lat + y / 60,
    lon: lon + x / (60 * Math.cos((lat * Math.PI) / 180)),
  });

  // straight-line mover that loops: flies through its start point every 10 min
  const fly = (p, i, { period = 600, scaled = true } = {}) => {
    const tau = ((t + i * 73) % period) - period / 2;
    const d = (p.gs * tau) / 3600;
    const tr = (p.track * Math.PI) / 180;
    // scale the scenario to the chosen range so it stays interesting at 5 or 40 nm
    const s = scaled ? R / 20 : 1;
    return raw(p, p.x * s + Math.sin(tr) * d, p.y * s + Math.cos(tr) * d, p.alt + (p.vr * tau) / 60);
  };

  const raw = (p, x, y, alt) => ({
    hex: (p.flight || 'x').toLowerCase(),
    flight: p.flight, t: p.t, category: p.category, dbFlags: p.dbFlags,
    ...toLatLon(x, y),
    alt_baro: Math.max(fieldElevFt + 300, Math.round(alt)),
    gs: p.gs, track: p.track, baro_rate: p.vr,
  });

  let list = [];
  if (scenario === 'mixed') list = MIXED.map(fly);

  if (scenario === 'busy') {
    const rnd = seeded(7);
    const types = [['B738', 'A3'], ['A320', 'A3'], ['B77W', 'A5'], ['C172', 'A1'], ['P28A', 'A1'], ['SR22', 'A1']];
    for (let i = 0; i < 24; i++) {
      const [ty, cat] = types[i % types.length];
      const ga = cat === 'A1';
      list.push(fly({
        flight: `${ga ? 'N' : 'TST'}${100 + i}`, t: ty, category: cat,
        x: (rnd() * 2 - 1) * 19, y: (rnd() * 2 - 1) * 19,
        alt: ga ? 2500 + rnd() * 4000 : 5000 + rnd() * 30000,
        gs: ga ? 90 + rnd() * 40 : 200 + rnd() * 250, track: rnd() * 360, vr: (rnd() - 0.5) * 3000,
      }, i));
    }
  }

  if (scenario === 'pattern') {
    // left-hand rectangular pattern, 1.5 nm x 3 nm, runway along the x axis
    const pts = [[-1.5, 0], [1.5, 0], [1.5, 1.5], [-1.5, 1.5]];
    const legs = pts.map((p, i) => [p, pts[(i + 1) % 4]]);
    const perim = legs.reduce((a, [p, q]) => a + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
    ['N734P', 'N912C', 'N441X', 'N208T'].forEach((flight, i) => {
      let d = (((t * 95) / 3600 + (i * perim) / 4) % perim);
      for (const [p, q] of legs) {
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d <= len) {
          const f = d / len;
          const track = (Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI;
          list.push(raw({ flight, t: i % 2 ? 'C172' : 'P28A', category: 'A1', gs: 95, track: (track + 360) % 360, vr: 0 },
            p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, fieldElevFt + 1000));
          break;
        }
        d -= len;
      }
    });
    list.push(...MIXED.slice(0, 2).map(fly));
  }

  if (scenario === 'alert') {
    // absolute positions inside 5 nm, short 2-minute loops so they stay close
    const near = { period: 120, scaled: false };
    list = [
      fly({ flight: 'SWA2210', t: 'B738', category: 'A3', x: -3, y: 0.2, alt: fieldElevFt + 1500, gs: 150, track: 85, vr: 0 }, 0, near),
      fly({ flight: 'N734P', t: 'P28A', category: 'A1', x: 1.5, y: 2, alt: fieldElevFt + 1000, gs: 95, track: 200, vr: 0 }, 1, near),
      fly({ flight: 'N912C', t: 'C172', category: 'A1', x: -2, y: -3, alt: fieldElevFt + 2000, gs: 90, track: 20, vr: 0 }, 2, near),
      fly({ flight: 'AAL88', t: 'A321', category: 'A3', x: 12, y: 6, alt: 12000, gs: 280, track: 250, vr: -1200 }, 3),
    ];
  }

  if (scenario === 'edge') {
    const s = R / 20;
    list = [0, 45, 90, 135, 180, 225, 270, 315].map((b, i) => {
      const r = (i % 2 ? 19.5 : 21) * s; // odd ones just inside, even ones just outside
      const br = (b * Math.PI) / 180;
      return raw({ flight: `EDGE${b}`, t: 'B738', category: 'A3', gs: 0, track: 0, vr: 0 }, Math.sin(br) * r, Math.cos(br) * r, 10000);
    });
  }

  return normalize(list, { lat, lon, radiusNm: R * 1.2, fieldElevFt });
}

function seeded(seed) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
