# Solidpixels Tetra — aviation plugins

Three independent plugins for the 64×32 Tetra. Each one is its own folder with its own copy of the shared modules, so you can move, deploy or delete any of them without touching the others.

| Folder | What it shows | Default refresh |
| --- | --- | --- |
| `radar-ppi/` | Overhead PPI scope: rotating sweep, phosphor fade, 60 s position trails, nearest-traffic readout | 30 s |
| `split-flap/` | Solari board: 3 rows × 16 flaps, callsign / type / altitude, pages flip every ~5 s | 60 s |
| `livery-spotter/` | Nearest airliner as a pixel sprite in its airline's colours over a looping desert scene | 20 s |

No dependencies. Node 18+ only (uses built-in `fetch`).

## Run locally

```bash
cd radar-ppi          # or split-flap, livery-spotter
cp .env.example .env  # add your API token
node local.js --demo  # synthetic traffic, no network, writes out/
open out/preview.html # scaled LED preview
node local.js --push  # live ADS-B -> render -> push once
node local.js --watch --push   # keep it running
```

The livery spotter also has `node local.js --gallery`, which renders every type × livery combination into `out/gallery/gallery.html`.

## How it works

```
adsb.js  ->  render.js  ->  gif.js  ->  push.js
(fetch)      (pure)         (pure)      (fetch)
```

Everything under `src/` except `node-util.js` and `demo.js` uses only `fetch`, `btoa`, `Intl` and typed arrays, so the same files run unchanged in a Cloudflare Worker. Frames are rendered as raw 64×32 RGB, encoded as an animated GIF (always well under the 192 KiB push limit), and sent to `POST /v1/devices/{id}/push` with a stable `installationId`, so each plugin owns one slot in the device rotation. The first push shows immediately; later pushes refresh the slot in the background. The spotter interrupts only when a new aircraft shows up.

## Cloudflare Workers

Each folder also has a `worker.js` and `wrangler.toml`. The Worker reuses the same `src/` files. A cron trigger renders and pushes once a minute, and opening the Worker's URL shows a live browser preview (`/?demo` for synthetic traffic, `/?tod=night` on the spotter).

```bash
cd radar-ppi
npx wrangler login                              # once per machine
npx wrangler dev --test-scheduled               # local: open http://localhost:8787/?demo
curl "http://localhost:8787/__scheduled"        # fire the cron locally (real push)
npx wrangler secret put SOLIDPIXELS_API_TOKEN   # paste the token
npx wrangler deploy
npx wrangler tail                               # live logs from the cron runs
```

Repeat in `split-flap/` and `livery-spotter/`. `.dev.vars` holds the token for `wrangler dev`; deployed Workers read it from the secret. Device ID, location and other settings are in `[vars]` in `wrangler.toml`.

**Plan limits.** Free Workers get 10 ms of CPU per cron run. Measured locally, the radar and board take about 4 ms and the spotter about 9 ms. The spotter is close to the limit, and cold starts are slower. If its runs show `exceeded CPU` in `wrangler tail`, either move it to Workers Paid ($5/mo, 30 s CPU) or keep it on `local.js`. The free plan allows 5 cron triggers per account; these use 3.

**Spotter state (optional).** With a KV namespace bound as `STATE` (see `wrangler.toml`), a newly arrived aircraft interrupts the display once. Without it, every push updates quietly in the background.

## Notes

- ADS-B data comes from airplanes.live, then adsb.lol, then adsb.fi. The requests identify themselves honestly instead of spoofing a browser.
- Liveries are colour-block approximations with no logos or lettering.
