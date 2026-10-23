# Radar PPI

Top-down scope centred on `LAT/LON`. Two layouts, set with `LAYOUT` (or `--layout`):

- **`wide`** (default): true-scale scope across the full 64 px width. `RANGE_NM` is the east-west half-width, and the outer ring sits at the left/right edges. The 32 px height shows roughly half that range north and south. Traffic beyond that is drawn as a dash on the top or bottom edge. Text is just the site label (top-left) and range (bottom-right).
- **`compact`**: round scope, radius `RANGE_NM`, centred. The four corners hold the site label, the nearest aircraft's altitude in hundreds of ft (coloured by trend, red on alert), the aircraft count and the range.

Both layouts share:

- **Sweep**: 36-frame clockwise revolution with an afterglow wedge. Each target brightens as the sweep passes and fades over the revolution.
- **Targets**: a 3×3 plus with a bright core and a 2 px heading leader showing which way it's flying. Cyan airliners, amber GA, green helicopters, purple military. Red with blinking corners means inside 5 nm and below 2,500 ft AGL.
- **Trails**: three dots showing where the aircraft was 20, 40 and 60 s ago, back along its track.

```bash
node dev.js                       # dev bench -> http://localhost:8790
node local.js --demo              # offline, one render to out/
node local.js --demo --scenario alert
node local.js --watch --push      # live
```

## Dev bench (`node dev.js`)

A browser page for testing without touching the device:

- **Source**: live ADS-B (cached 10 s) or a moving demo scenario: `mixed`, `busy` (24 aircraft, tests the 16-target cap), `pattern` (GA circuits around the centre), `alert` (low traffic inside 5 nm), `edge` (targets on and just past the ring), `empty`.
- **Centre presets**: KPHX, KDVT, KSDL, KFFZ, KIWA, KGEU, KCHD; label and field elevation follow the preset.
- **Range slider**: 3 to 60 nm. **Auto-refresh**: manual, 2, 5, 15 or 30 s.
- **Views**: LED dot mask, a 64×32 pixel grid, or plain.
- **Pixel inspector**: hover the screen to see x/y and the aircraft on that pixel, highlighted in the table.
- **Aircraft table**: alt, AGL, GS, track, V/S, distance and pixel position. Greyed-out rows are filtered off the scope (on the ground, out of range, or over the cap).
- **Stats**: render + encode time (flagged above the 10 ms Workers free budget), GIF size and frame count.
- **Push to Tetra** sends exactly the frame you're looking at; tick *background* to update the slot without interrupting the display. **Download GIF** saves it.

Settings persist in the browser between sessions.
