#!/usr/bin/env node
// Local runner: fetch traffic -> render frames -> GIF -> out/ preview (+ optional push).
//
//   node local.js --demo            render synthetic traffic once, no network
//   node local.js                   render live traffic once
//   node local.js --push            render live traffic and push to the Tetra
//   node local.js --watch --push    keep going every INTERVAL_S seconds
//   --board fids|overhead           arrivals/departures (default) or callsign/type/altitude

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, args, writeOutputs } from './src/node-util.js';
import { fetchTraffic } from './src/adsb.js';
import { demoTraffic, demoRoutes } from './src/demo.js';
import { lookupRoutes } from './src/routes.js';
import { renderPages, buildFidsPages, buildOverheadPages } from './src/render.js';
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
  radiusNm: Number(env.RANGE_NM ?? 40),
  timeZone: env.TIME_ZONE ?? 'America/Phoenix',
  maxPages: Number(env.MAX_PAGES ?? 4),
  label: env.LABEL ?? 'PHX',
  board: val('--board', env.BOARD ?? 'fids'),
  home: (env.HOME_AIRPORT ?? 'PHX,KPHX').split(',').map((s) => s.trim()),
  nearby: env.SHOW_NEARBY === 'true' ? true : env.SHOW_NEARBY === 'false' ? false : 'auto',
  interval: Number(val('--interval', env.INTERVAL_S ?? 60)),
};

let pushed = false;

async function tick() {
  const traffic = has('--demo')
    ? demoTraffic(cfg)
    : await fetchTraffic({ lat: cfg.lat, lon: cfg.lon, radiusNm: cfg.radiusNm, fieldElevFt: cfg.fieldElevFt });

  let pages;
  let note = '';
  if (cfg.board === 'overhead') {
    pages = buildOverheadPages(traffic, { maxPages: cfg.maxPages });
  } else {
    const routes = has('--demo') ? demoRoutes() : await lookupRoutes(traffic);
    pages = buildFidsPages(traffic, routes, { home: cfg.home, nearby: cfg.nearby, maxPages: cfg.maxPages });
    const count = (t) => pages.filter((p) => p.title === t).reduce((n, p) => n + p.rows.filter((r) => r.chars[0].ch !== ' ').length, 0);
    note = `, routes ${routes.size}, ARR ${count('ARR')} DEP ${count('DEP')}`;
  }
  const { frames, delays } = renderPages(pages, { label: cfg.label, timeZone: cfg.timeZone });
  const gif = encodeGif(frames, { delays });
  const file = writeOutputs(here, 'board', gif, `${cfg.label} split-flap board`);
  const stamp = new Date().toLocaleTimeString();
  console.log(`[${stamp}] ${traffic.length} aircraft${note}, ${pages.length} pages, ${gif.length} B -> ${file}`);
  if (has('--verbose')) for (const p of pages) for (const r of p.rows) console.log(`  ${(p.title || '').padEnd(4)} ${r.chars.map((c) => c.ch).join('')}`);
  if (gif.length > MAX_BYTES) console.warn('GIF is over the 192 KiB push limit');

  if (has('--push')) {
    await pushImage({
      token: env.SOLIDPIXELS_API_TOKEN,
      deviceId: env.SOLIDPIXELS_DEVICE_ID,
      bytes: gif,
      installationId: env.INSTALLATION_ID ?? 'kphx-split-flap',
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
