# -*- coding: utf-8 -*-
"""Build the looping README demo GIF from the browser fast preview.

Showcase (in order): 3D Fire (built-in template) -> 2D Snow (built-in
template) -> 2D Trails & Ribbons (rainbow_ribbon template). Every effect
uses a nonzero seed so the output is deterministic.

Regenerate:
    pip install playwright pillow && playwright install chromium
    python tools/make_demo_gif.py

How it works: serves the repo root over localhost and drives a freshly
assembled live page per effect (same assembly the editor performs in
open_fast_preview: preview.html template + live_bundle.js with
three/pixi/GLTFLoader inlined + boot effect, so zero network fetches).
Capture uses CDP screencast with JPEG (PNG encode backpressures the
software compositor; JPEG keeps ~11-14 fps at full width): ~4 s per
effect resampled evenly to 45 frames (~3 s at 15 fps, hard cuts between
effects). No rAF throttling - an earlier attempt to throttle rAF to 4 Hz
turned the Pixi canvas black on the trail segment, while unthrottled
capture renders all three effects correctly. The header is hidden via
CSS so the capture is pure viewport. Assembles docs/screenshots/demo.gif
with Pillow (~860 px wide, adaptive palette, under 5 MB).
preview/last_effect.json is backed up and restored; the temp live page is
deleted afterwards.
"""
import copy
import io
import json
import math
import os
import statistics
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "editor"))
import particle_studio as PS  # noqa: E402

GIF_PATH = os.path.join(ROOT, "docs", "screenshots", "demo.gif")
LAST_EFFECT = os.path.join(ROOT, "preview", "last_effect.json")
LIVE_PAGE = os.path.join(ROOT, "preview", "__demo_live.html")
WIDTH = 860
FPS = 15
SEG_FRAMES = 45  # 3 s per effect at 15 fps -> ~9 s loop
SEG_SECONDS = 4.0  # record extra (screencast ~11-14 fps), resample down evenly
SETTLE = {"fire3d": 2.5, "snow2d": 2.5, "trail2d": 3.0}
SEED = 1234
MOUSE_REV = 4.0  # one full mouse circle per take -> full ribbon ring


def template_states(tpl, ptype):
    # mirrors apply_template: templates without baked states keep the
    # current (fresh-session default birth/death) states
    key = "states2d" if ptype == "2d" else "states3d"
    if tpl.get(key):
        return copy.deepcopy(tpl[key])
    return [PS.default_state("birth", 0), PS.default_state("death", 1)]


def build_fire_3d():
    tpl = PS.TEMPLATES["Fire"]
    em = PS.default_emitter("3d")
    for k, v in tpl["3d"].items():
        if isinstance(v, dict) and isinstance(em.get(k), dict):
            em[k].update(v)
        else:
            em[k] = v
    em["seed"] = SEED
    eff = {"version": "1.1", "type": "3d", "emitter": em,
           "states": template_states(tpl, "3d")}
    return eff


def build_snow_2d():
    tpl = PS.TEMPLATES["Snow"]
    em = PS.default_emitter("2d")
    for k, v in tpl["2d"].items():
        if isinstance(v, dict) and isinstance(em.get(k), dict):
            em[k].update(v)
        else:
            em[k] = v
    em["seed"] = SEED
    eff = {"version": "1.1", "type": "2d", "emitter": em,
           "states": template_states(tpl, "2d")}
    # Snow template ships no states (fresh-session defaults are orange):
    # tint them white so the demo reads as snow
    for s in eff["states"]:
        ap = s.setdefault("appearance", {})
        if s.get("role") == "birth":
            ap["color"] = "#ffffff"
        else:
            ap["color"] = "#cfe8ff"
    return eff


def build_trail_2d():
    tpl = PS.TEMPLATES["Fire"]
    em = PS.default_emitter("2d")
    for k, v in tpl["2d"].items():
        if isinstance(v, dict) and isinstance(em.get(k), dict):
            em[k].update(v)
        else:
            em[k] = v
    em["seed"] = SEED
    with open(os.path.join(ROOT, "assets", "presets", "trails",
                            "stylized", "rainbow_ribbon.json"),
              encoding="utf-8") as f:
        trail_tpl = json.load(f)
    assert trail_tpl["id"] == "rainbow_ribbon"
    assert trail_tpl["settings"].get("source") == "emitter", \
        "demo paints emitter trails with circular mouse motion"
    assert trail_tpl["settings"].get("hideParticle") is True
    tb = PS.sanitize_trails(PS.default_trails())
    tb.update(trail_tpl["settings"])
    # demo pacing: realtime capture paints ~1 rev per segment; stretch the
    # ribbon memory so the sweep is visible (same format, tuned numbers)
    tb["lifetime"] = 3.5
    tb["maxPoints"] = 96
    em["trails"] = PS.sanitize_trails(tb)
    assert em["trails"]["lifetime"] == 3.5, "schema clamped lifetime"
    assert em["trails"]["maxPoints"] == 96, "schema clamped maxPoints"
    eff = {"version": "1.1", "type": "2d", "emitter": em,
           "states": template_states(tpl, "2d")}
    return eff


def check_effect(eff, name, want_trails):
    eff, warns = PS.migrate_effect(eff)
    assert PS.validate_effect(eff) == [], (name, warns)
    has = PS.trails_active((eff.get("emitter") or {}).get("trails"))
    assert has == want_trails, (name, has)
    assert int(eff["emitter"].get("seed") or 0) != 0, name
    return eff


def serve():
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    class QuietServer(ThreadingHTTPServer):
        def handle_error(self, request, client_address):
            pass

    srv = QuietServer(("127.0.0.1", 0),
                      partial(QuietHandler, directory=ROOT))
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def build_live_page(eff):
    # same assembly the editor performs in open_fast_preview: template +
    # bundled esm (three/pixi/GLTFLoader inlined, no network) + boot effect
    with open(os.path.join(ROOT, "preview", "preview.html"),
              encoding="utf-8") as f:
        tpl = f.read()
    with open(os.path.join(ROOT, "preview", "live_bundle.js"),
              encoding="utf-8") as f:
        bundle = f.read()
    boot = json.dumps(eff, ensure_ascii=False).replace("</", "<\\/")
    page = tpl.replace('<script type="module" src="./main.js"></script>',
                       '<script type="module">\n' + bundle +
                       "\n</script>", 1)
    page = page.replace('<script id="boot-effect" type="application/json">'
                        "</script>",
                        '<script id="boot-effect" type="application/json">'
                        + boot + "</script>", 1)
    assert page != tpl and "__previewBooted" in page
    with open(LIVE_PAGE, "w", encoding="utf-8") as f:
        f.write(page)


def capture_realtime(page, seconds, mouse_fn=None):
    """True-fps capture via CDP screencast (element screenshots are far too
    slow under software WebGL and would fast-forward the motion ~27x).
    Returns decoded PIL frames in arrival order."""
    import base64
    from PIL import Image
    got = []

    cdp = page.context.new_cdp_session(page)

    def on_frame(ev):
        got.append(base64.b64decode(ev["data"]))
        try:
            cdp.send("Page.screencastFrameAck",
                     {"sessionId": ev["sessionId"]})
        except Exception:
            pass  # session already detached at take end

    cdp.on("Page.screencastFrame", on_frame)
    cdp.send("Page.startScreencast",
             # JPEG: PNG encode backpressures the software compositor to
             # ~2-4 fps; JPEG keeps ~11-14 fps at full width. q80 keeps
             # the GIF under 5 MB (q90 sources balloon past 6 MB).
             {"format": "jpeg", "quality": 80, "everyNthFrame": 1,
              "maxWidth": 860, "maxHeight": 640})
    # NOTE: wait_for_timeout (not time.sleep) pumps the CDP connection so
    # screencast frames are dispatched while we drive the mouse.
    t0 = time.time()
    box = None
    while time.time() - t0 < seconds:
        page.wait_for_timeout(100)
        if mouse_fn:
            if box is None:
                box = page.locator("#wrap").bounding_box()
            mouse_fn(time.time() - t0, box)
    cdp.send("Page.stopScreencast")
    cdp.detach()
    assert got, "screencast delivered no frames"
    return [Image.open(io.BytesIO(b)).convert("RGB") for b in got]


def resample(frames, n):
    assert len(frames) >= n, (len(frames), n)
    idx = [round(i * (len(frames) - 1) / (n - 1)) for i in range(n)]
    return [frames[i] for i in idx]


def main():
    from playwright.sync_api import sync_playwright
    from PIL import Image

    effects = [
        ("fire3d", check_effect(build_fire_3d(), "fire3d", False),
         {"settle": SETTLE["fire3d"], "mouse": "zoom2x"}),
        ("snow2d", check_effect(build_snow_2d(), "snow2d", False),
         {"settle": SETTLE["snow2d"], "mouse": None}),
        ("trail2d", check_effect(build_trail_2d(), "trail2d", True),
         {"settle": SETTLE["trail2d"], "mouse": "circle"}),
    ]
    print("effects: " + ", ".join(
        "%s(%s)" % (n, e["type"]) for n, e, _ in effects))

    with open(LAST_EFFECT, encoding="utf-8") as f:
        backup = f.read()
    if os.path.isfile(LIVE_PAGE):
        os.remove(LIVE_PAGE)
    srv, port = serve()
    base = "http://127.0.0.1:%d/preview/__demo_live.html" % port
    frames = []
    try:
        with sync_playwright() as pw:
            webgl_ok = [False]
            for name, eff, opt in effects:
                with open(LAST_EFFECT, "w", encoding="utf-8") as f:
                    json.dump(eff, f, ensure_ascii=False)
                build_live_page(eff)
                # fresh browser per segment: software-GL state degrades
                # across page loads in one long session (later segments
                # stall at pCount 0), while isolated loads boot in ~2 s
                browser = pw.chromium.launch(args=[
                    "--enable-unsafe-swiftshader",
                    "--use-angle=swiftshader",
                ])
                try:
                    ctx = browser.new_context(
                        viewport={"width": 900, "height": 640})
                    page = ctx.new_page()
                    if not webgl_ok[0]:
                        # WebGL must work or the capture is blank shapes.
                        page.goto("about:blank")
                        probe = page.evaluate(
                            "() => !!document.createElement('canvas')"
                            ".getContext('webgl2')")
                        assert probe, "headless WebGL2 unavailable"
                        print("webgl2: OK")
                        webgl_ok[0] = True
                    wrap = page.locator("#wrap")
                    page.goto(base)
                    page.wait_for_function(
                        "window.__previewBooted === true", timeout=30000)
                    page.wait_for_function(
                        "parseInt(document.getElementById('pCount')"
                        ".textContent || '0', 10) > 0",
                        timeout=30000)
                except Exception:
                    browser.close()
                    raise
                time.sleep(opt["settle"])
                # fullscreen canvas: hide the page header so the capture is
                # pure viewport (stats/hint pills stay - part of the UI)
                page.evaluate("document.querySelector('header').style.display"
                              " = 'none';"
                              "document.getElementById('wrap').style.height"
                              " = '100vh';")
                box = wrap.bounding_box()
                cx = box["x"] + box["width"] / 2
                cy = box["y"] + box["height"] / 2
                page.mouse.move(cx, cy)
                if opt["mouse"] == "zoom2x":
                    # 3D orbit camera is far: wheel in ~2x for a full-frame flame
                    for _ in range(7):
                        page.mouse.wheel(0, -120)
                        time.sleep(0.05)
                if opt["mouse"] == "circle":
                    seg_t0 = [0.0]

                    def mouse_fn(t, box, cx=cx, cy=cy):
                        a = 2 * math.pi * (seg_t0[0] + t) / MOUSE_REV
                        page.mouse.move(cx + 180 * math.cos(a),
                                        cy + 150 * math.sin(a))
                else:
                    mouse_fn = None
                    seg_t0 = [0.0]
                # full-rate capture (~11-14 fps): extend the take until the
                # segment is full (uniform cadence throughout)
                got = []
                while len(got) < SEG_FRAMES:
                    got += capture_realtime(page, SEG_SECONDS, mouse_fn)
                    seg_t0[0] += SEG_SECONDS
                seg = resample(got, SEG_FRAMES)
                frames.extend(seg)
                print("%s: %d raw -> %d frames" % (name, len(got), len(seg)))
                browser.close()
    finally:
        with open(LAST_EFFECT, "w", encoding="utf-8") as f:
            f.write(backup)
        if os.path.isfile(LIVE_PAGE):
            os.remove(LIVE_PAGE)
        try:
            import subprocess as _sp
            # only the headless-shell test browsers (never user Chrome)
            _sp.run(["taskkill", "/F", "/IM", "headless_shell.exe"],
                    capture_output=True, timeout=15)
        except Exception:
            pass
        srv.shutdown()
    assert len(frames) == 3 * SEG_FRAMES, len(frames)

    # normalize to GIF width, verify nobody is blank
    stds = []
    norm = []
    for fr in frames:
        w, h = fr.size
        small = fr.resize((WIDTH, int(h * WIDTH / w)), Image.LANCZOS)
        px = small.resize((64, 64)).convert("L")
        stds.append(statistics.pstdev(px.tobytes()))
        norm.append(small)
    print("frame size: %dx%d, mean pixel-stddev: %.1f (min %.1f)"
          % (norm[0].size[0], norm[0].size[1],
             statistics.mean(stds), min(stds)))
    # dark scenes: a healthy frame scores ~4+; a dead canvas ~1
    assert min(stds) > 2.0, "blank frames detected"

    # adaptive palette, shrink colors until under 5 MB
    data = None
    for colors in (128, 96, 64):
        pal = [fr.quantize(colors=colors, method=Image.MEDIANCUT)
               for fr in norm]
        buf = io.BytesIO()
        pal[0].save(buf, format="GIF", save_all=True,
                    append_images=pal[1:], duration=int(1000 / FPS),
                    loop=0, optimize=True)
        data = buf.getvalue()
        print("colors=%d -> %.2f MB" % (colors, len(data) / 1e6))
        if len(data) < 5e6:
            break
    assert len(data) < 5e6, len(data)
    with open(GIF_PATH, "wb") as f:
        f.write(data)
    # file-level check: Pillow merges consecutive identical frames (summing
    # durations), so verify total loop duration + distinct frames instead
    from PIL import ImageSequence
    chk = Image.open(GIF_PATH)
    durs = [f.info.get("duration", 60) for f in ImageSequence.Iterator(chk)]
    total = sum(durs) / 1000.0
    print("gif: %d distinct frames, %.2f s loop, %dx%d, %.2f MB"
          % (len(durs), total, chk.size[0], chk.size[1], len(data) / 1e6))
    assert chk.size[0] == WIDTH, chk.size
    assert 7.5 <= total <= 10.5, total
    assert len(durs) >= 90, len(durs)
    print("wrote %s (%d logical frames, %d fps nominal, %.2f MB)"
          % (GIF_PATH, len(norm), FPS, len(data) / 1e6))
    print("DEMO-GIF-OK")


if __name__ == "__main__":
    main()
