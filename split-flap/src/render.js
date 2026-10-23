// Solari-style split-flap board for a 64x32 matrix.
// 3 rows x 16 flap tiles. Each tile is a 3x7 flap holding a 3x5 glyph.
// Pure functions: data in, animated frames out.
//
//   buildFidsPages()     ARRIVALS / DEPARTURES pages from ADS-B + route lookup
//   buildOverheadPages() callsign / type / altitude for everything nearby
//   renderPages()        animates any list of pages

import { Gfx, scale } from './gfx.js';
import { classify } from './routes.js';

const C = {
  bg: [3, 4, 6],
  tile: [20, 23, 30],
  hinge: [7, 8, 11],
  flapEdge: [70, 74, 86],
  label: [255, 176, 0],
  dim: [80, 92, 104],
  clock: [210, 220, 230],
  call: [255, 205, 50],
  city: [235, 238, 245],
  type: [225, 230, 240],
  up: [40, 230, 110],
  down: [255, 140, 30],
  level: [0, 200, 255],
  eta: [0, 200, 255],
  soon: [255, 176, 0],
  arr: [40, 230, 110],
  dep: [0, 200, 255],
  ovr: [200, 100, 255],
};

const COLS = 16;
const ROWS = 3;
const ROW_Y = [8, 16, 24];
const SPIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

/**
 * ARRIVALS:   SWA1844 DEN  6M     origin, estimated minutes out (distance / groundspeed)
 * DEPARTURES: AAL2291 DFW 084     destination, altitude in hundreds of ft (colour = trend)
 * Flights with no known route, or overflights, go to a NEARBY page as a fallback.
 *
 * @param {Array} aircraft        normalized ADS-B list, nearest first
 * @param {Map}   routes          callsign -> {iata, icao} from routes.js
 * @param {object} opt
 * @param {string[]} opt.home     codes that mean "this airport", e.g. ['PHX', 'KPHX']
 * @param {boolean} [opt.nearby]  'auto' (only when the board would otherwise be thin) | true | false
 */
export function buildFidsPages(aircraft, routes, { home, nearby = 'auto', maxPages = 4 } = {}) {
  const arr = [];
  const dep = [];
  const other = [];

  for (const a of aircraft) {
    const route = routes.get(a.callsign);
    if (!route) { other.push(a); continue; }
    const c = classify(a, route, home);
    if (c.kind === 'arr' && !a.onGround) arr.push({ a, c, eta: etaMin(a) });
    else if (c.kind === 'dep') dep.push({ a, c });
    else other.push(a);
  }

  arr.sort((x, y) => x.eta - y.eta);
  dep.sort((x, y) => (x.a.onGround - y.a.onGround) || x.a.dist - y.a.dist);

  const groups = [];
  if (arr.length) groups.push({ title: 'ARR', color: C.arr, rows: arr.map(arrRow) });
  if (dep.length) groups.push({ title: 'DEP', color: C.dep, rows: dep.map(depRow) });
  const thin = arr.length + dep.length < ROWS;
  if ((nearby === true || (nearby === 'auto' && thin)) && other.length) {
    groups.push({ title: 'NEAR', color: C.ovr, rows: other.map(overheadRow) });
  }
  return paginate(groups, maxPages);
}

export function buildOverheadPages(aircraft, { maxPages = 3 } = {}) {
  const rows = aircraft.filter((a) => a.callsign || a.reg).map(overheadRow);
  return paginate([{ title: '', color: C.label, rows }], maxPages);
}

function paginate(groups, maxPages) {
  const pages = [];
  for (const g of groups) {
    const n = Math.ceil(g.rows.length / ROWS);
    for (let i = 0; i < n; i++) {
      pages.push({ title: g.title, color: g.color, rows: g.rows.slice(i * ROWS, i * ROWS + ROWS), part: i + 1, parts: n });
    }
  }
  // keep at least the first page of every group when trimming
  while (pages.length > maxPages) {
    let j = pages.length - 1;
    while (j > 0 && pages[j].part === 1) j--;
    if (j === 0) { pages.length = maxPages; break; }
    pages.splice(j, 1);
  }
  return pages;
}

function etaMin(a) {
  if (a.gs < 40) return 99;
  return Math.max(0, Math.min(99, Math.round((a.dist / a.gs) * 60)));
}

function arrRow({ a, c, eta }) {
  const id = (a.callsign || a.reg).slice(0, 7).padEnd(7);
  const city = row3(c.other);
  const status = eta <= 1 ? 'LAND' : `${eta}M`.padStart(4);
  return cells([[id, C.call], [' ', C.dim], [city, C.city], [' ', C.dim], [status, eta <= 5 ? C.soon : C.eta]]);
}

function depRow({ a, c }) {
  const id = (a.callsign || a.reg).slice(0, 7).padEnd(7);
  const city = row3(c.other);
  let status;
  let col;
  if (a.onGround) { status = 'TAXI'; col = C.dim; } else {
    status = ' ' + String(Math.max(0, Math.round(a.alt / 100))).padStart(3, '0').slice(-3);
    col = a.trend > 0 ? C.up : a.trend < 0 ? C.down : C.level;
  }
  return cells([[id, C.call], [' ', C.dim], [city, C.city], [' ', C.dim], [status, col]]);
}

function overheadRow(a) {
  const id = (a.callsign || a.reg).slice(0, 7).padEnd(7);
  const type = (a.type || '----').slice(0, 4).padEnd(4);
  const fl = a.onGround ? 'GND' : String(Math.max(0, Math.round(a.alt / 100))).padStart(3, '0').slice(-3);
  const col = a.onGround ? C.dim : a.trend > 0 ? C.up : a.trend < 0 ? C.down : C.level;
  return cells([[id, C.call], [' ', C.dim], [type, C.type], [' ', C.dim], [fl, col]]);
}

const row3 = (s) => String(s || '---').slice(0, 3).padEnd(3);

function cells(parts) {
  const chars = [];
  for (const [text, color] of parts) for (const ch of text) chars.push({ ch, color });
  while (chars.length < COLS) chars.push({ ch: ' ', color: C.dim });
  return { chars: chars.slice(0, COLS) };
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/**
 * @param {Array} pages            from a builder above
 * @param {object} opt
 * @param {string} opt.label       3-4 char airport label for the header
 * @param {string} opt.timeZone    IANA zone for the header clock
 * @param {Date}   [opt.now]
 * @param {number} [opt.loopCs]    target loop length in centiseconds (~15 s)
 */
export function renderPages(pages, opt = {}) {
  const { label = 'PHX', timeZone = 'America/Phoenix', now = new Date(), loopCs = 1500 } = opt;

  pages = pages.length ? pages : [{ title: '', color: C.label, rows: [cells([['   NO TRAFFIC', C.dim]])] }];
  pages.forEach((p) => { while (p.rows.length < ROWS) p.rows.push(blankRow()); });

  const clock = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);

  const frames = [];
  const delays = [];
  const FLIP = 14;
  const FLIP_DELAY = 6;
  const hold = Math.max(300, Math.round(loopCs / pages.length) - FLIP * FLIP_DELAY);
  const g = new Gfx();

  // the last page flips into the first one, so the GIF loops seamlessly
  let prev = pages.length === 1 ? { rows: [blankRow(), blankRow(), blankRow()] } : pages[pages.length - 1];

  pages.forEach((page, pi) => {
    for (let f = 0; f <= FLIP; f++) {
      drawChrome(g, page, label, clock);
      let settled = true;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const target = page.rows[r].chars[c];
          const from = prev.rows[r].chars[c];
          const at = 2 + c * 0.55 + r * 1.2;
          const done = target.ch === from.ch || f >= at;
          if (!done) settled = false;
          if (done) {
            drawTile(g, c * 4, ROW_Y[r], target.ch, target.color, false);
          } else {
            const spin = SPIN[(lcg(r * 131 + c * 17 + f * 7 + pi * 3) >>> 8) % SPIN.length];
            drawTile(g, c * 4, ROW_Y[r], spin, scale(C.call, 0.65), true);
          }
        }
      }
      frames.push(g.snapshot());
      delays.push(f === FLIP || settled ? hold : FLIP_DELAY);
      if (settled) break;
    }
    prev = page;
  });

  return { frames, delays };
}

/** Back-compat: the original overhead board in one call. */
export function renderBoard(aircraft, opt = {}) {
  return renderPages(buildOverheadPages(aircraft, opt), opt);
}

function drawChrome(g, page, label, clock) {
  g.clear(C.bg);
  let x = 0;
  if (page.title) x = g.text(page.title, 0, 1, page.color) + 2;
  g.text(label.slice(0, 4), x, 1, page.title ? C.dim : C.label);
  if (page.parts > 1) g.text(`${page.part}/${page.parts}`, 31, 1, C.dim);
  g.text(clock, 45, 1, C.clock);
}

function drawTile(g, x, y, ch, color, flipping) {
  g.rect(x, y, 3, 7, C.tile);
  g.text(ch, x, y + 1, color);
  // hinge split across the middle of the flap; brighter edge while it is turning
  for (let k = 0; k < 3; k++) {
    const p = g.get(x + k, y + 3);
    const lit = p[0] + p[1] + p[2] > 200;
    if (flipping) g.set(x + k, y + 3, C.flapEdge, lit ? 0.5 : 1);
    else if (!lit) g.set(x + k, y + 3, C.hinge);
  }
}

const blankRow = () => cells([]);

function lcg(n) {
  let x = (n * 1103515245 + 12345) >>> 0;
  x = (x * 1103515245 + 12345) >>> 0;
  return x;
}
