// ui/execute/pauseRules.js — "Pause when…" rules for Auto Run (roadmap #6).
//
// Rules are a run-time viewing aid, not model data: they live in localStorage
// per model and never reach model_json, the engine, or saved results. Auto Run
// checks them after every engine step and stops on the first that fires.
//
// Rule kinds:
//   { kind: "time",  time }          simulation clock reaches `time` (fires once)
//   { kind: "depth", queue, count }  queue holds at least `count` waiting
//                                    (fires on each upward crossing)
//   { kind: "enter", queue }         an entity joins `queue` (fires on every join)

export const PAUSE_RULE_KINDS = [
  { value: "enter", label: "An entity enters a queue" },
  { value: "depth", label: "A queue reaches a length" },
  { value: "time",  label: "Simulation time reaches" },
];

const STORAGE_PREFIX = "flow.pauseRules.";

let nextId = 1;
export function newRuleId() {
  return `pr_${Date.now().toString(36)}_${nextId++}`;
}

/** A rule is complete enough to check. */
export function isRuleReady(rule) {
  if (!rule || rule.enabled === false) return false;
  if (rule.kind === "time") return Number.isFinite(Number(rule.time)) && String(rule.time).trim() !== "";
  if (rule.kind === "depth") return Boolean(rule.queue) && Number.isFinite(Number(rule.count)) && Number(rule.count) >= 1;
  if (rule.kind === "enter") return Boolean(rule.queue);
  return false;
}

/** "Quote Queue has 5 or more waiting" — what the rule means, for the list. */
export function describeRule(rule) {
  if (rule.kind === "time") return `Simulation time reaches ${rule.time === "" || rule.time == null ? "…" : rule.time}`;
  if (rule.kind === "depth") return `${rule.queue || "…"} has ${rule.count || "…"} or more waiting`;
  return `An entity enters ${rule.queue || "…"}`;
}

/**
 * @param {string|null|undefined} modelId
 * @returns {Record<string, any>[]}
 */
export function loadPauseRules(modelId) {
  if (!modelId) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + modelId);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(r => r && typeof r === "object" && r.kind) : [];
  } catch {
    return [];
  }
}

/**
 * @param {string|null|undefined} modelId
 * @param {Record<string, any>[]} rules
 */
export function savePauseRules(modelId, rules) {
  if (!modelId) return;
  try {
    if (rules.length) window.localStorage.setItem(STORAGE_PREFIX + modelId, JSON.stringify(rules));
    else window.localStorage.removeItem(STORAGE_PREFIX + modelId);
  } catch {
    // Storage blocked or full: rules still work for this session.
  }
}

function probe(engine, rule) {
  if (rule.kind === "time") return engine.getClock();
  if (rule.kind === "depth") return engine.getQueueDepth(rule.queue);
  return engine.getQueueJoins(rule.queue);
}

/**
 * Watches an engine for the given rules. Baselines are taken now, so a rule
 * that is already true when Auto Run starts (or resumes) waits for the next
 * change rather than stopping at once.
 * @param {Record<string, any>[]} rules
 * @param {{ getClock: () => number, getQueueDepth: (q: string) => number, getQueueJoins: (q: string) => number }} engine
 */
export function createPauseWatcher(rules, engine) {
  const active = rules.filter(isRuleReady);
  const last = active.map(rule => probe(engine, rule));
  return {
    size: active.length,
    /** @returns {null | { rule: Record<string, any>, clock: number, value: number, message: string }} */
    check() {
      let hit = null;
      for (let i = 0; i < active.length; i++) {
        const rule = active[i];
        const prev = last[i];
        const now = probe(engine, rule);
        last[i] = now;
        if (hit) continue; // keep every baseline current
        let fired = false;
        if (rule.kind === "time") fired = prev < Number(rule.time) && now >= Number(rule.time);
        else if (rule.kind === "depth") fired = prev < Number(rule.count) && now >= Number(rule.count);
        else fired = now > prev;
        if (fired) hit = { rule, clock: engine.getClock(), value: now, message: pauseMessage(rule, now, engine.getClock()) };
      }
      return hit;
    },
  };
}

function fmtTime(t) {
  return Number.isInteger(t) ? String(t) : Number(t).toFixed(2);
}

export function pauseMessage(rule, value, clock) {
  const at = `at t = ${fmtTime(clock)}`;
  if (rule.kind === "time") return `Paused: simulation time reached ${rule.time} (${at}).`;
  if (rule.kind === "depth") return `Paused: ${rule.queue} reached ${value} waiting ${at}.`;
  return `Paused: an entity entered ${rule.queue} ${at}.`;
}
