// Minimal animated GIF89a encoder (global palette + LZW).
// Pure JS so it runs in Node and Cloudflare Workers.
//
// frames: Uint8Array RGB buffers (w*h*3)
// delays: per-frame delay in centiseconds (number or array)

export function encodeGif(frames, { width = 64, height = 32, delays = 10, loop = true } = {}) {
  const { palette, indexed } = buildPalette(frames, width * height);

  let bits = 1;
  while ((1 << bits) < palette.length) bits++;
  const tableSize = 1 << bits;
  const minCode = Math.max(2, bits);

  const out = [];
  const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
  const str = (s) => { for (const ch of s) out.push(ch.charCodeAt(0)); };

  str('GIF89a');
  u16(width); u16(height);
  out.push(0x80 | 0x70 | (bits - 1), 0, 0);
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] || [0, 0, 0];
    out.push(c[0], c[1], c[2]);
  }

  if (loop && frames.length > 1) {
    out.push(0x21, 0xff, 0x0b);
    str('NETSCAPE2.0');
    out.push(0x03, 0x01, 0x00, 0x00, 0x00);
  }

  frames.forEach((f, n) => {
    const delay = Array.isArray(delays) ? delays[n] : delays;
    out.push(0x21, 0xf9, 0x04, 0x04, delay & 255, (delay >> 8) & 255, 0x00, 0x00);
    out.push(0x2c);
    u16(0); u16(0); u16(width); u16(height);
    out.push(0x00);

    lzw(indexed[n], minCode, out);
  });

  out.push(0x3b);
  return Uint8Array.from(out);
}

// Exact colors when <=256 unique; otherwise drop low bits until it fits.
// Returns the palette plus each frame already converted to palette indices.
function buildPalette(frames, n) {
  for (let shift = 0; shift < 8; shift++) {
    const map = new Map();
    const indexed = [];
    let ok = true;
    let lastKey = -1, lastIdx = 0;
    outer: for (const f of frames) {
      const idx = new Uint8Array(n);
      for (let p = 0, i = 0; p < n; p++, i += 3) {
        const key = ((f[i] >> shift) << 16) | ((f[i + 1] >> shift) << 8) | (f[i + 2] >> shift);
        if (key !== lastKey) {
          let v = map.get(key);
          if (v === undefined) {
            if (map.size >= 256) { ok = false; break outer; }
            v = map.size;
            map.set(key, v);
          }
          lastKey = key;
          lastIdx = v;
        }
        idx[p] = lastIdx;
      }
      indexed.push(idx);
    }
    if (!ok) continue;
    const half = shift ? 1 << (shift - 1) : 0;
    const palette = [];
    for (const [key, i] of map) {
      palette[i] = [
        Math.min(255, (((key >> 16) & 255) << shift) | half),
        Math.min(255, (((key >> 8) & 255) << shift) | half),
        Math.min(255, ((key & 255) << shift) | half),
      ];
    }
    return { palette, indexed };
  }
  throw new Error('palette build failed');
}

// LZW dictionary as a flat typed array keyed by (prefix << 8 | byte), with a
// generation stamp so a clear code resets it in O(1). Reused across calls.
const TABLE = new Int32Array(1 << 20);
let gen = 0;

function lzw(indices, minCode, out) {
  out.push(minCode);
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let next = eoi + 1;
  let size = minCode + 1;
  if (++gen > 0x7fff) { TABLE.fill(0); gen = 1; }
  let cur = 0, nbits = 0;
  const bytes = [];

  const emit = (code) => {
    cur |= code << nbits;
    nbits += size;
    while (nbits >= 8) {
      bytes.push(cur & 255);
      cur >>>= 8;
      nbits -= 8;
    }
  };

  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const slot = TABLE[key];
    if ((slot >>> 16) === gen) { prefix = slot & 0xffff; continue; }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      next = eoi + 1;
      size = minCode + 1;
      if (++gen > 0x7fff) { TABLE.fill(0); gen = 1; }
    } else {
      if (next >= (1 << size)) size++;
      TABLE[key] = (gen << 16) | next++;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (nbits > 0) bytes.push(cur & 255);

  for (let i = 0; i < bytes.length; i += 255) {
    const len = Math.min(255, bytes.length - i);
    out.push(len);
    for (let j = i; j < i + len; j++) out.push(bytes[j]);
  }
  out.push(0x00);
}
