// Parallax Sonoran-desert background. Every layer's scroll period divides
// the 64-frame loop, so the GIF repeats without a seam.

import { mix } from './gfx.js';

export const LOOP = 64;

const PALETTES = {
  day: {
    skyTop: [38, 104, 196], skyLow: [150, 200, 236], ridge: [146, 118, 140], ridgeTop: [168, 140, 160],
    ground: [196, 146, 88], groundTop: [222, 176, 112], cactus: [46, 112, 64], cloud: [250, 252, 255],
  },
  dawn: {
    skyTop: [56, 74, 146], skyLow: [252, 168, 96], ridge: [120, 76, 104], ridgeTop: [150, 96, 120],
    ground: [150, 96, 70], groundTop: [180, 120, 86], cactus: [36, 70, 50], cloud: [255, 196, 170],
  },
  dusk: {
    skyTop: [34, 26, 84], skyLow: [250, 112, 48], ridge: [76, 40, 72], ridgeTop: [104, 54, 88],
    ground: [96, 54, 46], groundTop: [128, 72, 56], cactus: [26, 34, 32], cloud: [255, 150, 120],
  },
  night: {
    skyTop: [2, 4, 14], skyLow: [16, 22, 52], ridge: [20, 18, 36], ridgeTop: [30, 28, 52],
    ground: [10, 10, 16], groundTop: [16, 16, 24], cactus: [6, 8, 10], cloud: null,
  },
};

export function timeOfDay(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(now);
  const hh = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const mm = Number(parts.find((p) => p.type === 'minute').value);
  const t = hh + mm / 60;
  if (t >= 5.5 && t < 7.5) return 'dawn';
  if (t >= 7.5 && t < 17.25) return 'day';
  if (t >= 17.25 && t < 19) return 'dusk';
  return 'night';
}

// periodic ridge line (period 64) built from integer harmonics
const RIDGE = Array.from({ length: 64 }, (_, x) => {
  const a = (x / 64) * Math.PI * 2;
  return Math.round(23 - 1.6 * Math.sin(a) - 1.2 * Math.sin(2 * a + 1.3) - 0.9 * Math.sin(5 * a + 0.4) - 0.5 * Math.sin(9 * a));
});

// saguaros on a 32 px repeat: [x, height, armLeft, armRight]
const CACTI = [[5, 5, 2, 0], [19, 4, 0, 2], [27, 3, 0, 0]];

// clouds on a 32 px repeat: [x, y, w]
const CLOUDS = [[2, 9, 7], [18, 12, 5]];

const STARS = [[3, 2], [11, 9], [17, 4], [24, 12], [29, 7], [36, 3], [41, 10], [47, 6], [53, 13], [58, 3], [62, 9], [8, 15], [33, 16], [50, 17]];

export function drawScene(g, tod, f) {
  const p = PALETTES[tod];

  // sky gradient, one colour per row
  for (let y = 0; y < 28; y++) {
    const c = mix(p.skyTop, p.skyLow, Math.pow(y / 27, 1.3));
    g.hline(0, 63, y, c);
  }

  if (tod === 'night') {
    STARS.forEach(([x, y], i) => {
      const tw = (f + i * 5) % 16 < 2 ? 0.35 : 0.85;
      g.set(x, y, [230, 235, 255], tw);
    });
    // moon
    g.rect(55, 8, 3, 3, [236, 232, 210]);
    g.set(55, 8, p.skyTop); g.set(57, 10, [200, 196, 176]);
  }
  if (tod === 'day') {
    g.rect(56, 8, 3, 3, [255, 246, 196]);
    for (const [dx, dy] of [[-1, 1], [3, 1], [1, -1], [1, 3]]) g.set(56 + dx, 8 + dy, [255, 246, 196], 0.45);
  }
  if (tod === 'dusk' || tod === 'dawn') {
    // low sun sitting on the ridge
    for (let dy = -2; dy <= 0; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy * 3 <= 10) g.set(48 + dx, 21 + dy, [255, 214, 120]);
      }
    }
  }

  // clouds: 1 px every 2 frames, period 32
  if (p.cloud) {
    const off = Math.floor(f / 2) % 32;
    for (let rep = -1; rep < 3; rep++) {
      for (const [cx, cy, w] of CLOUDS) {
        const x = cx + rep * 32 - off;
        g.hline(x, x + w - 1, cy, p.cloud, 0.55);
        g.hline(x + 1, x + w - 3, cy - 1, p.cloud, 0.45);
      }
    }
  }

  // far ridge: 1 px per frame, period 64
  for (let x = 0; x < 64; x++) {
    const top = RIDGE[(x + f) % 64];
    g.set(x, top, p.ridgeTop);
    for (let y = top + 1; y < 28; y++) g.set(x, y, p.ridge);
  }

  // ground: 2 px per frame, period 32
  g.hline(0, 63, 28, p.groundTop);
  for (let y = 29; y < 32; y++) g.hline(0, 63, y, p.ground);
  const goff = (f * 2) % 32;

  if (tod === 'night') {
    // city grid lights twinkling on the valley floor
    for (let x = 0; x < 64; x++) {
      const wx = (x + goff) % 32;
      for (let y = 29; y < 32; y++) {
        const seed = (wx * 7 + y * 13) % 11;
        if (seed === 0) g.set(x, y, [255, 200, 110], (wx + f) % 8 ? 0.85 : 0.4);
        else if (seed === 5 && y === 30) g.set(x, y, [210, 225, 255], 0.6);
      }
    }
  } else {
    for (let x = 0; x < 64; x++) {
      if (((x + goff) * 5) % 7 === 0) g.set(x, 30, mix(p.ground, [0, 0, 0], 0.2));
    }
  }

  for (let rep = -1; rep < 3; rep++) {
    for (const [cx, hgt, al, ar] of CACTI) {
      const x = cx + rep * 32 - goff;
      for (let y = 0; y < hgt; y++) g.set(x, 28 - y, p.cactus);
      if (al) { g.set(x - 1, 28 - al, p.cactus); g.set(x - 1, 27 - al, p.cactus); }
      if (ar) { g.set(x + 1, 28 - ar, p.cactus); g.set(x + 1, 27 - ar, p.cactus); }
    }
  }
}
