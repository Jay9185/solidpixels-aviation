// Cloudflare Worker: cron pushes the livery spotter to the Tetra; GET / shows a browser preview.
//
// Optional KV binding STATE remembers the last aircraft shown, so a newly
// arrived aircraft interrupts the display once instead of every minute.
// It is written only when the aircraft changes, which stays well inside
// the free KV write quota.

import { fetchTraffic } from './src/adsb.js';
import { demoTraffic } from './src/demo.js';
import { pickSubject, renderSpotter } from './src/render.js';
import { encodeGif } from './src/gif.js';
import { pushImage } from './src/push.js';

const config = (env) => ({
  lat: Number(env.LAT ?? 33.4342),
  lon: Number(env.LON ?? -112.0116),
  fieldElevFt: Number(env.FIELD_ELEV_FT ?? 1135),
  radiusNm: Number(env.RANGE_NM ?? 15),
  spotNm: Number(env.SPOT_NM ?? 8),
  timeZone: env.TIME_ZONE ?? 'America/Phoenix',
  tod: env.TOD || undefined,
  includeGA: env.INCLUDE_GA !== 'false',
});

async function render(env, { demo = false, tod } = {}) {
  const cfg = config(env);
  const traffic = demo ? demoTraffic(cfg) : await fetchTraffic(cfg);
  // gallery advances once a minute with no stored state
  const galleryIndex = Math.floor(Date.now() / 60000);
  const subject = pickSubject(traffic, { spotNm: cfg.spotNm, galleryIndex, includeGA: cfg.includeGA });
  const { frames, delays } = renderSpotter(subject, { timeZone: cfg.timeZone, tod: tod || cfg.tod });
  return { gif: encodeGif(frames, { delays }), subject };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const { gif, subject } = await render(env);
        const key = subject.live ? subject.key : '';
        const last = env.STATE ? (await env.STATE.get('lastKey')) ?? '' : key;
        const fresh = subject.live && key !== last;

        await pushImage({
          token: env.SOLIDPIXELS_API_TOKEN,
          deviceId: env.SOLIDPIXELS_DEVICE_ID,
          bytes: gif,
          installationId: env.INSTALLATION_ID ?? 'livery-spotter',
          background: !fresh,
        });
        if (env.STATE && key !== last) await env.STATE.put('lastKey', key);
        console.log(`pushed ${subject.live ? 'LIVE' : 'gallery'} ${subject.callsign} ${subject.type}${fresh ? ' (interrupt)' : ''}, ${gif.length} B`);
      } catch (e) {
        console.error('tick failed:', e.message);
      }
    })());
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/preview.gif') {
      const { gif } = await render(env, { demo: url.searchParams.has('demo'), tod: url.searchParams.get('tod') });
      return new Response(gif, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store' } });
    }
    return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
  },
};

const PAGE = `<!doctype html><meta charset="utf-8"><title>Livery spotter preview</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d10}
img{width:min(90vw,960px);aspect-ratio:2/1;image-rendering:pixelated}</style>
<img><script>const q=location.search.slice(1),img=document.images[0],
load=()=>img.src='/preview.gif?'+q+'&t='+Date.now();load();setInterval(load,30000)</script>`;
