# KPHX-style radar PPI as a native Solidpixels app.
#
# Pure Starlark port of radar-ppi/src/render.js: draws into a 64x32
# framebuffer, then emits each frame as rows of 1 px-tall Box runs.
# Live ADS-B from the community readsb APIs, cached 30 s across installs.

load("cache.star", "cache")
load("encoding/json.star", "json")
load("http.star", "http")
load("math.star", "math")
load("render.star", "render")
load("schema.star", "schema")
load("time.star", "time")

W = 64
H = 32
TAU = 2 * math.pi
N_FRAMES = 36
FRAME_MS = 80

DEFAULT_LOCATION = {"lat": 33.4342, "lng": -112.0116, "locality": "Phoenix", "timezone": "America/Phoenix"}

SOURCES = [
    "https://api.airplanes.live/v2/point/%s/%s/%d",
    "https://api.adsb.lol/v2/point/%s/%s/%d",
    "https://opendata.adsb.fi/api/v3/lat/%s/lon/%s/dist/%d",
]

GA_TYPES = ["C150", "C152", "C172", "C182", "C206", "C210", "P28A", "P28B", "P28R", "PA28", "PA32", "PA34", "PA44",
            "SR20", "SR22", "DA20", "DA40", "DA42", "DA62", "BE35", "BE36", "BE58", "M20P", "M20T", "C208", "PC12", "TBM9"]

# packed 0xRRGGBB colours
C = {
    "bg": 0x000407,
    "ring_outer": 0x0e3238,
    "ring_inner": 0x092024,
    "tick": 0x1e5a64,
    "sweep": 0x1eff8c,
    "center": 0x468c78,
    "label": 0xffb000,
    "dim": 0x46646e,
    "text": 0xaac3cd,
    "airline": 0x00d2ff,
    "ga": 0xffb000,
    "heli": 0x28ff5a,
    "mil": 0xc864ff,
    "alert": 0xff3232,
    "up": 0x28e66e,
    "down": 0xff8c1e,
    "white": 0xffffff,
}

# 3x5 glyphs, rows top to bottom
FONT = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "011", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "001", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
    "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"],
    "C": ["011", "100", "100", "100", "011"], "D": ["110", "101", "101", "101", "110"],
    "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"],
    "G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"],
    "I": ["111", "010", "010", "010", "111"], "J": ["001", "001", "001", "101", "010"],
    "K": ["101", "101", "110", "101", "101"], "L": ["100", "100", "100", "100", "111"],
    "M": ["101", "111", "111", "101", "101"], "N": ["110", "101", "101", "101", "101"],
    "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"],
    "Q": ["111", "101", "101", "111", "001"], "R": ["110", "101", "110", "101", "101"],
    "S": ["011", "100", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"],
    "U": ["101", "101", "101", "101", "111"], "V": ["101", "101", "101", "101", "010"],
    "W": ["101", "101", "111", "111", "101"], "X": ["101", "101", "010", "101", "101"],
    "Y": ["101", "101", "010", "010", "010"], "Z": ["111", "001", "010", "100", "111"],
    "-": ["000", "000", "111", "000", "000"], " ": ["000", "000", "000", "000", "000"],
}

HEX = "0123456789abcdef"

# ---------------------------------------------------------------------------
# Colour + framebuffer helpers
# ---------------------------------------------------------------------------

def iround(v):
    return int(math.floor(v + 0.5))

def clampi(v, lo, hi):
    return max(lo, min(hi, v))

def rgb(c):
    return (c >> 16) & 255, (c >> 8) & 255, c & 255

def pack(r, g, b):
    return (clampi(r, 0, 255) << 16) | (clampi(g, 0, 255) << 8) | clampi(b, 0, 255)

def scale(c, k):
    r, g, b = rgb(c)
    return pack(iround(r * k), iround(g * k), iround(b * k))

def mix(a, b, t):
    ar, ag, ab = rgb(a)
    br, bg, bb = rgb(b)
    return pack(iround(ar + (br - ar) * t), iround(ag + (bg - ag) * t), iround(ab + (bb - ab) * t))

def hexcolor(c):
    s = "#"
    for shift in (16, 8, 0):
        v = (c >> shift) & 255
        s += HEX[v // 16] + HEX[v % 16]
    return s

def put(fb, x, y, c, a = 1.0):
    x = iround(x)
    y = iround(y)
    if x < 0 or x >= W or y < 0 or y >= H:
        return
    i = y * W + x
    if a >= 0.999:
        fb[i] = c
    elif a > 0:
        fb[i] = mix(fb[i], c, a)

def line(fb, x0, y0, x1, y1, c, a = 1.0):
    x0 = iround(x0)
    y0 = iround(y0)
    x1 = iround(x1)
    y1 = iround(y1)
    dx = max(x1 - x0, x0 - x1)
    dy = -max(y1 - y0, y0 - y1)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    for _ in range(dx - dy + 1):
        put(fb, x0, y0, c, a)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy

def circle(fb, cx, cy, r, c, step = 1):
    x = r
    y = 0
    err = 1 - r
    n = 0
    for _ in range(r * 2 + 2):
        if x < y:
            break
        if n % step == 0:
            for p in ((x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)):
                put(fb, cx + p[0], cy + p[1], c)
        n += 1
        y += 1
        if err < 0:
            err += 2 * y + 1
        else:
            x -= 1
            err += 2 * (y - x + 1)

def rect(fb, x, y, w, h, c, a = 1.0):
    for j in range(y, y + h):
        for i in range(x, x + w):
            put(fb, i, j, c, a)

def text_width(s):
    return max(0, len(s) * 4 - 1)

def text(fb, s, x, y, c):
    s = s.upper()
    for k in range(len(s)):
        g = FONT.get(s[k], FONT[" "])
        for r in range(5):
            row = g[r]
            for col in range(3):
                if row[col] == "1":
                    put(fb, x + k * 4 + col, y + r, c)

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def distance_nm(lat1, lon1, lat2, lon2):
    rad = math.pi / 180
    dlat = (lat2 - lat1) * rad
    dlon = (lon2 - lon1) * rad
    a = math.pow(math.sin(dlat / 2), 2) + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.pow(math.sin(dlon / 2), 2)
    return 3440.065 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def is_num(v):
    return type(v) == "int" or type(v) == "float"

def fetch_raw(lat, lon, radius):
    key = "adsb:%s:%s:%d" % (lat, lon, radius)
    hit = cache.get(key)
    if hit != None:
        return json.decode(hit)
    for src in SOURCES:
        res = http.get(src % (lat, lon, radius), headers = {"Accept": "application/json"}, ttl_seconds = 30)
        if res.status_code == 200:
            data = res.json()
            ac = data.get("ac") or data.get("aircraft") or []
            cache.set(key, json.encode(ac), ttl_seconds = 30)
            return ac
    return None

def normalize(raw, lat, lon, radius, elev):
    out = []
    for ac in raw:
        alat = ac.get("lat")
        alon = ac.get("lon")
        if not is_num(alat) or not is_num(alon):
            continue
        alt_b = ac.get("alt_baro")
        on_ground = alt_b == "ground"
        alt = elev if on_ground else (alt_b if is_num(alt_b) else ac.get("alt_geom"))
        if not is_num(alt):
            continue
        dist = distance_nm(lat, lon, alat, alon)
        if dist > radius:
            continue
        t = str(ac.get("t") or "").upper()
        cat = str(ac.get("category") or "").upper()
        flags = ac.get("dbFlags") or 0
        vr = ac.get("baro_rate")
        if not is_num(vr):
            vr = ac.get("geom_rate") if is_num(ac.get("geom_rate")) else 0
        kind = "airline"
        if is_num(flags) and int(flags) % 2 == 1:
            kind = "mil"
        elif cat == "A7":
            kind = "heli"
        elif t in GA_TYPES or cat == "A1":
            kind = "ga"
        trk = ac.get("track")
        if not is_num(trk):
            trk = ac.get("true_heading") if is_num(ac.get("true_heading")) else 0
        gs = ac.get("gs") if is_num(ac.get("gs")) else 0
        out.append({
            "on_ground": on_ground,
            "alt": alt,
            "agl": alt - elev,
            "gs": gs,
            "track": trk,
            "trend": 1 if vr > 400 else (-1 if vr < -400 else 0),
            "dist": dist,
            "kind": kind,
            "dx": (alon - lon) * math.cos(lat * math.pi / 180) * 60,
            "dy": (alat - lat) * 60,
        })
    return sorted(out, key = lambda a: a["dist"])

def demo_traffic(radius, elev, now):
    # (east nm, north nm, alt, gs, track, vrate, kind) at range 20, looping every 10 min
    base = [
        (-7, 1.2, 4200, 180, 75, -800, "airline"),
        (9, -0.8, 6800, 230, 70, 1800, "airline"),
        (-3, 10, 3500, 105, 160, 0, "ga"),
        (2, 2.5, 2900, 90, 300, -500, "ga"),
        (14, 8, 15000, 310, 245, -1500, "airline"),
        (-11, -6, 2200, 120, 40, 0, "heli"),
        (-15, -10, 22000, 410, 50, 2000, "airline"),
        (17, -4, 19000, 380, 280, 0, "mil"),
    ]
    s = radius / 20.0
    out = []
    for i in range(len(base)):
        x, y, alt, gs, trk, vr, kind = base[i]
        tau = ((now + i * 73) % 600) - 300
        d = gs * tau / 3600.0
        tr = trk * math.pi / 180
        dx = x * s + math.sin(tr) * d
        dy = y * s + math.cos(tr) * d
        a = max(elev + 300, alt + vr * tau / 60.0)
        dist = math.sqrt(dx * dx + dy * dy)
        out.append({"on_ground": False, "alt": a, "agl": a - elev, "gs": gs, "track": trk,
                    "trend": 1 if vr > 400 else (-1 if vr < -400 else 0), "dist": dist, "kind": kind, "dx": dx, "dy": dy})
    return sorted(out, key = lambda a: a["dist"])

# ---------------------------------------------------------------------------
# Rendering (mirrors radar-ppi/src/render.js)
# ---------------------------------------------------------------------------

def geometry(layout):
    if layout == "wide":
        return {"layout": "wide", "cx": 32, "cy": 16, "R": 31}
    return {"layout": "compact", "cx": 32, "cy": 16, "R": 15}

def pos(geo, dx, dy, k):
    x = dx * k
    y = -dy * k
    r = math.sqrt(x * x + y * y)
    if r > geo["R"] - 0.5:
        x = x * (geo["R"] - 0.5) / r
        y = y * (geo["R"] - 0.5) / r
    px = iround(geo["cx"] + x)
    py = iround(geo["cy"] + y)
    edge = py < 1 or py > 30
    return {"x": clampi(px, 1, 62), "y": clampi(py, 1, 30), "edge": edge}

def layout_targets(aircraft, geo, range_nm, alert_nm = 5, alert_agl = 2500, max_targets = 16):
    k = geo["R"] / range_nm
    targets = []
    for a in aircraft:
        if a["on_ground"] or a["dist"] > range_nm:
            continue
        if len(targets) >= max_targets:
            break
        alert = a["dist"] <= alert_nm and a["agl"] <= alert_agl
        color = C["alert"] if alert else C.get(a["kind"], C["airline"])
        t = a["track"] * math.pi / 180
        trail = []
        for s in (20, 40, 60):
            back = a["gs"] * s / 3600.0
            trail.append(pos(geo, a["dx"] - math.sin(t) * back, a["dy"] - math.cos(t) * back, k))
        bearing = math.atan2(a["dx"], a["dy"])
        if bearing < 0:
            bearing += TAU
        targets.append({"a": a, "alert": alert, "color": color, "p": pos(geo, a["dx"], a["dy"], k),
                        "trail": trail, "bearing": bearing, "dir": (math.sin(t), -math.cos(t))})
    return targets

def draw_scope(geo):
    fb = [C["bg"]] * (W * H)
    cx = geo["cx"]
    cy = geo["cy"]
    R = geo["R"]
    circle(fb, cx, cy, R, C["ring_outer"])
    circle(fb, cx, cy, iround(R / 2.0), C["ring_inner"], 2)
    if geo["layout"] == "wide":
        circle(fb, cx, cy, iround(R / 4.0), C["ring_inner"], 3)
    for d in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        put(fb, cx + d[0] * (R - 1), cy + d[1] * (R - 1), C["tick"])
    for x in range(cx - 1, cx + 2):
        put(fb, x, cy, C["center"])
    return fb

def draw_target(fb, tg, glow, f):
    p = tg["p"]
    color = tg["color"]
    for i in range(len(tg["trail"])):
        q = tg["trail"][i]
        if not q["edge"]:
            put(fb, q["x"], q["y"], color, (0.5 - i * 0.14) * glow)
    if p["edge"]:
        yy = 0 if p["y"] < 16 else 31
        for x in range(p["x"] - 1, p["x"] + 2):
            put(fb, x, yy, scale(color, glow))
        return
    for d in (2, 3):
        put(fb, p["x"] + iround(tg["dir"][0] * d), p["y"] + iround(tg["dir"][1] * d), color, (0.75 if d == 2 else 0.45) * glow)
    if tg["alert"] and f % 6 < 3:
        for o in ((-2, -2), (2, -2), (-2, 2), (2, 2)):
            put(fb, p["x"] + o[0], p["y"] + o[1], C["alert"])
    body = scale(color, glow)
    for o in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        put(fb, p["x"] + o[0], p["y"] + o[1], body)
    put(fb, p["x"], p["y"], scale(mix(color, C["white"], 0.55), glow))

def draw_text(fb, geo, label, range_nm, targets):
    lbl = label[:4]
    rng = str(int(range_nm))

    def put_text(s, x, y, c):
        rect(fb, x - 1, y - 1, text_width(s) + 2, 7, C["bg"], 0.85)
        text(fb, s, x, y, c)

    if geo["layout"] == "compact":
        put_text(lbl, 0, 0, C["label"])
        put_text(str(len(targets)), 0, 27, C["text"])
        put_text(rng, 64 - text_width(rng), 27, C["dim"])
        if targets:
            n = targets[0]
            fl = str(max(0, iround(n["a"]["alt"] / 100.0)))
            fl = ("000" + fl)[-3:]
            c = C["alert"] if n["alert"] else (C["up"] if n["a"]["trend"] > 0 else (C["down"] if n["a"]["trend"] < 0 else C["text"]))
            put_text(fl, 64 - text_width(fl), 0, c)
    else:
        put_text(lbl, 1, 1, C["label"])
        put_text(rng, 63 - text_width(rng), 26, C["dim"])

def frame_widget(fb):
    # one Box per horizontal run of same-coloured non-background pixels
    kids = [render.Box(width = W, height = H, color = hexcolor(C["bg"]))]
    bg = C["bg"]
    for y in range(H):
        row = y * W
        x = 0
        for _ in range(W):
            if x >= W:
                break
            c = fb[row + x]
            run = 1
            for k in range(x + 1, W):
                if fb[row + k] != c:
                    break
                run += 1
            if c != bg:
                kids.append(render.Padding(pad = (x, y, 0, 0), child = render.Box(width = run, height = 1, color = hexcolor(c))))
            x += run
    return render.Stack(children = kids)

def render_radar(aircraft, label, range_nm, layout):
    geo = geometry(layout)
    targets = layout_targets(aircraft, geo, range_nm)
    base = draw_scope(geo)
    frames = []
    for f in range(N_FRAMES):
        fb = list(base)
        theta = f * TAU / N_FRAMES
        for w in range(5, -1, -1):
            t = theta - w * 0.05
            line(fb, geo["cx"], geo["cy"], geo["cx"] + math.sin(t) * geo["R"], geo["cy"] - math.cos(t) * geo["R"],
                 C["sweep"], 0.5 if w == 0 else 0.2 - w * 0.03)
        lit = []
        for tg in targets:
            age = ((theta - tg["bearing"]) % TAU) / TAU
            lit.append((1 - 0.55 * age, tg))
        for glow, tg in sorted(lit, key = lambda e: e[0]):
            draw_target(fb, tg, glow, f)
        put(fb, geo["cx"], geo["cy"], C["white"], 0.9)
        draw_text(fb, geo, label, range_nm, targets)
        frames.append(frame_widget(fb))
    return render.Root(
        delay = FRAME_MS,
        max_age = 120,
        show_full_animation = True,
        child = render.Animation(children = frames),
    )

# ---------------------------------------------------------------------------
# Entry point + settings
# ---------------------------------------------------------------------------

def location_of(config):
    loc = config.get("location")
    if loc == None or loc == "":
        return DEFAULT_LOCATION
    if type(loc) == "string":
        loc = json.decode(loc)
    return loc

def main(config):
    loc = location_of(config)
    lat = float(loc.get("lat", DEFAULT_LOCATION["lat"]))
    lon = float(loc.get("lng", DEFAULT_LOCATION["lng"]))
    range_nm = int(config.get("range", "20"))
    layout = config.get("layout", "compact")
    label = (config.get("label", "") or "PHX").upper()[:4]
    elev = int(config.get("elevation", "1135") or "1135")
    demo = config.bool("demo", False)

    lat_s = str(iround(lat * 1000) / 1000.0)
    lon_s = str(iround(lon * 1000) / 1000.0)

    if demo:
        aircraft = demo_traffic(range_nm, elev, time.now().unix)
    else:
        raw = fetch_raw(lat_s, lon_s, int(range_nm * 1.2) + 1)
        if raw == None:
            return render.Root(child = render.Box(child = render.Text("NO ADS-B", color = "#46646e")))
        aircraft = normalize(raw, lat, lon, range_nm * 1.2, elev)

    return render_radar(aircraft, label, range_nm, layout)

def get_schema():
    return schema.Schema(
        version = "1",
        fields = [
            schema.Location(
                id = "location",
                name = "Location",
                desc = "Centre of the radar scope.",
                icon = "locationDot",
            ),
            schema.Text(
                id = "label",
                name = "Label",
                desc = "Up to 4 characters, e.g. PHX.",
                icon = "text",
                default = "PHX",
            ),
            schema.Text(
                id = "elevation",
                name = "Field elevation (ft)",
                desc = "Used for the low-traffic alert.",
                icon = "gauge",
                default = "1135",
            ),
            schema.Dropdown(
                id = "range",
                name = "Range",
                desc = "Scope radius in nautical miles.",
                icon = "arrowsMaximize",
                default = "20",
                options = [schema.Option(display = "%d nm" % r, value = str(r)) for r in (5, 10, 15, 20, 30, 40)],
            ),
            schema.Dropdown(
                id = "layout",
                name = "Layout",
                desc = "Wide fills the display; compact is a round scope.",
                icon = "eye",
                default = "compact",
                options = [
                    schema.Option(display = "Wide", value = "wide"),
                    schema.Option(display = "Compact", value = "compact"),
                ],
            ),
            schema.Toggle(
                id = "demo",
                name = "Demo traffic",
                desc = "Show simulated aircraft instead of live data.",
                icon = "eye",
                default = False,
            ),
        ],
    )
