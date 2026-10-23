# Solidpixels Tetra — Aviation Plugins

Live-traffic displays for the [Solidpixels Tetra](https://solidpixels.io) 64×32 LED matrix, built around Phoenix Sky Harbor (KPHX) but configurable for any airport. Real ADS-B data in, animated pixel art out.

| Plugin | What it shows |
| --- | --- |
| **`radar-ppi/`** | A round PPI scope with a rotating sweep, fading targets with heading leaders and trails, red alerts for low and close traffic, and the nearest target's flight level in the corner. |
| **`split-flap/`** | A Solari-style board, 3 rows × 16 flaps, with real **arrivals / departures** (route lookup) or a callsign / type / altitude "overhead" board. |
| **`livery-spotter/`** | The nearest aircraft as a pixel sprite in its airline's colours (A320, 737, 747, A380, 787, 777, A350, plus GA trainers) over a looping desert scene with day, dusk and night variants. |

Each plugin is a **separate project** with its own copy of the shared modules. Run, deploy or delete any of them without touching the others. No npm dependencies; Node 18+ only.

> **Status:** rendering, GIF encoding and the Worker bundles are tested. Live ADS-B and route lookups depend on third-party community APIs and are best confirmed on your own machine (see [Troubleshooting](#troubleshooting)).

---

## Contents

1. [Quick start](#quick-start)
2. [Get your Solidpixels credentials](#get-your-solidpixels-credentials)
3. [Configuration](#configuration)
4. [Run each plugin locally](#run-each-plugin-locally)
5. [Deploy to Cloudflare Workers](#deploy-to-cloudflare-workers)
6. [Native Solidpixels apps (Starlark)](#native-solidpixels-apps-starlark)
7. [Housekeeping: remove old slots](#housekeeping-remove-old-slots)
8. [How it works](#how-it-works)
9. [Troubleshooting](#troubleshooting)
10. [Security](#security)
11. [Data sources and credits](#data-sources-and-credits)
12. [License](#license)

---

## Quick start

```bash
git clone https://github.com/<your-username>/solidpixels-aviation.git
cd solidpixels-aviation/radar-ppi        # or split-flap, livery-spotter

cp .env.example .env                     # then edit .env (see below)
node local.js --demo                     # synthetic traffic, no network, no push
open out/preview.html                    # scaled-up LED preview (use xdg-open on Linux)
```

Once the demo looks right and `.env` has your credentials:

```bash
node local.js --push                     # live traffic -> render -> push once
node local.js --watch --push             # keep the display updating
```

Check your Node version with `node -v` (18 or newer).

---

## Get your Solidpixels credentials

You need two values:

| Value | Where to find it |
| --- | --- |
| `SOLIDPIXELS_API_TOKEN` | Your Solidpixels dashboard, in the API keys section. Starts with `spk_`. |
| `SOLIDPIXELS_DEVICE_ID` | Your device ID, serial or MAC. You can list devices with `GET /v1/devices`. |

Quick check that the token works:

```bash
curl -s -H "Authorization: Bearer $SOLIDPIXELS_API_TOKEN" https://api.solidpixels.io/v1/devices
```

> The `SOLIDPIXELS_DEVICE_ID` in `.env.example` is the author's. **Replace it with yours.**

---

## Configuration

Each plugin reads `.env` locally and `[vars]` in `wrangler.toml` on Cloudflare. Common settings:

| Variable | Meaning | Default |
| --- | --- | --- |
| `SOLIDPIXELS_API_TOKEN` | API key (secret) | — |
| `SOLIDPIXELS_DEVICE_ID` | Your device | — |
| `LAT`, `LON` | Centre point of the display | KPHX (`33.4342`, `-112.0116`) |
| `FIELD_ELEV_FT` | Airport elevation, for altitude-above-ground and alerts | `1135` |
| `TIME_ZONE` | IANA zone for clocks and day/night | `America/Phoenix` |
| `LABEL` | 3–4 letter label on the display | `PHX` |
| `RANGE_NM` | Radius of traffic to fetch / show, in nm | radar `20`, board `40`, spotter `15` |
| `INTERVAL_S` | Seconds between updates for `--watch` (local only) | `20`–`60` |
| `INSTALLATION_ID` | The slot this plugin owns in the device rotation | per plugin |

Plugin-specific:

- **radar-ppi:** `LAYOUT=compact` (round full-circle scope with corner text, the default) or `wide` (full-width scope, clipped top and bottom).
- **split-flap:** `BOARD=fids` (arrivals and departures) or `overhead`; `HOME_AIRPORT=PHX,KPHX`; `SHOW_NEARBY=auto|true|false`; `MAX_PAGES=4`.
- **livery-spotter:** `SPOT_NM` (how close an aircraft must be to be shown), `INCLUDE_GA=true|false`, `TOD=day|dawn|dusk|night` to force the background.

To point everything at another airport, change `LAT`, `LON`, `FIELD_ELEV_FT`, `TIME_ZONE`, `LABEL` and `HOME_AIRPORT`.

---

## Run each plugin locally

All plugins share these flags:

| Flag | Effect |
| --- | --- |
| `--demo` | Use synthetic traffic, no network |
| `--push` | Push the rendered GIF to your Tetra |
| `--watch` | Repeat every `INTERVAL_S` seconds |

Outputs land in `out/` (`out/preview.html` shows the animation scaled up).

### Radar PPI

```bash
cd radar-ppi
node local.js --demo --scenario busy        # mixed | busy | pattern | alert | edge | empty
node local.js --layout compact              # compact | wide
node dev.js                                 # browser dev bench on http://localhost:8790
```

The **dev bench** (`dev.js`) lets you pick demo scenarios or live data, switch airports (KPHX, KDVT, KSDL, KFFZ, KIWA, KGEU, KCHD), change layout and range, inspect individual pixels and push to the device with a button.

Target colours: cyan = airliner, amber = GA, green = helicopter, purple = military, red (flashing corners) = within 5 nm and under 2,500 ft AGL.

### Split-flap board

```bash
cd split-flap
node local.js --demo                        # arrivals/departures with demo routes
node local.js --board overhead --demo       # callsign / type / altitude
```

In `fids` mode each flight's route comes from the community routeset API (adsb.lol, with adsb.im as a fallback). Arrivals show the origin and minutes out. Departures show the destination and altitude (green climbing, orange descending). Flights without a known route fall onto a `NEAR` page.

Routes are crowd-sourced. They are usually right for scheduled airlines and missing for GA, charters and military.

### Livery spotter

```bash
cd livery-spotter
node local.js --gallery                     # every type x livery -> out/gallery/gallery.html
node local.js --demo
node local.js --tod night --demo            # day | dawn | dusk | night
node local.js --no-ga --watch --push        # airliners only
```

With nothing nearby, it rotates through a gallery of 20 type and livery combinations. Unknown airlines get a clean house scheme. Liveries are colour-block approximations with **no logos or lettering**.

---

## Deploy to Cloudflare Workers

Each plugin runs as its own Worker on a cron trigger (every minute, Cloudflare's minimum).

```bash
cd radar-ppi
npx wrangler login                              # once per machine
npx wrangler secret put SOLIDPIXELS_API_TOKEN   # paste the token
npx wrangler deploy
npx wrangler tail                               # live logs
```

Repeat in `split-flap/` and `livery-spotter/`.

- Settings live in `[vars]` in `wrangler.toml`. **Vars in `wrangler.toml` override code defaults.** If you change `LAYOUT` in the code but not the toml, nothing changes.
- Open the Worker's URL for a live browser preview. `/preview.gif` is the raw image, and `/preview.gif?demo=1` uses synthetic traffic.
- Local testing: `npx wrangler dev --test-scheduled`, then put the token in `.dev.vars`.
- Change how often it runs with `crons = ["*/5 * * * *"]` in `wrangler.toml` and redeploy.
- Rotated your API key? Run `npx wrangler secret put SOLIDPIXELS_API_TOKEN` again in each Worker folder.

**Plan limits.** Free Workers get 10 ms of CPU per run. Measured locally, the radar and board take about 4 ms and the spotter about 9 ms. If the spotter logs `Exceeded CPU Limit`, use Workers Paid ($5/mo) or run it with `local.js`. The free plan also allows only 5 cron triggers per account.

**Spotter state (optional).** Bind a KV namespace named `STATE` and a newly arrived aircraft interrupts the display once. Without it, updates happen quietly in the background.

---

## Native Solidpixels apps (Starlark)

`native/` contains a Starlark port of the radar for the Tetra's own app runtime, plus `publish.js` to upload versions through the Apps API. See [`native/README.md`](native/README.md) for the create → upload → submit-for-review flow.

Native apps run on Solidpixels' servers and need no token or Cloudflare account, so they are the route for sharing a plugin with other owners. The radar port has been checked against the JS renderer in demo mode but **not yet on a real device**. The split-flap and livery spotter are not ported yet.

---

## Housekeeping: remove old slots

Every pushed plugin occupies a slot in the device rotation. `purge.js` lists and removes them:

```bash
export SOLIDPIXELS_API_TOKEN=spk_...
export SOLIDPIXELS_DEVICE_ID=...

node purge.js                         # dry run: list slots, delete nothing
node purge.js --pushed --yes          # delete all pushed images
node purge.js --id radar-ppi --yes    # delete one slot
node purge.js --all --keep kphx-split-flap --yes
```

A running Worker recreates its slot on its next tick, so stop or undeploy it first.

---

## How it works

```
adsb.js  ->  render.js  ->  gif.js  ->  push.js
(fetch)      (pure)         (pure)      (fetch)
```

- **`adsb.js`** fetches aircraft from airplanes.live, falling back to adsb.lol and adsb.fi, and normalises them (distance, offsets, climb trend, kind).
- **`render.js`** draws into a 64×32 RGB framebuffer (`gfx.js`, with a 3×5 pixel font).
- **`gif.js`** is a small GIF89a encoder with a typed-array LZW table, fast enough for Worker CPU limits. Output is far below the 192 KiB push limit.
- **`push.js`** calls `POST /v1/devices/{id}/push` with a stable `installationId`, so each plugin keeps one slot. Later pushes update it with `background: true`.

Everything under `src/` except `node-util.js` and `demo.js` uses only `fetch`, `btoa`, `Intl` and typed arrays, so the same files run unchanged in Node and in Workers.

```
solidpixels-aviation/
├── radar-ppi/        local.js  dev.js  worker.js  wrangler.toml  src/
├── split-flap/       local.js  worker.js  wrangler.toml  src/
├── livery-spotter/   local.js  worker.js  wrangler.toml  src/
├── native/           Starlark radar + publish.js
└── purge.js          slot cleanup tool
```

---

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `fetch failed` / `ENOTFOUND` locally | No internet, or the ADS-B hosts are blocked on your network. Run with `--demo` to confirm the renderer works. |
| `push failed 401` | Wrong or rotated API token. Update `.env` and re-run `wrangler secret put`. |
| `push failed 404` | Wrong `SOLIDPIXELS_DEVICE_ID`. |
| Radar circle fills the whole screen and is cropped | Layout is `wide`. Set `LAYOUT=compact` in `.env` **and** in `wrangler.toml`, then redeploy. |
| Old image still showing on the device | A stale slot. List with `node purge.js` and remove it. |
| Board has only `NEAR` pages | Route lookup returned nothing. Check connectivity to `api.adsb.lol`. GA and military flights never have routes. |
| `Exceeded CPU Limit` in `wrangler tail` | Free-plan limit, mostly the livery spotter. Use Workers Paid, or run locally. |
| Cron doesn't seem to run | `wrangler tail` should show a scheduled event each minute. Confirm the deploy printed a new Version ID. |
| Animation doesn't move on the device | Check how your Tetra handles pushed GIFs. The docs do not say whether animation survives the server-side conversion. |

---

## Security

- **Never commit** `.env`, `.dev.vars` or anything containing your token. `.gitignore` excludes them.
- If a key is ever pasted into a chat, issue or commit, **rotate it** and update every place it's used (`.env`, `wrangler secret put`).
- Don't hardcode credentials in scripts you intend to publish.

---

## Data sources and credits

- ADS-B traffic: [airplanes.live](https://airplanes.live), [adsb.lol](https://adsb.lol), [adsb.fi](https://adsb.fi), community feeds with their own terms and rate limits. Requests identify themselves honestly. Be gentle and don't poll faster than you need.
- Route data: the community routeset API used by tar1090 (adsb.lol / adsb.im).
- Hardware and platform: [Solidpixels](https://solidpixels.io).
- Airline names and colours are used descriptively and no logos are reproduced. This project is not affiliated with or endorsed by any airline, aircraft manufacturer, ADS-B provider or Solidpixels.

---

## License

MIT, see [`LICENSE`](LICENSE). Copyright © 2026 Jay Kumar Bhatiya.
