export { LEMPO_EFFECT_VERSION, SHAPE_ORDER, EASINGS, LempoEffectError, parseLempoEffect, loadLempoEffectFromJsonText, serializeLempoEffect, } from "./lempo-effect.js";
export { LEMPO_RUNTIME_VERSION, MAX_PARTICLES, normalizeEffect, } from "./engine-adapter.js";
export { MAX_POOL, ParticleEngine } from "./engine.js";
export { TRAIL_JUMP, TrailStore, bakeCurve, bakeGradient, coreColor, evalKeys, flickerFactor, flooredWidth, lutColor, normTrailCfg, outerColor, parseHex6, pyRound, strideIndices, widthAt, } from "./trails.js";
