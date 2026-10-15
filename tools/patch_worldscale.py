# Patches AdvancedParticleEmitter.json (3D runtime) for GDevelop >= 5.6.284.
# Run once; re-runs are a no-op.
#
#  1. World-scale center: since 5.6.284 the layer THREE.Scene is scaled by
#     getRenderer3DInverseWorldScale() (default 0.01), so getWorldPosition()
#     returns Three.js units, not game units. The sim runs in game units
#     (children of the scaled scene render correctly), therefore the emitter
#     center is converted back with getRenderer3DWorldScale() (default 100).
#     Older engines lack the getter -> falls back to 1 (exact old behavior).
#     Without this, 3D particles collapse to ~1/10000th scale near the origin.
#  2. Trail camera: trailStrip3D mixes the camera position with game-unit
#     ribbon points, so the camera pos is converted to game units too.
#  3. Attach: particleGroup goes through layerRenderer.add3DRendererObject()
#     (falls back to threeScene.add) so layer.has3DObjects() stays true and
#     layer hide/show propagates. Removal paths already use parent.remove().
#  4. Color: setRGB() from sRGB bytes now passes THREE.SRGBColorSpace, so
#     three r152+ (ColorManagement on) converts to linear working space
#     instead of rendering washed out. Pre-r152 three ignores the 4th arg.
#     NOTE: F.writeInstance is intentionally NOT converted - its r/g/b
#     inputs already arrive linear (via numToThreeColor), and the
#     classic-mesh path stores them raw too. Converting there would apply
#     the sRGB transfer twice (verified headless: 0.2158, not 0.0383).
#  5. gdevelopVersion 5.0.0 -> >=5.6.284 (minimum engine with world scale).
#
# Anchors assert occurrence counts; modified chunks pass node --check
# (wrapped in a function since chunks contain bare `return`).
import io
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, "AdvancedParticleEmitter.json")


def _replace_once(text, old, new, what):
    assert text.count(old) == 1, "%s anchor x%d" % (what, text.count(old))
    return text.replace(old, new, 1)


def _walk(evts):
    for ev in evts or []:
        if ev.get("type") == "BuiltinCommonInstructions::JsCode":
            code = ev.get("inlineCode", [])
            text = "\n".join(code) if isinstance(code, list) else str(code)
            yield ev, text
        for r in _walk(ev.get("events", [])):
            yield r


def _chunks_of(doc, name):
    obj = [x for x in doc["eventsBasedObjects"] if x["name"] == name][0]
    hits = []
    for fn in obj.get("eventsFunctions", []):
        hits.extend(list(_walk(fn.get("events", []))))
    return hits


def main():
    with io.open(EXT, encoding="utf-8") as f:
        raw = f.read()
    if "getRenderer3DWorldScale" in raw:
        print("ALREADY-PATCHED")
        return
    doc = json.loads(raw)
    # Canonical dump must reproduce the file byte-for-byte, so the write
    # below only changes the patched lines.
    assert json.dumps(doc, ensure_ascii=False, indent=2) == raw, \
        "extension JSON is not in canonical dump form; refusing to rewrite"
    assert doc.get("gdevelopVersion") == "5.0.0", "gdevelopVersion changed?"
    doc["gdevelopVersion"] = ">=5.6.284"

    hits = _chunks_of(doc, "AvancedParticleEmitter3D")
    big = [(ev, t) for ev, t in hits if "MAIN UPDATE" in t]
    assert len(big) == 1, "3D runtime chunk x%d" % len(big)
    ev, text = big[0]

    # 1a) world scale factor, computed once at init (gameScene in scope).
    text = _replace_once(
        text,
        "    threeScene: threeScene,",
        "    threeScene: threeScene,\n"
        "    // Three.js units of getWorldPosition() vs game units: since\n"
        "    // GDevelop 5.6.284 the layer scene is scaled by the inverse\n"
        "    // world scale (default 100), so convert back to game units.\n"
        "    // Older engines lack the getter -> 1 (exact old behavior).\n"
        "    _ws3: (typeof gameScene.getRenderer3DWorldScale === \"function\")"
        " ? gameScene.getRenderer3DWorldScale() : 1,",
        "worldscale init")

    # 1b) emitter center back to game units.
    text = _replace_once(
        text,
        "// Emitter world position",
        "// Emitter center in game units (getWorldPosition is Three.js units;\n"
        "// data._ws3 converts back - see init).",
        "worldscale comment")
    text = _replace_once(
        text,
        "  cx = _wp.x; cy = -_wp.y; cz = _wp.z;",
        "  cx = _wp.x * (data._ws3 || 1);"
        " cy = -_wp.y * (data._ws3 || 1);"
        " cz = _wp.z * (data._ws3 || 1);",
        "worldscale center")

    # 3) attach through the layer renderer when available.
    text = _replace_once(
        text,
        "  threeScene.add(particleGroup);",
        "  // add3DRendererObject keeps layer.has3DObjects() true (2D+3D layers\n"
        "  // would otherwise render in 2D-only mode) and propagates layer hide.\n"
        "  if (layerRenderer.add3DRendererObject)"
        " layerRenderer.add3DRendererObject(particleGroup);\n"
        "  else threeScene.add(particleGroup);",
        "worldscale attach")

    # 4) sRGB bytes -> linear working space (three r152+ ColorManagement).
    # NOTE: writeInstance is deliberately untouched - its r/g/b inputs are
    # already linear (via numToThreeColor); converting again would double
    # the transfer. The JSON carries a clarifying comment on that line.
    text = _replace_once(
        text,
        "    t.setRGB(c.r/255, c.g/255, c.b/255); return t; };",
        "    t.setRGB(c.r/255, c.g/255, c.b/255, THREE.SRGBColorSpace); return t; };",
        "srgb numToThreeColor")
    text = _replace_once(
        text,
        "      data._previewMesh.material.color.setRGB(pcr.r/255, pcr.g/255, pcr.b/255);",
        "      data._previewMesh.material.color.setRGB(pcr.r/255, pcr.g/255, pcr.b/255, THREE.SRGBColorSpace);",
        "srgb preview")

    # 2) trail camera position to game units (ribbon points are game units).
    text = _replace_once(
        text,
        "    try { cp.setFromMatrixPosition(camera.matrixWorld); }\n"
        "    catch (e2) { cp.set(0, 0, 500); }",
        "    try { cp.setFromMatrixPosition(camera.matrixWorld); }\n"
        "    catch (e2) { cp.set(0, 0, 500); }\n"
        "    // Camera is in Three.js units; ribbon points are game units.\n"
        "    var _tws = data._ws3 || 1; cp.x *= _tws; cp.y *= -_tws; cp.z *= _tws;",
        "worldscale trailcam")

    ev["inlineCode"] = text.split("\n")

    with io.open(EXT, "w", encoding="utf-8", newline="") as f:
        f.write(json.dumps(doc, ensure_ascii=False, indent=2))

    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                     encoding="utf-8") as tf:
        tf.write("function __chk(){\n" + text + "\n}")
        tmp = tf.name
    r = subprocess.run(["node", "--check", tmp],
                       capture_output=True, text=True)
    os.unlink(tmp)
    assert r.returncode == 0, "3D chunk: " + r.stderr[-2000:]
    print("PATCHED-OK")


if __name__ == "__main__":
    sys.exit(main())
