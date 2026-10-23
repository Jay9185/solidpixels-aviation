#!/usr/bin/env node
// Local runner: fetch traffic -> render frames -> GIF -> out/ preview (+ optional push).
//
//   node local.js --demo            render synthetic traffic once, no network
//   node local.js --demo --scenario busy   (mixed|busy|pattern|alert|edge|empty)
//   --layout compact|wide           round full-circle scope with corner numbers (default) or full-width clipped scope
//   node local.js                   render live traffic once
//   node local.js --push            render live traffic and push to the Tetra
//   node local.js --watch --push    keep going every INTERVAL_S seconds

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, args, writeOutputs } from './src/node-util.js';
import { fetchTraffic } from './src/adsb.js';
import { demoTraffic } from './src/demo.js';
import { renderRadar } from './src/render.js';
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
  radiusNm: Number(env.RANGE_NM ?? 20),
  label: env.LABEL ?? 'PHX',
  layout: val('--layout', env.LAYOUT ?? 'compact'),
  interval: Number(val('--interval', env.INTERVAL_S ?? 30)),
};

let pushed = false;

async function tick() {
  const traffic = has('--demo')
    ? demoTraffic(cfg, { scenario: val('--scenario', 'mixed') })
    : await fetchTraffic({ lat: cfg.lat, lon: cfg.lon, radiusNm: cfg.radiusNm, fieldElevFt: cfg.fieldElevFt });

  const { frames, delays } = renderRadar(traffic, { label: cfg.label, rangeNm: cfg.radiusNm, layout: cfg.layout });
  const gif = encodeGif(frames, { delays });
  const file = writeOutputs(here, 'radar', gif, `${cfg.label} radar`);
  const stamp = new Date().toLocaleTimeString();
  console.log(`[${stamp}] ${traffic.length} aircraft, ${frames.length} frames, ${gif.length} B -> ${file}`);
  if (gif.length > MAX_BYTES) console.warn('GIF is over the 192 KiB push limit');

  if (has('--push')) {
    await pushImage({
      token: env.SOLIDPIXELS_API_TOKEN,
      deviceId: env.SOLIDPIXELS_DEVICE_ID,
      bytes: gif,
      installationId: env.INSTALLATION_ID ?? 'kphx-radar-ppi',
      // first push shows immediately; later ones refresh the slot quietly
      background: pushed,
    });
    pushed = true;
    console.log(`[${stamp}] pushed to device`);
  }
}

if (has('--watch')) {
  for (;;) {
    try { await tick(); } catch (e) { console.error(e.message); }
    await new Promise((r) => setTimeout(r, cfg.interval * 1000));
  }
} else {
  await tick();
}
