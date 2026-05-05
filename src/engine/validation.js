// engine/validation.js — Pre-run model validation
//
// validateModel(model) returns { errors, warnings }.
// errors   — blocking: run must be prevented
// warnings — non-blocking: run proceeds with a visible banner
//
// Each item: { code, message, tab }
// tab maps to ModelDetail tab IDs: 'entities' | 'state' | 'bevents' | 'cevents' | 'queues'

import { normalizeDistributionName, getPiecewisePeriods } from "./distributions.js";

export function validateModel(model) {
  const errors   = [];
  const warnings = [];
  const err  = (code, message, tab) => errors.push({ code, message, tab });
  const warn = (code, message, tab) => warnings.push({ code, message, tab });

  const entityTypes = model.entityTypes    || [];
  const bEvents     = model.bEvents        || [];
  const cEvents     = model.cEvents        || [];
  const queues      = model.queues         || [];
  const effectText = effect => {
    if (Array.isArray(effect)) return effect.map(effectText).filter(Boolean).join(';');
    if (effect && typeof effect === 'object') {
      if (typeof effect.effect === 'string') return effect.effect;
      const macro = String(effect.macro || effect.type || effect.name || '').trim();
      if (!macro) return '';
      const args = Array.isArray(effect.args)
        ? effect.args
        : [effect.entityType || effect.customerType || effect.queue || effect.resourceType || effect.serverType, effect.serverType || effect.resourceType].filter(Boolean);
      return `${macro}(${args.join(',')})`;
    }
    return String(effect || '');
  };

  // ── V1: Entity class unique non-empty name ──────────────────────────────────
  const seen1 = new Set();
  entityTypes.forEach((et, i) => {
    const name = (et.name || '').trim();
    if (!name) {
      err('V1', `Entity class at position ${i + 1} has an empty name.`, 'entities');
    } else if (seen1.has(name)) {
      err('V1', `Duplicate entity class name: '${name}'.`, 'entities');
    } else {
      seen1.add(name);
    }
  });

  // ── V2: Attribute names unique within entity class ──────────────────────────
  entityTypes.forEach(et => {
    const seen2 = new Set();
    (et.attrDefs || []).forEach(a => {
      const name = (a.name || '').trim();
      if (!name) return;
      if (seen2.has(name)) {
        err('V2', `Duplicate attribute '${name}' in entity class '${et.name || '?'}'.`, 'entities');
      }
      seen2.add(name);
    });
  });

  // ── V3: Every defaultValue matches its declared valueType ───────────────────
  entityTypes.forEach(et => {
    (et.attrDefs || []).forEach(a => {
      if (a.defaultValue === undefined || a.defaultValue === '') return; // Default values can be empty
      const val = a.defaultValue;
      const type = a.valueType;

      if (type === 'number') {
        if (isNaN(parseFloat(val)) || !isFinite(val)) {
          err('V3', `Attribute '${a.name || '?'}' in '${et.name || '?'}': default value '${val}' is not a valid number.`, 'entities');
        }
      } else if (type === 'boolean') {
        if (val !== 'true' && val !== 'false') {
          err('V3', `Attribute '${a.name || '?'}' in '${et.name || '?'}': default value '${val}' is not 'true' or 'false'.`, 'entities');
        }
      }
      // String type always matches, no specific validation needed for its content
    });
  });

  // ── V4: PRIORITY queue discipline requires a 'priority' attribute ───────────
  queues.forEach(q => {
    if ((q.discipline || 'FIFO').toUpperCase() !== 'PRIORITY') return;
    const ct = entityTypes.find(et =>
      (et.name || '').trim().toLowerCase() === (q.customerType || '').trim().toLowerCase()
    );
    if (!ct) {
      err('V4',
        `Queue '${q.name}' uses PRIORITY discipline but entity class '${q.customerType || '?'}' was not found.`,
        'queues');
    } else {
      const hasPriority = (ct.attrDefs || []).some(a => (a.name || '').trim() === 'priority');
      if (!hasPriority) {
        err('V4',
          `Queue '${q.name}' uses PRIORITY discipline but entity class '${ct.name}' has no 'priority' attribute.`,
          'queues');
      }
    }
  });

  // ── V5: Distribution parameters in valid bounds (+ V11 warning) ────────────
  function checkDist(dist, params, context, tab) {
    const distName = normalizeDistributionName(dist);
    if (!distName || distName === 'ServerAttr') return;
    const p = params || {};
    if (distName === 'Piecewise') {
      const periods = getPiecewisePeriods(p);
      if (!periods.length) {
        err('V12', `${context}: Piecewise distribution requires at least one period.`, tab);
        return;
      }
      let previous = -Infinity;
      periods.forEach((period, idx) => {
        const startTime = parseFloat(period.startTime ?? period.time);
        if (!Number.isFinite(startTime)) {
          err('V12', `${context}: Piecewise period ${idx + 1} requires a numeric startTime.`, tab);
        } else {
          if (idx === 0 && startTime !== 0) {
            err('V12', `${context}: Piecewise distribution must start at time 0.`, tab);
          }
          if (startTime < previous) {
            err('V13', `${context}: Piecewise periods are not sorted by start time.`, tab);
          }
          previous = startTime;
        }
        const raw = period.distribution || period;
        const nestedDist = raw.dist || raw.type || 'Fixed';
        const nestedParams = { ...(raw.distParams || raw.params || {}) };
        if (nestedParams.mean == null && raw.rate != null && normalizeDistributionName(nestedDist) === 'Exponential') {
          const rate = parseFloat(raw.rate);
          nestedParams.mean = Number.isFinite(rate) && rate > 0 ? String(1 / rate) : '';
        }
        for (const key of ['value', 'mean', 'min', 'max', 'mode', 'stddev', 'k', 'attr']) {
          if (nestedParams[key] == null && raw[key] != null) nestedParams[key] = raw[key];
        }
        if (normalizeDistributionName(nestedDist) === 'Piecewise') {
          err('V12', `${context}: Nested piecewise distributions are not supported.`, tab);
        } else {
          checkDist(nestedDist, nestedParams, `${context} period ${idx + 1}`, tab);
        }
      });
      return;
    }
    switch (distName) {
      case 'Exponential': {
        const m = parseFloat(p.mean);
        if (isNaN(m) || m <= 0)
          err('V5', `${context}: Exponential mean must be > 0 (got '${p.mean ?? ''}').`, tab);
        break;
      }
      case 'Uniform': {
        const lo = parseFloat(p.min), hi = parseFloat(p.max);
        if (isNaN(lo) || isNaN(hi))
          err('V5', `${context}: Uniform requires numeric min and max.`, tab);
        else if (hi <= lo)
          err('V5', `${context}: Uniform max (${hi}) must be greater than min (${lo}).`, tab);
        break;
      }
      case 'Normal': {
        const m = parseFloat(p.mean), s = parseFloat(p.stddev);
        if (isNaN(m) || isNaN(s) || s <= 0) {
          err('V5', `${context}: Normal stddev must be > 0 (got '${p.stddev ?? ''}').`, tab);
        } else if (m < 2 * s) {
          warn('V11',
            `${context}: Normal(mean=${m}, stddev=${s}) — mean < 2 × stddev, negative samples likely (will be clamped to 0).`,
            tab);
        }
        break;
      }
      case 'Triangular': {
        const a = parseFloat(p.min), c = parseFloat(p.mode), b = parseFloat(p.max);
        if (isNaN(a) || isNaN(c) || isNaN(b))
          err('V5', `${context}: Triangular requires numeric min, mode, and max.`, tab);
        else if (!(a <= c && c <= b))
          err('V5', `${context}: Triangular requires min ≤ mode ≤ max (got ${a}, ${c}, ${b}).`, tab);
        break;
      }
      case 'Fixed': {
        const v = parseFloat(p.value);
        if (p.value === undefined || p.value === '' || isNaN(v))
          err('V5', `${context}: Fixed distribution requires a numeric value (got '${p.value ?? ''}').`, tab);
        break;
      }
      case 'Erlang': {
        const k = parseInt(p.k), m = parseFloat(p.mean);
        if (isNaN(k) || k < 1)
          err('V5', `${context}: Erlang k must be a positive integer (got '${p.k ?? ''}').`, tab);
        if (isNaN(m) || m <= 0)
          err('V5', `${context}: Erlang mean must be > 0 (got '${p.mean ?? ''}').`, tab);
        break;
      }
      default:
        break;
    }
  }

  bEvents.forEach(b => {
    (b.schedules || []).forEach((s, j) => {
      checkDist(s.dist, s.distParams,
        `B-Event '${b.name || b.id}' schedule ${j + 1}`, 'bevents');
    });
  });

  entityTypes.forEach(et => {
    (et.attrDefs || []).forEach(a => {
      if (a.name)
        checkDist(a.dist, a.distParams,
          `Entity '${et.name}' attr '${a.name}'`, 'entities');
    });
  });

  const maxSimTime = parseFloat(model.maxSimTime);
  entityTypes.forEach(et => {
    if (et.role !== 'server' || !Array.isArray(et.shiftSchedule) || et.shiftSchedule.length === 0) return;
    let previous = -Infinity;
    et.shiftSchedule.forEach((period, idx) => {
      const time = parseFloat(period.time ?? period.startTime);
      const capacity = Number(period.capacity);
      if (!Number.isFinite(time)) {
        err('V14', `Server '${et.name || '?'}' shift period ${idx + 1} requires a numeric time.`, 'entities');
      } else {
        if (idx === 0 && time !== 0) {
          err('V14', `Server '${et.name || '?'}' shift schedule must start at time 0.`, 'entities');
        }
        if (time < previous) {
          err('V14', `Server '${et.name || '?'}' shift times must be sorted ascending.`, 'entities');
        }
        if (Number.isFinite(maxSimTime) && maxSimTime > 0 && time > maxSimTime) {
          warn('V15', `Server '${et.name || '?'}' shift at t=${time} is after the run duration.`, 'entities');
        }
        previous = time;
      }
      if (!Number.isInteger(capacity) || capacity < 1) {
        err('V14', `Server '${et.name || '?'}' shift capacity must be a positive integer.`, 'entities');
      }
    });
  });

  cEvents.forEach(c => {
    (c.cSchedules || []).forEach((s, j) => {
      checkDist(s.dist, s.distParams,
        `C-Event '${c.name || c.id}' schedule ${j + 1}`, 'cevents');
    });
  });

  // ── V6: B-Event schedule references must point to existing event IDs ────────
  const bEventIds = new Set(bEvents.map(b => b.id));

  cEvents.forEach(c => {
    (c.cSchedules || []).forEach(s => {
      if (s.eventId && !bEventIds.has(s.eventId)) {
        err('V6',
          `C-Event '${c.name || c.id}' schedules unknown B-Event ID '${s.eventId}'.`,
          'cevents');
      }
    });
  });

  bEvents.forEach(b => {
    (b.schedules || []).forEach(s => {
      if (s.eventId && !bEventIds.has(s.eventId)) {
        err('V6',
          `B-Event '${b.name || b.id}' schedule references unknown event ID '${s.eventId}'.`,
          'bevents');
      }
    });
  });

  // ── V8: Model must have at least one arrival source and at least one sink ──
  const hasArrive = bEvents.some(b => /ARRIVE\s*\(/i.test(effectText(b.effect)));
  if (!hasArrive) {
    warn('V8',
      'No B-Event with an ARRIVE(Type) effect was found — the simulation will have no entity arrivals.',
      'bevents');
  }

  // A "sink" is effectively an entity reaching a terminal status (done or reneged)
  // This check is a heuristic based on event effects that lead to termination.
  const hasSinkMacro = bEvents.some(b => {
    const text = effectText(b.effect);
    return /COMPLETE\s*\(/i.test(text) || /RENEGE\s*\(/i.test(text);
  });
  if (!hasSinkMacro) {
    warn('V8',
      'No B-Event with a COMPLETE() or RENEGE() effect was found — entities may never leave the system.',
      'bevents');
  }

  const queueRefsFromCondition = (condition) => {
    if (!condition) return [];
    if (typeof condition === 'string') {
      return [...condition.matchAll(/queue\(([^)]+)\)/gi)].map(m => m[1].trim().toLowerCase());
    }
    if (typeof condition !== 'object' || Array.isArray(condition)) return [];
    if (Array.isArray(condition.clauses)) {
      return condition.clauses.flatMap(queueRefsFromCondition);
    }
    const variable = String(condition.variable || condition.token || condition.left || '');
    const queueMatch = variable.match(/^Queue\.([^.]+)\./i);
    return queueMatch ? [queueMatch[1].trim().toLowerCase()] : [];
  };

  // ── V9: C-Event conditions must reference defined queues ────────────────────
  const queueNamesLower = new Set(
    queues.map(q => (q.name || '').trim().toLowerCase()).filter(Boolean)
  );
  cEvents.forEach(c => {
    if (!c.condition) return;
    const queueRefs = queueRefsFromCondition(c.condition);
    queueRefs.forEach(ref => {
      if (!queueNamesLower.has(ref)) {
        err('V9',
          `C-Event '${c.name || c.id}' condition references unknown queue '${ref}'.`,
          'cevents');
      }
    });
  });

  // ── V10: Attribute names must not collide with built-in namespaces ──────────
  entityTypes.forEach(et => {
    (et.attrDefs || []).forEach(a => {
      const name = (a.name || '').trim();
      if (!name) return;
      if (/^(Resource|Queue)\b/i.test(name)) {
        err('V10',
          `Attribute '${name}' in entity class '${et.name || '?'}' conflicts with the built-in 'Resource' or 'Queue' namespace.`,
          'entities');
      }
    });
  });

  // ── V16: Termination check (Sprint 3.2) ─────────────────────────────────────
  const hasTermination = model.maxSimTime > 0 || model.terminationCondition;
  if (!hasTermination && hasArrive) {
    warn('V16',
      'No simulation time limit or termination condition set. Model may run until cycle limit (5000) if arrivals continue indefinitely.',
      'execute');
  }

  return { errors, warnings };
}
