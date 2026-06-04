import { buildKpis, goalsToPrompt, buildGoalGaps } from './prompts.js';

// Builds a self-contained Markdown document for paste-into-LLM analysis.
// Must NOT call truncateWords — this is a file export, not a proxy call.
export function buildLLMBundle(model = {}, results = {}, config = {}) {
  const lines = [];

  // ── PREAMBLE ─────────────────────────────────────────────────────────────
  lines.push('# simmodlr — Simulation Results Bundle');
  lines.push('');
  lines.push('## About this document');
  lines.push('');
  lines.push(
    'This document was exported from simmodlr, a browser-based discrete-event simulation (DES) ' +
    "platform that implements Pidd's Three-Phase Method. A simmodlr model consists of:"
  );
  lines.push('');
  lines.push('- **Entity types** — objects that flow through the system (customers, patients, jobs) and servers that provide service capacity.');
  lines.push('- **Queues** — waiting lines where entities accumulate when all servers are busy.');
  lines.push('- **B-Events (Bound events)** — time-triggered events such as arrivals and service completions.');
  lines.push('- **C-Events (Conditional events)** — state-triggered events that fire when a condition is true (e.g. "entity waiting AND server idle → start service").');
  lines.push('');
  lines.push(
    'The Three-Phase engine advances the clock to the next event time (Phase A), fires all events ' +
    'scheduled for that moment (Phase B), then scans all conditional events repeatedly until none can ' +
    'fire (Phase C, restart rule). Every run uses a seeded pseudo-random number generator so results ' +
    'are fully reproducible from the stored seed.'
  );
  lines.push('');
  lines.push(
    '**How to read the results:** wait time is the time an entity spent in a queue before service began. ' +
    'Sojourn time is total time in the system (wait + service). Utilisation is the fraction of time a ' +
    'server was busy. Confidence intervals (when present) are 95% t-intervals computed across ' +
    'independent replications.'
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── MODEL DEFINITION ─────────────────────────────────────────────────────
  lines.push('## Model Definition');
  lines.push('');
  lines.push(`**Name:** ${model.name || 'Untitled model'}`);
  if (model.description) lines.push(`**Description:** ${model.description}`);
  if (model.timeUnit) lines.push(`**Time unit:** ${model.timeUnit}`);
  lines.push('');

  const entityTypes = model.entityTypes || [];
  if (entityTypes.length) {
    lines.push('### Entity Types');
    lines.push('');
    lines.push('| Name | Role | Count | Attributes |');
    lines.push('|------|------|-------|-----------|');
    for (const et of entityTypes) {
      const attrs = (et.attrDefs || [])
        .map(a => `${a.name} (${a.valueType}${a.defaultValue != null && a.defaultValue !== '' ? `=${a.defaultValue}` : ''})`)
        .join(', ') || '—';
      const count = et.role === 'server' ? (et.count ?? 1) : '—';
      lines.push(`| ${et.name || '?'} | ${et.role || 'customer'} | ${count} | ${attrs} |`);
    }
    lines.push('');
  }

  const queues = model.queues || [];
  if (queues.length) {
    lines.push('### Queues');
    lines.push('');
    lines.push('| Name | Customer type | Discipline | Capacity |');
    lines.push('|------|--------------|------------|---------|');
    for (const q of queues) {
      lines.push(`| ${q.name || '?'} | ${q.customerType || '—'} | ${q.discipline || 'FIFO'} | ${q.capacity ?? 'unlimited'} |`);
    }
    lines.push('');
  }

  const bEvents = model.bEvents || [];
  if (bEvents.length) {
    lines.push('### B-Events (Time-triggered)');
    lines.push('');
    lines.push('| Name | Effect | Distribution |');
    lines.push('|------|--------|-------------|');
    for (const ev of bEvents) {
      const effect = Array.isArray(ev.effect) ? ev.effect.join('; ') : String(ev.effect || '—');
      const sched = (ev.schedules || [])
        .filter(s => !s.rows && !s.times && s.dist)
        .map(s => `${s.dist}(${JSON.stringify(s.distParams || {})})`)
        .join('; ') || '—';
      lines.push(`| ${ev.name || '?'} | ${effect} | ${sched} |`);
    }
    lines.push('');
  }

  const cEvents = model.cEvents || [];
  if (cEvents.length) {
    lines.push('### C-Events (State-triggered)');
    lines.push('');
    lines.push('| Name | Priority | Condition | Effect |');
    lines.push('|------|----------|-----------|--------|');
    for (const ev of cEvents) {
      const cond = typeof ev.condition === 'string'
        ? ev.condition
        : JSON.stringify(ev.condition || '');
      const effect = Array.isArray(ev.effect) ? ev.effect.join('; ') : String(ev.effect || '—');
      lines.push(`| ${ev.name || '?'} | ${ev.priority ?? 1} | ${cond || '—'} | ${effect} |`);
    }
    lines.push('');
  }

  const goalsList = goalsToPrompt(model);
  if (goalsList && goalsList.length) {
    lines.push('### Performance Goals');
    lines.push('');
    lines.push('| Label | Metric | Operator | Target |');
    lines.push('|-------|--------|----------|--------|');
    for (const g of goalsList) {
      lines.push(`| ${g.label} | ${g.metric} | ${g.operator} | ${g.target} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // ── EXPERIMENT CONFIGURATION ──────────────────────────────────────────────
  lines.push('## Experiment Configuration');
  lines.push('');
  lines.push('| Parameter | Value |');
  lines.push('|-----------|-------|');
  if (config.runLabel) lines.push(`| Run label | ${config.runLabel} |`);
  if (config.ranAt) lines.push(`| Run at | ${config.ranAt} |`);
  lines.push(`| Replications | ${config.replications ?? 1} |`);
  lines.push(`| Max sim time | ${config.maxSimTime ?? '—'} |`);
  lines.push(`| Warm-up period | ${config.warmupPeriod ?? 0} |`);
  lines.push(`| Seed | ${config.seed ?? 'random'} |`);
  if (config.scheduleName) lines.push(`| Schedule | ${config.scheduleName} |`);
  if (config.engineVersion) lines.push(`| Engine version | ${config.engineVersion} |`);
  if (config.prngAlgorithm) lines.push(`| PRNG | ${config.prngAlgorithm} |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── RESULTS ───────────────────────────────────────────────────────────────
  lines.push('## Results');
  lines.push('');

  const kpis = buildKpis(model, results);

  lines.push('### Headline KPIs');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  if (kpis.totalEntities != null) lines.push(`| Total entities arrived | ${kpis.totalEntities} |`);
  if (kpis.served != null) lines.push(`| Entities served | ${kpis.served} |`);
  if (kpis.reneged != null) lines.push(`| Entities reneged | ${kpis.reneged} |`);
  if (kpis.avgWait != null) lines.push(`| Average wait time | ${kpis.avgWait.toFixed(2)} |`);
  if (kpis.avgService != null) lines.push(`| Average service time | ${kpis.avgService.toFixed(2)} |`);
  if (kpis.avgSojourn != null) lines.push(`| Average sojourn time | ${kpis.avgSojourn.toFixed(2)} |`);
  if (kpis.avgWIP != null) lines.push(`| Average WIP | ${kpis.avgWIP.toFixed(2)} |`);
  if (kpis.totalCost != null) lines.push(`| Total cost | ${kpis.totalCost.toFixed(2)} |`);
  if (kpis.costPerServed != null) lines.push(`| Cost per served | ${kpis.costPerServed.toFixed(2)} |`);
  lines.push('');

  if (kpis.queues && kpis.queues.length) {
    lines.push('### Per-Queue Wait Times');
    lines.push('');
    lines.push('| Queue | n | Mean | p50 | p90 | p95 | p99 | Blocking | Balking |');
    lines.push('|-------|---|------|-----|-----|-----|-----|---------|--------|');
    for (const q of kpis.queues) {
      const f = v => v != null ? v.toFixed(2) : '—';
      const n = q.nServed ?? '—';
      lines.push(
        `| ${q.name} | ${n} | ${f(q.meanWait)} | ${f(q.p50)} | ${f(q.p90)} | ${f(q.p95)} | ${f(q.p99)} | ${q.blockingCount ?? '—'} | ${q.balkCount ?? '—'} |`
      );
    }
    lines.push('');
  }

  if (kpis.resources && kpis.resources.length) {
    lines.push('### Per-Resource Utilisation');
    lines.push('');
    lines.push('| Resource | Count | Utilisation | Busy count | Idle count |');
    lines.push('|----------|-------|-------------|-----------|-----------|');
    for (const r of kpis.resources) {
      const util = r.utilisation != null ? `${r.utilisation}%` : '—';
      lines.push(`| ${r.name} | ${r.count ?? '—'} | ${util} | ${r.busyCount ?? '—'} | ${r.idleCount ?? '—'} |`);
    }
    lines.push('');
  }

  // CI table — present only when aggregateStats exists (multi-replication)
  const aggregateStats = results.aggregateStats || {};
  const ciKeys = Object.keys(aggregateStats).filter(k => aggregateStats[k]?.mean != null);
  if (ciKeys.length) {
    lines.push('### Confidence Intervals (95%)');
    lines.push('');
    lines.push('| Metric | n | Mean | Lower | Upper | Half-width |');
    lines.push('|--------|---|------|-------|-------|-----------|');
    for (const key of ciKeys) {
      const ci = aggregateStats[key];
      const f = v => v != null ? Number(v).toFixed(2) : '—';
      lines.push(`| ${key} | ${ci.n ?? '—'} | ${f(ci.mean)} | ${f(ci.lower)} | ${f(ci.upper)} | ${f(ci.halfWidth)} |`);
    }
    lines.push('');
  }

  const goalGaps = buildGoalGaps(model, aggregateStats);
  if (goalGaps && goalGaps.length) {
    lines.push('### Goals Assessment');
    lines.push('');
    lines.push('| Goal | Metric | Target | Actual | Status |');
    lines.push('|------|--------|--------|--------|--------|');
    for (const g of goalGaps) {
      const actual = g.current != null ? Number(g.current).toFixed(2) : 'n/a';
      const status = g.current == null ? 'UNKNOWN' : g.met ? '✓ PASS' : '✗ FAIL';
      lines.push(`| ${g.label} | ${g.metric} | ${g.operator} ${g.target} | ${actual} | ${status} |`);
    }
    lines.push('');
  }

  if (kpis.outcomes && kpis.outcomes.length) {
    lines.push('### Journey Outcomes');
    lines.push('');
    lines.push('| Outcome | Count | Avg wait | Avg sojourn |');
    lines.push('|---------|-------|----------|------------|');
    for (const o of kpis.outcomes) {
      const f = v => v != null ? Number(v).toFixed(2) : '—';
      lines.push(`| ${o.routeLabel || o.routeId} | ${o.count ?? '—'} | ${f(o.avgWait)} | ${f(o.avgSojourn)} |`);
    }
    lines.push('');
  }

  if (kpis.warning_phaseCTruncated) {
    lines.push('> **Warning:** Phase C truncation occurred — C-Event scan exceeded 500 iterations in a single clock tick. Review C-Event conditions for possible loops.');
    lines.push('');
  }
  if (kpis.warnings && kpis.warnings.length) {
    for (const w of kpis.warnings) {
      lines.push(`> **Warning:** ${w}`);
    }
    lines.push('');
  }

  // ── REPLICATION SUMMARY — omitted for single-replication runs ────────────
  const replList = results.replications || [];
  if (replList.length > 1) {
    lines.push('---');
    lines.push('');
    lines.push('## Replication Summary');
    lines.push('');
    lines.push('| # | Seed | Served | Reneged | Avg wait |');
    lines.push('|---|------|--------|---------|---------|');
    for (const rep of replList) {
      const s = rep.summary || {};
      const avgWait = s.avgWait != null ? Number(s.avgWait).toFixed(2) : '—';
      lines.push(`| ${rep.replicationIndex ?? '?'} | ${rep.seed ?? '—'} | ${s.served ?? '—'} | ${s.reneged ?? '—'} | ${avgWait} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`*Exported from simmodlr — ${new Date().toISOString()}*`);

  return lines.join('\n');
}
