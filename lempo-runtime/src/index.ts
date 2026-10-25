export {
  LEMPO_EFFECT_VERSION,
  SHAPE_ORDER,
  EASINGS,
  LempoEffectError,
  parseLempoEffect,
  loadLempoEffectFromJsonText,
  serializeLempoEffect,
} from "./lempo-effect.js";
export type {
  ShapeName,
  Easing,
  EffectType,
  FlowMode,
  SimMode,
  Gravity,
  EmissionZone,
  PropagationCone,
  Emitter,
  Appearance,
  Movement,
  EffectState,
  LempoEffect,
} from "./lempo-effect.js";

export {
  LEMPO_RUNTIME_VERSION,
  MAX_PARTICLES,
  normalizeEffect,
} from "./engine-adapter.js";

export { MAX_POOL, ParticleEngine } from "./engine.js";
export type { Vec2 } from "./engine.js";
export {
  TRAIL_JUMP,
  TrailStore,
  bakeCurve,
  bakeGradient,
  coreColor,
  evalKeys,
  flickerFactor,
  flooredWidth,
  lutColor,
  normTrailCfg,
  outerColor,
  parseHex6,
  pyRound,
  strideIndices,
  widthAt,
} from "./trails.js";
export type { TrailCfg, TrailKey, TrailPt } from "./trails.js";
export type {
  NormalizedKeyframe,
  NormalizedEmitter,
  NormalizedEffect,
} from "./engine-adapter.js";
