# Native Solidpixels apps

The other folders render GIFs on your machine or a Cloudflare Worker and **push** them into a rotation slot on one device. A native app is different. It's Starlark code that Solidpixels runs on its own servers. It installs from their app list, is configured from the phone app, and needs no API token, no cron and no Worker.

## How the drawing works

Tetra has no pixel or canvas widget, so each app keeps the same approach as the JS renderers. It draws into a 64×32 framebuffer (a list of packed RGB ints), then turns every frame into a `Stack` of 1 px-tall `Box` runs. Each run is a horizontal stretch of one colour.

Tested with Tetra v0.35.3:

| Approach | Result |
| --- | --- |
| `Box` runs per frame | Exact colours, crisp. The radar renders 36 frames in ~0.25 s |
| SVG `<rect>` per pixel in `render.Image` | Rejected: anti-aliased even with `crispEdges` and 10× supersampling |
| Pre-rendered GIF bytes in `render.Image` | Pixel-identical to the JS output (the "hybrid" fallback below) |

## Status

| App | State |
| --- | --- |
| `radar-ppi/` | Ported. Wide and compact layouts, live ADS-B, demo toggle, settings for location, label, elevation, range and layout |
| split-flap | Not yet. Straight port; route lookup works natively (`http.post` with `json_body` is supported) |
| livery spotter | Not yet. Largest port (sprites + parallax scene, 64 frames) |

## Try it locally

```bash
brew install solidpixels-inc/solidpixels/tetra     # or see the Tetra docs for Linux/Windows
cd native/radar-ppi
tetra render app.star demo=true -o radar.webp
tetra render app.star layout=compact range=10 -o radar.webp
tetra render app.star -m 10 -o radar.webp          # live traffic, 10x magnified
```

Tetra loads every `.star` file in a folder, so each app lives in its own folder as `app.star`.

## Publish

1. In the Solidpixels app: **Development Resources → My apps → Create new app**, language **Starlark**. The language can't be changed later.
2. Paste `app.star` into the cloud editor, then **Run preview** and **Test on device**.
3. Submit for review in the editor. Or put the app's ID or slug in `radar-ppi/APP_ID` and run `node publish.js radar-ppi 1.0.0`.

Approval publishes the version. Later versions go through review again. You can roll back from release history or with `POST /v1/apps/{id}/deploy`.

## Known limits

- **No `try`/`except` in Starlark.** HTTP status codes are checked and the next ADS-B source is tried. But a connection-level failure (DNS, TLS, refused) aborts the render, and the device keeps showing the last good frame until `max_age` (120 s) expires.
- **Data freshness.** Live data is cached 30 s per location, shared across installs. The render schedule is Solidpixels' decision, not ours.
- **Review.** Unknown how strict it is about third-party data sources. The ADS-B feeds are free community APIs with no key.

## Hybrid fallback

If a port is too heavy, a tiny native app can show what the Worker already renders:

```python
load("http.star", "http")
load("render.star", "render")

def main(config):
    res = http.get("https://<your-worker>.workers.dev/preview.gif", ttl_seconds = 60)
    if res.status_code != 200:
        return []
    img = render.Image(src = res.body())
    return render.Root(delay = img.delay, child = img)
```

This keeps all the logic in JS, but the app now depends on your Worker staying up.
