// @ts-check
// engine/simpy-export.js — Export a DES Studio model as a runnable SimPy Python script
//
// exportToSimPy(model) → { script: string, category: 1 | 2, todoMacros: string[], warnings: string[] }
//   category 1 — fully runnable; no manual edits needed
//   category 2 — partial; sections marked with # NOT SUPPORTED require user completion
//   warnings   — semantic divergences from the native engine that aren't auto-translated:
//                non-FIFO queue discipline, unsupported/unconfigured distributions,
//                DRAIN semantics, untranslatable routing conditions (branch always
//                taken), and TODO_MACRO_SET macros (no code generated at all)

// Macros whose SimPy translation requires manual completion
const TODO_MACRO_SET = new Set([
  'RENEGE', 'BATCH', 'RENEGE_OLDEST', 'MATCH', 'FAIL', 'REPAIR', 'PREEMPT', 'FINISH', 'RELEASE_COSEIZED', 'JOIN',
]);

// ── Public API ────────────────────────────────────────────────────────────────

/** @param {Record<string, any>} model */
export function exportToSimPy(model) {
  const todoMacros = collectTodoMacros(model);
  const category = todoMacros.length > 0 ? 2 : 1;
  /** @type {string[]} */
  const warnings = [];
  const script = buildScript(model, new Set(todoMacros), warnings);
  return { script, category, todoMacros, warnings };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * @param {any} effect
 * @returns {string}
 */
function effectText(effect) {
  if (!effect) return '';
  if (Array.isArray(effect)) return effect.map(effectText).filter(Boolean).join(';');
  if (effect && typeof effect === 'object') {
    if (typeof effect.effect === 'string') return effect.effect;
    const macro = String(effect.macro || effect.type || effect.name || '').trim();
    if (!macro) return '';
    const args = Array.isArray(effect.args)
      ? effect.args
      : [effect.entityType || effect.customerType || effect.queue || effect.serverType,
         effect.serverType].filter(Boolean);
    return `${macro}(${args.join(',')})`;
  }
  return String(effect || '');
}

/** @param {Record<string, any>} model */
function collectTodoMacros(model) {
  const found = new Set();
  const events = [...(model.bEvents || []), ...(model.cEvents || [])];
  for (const ev of events) {
    const text = effectText(ev.effect);
    for (const m of TODO_MACRO_SET) {
      if (new RegExp(`\\b${m}\\s*\\(`, 'i').test(text)) found.add(m);
    }
  }
  return [...found].sort();
}

// Convert a name string to a valid Python identifier
/** @param {any} name */
function safeId(name) {
  const s = String(name || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/^([0-9])/, '_$1');
  return s || 'unnamed';
}

// Parse one COSEIZE argument "Type[Skill]:N" — mirrors the engine's own
// runtime parser (src/engine/macros.js COSEIZE handler) so the syntax means
// the same thing in the live engine and the exported SimPy script. This
// module has no JS import path into macros.js, so this is a deliberate,
// kept-in-sync duplication (same pattern this file already uses elsewhere).
// Stripping "[Skill]" here also fixes a pre-existing bug: safeId() alone
// doesn't remove brackets, so a skilled arg like "Doctor[Surgery]" used to
// generate a resource variable name ("DoctorSurgery_resource") that matched
// nothing actually declared.
/** @param {any} arg */
function parseCoseizeArg(arg) {
  const m = String(arg || '').trim().match(/^([^\[:]+?)\s*(?:\[\s*([^\]]+?)\s*\])?\s*(?::\s*(\d+))?$/);
  if (!m) return { type: String(arg || '').trim(), skill: null, qty: 1 };
  const rawQty = m[3] ? parseInt(m[3], 10) : 1;
  return { type: m[1].trim(), skill: m[2] ? m[2].trim() : null, qty: (Number.isFinite(rawQty) && rawQty > 0) ? rawQty : 1 };
}

// Convert to PascalCase class name
/** @param {any} name */
function toPascal(name) {
  return String(name || '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join('') || 'Entity';
}

/** @param {any} dist */
function normalizeDistName(dist) {
  const d = String(dist || '').toLowerCase().replace(/[_\s-]/g, '');
  /** @type {Record<string, string>} */
  const map = {
    exponential: 'Exponential', exp: 'Exponential',
    uniform: 'Uniform',
    normal: 'Normal', gaussian: 'Normal',
    triangular: 'Triangular',
    fixed: 'Fixed', constant: 'Fixed',
    erlang: 'Erlang',
    lognormal: 'Lognormal', lognormvariate: 'Lognormal',
  };
  return map[d] || null;
}

/**
 * @param {any} dist
 * @param {Record<string, any>} [distParams]
 */
function distToExpr(dist, distParams) {
  const d = normalizeDistName(dist);
  const p = distParams || {};
  switch (d) {
    case 'Exponential': return `_exp(${+(p.mean ?? 1)})`;
    case 'Uniform':     return `_uniform(${+(p.min ?? 0)}, ${+(p.max ?? 1)})`;
    case 'Normal':      return `_normal(${+(p.mean ?? 1)}, ${+(p.stddev ?? 0.1)})`;
    case 'Triangular':  return `_triangular(${+(p.min ?? 0)}, ${+(p.mode ?? 0.5)}, ${+(p.max ?? 1)})`;
    case 'Fixed':       return `_fixed(${+(p.value ?? 1)})`;
    case 'Erlang':      return `_erlang(${+(p.k ?? 1)}, ${+(p.mean ?? 1)})`;
    case 'Lognormal':   return `_lognormal(${+(p.logMean ?? 0)}, ${+(p.logStdDev ?? 1)})`;
    default: break;
  }
  const raw = String(dist || '').toLowerCase().replace(/[_\s-]/g, '');
  if (raw === 'empirical') {
    const vals = Array.isArray(p.values) ? p.values.map(Number) : [1];
    return `random.choice([${vals.join(', ')}])`;
  }
  // Piecewise and Schedule are handled specially in the caller — return safe fallback
  return `1.0`;
}

// Returns a comment string for distributions that fall back to 1.0, null otherwise
/** @param {any} dist */
function distUnsupportedNote(dist) {
  if (!dist) return null;
  if (normalizeDistName(dist)) return null;
  const raw = String(dist).toLowerCase().replace(/[_\s-]/g, '');
  if (raw === 'empirical' || raw === 'piecewise' || raw === 'schedule') return null;
  return `# NOTE: distribution "${dist}" not auto-translated — using fallback value 1.0`;
}

// Returns true if this schedule entry uses a Piecewise distribution
/** @param {Record<string, any>} [sched] */
function isPiecewiseDist(sched) {
  const raw = String(sched?.dist || '').toLowerCase().replace(/[_\s-]/g, '');
  return raw === 'piecewise';
}

// Returns true if this schedule entry uses a Schedule (planned absolute times) distribution
/** @param {Record<string, any>} [sched] */
function isScheduleDist(sched) {
  const raw = String(sched?.dist || '').toLowerCase().replace(/[_\s-]/g, '');
  return raw === 'schedule';
}

// Generate a _piecewise_NAME(t) helper function for a piecewise distribution
/**
 * @param {string} fnName
 * @param {any[]} periods
 */
function buildPiecewiseFn(fnName, periods) {
  const validPeriods = (periods || []).filter(p => p.dist);
  if (validPeriods.length === 0) return `def ${fnName}(t):\n    return 1.0\n`;
  const entries = validPeriods.map(p => {
    const expr = distToExpr(p.dist, p.distParams || {});
    return `        (${+(p.startTime ?? 0)}, lambda: ${expr})`;
  });
  return `def ${fnName}(t):
    _periods = [
${entries.join(',\n')},
    ]
    _fn = _periods[0][1]
    for _start, _f in reversed(_periods):
        if t >= _start:
            _fn = _f
            break
    return _fn()
`;
}

/**
 * @param {any} dist
 * @param {Record<string, any>} [distParams]
 */
function distLabel(dist, distParams) {
  const d = normalizeDistName(dist);
  const p = distParams || {};
  switch (d) {
    case 'Exponential': return `Exponential(mean=${p.mean ?? 1})`;
    case 'Uniform':     return `Uniform(min=${p.min ?? 0}, max=${p.max ?? 1})`;
    case 'Normal':      return `Normal(mean=${p.mean ?? 1}, stddev=${p.stddev ?? 0.1})`;
    case 'Triangular':  return `Triangular(min=${p.min ?? 0}, mode=${p.mode ?? 0.5}, max=${p.max ?? 1})`;
    case 'Fixed':       return `Fixed(value=${p.value ?? 1})`;
    case 'Erlang':      return `Erlang(k=${p.k ?? 1}, mean=${p.mean ?? 1})`;
    case 'Lognormal':   return `Lognormal(logMean=${p.logMean ?? 0}, logStdDev=${p.logStdDev ?? 1})`;
    default:            return `${dist || 'unknown'}(${JSON.stringify(p)})`;
  }
}

// Parse effect string into array of { name, rawArgs } macro calls
/** @param {any} effectStr */
function parseMacroCalls(effectStr) {
  if (!effectStr) return [];
  const calls = [];
  for (const part of effectStr.split(';').map((/** @type {any} */ s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\w+)\((.*)\)$/is);
    if (m) calls.push({ name: m[1].toUpperCase(), rawArgs: m[2].trim(), raw: part });
  }
  return calls;
}

/**
 * @param {any} effectStr
 * @param {string} macroName
 */
function findMacroCall(effectStr, macroName) {
  return parseMacroCalls(effectStr).find(c => c.name === macroName) || null;
}

// Find the B-event that is the "completion" event for a C-event (via cSchedules[0].eventId)
/**
 * @param {Record<string, any>} cEvent
 * @param {Record<string, any>[]} bEvents
 */
function findCompletionBEvent(cEvent, bEvents) {
  for (const cs of (cEvent.cSchedules || [])) {
    if (cs.eventId) {
      const be = bEvents.find(b => b.id === cs.eventId);
      if (be) return be;
    }
  }
  // Heuristic fallback: single B-event with COMPLETE() and no schedule
  const terminals = (bEvents || []).filter(b => {
    const t = effectText(b.effect);
    return /COMPLETE\s*\(\s*\)/i.test(t) && !(b.schedules && b.schedules.length > 0);
  });
  return terminals.length === 1 ? terminals[0] : null;
}

// Get service time distribution from a C-event's cSchedules
/** @param {Record<string, any>} cEvent */
function getServiceDist(cEvent) {
  const cs = (cEvent.cSchedules || []).find((/** @type {any} */ s) => s.dist || s.distribution);
  if (!cs) return { dist: 'Fixed', distParams: { value: 1 }, placeholder: true };
  return { dist: cs.dist || 'Exponential', distParams: cs.distParams || {}, placeholder: false };
}

// Translate a predicate condition to a Python boolean expression. When a
// condition can't be translated, the emitted branch is always taken — this
// actively diverges from the real model's behaviour, not just "incomplete" —
// so it pushes a NOT SUPPORTED warning (surfaced in the export UI) alongside
// the matching comment in the generated code.
/**
 * @param {any} condition
 * @param {string[]} warnings
 * @param {string} [context]
 */
function predicateToExpr(condition, warnings, context) {
  if (!condition) return 'True';
  if (typeof condition === 'string') {
    warnings.push(`NOT SUPPORTED: routing condition "${condition}"${context ? ` on ${context}` : ''} could not be translated — branch always taken`);
    return `True  # NOT SUPPORTED: translate condition string: ${condition.replace(/\n/g, ' ')}`;
  }
  if (typeof condition !== 'object') return 'True';

  if (condition.operator === 'AND' || condition.operator === 'OR') {
    const op = condition.operator === 'AND' ? ' and ' : ' or ';
    const sub = (condition.clauses || []).map((/** @type {any} */ c) => predicateToExpr(c, warnings, context));
    return sub.length ? `(${sub.join(op)})` : 'True';
  }

  const variable = String(condition.variable || '');
  const opStr = String(condition.op || condition.operator || '==');
  const value = condition.value ?? 0;
  /** @type {Record<string, string>} */
  const opMap = {
    '==': '==', 'eq': '==', 'neq': '!=', '!=': '!=',
    '>': '>', 'gt': '>', '>=': '>=', 'gte': '>=',
    '<': '<', 'lt': '<', '<=': '<=', 'lte': '<=',
  };
  const pyOp = opMap[opStr.toLowerCase()] || '==';

  const attrMatch = variable.match(/^Entity\.(\w+)$/i);
  if (attrMatch) {
    return `getattr(entity, "${safeId(attrMatch[1])}", None) ${pyOp} ${JSON.stringify(value)}`;
  }
  // Queue length or other complex references
  warnings.push(`NOT SUPPORTED: routing condition variable "${variable}"${context ? ` on ${context}` : ''} could not be translated — branch always taken`);
  return `True  # NOT SUPPORTED: translate condition variable "${variable}" ${opStr} ${JSON.stringify(value)}`;
}

// Generate routing code after service completion for one B-event
/**
 * @param {Record<string, any>|null} completionBEvent
 * @param {Record<string, any>[]} queues
 * @param {string[]} warnings
 * @param {string} [statsRef]
 */
function routingCode(completionBEvent, queues, warnings, statsRef = 'stats') {
  if (!completionBEvent) {
    return `    # Entity completes journey\n    if env.now >= WARMUP_PERIOD:\n        ${statsRef}.served.append(entity)\n`;
  }

  const effText = effectText(completionBEvent.effect);
  const lines = [];

  // Conditional routing table
  const routing = (completionBEvent.routing || []).filter((/** @type {any} */ r) =>
    r.condition && (r.queueName !== undefined)
  );
  if (routing.length > 0) {
    lines.push(`    # Conditional routing from B-event "${completionBEvent.name}"`);
    routing.forEach((/** @type {any} */ branch, /** @type {number} */ i) => {
      const cond = predicateToExpr(branch.condition, warnings, `B-event "${completionBEvent.name}"`);
      const keyword = i === 0 ? 'if' : 'elif';
      lines.push(`    ${keyword} ${cond}:`);
      if (branch.queueName) {
        const storeId = safeId(branch.queueName) + '_store';
        lines.push(`        entity.queue_join_time = env.now`);
        lines.push(`        yield ${storeId}.put(entity)`);
      } else {
        lines.push(`        if env.now >= WARMUP_PERIOD:`);
        lines.push(`            ${statsRef}.served.append(entity)`);
      }
    });
    const defQ = completionBEvent.defaultQueueName;
    if (defQ) {
      lines.push(`    else:`);
      lines.push(`        entity.queue_join_time = env.now`);
      lines.push(`        yield ${safeId(defQ)}_store.put(entity)`);
    } else {
      lines.push(`    else:`);
      lines.push(`        if env.now >= WARMUP_PERIOD:`);
      lines.push(`            ${statsRef}.served.append(entity)`);
    }
    return lines.join('\n') + '\n';
  }

  // Probabilistic routing table
  const probRouting = completionBEvent.probabilisticRouting || [];
  if (probRouting.length > 0) {
    lines.push(`    # Probabilistic routing from B-event "${completionBEvent.name}"`);
    lines.push(`    _r = random.random()`);
    let cumulative = 0;
    probRouting.forEach((/** @type {any} */ branch, /** @type {number} */ i) => {
      const prob = parseFloat(branch.probability) || 0;
      cumulative += prob;
      const keyword = i === 0 ? 'if' : 'elif';
      lines.push(`    ${keyword} _r < ${cumulative.toFixed(6)}:`);
      if (branch.queueName) {
        lines.push(`        entity.queue_join_time = env.now`);
        lines.push(`        yield ${safeId(branch.queueName)}_store.put(entity)`);
      } else {
        lines.push(`        if env.now >= WARMUP_PERIOD:`);
        lines.push(`            ${statsRef}.served.append(entity)`);
      }
    });
    lines.push(`    else:`);
    lines.push(`        if env.now >= WARMUP_PERIOD:`);
    lines.push(`            ${statsRef}.served.append(entity)`);
    return lines.join('\n') + '\n';
  }

  // Single default queue
  const defQ = completionBEvent.defaultQueueName;
  if (defQ) {
    lines.push(`    # Route to "${defQ}" (defaultQueueName from B-event "${completionBEvent.name}")`);
    lines.push(`    entity.queue_join_time = env.now`);
    lines.push(`    yield ${safeId(defQ)}_store.put(entity)`);
    return lines.join('\n') + '\n';
  }

  // RELEASE with target queue
  const releaseCall = findMacroCall(effText, 'RELEASE');
  if (releaseCall) {
    const releaseArgs = releaseCall.rawArgs.split(',').map((/** @type {any} */ s) => s.trim());
    const targetQ = releaseArgs[1];
    if (targetQ) {
      lines.push(`    # RELEASE — return entity to "${targetQ}"`);
      lines.push(`    entity.queue_join_time = env.now`);
      lines.push(`    yield ${safeId(targetQ)}_store.put(entity)`);
      return lines.join('\n') + '\n';
    }
  }

  // Default: COMPLETE() — entity exits
  lines.push(`    # COMPLETE() — entity exits system`);
  lines.push(`    if env.now >= WARMUP_PERIOD:`);
  lines.push(`        ${statsRef}.served.append(entity)`);
  return lines.join('\n') + '\n';
}

// ── Script builder ────────────────────────────────────────────────────────────

/**
 * @param {Record<string, any>} model
 * @param {Set<string>} todoSet
 * @param {string[]} [warnings]
 */
function buildScript(model, todoSet, warnings = []) {
  const bEvents     = model.bEvents     || [];
  const cEvents     = model.cEvents     || [];
  const entityTypes = model.entityTypes || [];
  const queues      = model.queues      || [];
  const stateVars   = model.stateVariables || [];
  const containers  = model.containerTypes || [];
  const expDef      = model.experimentDefaults || {};

  const maxSimTime   = +(expDef.maxSimTime  ?? model.maxSimTime  ?? 500);
  const warmupPeriod = +(expDef.warmupPeriod ?? model.warmupPeriod ?? 0);
  const replications = +(expDef.replications ?? model.replications ?? 1);
  const timeUnit     = model.timeUnit || 'minutes';

  const servers   = entityTypes.filter((/** @type {any} */ e) => e.role === 'server');
  const customers = entityTypes.filter((/** @type {any} */ e) => e.role !== 'server');

  const now = new Date().toISOString().split('T')[0];
  const category = todoSet.size > 0 ? 2 : 1;
  const todoList = [...todoSet];

  // These macros produce no generated code at all at their usage site — warn
  // per actual event, not just per macro name, so it's traceable to what
  // needs fixing (not just that something in the model does).
  if (todoSet.size > 0) {
    for (const ev of [...bEvents, ...cEvents]) {
      const text = effectText(ev.effect);
      for (const m of todoSet) {
        if (new RegExp(`\\b${m}\\s*\\(`, 'i').test(text)) {
          warnings.push(`NOT SUPPORTED: ${m} at "${ev.name}" — no code generated, see the "${m}" pattern near the end of the script`);
        }
      }
    }
  }

  const parts = [];

  // ── Header docstring ───────────────────────────────────────────────────────
  const catMsg = category === 1
    ? 'Category 1 — complete and runnable.'
    : `Category 2 — partial; complete the # NOT SUPPORTED sections before running.\n#   Macros requiring attention: ${todoList.join(', ')}`;
  parts.push(
`"""
flow → SimPy export
Model    : ${model.name || 'Untitled'}
Generated: ${now}
${catMsg}

Requirements: pip install simpy
SimPy docs  : https://simpy.readthedocs.io/
"""
`);

  // ── Imports ────────────────────────────────────────────────────────────────
  parts.push(
`import simpy
import random
import math
import statistics
import json
from dataclasses import dataclass, field
from typing import List, Dict, Optional
`);

  // ── Configuration ──────────────────────────────────────────────────────────
  parts.push(
`# ── Configuration ────────────────────────────────────────────────────────────
MAX_SIM_TIME   = ${maxSimTime}   # ${timeUnit}
WARMUP_PERIOD  = ${warmupPeriod} # ${timeUnit}
REPLICATIONS   = ${replications}
BASE_SEED      = 42
RUN_MODE       = "text"  # set to "json" for machine-readable JSONL output
`);

  // ── Distribution samplers ──────────────────────────────────────────────────
  parts.push(
`# ── Distribution samplers ────────────────────────────────────────────────────
def _exp(mean):               return random.expovariate(1.0 / mean)
def _uniform(lo, hi):         return random.uniform(lo, hi)
def _normal(mu, sd):          return max(0.0, random.gauss(mu, sd))
def _triangular(lo, mode, hi):return random.triangular(lo, hi, mode)
def _fixed(v):                return float(v)
def _erlang(k, mean):
    rate = k / mean
    return sum(random.expovariate(rate) for _ in range(int(k)))
def _lognormal(log_mean, log_sd): return random.lognormvariate(log_mean, log_sd)
`);

  // ── State variables ────────────────────────────────────────────────────────
  if (stateVars.length > 0) {
    const svLines = ['# ── State variables ──────────────────────────────────────────────────────────'];
    for (const sv of stateVars) {
      const init = sv.initialValue !== undefined && sv.initialValue !== null && sv.initialValue !== ''
        ? JSON.stringify(sv.initialValue)
        : (sv.valueType === 'string' ? '""' : sv.valueType === 'boolean' ? 'False' : '0');
      svLines.push(`${safeId(sv.name)} = ${init}  # ${sv.description || sv.valueType || 'number'}`);
    }
    parts.push(svLines.join('\n') + '\n');
  }

  // ── Entity dataclasses ─────────────────────────────────────────────────────
  const entityClassParts = ['# ── Entity dataclasses ──────────────────────────────────────────────────────'];
  for (const et of customers) {
    const cls = toPascal(et.name);
    const attrLines = [
      '    id: int',
      '    arrival_time: float = 0.0',
      '    sojourn_time: float = 0.0',
      '    service_start_time: float = 0.0',
      '    queue_join_time: float = 0.0',
      '    wait_time_acc: float = 0.0',
      '    svc_time_acc: float = 0.0',
    ];
    for (const a of (et.attrDefs || [])) {
      const pyType = a.valueType === 'string' ? 'str' : a.valueType === 'boolean' ? 'bool' : 'float';
      const defVal = a.defaultValue !== undefined && a.defaultValue !== null && a.defaultValue !== ''
        ? JSON.stringify(+a.defaultValue || a.defaultValue)
        : (pyType === 'str' ? '""' : pyType === 'bool' ? 'False' : '0.0');
      attrLines.push(`    ${safeId(a.name)}: ${pyType} = ${defVal}`);
    }
    entityClassParts.push(`@dataclass\nclass ${cls}:\n${attrLines.join('\n')}\n`);
  }
  // Always provide a fallback generic Entity for models with no customer types
  if (customers.length === 0) {
    entityClassParts.push(`@dataclass\nclass Entity:\n    id: int\n    arrival_time: float = 0.0\n    sojourn_time: float = 0.0\n    service_start_time: float = 0.0\n    queue_join_time: float = 0.0\n    wait_time_acc: float = 0.0\n    svc_time_acc: float = 0.0\n`);
  }
  parts.push(entityClassParts.join('\n') + '\n');

  // ── Statistics collector ───────────────────────────────────────────────────
  parts.push(
`# ── Statistics collector ─────────────────────────────────────────────────────
class Stats:
    def __init__(self):
        self.served:     List = []
        self.reneged:    List = []
        self.total:      int  = 0
        self.total_cost: float = 0.0
        self.resource_busy: Dict[str, float] = {}
`);

  // ── Arrival processes ──────────────────────────────────────────────────────
  const arrivalBEvents = bEvents.filter((/** @type {any} */ b) => /ARRIVE\s*\(/i.test(effectText(b.effect)));
  if (arrivalBEvents.length > 0) {
    const arrParts = ['# ── Arrival processes ───────────────────────────────────────────────────────'];
    for (const b of arrivalBEvents) {
      const effT = effectText(b.effect);
      const arriveCall = findMacroCall(effT, 'ARRIVE');
      if (!arriveCall) continue;
      const arrArgs = arriveCall.rawArgs.split(',').map((/** @type {any} */ s) => s.trim());
      const customerTypeName = arrArgs[0];
      const queueName = arrArgs[1] || (customerTypeName + 'Queue');
      const storeId = safeId(queueName) + '_store';
      const fnName = 'arrival_' + safeId(b.name || 'process');
      const cls = customers.find((/** @type {any} */ e) =>
        e.name.trim().toLowerCase() === customerTypeName.trim().toLowerCase()
      );
      const entityClass = cls ? toPascal(cls.name) : 'Entity';

      // Get inter-arrival distribution from first schedule. A schedule entry with
      // top-level rows[]/times[] but no explicit `dist` is implicitly "Schedule"
      // — mirrors phases.js's own normalization for planned absolute-time arrivals,
      // which the SimPy export previously missed (falling back to Exponential(mean=1)
      // and silently dropping the real planned arrivals).
      const sched = (b.schedules || []).find((/** @type {any} */ s) => s.dist || s.distribution || s.rows || s.times);
      const schedHasPlan = !!(sched && (sched.rows || sched.times));
      const iaDist = sched?.dist || (schedHasPlan ? 'Schedule' : 'Exponential');
      const iaParams = schedHasPlan
        ? { ...(sched.rows ? { rows: sched.rows } : { times: sched.times }), ...(sched.distParams || {}) }
        : (sched?.distParams || { mean: 1 });
      const iaLabel = distLabel(iaDist, iaParams);

      // Check for balking — balking is configured on the queue itself (F11.2);
      // fall back to the legacy B-event field for pre-migration models.
      const targetQueue = queues.find((/** @type {any} */ q) => (q.name || '').trim().toLowerCase() === queueName.trim().toLowerCase());
      const balkProb = targetQueue?.balkProbability != null ? parseFloat(targetQueue.balkProbability)
        : (b.balkProbability != null ? parseFloat(b.balkProbability) : null);

      let fnBody = `def ${fnName}(env, ${storeId}, stats):\n`;
      fnBody += `    """B-event "${b.name}": ARRIVE(${customerTypeName}, ${queueName})"""\n`;
      fnBody += `    _counter = 0\n`;

      if (isScheduleDist({ dist: iaDist })) {
        // Planned absolute-time arrivals — fire once at each scheduled time
        const rows = (iaParams?.rows || iaParams?.times?.map?.((/** @type {any} */ t, /** @type {number} */ i) => ({ time: t })) || []);
        const entries = rows.map((/** @type {any} */ r) => {
          const t = +(r.time ?? 0);
          const attrs = Object.entries(r.attrs || {})
            .filter(([k]) => k !== 'time')
            .map(([k, v]) => `"${safeId(k)}": ${JSON.stringify(v)}`)
            .join(', ');
          return attrs ? `        (${t}, {${attrs}})` : `        (${t}, {})`;
        });
        fnBody += `    _schedule = [\n${entries.join(',\n')}\n    ]\n`;
        fnBody += `    for _t, _attrs in _schedule:\n`;
        fnBody += `        yield env.timeout(max(0.0, _t - env.now))\n`;
        fnBody += `        _counter += 1\n`;
        fnBody += `        if env.now >= WARMUP_PERIOD: stats.total += 1\n`;
        fnBody += `        entity = ${entityClass}(id=_counter, arrival_time=env.now)\n`;
        fnBody += `        for _k, _v in _attrs.items():\n`;
        fnBody += `            try: setattr(entity, _k, _v)\n`;
        fnBody += `            except AttributeError: pass\n`;
        fnBody += `        entity.queue_join_time = env.now\n`;
        fnBody += `        yield ${storeId}.put(entity)\n`;
      } else if (isPiecewiseDist({ dist: iaDist })) {
        // Time-varying arrivals — generate a helper function and reference it
        const helperFn = `_piecewise_${fnName}`;
        const periods = iaParams?.periods || [];
        arrParts.unshift(buildPiecewiseFn(helperFn, periods));
        fnBody += `    while True:\n`;
        fnBody += `        yield env.timeout(${helperFn}(env.now))  # inter-arrival: ${iaLabel}\n`;
        fnBody += `        _counter += 1\n`;
        fnBody += `        if env.now >= WARMUP_PERIOD: stats.total += 1\n`;
        if (balkProb != null && balkProb > 0) {
          fnBody += `        if random.random() < ${balkProb}:  # balking probability\n`;
          fnBody += `            continue\n`;
        }
        fnBody += `        entity = ${entityClass}(id=_counter, arrival_time=env.now)\n`;
        fnBody += `        entity.queue_join_time = env.now\n`;
        fnBody += `        yield ${storeId}.put(entity)\n`;
      } else {
        const iaExpr = distToExpr(iaDist, iaParams);
        const iaNote = distUnsupportedNote(iaDist);
        if (iaNote) warnings.push(`${b.name || 'arrival'}: ${iaNote.replace(/^#\s*/, '')}`);
        fnBody += `    while True:\n`;
        if (iaNote) fnBody += `        ${iaNote}\n`;
        fnBody += `        yield env.timeout(${iaExpr})  # inter-arrival: ${iaLabel}\n`;
        fnBody += `        _counter += 1\n`;
        fnBody += `        if env.now >= WARMUP_PERIOD: stats.total += 1\n`;
        if (balkProb != null && balkProb > 0) {
          fnBody += `        if random.random() < ${balkProb}:  # balking probability\n`;
          fnBody += `            continue\n`;
        }
        fnBody += `        entity = ${entityClass}(id=_counter, arrival_time=env.now)\n`;
        fnBody += `        entity.queue_join_time = env.now\n`;
        fnBody += `        yield ${storeId}.put(entity)\n`;
      }

      arrParts.push(fnBody);
    }
    parts.push(arrParts.join('\n') + '\n');
  }

  // ── Service processes ──────────────────────────────────────────────────────
  const assignCEvents = cEvents.filter((/** @type {any} */ c) => {
    const t = effectText(c.effect);
    return /ASSIGN\s*\(/i.test(t) || /COSEIZE\s*\(/i.test(t);
  });
  const delayCEvents = cEvents.filter((/** @type {any} */ c) => /DELAY\s*\(/i.test(effectText(c.effect)));
  // Maps c.name → list of routing-target _store variable names, so run_replication()
  // can pass them as explicit parameters to monitor/serve functions.
  const cEventRoutingStores = new Map();
  if (assignCEvents.length > 0) {
    const svcParts = ['# ── Service processes ───────────────────────────────────────────────────────'];
    for (const c of assignCEvents) {
      const effT = effectText(c.effect);
      const assignCall = findMacroCall(effT, 'ASSIGN') || findMacroCall(effT, 'COSEIZE');
      if (!assignCall) continue;

      const isCoseize = assignCall.name === 'COSEIZE';
      const args = assignCall.rawArgs.split(',').map((/** @type {any} */ s) => s.trim());
      const queueName = args[0];
      const coseizeDefs = isCoseize ? args.slice(1).map(parseCoseizeArg) : null;
      const serverTypes = isCoseize ? coseizeDefs.map((/** @type {any} */ d) => d.type) : [args[1]];
      const storeId = safeId(queueName) + '_store';

      const { dist: svcDist, distParams: svcParams, placeholder } = getServiceDist(c);
      const svcExpr = distToExpr(svcDist, svcParams);
      const svcLabel = distLabel(svcDist, svcParams);
      const svcNote = distUnsupportedNote(svcDist);
      if (svcNote) warnings.push(`${c.name || 'service'}: ${svcNote.replace(/^#\s*/, '')}`);
      if (placeholder) warnings.push(`NOT SUPPORTED: no service distribution configured for "${c.name || 'service'}" — using a fixed value of 1.0`);

      const completionBEvent = findCompletionBEvent(c, bEvents);

      const monFn = safeId(c.name || 'service') + '_monitor';
      const svcFn = safeId(c.name || 'service') + '_serve';

      // Resource arguments string — one variable per distinct TYPE (a
      // quantity-N COSEIZE arg still shares one underlying simpy.Resource;
      // qty controls how many .request() calls are issued against it below,
      // not how many resource variables exist).
      const resArgs = serverTypes.map((/** @type {any} */ st) => safeId(st) + '_resource').join(', ');
      const resVars = serverTypes.map((/** @type {any} */ st) => safeId(st) + '_resource');

      // C-event priority: lower number = served first, matching the native engine's
      // C-scan ordering (src/engine/index.js sorts by priority ?? 9999 ascending).
      const priority = c.priority ?? 9999;

      // COSEIZE: AllOf across multiple resources
      let seizeBlock;
      if (isCoseize) {
        // Flatten to one .request() per unit — qty copies against the SAME
        // resource variable for a qty-N type, not N separate resources —
        // still combined into a single simpy.AllOf so the whole set (correct
        // total request count) is acquired atomically, mirroring the
        // engine's own check-all-before-claim-any.
        /** @type {string[]} */
        const reqUnits = [];
        coseizeDefs.forEach((/** @type {any} */ d) => {
          const resVar = safeId(d.type) + '_resource';
          for (let i = 0; i < d.qty; i++) reqUnits.push(resVar);
        });
        const reqVars = reqUnits.map((/** @type {any} */ _r, /** @type {number} */ i) => `_req${i}`);
        const reqDecls = reqUnits.map((/** @type {any} */ r, /** @type {number} */ i) => `    ${reqVars[i]} = ${r}.request(priority=${priority})`).join('\n');
        // Busy-time accounting scales by qty: seizing 2 Nurses for duration D
        // is 2*D nurse-busy-seconds, not D — else utilization (resource_busy
        // / (warmup_t * capacity)) is under-reported for a quantity-seized type.
        const svcBusyLines = coseizeDefs.map((/** @type {any} */ d) =>
          `        stats.resource_busy["${d.type}"] = stats.resource_busy.get("${d.type}", 0.0) + ${d.qty > 1 ? `${d.qty} * _svc_t` : '_svc_t'}`
        ).join('\n');
        const svcNoteLineCoseize = svcNote ? `        ${svcNote}\n` : '';
        seizeBlock =
`${reqDecls}
    yield simpy.AllOf(env, [${reqVars.join(', ')}])
    entity.service_start_time = env.now
    entity.wait_time_acc += entity.service_start_time - entity.queue_join_time
    try:
${svcNoteLineCoseize}        yield env.timeout(${svcExpr})  # service: ${svcLabel}${placeholder ? '  # NOT SUPPORTED: set service distribution' : ''}
        _svc_t = env.now - entity.service_start_time
        entity.svc_time_acc += _svc_t
${svcBusyLines}
    finally:
        for _req in [${reqVars.join(', ')}]:
            try: _req.resource.release(_req)
            except: pass`;
      } else {
        const svcNoteLine = svcNote ? `        ${svcNote}\n` : '';
        seizeBlock =
`    with ${resVars[0]}.request(priority=${priority}) as _req:
        yield _req
        entity.service_start_time = env.now
        entity.wait_time_acc += entity.service_start_time - entity.queue_join_time
${svcNoteLine}        yield env.timeout(${svcExpr})  # service: ${svcLabel}${placeholder ? '  # NOT SUPPORTED: set service distribution' : ''}
        _svc_t = env.now - entity.service_start_time
        entity.svc_time_acc += _svc_t
        stats.resource_busy["${serverTypes[0]}"] = stats.resource_busy.get("${serverTypes[0]}", 0.0) + _svc_t`;
      }

      const todoNote = todoSet.has('COSEIZE') ? '' :
        (isCoseize ? '\n    # COSEIZE: simultaneous multi-resource seize via simpy.AllOf' : '');

      const completionCode = routingCode(completionBEvent, queues, warnings);

      // Routing code may reference stores local to run_replication() — pass them explicitly.
      const routingStoreVarNames = [...new Set((completionCode.match(/\b\w+_store\b/g) || []))]
        .filter(v => v !== storeId);
      cEventRoutingStores.set(c.name, routingStoreVarNames);
      const rStoreComma = routingStoreVarNames.length > 0 ? ', ' + routingStoreVarNames.join(', ') : '';

      // Rebuild qty-annotated arg text for the docstring only (the resource
      // variable lists above are already qty-agnostic, one per distinct type).
      const argsLabel = isCoseize
        ? coseizeDefs.map((/** @type {any} */ d) => d.qty > 1 ? `${d.type}:${d.qty}` : d.type).join(', ')
        : serverTypes.join(', ');
      let monBody = `def ${monFn}(env, ${storeId}, ${resArgs}${rStoreComma}, stats):\n`;
      monBody += `    """C-event "${c.name}": ${assignCall.name}(${queueName}, ${argsLabel})"""\n`;
      monBody += `    while True:\n`;
      monBody += `        entity = yield ${storeId}.get()\n`;
      monBody += `        env.process(${svcFn}(env, entity, ${resArgs}${rStoreComma}, stats))\n`;

      let svcBody = `def ${svcFn}(env, entity, ${resArgs}${rStoreComma}, stats):\n`;
      if (todoNote) svcBody += todoNote + '\n';
      svcBody += `${seizeBlock}\n`;
      svcBody += `    entity.sojourn_time = env.now - entity.arrival_time\n`;
      svcBody += completionCode;

      svcParts.push(monBody);
      svcParts.push(svcBody);
    }
    parts.push(svcParts.join('\n') + '\n');
  }

  // ── Delay processes (no resource claimed) ───────────────────────────────────
  // DELAY pulls every waiting entity out of its queue and lets each proceed in
  // parallel after a sampled delay — there is no server to seize, so this must
  // not share the ASSIGN/COSEIZE resource-request codepath above. Per engine
  // semantics (src/engine/macros.js, src/engine/phases.js), the delay duration
  // counts toward sojourn time but must NOT be added to wait_time_acc/svc_time_acc.
  if (delayCEvents.length > 0) {
    const dlyParts = ['# ── Delay processes (no resource claimed) ───────────────────────────────────'];
    for (const c of delayCEvents) {
      const effT = effectText(c.effect);
      const delayCall = findMacroCall(effT, 'DELAY');
      if (!delayCall) continue;

      const queueName = delayCall.rawArgs.trim();
      const storeId = safeId(queueName) + '_store';

      const { dist: delayDist, distParams: delayParams, placeholder } = getServiceDist(c);
      const delayExpr = distToExpr(delayDist, delayParams);
      const delayLabel = distLabel(delayDist, delayParams);
      const delayNote = distUnsupportedNote(delayDist);
      if (delayNote) warnings.push(`${c.name || 'delay'}: ${delayNote.replace(/^#\s*/, '')}`);
      if (placeholder) warnings.push(`NOT SUPPORTED: no delay distribution configured for "${c.name || 'delay'}" — using a fixed value of 1.0`);

      const completionBEvent = findCompletionBEvent(c, bEvents);

      const monFn = safeId(c.name || 'delay') + '_monitor';
      const dlyFn = safeId(c.name || 'delay') + '_delay';

      const completionCode = routingCode(completionBEvent, queues, warnings);
      const routingStoreVarNames = [...new Set((completionCode.match(/\b\w+_store\b/g) || []))]
        .filter(v => v !== storeId);
      cEventRoutingStores.set(c.name, routingStoreVarNames);
      const rStoreComma = routingStoreVarNames.length > 0 ? ', ' + routingStoreVarNames.join(', ') : '';

      let monBody = `def ${monFn}(env, ${storeId}${rStoreComma}, stats):\n`;
      monBody += `    """C-event "${c.name}": DELAY(${queueName}) — no resource claimed; every waiting entity proceeds in parallel."""\n`;
      monBody += `    while True:\n`;
      monBody += `        entity = yield ${storeId}.get()\n`;
      monBody += `        env.process(${dlyFn}(env, entity${rStoreComma}, stats))\n`;

      const delayNoteLine = delayNote ? `    ${delayNote}\n` : '';
      let dlyBody = `def ${dlyFn}(env, entity${rStoreComma}, stats):\n`;
      dlyBody += delayNoteLine;
      dlyBody += `    yield env.timeout(${delayExpr})  # delay: ${delayLabel}${placeholder ? '  # NOT SUPPORTED: set delay distribution' : ''}\n`;
      dlyBody += `    # DELAY: no resource claimed — duration counts toward sojourn only, not wait/service stats\n`;
      dlyBody += `    entity.sojourn_time = env.now - entity.arrival_time\n`;
      dlyBody += completionCode;

      dlyParts.push(monBody);
      dlyParts.push(dlyBody);
    }
    parts.push(dlyParts.join('\n') + '\n');
  }

  // ── Container helpers ──────────────────────────────────────────────────────
  // DRAIN note: DES Studio DRAIN fails immediately if level < amount (guard).
  // SimPy Container.get() blocks until level >= amount. Semantic difference noted.
  const hasDrain = [...(model.bEvents || []), ...(model.cEvents || [])].some(ev =>
    /\bDRAIN\s*\(/i.test(effectText(ev.effect))
  );
  if (containers.length > 0 && hasDrain) {
    parts.push(
`# ── Container note ───────────────────────────────────────────────────────────
# DES Studio DRAIN guards: if container level < amount, the macro fails immediately.
# SimPy Container.get() BLOCKS until level >= amount.
# If your model relies on the fail-fast DRAIN guard, replace Container.get() with
# an explicit level check before yielding.
`);
    warnings.push('Model uses DRAIN — DES Studio fails fast if level < amount, but SimPy Container.get() blocks until enough is available. Not auto-translated.');
  }

  // ── Shift schedule processes ───────────────────────────────────────────────
  const serverWithShifts = servers.filter((/** @type {any} */ s) => Array.isArray(s.shiftSchedule) && s.shiftSchedule.length > 0);
  if (serverWithShifts.length > 0) {
    const shiftParts = ['# ── Shift schedule processes ────────────────────────────────────────────────'];
    for (const srv of serverWithShifts) {
      const resId = safeId(srv.name) + '_resource';
      const fnName = 'shift_manager_' + safeId(srv.name);
      const periods = srv.shiftSchedule.map((/** @type {any} */ p) => `(${+(p.time ?? 0)}, ${+(p.capacity ?? 1)})`).join(', ');
      shiftParts.push(
`def ${fnName}(env, ${resId}):
    """Shift schedule for server "${srv.name}"."""
    _shifts = [${periods}]
    for _time, _cap in _shifts:
        if _time > env.now:
            yield env.timeout(_time - env.now)
        # Adjust capacity: add or remove idle servers as needed
        _current = ${resId}.capacity
        if _cap > _current:
            ${resId}._capacity = _cap
            ${resId}._trigger_put(None)  # wake queued requests now that capacity increased
        elif _cap < _current:
            # Capacity reduction: will take effect as servers become idle
            ${resId}._capacity = _cap
`);
    }
    parts.push(shiftParts.join('\n') + '\n');
  }

  // ── NOT SUPPORTED macro stubs ─────────────────────────────────────────────
  if (todoSet.size > 0) {
    const stubParts = ['# ── Macros requiring manual completion ───────────────────────────────────────'];
    /** @type {Record<string, string>} */
    const stubs = {
      RENEGE: `# NOT SUPPORTED (RENEGE): Implement reneging via a timeout on the resource request.\n# Pattern:\n#   result = yield _req | env.timeout(patience_duration)\n#   if _req not in result:  # entity reneged\n#       if env.now >= WARMUP_PERIOD: stats.reneged.append(entity)\n#       return`,
      BATCH: `# NOT SUPPORTED (BATCH): Accumulate N entities from a store before processing.\n# Pattern:\n#   batch = []\n#   while len(batch) < BATCH_SIZE:\n#       batch.append(yield source_store.get())\n#   batch_entity = Entity(id=..., arrival_time=env.now)\n#   yield target_store.put(batch_entity)`,
      RENEGE_OLDEST: `# NOT SUPPORTED (RENEGE_OLDEST): Remove the oldest entity from a SimPy Store.\n# Pattern:\n#   if queue_store.items:\n#       oldest = queue_store.items.pop(0)  # FIFO: index 0 is oldest\n#       if env.now >= WARMUP_PERIOD: stats.reneged.append(oldest)`,
      MATCH: `# NOT SUPPORTED (MATCH): Pair entities from two stores.\n# Pattern:\n#   entity_a = yield store_a.get()\n#   entity_b = yield store_b.get()\n#   combined = Entity(id=..., arrival_time=env.now)\n#   yield target_store.put(combined)`,
      FAIL: `# NOT SUPPORTED (FAIL): Simulate server failure. If a quantity N was given\n# (FAIL(Type, N)), only N units should be taken offline -- otherwise all.\n# Pattern:\n#   resource._capacity -= N  # or set to 0 for "all" (no N given)\n#   # In-flight requests are not automatically interrupted.\n#   # To interrupt: use simpy.PreemptiveResource and resource.request(preempt=True).`,
      REPAIR: `# NOT SUPPORTED (REPAIR): Restore server after failure (pair with FAIL). If a\n# quantity N was given (REPAIR(Type, N)), only N units should be restored.\n# Pattern:\n#   resource._capacity += N  # or set to ORIGINAL_CAPACITY for "all" (no N given)`,
      PREEMPT: `# NOT SUPPORTED (PREEMPT): Use simpy.PreemptiveResource for the target server. If\n# a Criterion was given (PREEMPT(Type, Criterion) -- PRIORITY(attr), LONGEST, or\n# SHORTEST), rank the in-progress requests by that criterion and preempt the one\n# it selects rather than an arbitrary one -- otherwise preempt any in-progress request.\n# Replace simpy.Resource with simpy.PreemptiveResource at declaration.\n# Use: resource.request(priority=0, preempt=True)`,
      FINISH: `# NOT SUPPORTED (FINISH): End the in-progress service of a busy server right now\n# (on a condition, not a scheduled delay) -- e.g. an "activity of unknown duration".\n# If a Criterion was given (FINISH(Type, Criterion) -- PRIORITY(attr), LONGEST, or\n# SHORTEST), rank the in-progress requests by that criterion and finish the one it\n# selects rather than an arbitrary one.\n# Pattern:\n#   # trigger the process holding the target request's timeout early, e.g. via an\n#   # env.event() the service process also yields on:\n#   finish_event.succeed()`,
      RELEASE_COSEIZED: `# NOT SUPPORTED (RELEASE_COSEIZED): Atomically release multiple previously co-seized resources for the current entity, mirroring COSEIZE's own AllOf() seize.\n# Pattern:\n#   for _req in entity.coseized_requests:  # however you tracked the requests from the matching COSEIZE\n#       try: _req.resource.release(_req)\n#       except: pass\n#   entity.coseized_requests = []`,
      JOIN: `# NOT SUPPORTED (JOIN): Fork/join rendezvous for SPLIT families -- hold split-family\n# members arriving in the rendezvous store until the family is complete, then merge\n# them into one surviving entity routed to the target store. Needs a per-family\n# counting mechanism keyed by the family root id.\n# Pattern:\n#   # each branch process signals its completion event for the family:\n#   family_done = simpy.AllOf(env, branch_events[family_id])\n#   yield family_done\n#   survivor = Entity(id=parent_id, arrival_time=parent_arrival)  # parent keeps its stats\n#   yield target_store.put(survivor)`,
    };
    for (const m of todoList) {
      if (stubs[m]) stubParts.push(stubs[m]);
    }
    parts.push(stubParts.join('\n\n') + '\n');
  }

  // ── Simulation runner ──────────────────────────────────────────────────────
  const runLines = ['# ── Simulation runner ────────────────────────────────────────────────────────'];
  runLines.push(`def run_replication(seed):`);
  runLines.push(`    random.seed(seed)`);
  runLines.push(`    env = simpy.Environment()`);
  runLines.push(`    stats = Stats()`);
  runLines.push(``);

  if (stateVars.length > 0) {
    runLines.push(`    # Reset state variables`);
    for (const sv of stateVars) {
      const init = sv.initialValue !== undefined && sv.initialValue !== null && sv.initialValue !== ''
        ? JSON.stringify(sv.initialValue)
        : (sv.valueType === 'string' ? '""' : sv.valueType === 'boolean' ? 'False' : '0');
      runLines.push(`    global ${safeId(sv.name)}; ${safeId(sv.name)} = ${init}`);
    }
    runLines.push(``);
  }

  if (queues.length > 0) {
    runLines.push(`    # Queues (SimPy Stores)`);
    for (const q of queues) {
      const storeId = safeId(q.name) + '_store';
      const cap = q.capacity ? parseInt(q.capacity, 10) : null;
      if (cap && Number.isFinite(cap)) {
        runLines.push(`    ${storeId} = simpy.Store(env, capacity=${cap})`);
      } else {
        runLines.push(`    ${storeId} = simpy.Store(env)`);
      }
      if (q.discipline && q.discipline !== 'FIFO') {
        runLines.push(`    # Note: queue "${q.name}" uses ${q.discipline} discipline — SimPy Store is FIFO.`);
        runLines.push(`    #   For LIFO: append to end and pop from end (store.items.append/pop).`);
        runLines.push(`    #   For PRIORITY: sort store.items after each put using entity.priority.`);
        warnings.push(`Queue "${q.name}" uses ${q.discipline} discipline — SimPy Store is FIFO; not auto-translated.`);
      }
    }
    runLines.push(``);
  } else if (arrivalBEvents.length > 0) {
    // Auto-generate stores from ARRIVE calls when no queues are defined
    runLines.push(`    # Queues — auto-generated from ARRIVE effects`);
    const seenStores = new Set();
    for (const b of arrivalBEvents) {
      const arrCall = findMacroCall(effectText(b.effect), 'ARRIVE');
      if (!arrCall) continue;
      const qName = arrCall.rawArgs.split(',')[1]?.trim() || (arrCall.rawArgs.split(',')[0]?.trim() + 'Queue');
      const storeId = safeId(qName) + '_store';
      if (!seenStores.has(storeId)) {
        runLines.push(`    ${storeId} = simpy.Store(env)`);
        seenStores.add(storeId);
      }
    }
    runLines.push(``);
  }

  if (servers.length > 0) {
    runLines.push(`    # Resources (servers)`);
    for (const s of servers) {
      const resId = safeId(s.name) + '_resource';
      const shiftSchedule = s.shiftSchedule || [];
      const cap = (() => {
        if (shiftSchedule.length > 0) {
          const first = +(shiftSchedule[0].capacity ?? 1);
          if (Number.isFinite(first) && first >= 1) return first;
        }
        const c = s.count != null && s.count !== '' ? parseInt(String(s.count), 10) : 1;
        return Number.isFinite(c) && c >= 1 ? c : 1;
      })();
      runLines.push(`    ${resId} = simpy.PriorityResource(env, capacity=${cap})`);
    }
    runLines.push(``);
  }

  if (containers.length > 0) {
    runLines.push(`    # Containers (SimPy Containers)`);
    for (const ct of containers) {
      const cId = safeId(ct.id) + '_container';
      const cap = ct.capacity != null ? `capacity=${+(ct.capacity)}` : '';
      const init = ct.initialLevel != null ? `init=${+(ct.initialLevel)}` : '';
      const args = [cap, init].filter(Boolean);
      runLines.push(`    ${cId} = simpy.Container(env${args.length ? ', ' + args.join(', ') : ''})`);
    }
    runLines.push(``);
  }

  if (arrivalBEvents.length > 0) {
    runLines.push(`    # Start arrival processes`);
    for (const b of arrivalBEvents) {
      const arrCall = findMacroCall(effectText(b.effect), 'ARRIVE');
      if (!arrCall) continue;
      const qName = arrCall.rawArgs.split(',')[1]?.trim() || (arrCall.rawArgs.split(',')[0]?.trim() + 'Queue');
      const storeId = safeId(qName) + '_store';
      const fnName = 'arrival_' + safeId(b.name || 'process');
      runLines.push(`    env.process(${fnName}(env, ${storeId}, stats))`);
    }
    runLines.push(``);
  }

  if (assignCEvents.length > 0) {
    runLines.push(`    # Start service monitor processes`);
    for (const c of assignCEvents) {
      const effT = effectText(c.effect);
      const assignCall = findMacroCall(effT, 'ASSIGN') || findMacroCall(effT, 'COSEIZE');
      if (!assignCall) continue;
      const args = assignCall.rawArgs.split(',').map((/** @type {any} */ s) => s.trim());
      const queueName = args[0];
      const serverTypes = assignCall.name === 'COSEIZE'
        ? args.slice(1).map((/** @type {any} */ a) => parseCoseizeArg(a).type)
        : [args[1]];
      const storeId = safeId(queueName) + '_store';
      const resArgs = serverTypes.map((/** @type {any} */ st) => safeId(st) + '_resource').join(', ');
      const monFn = safeId(c.name || 'service') + '_monitor';
      const routingStoreVarNames = cEventRoutingStores.get(c.name) || [];
      const rStoreComma = routingStoreVarNames.length > 0 ? ', ' + routingStoreVarNames.join(', ') : '';
      runLines.push(`    env.process(${monFn}(env, ${storeId}, ${resArgs}${rStoreComma}, stats))`);
    }
    runLines.push(``);
  }

  if (delayCEvents.length > 0) {
    runLines.push(`    # Start delay monitor processes (no resource claimed)`);
    for (const c of delayCEvents) {
      const effT = effectText(c.effect);
      const delayCall = findMacroCall(effT, 'DELAY');
      if (!delayCall) continue;
      const queueName = delayCall.rawArgs.trim();
      const storeId = safeId(queueName) + '_store';
      const monFn = safeId(c.name || 'delay') + '_monitor';
      const routingStoreVarNames = cEventRoutingStores.get(c.name) || [];
      const rStoreComma = routingStoreVarNames.length > 0 ? ', ' + routingStoreVarNames.join(', ') : '';
      runLines.push(`    env.process(${monFn}(env, ${storeId}${rStoreComma}, stats))`);
    }
    runLines.push(``);
  }

  if (serverWithShifts.length > 0) {
    runLines.push(`    # Start shift schedule processes`);
    for (const srv of serverWithShifts) {
      const resId = safeId(srv.name) + '_resource';
      const fnName = 'shift_manager_' + safeId(srv.name);
      runLines.push(`    env.process(${fnName}(env, ${resId}))`);
    }
    runLines.push(``);
  }

  runLines.push(`    env.run(until=MAX_SIM_TIME)`);
  runLines.push(``);

  const resCapsEntries = servers.map((/** @type {any} */ s) => {
    const shiftSched = s.shiftSchedule || [];
    const cap = (() => {
      if (shiftSched.length > 0) {
        const first = +(shiftSched[0].capacity ?? 1);
        if (Number.isFinite(first) && first >= 1) return first;
      }
      const c = s.count != null && s.count !== '' ? parseInt(String(s.count), 10) : 1;
      return Number.isFinite(c) && c >= 1 ? c : 1;
    })();
    return `"${s.name}": ${cap}`;
  }).join(', ');

  runLines.push(`    _warmup_served = [e for e in stats.served if e.sojourn_time > 0]`);
  runLines.push(`    _soj_vals  = [e.sojourn_time for e in _warmup_served]`);
  runLines.push(`    _wait_vals = [e.wait_time_acc for e in _warmup_served if e.wait_time_acc > 0]`);
  runLines.push(`    _svc_vals  = [e.svc_time_acc  for e in _warmup_served if e.svc_time_acc  > 0]`);
  if (servers.length > 0) {
    runLines.push(`    _RES_CAPS  = {${resCapsEntries}}`);
    runLines.push(`    _warmup_t  = max(env.now - WARMUP_PERIOD, 1.0)`);
    runLines.push(`    _util = {k: round(min(1.0, v / (_warmup_t * _RES_CAPS.get(k, 1))), 4) for k, v in stats.resource_busy.items()}`);
  } else {
    runLines.push(`    _util = {}`);
  }
  runLines.push(`    def _pct(vals, p):`);
  runLines.push(`        return round(float(statistics.quantiles(vals, n=100)[p - 1]), 4) if len(vals) >= 2 else 0.0`);
  runLines.push(`    return {`);
  runLines.push(`        "total":       stats.total,`);
  runLines.push(`        "served":      len(stats.served),`);
  runLines.push(`        "reneged":     len(stats.reneged),`);
  runLines.push(`        "avg_sojourn": round(statistics.mean(_soj_vals), 4) if _soj_vals else 0.0,`);
  runLines.push(`        "total_cost":  round(stats.total_cost, 4),`);
  runLines.push(`        "wait_mean":   round(statistics.mean(_wait_vals), 4) if _wait_vals else 0.0,`);
  runLines.push(`        "wait_p50":    _pct(_wait_vals, 50),`);
  runLines.push(`        "wait_p90":    _pct(_wait_vals, 90),`);
  runLines.push(`        "wait_p99":    _pct(_wait_vals, 99),`);
  runLines.push(`        "svc_mean":    round(statistics.mean(_svc_vals), 4) if _svc_vals else 0.0,`);
  runLines.push(`        "util":        _util,`);
  runLines.push(`    }`);
  parts.push(runLines.join('\n') + '\n');

  // ── Main block ─────────────────────────────────────────────────────────────
  parts.push(
`
if __name__ == "__main__":
    _all = []
    for _rep in range(REPLICATIONS):
        _r = run_replication(BASE_SEED + _rep)
        _all.append(_r)
        if RUN_MODE == "json":
            print(json.dumps({"type": "rep", "rep": _rep + 1, **_r}), flush=True)
        else:
            print(f"Rep {_rep + 1:3d}: served={_r['served']:5d}  "
                  f"avg_sojourn={_r['avg_sojourn']:8.3f}  "
                  f"reneged={_r['reneged']:4d}  "
                  f"wait_p90={_r['wait_p90']:7.3f}")

    _sv = [r["served"]      for r in _all]
    _sq = [r["avg_sojourn"] for r in _all]
    _rv = [r["reneged"]     for r in _all]
    _wm = [r["wait_mean"]   for r in _all]
    _n  = len(_all)
    _summary = {
        "type":         "summary",
        "replications": _n,
        "served_mean":  round(statistics.mean(_sv), 2),
        "served_sd":    round(statistics.stdev(_sv) if _n > 1 else 0.0, 2),
        "sojourn_mean": round(statistics.mean(_sq), 4),
        "sojourn_sd":   round(statistics.stdev(_sq) if _n > 1 else 0.0, 4),
        "reneged_mean": round(statistics.mean(_rv), 2),
        "wait_mean":    round(statistics.mean(_wm), 4),
    }
    if RUN_MODE == "json":
        print(json.dumps(_summary), flush=True)
    elif _n > 1:
        print("\\n── Replication summary ──────────────────────────────────────────────────")
        print(f"  served      mean={_summary['served_mean']:.1f}  sd={_summary['served_sd']:.2f}")
        print(f"  avg_sojourn mean={_summary['sojourn_mean']:.3f}  sd={_summary['sojourn_sd']:.4f}")
        print(f"  wait_mean   mean={_summary['wait_mean']:.3f}")
        print(f"  reneged     mean={_summary['reneged_mean']:.1f}")
`);

  return parts.join('\n');
}
