// Cloudflare Worker: cron pushes the radar to the Tetra; GET / shows a browser preview.
import { fetchTraffic } from './src/adsb.js';
import { demoTraffic } from './src/demo.js';
import { renderRadar } from './src/render.js';
import { encodeGif } from './src/gif.js';
import { pushImage } from './src/push.js';

const config = (env) => ({
  lat: Number(env.LAT ?? 33.4342),
  lon: Number(env.LON ?? -112.0116),
  fieldElevFt: Number(env.FIELD_ELEV_FT ?? 1135),
  radiusNm: Number(env.RANGE_NM ?? 20),
  label: env.LABEL ?? 'PHX',
  layout: env.LAYOUT ?? 'compact',
});

async function render(env, demo = false) {
  const cfg = config(env);
  const traffic = demo ? demoTraffic(cfg) : await fetchTraffic(cfg);
  const { frames, delays } = renderRadar(traffic, { label: cfg.label, rangeNm: cfg.radiusNm, layout: cfg.layout });
  return { gif: encodeGif(frames, { delays }), count: traffic.length };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const { gif, count } = await render(env);
        await pushImage({
          token: env.SOLIDPIXELS_API_TOKEN,
          deviceId: env.SOLIDPIXELS_DEVICE_ID,
          bytes: gif,
          installationId: env.INSTALLATION_ID ?? 'kphx-radar-ppi',
          background: true,
        });
        console.log(`pushed radar: ${count} aircraft, ${gif.length} B`);
      } catch (e) {
        console.error('tick failed:', e.message);
      }
    })());
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/preview.gif') {
      const { gif } = await render(env, url.searchParams.has('demo'));
      return new Response(gif, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store' } });
    }
    return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
  },
};

const PAGE = `<!doctype html><meta charset="utf-8"><title>Radar preview</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d10}
img{width:min(90vw,960px);aspect-ratio:2/1;image-rendering:pixelated}</style>
<img><script>const q=location.search.slice(1),img=document.images[0],
load=()=>img.src='/preview.gif?'+q+'&t='+Date.now();load();setInterval(load,30000)</script>`;
