#!/usr/bin/env node
// Submit a native app version for Solidpixels review.
//
//   node publish.js radar-ppi 1.0.0
//
// Needs SOLIDPIXELS_API_TOKEN (read from ../radar-ppi/.env if not set) and the
// app's ID or slug in <app>/APP_ID — create the app once in the Solidpixels
// cloud editor (Development Resources -> My apps, language Starlark) to get it.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [app, version] = process.argv.slice(2);
if (!app || !version) {
  console.error('usage: node publish.js <app-folder> <version>');
  process.exit(1);
}

let token = process.env.SOLIDPIXELS_API_TOKEN;
const envFile = join(here, '..', 'radar-ppi', '.env');
if (!token && existsSync(envFile)) {
  token = readFileSync(envFile, 'utf8').match(/^SOLIDPIXELS_API_TOKEN=(.*)$/m)?.[1]?.trim();
}
if (!token) throw new Error('SOLIDPIXELS_API_TOKEN is not set');

const idFile = join(here, app, 'APP_ID');
if (!existsSync(idFile)) throw new Error(`create the app in the cloud editor, then put its ID or slug in ${idFile}`);
const appId = readFileSync(idFile, 'utf8').trim();
const scriptContent = readFileSync(join(here, app, 'app.star'), 'utf8');

const res = await fetch(`https://api.solidpixels.io/v1/apps/${encodeURIComponent(appId)}/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ version, scriptContent, scriptLanguage: 'STARLARK' }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`upload failed ${res.status}: ${body}`);
  process.exit(1);
}
const v = JSON.parse(body);
console.log(`submitted ${app} ${v.version}: status ${v.status}`);
