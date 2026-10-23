#!/usr/bin/env node
// Remove old installations (rotation slots) from your Solidpixels device.
// Reads SOLIDPIXELS_API_TOKEN / SOLIDPIXELS_DEVICE_ID from ./.env or the environment.
//
//   node purge.js                       list installations (dry run, deletes nothing)
//   node purge.js --pushed              delete every pushed image (app === null)
//   node purge.js --id livery-spotter   delete specific installation(s); repeatable
//   node purge.js --all                 delete everything in the rotation
//   node purge.js --older-than 7        only delete ones created more than 7 days ago
//   node purge.js --keep radar-ppi      never delete these ids; repeatable
//   add --yes to actually delete; without it the script only shows what it would remove
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const p of ['.env', join(here, '.env'), join(here, 'radar-ppi/.env'), join(here, 'livery-spotter/.env')]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TOKEN = process.env.SOLIDPIXELS_API_TOKEN;
const DEVICE = process.env.SOLIDPIXELS_DEVICE_ID;
const BASE = process.env.SOLIDPIXELS_API_BASE || 'https://api.solidpixels.io/v1';
if (!TOKEN || !DEVICE) { console.error('Set SOLIDPIXELS_API_TOKEN and SOLIDPIXELS_DEVICE_ID (.env or environment).'); process.exit(1); }

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const values = (n) => argv.flatMap((a, i) => (a === n && argv[i + 1] ? [argv[i + 1]] : []));
const ids = values('--id');
const keep = new Set(values('--keep'));
const olderDays = values('--older-than')[0] ? Number(values('--older-than')[0]) : null;
const yes = flag('--yes');
if (!flag('--all') && !flag('--pushed') && !ids.length && olderDays === null) {
  console.log('(no selector given: listing only. use --all, --pushed, --id <id> or --older-than <days>)\n');
}

const headers = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' };
const dev = encodeURIComponent(DEVICE);

const res = await fetch(`${BASE}/devices/${dev}/installations`, { headers });
if (!res.ok) { console.error(`list failed: ${res.status} ${await res.text()}`); process.exit(1); }
const list = await res.json();

const now = Date.now();
const doomed = list.filter((x) => {
  if (keep.has(x.id)) return false;
  if (olderDays !== null && now - Date.parse(x.createdAt) < olderDays * 864e5) return false;
  if (flag('--all')) return true;
  if (ids.includes(x.id)) return true;
  if (flag('--pushed') && x.app === null) return true;
  return olderDays !== null && !flag('--pushed') && !ids.length ? true : false;
});

console.log(`${list.length} installation(s) on device:`);
for (const x of list) {
  const mark = doomed.includes(x) ? 'DELETE' : 'keep  ';
  console.log(`  ${mark}  ${x.id.padEnd(28)} ${x.app ? `app:${x.app.name}` : 'pushed'.padEnd(10)}  ${x.createdAt}`);
}
if (!doomed.length) process.exit(0);
if (!yes) { console.log(`\nDry run. Re-run with --yes to delete ${doomed.length}.`); process.exit(0); }

let failed = 0;
for (const x of doomed) {
  const r = await fetch(`${BASE}/devices/${dev}/installations/${encodeURIComponent(x.id)}`, { method: 'DELETE', headers });
  console.log(`${r.ok ? 'deleted' : `FAILED ${r.status}`}  ${x.id}`);
  if (!r.ok) failed++;
}
process.exit(failed ? 1 : 0);
