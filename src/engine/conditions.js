// engine/conditions.js — Condition evaluator
//
// Two public evaluators are exported:
//   evaluatePredicate(predicate, state) — safe evaluator for Addition 1 §4 JSON predicates
//   evalCondition(conditionStr, helpers, state, clock) — legacy string evaluator (no new Function)
//
// EXTENDING evalCondition tokens:
//   1. Add a replacement rule in evalCondition below
//   2. Add it to the token list in ConditionBuilder.jsx UI component

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

function resolveVariable(ref, state) {
  const parts = ref.split('.');
  if (parts[0] === 'Entity') {
    // Entity.<attributeName>
    return state.currentEntity?.attrs?.[parts[1]];
  }
  if (parts[0] === 'Resource') {
    // Resource.<id>.<property>
    return state.resources?.[parts[1]]?.[parts[2]];
  }
  if (parts[0] === 'Queue') {
    // Queue.<id>.<property>
    return state.queues?.[parts[1]]?.[parts[2]];
  }
  if (parts.length === 1) {
    // Plain user-defined state variable
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
  if (predicate.operator === 'AND') {
    return (predicate.clauses || []).every(c => evaluatePredicate(c, state));
  }
  if (predicate.operator === 'OR') {
    return (predicate.clauses || []).some(c => evaluatePredicate(c, state));
  }
  const left = resolveVariable(predicate.variable, state);
  return !!applyOperator(left, predicate.operator, predicate.value);
}

/**
 * Evaluate a condition string against current simulation state.
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

    // queue(Type).length — check by queue field first, fall back to entity type
    expr = expr.replace(/queue\((\w+)\)\.length/g, (_, name) => {
      const inQueue = helpers.entities
        ? helpers.entities.filter(e =>
            e.queue?.toLowerCase() === name.toLowerCase() && e.status === 'waiting'
          ).length
        : 0;
      const byType = helpers.waitingOf(name).length;
      return String(inQueue > 0 ? inQueue : byType);
    });

    // idle(Type).count
    expr = expr.replace(/idle\((\w+)\)\.count/g,
      (_, t) => String(helpers.idleOf(t).length));

    // busy(Type).count
    expr = expr.replace(/busy\((\w+)\)\.count/g,
      (_, t) => String(helpers.busyOf(t).length));

    // attr(Type, attrName) — first idle server's attribute
    expr = expr.replace(/attr\((\w+)\s*,\s*(\w+)\)/g, (_, t, a) => {
      const e = helpers.idleOf(t)[0];
      const v = e?.attrs?.[a];
      return v === undefined ? "0" : typeof v === "string" ? `"${v}"` : String(v);
    });

    // Built-in counters
    expr = expr.replace(/\bserved\b/g,  String(state.__served  || 0));
    expr = expr.replace(/\breneged\b/g, String(state.__reneged || 0));
    expr = expr.replace(/\bclock\b/g,   String(clock));

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
export function buildConditionTokens(entityTypes = [], stateVariables = []) {
  const tokens = [];

  for (const et of entityTypes) {
    const name = et.name?.trim() || "";
    if (!name) continue;
    if (et.role === "customer") {
      tokens.push({
        label: `queue(${name}).length  — customers waiting`,
        value: `queue(${name}).length`,
        valueType: "number",
      });
    }
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

  tokens.push({ label: "served  — cumulative served",  value: "served",  valueType: "number" });
  tokens.push({ label: "reneged — cumulative reneged", value: "reneged", valueType: "number" });

  for (const sv of stateVariables) {
    if (sv.name) {
      tokens.push({
        label:     `${sv.name}  — ${sv.description || "state variable"}`,
        value:     sv.name,
        valueType: "number",
      });
    }
  }

  return tokens;
}

