# Split-flap board

Solari-style board: a header with page title, airport, page counter and local clock, then 3 rows of 16 flap tiles. Only changed characters flip, and the last page flips back into the first so the GIF loops. The whole loop is about 15 s.

## Boards (`BOARD`)

**`fids`** (default): live ARRIVALS / DEPARTURES for `HOME_AIRPORT`.

```
ARR PHX  1/2  14:59        DEP PHX       14:59
AAL1203 ORD LAND           AAL2291 DFW  068
SWA1844 DEN   3M           DAL1123 ATL  180
SKW3301 LAX   4M           SWA2210 LAS TAXI
```

- **Arrivals**: origin, then estimated minutes out (distance ÷ groundspeed; amber inside 5 min, `LAND` inside 1).
- **Departures**: destination, then altitude in hundreds of ft (green climbing), or `TAXI` on the ground.
- **NEAR** page: traffic with no known route, in the overhead format. Shown only when ARR + DEP fill less than a page (`SHOW_NEARBY=auto`), or always/never with `true`/`false`.

**`overhead`**: the original `CALLSIGN TYPE ALT` board for everything within `RANGE_NM`.

## Where the data comes from

1. **Positions**: live ADS-B (airplanes.live → adsb.lol → adsb.fi), within `RANGE_NM` (default 40 nm, enough to catch approaches and climb-outs).
2. **Routes**: callsigns are looked up in the community `routeset` API that tar1090 uses (adsb.lol, falling back to adsb.im). No key needed. Routes are checked for plausibility against the aircraft's position and cached for 30 min per callsign.

This is real traffic, not a published timetable. It shows flights that are airborne or taxiing near the field right now, so there are no scheduled times, gates, delays or cancellations. Routes come from a crowd-maintained database: usually right for scheduled airline flights, missing for GA, charters and military (those go to NEAR). For a true timetable board, AeroDataBox's free tier or FlightAware AeroAPI Personal ($5/month free credit) can be added as a third source.

```bash
node local.js --demo
node local.js --watch --push
```
