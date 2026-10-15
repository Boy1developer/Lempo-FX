import * as THREE from "three";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Headless GDevelop 5.6.284 world-scale regression test for
// AvancedParticleEmitter3D. Simulates the 5.6.284 renderer (layer THREE.Scene
// scaled by the inverse world scale + getRenderer3DWorldScale() == 100) with
// REAL three.js scene graph math. No WebGL context needed.
const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, "..", "AdvancedParticleEmitter.json"), "utf8"));

function fail(msg, extra) {
  console.error("FAIL: " + msg, extra ?? "");
  process.exit(1);
}

function stepChunk() {
  const obj = doc.eventsBasedObjects.find((o) => o.name === "AvancedParticleEmitter3D");
  const out = [];
  (function walk(evts) {
    for (const ev of evts || []) {
      if (ev.type === "BuiltinCommonInstructions::JsCode") {
        const code = ev.inlineCode || [];
        out.push(Array.isArray(code) ? code.join("\n") : String(code));
      }
      walk(ev.events);
    }
  })((obj.eventsFunctions || []).flatMap((f) => f.events || []));
  const big = out.find((c) => c.includes("MAIN UPDATE"));
  if (!big) fail("runtime chunk not found");
  return big;
}

// Point emitter, single gray color (no morph), fixed seed, trails on.
function scaleEffect() {
  return {
    version: "1.1", type: "3d",
    emitter: {
      flow: 60, flowMode: "rate", flowInterval: 1, maxParticles: 300,
      reservoir: 50, mode: "Infinite", reverse: false, alignDir: false,
      billboard: true, rotationMode: "speed",
      gravity: { x: 0, y: 0, z: 0 },
      emissionZone: { shape: "point", radius: 0, width: 0, height: 0, depth: 0, length: 0, mode: "Surface" },
      propagationCone: { directionX: 0, directionY: 0, directionZ: 0, spread: 360 },
      blendingMode: "Normal", seed: 7,
      trails: { enabled: true, maxPoints: 24, source: "particles", emitMode: "time", hideParticle: false },
    },
    states: [
      {
        id: "state_0", role: "birth", label: "birth", duration: 0.5,
        shape: "pyramid", easing: "linear", starPoints: 5, starInnerRatio: 0.4,
        appearance: { size: 8, sizeMax: 8, color: "#808080", opacity: 255 },
        movement: { minSpeed: 60, maxSpeed: 160 },
        customShapeRefs: [],
      },
      {
        id: "state_1", role: "death", label: "death", duration: 0.5,
        shape: "pyramid", easing: "linear", starPoints: 5, starInnerRatio: 0.4,
        appearance: { size: 8, sizeMax: 8, color: "#808080", opacity: 255 },
        movement: { minSpeed: 20, maxSpeed: 60 },
        customShapeRefs: [],
      },
    ],
  };
}

// worldScale: 100 simulates GDevelop >= 5.6.284, 1 (no getter) older engines.
function makeWorld284(effect, ox, oy, oz, worldScale) {
  const threeScene = new THREE.Scene();
  const inv = 1 / worldScale;
  if (worldScale !== 1) threeScene.scale.set(inv, -inv, inv);
  const layerGroup = new THREE.Group();
  threeScene.add(layerGroup);
  // Instance three group, placed by the engine at game units.
  const threeGroup = new THREE.Group();
  threeGroup.position.set(ox, oy, oz);
  threeScene.add(threeGroup);
  threeScene.updateMatrixWorld(true);
  let addedViaAPI = null;
  const layerRenderer = {
    getThreeScene: () => threeScene,
    getThreeCamera: () => cam,
    _threeScene: threeScene,
    _threeCamera: null,
    add3DRendererObject: (o) => { addedViaAPI = o; layerGroup.add(o); },
    remove3DRendererObject: (o) => { layerGroup.remove(o); },
  };
  const cam = new THREE.PerspectiveCamera(60, 1, 1, 6000);
  cam.position.set(ox * inv, -oy * inv, 600 * inv + oz * inv);
  cam.lookAt(ox * inv, -oy * inv, oz * inv);
  cam.updateMatrixWorld(true);
  layerRenderer._threeCamera = cam;
  const jsons = { "fx.json": effect };
  const P = {
    ParticleJSON: "fx.json", BlendingMode: "JSON", EmissionMode: "Infinite",
    CastShadow: false, ReceiveShadow: false, RenderEnabled: true,
    PreviewInEditor: false, ShowCone: false, ShowZone: false,
    SpeedMultiplier: 1, SizeMultiplier: 1, OpacityMultiplier: 1,
    OverrideGravity: false, GravityX: 0, GravityY: 0, GravityZ: 0,
    EmissionShape: "json", EmissionRadius: -1, EmissionSize2: -1,
    EmissionSize3: -1, MaxParticles: -1, Reservoir: -1, Reverse: "json",
    AlignDir: "json", Billboard: "json", RotationMode: "json",
    FlowMode: "json", FlowInterval: -1, Flow: -1,
    AtlasImage: "", ModelsGLB: "", GlbResource: "", ImageResource: "",
    DirectionY: -1, DirectionZ: -1, Spread: -1,
  };
  const get = (k, fb) => (P[k] !== undefined && P[k] !== null ? P[k] : fb);
  const object = {
    id: 1,
    getRuntimeScene: () => gameScene,
    getLayer: () => "Base layer",
    getRenderer: () => ({
      _threeGroup: threeGroup,
      get3DRendererObject: () => threeGroup,
      getRendererObject: () => null,
    }),
    getX: () => ox, getY: () => oy, getZ: () => oz,
    getRotationX: () => 0, getRotationY: () => 0,
    getElapsedTime: () => 16.7,
    _getParticleJSON: () => get("ParticleJSON", ""),
    _getBlendingMode: () => get("BlendingMode", "JSON"),
    _getEmissionMode: () => get("EmissionMode", "json"),
    _getFlow: () => get("Flow", -1),
    _getFlowMode: () => get("FlowMode", "json"),
    _getFlowInterval: () => get("FlowInterval", -1),
    _getResetEffect: () => false,
    _setResetEffect: () => {},
    _getShowCone: () => get("ShowCone", false),
    _getShowZone: () => get("ShowZone", false),
    _getRenderEnabled: () => get("RenderEnabled", true),
    _getPreviewInEditor: () => get("PreviewInEditor", false),
    _getAtlasImage: () => get("AtlasImage", ""),
    _getModelsGLB: () => get("ModelsGLB", ""),
    _getGlbResource: () => get("GlbResource", ""),
    _getImageResource: () => get("ImageResource", ""),
    _getCastShadow: () => get("CastShadow", false),
    _getReceiveShadow: () => get("ReceiveShadow", false),
    _getDirectionY: () => get("DirectionY", -1),
    _getDirectionZ: () => get("DirectionZ", -1),
    _getSpread: () => get("Spread", -1),
    _setActiveParticles: () => {},
    _getSpeedMultiplier: () => get("SpeedMultiplier", 1),
    _getSizeMultiplier: () => get("SizeMultiplier", 1),
    _getOpacityMultiplier: () => get("OpacityMultiplier", 1),
    _getEmissionShape: () => get("EmissionShape", "json"),
    _getEmissionRadius: () => get("EmissionRadius", -1),
    _getEmissionSize2: () => get("EmissionSize2", -1),
    _getEmissionSize3: () => get("EmissionSize3", -1),
    _getMaxParticles: () => get("MaxParticles", -1),
    _getReservoir: () => get("Reservoir", -1),
    _getReverse: () => get("Reverse", "json"),
    _getAlignDir: () => get("AlignDir", "json"),
    _getBillboard: () => get("Billboard", "json"),
    _getRotationMode: () => get("RotationMode", "json"),
    _getOverrideGravity: () => get("OverrideGravity", false),
    _getGravityX: () => get("GravityX", 0),
    _getGravityY: () => get("GravityY", 0),
    _getGravityZ: () => get("GravityZ", 0),
  };
  const gameScene = {
    getLayer: () => ({ getRenderer: () => layerRenderer }),
    getGame: () => ({
      getJsonManager: () => ({ getLoadedJson: (n) => jsons[n] || null }),
      getSceneStack: () => ({ getCurrentScene: () => gameScene }),
    }),
    ...(worldScale === 1 ? {} : { getRenderer3DWorldScale: () => worldScale }),
  };
  return { object, gameScene, threeScene, layerGroup, getAdded: () => addedViaAPI };
}

const src = stepChunk();
const run = new Function("objects", "THREE", src);

// ---- 5.6.284 world: emitter at game (400, 300, 50), world scale 100 ----
{
  const OX = 400, OY = 300, OZ = 50;
  const w = makeWorld284(scaleEffect(), OX, OY, OZ, 100);
  for (let f = 0; f < 90; f++) run([w.object], THREE);
  const d = w.object.__apfx3D;
  if (!d) fail("no runtime data");
  if (d._ws3 !== 100) fail("world scale not picked up", d._ws3);
  console.log("worldscale factor: OK (_ws3=100)");
  if (w.getAdded() !== d.particleGroup) fail("particleGroup not added via add3DRendererObject");
  if (d.particleGroup.parent !== w.layerGroup) fail("particleGroup parent wrong");
  console.log("attach via layer renderer: OK");
  if (!(d.particles.length > 0)) fail("no particles spawned");
  let sx = 0, sy = 0, sz = 0, bad = 0;
  for (const p of d.particles) {
    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) { bad++; continue; }
    sx += p.x; sy += p.y; sz += p.z;
  }
  if (bad) fail("NaN positions", bad);
  const n = d.particles.length;
  const dist = Math.hypot(sx / n - OX, sy / n - OY, sz / n - OZ);
  if (!(dist < 250)) fail("emitter center not in game units, mean dist", dist.toFixed(1));
  console.log("center in game units: OK mean dist=%s particles=%d", dist.toFixed(1), n);
  // instanceColor must hold LINEAR values (sRGB 0x80 -> ~0.2158), not raw 0.502.
  let found = false;
  for (const k of Object.keys(d._inst || {})) {
    const bk = d._inst[k];
    if (!bk || !bk.count || !bk.mesh.instanceColor) continue;
    const arr = bk.mesh.instanceColor.array;
    let m = 0;
    for (let i = 0; i < bk.count * 3; i += 3) m += arr[i];
    m /= bk.count;
    found = true;
    if (Math.abs(m - 0.2158) > 0.04) fail("instanceColor not linear sRGB", m.toFixed(4));
    console.log("instanceColor linear: OK bucket=%s meanR=%s", k, m.toFixed(4));
    break;
  }
  if (!found) fail("no instanced bucket with colors");
  // trails: built, drawn, finite, near the emitter.
  if (!d.trailB || !d.trailB.cfg) fail("trailB not built");
  const vis = (d.trailPool || []).filter((m) => m.visible);
  if (!vis.length) fail("no visible trail ribbons");
  for (const m of vis) {
    const pa = m.geometry.getAttribute("position").array;
    for (let i = 0; i < pa.length; i += 3) {
      if (!isFinite(pa[i]) || !isFinite(pa[i + 1]) || !isFinite(pa[i + 2])) fail("trail NaN");
      if (Math.hypot(pa[i] - OX, pa[i + 1] - OY, pa[i + 2] - OZ) > 1500) fail("trail point out of game range");
    }
  }
  console.log("trails in game units: OK ribbons=%d", vis.length);
}

// ---- old engine fallback: no world-scale getter -> ws = 1 ----
{
  const w = makeWorld284(scaleEffect(), 0, 0, 0, 1);
  for (let f = 0; f < 60; f++) run([w.object], THREE);
  const d = w.object.__apfx3D;
  if (!d) fail("fallback: no runtime data");
  if (d._ws3 !== 1) fail("fallback: _ws3 should be 1", d._ws3);
  if (!(d.particles.length > 0)) fail("fallback: no particles");
  let sx = 0, sy = 0, sz = 0;
  for (const p of d.particles) { sx += p.x; sy += p.y; sz += p.z; }
  const dist = Math.hypot(sx / d.particles.length, sy / d.particles.length, sz / d.particles.length);
  if (!(dist < 200)) fail("fallback: center drifted", dist.toFixed(1));
  console.log("old-engine fallback (ws=1): OK");
}

console.log("EXT-WORLDSCALE-OK");
