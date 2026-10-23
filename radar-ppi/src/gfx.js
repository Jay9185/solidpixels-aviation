// 64x32 RGB framebuffer + integer drawing primitives + 3x5 bitmap font.
// Pure JS, no Node APIs: runs unchanged in Node and Cloudflare Workers.

export const W = 64;
export const H = 32;

export const hex = (s) => {
  const n = parseInt(s.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

export const scale = (c, k) => [
  Math.min(255, Math.round(c[0] * k)),
  Math.min(255, Math.round(c[1] * k)),
  Math.min(255, Math.round(c[2] * k)),
];

export class Gfx {
  constructor() {
    this.px = new Uint8Array(W * H * 3);
  }

  clear(c = [0, 0, 0]) {
    for (let i = 0; i < W * H; i++) {
      this.px[i * 3] = c[0];
      this.px[i * 3 + 1] = c[1];
      this.px[i * 3 + 2] = c[2];
    }
  }

  get(x, y) {
    const i = (y * W + x) * 3;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }

  set(x, y, c, a = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= H || !c) return;
    const i = (y * W + x) * 3;
    if (a >= 0.999) {
      this.px[i] = c[0];
      this.px[i + 1] = c[1];
      this.px[i + 2] = c[2];
    } else if (a > 0) {
      this.px[i] = Math.round(this.px[i] * (1 - a) + c[0] * a);
      this.px[i + 1] = Math.round(this.px[i + 1] * (1 - a) + c[1] * a);
      this.px[i + 2] = Math.round(this.px[i + 2] * (1 - a) + c[2] * a);
    }
  }

  // Bresenham, 1px, no anti-aliasing
  line(x0, y0, x1, y1, c, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  hline(x0, x1, y, c, a = 1) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c, a);
  }

  rect(x, y, w, h, c, a = 1) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }

  // Midpoint circle outline. step>1 gives a dotted ring.
  circle(cx, cy, r, c, a = 1, step = 1) {
    let x = r, y = 0, err = 1 - r, n = 0;
    while (x >= y) {
      if (n++ % step === 0) {
        for (const [px, py] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) {
          this.set(cx + px, cy + py, c, a);
        }
      }
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x + 1); }
    }
  }

  // 3x5 glyphs on a 4px advance. Returns the x after the last glyph.
  text(str, x, y, c, a = 1) {
    let cx = Math.round(x);
    for (const ch of String(str).toUpperCase()) {
      const g = FONT[ch] || FONT[' '];
      for (let r = 0; r < 5; r++) {
        for (let k = 0; k < 3; k++) if (g[r][k] === '1') this.set(cx + k, y + r, c, a);
      }
      cx += 4;
    }
    return cx;
  }

  copyFrom(other) {
    this.px.set(other.px);
  }

  snapshot() {
    return new Uint8Array(this.px);
  }
}

export const textWidth = (s) => Math.max(0, String(s).length * 4 - 1);

export const FONT = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  'A': ['010', '101', '111', '101', '101'],
  'B': ['110', '101', '110', '101', '110'],
  'C': ['011', '100', '100', '100', '011'],
  'D': ['110', '101', '101', '101', '110'],
  'E': ['111', '100', '110', '100', '111'],
  'F': ['111', '100', '110', '100', '100'],
  'G': ['011', '100', '101', '101', '011'],
  'H': ['101', '101', '111', '101', '101'],
  'I': ['111', '010', '010', '010', '111'],
  'J': ['001', '001', '001', '101', '010'],
  'K': ['101', '101', '110', '101', '101'],
  'L': ['100', '100', '100', '100', '111'],
  'M': ['101', '111', '111', '101', '101'],
  'N': ['110', '101', '101', '101', '101'],
  'O': ['010', '101', '101', '101', '010'],
  'P': ['110', '101', '110', '100', '100'],
  'Q': ['111', '101', '101', '111', '001'],
  'R': ['110', '101', '110', '101', '101'],
  'S': ['011', '100', '010', '001', '110'],
  'T': ['111', '010', '010', '010', '010'],
  'U': ['101', '101', '101', '101', '111'],
  'V': ['101', '101', '101', '101', '010'],
  'W': ['101', '101', '111', '111', '101'],
  'X': ['101', '101', '010', '101', '101'],
  'Y': ['101', '101', '010', '010', '010'],
  'Z': ['111', '001', '010', '100', '111'],
  '-': ['000', '000', '111', '000', '000'],
  ':': ['000', '010', '000', '010', '000'],
  '.': ['000', '000', '000', '000', '010'],
  '/': ['001', '001', '010', '100', '100'],
  '+': ['000', '010', '111', '010', '000'],
  '^': ['000', '010', '111', '000', '000'], // climb triangle
  '_': ['000', '111', '010', '000', '000'], // descent triangle
  '=': ['000', '111', '000', '111', '000'],
  '#': ['101', '111', '101', '111', '101'],
  ' ': ['000', '000', '000', '000', '000'],
};
