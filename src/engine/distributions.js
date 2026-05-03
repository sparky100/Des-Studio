// engine/distributions.js — Random variate samplers
//
// EXTENDING: To add a new distribution:
//   1. Add an entry to DISTRIBUTIONS below with params, label, hint, sample
//   2. It automatically appears in every distribution picker in the UI
//   3. No other changes needed anywhere in the codebase

/**
 * Mulberry32 — fast, seedable 32-bit PRNG.
 * Returns a function that produces values in [0, 1) from a fixed seed.
 * Every call to mulberry32(seed) starts an independent identical sequence.
 */
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const DISTRIBUTIONS = {
  Fixed: {
    params: ["value"],
    label:  "Fixed",
    hint:   "Always exactly this value",
    sample: (p) => Math.max(0, parseFloat(p.value) || 0),
  },
  Uniform: {
    params: ["min", "max"],
    label:  "Uniform(min, max)",
    hint:   "Equal chance across [min, max]",
    sample: (p, rng) => {
      const lo = parseFloat(p.min) || 0, hi = parseFloat(p.max) || 1;
      return lo + rng() * (hi - lo);
    },
  },
  Exponential: {
    params: ["mean"],
    label:  "Exponential(mean)",
    hint:   "Memoryless — classic inter-arrival time",
    sample: (p, rng) => {
      const m = parseFloat(p.mean) || 1;
      return -m * Math.log(Math.max(1e-15, 1 - rng()));
    },
  },
  Normal: {
    params: ["mean", "stddev"],
    label:  "Normal(μ, σ)",
    hint:   "Bell curve, clipped at 0",
    sample: (p, rng) => {
      const m = parseFloat(p.mean) || 1, s = parseFloat(p.stddev) || 0.2;
      const u1 = rng(), u2 = rng();
      return Math.max(0, m + s * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
    },
  },
  Triangular: {
    params: ["min", "mode", "max"],
    label:  "Triangular(min, mode, max)",
    hint:   "Best / likely / worst case estimate",
    sample: (p, rng) => {
      const a = parseFloat(p.min) || 0, c = parseFloat(p.mode) || 0.5, b = parseFloat(p.max) || 1;
      const u = rng(), fc = (c - a) / (b - a);
      return u < fc
        ? a + Math.sqrt(u * (b - a) * (c - a))
        : b - Math.sqrt((1 - u) * (b - a) * (b - c));
    },
  },
  Erlang: {
    params: ["k", "mean"],
    label:  "Erlang(k, mean)",
    hint:   "k-phase service process",
    sample: (p, rng) => {
      const k = Math.max(1, Math.round(parseFloat(p.k) || 1)), m = parseFloat(p.mean) || 1;
      let prod = 1;
      for (let i = 0; i < k; i++) prod *= rng();
      return -Math.log(Math.max(1e-15, prod)) / (k / m);
    },
  },
  ServerAttr: {
    params: ["attr"],
    label:  "Server attribute",
    hint:   "Read named attribute from matched server entity",
    sample: (p, _rng, serverAttrs) => {
      const v = serverAttrs?.[p.attr || "serviceTime"];
      return Math.max(0, parseFloat(v) || 1);
    },
  },
};

/**
 * Sample a delay value from a named distribution.
 * @param {string} dist - Distribution name (key of DISTRIBUTIONS)
 * @param {object} params - Distribution parameters (string values from UI)
 * @param {function} rng - Seeded PRNG (defaults to mulberry32(0) — pass buildEngine's rng for reproducibility)
 * @param {object|null} serverAttrs - Server entity attributes (for ServerAttr)
 */
export function sample(dist, params = {}, rng = mulberry32(0), serverAttrs = null) {
  const def = DISTRIBUTIONS[dist];
  if (!def) return parseFloat(params.value) || 0;
  return def.sample(params, rng, serverAttrs);
}

/**
 * Sample all attrDefs for a new entity instance.
 * attrDefs: array of { name, dist, distParams } OR legacy string "k=v,k2=v2"
 */
export function sampleAttrs(attrDefs, rng = mulberry32(0)) {
  if (!attrDefs) return {};
  // Legacy string format
  if (typeof attrDefs === "string") {
    const o = {};
    attrDefs.split(",").forEach(p => {
      const [k, v] = (p || "").split("=").map(x => x.trim());
      if (!k) return;
      const n = parseFloat(v);
      o[k] = isNaN(n) ? v : n;
    });
    return o;
  }
  // New array format
  if (Array.isArray(attrDefs)) {
    const o = {};
    attrDefs.forEach(a => {
      if (!a.name) return;
      o[a.name] = sample(a.dist || "Fixed", a.distParams || { value: "0" }, rng);
    });
    return o;
  }
  return {};
}

