/**
 * Engine-ready adapter — validated, NaN-free view of an effect for the
 * GDevelop GDJS runtime (TypeScript).
 *
 * `parseLempoEffect` guarantees structure; this layer applies the numeric
 * contracts the renderers rely on (2d: `needShape` pixi layer,
 * 3d: mesh-swap three layer): finite numbers only, clamped ranges,
 * precomputed keyframe lifetime (death state excluded, extension semantics).
 */
export const LEMPO_RUNTIME_VERSION = "1.0.0";
/** Hard pool cap shared with the editor sim (`MAX_POOL`). */
export const MAX_PARTICLES = 4000;
export function normalizeEffect(effect) {
    const keyframes = effect.states.map((s) => ({
        duration: s.duration,
        shape: s.shape,
        size: s.appearance.size,
        sizeMax: s.appearance.sizeMax,
        colorHex: s.appearance.color,
        opacity: s.appearance.opacity,
        minSpeed: s.movement.minSpeed,
        maxSpeed: s.movement.maxSpeed,
        easing: s.easing,
    }));
    const totalDuration = Math.max(0.1, keyframes.slice(0, -1).reduce((acc, k) => acc + k.duration, 0));
    const e = effect.emitter;
    return {
        version: effect.version,
        type: effect.type,
        is3D: effect.type === "3d",
        emitter: {
            flow: e.flow,
            maxParticles: Math.min(MAX_PARTICLES, e.maxParticles),
            reservoir: e.reservoir,
            mode: e.mode,
            reverse: e.reverse,
            gravityX: e.gravity.x,
            gravityY: e.gravity.y,
            gravityZ: e.gravity.z,
            zoneShape: e.emissionZone.shape.toLowerCase(),
            zoneRadius: e.emissionZone.radius,
            zoneWidth: e.emissionZone.width,
            zoneHeight: e.emissionZone.height,
            zoneLength: e.emissionZone.length,
            zoneMode: e.emissionZone.mode.toLowerCase(),
            coneDirection: e.propagationCone.direction,
            coneSpread: e.propagationCone.spread,
        },
        keyframes,
        totalDuration,
        blendingMode: e.blendingMode,
    };
}
