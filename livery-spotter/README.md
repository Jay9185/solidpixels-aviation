# Livery spotter

Shows the nearest drawable aircraft within `SPOT_NM` as a side-profile sprite over a scrolling Sonoran-desert scene. The scene has saguaros and a parallax ridge, with day, dawn, dusk and night skies chosen from the local clock. At night you get stars, a moon and city lights. When nothing drawable is nearby, it cycles through the gallery.

**Types**: A320 family, 737 family, 747, A380, 787, 777, A350, plus a generic GA trainer. ICAO type codes (`A20N`, `B38M`, `B77W`, …) map to a family in `src/sprites.js`.

**Liveries** (picked from the callsign prefix): AIC, UAE, DAL, UAL, AAL, SWA, QTR, SIA, DLH, BAW, QFA. Unknown operators get a clean house scheme with a fin colour derived from their code.

**Live details**: the top bar shows callsign, altitude (coloured by trend) and type. Gear comes down below 3,000 ft AGL when level or descending. Beacons and strobes flash.

```bash
node local.js --gallery            # every type x livery -> out/gallery/gallery.html
node local.js --demo --tod night   # force a background
node local.js --watch --push       # live; new aircraft interrupt the rotation
```

To add an airline, add an entry to `LIVERIES` in `src/sprites.js`: body/belly colours, an optional stripe, an engine colour, and a `fin(u, v)` painter. `u` runs from the trailing edge (0) to the leading edge (1); `v` runs from the root (0) to the tip (1).
