// @ts-check
// engine/queue-refs.js — model reference propagation for queue, entity-type,
// state-variable, and container renames.
//
// Every rename goes through the same three walkers, so a reference site added
// for one kind of object is covered for all of them:
//   - effects (B-event effect, C-event effect; string or array, `;`-separated
//     calls), driven by EFFECT_ARGS: which argument of which macro names a
//     queue / server type / customer type / container / state variable;
//   - conditions (C-event condition, cSchedules[].when, B-event routing,
//     queue balkCondition, shift-schedule `when`, the run's
//     terminationCondition), both sides of every clause;
//   - plain fields (routing queueName, overflowDestination, distances, goal
//     scope names, exposed-parameter paths, ...).
// Renames used to miss C-event effects stored as arrays (the Forms editor's
// format), COSEIZE's queue, RELEASE_COSEIZED, DELAY, MATCH's queues, B-event
// routing conditions, balkCondition, and state variables on a condition's
// right-hand side; tests/engine/queue-refs.test.js renames every object in the
// World Oil Network reference model and checks no old reference survives.
import { mapConditionOperands } from "../model/conditionFormat.js";

/** @param {any} [value] */
function norm(value = "") {
  return String(value ?? "").trim().toLowerCase();
}

/** @param {any} [value] */
function esc(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Effect parsing ──────────────────────────────────────────────────────────

/**
 * Split at top-level separators — not inside (), [], {} or quotes.
 * @param {string} text
 * @param {string} sep
 */
function splitTopLevel(text, sep) {
  /** @type {string[]} */
  const out = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/** @param {string} part */
function parseCall(part) {
  const m = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/);
  if (!m) return null;
  return { name: m[1], args: m[2].trim() === "" ? [] : splitTopLevel(m[2], ",").map(a => a.trim()) };
}

// Which macro arguments hold a reference: an index, `{ from: n }` for that
// argument and every later one, or `{ list: n }` for a `[A, B]` list argument.
// Server-type arguments may carry a `:N` count or `[Skill]` suffix
// (COSEIZE(Q, Nurse:2, Doctor[Surgery])).
/** @typedef {number | { from: number } | { list: number }} ArgPos */
/** @type {Record<string, Record<string, ArgPos[]>>} */
const EFFECT_ARGS = {
  queue: {
    ARRIVE: [1], RELEASE: [1], RELEASE_COSEIZED: [1], ASSIGN: [0], COSEIZE: [0],
    BATCH: [0], UNBATCH: [0], JOIN: [0, 1], SPLIT: [2], DELAY: [0], MATCH: [1, 3, 4],
  },
  server: {
    ASSIGN: [1], COSEIZE: [{ from: 1 }], RELEASE: [0], RELEASE_COSEIZED: [{ list: 0 }],
    PREEMPT: [0], FAIL: [0], REPAIR: [0],
  },
  customer: {
    ARRIVE: [0], RENEGE_OLDEST: [0], RENEGE: [0], SPLIT: [0], MATCH: [0, 2],
  },
  container: {
    FILL: [0], DRAIN: [0], DRAIN_PARTIAL: [0, 2],
  },
  state: {
    SET: [0],
  },
  // Older models name the customer type where a queue goes (queue(Patient),
  // ASSIGN(Patient, Nurse)); renameEntityType only applies this when no real
  // queue carries the old name.
  customerQueueToken: {
    ASSIGN: [0], COSEIZE: [0],
  },
};

// Arguments that are expressions which may mention a state variable by name
// (SET(x, y + 1), FILL(tank, rate), DELAY(Q, wait), BATCH(Q, size)).
/** @type {Record<string, number[]>} */
const EXPRESSION_ARGS = {
  SET: [1], SET_ATTR: [1], FILL: [1], DRAIN: [1], DRAIN_PARTIAL: [1], DELAY: [1], BATCH: [1],
};

/**
 * @param {string} arg
 * @param {string} oldName
 * @param {string} newName
 * @param {boolean} allowSuffix  keep a trailing `:N` / `[Skill]`
 */
function renameNameArg(arg, oldName, newName, allowSuffix) {
  const text = arg.trim();
  const suffix = allowSuffix ? (text.match(/\s*(?::\s*\d+|\[[^\]]*\])$/)?.[0] || "") : "";
  const base = suffix ? text.slice(0, text.length - suffix.length) : text;
  return norm(base) === norm(oldName) ? `${newName}${suffix}` : arg;
}

/**
 * Whole-identifier replacement inside an expression, skipping `Entity.x`,
 * `obj.x`, function names `x(` and quoted strings.
 * @param {string} text
 * @param {string} oldName
 * @param {string} newName
 */
function renameIdentifier(text, oldName, newName) {
  const re = new RegExp(`(?<![\\w.$])${esc(oldName)}(?![\\w(])`, "g");
  return splitByQuotes(text).map(([chunk, quoted]) => (quoted ? chunk : chunk.replace(re, newName))).join("");
}

/** @param {string} text @returns {Array<[string, boolean]>} */
function splitByQuotes(text) {
  /** @type {Array<[string, boolean]>} */
  const out = [];
  let i = 0;
  while (i < text.length) {
    const q = text.slice(i).search(/["']/);
    if (q < 0) { out.push([text.slice(i), false]); break; }
    if (q > 0) out.push([text.slice(i, i + q), false]);
    const open = i + q;
    const close = text.indexOf(text[open], open + 1);
    const end = close < 0 ? text.length : close + 1;
    out.push([text.slice(open, end), true]);
    i = end;
  }
  return out;
}

/**
 * Rename one kind of reference inside a single effect string (possibly several
 * `;`-separated calls / scalar statements).
 * @param {any} effect
 * @param {keyof typeof EFFECT_ARGS} kind
 * @param {string} oldName
 * @param {string} newName
 */
function renameInEffectString(effect, kind, oldName, newName) {
  if (typeof effect !== "string" || !effect.trim()) return effect;
  const spec = EFFECT_ARGS[kind];
  let changed = false;
  const parts = splitTopLevel(effect, ";").map(part => {
    const call = parseCall(part);
    if (!call) {
      // Scalar statements (`count++`, `total += 2`, `x = y + 1`) name state variables.
      if (kind !== "state") return part;
      const next = renameIdentifier(part, oldName, newName);
      if (next !== part) changed = true;
      return next;
    }
    const macro = call.name.toUpperCase();
    const positions = spec[macro] || [];
    const allowSuffix = kind === "server";
    const args = call.args.map((arg, idx) => {
      for (const pos of positions) {
        if (typeof pos === "object" && "list" in pos && pos.list === idx) {
          const inner = arg.trim();
          if (!inner.startsWith("[") || !inner.endsWith("]")) return renameNameArg(arg, oldName, newName, allowSuffix);
          const items = splitTopLevel(inner.slice(1, -1), ",").map(item => renameNameArg(item.trim(), oldName, newName, allowSuffix));
          return `[${items.join(", ")}]`;
        }
        if (pos === idx || (typeof pos === "object" && "from" in pos && idx >= pos.from)) {
          return renameNameArg(arg, oldName, newName, allowSuffix);
        }
      }
      if (kind === "state" && (EXPRESSION_ARGS[macro] || []).includes(idx)) return renameIdentifier(arg, oldName, newName);
      return arg;
    });
    if (args.some((a, i) => a !== call.args[i])) {
      changed = true;
      return `${call.name}(${args.join(", ")})`;
    }
    return part;
  });
  if (!changed) return effect;
  return parts.map(p => p.trim()).filter(Boolean).join("; ");
}

/**
 * Apply `mapper` to every effect string, preserving the array-vs-string shape
 * (C-event effects authored in the Forms editor are arrays; coercing them to a
 * string corrupts the model).
 * @param {any} rawEffect
 * @param {(effect: any) => any} mapper
 */
function mapEffects(rawEffect, mapper) {
  if (Array.isArray(rawEffect)) return rawEffect.map(mapper);
  if (rawEffect == null) return rawEffect;
  return mapper(rawEffect);
}

// ── Model walkers ───────────────────────────────────────────────────────────

/**
 * @param {Record<string, any>} model
 * @param {(effect: any) => any} effectMapper  one effect string → renamed
 * @param {(token: string) => string} conditionMapper  one condition operand → renamed
 */
function mapEffectsAndConditions(model, effectMapper, conditionMapper) {
  const cond = (/** @type {any} */ c) => (c == null ? c : mapConditionOperands(c, operand => conditionMapper(String(operand))));
  /** @type {Record<string, any>} */
  const next = {
    ...model,
    bEvents: (model.bEvents || []).map((/** @type {any} */ event) => ({
      ...event,
      effect: mapEffects(event.effect, effectMapper),
      ...(event.condition != null ? { condition: cond(event.condition) } : {}),
      ...(Array.isArray(event.routing) ? {
        routing: event.routing.map((/** @type {any} */ route) => (route.condition != null ? { ...route, condition: cond(route.condition) } : route)),
      } : {}),
    })),
    cEvents: (model.cEvents || []).map((/** @type {any} */ event) => ({
      ...event,
      ...(event.condition != null ? { condition: cond(event.condition) } : {}),
      effect: mapEffects(event.effect, effectMapper),
      ...(Array.isArray(event.cSchedules) ? {
        cSchedules: event.cSchedules.map((/** @type {any} */ cs) => (cs?.when != null ? { ...cs, when: cond(cs.when) } : cs)),
      } : {}),
    })),
    queues: (model.queues || []).map((/** @type {any} */ queue) => (
      queue.balkCondition != null ? { ...queue, balkCondition: cond(queue.balkCondition) } : queue
    )),
  };
  if (model.entityTypes) {
    next.entityTypes = model.entityTypes.map((/** @type {any} */ et) => (
      Array.isArray(et.shiftSchedule)
        ? { ...et, shiftSchedule: et.shiftSchedule.map((/** @type {any} */ step) => (step?.when != null ? { ...step, when: cond(step.when) } : step)) }
        : et
    ));
  }
  if (model.experimentDefaults?.terminationCondition != null) {
    next.experimentDefaults = { ...model.experimentDefaults, terminationCondition: cond(model.experimentDefaults.terminationCondition) };
  }
  return next;
}

/**
 * Rename `name(Old)` / `Prefix.Old.` reference tokens inside a condition operand.
 * @param {string} text
 * @param {string[]} fns  function-style tokens, e.g. ["queue"] → queue(Old)
 * @param {string[]} dotted  dotted namespaces, e.g. ["Queue"] → Queue.Old.prop
 * @param {string} oldName
 * @param {string} newName
 */
function renameTokens(text, fns, dotted, oldName, newName) {
  let next = text;
  for (const fn of fns) {
    next = next.replace(new RegExp(`\\b(${fn})\\(\\s*${esc(oldName)}\\s*(?=[),])`, "gi"), `$1(${newName}`);
  }
  for (const ns of dotted) {
    next = next.replace(new RegExp(`\\b(${ns})\\.${esc(oldName)}(?=\\.|$)`, "gi"), `$1.${newName}`);
  }
  return next;
}

/**
 * Goal scopes name their queue / resource (scope.name); results are looked up
 * by that name, so it has to follow a rename.
 * @param {any[]} goals @param {string} type @param {string} oldName @param {string} newName
 */
function renameGoalScopes(goals, type, oldName, newName) {
  return goals.map((/** @type {any} */ g) => (
    g?.scope?.type === type && norm(g.scope.name) === norm(oldName)
      ? { ...g, scope: { ...g.scope, name: newName } }
      : g
  ));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {Record<string, any>} model
 * @param {string} oldName
 * @param {string} newName
 */
export function renameQueue(model, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return model;
  const sameName = (/** @type {any} */ v) => norm(v) === norm(oldName);
  const next = mapEffectsAndConditions(
    model,
    effect => renameInEffectString(effect, "queue", oldName, newName),
    token => renameTokens(token, ["queue"], ["Queue"], oldName, newName),
  );
  return {
    ...next,
    bEvents: next.bEvents.map((/** @type {any} */ event) => ({
      ...event,
      ...(Array.isArray(event.routing) ? {
        routing: event.routing.map((/** @type {any} */ route) => ({ ...route, queueName: sameName(route.queueName) ? newName : route.queueName })),
      } : {}),
      ...(Array.isArray(event.probabilisticRouting) ? {
        probabilisticRouting: event.probabilisticRouting.map((/** @type {any} */ route) => ({ ...route, queueName: sameName(route.queueName) ? newName : route.queueName })),
      } : {}),
      ...(event.defaultQueueName !== undefined ? { defaultQueueName: sameName(event.defaultQueueName) ? newName : event.defaultQueueName } : {}),
    })),
    queues: next.queues.map((/** @type {any} */ queue) => (
      queue.overflowDestination !== undefined && sameName(queue.overflowDestination)
        ? { ...queue, overflowDestination: newName }
        : queue
    )),
    ...(Array.isArray(model.distances) ? {
      distances: model.distances.map((/** @type {any} */ d) => ({
        ...d,
        ...(sameName(d.fromQueue) ? { fromQueue: newName } : {}),
        ...(sameName(d.toQueue) ? { toQueue: newName } : {}),
      })),
    } : {}),
    ...(Array.isArray(model.goals) ? { goals: renameGoalScopes(model.goals, "queue", oldName, newName) } : {}),
  };
}

/**
 * @param {Record<string, any>} model
 * @param {string} oldName
 * @param {string} newName
 * @param {string} [role]
 */
export function renameEntityType(model, oldName, newName, role = "customer") {
  if (!oldName || !newName || oldName === newName) return model;

  if (role === "server") {
    const next = mapEffectsAndConditions(
      model,
      effect => renameInEffectString(effect, "server", oldName, newName),
      token => renameTokens(token, ["idle", "busy", "attr"], ["Resource"], oldName, newName),
    );
    return {
      ...next,
      ...(Array.isArray(model.goals) ? { goals: renameGoalScopes(model.goals, "resource", oldName, newName) } : {}),
    };
  }

  // Customer types: older models use the type name as a queue token
  // (queue(Patient), ASSIGN(Patient, Nurse)). Only rewrite those when no real
  // queue carries the old name — otherwise they refer to that queue.
  const typeIsQueueToken = !(model.queues || []).some((/** @type {any} */ queue) => norm(queue.name) === norm(oldName));
  const next = mapEffectsAndConditions(
    model,
    effect => {
      let out = renameInEffectString(effect, "customer", oldName, newName);
      if (typeIsQueueToken) out = renameInEffectString(out, "customerQueueToken", oldName, newName);
      return out;
    },
    token => (typeIsQueueToken ? renameTokens(token, ["queue"], ["Queue"], oldName, newName) : token),
  );
  return {
    ...next,
    queues: next.queues.map((/** @type {any} */ queue) => (
      norm(queue.customerType) === norm(oldName) ? { ...queue, customerType: newName } : queue
    )),
  };
}

/**
 * @param {Record<string, any>} model
 * @param {string} oldName
 * @param {string} newName
 */
export function renameStateVariable(model, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return model;
  const renameOperand = (/** @type {string} */ operand) => {
    const t = operand.trim();
    if (norm(t) === norm(oldName)) return newName;
    if (norm(t) === norm(`state.${oldName}`)) return `state.${newName}`;
    return operand;
  };
  const next = mapEffectsAndConditions(
    model,
    effect => renameInEffectString(effect, "state", oldName, newName),
    renameOperand,
  );
  const oldPath = `stateVariables.${oldName}.`;
  return {
    ...next,
    ...(Array.isArray(model.exposedParams) ? {
      exposedParams: model.exposedParams.map((/** @type {any} */ p) => (
        typeof p?.path === "string" && p.path.startsWith(oldPath)
          ? { ...p, path: `stateVariables.${newName}.${p.path.slice(oldPath.length)}` }
          : p
      )),
    } : {}),
  };
}

/**
 * @param {Record<string, any>} model
 * @param {string} oldId
 * @param {string} newId
 */
export function renameContainer(model, oldId, newId) {
  if (!oldId || !newId || oldId === newId) return model;
  const next = mapEffectsAndConditions(
    model,
    effect => renameInEffectString(effect, "container", oldId, newId),
    token => renameTokens(token, ["container"], [], oldId, newId),
  );
  return {
    ...next,
    goals: (model.goals || []).map((/** @type {any} */ g) => {
      if (!g?.scope || g.scope.type !== "container") return g;
      const idHit = norm(g.scope.id) === norm(oldId);
      const nameHit = norm(g.scope.name) === norm(oldId);
      if (!idHit && !nameHit) return g;
      return { ...g, scope: { ...g.scope, ...(idHit ? { id: newId } : {}), ...(nameHit ? { name: newId } : {}) } };
    }),
  };
}

/**
 * Switch one C-event from server type `oldName` to `newName` (the Visual
 * Designer's "server" field on an activity) — its condition and effects only,
 * not the rest of the model. Conditions stay objects and effects keep their
 * array-vs-string shape.
 * @param {Record<string, any>} event
 * @param {string} oldName
 * @param {string} newName
 */
export function renameServerInEvent(event, oldName, newName) {
  if (!event || !oldName || !newName || oldName === newName) return event;
  const { cEvents: [next] } = mapEffectsAndConditions(
    { cEvents: [event] },
    effect => renameInEffectString(effect, "server", oldName, newName),
    token => renameTokens(token, ["idle", "busy", "attr"], ["Resource"], oldName, newName),
  );
  return next;
}
