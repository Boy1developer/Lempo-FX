import bootstrap  # noqa: F401
import particle_studio as PS

for v in ("1.0", "1.1"):
    eff = {"version": v, "type": "2d", "emitter": {"flow": 10}, "states": [
        {"duration": 1, "shape": "circle", "easing": "linear", "role": "birth"},
        {"duration": 1, "shape": "circle", "easing": "linear", "role": "death"},
    ]}
    m, warns = PS.migrate_effect(eff)
    assert m["version"] == PS.VERSION == "1.2", (v, m["version"])
    assert "material" in m["emitter"], v
    assert m["emitter"]["material"]["flipbook"]["enabled"] is False
    assert m["emitter"]["material"]["uvScroll"]["enabled"] is False
    assert m["emitter"]["material"]["softParticles"]["enabled"] is False

for pt in ("2d", "3d"):
    em = PS.default_emitter(pt)
    assert "material" in em and em["material"]["flipbook"]["columns"] >= 1

eff = {"version": "1.2", "type": "2d", "emitter": PS.default_emitter("2d"), "states": [
    {"duration": 1, "shape": "circle", "easing": "linear", "role": "birth"},
    {"duration": 1, "shape": "circle", "easing": "linear", "role": "death"},
]}
errs = PS.validate_effect(eff)
assert errs == [], errs

print("MATERIAL-FEATURES-OK")
