#!/usr/bin/env node
// Local runner for the livery spotter.
//
//   node local.js --gallery              render every type x livery to out/gallery/ + gallery.html
//   node local.js --demo                 render the nearest synthetic aircraft
//   node local.js                        render the nearest live aircraft (or a gallery slot)
//   node local.js --watch --push         poll ADS-B and keep the Tetra updated
//   --tod day|dawn|dusk|night            force the background time of day
//   --no-ga                              skip GA trainers, airliners only

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadEnv, args, writeOutputs } from './src/node-util.js';
import { fetchTraffic } from './src/adsb.js';
import { demoTraffic } from './src/demo.js';
import { pickSubject, renderSpotter } from './src/render.js';
import { GALLERY, TYPES, LIVERIES } from './src/sprites.js';
import { encodeGif } from './src/gif.js';
import { pushImage, MAX_BYTES } from './src/push.js';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(here);
const { has, val } = args();
const env = process.env;

const cfg = {
  lat: Number(env.LAT ?? 33.4342),
  lon: Number(env.LON ?? -112.0116),
  fieldElevFt: Number(env.FIELD_ELEV_FT ?? 1135),
  radiusNm: Number(env.RANGE_NM ?? 15),
  spotNm: Number(env.SPOT_NM ?? 8),
  timeZone: env.TIME_ZONE ?? 'America/Phoenix',
  interval: Number(val('--interval', env.INTERVAL_S ?? 20)),
  tod: val('--tod', env.TOD),
  includeGA: !has('--no-ga') && env.INCLUDE_GA !== 'false',
};

if (has('--gallery')) {
  const dir = join(here, 'out', 'gallery');
  mkdirSync(dir, { recursive: true });
  const tods = cfg.tod ? [cfg.tod] : ['day', 'dusk', 'night', 'dawn'];
  const cards = [];
  GALLERY.forEach(([family, code], i) => {
    const tod = tods[i % tods.length];
    const s = { family, livery: LIVERIES[code], code, callsign: code, type: TYPES[family].label, live: false };
    const { frames, delays } = renderSpotter(s, { tod });
    const name = `${family}-${code}.gif`;
    writeFileSync(join(dir, name), encodeGif(frames, { delays }));
    cards.push(`<figure><img src="${name}"><figcaption>${TYPES[family].label} · ${LIVERIES[code].name} · ${tod}</figcaption></figure>`);
  });
  writeFileSync(join(dir, 'gallery.html'), `<!doctype html><meta charset="utf-8"><title>Livery gallery</title>
<style>body{background:#0b0d10;color:#8a96a3;font:12px ui-monospace,monospace;margin:24px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(384px,1fr));gap:18px}
figure{margin:0;background:#16191f;padding:10px;border-radius:10px}
img{width:100%;aspect-ratio:2/1;image-rendering:pixelated;display:block;border-radius:4px}
figcaption{margin-top:8px}</style><main>${cards.join('')}</main>`);
  console.log(`${GALLERY.length} sprites -> ${join(dir, 'gallery.html')}`);
  process.exit(0);
}

let galleryIndex = 0;
let lastKey = null;
let pushed = false;

async function tick() {
  const traffic = has('--demo')
    ? demoTraffic(cfg)
    : await fetchTraffic({ lat: cfg.lat, lon: cfg.lon, radiusNm: cfg.radiusNm, fieldElevFt: cfg.fieldElevFt });

  const subject = pickSubject(traffic, { spotNm: cfg.spotNm, galleryIndex, includeGA: cfg.includeGA });
  if (!subject.live) galleryIndex++;

  const { frames, delays, tod } = renderSpotter(subject, { timeZone: cfg.timeZone, tod: cfg.tod });
  const gif = encodeGif(frames, { delays });
  const file = writeOutputs(here, 'spotter', gif, 'Livery spotter');
  const stamp = new Date().toLocaleTimeString();
  const what = `${subject.callsign} ${subject.type} (${subject.family}, ${subject.livery.name})`;
  console.log(`[${stamp}] ${subject.live ? 'LIVE' : 'gallery'} ${what}, ${tod}, ${gif.length} B -> ${file}`);
  if (gif.length > MAX_BYTES) console.warn('GIF is over the 192 KiB push limit');

  if (has('--push')) {
    // a newly arrived live aircraft interrupts the display; everything else updates quietly
    const fresh = subject.live && subject.key !== lastKey;
    await pushImage({
      token: env.SOLIDPIXELS_API_TOKEN,
      deviceId: env.SOLIDPIXELS_DEVICE_ID,
      bytes: gif,
      installationId: env.INSTALLATION_ID ?? 'livery-spotter',
      background: pushed && !fresh,
    });
    pushed = true;
    console.log(`[${stamp}] pushed${fresh ? ' (new aircraft, shown now)' : ''}`);
  }
  lastKey = subject.live ? subject.key : null;
}

if (has('--watch')) {
  for (;;) {
    try { await tick(); } catch (e) { console.error(e.message); }
    await new Promise((r) => setTimeout(r, cfg.interval * 1000));
  }
} else {
  await tick();
}
