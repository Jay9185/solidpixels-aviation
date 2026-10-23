// Node-only helpers for local runs (.env loading, preview page). Not used by the Worker build.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function loadEnv(dir) {
  const file = join(dir, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

export function args() {
  const a = process.argv.slice(2);
  const has = (f) => a.includes(f);
  const val = (f, d) => {
    const i = a.indexOf(f);
    return i >= 0 && a[i + 1] ? a[i + 1] : d;
  };
  return { has, val };
}

export function writeOutputs(dir, name, gif, title) {
  const out = join(dir, 'out');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${name}.gif`), gif);
  writeFileSync(join(out, 'preview.html'), previewHtml(`${name}.gif`, title));
  return join(out, `${name}.gif`);
}

// Scaled-up preview with an LED dot mask, auto-reloads every 10 s while --watch runs.
function previewHtml(src, title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta http-equiv="refresh" content="10">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d10;font:12px ui-monospace,monospace;color:#7c8794}
.bezel{background:#16191f;padding:22px;border-radius:14px;box-shadow:0 20px 50px #000a,inset 0 1px #ffffff14}
.screen{position:relative;width:min(90vw,960px);aspect-ratio:2/1;background:#000;border-radius:6px;overflow:hidden}
.screen img{width:100%;height:100%;image-rendering:pixelated;display:block}
.screen:after{content:"";position:absolute;inset:0;pointer-events:none;
background:radial-gradient(circle at center,transparent 52%,#000 64%);background-size:calc(100%/64) calc(100%/32)}
p{text-align:center;margin:14px 0 0}
</style></head><body><div><div class="bezel"><div class="screen"><img src="${src}?t=${Date.now()}"></div></div>
<p>${title} · 64×32 · reloads every 10 s</p></div></body></html>`;
}
