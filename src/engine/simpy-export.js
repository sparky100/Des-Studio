// engine/simpy-export.js — Export a DES Studio model as a runnable SimPy Python script
//
// exportToSimPy(model) → { script: string, category: 1 | 2, todoMacros: string[] }
//   category 1 — fully runnable; no manual edits needed
//   category 2 — partial; sections marked with # TODO require user completion

// Macros whose SimPy translation requires manual completion
const TODO_MACRO_SET = new Set([
  'RENEGE', 'BATCH', 'RENEGE_OLDEST', 'MATCH', 'FAIL', 'REPAIR', 'PREEMPT',
]);

// ── Public API ────────────────────────────────────────────────────────────────

export function exportToSimPy(model) {
  const todoMacros = collectTodoMacros(model);
  const category = todoMacros.length > 0 ? 2 : 1;
  const script = buildScript(model, new Set(todoMacros));
  return { script, category, todoMacros };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

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
function safeId(name) {
  const s = String(name || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/^([0-9])/, '_$1');
  return s || 'unnamed';
}

// Convert to PascalCase class name
function toPascal(name) {
  return String(name || '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join('') || 'Entity';
}

function normalizeDistName(dist) {
  const d = String(dist || '').toLowerCase().replace(/[_\s-]/g, '');
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
function distUnsupportedNote(dist) {
  if (!dist) return null;
  if (normalizeDistName(dist)) return null;
  const raw = String(dist).toLowerCase().replace(/[_\s-]/g, '');
  if (raw === 'empirical' || raw === 'piecewise' || raw === 'schedule') return null;
  return `# NOTE: distribution "${dist}" not auto-translated — using fallback value 1.0`;
}

// Returns true if this schedule entry uses a Piecewise distribution
function isPiecewiseDist(sched) {
  const raw = String(sched?.dist || '').toLowerCase().replace(/[_\s-]/g, '');
  return raw === 'piecewise';
}

// Returns true if this schedule entry uses a Schedule (planned absolute times) distribution
function isScheduleDist(sched) {
  const raw = String(sched?.dist || '').toLowerCase().replace(/[_\s-]/g, '');
  return raw === 'schedule';
}

// Generate a _piecewise_NAME(t) helper function for a piecewise distribution
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
function parseMacroCalls(effectStr) {
  if (!effectStr) return [];
  const calls = [];
  for (const part of effectStr.split(';').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\w+)\((.*)\)$/is);
    if (m) calls.push({ name: m[1].toUpperCase(), rawArgs: m[2].trim(), raw: part });
  }
  return calls;
}

function findMacroCall(effectStr, macroName) {
  return parseMacroCalls(effectStr).find(c => c.name === macroName) || null;
}

// Find the B-event that is the "completion" event for a C-event (via cSchedules[0].eventId)
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
function getServiceDist(cEvent) {
  const cs = (cEvent.cSchedules || []).find(s => s.dist || s.distribution);
  if (!cs) return { dist: 'Fixed', distParams: { value: 1 }, placeholder: true };
  return { dist: cs.dist || 'Exponential', distParams: cs.distParams || {}, placeholder: false };
}

// Translate a predicate condition to a Python boolean expression
function predicateToExpr(condition) {
  if (!condition) return 'True';
  if (typeof condition === 'string') {
    return `True  # TODO: translate condition string: ${condition.replace(/\n/g, ' ')}`;
  }
  if (typeof condition !== 'object') return 'True';

  if (condition.operator === 'AND' || condition.operator === 'OR') {
    const op = condition.operator === 'AND' ? ' and ' : ' or ';
    const sub = (condition.clauses || []).map(predicateToExpr);
    return sub.length ? `(${sub.join(op)})` : 'True';
  }

  const variable = String(condition.variable || condition.left || condition.token || '');
  const opStr = String(condition.op || condition.operator || '==');
  const value = condition.value ?? condition.right ?? 0;
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
  return `True  # TODO: translate condition variable "${variable}" ${opStr} ${JSON.stringify(value)}`;
}

// Generate routing code after service completion for one B-event
function routingCode(completionBEvent, queues, statsRef = 'stats') {
  if (!completionBEvent) {
    return `    # Entity completes journey\n    if env.now >= WARMUP_PERIOD:\n        ${statsRef}.served.append(entity)\n`;
  }

  const effText = effectText(completionBEvent.effect);
  const lines = [];

  // Conditional routing table
  const routing = (completionBEvent.routing || []).filter(r =>
    r.condition && (r.queueName !== undefined)
  );
  if (routing.length > 0) {
    lines.push(`    # Conditional routing from B-event "${completionBEvent.name}"`);
    routing.forEach((branch, i) => {
      const cond = predicateToExpr(branch.condition);
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
    probRouting.forEach((branch, i) => {
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
    const releaseArgs = releaseCall.rawArgs.split(',').map(s => s.trim());
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

function buildScript(model, todoSet) {
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

  const servers   = entityTypes.filter(e => e.role === 'server');
  const customers = entityTypes.filter(e => e.role !== 'server');

  const now = new Date().toISOString().split('T')[0];
  const category = todoSet.size > 0 ? 2 : 1;
  const todoList = [...todoSet];

  const parts = [];

  // ── Header docstring ───────────────────────────────────────────────────────
  const catMsg = category === 1
    ? 'Category 1 — complete and runnable.'
    : `Category 2 — partial; complete the # TODO sections before running.\n#   Macros requiring attention: ${todoList.join(', ')}`;
  parts.push(
`"""
simmodlr → SimPy export
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
  const arrivalBEvents = bEvents.filter(b => /ARRIVE\s*\(/i.test(effectText(b.effect)));
  if (arrivalBEvents.length > 0) {
    const arrParts = ['# ── Arrival processes ───────────────────────────────────────────────────────'];
    for (const b of arrivalBEvents) {
      const effT = effectText(b.effect);
      const arriveCall = findMacroCall(effT, 'ARRIVE');
      if (!arriveCall) continue;
      const arrArgs = arriveCall.rawArgs.split(',').map(s => s.trim());
      const customerTypeName = arrArgs[0];
      const queueName = arrArgs[1] || (customerTypeName + 'Queue');
      const storeId = safeId(queueName) + '_store';
      const fnName = 'arrival_' + safeId(b.name || 'process');
      const cls = customers.find(e =>
        e.name.trim().toLowerCase() === customerTypeName.trim().toLowerCase()
      );
      const entityClass = cls ? toPascal(cls.name) : 'Entity';

      // Get inter-arrival distribution from first schedule
      const sched = (b.schedules || []).find(s => s.dist || s.distribution);
      const iaDist = sched?.dist || 'Exponential';
      const iaParams = sched?.distParams || { mean: 1 };
      const iaLabel = distLabel(iaDist, iaParams);

      // Check for balking
      const balkProb = b.balkProbability != null ? parseFloat(b.balkProbability) : null;

      let fnBody = `def ${fnName}(env, ${storeId}, stats):\n`;
      fnBody += `    """B-event "${b.name}": ARRIVE(${customerTypeName}, ${queueName})"""\n`;
      fnBody += `    _counter = 0\n`;

      if (isScheduleDist(sched)) {
        // Planned absolute-time arrivals — fire once at each scheduled time
        const rows = (iaParams?.rows || iaParams?.times?.map?.((t, i) => ({ time: t })) || []);
        const entries = rows.map(r => {
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
      } else if (isPiecewiseDist(sched)) {
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
  const assignCEvents = cEvents.filter(c => {
    const t = effectText(c.effect);
    return /ASSIGN\s*\(/i.test(t) || /COSEIZE\s*\(/i.test(t);
  });
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
      const args = assignCall.rawArgs.split(',').map(s => s.trim());
      const queueName = args[0];
      const serverTypes = isCoseize ? args.slice(1) : [args[1]];
      const storeId = safeId(queueName) + '_store';

      const { dist: svcDist, distParams: svcParams, placeholder } = getServiceDist(c);
      const svcExpr = distToExpr(svcDist, svcParams);
      const svcLabel = distLabel(svcDist, svcParams);
      const svcNote = distUnsupportedNote(svcDist);

      const completionBEvent = findCompletionBEvent(c, bEvents);

      const monFn = safeId(c.name || 'service') + '_monitor';
      const svcFn = safeId(c.name || 'service') + '_serve';

      // Resource arguments string
      const resArgs = serverTypes.map(st => safeId(st) + '_resource').join(', ');
      const resVars = serverTypes.map(st => safeId(st) + '_resource');

      // COSEIZE: AllOf across multiple resources
      let seizeBlock;
      if (isCoseize) {
        const reqVars = resVars.map((r, i) => `_req${i}`);
        const reqDecls = resVars.map((r, i) => `    ${reqVars[i]} = ${r}.request()`).join('\n');
        const svcBusyLines = serverTypes.map(st =>
          `        stats.resource_busy["${st}"] = stats.resource_busy.get("${st}", 0.0) + _svc_t`
        ).join('\n');
        const svcNoteLineCoseize = svcNote ? `        ${svcNote}\n` : '';
        seizeBlock =
`${reqDecls}
    yield simpy.AllOf(env, [${reqVars.join(', ')}])
    entity.service_start_time = env.now
    entity.wait_time_acc += entity.service_start_time - entity.queue_join_time
    try:
${svcNoteLineCoseize}        yield env.timeout(${svcExpr})  # service: ${svcLabel}${placeholder ? '  # TODO: set service distribution' : ''}
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
`    with ${resVars[0]}.request() as _req:
        yield _req
        entity.service_start_time = env.now
        entity.wait_time_acc += entity.service_start_time - entity.queue_join_time
${svcNoteLine}        yield env.timeout(${svcExpr})  # service: ${svcLabel}${placeholder ? '  # TODO: set service distribution' : ''}
        _svc_t = env.now - entity.service_start_time
        entity.svc_time_acc += _svc_t
        stats.resource_busy["${serverTypes[0]}"] = stats.resource_busy.get("${serverTypes[0]}", 0.0) + _svc_t`;
      }

      const todoNote = todoSet.has('COSEIZE') ? '' :
        (isCoseize ? '\n    # COSEIZE: simultaneous multi-resource seize via simpy.AllOf' : '');

      const completionCode = routingCode(completionBEvent, queues);

      // Routing code may reference stores local to run_replication() — pass them explicitly.
      const routingStoreVarNames = [...new Set((completionCode.match(/\b\w+_store\b/g) || []))]
        .filter(v => v !== storeId);
      cEventRoutingStores.set(c.name, routingStoreVarNames);
      const rStoreComma = routingStoreVarNames.length > 0 ? ', ' + routingStoreVarNames.join(', ') : '';

      let monBody = `def ${monFn}(env, ${storeId}, ${resArgs}${rStoreComma}, stats):\n`;
      monBody += `    """C-event "${c.name}": ${assignCall.name}(${queueName}, ${serverTypes.join(', ')})"""\n`;
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
  }

  // ── Shift schedule processes ───────────────────────────────────────────────
  const serverWithShifts = servers.filter(s => Array.isArray(s.shiftSchedule) && s.shiftSchedule.length > 0);
  if (serverWithShifts.length > 0) {
    const shiftParts = ['# ── Shift schedule processes ────────────────────────────────────────────────'];
    for (const srv of serverWithShifts) {
      const resId = safeId(srv.name) + '_resource';
      const fnName = 'shift_manager_' + safeId(srv.name);
      const periods = srv.shiftSchedule.map(p => `(${+(p.time ?? 0)}, ${+(p.capacity ?? 1)})`).join(', ');
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
        elif _cap < _current:
            # Capacity reduction: will take effect as servers become idle
            ${resId}._capacity = _cap
`);
    }
    parts.push(shiftParts.join('\n') + '\n');
  }

  // ── TODO macro stubs ───────────────────────────────────────────────────────
  if (todoSet.size > 0) {
    const stubParts = ['# ── Macros requiring manual completion ───────────────────────────────────────'];
    const stubs = {
      RENEGE: `# TODO (RENEGE): Implement reneging via a timeout on the resource request.\n# Pattern:\n#   result = yield _req | env.timeout(patience_duration)\n#   if _req not in result:  # entity reneged\n#       if env.now >= WARMUP_PERIOD: stats.reneged.append(entity)\n#       return`,
      BATCH: `# TODO (BATCH): Accumulate N entities from a store before processing.\n# Pattern:\n#   batch = []\n#   while len(batch) < BATCH_SIZE:\n#       batch.append(yield source_store.get())\n#   batch_entity = Entity(id=..., arrival_time=env.now)\n#   yield target_store.put(batch_entity)`,
      RENEGE_OLDEST: `# TODO (RENEGE_OLDEST): Remove the oldest entity from a SimPy Store.\n# Pattern:\n#   if queue_store.items:\n#       oldest = queue_store.items.pop(0)  # FIFO: index 0 is oldest\n#       if env.now >= WARMUP_PERIOD: stats.reneged.append(oldest)`,
      MATCH: `# TODO (MATCH): Pair entities from two stores.\n# Pattern:\n#   entity_a = yield store_a.get()\n#   entity_b = yield store_b.get()\n#   combined = Entity(id=..., arrival_time=env.now)\n#   yield target_store.put(combined)`,
      FAIL: `# TODO (FAIL): Simulate server failure.\n# Pattern:\n#   resource._capacity = 0  # blocks new requests\n#   # In-flight requests are not automatically interrupted.\n#   # To interrupt: use simpy.PreemptiveResource and resource.request(preempt=True).`,
      REPAIR: `# TODO (REPAIR): Restore server after failure (pair with FAIL).\n# Pattern:\n#   resource._capacity = ORIGINAL_CAPACITY`,
      PREEMPT: `# TODO (PREEMPT): Use simpy.PreemptiveResource for the target server.\n# Replace simpy.Resource with simpy.PreemptiveResource at declaration.\n# Use: resource.request(priority=0, preempt=True)`,
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
      runLines.push(`    ${resId} = simpy.Resource(env, capacity=${cap})`);
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
      const args = assignCall.rawArgs.split(',').map(s => s.trim());
      const queueName = args[0];
      const serverTypes = assignCall.name === 'COSEIZE' ? args.slice(1) : [args[1]];
      const storeId = safeId(queueName) + '_store';
      const resArgs = serverTypes.map(st => safeId(st) + '_resource').join(', ');
      const monFn = safeId(c.name || 'service') + '_monitor';
      const routingStoreVarNames = cEventRoutingStores.get(c.name) || [];
      const rStoreComma = routingStoreVarNames.length > 0 ? ', ' + routingStoreVarNames.join(', ') : '';
      runLines.push(`    env.process(${monFn}(env, ${storeId}, ${resArgs}${rStoreComma}, stats))`);
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

  const resCapsEntries = servers.map(s => {
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
