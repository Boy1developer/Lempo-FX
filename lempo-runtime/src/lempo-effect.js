/**
 * Lempo particle effect schema — typed loader for the GDevelop GDJS runtime.
 *
 * Mirrors the v1.1 export format produced by Lempo Particle Editor
 * (see `sample_effect.json`) and consumed by `AdvancedParticleEmitter`
 * (`2d: needShape` / `3d: mesh swap`, hyphenated easing).
 *
 * The GDevelop GDJS runtime is TypeScript (PixiJS 2D / Three.js 3D), so this
 * package is the ingestion path: strict `tsc` types + validation at the
 * boundary, zero `any` leaking into engine code.
 */
export const LEMPO_EFFECT_VERSION = "1.2";
export const SHAPE_ORDER = [
    "circle",
    "square",
    "triangle",
    "star",
    "diamond",
    "line",
    "custom",
    "sphere",
    "cube",
    "pyramid",
    "torus",
    "billboard",
];
export const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out"];
export class LempoEffectError extends Error {
    constructor(message) {
        super(`LempoEffect: ${message}`);
        this.name = "LempoEffectError";
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Finite number or fallback — one bad field must never poison the sim with NaN. */
function finite(value, fallback) {
    const n = typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : NaN;
    return Number.isFinite(n) ? n : fallback;
}
function text(value, fallback) {
    return typeof value === "string" && value.length > 0 ? value : fallback;
}
function flag(value) {
    return value === true;
}
function parseEasing(value) {
    const key = String(value ?? "linear")
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, "-");
    const found = EASINGS.includes(key) ? key : "linear";
    return found;
}
function parseShape(value, fallback) {
    const key = String(value ?? fallback)
        .trim()
        .toLowerCase();
    const found = SHAPE_ORDER.includes(key) ? key : fallback;
    return found;
}
function parseType(value) {
    return String(value ?? "2d").trim().toLowerCase() === "3d" ? "3d" : "2d";
}
function parseFlowMode(value) {
    return String(value ?? "rate").trim().toLowerCase() === "burst" ? "burst" : "rate";
}
function parseSimMode(value) {
    const key = String(value ?? "Infinite").trim().toLowerCase();
    if (key === "burst")
        return "Burst";
    if (key === "one shot" || key === "oneshot" || key === "one-shot")
        return "One Shot";
    return "Infinite";
}
function parseColor(value, fallback) {
    const raw = text(value, fallback);
    if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw))
        return raw;
    return fallback;
}
function parseEmitter(raw) {
    const r = isRecord(raw) ? raw : {};
    const g = isRecord(r["gravity"]) ? r["gravity"] : {};
    const z = isRecord(r["emissionZone"]) ? r["emissionZone"] : {};
    const c = isRecord(r["propagationCone"])
        ? r["propagationCone"]
        : {};
    return {
        flow: Math.max(0, finite(r["flow"], 40)),
        flowMode: parseFlowMode(r["flowMode"]),
        flowInterval: Math.max(0, finite(r["flowInterval"], 1)),
        maxParticles: Math.min(4000, Math.max(1, Math.floor(finite(r["maxParticles"], 300)))),
        reservoir: Math.max(0, Math.floor(finite(r["reservoir"], 50))),
        mode: parseSimMode(r["mode"]),
        reverse: flag(r["reverse"]),
        alignDir: flag(r["alignDir"]),
        rotationMode: text(r["rotationMode"], "speed"),
        gravity: {
            x: finite(g["x"], 0),
            y: finite(g["y"], 0),
            z: finite(g["z"], 0),
        },
        emissionZone: {
            shape: text(z["shape"], "Circle"),
            rotation: finite(z["rotation"], 0),
            radius: Math.max(0, finite(z["radius"], 50)),
            width: Math.max(0, finite(z["width"], 100)),
            height: Math.max(0, finite(z["height"], 60)),
            length: Math.max(0, finite(z["length"], 100)),
            depth: Math.max(0, finite(z["depth"], 60)),
            mode: text(z["mode"], "Surface"),
            showZone: flag(z["showZone"]),
        },
        propagationCone: {
            direction: finite(c["direction"], 270),
            directionY: finite(c["directionY"], 0),
            spread: Math.max(0, Math.min(360, finite(c["spread"], 60))),
            showCone: flag(c["showCone"]),
        },
        blendingMode: text(r["blendingMode"], "Normal"),
    };
}
function parseState(raw, index, is3D) {
    if (!isRecord(raw)) {
        throw new LempoEffectError(`states[${index}] must be an object`);
    }
    const ap = isRecord(raw["appearance"]) ? raw["appearance"] : {};
    const mv = isRecord(raw["movement"]) ? raw["movement"] : {};
    const fallbackShape = is3D ? "sphere" : "circle";
    const minSpeed = Math.max(0, finite(mv["minSpeed"], 0));
    return {
        id: text(raw["id"], `state_${index}`),
        role: text(raw["role"], index === 0 ? "birth" : "death"),
        label: text(raw["label"], index === 0 ? "birth" : "death"),
        duration: Math.max(1e-6, finite(raw["duration"], 0.5)),
        shape: parseShape(raw["shape"], fallbackShape),
        easing: parseEasing(raw["easing"]),
        starPoints: Math.max(3, Math.floor(finite(raw["starPoints"], 5))),
        starInnerRatio: Math.max(0.05, Math.min(0.95, finite(raw["starInnerRatio"], 0.4))),
        appearance: {
            size: Math.max(0, finite(ap["size"], 8)),
            sizeMax: Math.max(0, finite(ap["sizeMax"], finite(ap["size"], 8))),
            color: parseColor(ap["color"], "#ffffff"),
            opacity: Math.max(0, Math.min(255, finite(ap["opacity"], 255))),
        },
        movement: {
            minSpeed,
            maxSpeed: Math.max(minSpeed, finite(mv["maxSpeed"], minSpeed)),
            minRot: finite(mv["minRot"], -90),
            maxRot: finite(mv["maxRot"], 90),
        },
        customShapeRefs: Array.isArray(raw["customShapeRefs"])
            ? raw["customShapeRefs"].filter((v) => typeof v === "string")
            : [],
    };
}
/**
 * Validate + normalize unknown input into a typed effect.
 * Throws LempoEffectError on structural problems (not an object,
 * missing/empty states array, malformed JSON handled by the caller below).
 */
export function parseLempoEffect(data) {
    if (!isRecord(data)) {
        throw new LempoEffectError("effect must be a JSON object");
    }
    const type = parseType(data["type"]);
    const is3D = type === "3d";
    if (!Array.isArray(data["states"]) || data["states"].length === 0) {
        throw new LempoEffectError("effect.states must be a non-empty array");
    }
    const states = data["states"].map((s, i) => parseState(s, i, is3D));
    return {
        version: text(data["version"], LEMPO_EFFECT_VERSION),
        type,
        emitter: parseEmitter(data["emitter"]),
        states,
    };
}
/** Parse raw JSON text (file content / fetch body) into a typed effect. */
export function loadLempoEffectFromJsonText(jsonText) {
    let data;
    try {
        data = JSON.parse(jsonText);
    }
    catch {
        throw new LempoEffectError("invalid JSON text");
    }
    return parseLempoEffect(data);
}
/** Serialize back to the v1.1 JSON shape the editor and engine share. */
export function serializeLempoEffect(effect) {
    return JSON.stringify(effect);
}
