// @ts-check
// engine/conditions.js — Condition evaluator
//
// evaluatePredicate(predicate, state) — safe evaluator for JSON predicates (Addition 1 §4).
// Legacy string conditions are migrated to the predicate-object form via
// migrateLegacyCondition() before evaluation (see compilePredicate/getPredicateDependencies).

import { migrateLegacyCondition } from "../model/conditionFormat.js";
import { simToWall } from "./clockUtils.js";

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

/**
 * @param {ReturnType<typeof createDependencySet>} target
 * @param {ReturnType<typeof createDependencySet>} source
 */
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

/** @param {any} value */
function normalizeDependencyName(value) {
  return String(value || "").trim().toLowerCase();
}

// ── Safe evaluator for Addition 1 §4 predicate JSON ──────────────────────────

/**
 * @param {string} queueName
 * @param {string} property
 * @param {any} state
 */
function resolveQueueValue(queueName, property, state) {
  const normalizedProperty = String(property || "length").toLowerCase();
  if (state.queues?.[queueName]?.[property] != null) return state.queues[queueName][property];
  if (state.queues?.[queueName]?.[normalizedProperty] != null) return state.queues[queueName][normalizedProperty];

  const queueDef = queueDefFor(state.model, queueName);
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

/**
 * @param {string} resourceName
 * @param {string} property
 * @param {any} state
 */
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

/**
 * @param {string} resourceName
 * @param {string} attrName
 * @param {any} state
 */
function resolveAttrValue(resourceName, attrName, state) {
  const entity = state.helpers?.idleOf?.(resourceName)?.[0];
  return entity?.attrs?.[attrName];
}

/**
 * @param {string} containerName
 * @param {string} property
 * @param {any} state
 */
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

// Shared regexes for the small set of function-call-style tokens
// (`queue(...)`, `idle(...)`, `busy(...)`, `container(...)`, `attr(...)`) that are
// resolved as dynamic references on either side of a predicate. These are
// syntactically distinctive enough to never collide with a genuine literal string
// value (e.g. "urgent" or "Doctor"), which is why RHS resolution (see
// isResolvableExpression) is scoped to just these five — unlike a bare state-variable
// name, which is genuinely ambiguous with a literal string of the same text.
const QUEUE_TOKEN_RE = /^queue\(([^)]+)\)\.(length|count|size)$/i;
const IDLE_TOKEN_RE = /^idle\(([^,)]+)(?:\s*,\s*"([^"]+)")?\)\.count$/i;
const BUSY_TOKEN_RE = /^busy\(([^,)]+)(?:\s*,\s*"([^"]+)")?\)\.count$/i;
const ATTR_TOKEN_RE = /^attr\(([^,]+)\s*,\s*([^)]+)\)$/i;
const CONTAINER_TOKEN_RE = /^container\(([^)]+)\)\.(level|capacity|min|max)$/i;

// `Other.<attr>` is the second-entity namespace used by MATCH's compatibility
// predicate (see the MATCH macro in macros.js) — as distinctive/unambiguous a
// prefix as the function-call tokens above, so it's safe to resolve on the RHS too.
const OTHER_ATTR_RE = /^Other\.\w+$/;

// B3 — state variables on the RHS. `state.<name>` is unambiguous and always
// resolves. A bare identifier is ambiguous with a literal string of the same
// text, so it resolves only when it names a state variable that actually
// exists in this run (a key in the engine's scalar state, excluding the
// engine's own `__`-prefixed internals) — checked at evaluation time, since
// a compiled predicate doesn't know the model. A literal like "sour" with no
// state variable called sour stays a literal. No arithmetic: the RHS is a
// single reference, never an expression.
const STATE_DOT_RE = /^state\.([A-Za-z_]\w*)$/;

// Which function-call token a condition variable is, parsed once per distinct
// string: conditions are evaluated on every Phase C scan, and running the
// token regexes each time was a measurable share of the scan cost.
/** @type {Map<string, { kind: string|null, match: RegExpMatchArray|null }>} */
const _tokenCache = new Map();
const TOKEN_CACHE_LIMIT = 10_000;
/** @param {string} text */
function parseToken(text) {
  let hit = _tokenCache.get(text);
  if (hit) return hit;
  /** @type {[string, RegExp][]} */
  const kinds = [["queue", QUEUE_TOKEN_RE], ["idle", IDLE_TOKEN_RE], ["busy", BUSY_TOKEN_RE], ["attr", ATTR_TOKEN_RE], ["container", CONTAINER_TOKEN_RE]];
  hit = { kind: null, match: null };
  for (const [kind, re] of kinds) {
    const m = text.match(re);
    if (m) { hit = { kind, match: m }; break; }
  }
  if (_tokenCache.size >= TOKEN_CACHE_LIMIT) _tokenCache.clear();
  _tokenCache.set(text, hit);
  return hit;
}

// Queue definitions by normalised name, cached per model object.
/** @type {WeakMap<object, Map<string, any>>} */
const _queueDefCache = new WeakMap();
/** @param {any} model @param {any} queueName */
function queueDefFor(model, queueName) {
  if (!model) return undefined;
  let byName = _queueDefCache.get(model);
  if (!byName) {
    byName = new Map();
    for (const q of model.queues || []) {
      const key = String(q.name || "").trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, q);
    }
    _queueDefCache.set(model, byName);
  }
  return byName.get(String(queueName || "").trim().toLowerCase());
}
const BARE_IDENT_RE = /^[A-Za-z_]\w*$/;

/** @param {any} value */
function stateVarRhsName(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const dotted = text.match(STATE_DOT_RE);
  if (dotted) return { name: dotted[1], explicit: true };
  if (BARE_IDENT_RE.test(text) && !text.startsWith("__")) return { name: text, explicit: false };
  return null;
}

/**
 * Resolve a state-variable RHS, or report that it isn't one.
 * @param {{ name: string, explicit: boolean }} ref
 * @param {any} state
 * @returns {{ hit: boolean, value?: any }}
 */
function resolveStateVarRhs(ref, state) {
  const scalars = state.scalars;
  if (scalars && Object.prototype.hasOwnProperty.call(scalars, ref.name)) return { hit: true, value: scalars[ref.name] };
  // Test-built predicate states put state vars at the top level.
  if (!scalars && Object.prototype.hasOwnProperty.call(state, ref.name)
      && !["currentEntity", "otherEntity", "helpers", "model", "entities", "resources", "queues", "clock"].includes(ref.name)) {
    return { hit: true, value: state[ref.name] };
  }
  if (ref.explicit) return { hit: true, value: undefined };
  return { hit: false };
}

/** @param {any} value */
export function isResolvableExpression(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return QUEUE_TOKEN_RE.test(text) || IDLE_TOKEN_RE.test(text) || BUSY_TOKEN_RE.test(text)
    || ATTR_TOKEN_RE.test(text) || CONTAINER_TOKEN_RE.test(text) || OTHER_ATTR_RE.test(text);
}

/**
 * @param {any} ref
 * @param {any} state
 */
function resolveVariable(ref, state) {
  if (typeof ref !== "string" || !ref.trim()) return undefined;
  const text = ref.trim();
  const token = parseToken(text);

  const queueToken = token.kind === "queue" ? token.match : null;
  if (queueToken) {
    return resolveQueueValue(queueToken[1].trim(), queueToken[2], state);
  }

  const idleToken = token.kind === "idle" ? token.match : null;
  if (idleToken) {
    const type = idleToken[1].trim();
    const skill = idleToken[2] ? idleToken[2].trim() : null;
    if (skill) {
      return state.helpers?.idleOf(type)?.filter((/** @type {any} */ s) => state.helpers?.hasSkillType?.(s.type, skill) || (Array.isArray(s.skills) && s.skills.includes(skill)))?.length ?? 0;
    }
    if (state.helpers?.idleCount) return state.helpers.idleCount(type);
    return state.helpers?.idleOf?.(type)?.length ?? 0;
  }

  const busyToken = token.kind === "busy" ? token.match : null;
  if (busyToken) {
    const type = busyToken[1].trim();
    const skill = busyToken[2] ? busyToken[2].trim() : null;
    if (skill) {
      return state.helpers?.busyOf(type)?.filter((/** @type {any} */ s) => state.helpers?.hasSkillType?.(s.type, skill) || (Array.isArray(s.skills) && s.skills.includes(skill)))?.length ?? 0;
    }
    if (state.helpers?.busyCount) return state.helpers.busyCount(type);
    return state.helpers?.busyOf?.(type)?.length ?? 0;
  }

  const attrToken = token.kind === "attr" ? token.match : null;
  if (attrToken) {
    return resolveAttrValue(attrToken[1].trim(), attrToken[2].trim(), state);
  }

  const containerToken = token.kind === "container" ? token.match : null;
  if (containerToken) {
    return resolveContainerValue(containerToken[1].trim(), containerToken[2].toLowerCase(), state);
  }

  if (text === "served") return state.__served ?? state.served ?? 0;
  if (text === "reneged") return state.__reneged ?? state.reneged ?? 0;
  if (text === "balked") return state.__balked ?? state.balked ?? 0;
  if (text === "loopCount") return state.__loopCount ?? state.loopCount ?? state.currentEntity?.loopCount ?? 0;
  if (text === "clock") return state.clock ?? 0;

  // Calendar-aware condition variables (require epoch to be set)
  if (text === "isWeekday" || text === "isWeekend" || text === "hourOfDay" || text === "dayOfWeek") {
    const clock = state.clock ?? 0;
    const epoch = state.model?.epoch;
    const timeUnit = state.model?.timeUnit || "minutes";
    const wallDate = simToWall(clock, epoch, timeUnit);
    if (!wallDate) {
      // No epoch set — return defaults. text is one of the 4 values checked
      // above, so one of these always fires; the trailing return is just to
      // prove that to the type checker (wallDate is used non-null below).
      if (text === "isWeekday") return true;
      if (text === "isWeekend") return false;
      if (text === "hourOfDay") return 0;
      if (text === "dayOfWeek") return 1; // Monday
      return undefined;
    }
    const day = wallDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const hour = wallDate.getHours();
    if (text === "isWeekday") return day >= 1 && day <= 5;
    if (text === "isWeekend") return day === 0 || day === 6;
    if (text === "hourOfDay") return hour;
    if (text === "dayOfWeek") return day;
  }

  const parts = ref.split('.');
  if (parts[0] === 'Entity') {
    if (parts[1] === 'loopCount') {
      return state.currentEntity?.loopCount ?? 0;
    }
    // Entity.<attributeName>
    return state.currentEntity?.attrs?.[parts[1]] ?? state.currentEntity?.[parts[1]];
  }
  if (parts[0] === 'Other') {
    // Other.<attributeName> — the second entity in a two-entity comparison, e.g.
    // MATCH's compatibility predicate (`state.otherEntity`, set by the MATCH macro).
    // Only meaningful where a caller explicitly supplies otherEntity; undefined
    // everywhere else, same as Entity.* when there's no currentEntity.
    if (parts[1] === 'loopCount') {
      return state.otherEntity?.loopCount ?? 0;
    }
    return state.otherEntity?.attrs?.[parts[1]] ?? state.otherEntity?.[parts[1]];
  }
  if (parts[0] === 'Resource') {
    // Resource.<id>.<property>
    return resolveResourceValue(parts[1], parts[2], state);
  }
  if (parts[0] === 'Queue') {
    // Queue.<id>.<property>
    return resolveQueueValue(parts[1], parts[2], state);
  }
  if (parts[0] === 'state') {
    // state.<name> — resolves the same way a bare state-var name resolves below.
    const stateVarName = parts.slice(1).join('.');
    if (state.scalars && Object.prototype.hasOwnProperty.call(state.scalars, stateVarName)) {
      return state.scalars[stateVarName];
    }
    return state[stateVarName];
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

/**
 * @param {any} left
 * @param {string} operator
 * @param {any} right
 */
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
 * @param {object|string} predicate - Single: { variable, operator, value }
 *                             Compound: { operator: 'AND'|'OR', clauses: [...] }
 *                             A raw legacy-format condition string is also
 *                             accepted — migrateLegacyCondition() below parses it.
 * @param {object} state     - { currentEntity, resources, queues, ...userVars }
 */
export function evaluatePredicate(predicate, state) {
  if (!predicate) return false;
  return compilePredicate(predicate)(state);
}

/**
 * @param {ReturnType<typeof createDependencySet>} deps
 * @param {any} rawVariable
 */
function addLeafDependency(deps, rawVariable) {
  const variable = String(rawVariable || "").trim();
  const queueToken = variable.match(QUEUE_TOKEN_RE);
  const idleToken = variable.match(IDLE_TOKEN_RE);
  const busyToken = variable.match(BUSY_TOKEN_RE);
  const attrToken = variable.match(ATTR_TOKEN_RE);
  const containerToken = variable.match(CONTAINER_TOKEN_RE);
  const idleOrBusyToken = idleToken || busyToken;
  if (queueToken) {
    deps.queues.add(normalizeDependencyName(queueToken[1]));
  } else if (idleOrBusyToken) {
    deps.resources.add(normalizeDependencyName(idleOrBusyToken[1]));
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
  } else if (variable === "isWeekday" || variable === "isWeekend" || variable === "hourOfDay" || variable === "dayOfWeek") {
    deps.clock = true;
    deps.builtins.add(variable);
  } else if (variable.startsWith("Entity.")) {
    deps.entityAttrs.add(variable.slice("Entity.".length));
  } else if (variable.startsWith("Queue.")) {
    const parts = variable.split(".");
    deps.queues.add(normalizeDependencyName(parts[1]));
  } else if (variable.startsWith("Resource.")) {
    const parts = variable.split(".");
    deps.resources.add(normalizeDependencyName(parts[1]));
  } else if (variable.startsWith("state.")) {
    deps.stateVars.add(variable.slice("state.".length));
  } else if (variable && !variable.includes(".")) {
    deps.stateVars.add(variable);
  } else {
    deps.unknown = true;
  }
}

/** @param {any} predicate */
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
    addLeafDependency(deps, normalized.variable);
    // RHS resolution (see isResolvableExpression in compilePredicate) only covers the
    // five function-call-style tokens — track those as dependencies too so the
    // filtered-Phase-C dirty-tracking optimization re-evaluates when only the RHS's
    // referenced queue/resource/container changes.
    if (isResolvableExpression(normalized.value)) {
      addLeafDependency(deps, normalized.value);
    }
    // A state-variable RHS (B3) — tracked so the filtered Phase C re-evaluates
    // when that variable changes. Over-subscribing a bare literal that turns
    // out not to be a state variable only costs an extra re-evaluation.
    const rhsStateVar = stateVarRhsName(normalized.value);
    if (rhsStateVar) deps.stateVars.add(rhsStateVar.name);
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

/** @param {any} predicate */
export function compilePredicate(predicate) {
  if (predicate && typeof predicate === "object" && predicate[COMPILED_PREDICATE]) {
    return predicate[COMPILED_PREDICATE];
  }

  const normalized = migrateLegacyCondition(predicate);
  if (!normalized) return () => false;
  const deps = getPredicateDependencies(normalized);

  /** @type {(state: any) => boolean} */
  let compiled;
  if (normalized.operator === 'AND') {
    const clauses = (normalized.clauses || []).map(compilePredicate);
    compiled = (state) => clauses.every((/** @type {any} */ evaluate) => evaluate(state));
  } else if (normalized.operator === 'OR') {
    const clauses = (normalized.clauses || []).map(compilePredicate);
    compiled = (state) => clauses.some((/** @type {any} */ evaluate) => evaluate(state));
  } else {
    const variable = normalized.variable;
    const operator = normalized.operator;
    const value = normalized.value;
    // RHS resolution: a value string matching one of the same function-call-style
    // tokens the LHS resolves (queue(...)/idle(...)/busy(...)/container(...)/attr(...))
    // is treated as a dynamic reference instead of a literal — enables comparisons
    // like `queue(A).length < queue(B).length` (shortest-queue routing). Deliberately
    // scoped to just these five patterns; see isResolvableExpression for why a bare
    // state-variable name is excluded (ambiguous with a literal string of the same text).
    //
    // B3: a RHS of `state.<name>`, or a bare name that is a state variable in
    // this run, resolves to that variable's current value — e.g.
    // `clock >= closureStart`. See resolveStateVarRhs for the ambiguity rule.
    const rhsResolvable = isResolvableExpression(value);
    const rhsStateVar = rhsResolvable ? null : stateVarRhsName(value);
    compiled = (state) => {
      const st = state || {};
      const left = resolveVariable(variable, st);
      let right = value;
      if (rhsResolvable) {
        right = resolveVariable(value, st);
      } else if (rhsStateVar) {
        const hit = resolveStateVarRhs(rhsStateVar, st);
        if (hit.hit) right = hit.value;
      }
      return !!applyOperator(left, operator, right);
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


