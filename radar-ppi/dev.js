#!/usr/bin/env node
// Radar dev bench: browser UI for testing the radar locally.
//
//   node dev.js            then open http://localhost:8790
//   PORT=9000 node dev.js
//
// Live or scripted traffic, airport presets, range control, a pixel inspector
// that names the aircraft under the cursor, and a button to push the current
// frame to the Tetra.

import http from 'node:http';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './src/node-util.js';
import { fetchTraffic } from './src/adsb.js';
import { demoTraffic, SCENARIOS } from './src/demo.js';
import { renderRadar, LAYOUTS } from './src/render.js';
import { encodeGif } from './src/gif.js';
import { pushImage } from './src/push.js';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(here);
const env = process.env;
const PORT = Number(env.PORT ?? 8790);

const PRESETS = {
  KPHX: { lat: 33.4342, lon: -112.0116, elev: 1135, label: 'PHX' },
  KDVT: { lat: 33.6883, lon: -112.0826, elev: 1478, label: 'DVT' },
  KSDL: { lat: 33.6229, lon: -111.9105, elev: 1510, label: 'SDL' },
  KFFZ: { lat: 33.4608, lon: -111.7283, elev: 1394, label: 'FFZ' },
  KIWA: { lat: 33.3078, lon: -111.6556, elev: 1384, label: 'IWA' },
  KGEU: { lat: 33.5272, lon: -112.2952, elev: 1071, label: 'GEU' },
  KCHD: { lat: 33.2691, lon: -111.8111, elev: 1243, label: 'CHD' },
};

// live ADS-B is cached briefly so slider changes don't hammer the feeds
const cache = new Map();
async function liveTraffic(cfg) {
  const key = `${cfg.lat},${cfg.lon},${cfg.radiusNm}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10_000) return hit.data;
  const data = await fetchTraffic(cfg);
  cache.set(key, { at: Date.now(), data });
  return data;
}

function params(url) {
  const q = url.searchParams;
  const p = PRESETS[q.get('airport')] || PRESETS.KPHX;
  return {
    lat: Number(q.get('lat') || p.lat),
    lon: Number(q.get('lon') || p.lon),
    fieldElevFt: Number(q.get('elev') || p.elev),
    radiusNm: Math.min(60, Math.max(3, Number(q.get('range') || 20))),
    label: (q.get('label') || p.label).slice(0, 4).toUpperCase(),
    source: q.get('source') || 'mixed',
    layout: LAYOUTS.includes(q.get('layout')) ? q.get('layout') : 'compact',
  };
}

async function build(cfg) {
  const t0 = performance.now();
  const traffic = cfg.source === 'live'
    ? await liveTraffic({ lat: cfg.lat, lon: cfg.lon, radiusNm: cfg.radiusNm * 1.2, fieldElevFt: cfg.fieldElevFt })
    : demoTraffic({ lat: cfg.lat, lon: cfg.lon, radiusNm: cfg.radiusNm, fieldElevFt: cfg.fieldElevFt }, { scenario: cfg.source });
  const { frames, delays, targets } = renderRadar(traffic, { label: cfg.label, rangeNm: cfg.radiusNm, layout: cfg.layout });
  const gif = encodeGif(frames, { delays });
  const ms = performance.now() - t0;
  const onScope = new Set(targets.map((t) => t.a));
  const info = {
    renderMs: Math.round(ms * 10) / 10,
    bytes: gif.length,
    frames: frames.length,
    shown: targets.length,
    total: traffic.length,
    aircraft: traffic.map((a) => {
      const tg = targets.find((t) => t.a === a);
      return {
        id: a.callsign || a.reg || a.hex, type: a.type, kind: a.kind, alt: Math.round(a.alt), agl: Math.round(a.agl),
        gs: Math.round(a.gs), track: Math.round(a.track), vrate: Math.round(a.vrate), dist: Math.round(a.dist * 10) / 10,
        onGround: a.onGround, shown: onScope.has(a), alert: tg?.alert || false,
        px: tg ? tg.p : null, color: tg ? `rgb(${tg.color.join(',')})` : null,
      };
    }),
  };
  return { gif, info };
}

let last = null; // most recent render, so "push" sends exactly what you're looking at

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/render') {
      const cfg = params(url);
      last = await build(cfg);
      last.cfg = cfg;
      return send(res, 200, 'application/json', JSON.stringify({ ...last.info, gif: Buffer.from(last.gif).toString('base64') }));
    }
    if (url.pathname === '/push' && req.method === 'POST') {
      if (!last) return send(res, 400, 'application/json', JSON.stringify({ error: 'render something first' }));
      await pushImage({
        token: env.SOLIDPIXELS_API_TOKEN,
        deviceId: env.SOLIDPIXELS_DEVICE_ID,
        bytes: last.gif,
        installationId: env.INSTALLATION_ID ?? 'kphx-radar-ppi',
        background: url.searchParams.get('background') === '1',
      });
      return send(res, 200, 'application/json', JSON.stringify({ ok: true, bytes: last.gif.length }));
    }
    if (url.pathname === '/') return send(res, 200, 'text/html', page());
    send(res, 404, 'text/plain', 'not found');
  } catch (e) {
    send(res, 500, 'application/json', JSON.stringify({ error: e.message }));
  }
});

function send(res, code, type, body) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

server.listen(PORT, () => {
  console.log(`Radar dev bench: http://localhost:${PORT}`);
  if (!env.SOLIDPIXELS_API_TOKEN) console.log('(no SOLIDPIXELS_API_TOKEN in .env: the Push button will fail, preview still works)');
});

function page() {
  const presets = Object.keys(PRESETS).map((k) => `<option>${k}</option>`).join('');
  const sources = ['<option value="live">Live ADS-B</option>',
    ...Object.entries(SCENARIOS).map(([k, v]) => `<option value="${k}" title="${v}">Demo: ${k}</option>`)].join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Radar dev bench</title>
<style>
:root{--bg:#0b0d10;--panel:#14171c;--line:#252a33;--text:#d6dde5;--dim:#7d8894;--accent:#00d2ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px ui-monospace,SFMono-Regular,Menlo,monospace}
header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:2}
header h1{font-size:13px;margin:0 12px 0 0;letter-spacing:.06em}
label{display:flex;gap:6px;align-items:center;color:var(--dim)}
select,input,button{font:inherit;background:#0e1115;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 8px}
input[type=range]{padding:0;width:120px;accent-color:var(--accent)}
button{cursor:pointer}button.primary{background:#0e2a33;border-color:#145566;color:#7fe6ff}
main{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(320px,1fr);gap:16px;padding:16px}
@media(max-width:900px){main{grid-template-columns:1fr}}
.bezel{background:#16191f;padding:14px;border-radius:12px;box-shadow:0 18px 40px #0008}
.screen{position:relative;aspect-ratio:2/1;background:#000;border-radius:6px;overflow:hidden;cursor:crosshair}
.screen img{width:100%;height:100%;image-rendering:pixelated;display:block}
.screen.led:after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle,transparent 52%,#000 64%);background-size:calc(100%/64) calc(100%/32)}
.screen.grid:after{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(#ffffff14 1px,transparent 1px),linear-gradient(90deg,#ffffff14 1px,transparent 1px);background-size:calc(100%/64) calc(100%/32)}
#tip{position:absolute;pointer-events:none;background:#000d;border:1px solid var(--line);padding:4px 7px;border-radius:5px;white-space:nowrap;display:none}
.stats{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;color:var(--dim)}.stats b{color:var(--text);font-weight:600}
.warn{color:#ffb000}.err{color:#ff5a5a}
table{width:100%;border-collapse:collapse}th,td{text-align:right;padding:4px 6px;border-bottom:1px solid var(--line)}
th{color:var(--dim);font-weight:500;position:sticky;top:0;background:var(--panel)}td:first-child,th:first-child{text-align:left}
tr.off td{color:#4f5862}tr.hl td{background:#0e2a33}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:auto;max-height:calc(100vh - 110px)}
.sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:middle}
#msg{min-height:1.2em}
</style></head><body>
<header>
  <h1>RADAR DEV BENCH</h1>
  <label>Source <select id="source">${sources}</select></label>
  <label>Layout <select id="layout"><option value="compact">Full circle</option><option value="wide">Wide (clipped)</option></select></label>
  <label>Centre <select id="airport">${presets}</select></label>
  <label>Range <input id="range" type="range" min="3" max="60" value="20"><b id="rangeV">20</b>nm</label>
  <label>Refresh <select id="every"><option value="0">manual</option><option value="2">2 s</option><option value="5" selected>5 s</option><option value="15">15 s</option><option value="30">30 s</option></select></label>
  <label>View <select id="view"><option value="led">LED</option><option value="grid">Pixel grid</option><option value="plain">Plain</option></select></label>
  <button id="refresh">Render</button>
  <button id="push" class="primary">Push to Tetra</button>
  <label><input id="bg" type="checkbox"> background</label>
  <a id="dl" download="radar.gif" style="color:var(--accent)">Download GIF</a>
</header>
<main>
  <section>
    <div class="bezel"><div class="screen led" id="screen"><img id="img" alt="radar"><div id="tip"></div></div></div>
    <div class="stats" id="stats"></div>
    <div id="msg"></div>
  </section>
  <section class="panel"><table><thead><tr><th>Aircraft</th><th>Type</th><th>Alt</th><th>AGL</th><th>GS</th><th>Trk</th><th>V/S</th><th>Dist</th><th>Px</th></tr></thead><tbody id="rows"></tbody></table></section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const state = JSON.parse(localStorage.getItem('radarBench') || '{}');
for (const k of ['source','layout','airport','range','every','view']) if (state[k] != null) $(k).value = state[k];
$('rangeV').textContent = $('range').value;
let data = null, timer = null, busy = false;

function save(){ const s={}; for (const k of ['source','layout','airport','range','every','view']) s[k]=$(k).value; localStorage.setItem('radarBench',JSON.stringify(s)); }
function qs(){ return new URLSearchParams({source:$('source').value,layout:$('layout').value,airport:$('airport').value,range:$('range').value}); }

async function render(){
  if (busy) return; busy = true;
  try {
    const r = await fetch('/render?' + qs()); const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    data = j;
    const src = 'data:image/gif;base64,' + j.gif;
    $('img').src = src; $('dl').href = src;
    $('stats').innerHTML = [['shown',j.shown+' / '+j.total],['render+encode',j.renderMs+' ms'],['GIF',(j.bytes/1024).toFixed(1)+' KiB'],['frames',j.frames],['updated',new Date().toLocaleTimeString()]]
      .map(([k,v])=>'<span>'+k+' <b>'+v+'</b></span>').join('')
      + (j.renderMs > 10 ? '<span class="warn">over 10 ms Workers free-plan budget</span>' : '');
    $('rows').innerHTML = j.aircraft.map((a,i)=>'<tr data-i="'+i+'" class="'+(a.shown?'':'off')+'"><td>'+(a.color?'<span class="sw" style="background:'+a.color+'"></span>':'<span class="sw"></span>')+a.id+(a.alert?' <span class="err">ALERT</span>':'')+'</td><td>'+(a.type||'')+'</td><td>'+(a.onGround?'GND':a.alt)+'</td><td>'+a.agl+'</td><td>'+a.gs+'</td><td>'+a.track+'</td><td>'+a.vrate+'</td><td>'+a.dist+'</td><td>'+(a.px?a.px.x+','+a.px.y:'off')+'</td></tr>').join('')
      || '<tr><td colspan="9" style="color:var(--dim)">No aircraft</td></tr>';
    $('msg').textContent = '';
  } catch (e) { $('msg').innerHTML = '<span class="err">'+e.message+'</span>'; }
  busy = false;
}

function schedule(){ clearInterval(timer); const s = +$('every').value; if (s) timer = setInterval(render, s*1000); }

for (const id of ['source','layout','airport']) $(id).onchange = () => { save(); render(); };
$('range').oninput = () => { $('rangeV').textContent = $('range').value; };
$('range').onchange = () => { save(); render(); };
$('every').onchange = () => { save(); schedule(); };
$('view').onchange = () => { save(); $('screen').className = 'screen ' + ($('view').value==='plain'?'':$('view').value); };
$('view').onchange();
$('refresh').onclick = render;
$('push').onclick = async () => {
  $('msg').textContent = 'pushing...';
  const r = await fetch('/push?background=' + ($('bg').checked?1:0), {method:'POST'}); const j = await r.json();
  $('msg').innerHTML = r.ok ? '<span style="color:#28e66e">pushed '+(j.bytes/1024).toFixed(1)+' KiB to the Tetra</span>' : '<span class="err">'+j.error+'</span>';
};

// pixel inspector: which aircraft is under the cursor
$('screen').onmousemove = (e) => {
  if (!data) return;
  const r = e.currentTarget.getBoundingClientRect();
  const x = Math.floor((e.clientX-r.left)/r.width*64), y = Math.floor((e.clientY-r.top)/r.height*32);
  const near = data.aircraft.filter(a=>a.px && Math.abs(a.px.x-x)<=1 && Math.abs(a.px.y-y)<=1);
  document.querySelectorAll('tr.hl').forEach(t=>t.classList.remove('hl'));
  near.forEach(a=>document.querySelector('tr[data-i="'+data.aircraft.indexOf(a)+'"]')?.classList.add('hl'));
  const tip = $('tip'); tip.style.display = 'block';
  tip.style.left = Math.min(e.clientX-r.left+12, r.width-180)+'px'; tip.style.top = (e.clientY-r.top+12)+'px';
  tip.textContent = 'x'+x+' y'+y + (near.length ? '  '+near.map(a=>a.id+' '+(a.onGround?'GND':Math.round(a.alt/100)*100+'ft')).join(', ') : '');
};
$('screen').onmouseleave = () => { $('tip').style.display='none'; document.querySelectorAll('tr.hl').forEach(t=>t.classList.remove('hl')); };

render(); schedule();
</script></body></html>`;
}
