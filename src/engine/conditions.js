// engine/conditions.js — Condition string evaluator
//
// EXTENDING: To add a new condition token (e.g. priority(Type).max):
//   1. Add a replacement rule in evalCondition below
//   2. Add it to the token list in ConditionBuilder.jsx UI component

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

    // eslint-disable-next-line no-new-func
    return !!new Function(`return (${expr})`)();
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

