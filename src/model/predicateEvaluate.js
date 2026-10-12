// model/predicateEvaluate.js — UI-side predicate evaluation against a live
// simulation snapshot (snap). Used by the Execute canvas to decide which
// conditional-routing branch is active at the current clock time, so a
// state-variable-driven diversion (e.g. hormuzOpen = 0 → Bypass Pipeline Queue)
// is visible while the run plays.
//
// This is deliberately NOT the engine's evaluatePredicate (src/engine/conditions.js):
// the engine evaluates against full runtime state (currentEntity, resources,
// queues, helpers), which the UI must not import (architecture rule — the only
// permitted engine bridge is buildEngine() in execute/index.jsx). The canvas
// only has the snapshot, so this evaluator resolves the subset of variables that
// are meaningful from a snapshot — state scalars, queue depths, and clock — and
// returns null (unresolvable) for anything needing runtime-only context
// (Entity.*, Resource.*, idle()/busy(), helpers). Unresolvable conditions are
// rendered neutrally rather than guessed.

const QUEUE_LEN_RE = /^queue\(([^)]+)\)\.(length|count|size)$/i;

/**
 * Resolve a single predicate variable reference against a snapshot.
 * Returns the resolved value, or undefined when the reference needs runtime
 * context the snapshot does not carry.
 *
 * @param {string} variable
 * @param {any} snap
 */
export function resolveSnapVariable(variable, snap) {
  if (!variable || !snap) return undefined;
  const ref = String(variable).trim();

  const queueMatch = ref.match(QUEUE_LEN_RE);
  if (queueMatch) {
    const qName = queueMatch[1].trim();
    const byQueue = snap.byQueue?.[qName];
    if (byQueue != null && byQueue.waiting != null) return byQueue.waiting;
    // Fallback: count waiting entities in that queue from the entity list.
    return (snap.entities || []).filter(
      e => e.role !== "server" && e.status === "waiting" && e.queue === qName,
    ).length;
  }

  if (ref === "clock") return snap.clock;
  if (ref === "served") return snap.served;
  if (ref === "reneged") return snap.reneged;
  if (ref === "balked") return snap.balked;

  if (ref.startsWith("state.")) {
    const name = ref.slice("state.".length);
    if (snap.scalars && Object.prototype.hasOwnProperty.call(snap.scalars, name)) return snap.scalars[name];
    return undefined;
  }

  if (!ref.includes(".")) {
    if (snap.scalars && Object.prototype.hasOwnProperty.call(snap.scalars, ref)) return snap.scalars[ref];
    return undefined;
  }

  // Entity.*, Resource.*, Queue.<id>.*, idle()/busy()/container()/attr() —
  // need runtime context the snapshot does not carry.
  return undefined;
}

// RHS resolution mirrors the engine's B3 rule: a string value that is a
// resolvable expression (queue(...).length) or names a state variable resolves
// to that value; anything else is a literal.
function resolveSnapRhs(value, snap) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (QUEUE_LEN_RE.test(trimmed)) return resolveSnapVariable(trimmed, snap);
    if (snap.scalars && Object.prototype.hasOwnProperty.call(snap.scalars, trimmed)) return snap.scalars[trimmed];
  }
  return value;
}

function applySnapOperator(left, operator, right) {
  switch (operator) {
    case "==": return left === right;
    case "!=": return left !== right;
    case "<":  return left < right;
    case ">":  return left > right;
    case "<=": return left <= right;
    case ">=": return left >= right;
    default:   return null;
  }
}

/**
 * Evaluate a predicate JSON object against a snapshot.
 * Returns true / false, or null when the predicate cannot be resolved from the
 * snapshot (references runtime-only context, or a legacy string condition).
 *
 * @param {object|string} predicate
 * @param {any} snap
 * @returns {boolean|null}
 */
export function evaluateSnapPredicate(predicate, snap) {
  if (!predicate || !snap) return null;

  // Legacy condition strings need the engine's parser — treat as unresolvable.
  if (typeof predicate === "string") return null;

  if (predicate.operator === "AND" || predicate.operator === "OR") {
    const clauses = predicate.clauses || [];
    if (!clauses.length) return predicate.operator === "AND";
    const results = clauses.map(c => evaluateSnapPredicate(c, snap));
    if (predicate.operator === "AND") {
      if (results.some(r => r === false)) return false;
      if (results.some(r => r === null)) return null;
      return true;
    }
    if (results.some(r => r === true)) return true;
    if (results.some(r => r === null)) return null;
    return false;
  }

  const left = resolveSnapVariable(predicate.variable, snap);
  if (left === undefined) return null;
  const right = resolveSnapRhs(predicate.value, snap);
  if (right === undefined) return null;
  return applySnapOperator(left, predicate.operator, right);
}

/**
 * Collect the state-variable names a predicate references — both the left-hand
 * variable (bare name or `state.<name>`) and any right-hand string that names a
 * state variable. Used to badge the activity node whose routing a switch
 * controls.
 *
 * @param {object|string} predicate
 * @param {Set<string>|string[]} [knownNames] declared state-var names; when
 *   given, only names in this set are returned, so an RHS literal (e.g. a queue
 *   name) is never mistaken for a switch.
 * @returns {Set<string>}
 */
export function collectConditionStateVars(predicate, knownNames) {
  const out = new Set();
  if (!predicate || typeof predicate === "string") return out;
  const known = knownNames
    ? (knownNames instanceof Set ? knownNames : new Set(knownNames))
    : null;
  const add = (name) => {
    if (!name) return;
    if (known && !known.has(name)) return;
    out.add(name);
  };
  const addRef = (raw) => {
    if (typeof raw !== "string") return;
    const ref = raw.trim();
    if (ref.startsWith("state.")) add(ref.slice("state.".length));
    else if (!ref.includes(".") && !QUEUE_LEN_RE.test(ref)) add(ref);
  };

  const walk = (node) => {
    if (!node || typeof node === "string") return;
    if (node.operator === "AND" || node.operator === "OR") {
      for (const clause of node.clauses || []) walk(clause);
      return;
    }
    addRef(node.variable);
    addRef(node.value);
  };
  walk(predicate);
  return out;
}

/**
 * Map each graph node id to the state-variable names referenced by the
 * conditional-routing branches that originate from it. The Execute canvas uses
 * this to badge an activity node with the switch(es) that decide its routing.
 *
 * @param {{edges?: any[]}} graph
 * @param {{bEvents?: any[], stateVariables?: any[]}} model
 * @returns {Map<string, string[]>} node id → state-var names (deduped)
 */
export function computeRoutingSwitchDeps(graph, model) {
  const result = new Map();
  if (!graph) return result;
  const known = new Set((model?.stateVariables || []).map(sv => sv.name));
  if (!known.size) return result;
  const bEventById = new Map((model?.bEvents || []).map(be => [be.id, be]));

  for (const edge of graph.edges || []) {
    if (edge.source !== "routing" && edge.source !== "terminal") continue;
    if (edge.bEventId == null || edge.branchIndex == null || edge.branchIndex === "default") continue;
    const branch = bEventById.get(edge.bEventId)?.routing?.[edge.branchIndex];
    if (!branch?.condition) continue;
    const names = collectConditionStateVars(branch.condition, known);
    if (!names.size) continue;
    const existing = result.get(edge.from) || new Set();
    for (const n of names) existing.add(n);
    result.set(edge.from, existing);
  }

  const out = new Map();
  for (const [nodeId, names] of result) out.set(nodeId, [...names]);
  return out;
}

/**
 * Compute the live active/inactive state of every conditional-routing edge in
 * the graph, given the current snapshot.
 *
 * @param {{edges?: any[]}} graph - derived graph (edges carry bEventId + branchIndex)
 * @param {{bEvents?: any[]}} model
 * @param {any} snap
 * @returns {Map<string, {active: boolean, resolvable: boolean}>} keyed by edge id
 */
export function computeRoutingBranchStates(graph, model, snap) {
  const result = new Map();
  if (!snap || !graph) return result;

  const bEventById = new Map((model?.bEvents || []).map(be => [be.id, be]));
  const edgesByBEvent = new Map();
  for (const edge of graph.edges || []) {
    if (edge.source !== "routing" && edge.source !== "terminal") continue;
    if (edge.bEventId == null || edge.branchIndex == null) continue;
    if (!edgesByBEvent.has(edge.bEventId)) edgesByBEvent.set(edge.bEventId, []);
    edgesByBEvent.get(edge.bEventId).push(edge);
  }

  for (const [bEventId, edgeList] of edgesByBEvent) {
    const bEvent = bEventById.get(bEventId);
    if (!bEvent) continue;
    // Only conditional routing has branch conditions to evaluate. Probabilistic
    // routing (and fixed RELEASE) has no fallback edge to reason about.
    if (!Array.isArray(bEvent.routing) || bEvent.routing.length === 0) continue;
    const conditional = edgeList.filter(e => e.branchIndex !== "default");
    const defaults = edgeList.filter(e => e.branchIndex === "default");

    let anyActive = false;
    let anyResolvable = false;
    for (const edge of conditional) {
      const branch = bEvent.routing?.[edge.branchIndex];
      if (!branch?.condition) continue;
      const truth = evaluateSnapPredicate(branch.condition, snap);
      const active = truth === true;
      const resolvable = truth != null;
      if (active) anyActive = true;
      if (resolvable) anyResolvable = true;
      result.set(edge.id, { active, resolvable });
    }

    // The default (fallback) branch is live only when no conditional branch
    // matched — and only when at least one condition was resolvable, so we
    // never claim the fallback is active based on conditions we can't evaluate.
    for (const edge of defaults) {
      result.set(edge.id, { active: !anyActive && anyResolvable, resolvable: anyResolvable });
    }
  }

  return result;
}
