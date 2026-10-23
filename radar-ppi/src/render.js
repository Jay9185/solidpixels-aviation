// Overhead PPI radar scope for a 64x32 matrix.
// Pure function: aircraft list in, animated frames out. No I/O.
//
// Layouts
//   wide     true-scale scope across the full 64 px width; the 32 px height
//            crops north/south, so traffic there is pinned to the top/bottom edge
//   compact  round scope (radius 15) centred, small numbers in the four corners

import { Gfx, scale, mix, textWidth } from './gfx.js';

const C = {
  bg: [0, 4, 7],
  ringOuter: [14, 50, 56],
  ringInner: [9, 32, 36],
  tick: [30, 90, 100],
  sweep: [30, 255, 140],
  center: [70, 140, 120],
  label: [255, 176, 0],
  dim: [70, 100, 110],
  text: [170, 195, 205],
  airline: [0, 210, 255],
  ga: [255, 176, 0],
  heli: [40, 255, 90],
  mil: [200, 100, 255],
  alert: [255, 50, 50],
  up: [40, 230, 110],
  down: [255, 140, 30],
};

const TAU = Math.PI * 2;
export const LAYOUTS = ['wide', 'compact'];

function geometry(layout) {
  return layout === 'wide'
    ? { layout: 'wide', cx: 32, cy: 16, R: 31 }
    : { layout: 'compact', cx: 32, cy: 16, R: 15 }; // full circle: 31 px tall fits the 32 px panel
}

/**
 * @param {Array} aircraft  normalized list from adsb.js (dx/dy in nm, track, gs, kind, ...)
 * @param {object} opt
 * @param {string} opt.label     3-4 char site label, e.g. "PHX"
 * @param {number} opt.rangeNm   scope radius in nm (horizontal half-width in the wide layout)
 * @param {string} [opt.layout]  'wide' | 'compact'
 * @param {number} [opt.frames]  frames per sweep revolution
 * @param {number} [opt.delay]   centiseconds per frame
 * @param {number} [opt.alertNm] range inside which low traffic is flagged red
 * @param {number} [opt.alertAglFt]
 * @returns {{frames: Uint8Array[], delays: number[], targets: Array}}
 */
export function renderRadar(aircraft, opt = {}) {
  const { label = 'PHX', rangeNm = 20, frames: N = 36, delay = 8 } = opt;
  const geo = geometry(opt.layout);
  const targets = layoutTargets(aircraft, opt);

  const base = new Gfx();
  drawScope(base, geo);

  const g = new Gfx();
  const frames = [];
  for (let f = 0; f < N; f++) {
    g.copyFrom(base);
    const theta = (f / N) * TAU;

    // sweep with a short afterglow wedge
    for (let w = 5; w >= 0; w--) {
      const t = theta - w * 0.05;
      g.line(geo.cx, geo.cy, geo.cx + Math.sin(t) * geo.R, geo.cy - Math.cos(t) * geo.R,
        C.sweep, w === 0 ? 0.5 : 0.2 - w * 0.03);
    }

    // dimmer targets first so the brightest one wins any overlap
    const lit = targets.map((tg) => {
      const age = ((((theta - tg.bearing) % TAU) + TAU) % TAU) / TAU;
      return { tg, glow: 1 - 0.55 * age };
    }).sort((a, b) => a.glow - b.glow);

    for (const { tg, glow } of lit) drawTarget(g, tg, glow, f);

    g.set(geo.cx, geo.cy, [255, 255, 255], 0.9);
    drawText(g, geo, label, rangeNm, targets);
    frames.push(g.snapshot());
  }
  return { frames, delays: frames.map(() => delay), targets };
}

/**
 * Where each aircraft lands on the 64x32 grid. Exported so tooling can show
 * exactly which pixel belongs to which aircraft.
 */
export function layoutTargets(aircraft, opt = {}) {
  const { rangeNm = 20, alertNm = 5, alertAglFt = 2500, maxTargets = 16 } = opt;
  const geo = geometry(opt.layout);
  const k = geo.R / rangeNm; // px per nm
  return aircraft
    .filter((a) => !a.onGround && a.dist <= rangeNm)
    .slice(0, maxTargets)
    .map((a) => {
      const alert = a.dist <= alertNm && a.agl <= alertAglFt;
      const color = alert ? C.alert : C[a.kind] || C.airline;
      const t = (a.track * Math.PI) / 180;
      // trail: where it was 20/40/60 s ago, back along its track
      const trail = [20, 40, 60].map((s) => {
        const back = (a.gs * s) / 3600;
        return pos(geo, a.dx - Math.sin(t) * back, a.dy - Math.cos(t) * back, k);
      });
      const bearing = (Math.atan2(a.dx, a.dy) + TAU) % TAU; // from north, clockwise
      return { a, alert, color, p: pos(geo, a.dx, a.dy, k), trail, bearing, dir: [Math.sin(t), -Math.cos(t)] };
    });
}

function pos(geo, dx, dy, k) {
  let x = dx * k;
  let y = -dy * k;
  const r = Math.hypot(x, y);
  if (r > geo.R - 0.5) {
    // pin out-of-range targets to the range ring
    x *= (geo.R - 0.5) / r;
    y *= (geo.R - 0.5) / r;
  }
  let px = Math.round(geo.cx + x);
  let py = Math.round(geo.cy + y);
  // wide layout: north/south of the visible band, pin to the edge
  if (geo.layout === 'compact') {
    // whole circle is on screen: targets are already pinned inside it
    return { x: Math.max(1, Math.min(62, px)), y: Math.max(1, Math.min(30, py)), edge: false };
  }
  const edge = py < 1 || py > 30;
  py = Math.max(1, Math.min(30, py));
  px = Math.max(1, Math.min(62, px));
  return { x: px, y: py, edge };
}

// 3x3 plus with a bright core, a 2 px heading leader and fading trail dots.
function drawTarget(g, tg, glow, f) {
  const { p, color, dir } = tg;

  tg.trail.forEach((q, i) => {
    if (!q.edge) g.set(q.x, q.y, color, (0.5 - i * 0.14) * glow);
  });

  if (p.edge) {
    // off the visible band: a 3 px dash on the edge row, pointing the way it sits
    g.hline(p.x - 1, p.x + 1, p.y < 16 ? 0 : 31, scale(color, glow));
    return;
  }

  for (const d of [2, 3]) {
    g.set(p.x + Math.round(dir[0] * d), p.y + Math.round(dir[1] * d), color, (d === 2 ? 0.75 : 0.45) * glow);
  }

  if (tg.alert && f % 6 < 3) {
    for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) g.set(p.x + dx, p.y + dy, C.alert);
  }

  const body = scale(color, glow);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.set(p.x + dx, p.y + dy, body);
  g.set(p.x, p.y, scale(mix(color, [255, 255, 255], 0.55), glow));
}

function drawScope(g, geo) {
  const { cx, cy, R } = geo;
  g.clear(C.bg);
  g.circle(cx, cy, R, C.ringOuter);
  g.circle(cx, cy, Math.round(R / 2), C.ringInner, 1, 2);
  if (geo.layout === 'wide') g.circle(cx, cy, Math.round(R / 4), C.ringInner, 1, 3);
  // cardinal ticks
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const x = cx + dx * (R - 1);
    const y = cy + dy * (R - 1);
    if (y >= 0 && y < 32) g.set(x, y, C.tick);
  }
  // tiny E-W runway at the centre
  g.hline(cx - 1, cx + 1, cy, C.center);
}

// drawn every frame on top, with a dark backing so the sweep never cuts through it
function drawText(g, geo, label, rangeNm, targets) {
  const put = (s, x, y, c) => {
    g.rect(x - 1, y - 1, textWidth(s) + 2, 7, C.bg, 0.85);
    g.text(s, x, y, c);
  };
  const lbl = label.slice(0, 4);
  const rng = String(Math.round(rangeNm));

  if (geo.layout === 'compact') {
    put(lbl, 0, 0, C.label);
    put(String(targets.length), 0, 27, C.text);
    put(rng, 64 - textWidth(rng), 27, C.dim);
    const n = targets[0];
    if (n) {
      const fl = String(Math.max(0, Math.round(n.a.alt / 100))).padStart(3, '0').slice(-3);
      const c = n.alert ? C.alert : n.a.trend > 0 ? C.up : n.a.trend < 0 ? C.down : C.text;
      put(fl, 64 - textWidth(fl), 0, c);
    }
  } else {
    put(lbl, 1, 1, C.label);
    put(rng, 63 - textWidth(rng), 26, C.dim);
  }
}
