// Livery spotter: nearest airliner drawn as a pixel sprite in its airline's
// colours over a looping desert scene. Pure function, no I/O.

import { Gfx } from './gfx.js';
import { TYPES, LIVERIES, GALLERY, familyFor, liveryFor, layout, drawAirliner, drawGA } from './sprites.js';
import { drawScene, timeOfDay, LOOP } from './scene.js';

const C = {
  call: [255, 255, 255],
  type: [255, 176, 0],
  up: [40, 230, 110],
  down: [255, 140, 30],
  level: [0, 200, 255],
  dim: [170, 180, 195],
};

/**
 * Choose what to show: the nearest aircraft we can draw, else a gallery slot.
 * @returns {{family, livery, code, callsign, type, alt, trend, gear, live, key}}
 */
export function pickSubject(aircraft, { spotNm = 8, galleryIndex = 0, includeGA = true } = {}) {
  for (const a of aircraft) {
    if (a.dist > spotNm) break;
    const family = familyFor(a.type);
    const code = /^[A-Z]{3}\d/.test(a.callsign) ? a.callsign.slice(0, 3) : null;
    if (family) {
      return {
        family, livery: liveryFor(code), code: code || '', callsign: a.callsign || a.reg, type: a.type,
        alt: a.alt, trend: a.trend, gear: a.onGround || (a.agl < 3000 && a.trend <= 0), live: true, key: a.hex,
      };
    }
    if (includeGA && a.kind === 'ga') {
      return {
        family: 'GA', livery: LIVERIES.GA, code: '', callsign: a.callsign || a.reg, type: a.type || 'GA',
        alt: a.alt, trend: a.trend, gear: true, live: true, key: a.hex,
      };
    }
  }
  const [family, code] = GALLERY[galleryIndex % GALLERY.length];
  return { family, livery: LIVERIES[code], code, callsign: code, type: TYPES[family].label, live: false, key: `${family}-${code}` };
}

/**
 * @param subject  from pickSubject
 * @param opt      { timeZone, now, tod, delay }
 */
export function renderSpotter(subject, opt = {}) {
  const { timeZone = 'America/Phoenix', now = new Date(), delay = 7 } = opt;
  const tod = opt.tod || timeOfDay(now, timeZone);
  const g = new Gfx();
  const frames = [];

  for (let f = 0; f < LOOP; f++) {
    drawScene(g, tod, f);

    if (subject.family === 'GA') {
      drawGA(g, subject.livery, 17, 17, f);
    } else {
      const t = TYPES[subject.family];
      const { x, top } = layout(t, 17);
      drawAirliner(g, t, subject.livery, x, top, f, { night: tod === 'night' });
    }

    drawInfo(g, subject);
    frames.push(g.snapshot());
  }
  return { frames, delays: frames.map(() => delay), tod };
}

function drawInfo(g, s) {
  for (let y = 0; y < 7; y++) g.hline(0, 63, y, [0, 0, 0], 0.55);
  const id = String(s.callsign || '').slice(0, 7);
  g.text(id, 0, 1, C.call);
  const type = String(s.type || '').slice(0, 4);
  g.text(type, 64 - type.length * 4 + 1, 1, C.type);
  if (s.live && typeof s.alt === 'number') {
    const fl = String(Math.max(0, Math.round(s.alt / 100))).padStart(3, '0').slice(-3);
    const col = s.trend > 0 ? C.up : s.trend < 0 ? C.down : C.level;
    g.text(fl, 31, 1, col);
  }
}
