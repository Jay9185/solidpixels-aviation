// Procedural side-profile airliner sprites for a 64x32 matrix.
// Each type is a small set of geometry numbers; each livery is colors + a fin painter.
// Liveries are colour-block approximations only — no logos or wordmarks.

import { mix, scale } from './gfx.js';

// ---------------------------------------------------------------------------
// Airframe geometry (pixels). Nose points right.
//   L      overall length          h     fuselage barrel height
//   tail   tail-cone length        finH/finW  vertical stabiliser size
//   nose   per-column drop of the top/bottom outline, counted back from the tip
//   wing   [start, end] of the wing root as a fraction of L
//   eng    front of nacelle (fraction of L), width, height, quad = 4 engines
// ---------------------------------------------------------------------------
export const TYPES = {
  A320: {
    label: 'A320', L: 40, h: 4, tail: 7, finH: 7, finW: 8,
    nose: { top: [2, 1, 1, 0], bot: [1, 0] },
    wing: [0.44, 0.66], eng: { x: 0.70, w: 5, h: 3 },
  },
  B737: {
    label: 'B737', L: 40, h: 4, tail: 7, finH: 7, finW: 9,
    nose: { top: [2, 2, 1, 1, 0], bot: [1, 1] },
    wing: [0.44, 0.66], eng: { x: 0.72, w: 5, h: 2, flat: true },
  },
  B787: {
    label: 'B787', L: 50, h: 5, tail: 8, finH: 8, finW: 10,
    nose: { top: [3, 2, 2, 1, 1, 1, 0], bot: [1, 1] },
    wing: [0.43, 0.65], eng: { x: 0.71, w: 7, h: 3, chevron: true },
  },
  B777: {
    label: 'B777', L: 56, h: 5, tail: 9, finH: 9, finW: 11,
    nose: { top: [3, 2, 1, 1, 0], bot: [1, 1] },
    wing: [0.43, 0.65], eng: { x: 0.71, w: 8, h: 4, big: true }, blade: true,
  },
  A350: {
    label: 'A350', L: 52, h: 5, tail: 8, finH: 9, finW: 11,
    nose: { top: [3, 2, 1, 1, 0], bot: [1, 0] },
    wing: [0.43, 0.65], eng: { x: 0.71, w: 7, h: 3 }, mask: true,
  },
  B747: {
    label: 'B747', L: 56, h: 5, tail: 9, finH: 9, finW: 11,
    nose: { top: [4, 3, 2, 2, 1, 1, 1, 0], bot: [1, 1] },
    wing: [0.42, 0.64], eng: { x: 0.70, w: 6, h: 3, quad: true }, hump: { from: 0.64, h: 2 },
  },
  A380: {
    label: 'A380', L: 54, h: 7, tail: 9, finH: 9, finW: 12,
    nose: { top: [3, 2, 1, 1, 0], bot: [2, 1] },
    wing: [0.40, 0.64], eng: { x: 0.69, w: 6, h: 3, quad: true }, decks: 2,
  },
};

// ICAO type designator -> sprite family
const FAMILY = {
  A318: 'A320', A319: 'A320', A320: 'A320', A321: 'A320', A19N: 'A320', A20N: 'A320', A21N: 'A320',
  B731: 'B737', B732: 'B737', B733: 'B737', B734: 'B737', B735: 'B737', B736: 'B737', B737: 'B737',
  B738: 'B737', B739: 'B737', B37M: 'B737', B38M: 'B737', B39M: 'B737', B3XM: 'B737',
  B741: 'B747', B742: 'B747', B743: 'B747', B744: 'B747', B748: 'B747', B74S: 'B747',
  A388: 'A380',
  B788: 'B787', B789: 'B787', B78X: 'B787',
  B772: 'B777', B773: 'B777', B77L: 'B777', B77W: 'B777', B778: 'B777', B779: 'B777',
  A359: 'A350', A35K: 'A350',
};

export const familyFor = (icaoType) => FAMILY[icaoType] || null;

// ---------------------------------------------------------------------------
// Liveries. body/belly are fuselage colours; belly is the fraction of barrel
// height painted from the bottom; stripe paints the row on the belly line.
// fin(u, v): u = 0 trailing edge .. 1 leading edge, v = 0 root .. 1 tip.
// ---------------------------------------------------------------------------
const WHITE = [244, 246, 250];

export const LIVERIES = {
  AIC: { // Air India — white, red/aubergine fin with gold frame
    name: 'AIR INDIA', body: [246, 243, 238], belly: 0, engine: [96, 22, 64],
    fin: (u, v) => (u > 0.86 || (v > 0.9 && u > 0.3) ? [236, 176, 60] : u < 0.32 ? [92, 22, 70] : [214, 28, 46]),
    title: [214, 28, 46],
  },
  UAE: { // Emirates — white, UAE flag bands on the fin
    name: 'EMIRATES', body: WHITE, belly: 0, engine: [226, 228, 232],
    fin: (u, v) => (u < 0.3 ? [210, 30, 40] : v > 0.66 ? [20, 140, 70] : v > 0.33 ? WHITE : [25, 25, 28]),
    title: [196, 160, 80],
  },
  DAL: { // Delta — white over navy belly, navy/red fin
    name: 'DELTA', body: WHITE, belly: 0.4, bellyColor: [14, 34, 84], engine: [14, 34, 84],
    fin: (u, v) => (v > 0.45 && u > 0.35 && u + v > 1.05 ? [205, 22, 48] : [14, 34, 84]),
  },
  UAL: { // United — white over blue belly, navy fin with a light-blue sweep
    name: 'UNITED', body: WHITE, belly: 0.35, bellyColor: [24, 70, 160], engine: [14, 30, 88],
    fin: (u, v) => (Math.abs(v - (0.3 + u * 0.35)) < 0.09 ? [100, 160, 235] : [14, 30, 88]),
  },
  AAL: { // American — polished silver, flag-stripe fin
    name: 'AMERICAN', body: [192, 200, 210], belly: 0.3, bellyColor: [160, 168, 180], engine: [178, 186, 196],
    window: [60, 70, 90],
    fin: (u, v) => (v > 0.55 && u > 0.35 ? [30, 90, 205] : Math.floor(v * 7) % 2 ? WHITE : [215, 30, 45]),
  },
  SWA: { // Southwest — canyon blue body, red/yellow belly
    name: 'SOUTHWEST', body: [40, 80, 182], belly: 0.3, bellyColor: [222, 30, 42], engine: [40, 80, 182],
    stripe: [255, 196, 30], window: [150, 180, 230],
    fin: (u, v) => (v < 0.18 && u > 0.2 ? [255, 196, 30] : [40, 80, 182]),
  },
  QTR: { // Qatar — light grey, burgundy fin and engines
    name: 'QATAR', body: [226, 226, 230], belly: 0, engine: [104, 22, 56],
    fin: () => [104, 22, 56], title: [104, 22, 56],
  },
  SIA: { // Singapore — white, navy fin with a gold bar
    name: 'SINGAPORE', body: WHITE, belly: 0, engine: [24, 44, 108],
    fin: (u, v) => (v > 0.38 && v < 0.56 && u > 0.3 && u < 0.8 ? [244, 184, 40] : [24, 44, 108]),
  },
  DLH: { // Lufthansa — white, deep blue fin and engines
    name: 'LUFTHANSA', body: WHITE, belly: 0, engine: [12, 26, 66],
    fin: () => [12, 26, 66],
  },
  BAW: { // British Airways — white over midnight belly, red line, flag-wave fin
    name: 'BRITISH', body: WHITE, belly: 0.35, bellyColor: [22, 32, 76], stripe: [206, 22, 44], engine: [22, 32, 76],
    fin: (u, v) => {
      const b = Math.floor((u * 1.4 + v * 1.1) * 3) % 3;
      return b === 0 ? [206, 22, 44] : b === 1 ? WHITE : [22, 44, 130];
    },
  },
  QFA: { // Qantas — white over silver belly, red fin
    name: 'QANTAS', body: WHITE, belly: 0.3, bellyColor: [190, 196, 204], engine: [200, 206, 214],
    fin: (u) => (u < 0.18 ? [160, 10, 20] : [222, 20, 32]),
  },
  GA: { // generic GA trainer — white, blue/gold cheatline
    name: 'GA', body: WHITE, belly: 0, stripe: [24, 110, 235], stripe2: [245, 182, 22],
    fin: (u, v) => (v > 0.75 ? [245, 182, 22] : WHITE),
  },
};

// Unknown operators get a clean house scheme with a fin colour from their code.
export function liveryFor(code) {
  if (LIVERIES[code]) return LIVERIES[code];
  let h = 0;
  for (const ch of String(code || 'XXX')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = [[30, 90, 190], [200, 40, 50], [20, 130, 90], [120, 60, 160], [230, 140, 20], [20, 140, 170]];
  const c = hues[h % hues.length];
  return { name: code || 'UNKNOWN', body: WHITE, belly: 0.3, bellyColor: [190, 196, 206], engine: [200, 205, 212], fin: () => c };
}

// Which liveries each type is shown in when no live aircraft is nearby.
export const GALLERY = [
  ['A320', 'AIC'], ['A320', 'DLH'], ['A320', 'DAL'],
  ['B737', 'SWA'], ['B737', 'UAL'], ['B737', 'AAL'],
  ['B747', 'DLH'], ['B747', 'BAW'],
  ['A380', 'UAE'], ['A380', 'SIA'], ['A380', 'QFA'],
  ['B787', 'AIC'], ['B787', 'UAL'], ['B787', 'QTR'],
  ['B777', 'UAE'], ['B777', 'AIC'], ['B777', 'AAL'],
  ['A350', 'QTR'], ['A350', 'SIA'], ['A350', 'DAL'],
];

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Vertical layout: the fuselage barrel top so the whole sprite is centred on midY. */
export function layout(t, midY = 17) {
  const below = t.eng.h + 1;
  const total = t.finH + t.h + below + (t.hump ? t.hump.h : 0);
  const top = Math.round(midY - total / 2) + t.finH + (t.hump ? t.hump.h : 0);
  return { x: Math.round((64 - t.L) / 2), top };
}

/**
 * Draw an airliner.
 * @param g      Gfx
 * @param t      TYPES entry
 * @param lv     livery
 * @param ox,top left edge (tail) and barrel top row
 * @param f      frame index for lights
 * @param o      { night }
 */
export function drawAirliner(g, t, lv, ox, top, f, o = {}) {
  const { L, h } = t;
  const bot = top + h - 1;
  const bellyRows = Math.round((lv.belly || 0) * h);
  const body = lv.body;
  const bellyC = lv.bellyColor || body;
  const windowC = lv.window || [34, 44, 66];
  const humpFrom = t.hump ? Math.round(t.hump.from * L) : Infinity;

  const colTop = (i) => {
    const j = L - 1 - i;
    let y = top;
    if (i >= humpFrom) y -= Math.min(t.hump.h, i - humpFrom + 1);
    if (j < t.nose.top.length) y += t.nose.top[j];
    return y;
  };
  const colBot = (i) => {
    const j = L - 1 - i;
    let y = bot;
    if (i < t.tail) y -= Math.round(((t.tail - i) / t.tail) * (h - 2));
    if (j < t.nose.bot.length) y -= t.nose.bot[j];
    return y;
  };

  // horizontal stabiliser (behind the fin, drawn first)
  g.hline(ox - 1, ox + 4, top + 1, mix(body, [60, 66, 78], 0.45));

  // vertical fin
  for (let r = 0; r < t.finH; r++) {
    const v = r / (t.finH - 1);
    const te = Math.round(2 - 2 * v);
    const le = Math.round(t.finW + 1 - (t.finW - 2) * v);
    for (let x = te; x <= le; x++) {
      const u = le === te ? 1 : (x - te) / (le - te);
      const fc = lv.fin(u, v);
      // tail floodlights at night
      g.set(ox + x, top - 1 - r, o.night ? mix(fc, [255, 255, 255], 0.14) : fc);
    }
  }
  if (t.blade) g.set(ox, top + 1, mix(body, [0, 0, 0], 0.3)); // 777 blade tail cone

  // fuselage
  for (let i = 0; i < L; i++) {
    const y0 = colTop(i);
    const y1 = colBot(i);
    for (let y = y0; y <= y1; y++) {
      const rb = bot - y; // 0 = bottom row of the barrel
      let c = rb < bellyRows ? bellyC : body;
      if (lv.stripe && bellyRows > 0 && rb === bellyRows) c = lv.stripe;
      if (lv.stripe && !bellyRows && rb === 1) c = lv.stripe;
      if (lv.stripe2 && rb === 0) c = lv.stripe2;
      g.set(ox + i, y, c);
    }
    // subtle top highlight / belly shade for roundness
    g.set(ox + i, y0, [255, 255, 255], 0.18);
    g.set(ox + i, y1, [0, 0, 0], 0.18);
  }

  // titles: a short dash above the window line (no lettering)
  if (lv.title) {
    const x0 = Math.round(L * 0.48);
    g.hline(ox + x0, ox + x0 + Math.round(L * 0.16), top, lv.title, 0.85);
  }

  // passenger windows
  const wEnd = L - t.nose.top.length - 3;
  const rows = t.decks === 2 ? [top + 1, top + 4] : [top + 1];
  for (const wy of rows) {
    for (let i = t.tail + 2; i <= wEnd; i += 2) g.set(ox + i, wy, windowC);
  }
  if (t.hump) {
    for (let i = humpFrom + 2; i <= wEnd; i += 2) g.set(ox + i, top - 1, windowC);
  }

  // cockpit glazing
  const glaze = t.mask ? [8, 8, 10] : [24, 34, 52];
  for (const j of [2, 3]) {
    const i = L - 1 - j;
    g.set(ox + i, colTop(i) + 1, glaze);
  }
  if (t.mask) {
    for (const j of [1, 4]) g.set(ox + L - 1 - j, colTop(L - 1 - j) + 1, glaze);
    g.set(ox + L - 4, colTop(L - 4) + 2, glaze);
  }

  // wing root and engines
  const w0 = Math.round(t.wing[0] * L);
  const w1 = Math.round(t.wing[1] * L);
  const wingC = [150, 156, 168];
  g.hline(ox + w0, ox + w1, bot + 1, wingC);
  g.hline(ox + w0 + 1, ox + w1 - 2, bot + 2, scale(wingC, 0.7)); // swept wing underside
  g.hline(ox + w0 + 2, ox + w1 - 5, bot + 3, scale(wingC, 0.5), 0.8);

  const engC = lv.engine || [210, 214, 220];
  const xf = Math.round(t.eng.x * L);
  if (t.eng.quad) drawEngine(g, t.eng, ox + xf - 8, bot + 2, scale(engC, 0.72));
  drawEngine(g, t.eng, ox + xf, bot + 2, engC);

  // lights: red beacons, white strobes
  const bx = ox + Math.round(L * 0.46);
  if (f % 16 < 2) g.set(bx, colTop(bx - ox) - 1, [255, 30, 30]);
  if (f % 16 >= 8 && f % 16 < 10) g.set(ox + Math.round(L * 0.36), bot + 1, [255, 30, 30]);
  if (f % 32 === 0 || f % 32 === 3) {
    g.set(ox, top - t.finH, [255, 255, 255]);
    g.set(ox + w0, bot + 1, [255, 255, 255]);
  }
  if (o.night) {
    // fin floodlight glow and nav light at the nose
    g.set(ox + 3, top - Math.round(t.finH / 2), [255, 255, 255], 0.25);
  }
}

function drawEngine(g, e, xf, y, c) {
  const x0 = xf - e.w + 1;
  for (let x = x0; x <= xf; x++) {
    for (let r = 0; r < e.h; r++) {
      // rounded nacelle: trim the corners of tall engines
      if (e.h >= 4 && (x === x0 || x === xf) && (r === 0 || r === e.h - 1)) continue;
      if (e.flat && r === e.h - 1 && x === xf) continue;
      g.set(x, y + r, c);
    }
  }
  const lip = mix(c, [255, 255, 255], 0.55);
  for (let r = 0; r < e.h; r++) {
    if (e.h >= 4 && (r === 0 || r === e.h - 1)) continue;
    g.set(xf, y + r, lip);
  }
  // exhaust; serrated on the 787
  const ex = [52, 54, 62];
  for (let r = 0; r < e.h; r++) {
    if (e.chevron && r % 2) continue;
    if (e.h >= 4 && (r === 0 || r === e.h - 1)) continue;
    g.set(x0, y + r, ex);
  }
  g.set(x0 + 1, y + e.h - 1, [0, 0, 0], 0.25);
}

/** Low-wing GA trainer (PA-28 style) with spinning prop. */
export function drawGA(g, lv, ox, top, f) {
  const L = 28;
  const c = lv.body;
  // fin + stab
  for (let r = 0; r < 5; r++) {
    const v = r / 4;
    for (let x = Math.round(1 - v); x <= 4 - Math.round(v * 2); x++) g.set(ox + x, top - 1 - r, lv.fin(0.5, v));
  }
  g.hline(ox - 1, ox + 3, top + 1, [150, 156, 168]);
  // fuselage 3px tall, tapering aft
  for (let i = 0; i < L; i++) {
    const t = i < 8 ? Math.round((8 - i) / 8) : 0;
    for (let y = top + (i > L - 3 ? 1 : 0); y <= top + 2 - t; y++) g.set(ox + i, y, c);
  }
  g.hline(ox + 2, ox + L - 3, top + 1, lv.stripe);
  g.hline(ox + 4, ox + L - 4, top + 2, lv.stripe2);
  // cabin greenhouse
  for (let i = 12; i <= 20; i++) g.set(ox + i, top - 1, c);
  for (let i = 13; i <= 19; i++) g.set(ox + i, top - 2, i < 15 ? c : c);
  for (const i of [14, 15, 17, 18]) g.set(ox + i, top - 1, [30, 120, 210]);
  // low wing (no gear drawn)
  g.hline(ox + 10, ox + 19, top + 3, [200, 206, 216]);
  g.hline(ox + 12, ox + 19, top + 4, [140, 148, 162], 0.7);
  // spinner + prop
  g.set(ox + L, top + 1, [230, 50, 50]);
  const ph = f % 3;
  g.line(ox + L + 1, top - 2 + ph, ox + L + 1, top + 4 - ph, [190, 225, 255], 0.75);
  if (f % 16 < 2) g.set(ox + 16, top - 3, [255, 30, 30]);
}
