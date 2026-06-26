// engine/conditions.js — Condition evaluator
//
// Two public evaluators are exported:
//   evaluatePredicate(predicate, state) — PRIMARY: safe evaluator for JSON predicates (Addition 1 §4).
//                                         Use this for all new conditions.
//   evalCondition(conditionStr, helpers, state, clock) — BACKWARD-COMPAT ADAPTER: handles legacy
//                                         string conditions authored in older models. Not for new use.
//                                         Left-to-right AND/OR semantics (no precedence grouping).
//
// EXTENDING evalCondition tokens:
//   1. Add a replacement rule in evalCondition below
//   2. Add it to the token list in ConditionBuilder.jsx UI component

import { migrateLegacyCondition } from "../model/conditionFormat.js";

const COMPILED_PREDICATE = Symbol("compiledPredicate");
const PREDICATE_DEPS = Symbol("predicateDependencies");

function createDependencySet() {
  return {
    queues: new Set(),
    resources: new Set(),
    stateVars: new Set(),
    builtins: new Set(),
    entityAttrs: new Set(),
    containers: new Set(),
    unknown: false,
    clock: false,
  };
}

function mergeDependencySets(target, source) {
  for (const value of source.queues) target.queues.add(value);
  for (const value of source.resources) target.resources.add(value);
  for (const value of source.stateVars) target.stateVars.add(value);
  for (const value of source.builtins) target.builtins.add(value);
  for (const value of source.entityAttrs) target.entityAttrs.add(value);
  for (const value of source.containers) target.containers.add(value);
  target.unknown = target.unknown || source.unknown;
  target.clock = target.clock || source.clock;
  return target;
}

function normalizeDependencyName(value) {
  return String(value || "").trim().toLowerCase();
}

// ── Safe helpers for legacy string evaluator ─────────────────────────────────

function parseVal(s) {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = Number(s);
  return isNaN(n) ? s : n;
}

function evalAtom(atom) {
  const m = atom.trim().match(/^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
  if (!m) return false;
  const left  = parseVal(m[1]);
  const op    = m[2];
  const right = parseVal(m[3]);
  switch (op) {
    case '==': return left == right;  // loose equality for legacy compat
    case '!=': return left != right;
    case '>':  return left > right;
    case '<':  return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    default:   return false;
  }
}

// Evaluates a substituted numeric expression like "3 > 0 && 1 > 0" without new Function.
function safeEvalExpr(expr) {
  if (!expr || !expr.trim()) return false;
  const segments = [];
  const re = /\s*(&&|\|\|)\s*/g;
  let last = 0, m;
  while ((m = re.exec(expr)) !== null) {
    segments.push({ type: 'clause', text: expr.slice(last, m.index).trim() });
    segments.push({ type: 'op',     text: m[1] });
    last = re.lastIndex;
  }
  segments.push({ type: 'clause', text: expr.slice(last).trim() });

  let result = null;
  let pendingOp = null;
  for (const seg of segments) {
    if (seg.type === 'op') { pendingOp = seg.text; continue; }
    if (!seg.text) continue;
    const val = evalAtom(seg.text);
    if (result === null) {
      result = val;
    } else {
      result = pendingOp === '&&' ? (result && val) : (result || val);
    }
    pendingOp = null;
  }
  return !!result;
}

// ── Safe evaluator for Addition 1 §4 predicate JSON ──────────────────────────

function resolveQueueValue(queueName, property, state) {
  const normalizedProperty = String(property || "length").toLowerCase();
  if (state.queues?.[queueName]?.[property] != null) return state.queues[queueName][property];
  if (state.queues?.[queueName]?.[normalizedProperty] != null) return state.queues[queueName][normalizedProperty];

  const queueDef = state.model?.queues?.find(q =>
    String(q.name || "").trim().toLowerCase() === String(queueName || "").trim().toLowerCase()
  );
  const discipline = queueDef?.discipline || "FIFO";
  const inQueueCount = state.helpers?.waitingInQueue?.(queueName, discipline)?.length;

  if (queueDef || (inQueueCount ?? 0) > 0) {
    if (inQueueCount != null) return inQueueCount;
    return state.helpers?.waitingOf?.(queueName, discipline)?.length ?? 0;
  }

  if (normalizedProperty === "length" || normalizedProperty === "count" || normalizedProperty === "size") {
    return state.helpers?.waitingOf?.(queueName, "FIFO")?.length ?? 0;
  }
  return undefined;
}

function resolveResourceValue(resourceName, property, state) {
  if (state.resources?.[resourceName]?.[property] != null) return state.resources[resourceName][property];
  const normalizedProperty = String(property || "").toLowerCase();
  if (normalizedProperty === "idle" || normalizedProperty === "idlecount" || normalizedProperty === "available" || normalizedProperty === "availablecount") {
    return state.helpers?.idleOf?.(resourceName)?.length ?? 0;
  }
  if (normalizedProperty === "busy" || normalizedProperty === "busycount") {
    return state.helpers?.busyOf?.(resourceName)?.length ?? 0;
  }
  return state.resources?.[resourceName]?.[normalizedProperty];
}

function resolveAttrValue(resourceName, attrName, state) {
  const entity = state.helpers?.idleOf?.(resourceName)?.[0];
  return entity?.attrs?.[attrName];
}

function resolveContainerValue(containerName, property, state) {
  // Container state lives on the engine's flat scalar-state object. In production,
  // the predicate context only exposes that object via `.scalars` (mirroring how
  // plain user-defined state variables are resolved) — direct test-built state
  // objects set the keys at the top level instead, so check both.
  const key = property === "capacity" ? `__containerCap_${containerName}`
    : property === "min" ? `__containerMin_${containerName}`
    : property === "max" ? `__containerMax_${containerName}`
    : `__container_${containerName}`;
  const value = state[key] ?? state.scalars?.[key];
  return property === "capacity" ? (value ?? Infinity) : value;
}

function resolveVariable(ref, state) {
  if (typeof ref !== "string" || !ref.trim()) return undefined;
  const text = ref.trim();

  const queueToken = text.match(/^queue\(([^)]+)\)\.(length|count|size)$/i);
  if (queueToken) {
    return resolveQueueValue(queueToken[1].trim(), queueToken[2], state);
  }

  const idleToken = text.match(/^idle\(([^)]+)\)\.count$/i);
  if (idleToken) {
    return state.helpers?.idleOf?.(idleToken[1].trim())?.length ?? 0;
  }

  const busyToken = text.match(/^busy\(([^)]+)\)\.count$/i);
  if (busyToken) {
    return state.helpers?.busyOf?.(busyToken[1].trim())?.length ?? 0;
  }

  const attrToken = text.match(/^attr\(([^,]+)\s*,\s*([^)]+)\)$/i);
  if (attrToken) {
    return resolveAttrValue(attrToken[1].trim(), attrToken[2].trim(), state);
  }

  const containerToken = text.match(/^container\(([^)]+)\)\.(level|capacity|min|max)$/i);
  if (containerToken) {
    return resolveContainerValue(containerToken[1].trim(), containerToken[2].toLowerCase(), state);
  }

  if (text === "served") return state.__served ?? state.served ?? 0;
  if (text === "reneged") return state.__reneged ?? state.reneged ?? 0;
  if (text === "loopCount") return state.__loopCount ?? state.loopCount ?? state.currentEntity?.loopCount ?? 0;
  if (text === "clock") return state.clock ?? 0;

  const parts = ref.split('.');
  if (parts[0] === 'Entity') {
    if (parts[1] === 'loopCount') {
      return state.currentEntity?.loopCount ?? 0;
    }
    // Entity.<attributeName>
    return state.currentEntity?.attrs?.[parts[1]] ?? state.currentEntity?.[parts[1]];
  }
  if (parts[0] === 'Resource') {
    // Resource.<id>.<property>
    return resolveResourceValue(parts[1], parts[2], state);
  }
  if (parts[0] === 'Queue') {
    // Queue.<id>.<property>
    return resolveQueueValue(parts[1], parts[2], state);
  }
  if (parts.length === 1) {
    // Plain user-defined state variable
    if (state.scalars && Object.prototype.hasOwnProperty.call(state.scalars, ref)) {
      return state.scalars[ref];
    }
    return state[ref];
  }
  throw new Error(`Unknown variable namespace in predicate: '${ref}'`);
}

function applyOperator(left, operator, right) {
  switch (operator) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '<':  return left < right;
    case '>':  return left > right;
    case '<=': return left <= right;
    case '>=': return left >= right;
    default:   throw new Error(`Unknown predicate operator: '${operator}'`);
  }
}

/**
 * Evaluate a predicate JSON object (Addition 1 §4) against simulation state.
 * Never calls eval, new Function, or any dynamic code execution.
 *
 * @param {object} predicate - Single: { variable, operator, value }
 *                             Compound: { operator: 'AND'|'OR', clauses: [...] }
 * @param {object} state     - { currentEntity, resources, queues, ...userVars }
 */
export function evaluatePredicate(predicate, state) {
  if (!predicate) return false;
  return compilePredicate(predicate)(state);
}

export function getPredicateDependencies(predicate) {
  if (predicate && typeof predicate === "object" && predicate[PREDICATE_DEPS]) {
    return predicate[PREDICATE_DEPS];
  }

  const normalized = migrateLegacyCondition(predicate);
  const deps = createDependencySet();
  if (!normalized) return deps;

  if (normalized.operator === "AND" || normalized.operator === "OR") {
    for (const clause of normalized.clauses || []) {
      mergeDependencySets(deps, getPredicateDependencies(clause));
    }
  } else {
    const variable = String(normalized.variable || "").trim();
    const queueToken = variable.match(/^queue\(([^)]+)\)\.(length|count|size)$/i);
    const idleToken = variable.match(/^idle\(([^)]+)\)\.count$/i);
    const busyToken = variable.match(/^busy\(([^)]+)\)\.count$/i);
    const attrToken = variable.match(/^attr\(([^,]+)\s*,\s*([^)]+)\)$/i);
    const containerToken = variable.match(/^container\(([^)]+)\)\.(level|capacity|min|max)$/i);
    if (queueToken) {
      deps.queues.add(normalizeDependencyName(queueToken[1]));
    } else if (idleToken || busyToken) {
      deps.resources.add(normalizeDependencyName((idleToken || busyToken)[1]));
    } else if (attrToken) {
      deps.resources.add(normalizeDependencyName(attrToken[1]));
      deps.entityAttrs.add(attrToken[2].trim());
    } else if (containerToken) {
      deps.containers.add(normalizeDependencyName(containerToken[1]));
    } else if (variable === "served" || variable === "reneged" || variable === "loopCount") {
      deps.builtins.add(variable);
    } else if (variable === "clock") {
      deps.clock = true;
      deps.builtins.add("clock");
    } else if (variable.startsWith("Entity.")) {
      deps.entityAttrs.add(variable.slice("Entity.".length));
    } else if (variable.startsWith("Queue.")) {
      const parts = variable.split(".");
      deps.queues.add(normalizeDependencyName(parts[1]));
    } else if (variable.startsWith("Resource.")) {
      const parts = variable.split(".");
      deps.resources.add(normalizeDependencyName(parts[1]));
    } else if (variable && !variable.includes(".")) {
      deps.stateVars.add(variable);
    } else {
      deps.unknown = true;
    }
  }

  if (predicate && typeof predicate === "object") {
    Object.defineProperty(predicate, PREDICATE_DEPS, {
      value: deps,
      enumerable: false,
      configurable: true,
    });
  }
  if (normalized && typeof normalized === "object") {
    Object.defineProperty(normalized, PREDICATE_DEPS, {
      value: deps,
      enumerable: false,
      configurable: true,
    });
  }
  return deps;
}

export function compilePredicate(predicate) {
  if (predicate && typeof predicate === "object" && predicate[COMPILED_PREDICATE]) {
    return predicate[COMPILED_PREDICATE];
  }

  const normalized = migrateLegacyCondition(predicate);
  if (!normalized) return () => false;
  const deps = getPredicateDependencies(normalized);

  let compiled;
  if (normalized.operator === 'AND') {
    const clauses = (normalized.clauses || []).map(compilePredicate);
    compiled = (state) => clauses.every(evaluate => evaluate(state));
  } else if (normalized.operator === 'OR') {
    const clauses = (normalized.clauses || []).map(compilePredicate);
    compiled = (state) => clauses.some(evaluate => evaluate(state));
  } else {
    const variable = normalized.variable;
    const operator = normalized.operator;
    const value = normalized.value;
    compiled = (state) => {
      const left = resolveVariable(variable, state || {});
      return !!applyOperator(left, operator, value);
    };
  }

  if (predicate && typeof predicate === "object") {
    Object.defineProperty(predicate, COMPILED_PREDICATE, {
      value: compiled,
      enumerable: false,
      configurable: true,
    });
  }
  if (normalized && typeof normalized === "object") {
    Object.defineProperty(normalized, COMPILED_PREDICATE, {
      value: compiled,
      enumerable: false,
      configurable: true,
    });
  }
  Object.defineProperty(compiled, "dependencies", {
    value: deps,
    enumerable: false,
    configurable: true,
  });
  return compiled;
}

/**
 * BACKWARD-COMPAT ADAPTER — for legacy string conditions only. Use evaluatePredicate for new code.
 *
 * Evaluate a condition string against current simulation state.
 * AND/OR are evaluated left-to-right with no precedence grouping.
 *
 * Supported tokens:
 *   queue(Type).length    — number of waiting entities of Type
 *   idle(Type).count      — number of idle servers of Type
 *   busy(Type).count      — number of busy servers of Type
 *   attr(Type, attrName)  — attribute value of first idle server of Type
 *   served                — cumulative served count
 *   reneged               — cumulative reneged count
 *   clock                 — current simulation time
 *   <varName>             — any custom scalar state variable
 *   AND / OR              — logical connectives
 *
 * @param {string} condition - Condition expression string
 * @param {object} helpers   - { waitingOf, idleOf, busyOf }
 * @param {object} state     - Scalar state { __served, __reneged, ...vars }
 * @param {number} clock     - Current simulation time
 */
export function evalCondition(condition, helpers, state, clock) {
  if (!condition || !condition.trim()) return false;
  try {
    let expr = condition;

    // queue(Name).length — check by queue field first.
    // Only fall back to entity type match when no queue has this name (backward compat
    // for models using ARRIVE(EntityType) without explicit queues).
    expr = expr.replace(/queue\(([^)]+)\)\.length/g, (_, rawName) => {
      const name = rawName.trim();
      const inQueue = helpers.entities
        ? helpers.entities.filter(e =>
            e.queue?.toLowerCase() === name.toLowerCase() && e.status === 'waiting'
          ).length
        : 0;
      const hasQueue = helpers.model?.queues?.some(q =>
        (q.name || '').toLowerCase() === name.toLowerCase()
      );
      if (inQueue > 0 || hasQueue) return String(inQueue);
      const discipline = helpers.model?.queues?.find(q =>
        (q.name || '').toLowerCase() === name.toLowerCase()
      )?.discipline || 'FIFO';
      return String(helpers.waitingOf(name, discipline).length);
    });

    // idle(Type).count
    expr = expr.replace(/idle\(([^)]+)\)\.count/g,
      (_, t) => String(helpers.idleOf(t.trim()).length));

    // busy(Type).count
    expr = expr.replace(/busy\(([^)]+)\)\.count/g,
      (_, t) => String(helpers.busyOf(t.trim()).length));

    // attr(Type, attrName) — first idle server's attribute
    expr = expr.replace(/attr\(([^,]+)\s*,\s*([^)]+)\)/g, (_, t, a) => {
      const e = helpers.idleOf(t.trim())[0];
      const v = e?.attrs?.[a.trim()];
      return v === undefined ? "0" : typeof v === "string" ? `"${v}"` : String(v);
    });

    // Built-in counters
    expr = expr.replace(/\bserved\b/g,    String(state.__served    || 0));
    expr = expr.replace(/\breneged\b/g,   String(state.__reneged   || 0));
    expr = expr.replace(/\bloopCount\b/g, String(state.__loopCount ?? 0));
    expr = expr.replace(/\bclock\b/g,     String(clock));

    // Custom scalar state variables
    Object.keys(state)
      .filter(k => !k.startsWith("__"))
      .forEach(k => {
        expr = expr.replace(
          new RegExp(`\\b${k}\\b`, "g"),
          typeof state[k] === "string" ? `"${state[k]}"` : String(state[k])
        );
      });

    // AND / OR → && / ||
    expr = expr.replace(/\bAND\b/gi, "&&").replace(/\bOR\b/gi, "||");

    return safeEvalExpr(expr);
  } catch {
    return false;
  }
}

/**
 * Build the list of valid condition tokens for the ConditionBuilder UI.
 * Derived from the model's entity types and state variables.
 */
export function buildConditionTokens(entityTypes = [], stateVariables = [], queues = [], containers = []) {
  const tokens = [];

  for (const et of entityTypes) {
    const name = et.name?.trim() || "";
    if (!name) continue;
    if (et.role === "server") {
      tokens.push({
        label: `idle(${name}).count  — idle servers`,
        value: `idle(${name}).count`,
        valueType: "number",
      });
      tokens.push({
        label: `busy(${name}).count  — busy servers`,
        value: `busy(${name}).count`,
        valueType: "number",
      });
    }
  }

  for (const q of queues) {
    const qName = q.name?.trim() || "";
    if (!qName) continue;
    tokens.push({
      label: `queue(${qName}).length  — customers waiting`,
      value: `queue(${qName}).length`,
      valueType: "number",
    });
  }

  tokens.push({ label: "clock  — current simulation time", value: "clock", valueType: "number" });
  tokens.push({ label: "served  — cumulative served",    value: "served",    valueType: "number" });
  tokens.push({ label: "reneged — cumulative reneged",   value: "reneged",   valueType: "number" });
  tokens.push({ label: "loopCount  — current entity loop recirculations", value: "loopCount", valueType: "number" });

  for (const sv of stateVariables) {
    if (sv.name) {
      tokens.push({
        label:     `${sv.name}  — ${sv.description || "state variable"}`,
        value:     sv.name,
        valueType: "number",
      });
    }
  }

  for (const ct of containers) {
    const id = ct.id?.trim() || "";
    if (!id) continue;
    tokens.push({ label: `container(${id}).level  — current level`, value: `container(${id}).level`, valueType: "number" });
    tokens.push({ label: `container(${id}).capacity  — max level`, value: `container(${id}).capacity`, valueType: "number" });
  }

  return tokens;
}

