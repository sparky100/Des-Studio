// engine/validation.js — Pre-run model validation
//
// validateModel(model) returns { errors, warnings }.
// errors   — blocking: run must be prevented
// warnings — non-blocking: run proceeds with a visible banner
//
// Each item: { code, message, tab }
// tab maps to ModelDetail tab IDs: 'entities' | 'state' | 'bevents' | 'cevents' | 'queues'

export function validateModel(model) {
  const errors   = [];
  const warnings = [];
  const err  = (code, message, tab) => errors.push({ code, message, tab });
  const warn = (code, message, tab) => warnings.push({ code, message, tab });

  const entityTypes = model.entityTypes    || [];
  const bEvents     = model.bEvents        || [];
  const cEvents     = model.cEvents        || [];
  const queues      = model.queues         || [];

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
    if (!dist || dist === 'ServerAttr') return;
    const p = params || {};
    switch (dist) {
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

  // ── V8: Model must have at least one arrival source ─────────────────────────
  // In the current engine, Source = B-Event whose effect contains ARRIVE(
  const hasArrive = bEvents.some(b => b.effect && b.effect.includes('ARRIVE('));
  if (bEvents.length > 0 && !hasArrive) {
    warn('V8',
      'No B-Event with an ARRIVE(Type) effect was found — the simulation will have no entity arrivals.',
      'bevents');
  }

  // ── V9: C-Event conditions must reference defined queues ────────────────────
  const queueNamesLower = new Set(
    queues.map(q => (q.name || '').trim().toLowerCase()).filter(Boolean)
  );
  cEvents.forEach(c => {
    if (!c.condition) return;
    const queueRefs = [...c.condition.matchAll(/queue\((\w+)\)/gi)].map(m => m[1].toLowerCase());
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

  return { errors, warnings };
}
