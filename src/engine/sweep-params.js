// @ts-check
// sweep-params.js — Enumerate sweepable model parameters and apply values
// No React, no DOM. Pure JS — can run in workers.

import { periodLabel } from "./schedule-pattern.js";
import { mulberry32, deriveSubSeed } from "./distributions.js";

/** @param {any} obj */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** @type {Record<string, string>} */
const PARAM_LABELS = {
  mean: "mean", rate: "rate (λ)", lambda: "rate (λ)",
  alpha: "shape (α)", beta: "scale (β)", min: "minimum", max: "maximum",
  sd: "standard deviation", sigma: "standard deviation", p: "probability",
  n: "n", k: "k", mu: "mean (μ)",
};

/** @param {string} key */
function humanParamKey(key) {
  return PARAM_LABELS[key] ?? key;
}

/** @param {any} dist */
function isPiecewise(dist) {
  return typeof dist === "string" && dist.toLowerCase() === "piecewise";
}

/** @param {Record<string, any>} model */
export function enumerateSweepableParams(model) {
  /** @type {any[]} */
  const params = [];

  // 1a. Entity type count — only for servers WITHOUT a shift schedule or a
  // weekly schedulePattern (both override count with a time-varying
  // capacity at runtime — see engine/index.js's server-entityTypes map,
  // which unconditionally replaces `count` with the pattern's initial
  // capacity — so sweeping `count` on either would be a silent no-op).
  for (const et of (model.entityTypes || [])) {
    if (et.role !== "server") continue;
    if (Array.isArray(et.shiftSchedule) && et.shiftSchedule.length > 0) continue;
    if (et.schedulePattern?.periods?.length) continue;
    params.push({
      type: "entityTypeCount",
      targetId: et.id,
      label: `Number of ${et.name}`,
      description: `How many ${et.name} servers are available`,
      currentValue: parseInt(et.count, 10) || 0,
      path: `entityTypes.${et.id}.count`,
    });
  }

  // 1b. Shift schedule capacities — servers WITH a shift schedule
  for (const et of (model.entityTypes || [])) {
    if (et.role !== "server") continue;
    if (!Array.isArray(et.shiftSchedule) || !et.shiftSchedule.length) continue;
    et.shiftSchedule.forEach((/** @type {any} */ period, /** @type {number} */ pi) => {
      const time = period.time ?? period.startTime ?? 0;
      const timeUnit = model.timeUnit ?? "minute";
      params.push({
        type: "shiftCapacity",
        targetId: et.id,
        periodIndex: pi,
        label: `${et.name} — shift ${pi + 1} capacity`,
        subLabel: `from ${timeUnit} ${time}`,
        description: `Number of ${et.name} available from time ${time}`,
        currentValue: parseInt(period.capacity, 10) || 0,
        path: `entityTypes.${et.id}.shiftSchedule[${pi}].capacity`,
      });
    });
  }

  // 1c. Weekly schedulePattern capacities — servers WITH a recurring
  // weekly pattern (a second, separate way to express time-varying
  // capacity — see 1a's comment). "multiplier" mode has one scalar
  // (baseCapacity) that scales every period proportionally; "absolute"
  // mode (the default) needs one param per period, mirroring 1b's
  // one-param-per-shift convention exactly.
  for (const et of (model.entityTypes || [])) {
    if (et.role !== "server") continue;
    const pattern = et.schedulePattern;
    if (!pattern?.periods?.length) continue;
    if ((pattern.mode || "absolute") === "multiplier") {
      params.push({
        type: "schedulePatternBaseCapacity",
        targetId: et.id,
        label: `${et.name} — base capacity (weekly pattern)`,
        description: `Base capacity the weekly pattern's per-period multipliers scale from for ${et.name}`,
        currentValue: parseFloat(pattern.baseCapacity) || 0,
        path: `entityTypes.${et.id}.schedulePattern.baseCapacity`,
      });
      continue;
    }
    pattern.periods.forEach((/** @type {any} */ period, /** @type {number} */ pi) => {
      params.push({
        type: "schedulePatternPeriodCapacity",
        targetId: et.id,
        periodIndex: pi,
        label: `${et.name} — ${periodLabel(period)} capacity`,
        description: `Number of ${et.name} available ${periodLabel(period)}`,
        currentValue: parseInt(period.capacity, 10) || 0,
        path: `entityTypes.${et.id}.schedulePattern.periods[${pi}].capacity`,
      });
    });
    if (pattern.defaultCapacity != null) {
      params.push({
        type: "schedulePatternDefaultCapacity",
        targetId: et.id,
        label: `${et.name} — default capacity (outside scheduled periods)`,
        description: `Number of ${et.name} available outside any scheduled period`,
        currentValue: parseInt(pattern.defaultCapacity, 10) || 0,
        path: `entityTypes.${et.id}.schedulePattern.defaultCapacity`,
      });
    }
  }

  // 2. Queue capacity
  for (const q of (model.queues || [])) {
    params.push({
      type: "queueCapacity",
      targetId: q.id,
      label: `${q.name} — maximum capacity`,
      description: `Maximum number of customers in ${q.name}`,
      currentValue: q.capacity === "" ? Infinity : parseInt(q.capacity, 10) || 0,
      path: `queues.${q.id}.capacity`,
    });
  }

  // 3. B-Event distribution parameters
  for (const b of (model.bEvents || [])) {
    (b.schedules || []).forEach((/** @type {any} */ s, /** @type {number} */ si) => {
      if (!s.distParams) return;
      if (isPiecewise(s.dist)) {
        // Enumerate each period's inner distribution params
        (s.distParams.periods || []).forEach((/** @type {any} */ period, /** @type {number} */ pi) => {
          const inner = period.distribution || period;
          const startTime = period.startTime ?? period.time ?? 0;
          const timeUnit = model.timeUnit ?? "minute";
          for (const [paramKey, paramValue] of Object.entries(inner.distParams || {})) {
            params.push({
              type: "bEventPiecewisePeriodParam",
              targetId: b.id,
              scheduleIndex: si,
              periodIndex: pi,
              paramKey,
              label: `${b.name} — period ${pi + 1} ${humanParamKey(paramKey)}`,
              subLabel: `from ${timeUnit} ${startTime}`,
              description: `'${paramKey}' for period ${pi + 1} of piecewise distribution on '${b.name}'`,
              currentValue: parseFloat(paramValue) || 0,
              path: `bEvents.${b.id}.schedules[${si}].distParams.periods[${pi}].distribution.distParams.${paramKey}`,
            });
          }
        });
      } else {
        for (const [paramKey, paramValue] of Object.entries(s.distParams)) {
          params.push({
            type: "bEventDistParam",
            targetId: b.id,
            parentLabel: b.name,
            paramKey,
            label: `${b.name} — ${humanParamKey(paramKey)}`,
            description: `Distribution parameter '${paramKey}' of B-Event '${b.name}'`,
            currentValue: parseFloat(paramValue) || 0,
            path: `bEvents.${b.id}.schedules.distParams.${paramKey}`,
          });
        }
      }
    });
  }

  // 4. C-Event distribution parameters
  for (const c of (model.cEvents || [])) {
    (c.cSchedules || []).forEach((/** @type {any} */ s, /** @type {number} */ si) => {
      if (!s.distParams) return;
      if (isPiecewise(s.dist)) {
        (s.distParams.periods || []).forEach((/** @type {any} */ period, /** @type {number} */ pi) => {
          const inner = period.distribution || period;
          const startTime = period.startTime ?? period.time ?? 0;
          const timeUnit = model.timeUnit ?? "minute";
          for (const [paramKey, paramValue] of Object.entries(inner.distParams || {})) {
            params.push({
              type: "cEventPiecewisePeriodParam",
              targetId: c.id,
              scheduleIndex: si,
              periodIndex: pi,
              paramKey,
              label: `${c.name} — period ${pi + 1} ${humanParamKey(paramKey)}`,
              subLabel: `from ${timeUnit} ${startTime}`,
              description: `'${paramKey}' for period ${pi + 1} of piecewise distribution on '${c.name}'`,
              currentValue: parseFloat(paramValue) || 0,
              path: `cEvents.${c.id}.cSchedules[${si}].distParams.periods[${pi}].distribution.distParams.${paramKey}`,
            });
          }
        });
      } else {
        for (const [paramKey, paramValue] of Object.entries(s.distParams)) {
          params.push({
            type: "cEventDistParam",
            targetId: c.id,
            parentLabel: c.name,
            paramKey,
            label: `${c.name} — ${humanParamKey(paramKey)}`,
            description: `Distribution parameter '${paramKey}' of C-Event '${c.name}'`,
            currentValue: parseFloat(paramValue) || 0,
            path: `cEvents.${c.id}.cSchedules.distParams.${paramKey}`,
          });
        }
      }
    });
  }

  // 5. State variable initial values
  for (const sv of (model.stateVariables || [])) {
    params.push({
      type: "stateVarInit",
      targetId: sv.name,
      label: `${sv.name} — starting value`,
      description: `Initial value of state variable '${sv.name}'`,
      currentValue: parseFloat(sv.initialValue) || 0,
      path: `stateVariables.${sv.name}.initialValue`,
    });
  }

  // 6. Container capacity and initial level
  for (const ct of (model.containerTypes || [])) {
    if (!ct.id) continue;
    params.push({
      type: "containerCapacity",
      targetId: ct.id,
      label: `${ct.id} — capacity`,
      description: `Maximum level of container '${ct.id}' (blank = unbounded)`,
      currentValue: ct.capacity == null || ct.capacity === "" ? Infinity : parseFloat(ct.capacity) || 0,
      path: `containerTypes.${ct.id}.capacity`,
    });
    params.push({
      type: "containerInitialLevel",
      targetId: ct.id,
      label: `${ct.id} — initial level`,
      description: `Starting level of container '${ct.id}'`,
      currentValue: parseFloat(ct.initialLevel) || 0,
      path: `containerTypes.${ct.id}.initialLevel`,
    });
  }

  return params;
}

/**
 * @param {Record<string, any>} model
 * @param {Record<string, any>} paramConfig
 * @param {number} value
 */
export function applySweepValue(model, paramConfig, value) {
  return applySweepValues(model, [{ paramConfig, value }]);
}

/**
 * @param {Record<string, any>} model
 * @param {Array<{ paramConfig: Record<string, any>, value: number }>} [sweepConfigs]
 */
export function applySweepValues(model, sweepConfigs = []) {
  let clone = deepClone(model);

  for (const { paramConfig, value } of sweepConfigs) {
    switch (paramConfig.type) {
      case "entityTypeCount": {
        const et = (clone.entityTypes || []).find((/** @type {any} */ e) => e.id === paramConfig.targetId);
        if (et) et.count = String(Math.max(0, Math.round(value)));
        break;
      }
      case "shiftCapacity": {
        const et = (clone.entityTypes || []).find((/** @type {any} */ e) => e.id === paramConfig.targetId);
        const period = et?.shiftSchedule?.[paramConfig.periodIndex];
        if (period) period.capacity = String(Math.max(1, Math.round(value)));
        break;
      }
      case "schedulePatternBaseCapacity": {
        const et = (clone.entityTypes || []).find((/** @type {any} */ e) => e.id === paramConfig.targetId);
        if (et?.schedulePattern) et.schedulePattern.baseCapacity = value;
        break;
      }
      case "schedulePatternPeriodCapacity": {
        const et = (clone.entityTypes || []).find((/** @type {any} */ e) => e.id === paramConfig.targetId);
        const period = et?.schedulePattern?.periods?.[paramConfig.periodIndex];
        // 0 is a legitimate "closed" capacity for a scheduled period, unlike
        // shiftCapacity's min-1 floor above.
        if (period) period.capacity = Math.max(0, Math.round(value));
        break;
      }
      case "schedulePatternDefaultCapacity": {
        const et = (clone.entityTypes || []).find((/** @type {any} */ e) => e.id === paramConfig.targetId);
        if (et?.schedulePattern) et.schedulePattern.defaultCapacity = Math.max(0, Math.round(value));
        break;
      }
      case "queueCapacity": {
        const q = (clone.queues || []).find((/** @type {any} */ q) => q.id === paramConfig.targetId);
        if (q) {
          q.capacity = value === Infinity || value <= 0 ? "" : String(Math.round(value));
        }
        break;
      }
      case "bEventDistParam": {
        const b = (clone.bEvents || []).find((/** @type {any} */ e) => e.id === paramConfig.targetId);
        if (b) {
          for (const s of (b.schedules || [])) {
            if (s.distParams && paramConfig.paramKey in s.distParams) {
              s.distParams[paramConfig.paramKey] = String(Math.max(0.001, value));
            }
          }
        }
        break;
      }
      case "bEventPiecewisePeriodParam": {
        const b = (clone.bEvents || []).find((/** @type {any} */ e) => e.id === paramConfig.targetId);
        const period = b?.schedules?.[paramConfig.scheduleIndex]?.distParams?.periods?.[paramConfig.periodIndex];
        if (period) {
          const inner = period.distribution || period;
          if (!inner.distParams) inner.distParams = {};
          inner.distParams[paramConfig.paramKey] = String(Math.max(0.001, value));
        }
        break;
      }
      case "cEventDistParam": {
        const c = (clone.cEvents || []).find((/** @type {any} */ e) => e.id === paramConfig.targetId);
        if (c) {
          for (const s of (c.cSchedules || [])) {
            if (s.distParams && paramConfig.paramKey in s.distParams) {
              s.distParams[paramConfig.paramKey] = String(Math.max(0.001, value));
            }
          }
        }
        break;
      }
      case "cEventPiecewisePeriodParam": {
        const c = (clone.cEvents || []).find((/** @type {any} */ e) => e.id === paramConfig.targetId);
        const period = c?.cSchedules?.[paramConfig.scheduleIndex]?.distParams?.periods?.[paramConfig.periodIndex];
        if (period) {
          const inner = period.distribution || period;
          if (!inner.distParams) inner.distParams = {};
          inner.distParams[paramConfig.paramKey] = String(Math.max(0.001, value));
        }
        break;
      }
      case "stateVarInit": {
        const sv = (clone.stateVariables || []).find((/** @type {any} */ s) => s.name === paramConfig.targetId);
        if (sv) sv.initialValue = String(value);
        break;
      }
      case "containerCapacity": {
        const ct = (clone.containerTypes || []).find((/** @type {any} */ c) => c.id === paramConfig.targetId);
        if (ct) {
          ct.capacity = value === Infinity || value <= 0 ? null : Math.round(value);
        }
        break;
      }
      case "containerInitialLevel": {
        const ct = (clone.containerTypes || []).find((/** @type {any} */ c) => c.id === paramConfig.targetId);
        if (ct) ct.initialLevel = Math.max(0, Math.round(value));
        break;
      }
    }
  }

  return clone;
}

// Types whose applySweepValues() case rounds the value to an integer before
// writing it back onto the model (server/queue/container counts and
// capacities — all discrete quantities). Everything else (distribution
// parameters, schedulePattern.baseCapacity, state variable initial values)
// is written as-is and may be fractional. Kept here, next to
// applySweepValues() above, as the single source of truth for "is this
// parameter discrete?" — sampleLatinHypercube() below uses it to round
// sampled values onto the integer lattice for these types.
const INTEGER_PARAM_TYPES = new Set([
  "entityTypeCount", "shiftCapacity", "schedulePatternPeriodCapacity",
  "schedulePatternDefaultCapacity", "queueCapacity", "containerCapacity",
  "containerInitialLevel",
]);

/** @param {string} type */
export function isIntegerParamType(type) {
  return INTEGER_PARAM_TYPES.has(type);
}

// A Study's total simulation cost is (points x replicationsPerPoint) —
// this is the number that actually matters for compute/wall-clock budget,
// not the raw point count alone. Replaces the old flat "50 points" cap
// (which applied to points alone, regardless of plan type or replications).
export const MAX_STUDY_REPLICATIONS = 2000;

/**
 * @param {number} totalPoints
 * @param {number} replicationsPerPoint
 * @param {number} [maxTotal]
 */
export function checkStudyBudget(totalPoints, replicationsPerPoint, maxTotal = MAX_STUDY_REPLICATIONS) {
  const reps = Math.max(1, Math.round(replicationsPerPoint) || 1);
  const total = totalPoints * reps;
  if (total > maxTotal) {
    throw new Error(
      `This plan would run ${total.toLocaleString()} replications ` +
      `(${totalPoints.toLocaleString()} points x ${reps.toLocaleString()} replications each), ` +
      `exceeding the ${maxTotal.toLocaleString()}-replication budget. ` +
      `Reduce the number of points, replications per point, or both.`
    );
  }
}

/** @param {number} min @param {number} max @param {number} step */
function rawSweepValues(min, max, step) {
  if (Math.abs(max - min) < 1e-9) return [min];
  const values = [];
  const nSteps = Math.floor((max - min) / step);
  for (let i = 0; i <= nSteps; i++) {
    values.push(+(min + i * step).toFixed(6));
  }
  return values;
}

// replicationsPerPoint is used only for the budget check (default 1, i.e.
// points alone must stay under the budget).
/**
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {number} [replicationsPerPoint]
 * @throws if the resulting points x replicationsPerPoint would exceed MAX_STUDY_REPLICATIONS
 */
export function generateSweepValues(min, max, step, replicationsPerPoint = 1) {
  const values = rawSweepValues(min, max, step);
  checkStudyBudget(values.length, replicationsPerPoint);
  return values;
}

/**
 * Generate a cartesian product of two 1D sweep ranges.
 *
 * @param {{ min: number, max: number, step: number }} rangeA
 * @param {{ min: number, max: number, step: number }} rangeB
 * @param {number} [replicationsPerPoint]
 * @returns {Array<{ valueA: number, valueB: number }>} cartesian product pairs
 * @throws if total grid points x replicationsPerPoint would exceed MAX_STUDY_REPLICATIONS
 */
export function generate2DSweepValues(rangeA, rangeB, replicationsPerPoint = 1) {
  const valuesA = rawSweepValues(rangeA.min, rangeA.max, rangeA.step);
  const valuesB = rawSweepValues(rangeB.min, rangeB.max, rangeB.step);
  const total = valuesA.length * valuesB.length;
  checkStudyBudget(total, replicationsPerPoint);

  const pairs = [];
  for (const valueA of valuesA) {
    for (const valueB of valuesB) {
      pairs.push({ valueA, valueB });
    }
  }
  return pairs;
}

/**
 * Latin hypercube sample over N sweepable parameters — a Study's "sampled"
 * plan type. Stratifies each dimension into `points` equal-width strata (no
 * two points share a stratum on any dimension) and draws one point per
 * stratum with a seeded jitter, so points spread evenly across the full
 * range rather than clustering the way independent uniform draws would.
 *
 * Deterministic from baseSeed: derives its own PRNG stream (via
 * deriveSubSeed) so it never shares state with, or is correlated with, the
 * per-replication seeds (baseSeed + i) the same Study run also uses. No
 * Math.random() anywhere — mulberry32 only, per AGENTS.md's seeded-RNG rule.
 *
 * @param {Array<{ path: string, label?: string, type?: string, range?: { min: number, max: number } }>} parameters
 * @param {{ points?: number, baseSeed?: number }} [options]
 * @returns {Array<{ params: Array<{ path: string, value: number }> }>}
 */
export function sampleLatinHypercube(parameters, { points, baseSeed = 0 } = {}) {
  if (!Array.isArray(parameters) || parameters.length === 0) {
    throw new Error("sampleLatinHypercube requires at least one parameter.");
  }
  const n = Math.round(points ?? NaN);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("sampleLatinHypercube requires at least 1 point.");
  }
  for (const p of parameters) {
    if (!p.range || !Number.isFinite(p.range.min) || !Number.isFinite(p.range.max)) {
      throw new Error(`Parameter '${p.label || p.path}' is missing a valid range for a sampled study.`);
    }
  }

  const rng = mulberry32(deriveSubSeed(baseSeed, "study:lhs"));

  // Per-dimension stratified permutation + within-stratum jitter — the
  // standard LHS construction. Each dimension gets its own independent
  // permutation, so pairing across dimensions is randomised (not just the
  // within-stratum position), avoiding the "diagonal" correlation a shared
  // permutation would introduce.
  const perDimensionValues = parameters.map(param => {
    const permutation = Array.from({ length: n }, (_, i) => i);
    // Fisher-Yates shuffle using the seeded RNG — no Math.random().
    for (let i = permutation.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }
    // Every parameter's range was already validated non-null above (this is
    // a second pass over the same array — TS just can't carry that
    // narrowing across two separate .map()/for-of closures).
    const range = /** @type {{ min: number, max: number }} */ (param.range);
    const { min, max } = range;
    const integer = isIntegerParamType(param.type || "");
    return permutation.map(stratum => {
      const jitter = rng();
      const u = (stratum + jitter) / n;
      let value = min + u * (max - min);
      value = Math.min(max, Math.max(min, value));
      if (integer) value = Math.round(value);
      return +value.toFixed(6);
    });
  });

  return Array.from({ length: n }, (_, i) => ({
    params: parameters.map((param, d) => ({ path: param.path, value: perDimensionValues[d][i] })),
  }));
}
