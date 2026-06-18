// engine/validation.js — Pre-run model validation
//
// validateModel(model) returns { errors, warnings }.
// errors   — blocking: run must be prevented
// warnings — non-blocking: run proceeds with a visible banner
//
// Each item: { code, message, tab, affectedIds? }
// affectedIds: { eventIds?: string[], queueIds?: string[], entityTypeIds?: string[], containerIds?: string[] }
// tab maps to ModelDetail tab IDs: 'entities' | 'state' | 'bevents' | 'cevents' | 'queues' | 'execute'

import { normalizeDistributionName, getPiecewisePeriods } from "./distributions.js";

export const DEFAULT_MAX_SIM_TIME = 500;

export function validateModel(model) {
  const errors   = [];
  const warnings = [];
  const err  = (code, message, tab, affectedIds) => errors.push({ code, message, tab, affectedIds });
  const warn = (code, message, tab, affectedIds) => warnings.push({ code, message, tab, affectedIds });

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
  const hasConditionDefinition = condition => {
    if (!condition) return false;
    if (typeof condition === 'string') return condition.trim() !== '';
    if (Array.isArray(condition)) return condition.some(hasConditionDefinition);
    if (typeof condition !== 'object') return false;
    if (Array.isArray(condition.clauses)) return condition.clauses.some(hasConditionDefinition);
    return String(condition.variable || condition.token || condition.left || '').trim() !== '';
  };
  const isMeaningfulRoutingBranch = branch => {
    if (!branch || typeof branch !== 'object') return false;
    return hasConditionDefinition(branch.condition);
  };
  const hasCompleteEffect = text => /COMPLETE\s*\(/i.test(text);
  const hasAnyRenegeEffect = text => /\bRENEGE\(\s*([^)]+)\s*\)/i.test(text);
  const hasExactRenegeCtxEffect = text => /\bRENEGE\(\s*ctx\s*\)/i.test(text);
  const hasReleaseEffect = text => /RELEASE\s*\(/i.test(text);
  const hasReleaseTargetQueue = text => /RELEASE\s*\([^,)]+,\s*[^)]+\)/i.test(text);
  const countTerminalSinkEffects = text => {
    let sinks = 0;
    if (hasCompleteEffect(text)) sinks += 1;
    if (hasExactRenegeCtxEffect(text)) sinks += 1;
    return sinks;
  };

  // ── V1: Entity class unique non-empty name ──────────────────────────────────
  const seen1 = new Set();
  entityTypes.forEach((et, i) => {
    const name = (et.name || '').trim();
    if (!name) {
      err('V1', `Entity class at position ${i + 1} has an empty name.`, 'entities',
        { entityTypeIds: [et.id] });
    } else if (seen1.has(name)) {
      err('V1', `Duplicate entity class name: '${name}'.`, 'entities',
        { entityTypeIds: [et.id] });
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
        err('V2', `Duplicate attribute '${name}' in entity class '${et.name || '?'}'.`, 'entities',
          { entityTypeIds: [et.id] });
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
          err('V3', `Attribute '${a.name || '?'}' in '${et.name || '?'}': default value '${val}' is not a valid number.`, 'entities',
            { entityTypeIds: [et.id] });
        }
      } else if (type === 'boolean') {
        if (val !== 'true' && val !== 'false') {
          err('V3', `Attribute '${a.name || '?'}' in '${et.name || '?'}': default value '${val}' is not 'true' or 'false'.`, 'entities',
            { entityTypeIds: [et.id] });
        }
      }
      // String type always matches, no specific validation needed for its content
    });
  });

  // ── V4: PRIORITY queue discipline requires a numeric 'priority' attribute ──
  queues.forEach(q => {
    if ((q.discipline || 'FIFO').toUpperCase() !== 'PRIORITY') return;
    const ct = entityTypes.find(et =>
      (et.name || '').trim().toLowerCase() === (q.customerType || '').trim().toLowerCase()
    );
    if (!ct) {
      err('V4',
        `Queue '${q.name}' uses PRIORITY discipline but entity class '${q.customerType || '?'}' was not found.`,
        'queues',
        { queueIds: [q.id] });
    } else {
      const priorityAttr = (ct.attrDefs || []).find(a => (a.name || '').trim().toLowerCase() === 'priority');
      if (!priorityAttr) {
        err('V4',
          `Queue '${q.name}' uses PRIORITY discipline but entity class '${ct.name}' has no 'priority' attribute.`,
          'queues',
          { queueIds: [q.id] });
      } else if (priorityAttr.valueType !== 'number') {
        err('V4',
          `Queue '${q.name}' uses PRIORITY discipline but entity class '${ct.name}' must define 'priority' as a number.`,
          'queues',
          { queueIds: [q.id] });
      }
    }
  });

  // ── V5: Distribution parameters in valid bounds (+ V11 warning) ────────────
  function checkDist(dist, params, context, tab) {
    const distName = normalizeDistributionName(dist);
    if (!distName || distName === 'ServerAttr' || distName === 'EntityAttr') return;
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
    const scheduledTime = b.scheduledTime === undefined || b.scheduledTime === null || b.scheduledTime === ""
      ? 0
      : parseFloat(b.scheduledTime);
    if (!Number.isFinite(scheduledTime)) {
      err('V26',
        `B-Event '${b.name || b.id}' scheduledTime '${b.scheduledTime}' is not numeric.`,
        'bevents',
        { eventIds: [b.id] });
    }
    (b.schedules || []).forEach((s, j) => {
      if (s.rows || s.times) return; // rows/times entries have no distribution
      checkDist(s.dist, s.distParams,
        `B-Event '${b.name || b.id}' schedule ${j + 1}`, 'bevents');
    });
  });

  entityTypes.forEach(et => {
    (et.attrDefs || []).forEach(a => {
      if (a.name && a.dist)
        checkDist(a.dist, a.distParams,
          `Entity '${et.name}' attr '${a.name}'`, 'entities');
    });
  });

  const maxSimTimeRaw = model.maxSimTime ?? model.experimentDefaults?.maxSimTime;
  const maxSimTime = maxSimTimeRaw === undefined || maxSimTimeRaw === null || maxSimTimeRaw === ""
    ? DEFAULT_MAX_SIM_TIME
    : parseFloat(maxSimTimeRaw);
  const terminationMode = model.terminationMode ?? model.experimentDefaults?.terminationMode ?? 'time';
  const warmupPeriodRaw = model.warmupPeriod ?? model.experimentDefaults?.warmupPeriod;
  const warmupPeriod = warmupPeriodRaw === undefined || warmupPeriodRaw === null || warmupPeriodRaw === ""
    ? 0
    : parseFloat(warmupPeriodRaw);
  const replicationsRaw = model.replications ?? model.experimentDefaults?.replications;
  const replications = replicationsRaw === undefined || replicationsRaw === null || replicationsRaw === ""
    ? 1
    : Number(replicationsRaw);

  // ── V34: Replication count must be a positive integer ─────────────────────
  if (!Number.isInteger(replications) || replications < 1) {
    err('V34', 'Replication count must be a whole number of 1 or more.', 'execute');
  }

  // ── V35: Warm-up must be shorter than the run duration in time mode ───────
  if (terminationMode === 'time' && Number.isFinite(warmupPeriod) && Number.isFinite(maxSimTime) && warmupPeriod >= maxSimTime) {
    err('V35', 'Warm-up time must be shorter than the run duration.', 'execute');
  }

  entityTypes.forEach(et => {
    if (et.role !== 'server' || !Array.isArray(et.shiftSchedule) || et.shiftSchedule.length === 0) return;
    let previous = -Infinity;
    et.shiftSchedule.forEach((period, idx) => {
      const time = parseFloat(period.time ?? period.startTime);
      const capacity = Number(period.capacity);
      if (!Number.isFinite(time)) {
        err('V14', `Server '${et.name || '?'}' shift period ${idx + 1} requires a numeric time.`, 'entities',
          { entityTypeIds: [et.id] });
      } else {
        if (idx === 0 && time !== 0) {
          err('V14', `Server '${et.name || '?'}' shift schedule must start at time 0.`, 'entities',
            { entityTypeIds: [et.id] });
        }
        if (time < previous) {
          err('V14', `Server '${et.name || '?'}' shift times must be sorted ascending.`, 'entities',
            { entityTypeIds: [et.id] });
        }
        if (Number.isFinite(maxSimTime) && maxSimTime > 0 && time > maxSimTime) {
          warn('V15', `Server '${et.name || '?'}' shift at t=${time} is after the run duration.`, 'entities',
            { entityTypeIds: [et.id] });
        }
        previous = time;
      }
      if (!Number.isInteger(capacity) || capacity < 1) {
        err('V14', `Server '${et.name || '?'}' shift capacity must be a positive integer.`, 'entities',
          { entityTypeIds: [et.id] });
      }
    });
  });

  cEvents.forEach(c => {
    (c.cSchedules || []).forEach((s, j) => {
      checkDist(s.dist, s.distParams,
        `C-Event '${c.name || c.id}' schedule ${j + 1}`, 'cevents');
    });
  });

  // ── V36 / V37: Server failure model validation ────────────────────────────
  const hasField = value => value !== undefined && value !== null;
  entityTypes.forEach(et => {
    const mtbfDist = et.mtbfDist ?? et.failureDist;
    const mtbfParams = et.mtbfDistParams ?? et.failureDistParams;
    const mttrDist = et.mttrDist ?? et.repairDist;
    const mttrParams = et.mttrDistParams ?? et.repairDistParams;
    const hasFailureFields = [mtbfDist, mtbfParams, mttrDist, mttrParams].some(hasField);

    if (!hasFailureFields) return;

    if (et.role !== 'server') {
      err('V36',
        `Entity class '${et.name || '?'}' defines server failure settings, but only server entity types can use MTBF/MTTR.`,
        'entities',
        { entityTypeIds: [et.id] });
      return;
    }

    if (!hasField(mtbfDist) || !hasField(mtbfParams)) {
      err('V37',
        `Server '${et.name || '?'}' must include both MTBF distribution and MTBF parameters.`,
        'entities',
        { entityTypeIds: [et.id] });
    } else {
      checkDist(mtbfDist, mtbfParams, `Server '${et.name || '?'}' MTBF`, 'entities');
    }

    if (!hasField(mttrDist) || !hasField(mttrParams)) {
      err('V37',
        `Server '${et.name || '?'}' must include both MTTR distribution and MTTR parameters.`,
        'entities',
        { entityTypeIds: [et.id] });
    } else {
      checkDist(mttrDist, mttrParams, `Server '${et.name || '?'}' MTTR`, 'entities');
    }
  });

  // ── V6: B-Event schedule references must point to existing event IDs ────────
  const bEventIds = new Set(bEvents.map(b => b.id));

  cEvents.forEach(c => {
    (c.cSchedules || []).forEach(s => {
      if (s.eventId && !bEventIds.has(s.eventId)) {
        err('V6',
          `C-Event '${c.name || c.id}' schedules unknown B-Event ID '${s.eventId}'.`,
          'cevents',
          { eventIds: [c.id] });
      }
    });
  });

  bEvents.forEach(b => {
    (b.schedules || []).forEach(s => {
      if (s.eventId && !bEventIds.has(s.eventId)) {
        err('V6',
          `B-Event '${b.name || b.id}' schedule references unknown event ID '${s.eventId}'.`,
          'bevents',
          { eventIds: [b.id] });
      }
    });
  });

  // ── V8: Model must have at least one arrival source and at least one sink ──
  const hasArrive = bEvents.some(b => /ARRIVE\s*\(/i.test(effectText(b.effect)));
  const hasSinkMacro = bEvents.some(b => {
    const text = effectText(b.effect);
    return /COMPLETE\s*\(/i.test(text) || /RENEGE\s*\(/i.test(text);
  });

  if (!hasArrive && !hasSinkMacro) {
    err('V8',
      'Model has no arrival source and no sink: add an ARRIVE(Type) effect and a COMPLETE() or RENEGE() effect before running.',
      'bevents');
  } else if (!hasArrive) {
    warn('V8',
      'No B-Event with an ARRIVE(Type) effect was found — the simulation will have no entity arrivals.',
      'bevents');
  }

  // A "sink" is effectively an entity reaching a terminal status (done or reneged)
  // This check is a heuristic based on event effects that lead to termination.
  // Product decision (Sprint 35 / M3 review): individual missing source/sink is intentionally
  // a warning, not a blocker — valid one-way flows and custom termination conditions exist.
  // Only the complete absence of both source AND sink is blocked.
  if (hasArrive && !hasSinkMacro) {
    warn('V8',
      'No B-Event with a COMPLETE() or RENEGE() effect was found — entities may never leave the system.',
      'bevents');
  }

  // ── V38: RELEASE immediately followed by COMPLETE in same effect ─────────────
  // RELEASE puts the entity into "waiting" state. If COMPLETE follows in the same
  // effect string, it will always be skipped (COMPLETE requires "serving" status).
  // COMPLETE already releases the server internally — the RELEASE is redundant and
  // breaks the completion. Flag as a warning so the user can remove the RELEASE.
  bEvents.forEach(b => {
    const text = effectText(b.effect);
    const parts = text.split(';').map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      if (/^RELEASE\s*\(/i.test(parts[i]) && /^COMPLETE\s*\(\s*\)/i.test(parts[i + 1])) {
        warn('V38',
          `B-Event '${b.name || b.id}': RELEASE() followed immediately by COMPLETE() — COMPLETE will always be skipped because RELEASE sets the entity to "waiting" state. Remove the RELEASE(); COMPLETE() releases the server automatically.`,
          'bevents',
          { eventIds: [b.id] });
        break;
      }
    }
  });

  // ── V38b: COMPLETE immediately followed by RELEASE in same effect ────────────
  // COMPLETE marks the entity "done" and releases the server. If RELEASE follows,
  // claimMatchesPair returns true (all claim fields are now null) and the entity
  // is re-queued — causing an infinite loop. Use only COMPLETE(); it releases the
  // server automatically.
  bEvents.forEach(b => {
    const text = effectText(b.effect);
    const parts = text.split(';').map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      if (/^COMPLETE\s*\(\s*\)/i.test(parts[i]) && /^RELEASE\s*\(/i.test(parts[i + 1])) {
        warn('V38b',
          `B-Event '${b.name || b.id}': COMPLETE() followed immediately by RELEASE() — the RELEASE will re-queue the completed entity, causing an infinite loop. Remove the RELEASE(); COMPLETE() releases the server automatically.`,
          'bevents',
          { eventIds: [b.id] });
        break;
      }
    }
  });

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
          'cevents',
          { eventIds: [c.id] });
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
          'entities',
          { entityTypeIds: [et.id] });
      }
    });
  });

  // ── V17: Routing table validation (F10.1) ─────────────────────────────────
  bEvents.forEach(b => {
    const routingBranches = Array.isArray(b.routing) ? b.routing.filter(isMeaningfulRoutingBranch) : [];
    const hasConditionalRouting = routingBranches.length > 0;
    if (!hasConditionalRouting) return;
    const bLabel = `B-Event '${b.name || b.id}'`;

    // queueName (in effect string) and routing are mutually exclusive
    const effectStr = effectText(b.effect);
    const releaseHasQueue = hasReleaseTargetQueue(effectStr);
    if (releaseHasQueue) {
      err('V17',
        `${bLabel} specifies both a RELEASE target queue (in effect) and a routing table — they are mutually exclusive.`,
        'bevents',
        { eventIds: [b.id] });
    }

    // Each routing entry must reference a valid queue, or null/"" meaning "exit system"
    routingBranches.forEach((branch, idx) => {
      const qName = branch.queueName == null ? null : String(branch.queueName).trim();
      if (qName === null || qName === '') return; // null = exit system — valid
      if (!queueNamesLower.has(qName.toLowerCase())) {
        err('V17',
          `${bLabel} routing entry ${idx + 1} references unknown queue '${qName}'.`,
          'bevents',
          { eventIds: [b.id] });
      }
    });

    // defaultQueueName must exist
    if (hasConditionalRouting && b.defaultQueueName !== undefined && b.defaultQueueName !== null) {
      const defQ = String(b.defaultQueueName || '').trim();
      if (!queueNamesLower.has(defQ.toLowerCase())) {
        err('V17',
          `${bLabel} defaultQueueName '${defQ}' does not match any defined queue.`,
          'bevents',
          { eventIds: [b.id] });
      }
    }

    const hasNullRoutingBranch = routingBranches.some(branch => {
      const qName = branch.queueName == null ? null : String(branch.queueName).trim();
      return qName === null || qName === '';
    });
    if (hasNullRoutingBranch && !(hasCompleteEffect(effectStr) || hasExactRenegeCtxEffect(effectStr) || hasReleaseEffect(effectStr))) {
      err('V31',
        `${bLabel} routes entities to exit (null queue) but does not explicitly end the lifecycle with COMPLETE(), RENEGE(ctx), or RELEASE().`,
        'bevents',
        { eventIds: [b.id] });
    }
    if (countTerminalSinkEffects(effectStr) > 1) {
      err('V32',
        `${bLabel} has multiple terminal lifecycle sinks. Choose one clear terminal action: COMPLETE() or RENEGE(ctx).`,
        'bevents',
        { eventIds: [b.id] });
    }
  });

  // ── V19: Server entity type count must be integer >= 1 (F10.3) ─────────────
  entityTypes.forEach(et => {
    if (et.role !== "server") return;
    const raw = et.count;
    if (raw === undefined || raw === null || raw === "") return; // defaults to 1 in engine
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
      err('V19',
        `Server type '${et.name || et.id}' count must be an integer >= 1 (got ${JSON.stringify(raw)}).`,
        'entities',
        { entityTypeIds: [et.id] });
    }
  });

  // ── V18: Probabilistic routing validation (F10.2) ─────────────────────────
  bEvents.forEach(b => {
    const hasProbabilisticRouting = Array.isArray(b.probabilisticRouting) && b.probabilisticRouting.length > 0;
    if (!hasProbabilisticRouting) return;
    const bLabel = `B-Event '${b.name || b.id}'`;

    // Mutually exclusive with routing and literal RELEASE queue arg
    const hasConditionalRouting = Array.isArray(b.routing) && b.routing.some(isMeaningfulRoutingBranch);
    if (hasConditionalRouting) {
      err('V18', `${bLabel} has both routing and probabilisticRouting — they are mutually exclusive.`, 'bevents',
        { eventIds: [b.id] });
    }
    const effectStr = effectText(b.effect);
    if (hasReleaseTargetQueue(effectStr)) {
      err('V18', `${bLabel} specifies a RELEASE target queue and probabilisticRouting — mutually exclusive.`, 'bevents',
        { eventIds: [b.id] });
    }

    // Probabilities must sum to 1.0 (± 0.001)
    const sum = b.probabilisticRouting.reduce((s, branch) => s + (parseFloat(branch.probability) || 0), 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      err('V18', `${bLabel} probabilisticRouting probabilities sum to ${sum.toFixed(4)}, must be 1.0 (±0.001).`, 'bevents',
        { eventIds: [b.id] });
    }

    // Each branch must reference a valid queue, or null/"" meaning "exit system"
    let hasNullRouting = false;
    b.probabilisticRouting.forEach((branch, idx) => {
      const qName = branch.queueName == null ? null : String(branch.queueName).trim();
      if (qName === null || qName === '') {
        hasNullRouting = true; // null = exit system
      } else if (!queueNamesLower.has(qName.toLowerCase())) {
        err('V18', `${bLabel} probabilisticRouting entry ${idx + 1} references unknown queue '${qName}'.`, 'bevents',
          { eventIds: [b.id] });
      }
    });

    // V30: If probabilisticRouting has null queue, effect must include COMPLETE() or exact RENEGE(ctx)
    if (hasNullRouting && !(hasCompleteEffect(effectStr) || hasExactRenegeCtxEffect(effectStr) || hasReleaseEffect(effectStr))) {
      err('V30',
        `${bLabel} routes entities to exit (null queue) but has no COMPLETE(), RENEGE(ctx), or RELEASE() effect — entities will not be counted as served.`,
        'bevents',
        { eventIds: [b.id] });
    }
    const isSingleNullExit = b.probabilisticRouting.length === 1 && Math.abs((parseFloat(b.probabilisticRouting[0]?.probability) || 0) - 1) <= 0.001;
    const onlyRoute = b.probabilisticRouting[0];
    const onlyRouteQueue = onlyRoute?.queueName == null ? null : String(onlyRoute.queueName).trim();
    if (isSingleNullExit && (onlyRouteQueue === null || onlyRouteQueue === '') && hasCompleteEffect(effectStr) && !hasExactRenegeCtxEffect(effectStr)) {
      warn('V33',
        `${bLabel} uses probabilisticRouting with a single 100% null exit. Prefer explicit COMPLETE() without routing for a simple terminal completion.`,
        'bevents',
        { eventIds: [b.id] });
    }
    if (countTerminalSinkEffects(effectStr) > 1) {
      err('V32',
        `${bLabel} has multiple terminal lifecycle sinks. Choose one clear terminal action: COMPLETE() or RENEGE(ctx).`,
        'bevents',
        { eventIds: [b.id] });
    }

    // V39: ARRIVE + probabilisticRouting is invalid — ARRIVE routes via its effect argument
    if (/ARRIVE\s*\(/i.test(effectStr)) {
      err('V39',
        `${bLabel} has an ARRIVE effect and probabilisticRouting — ARRIVE events route entities via their effect argument "ARRIVE(Type, QueueName)". Remove probabilisticRouting. Use separate ARRIVE events with proportional rates to split arrivals.`,
        'bevents',
        { eventIds: [b.id] });
    }
  });

  // ── V20: Queue capacity must be integer >= 1 when set (F11.1) ───────────────
  queues.forEach(q => {
    if (q.capacity === undefined || q.capacity === null || q.capacity === '') return;
    const n = parseInt(q.capacity, 10);
    if (!Number.isInteger(n) || n < 1) {
      err('V20', `Queue '${q.name || q.id}' capacity '${q.capacity}' must be an integer >= 1.`, 'queues',
        { queueIds: [q.id] });
    }
    if (q.overflowDestination && q.overflowDestination !== null) {
      const dest = String(q.overflowDestination).trim();
      if (!queueNamesLower.has(dest.toLowerCase())) {
        err('V20', `Queue '${q.name || q.id}' overflowDestination '${dest}' does not match any defined queue.`, 'queues',
          { queueIds: [q.id] });
      }
    }
  });

  // ── V21: balkProbability must be 0–1 (F11.2) — balking is configured on the queue ──
  queues.forEach(q => {
    if (q.balkProbability != null) {
      const p = parseFloat(q.balkProbability);
      if (!Number.isFinite(p) || p < 0 || p > 1) {
        err('V21', `Queue '${q.name || q.id}' balkProbability '${q.balkProbability}' must be between 0 and 1.`, 'queues',
          { queueIds: [q.id] });
      }
    }
  });

  // ── V22: BATCH batchSize must be integer >= 2 ───────────────────────────────
  const batchRefs = [];
  const unbatchRefs = [];
  bEvents.forEach(b => {
    const text = effectText(b.effect);
    const bMatch = text.match(/BATCH\s*\(\s*([^,)]+)\s*,\s*(\d+)\s*\)/i);
    if (bMatch) {
      const qName = bMatch[1].trim();
      const size = parseInt(bMatch[2], 10);
      if (size < 2) {
        err('V22', `B-Event '${b.name || b.id}' uses BATCH with batchSize=${size}, must be >= 2.`, 'bevents',
          { eventIds: [b.id] });
      }
      if (!queueNamesLower.has(qName.toLowerCase())) {
        err('V22', `B-Event '${b.name || b.id}' BATCH references unknown queue '${qName}'.`, 'bevents',
          { eventIds: [b.id] });
      }
      batchRefs.push({ b, qName, size });
    }
    const uMatch = text.match(/UNBATCH\s*\(\s*([^,)]+)\s*\)/i);
    if (uMatch) {
      const qName = uMatch[1].trim();
      if (!queueNamesLower.has(qName.toLowerCase())) {
        err('V23', `B-Event '${b.name || b.id}' UNBATCH references unknown queue '${qName}'.`, 'bevents',
          { eventIds: [b.id] });
      }
      unbatchRefs.push({ b, qName });
    }
  });

  cEvents.forEach(c => {
    const text = effectText(c.effect);
    const bMatch = text.match(/BATCH\s*\(\s*([^,)]+)\s*,\s*(\d+)\s*\)/i);
    if (bMatch) {
      const qName = bMatch[1].trim();
      const size = parseInt(bMatch[2], 10);
      if (size < 2) {
        err('V22', `C-Event '${c.name || c.id}' uses BATCH with batchSize=${size}, must be >= 2.`, 'cevents',
          { eventIds: [c.id] });
      }
      if (!queueNamesLower.has(qName.toLowerCase())) {
        err('V22', `C-Event '${c.name || c.id}' BATCH references unknown queue '${qName}'.`, 'cevents',
          { eventIds: [c.id] });
      }
      batchRefs.push({ c, qName, size });
    }
  });

  // ── V24: Loop guard configuration validation ─────────────────────────────────
  bEvents.forEach(b => {
    if (!b.loopConfig) return;
    const maxCount = parseInt(b.loopConfig.maxLoopCount, 10);
    if (!Number.isInteger(maxCount) || maxCount < 1) {
      err('V24', `B-Event '${b.name || b.id}' loopConfig.maxLoopCount must be an integer >= 1.`, 'bevents',
        { eventIds: [b.id] });
    }
    if (b.loopConfig.exitQueueName) {
      const exitQ = String(b.loopConfig.exitQueueName).trim();
      if (!queueNamesLower.has(exitQ.toLowerCase())) {
        err('V24', `B-Event '${b.name || b.id}' loopConfig.exitQueueName '${exitQ}' does not match any defined queue.`, 'bevents',
          { eventIds: [b.id] });
      }
    }
  });

  // ── V16: Termination check (Sprint 3.2) ─────────────────────────────────────
  const hasTermination = (Number.isFinite(maxSimTime) && maxSimTime > 0) ||
    model.terminationCondition ||
    model.experimentDefaults?.terminationCondition;
  if (!hasTermination && hasArrive) {
    warn('V16',
      'No simulation time limit or termination condition set. Model may run until cycle limit (5000) if arrivals continue indefinitely.',
      'execute');
  }


  // ── V25: RENEGE() argument must be exactly 'ctx' ───────────────────────────
  // RENEGE(TypeName) silently fails because parseInt("TypeName") = NaN.
  // The correct form is always RENEGE(ctx), which uses the context entity ID from the FEL.
  bEvents.forEach(b => {
    const text = effectText(b.effect);
    const m = text.match(/\bRENEGE\(\s*([^)]+)\s*\)/i);
    if (m) {
      const arg = m[1].trim();
      if (arg.toLowerCase() !== 'ctx') {
        err('V25',
          `B-Event '${b.name || b.id}' uses RENEGE('${arg}') which is invalid. ` +
          `Use exactly RENEGE(ctx) to reference the current entity.`,
          'bevents',
          { eventIds: [b.id] });
      }
    }
  });
  cEvents.forEach(c => {
    const text = effectText(c.effect);
    const m = text.match(/\bRENEGE\(\s*([^)]+)\s*\)/i);
    if (m) {
      const arg = m[1].trim();
      if (arg.toLowerCase() !== 'ctx') {
        err('V25',
          `C-Event '${c.name || c.id}' uses RENEGE('${arg}') which is invalid. ` +
          `Use exactly RENEGE(ctx) to reference the current entity.`,
          'cevents',
          { eventIds: [c.id] });
      }
    }
  });

  // ── V26: Container types — valid id/capacity/initialLevel ──────────────────
  const containerTypes = model.containerTypes || [];
  const containerIds = new Set();
  containerTypes.forEach((ct, i) => {
    const id = (ct.id || '').trim();
    if (!id) {
      err('V26', `Container at position ${i + 1} has an empty id.`, 'containers');
    } else if (containerIds.has(id.toLowerCase())) {
      err('V26', `Duplicate container id: '${id}'.`, 'containers');
    } else {
      containerIds.add(id.toLowerCase());
    }
    const cap = parseFloat(ct.capacity);
    if (!isNaN(cap) && cap <= 0) {
      err('V26', `Container '${id || i + 1}': capacity must be > 0.`, 'containers');
    }
    const init = parseFloat(ct.initialLevel);
    if (!isNaN(init)) {
      if (init < 0) {
        err('V26', `Container '${id || i + 1}': initialLevel must be >= 0.`, 'containers');
      }
      if (!isNaN(cap) && cap > 0 && init > cap) {
        err('V26', `Container '${id || i + 1}': initialLevel (${init}) exceeds capacity (${cap}).`, 'containers');
      }
    }
  });

  // ── V27: FILL/DRAIN must reference a declared container ──────────────────
  const containerIdsLower = new Set([...containerIds]);
  const checkContainerRefs = (events, tab) => {
    events.forEach(ev => {
      const text = effectText(ev.effect);
      const hits = text.match(/\b(FILL|DRAIN)\([^)]+\)/gi) || [];
      hits.forEach(hit => {
        const inner = hit.match(/\b(FILL|DRAIN)\(([^,)]+)/i);
        if (!inner) return;
        const macro = inner[1].toUpperCase();
        const name  = inner[2].trim();
        if (!containerIdsLower.has(name.toLowerCase())) {
          err('V27', `${tab === 'bevents' ? 'B' : 'C'}-Event '${ev.name || ev.id}' ${macro} references undeclared container '${name}'.`, tab,
            { eventIds: [ev.id] });
        }
      });
    });
  };
  checkContainerRefs(bEvents, 'bevents');
  checkContainerRefs(cEvents, 'cevents');

  // ── V28: epoch must be a valid ISO 8601 datetime when set ─────────────────────
  if (model.epoch != null && model.epoch !== '') {
    const d = new Date(model.epoch);
    if (isNaN(d.getTime())) {
      err('V28', `Model epoch '${model.epoch}' is not a valid ISO 8601 datetime. Use the Settings tab to correct it.`, 'overview');
    }
  }

  // ── V29: cSchedule list with all `when` entries but no fallback ─────────────
  for (const ce of (model.cEvents || [])) {
    const css = ce.cSchedules || [];
    if (css.length > 0 && css.every(cs => cs.when)) {
      warn('V29', `C-event '${ce.name || ce.id}' has attribute-conditional cSchedules but no fallback entry (one without a 'when' condition). Entities that don't match any condition will receive no service.`, 'cevents',
        { eventIds: [ce.id] });
    }
  }

  // ── W-CAP-01: Multi-class resource contention ──────────────────────────────
  // Two or more C-events SEIZE() the same server type — results may be sensitive
  // to C-event priority ordering.
  const serverTypesSeizedByCEvent = new Map();
  cEvents.forEach(c => {
    const text = effectText(c.effect);
    const seizes = [...text.matchAll(/(?:SEIZE|ASSIGN)\s*\(\s*[^,)]+\s*,\s*([^)]+)\)/gi)];
    seizes.forEach(m => {
      const serverType = m[1].trim();
      if (!serverType) return;
      const key = serverType.toLowerCase();
      if (!serverTypesSeizedByCEvent.has(key)) {
        serverTypesSeizedByCEvent.set(key, []);
      }
      serverTypesSeizedByCEvent.get(key).push(c.id);
    });
  });
  for (const [serverType, cEventIds] of serverTypesSeizedByCEvent) {
    if (cEventIds.length >= 2) {
      warn('W-CAP-01',
        `Complex multi-class resource contention detected: ${cEventIds.length} C-events compete for server type '${serverType}'. Results may be sensitive to C-event priority ordering.`,
        'cevents',
        { eventIds: cEventIds });
    }
  }

  // ── W-CAP-02: Very high arrival rate (suggests continuous flow) ────────────
  // Any B-Event has a schedule with mean interval < 0.001 time units.
  bEvents.forEach(b => {
    (b.schedules || []).forEach((s, j) => {
      const distName = normalizeDistributionName(s.dist);
      if (!distName || distName === 'ServerAttr' || distName === 'EntityAttr') return;
      const p = s.distParams || {};
      if (distName === 'Exponential') {
        const mean = parseFloat(p.mean);
        if (Number.isFinite(mean) && mean < 0.001) {
          warn('W-CAP-02',
            `B-Event '${b.name || b.id}' schedule ${j + 1}: Exponential mean interval = ${mean} (< 0.001). simmodlr models discrete individual entities. For continuous flow or aggregate quantities, consider SD Studio.`,
            'bevents',
            { eventIds: [b.id] });
        }
      }
    });
  });

  // ── V40: SET_ATTR targets undeclared attribute (warning) ──────────────────
  // ── V41: SET_ATTR targets immutable attribute (error) ─────────────────────
  // ── V44: SET_ATTR with no preceding context macro (warning) ───────────────
  {
    const allAttrDefs = (entityTypes).flatMap(et => (et.attrDefs || []));
    const declaredNames = new Set(allAttrDefs.map(a => (a.name || '').trim()).filter(Boolean));
    const immutableNames = new Set(
      allAttrDefs.filter(a => a.mutable === false).map(a => (a.name || '').trim()).filter(Boolean)
    );
    const CTX_MACRO_RE = /(?:ARRIVE|ASSIGN|SEIZE|COSEIZE|BATCH|SPLIT)\s*\(/i;

    const checkEffects = (events, tab) => {
      events.forEach(ev => {
        const text = effectText(ev.effect);
        if (!text) return;
        const parts = text.split(';').map(s => s.trim()).filter(Boolean);
        let hasCtx = false;
        parts.forEach(part => {
          if (CTX_MACRO_RE.test(part)) { hasCtx = true; return; }
          const m = part.match(/^SET_ATTR\s*\(\s*(?:Entity\.)?(\w+)/i);
          if (!m) return;
          const attrName = m[1];
          if (immutableNames.has(attrName)) {
            err('V41', `SET_ATTR(${attrName}) in '${ev.name || ev.id}': attribute is immutable.`, tab,
              { eventIds: [ev.id] });
          } else if (!declaredNames.has(attrName)) {
            warn('V40', `SET_ATTR(${attrName}) in '${ev.name || ev.id}': attribute '${attrName}' is not declared on any entity class.`, tab,
              { eventIds: [ev.id] });
          }
          if (!hasCtx) {
            warn('V44', `SET_ATTR(${attrName}) in '${ev.name || ev.id}' has no preceding ARRIVE/ASSIGN/COSEIZE — write will be skipped at runtime.`, tab,
              { eventIds: [ev.id] });
          }
        });
      });
    };
    checkEffects(bEvents, 'bevents');
    checkEffects(cEvents, 'cevents');
  }

  // ── V42: SPT discipline but entity has no serviceTime / processingTime ─────
  // ── V43: EDD discipline but entity has no dueDate ─────────────────────────
  queues.forEach(q => {
    const d = (q.discipline || '').toUpperCase();
    const ct = entityTypes.find(et =>
      (et.name || '').trim().toLowerCase() === (q.customerType || '').trim().toLowerCase()
    );
    if (d === 'SPT') {
      if (ct) {
        const hasAttr = (ct.attrDefs || []).some(a => {
          const n = (a.name || '').trim().toLowerCase();
          return n === 'servicetime' || n === 'processingtime';
        });
        if (!hasAttr) {
          warn('V42', `Queue '${q.name}' uses SPT discipline but entity class '${ct.name}' has no 'serviceTime' or 'processingTime' attribute.`, 'queues',
            { queueIds: [q.id] });
        }
      }
    } else if (d === 'EDD') {
      if (ct) {
        const hasDueDate = (ct.attrDefs || []).some(a => (a.name || '').trim().toLowerCase() === 'duedate');
        if (!hasDueDate) {
          warn('V43', `Queue '${q.name}' uses EDD discipline but entity class '${ct.name}' has no 'dueDate' attribute.`, 'queues',
            { queueIds: [q.id] });
        }
      }
    }
  });

  // ── V45: Detect orphaned queues (disconnected model fragments) ───────────────
  // A queue that is never referenced as a routing destination will never receive
  // entities. Guards against LLM-generated fragment patterns where extra queues
  // and C-events are included without connecting them to the main model path.
  // Only fires when at least one queue IS reachable (avoids false positives on
  // models that use single-arg ARRIVE with implicit default routing).
  {
    const reachableNames = new Set();
    const ARRIVE_QUEUE_G  = /ARRIVE\s*\([^,)]+,\s*([^)]+)\)/gi;
    const RELEASE_QUEUE_G = /RELEASE\s*\([^,)]+,\s*([^)]+)\)/gi;

    bEvents.forEach(b => {
      const text = effectText(b.effect);
      for (const m of text.matchAll(ARRIVE_QUEUE_G))  reachableNames.add(m[1].trim().toLowerCase());
      for (const m of text.matchAll(RELEASE_QUEUE_G)) reachableNames.add(m[1].trim().toLowerCase());
      if (b.defaultQueueName)
        reachableNames.add(b.defaultQueueName.toLowerCase());
      (b.routing || []).forEach(r => r.queueName && reachableNames.add(r.queueName.toLowerCase()));
      (b.probabilisticRouting || []).forEach(r => r.queueName && reachableNames.add(r.queueName.toLowerCase()));
      if (b.loopConfig?.exitQueueName)
        reachableNames.add(b.loopConfig.exitQueueName.toLowerCase());
    });
    queues.forEach(q => {
      if (q.overflowDestination) reachableNames.add(q.overflowDestination.toLowerCase());
    });

    if (reachableNames.size > 0) {
      queues.forEach(q => {
        if (!reachableNames.has((q.name || '').toLowerCase())) {
          err('V45',
            `Queue "${q.name}" is never used as a routing destination — it may be a disconnected fragment. Add an ARRIVE or RELEASE routing that targets it, or remove it.`,
            'queues',
            { queueIds: [q.id] });
        }
      });
    }
  }

  // ── V46: Detect overflowDestination cycles (F11.3) ────────────────────────
  // At runtime, attemptQueueJoin() recursively reroutes a blocked entity through
  // overflowDestination chains and is guarded against cycles (it falls back to
  // "exit system" rather than looping). A cycle is still a design error — flag it
  // here so it's caught before run, not silently swallowed at runtime.
  {
    const destByName = new Map();
    queues.forEach(q => {
      if (q.overflowDestination) {
        destByName.set((q.name || '').trim().toLowerCase(), String(q.overflowDestination).trim().toLowerCase());
      }
    });
    queues.forEach(q => {
      const startKey = (q.name || '').trim().toLowerCase();
      if (!destByName.has(startKey)) return;
      const seen = new Set();
      let cur = startKey;
      while (destByName.has(cur)) {
        if (seen.has(cur)) {
          err('V46',
            `Queue overflow chain starting at "${q.name}" cycles back to "${cur}" — entities would loop instead of reaching a terminal queue or exiting the system.`,
            'queues',
            { queueIds: [q.id] });
          break;
        }
        seen.add(cur);
        cur = destByName.get(cur);
      }
    });
  }

  return { errors, warnings };
}

// ── Structural Change Detection ───────────────────────────────────────────────
//
// detectStructuralChanges(oldModel, newModel) returns { isStructural, changes }.
// Structural changes = topology changes (entity types, events, queues, conditions, graph).
// Parameter changes = distribution params, server counts, experiment defaults, name/description.

const STRUCTURAL_KEYS = ["entityTypes", "bEvents", "cEvents", "queues", "graph"];
const PARAMETER_KEYS = ["experimentDefaults", "goals", "name", "description"];

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    if (!keysA.every((k, i) => k === keysB[i])) return false;
    return keysA.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

function countItems(arr) { return Array.isArray(arr) ? arr.length : 0; }

function diffArrays(oldArr, newArr, idKey = "id") {
  const oldIds = new Set((oldArr || []).map(x => x[idKey]));
  const newIds = new Set((newArr || []).map(x => x[idKey]));
  const added = [...newIds].filter(id => !oldIds.has(id));
  const removed = [...oldIds].filter(id => !newIds.has(id));
  const common = [...newIds].filter(id => oldIds.has(id));
  const modified = common.filter(id => {
    const oldItem = (oldArr || []).find(x => x[idKey] === id);
    const newItem = (newArr || []).find(x => x[idKey] === id);
    return !deepEqual(oldItem, newItem);
  });
  return { added, removed, modified };
}

export function detectStructuralChanges(oldModel, newModel) {
  const changes = [];

  // Entity types
  const etDiff = diffArrays(oldModel?.entityTypes, newModel?.entityTypes, "id");
  if (etDiff.added.length) changes.push(`Entity type(s) added: ${etDiff.added.join(", ")}`);
  if (etDiff.removed.length) changes.push(`Entity type(s) removed: ${etDiff.removed.join(", ")}`);
  if (etDiff.modified.length) changes.push(`Entity type(s) modified: ${etDiff.modified.join(", ")}`);

  // B-Events
  const bDiff = diffArrays(oldModel?.bEvents, newModel?.bEvents, "id");
  if (bDiff.added.length) changes.push(`B-Event(s) added: ${bDiff.added.join(", ")}`);
  if (bDiff.removed.length) changes.push(`B-Event(s) removed: ${bDiff.removed.join(", ")}`);
  if (bDiff.modified.length) changes.push(`B-Event(s) modified: ${bDiff.modified.join(", ")}`);

  // C-Events
  const cDiff = diffArrays(oldModel?.cEvents, newModel?.cEvents, "id");
  if (cDiff.added.length) changes.push(`C-Event(s) added: ${cDiff.added.join(", ")}`);
  if (cDiff.removed.length) changes.push(`C-Event(s) removed: ${cDiff.removed.join(", ")}`);
  if (cDiff.modified.length) changes.push(`C-Event(s) modified: ${cDiff.modified.join(", ")}`);

  // Queues
  const qDiff = diffArrays(oldModel?.queues, newModel?.queues, "id");
  if (qDiff.added.length) changes.push(`Queue(s) added: ${qDiff.added.join(", ")}`);
  if (qDiff.removed.length) changes.push(`Queue(s) removed: ${qDiff.removed.join(", ")}`);
  if (qDiff.modified.length) changes.push(`Queue(s) modified: ${qDiff.modified.join(", ")}`);

  // Graph structure
  const oldGraph = oldModel?.graph;
  const newGraph = newModel?.graph;
  if (!deepEqual(oldGraph, newGraph)) {
    const oldNodeCount = oldGraph?.nodes?.length || 0;
    const newNodeCount = newGraph?.nodes?.length || 0;
    const oldEdgeCount = oldGraph?.edges?.length || 0;
    const newEdgeCount = newGraph?.edges?.length || 0;
    if (oldNodeCount !== newNodeCount || oldEdgeCount !== newEdgeCount) {
      changes.push(`Graph structure changed (${oldNodeCount}→${newNodeCount} nodes, ${oldEdgeCount}→${newEdgeCount} edges)`);
    }
  }

  return {
    isStructural: changes.length > 0,
    changes,
  };
}

