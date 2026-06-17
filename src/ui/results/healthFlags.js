// Deterministic health flags evaluated from simulation results — no LLM required.
// Returns a sorted array of { code, severity, resource?, message, suggestion } objects.
// severity: "critical" | "warning"

export function evaluateResultsHealth(results = {}, model = {}) {
  const flags = [];
  const summary = results?.summary || {};
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];

  // H1 — Resource utilisation ≥ 80% / ≥ 90% / ≥ 95%
  for (const [typeName, stats] of Object.entries(summary.perResource || {})) {
    const util = Number(stats?.utilisation);
    if (!Number.isFinite(util)) continue;
    if (util >= 0.95) {
      flags.push({ code: "H1", severity: "critical", resource: typeName,
        message: `${typeName} at ${Math.round(util * 100)}% utilisation — queue is growing unbounded.`,
        suggestion: "Reduce arrival rate or add more servers — the system cannot sustain this load." });
    } else if (util >= 0.9) {
      flags.push({ code: "H1", severity: "critical", resource: typeName,
        message: `${typeName} at ${Math.round(util * 100)}% utilisation — saturated, queue will grow without more capacity.`,
        suggestion: "Add more servers or reduce arrival rate to prevent unbounded queue growth." });
    } else if (util >= 0.8) {
      flags.push({ code: "H1", severity: "warning", resource: typeName,
        message: `${typeName} at ${Math.round(util * 100)}% utilisation — approaching saturation, expect queue build-up.`,
        suggestion: "Monitor utilisation — may need additional capacity for longer runs or higher loads." });
    }
  }

  // H5 — Resource starvation (idle with work queued)
  for (const [typeName, stats] of Object.entries(summary.perResource || {})) {
    const starvPct = Number(stats?.starvationPct);
    if (!Number.isFinite(starvPct) || starvPct <= 0.1) continue;
    flags.push({ code: "H5", severity: "warning", resource: typeName,
      message: `${typeName} starved ${Math.round(starvPct * 100)}% of the time — idle servers while work was queued.`,
      suggestion: "Check routing rules or entity-to-server assignment — servers are idle when work is available." });
  }

  // H2 — Growing queue (last 20% of run mean > 1.5× first 20%) — requires timeSeries
  if (timeSeries.length >= 10) {
    const splitAt = Math.max(1, Math.floor(timeSeries.length * 0.2));
    const queueNames = Object.keys(timeSeries[0]?.byQueue || {});
    for (const q of queueNames) {
      const avg = (slice) => {
        const sum = slice.reduce((s, pt) => s + (pt.byQueue?.[q]?.waiting ?? 0), 0);
        return slice.length > 0 ? sum / slice.length : 0;
      };
      const earlyMean = avg(timeSeries.slice(0, splitAt));
      const lateMean  = avg(timeSeries.slice(-splitAt));
      if (lateMean > earlyMean * 1.5 && lateMean > 2) {
        flags.push({ code: "H2", severity: "warning", resource: q,
          message: `${q} queue trending up (avg ${earlyMean.toFixed(1)} → ${lateMean.toFixed(1)} waiting) — the system may not reach steady state.`,
          suggestion: "Check upstream constraints — the queue is growing faster than it's being drained, suggesting a capacity shortfall or an arrival surge." });
      }
    }
  }

  // H3 — Low completion rate (high WIP at end of run)
  const ts = summary.terminatingState;
  const totalWip = (ts?.waitingAtEnd ?? 0) + (ts?.servingAtEnd ?? 0);
  const wipPct = ts?.wipPct;
  if (Number.isFinite(wipPct) && wipPct > 0) {
    const tsServing = ts?.servingAtEnd ?? 0;
    const tsWaiting = ts?.waitingAtEnd ?? 0;
    const splitNote = totalWip > 0 && (tsServing > 0 || tsWaiting > 0)
      ? ` (${tsServing} serving, ${tsWaiting} waiting)`
      : "";
    if (wipPct >= 20) {
      flags.push({ code: "H3", severity: "critical",
        message: `${wipPct}% of arrivals (≈${totalWip} entities${splitNote}) still in system at end of run — large unfinished backlog, results may be unreliable.`,
        suggestion: "Identify and relieve capacity constraints — arriving entities are backing up faster than the system can serve them." });
    } else if (wipPct >= 10) {
      flags.push({ code: "H3", severity: "warning",
        message: `${wipPct}% of arrivals (≈${totalWip} entities${splitNote}) still in system at end of run.`,
        suggestion: "Check for capacity constraints — a portion of arrivals could not complete before the run ended." });
    }
  }

  // H7 — Very low completion rate (system cannot process demand)
  const totalArrived = Number(summary.total ?? summary.arrived ?? summary.totalArrived ?? 0);
  const served = Number(summary.served ?? 0);
  const servedRatio = summary.servedRatio != null
    ? Number(summary.servedRatio)
    : (totalArrived > 0 ? served / totalArrived : null);
  if (servedRatio != null && servedRatio < 0.5 && totalArrived >= 10) {
    flags.push({ code: "H7", severity: "critical",
      message: `Only ${Math.round(servedRatio * 100)}% of arrivals completed — the system cannot keep up with demand.`,
      suggestion: "Reduce arrival rate or add capacity — the system is severely overwhelmed." });
  }

  // H4 — Peak queue ≥ 2× finite capacity, or > 50 when unbounded
  const maxLengths = results?.runtimeMetrics?.max_queue_length_by_queue || {};
  for (const queue of model?.queues || []) {
    const peak = Number(maxLengths[queue.name]);
    if (!Number.isFinite(peak) || peak < 1) continue;
    const capacity = Number(queue.capacity);
    if (Number.isFinite(capacity) && capacity > 0) {
      if (peak >= capacity * 2) {
        flags.push({ code: "H4", severity: "warning", resource: queue.name,
          message: `${queue.name} peaked at ${peak} waiting (${Math.round(peak / capacity)}× its capacity of ${capacity}).`,
          suggestion: `Increase ${queue.name} capacity or add an overflow route to handle peak demand.` });
      }
    } else if (peak > 50) {
      flags.push({ code: "H4", severity: "warning", resource: queue.name,
        message: `${queue.name} peaked at ${peak} waiting.`,
        suggestion: `Consider adding a capacity limit or overflow route to ${queue.name}.` });
    }
  }

  // H6 — Queue exceeded capacity but not severely enough for H4
  for (const queue of model?.queues || []) {
    const peak = Number(maxLengths[queue.name]);
    if (!Number.isFinite(peak) || peak < 1) continue;
    const capacity = Number(queue.capacity);
    if (Number.isFinite(capacity) && capacity > 0) {
      if (peak > capacity && peak < capacity * 2) {
        flags.push({ code: "H6", severity: "warning", resource: queue.name,
          message: `${queue.name} peaked at ${peak} waiting — exceeded its capacity of ${capacity} (${Math.round(peak / capacity)}×).`,
          suggestion: `Consider increasing ${queue.name} capacity or adding overflow routing.` });
      }
    }
  }

  // H8 — Little's Law discrepancy (run may be too short)
  const d = summary.waitDiscrepancy;
  if (Number.isFinite(d) && d > 5) {
    flags.push({ code: "H8", severity: "warning",
      message: `Little's Law check shows ${d}% discrepancy between measured and theoretical wait — the run may be too short to reach steady state.`,
      suggestion: "Increase run duration and check again — reliable results require the system to stabilise." });
  }

  // Critical first, then by code
  flags.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return a.code.localeCompare(b.code) || (a.resource || "").localeCompare(b.resource || "");
  });

  return flags;
}

// Live health evaluation — called per-step during execution.
// Uses the engine summary and current snap, both available after every step.
// Returns a sorted array of { code, severity, resource?, message } objects.
export function evaluateLiveHealth(snap = {}, summary = {}, model = {}) {
  const flags = [];

  // L1 — Resource utilisation ≥ 80% / ≥ 90% / ≥ 95%
  for (const [typeName, stats] of Object.entries(summary.perResource || {})) {
    const util = Number(stats?.utilisation);
    if (!Number.isFinite(util)) continue;
    if (util >= 0.95) {
      flags.push({ code: "L1", severity: "critical", resource: typeName,
        message: `${typeName} at ${Math.round(util * 100)}% utilisation — unstable.` });
    } else if (util >= 0.9) {
      flags.push({ code: "L1", severity: "critical", resource: typeName,
        message: `${typeName} at ${Math.round(util * 100)}% utilisation — saturated.` });
    } else if (util >= 0.8) {
      flags.push({ code: "L1", severity: "warning", resource: typeName,
        message: `${typeName} at ${Math.round(util * 100)}% utilisation — approaching saturation.` });
    }
  }

  // L2 — Resource starvation (idle with work queued)
  for (const [typeName, stats] of Object.entries(summary.perResource || {})) {
    const starvPct = Number(stats?.starvationPct);
    if (!Number.isFinite(starvPct) || starvPct <= 0.1) continue;
    flags.push({ code: "L2", severity: "warning", resource: typeName,
      message: `${typeName} starved ${Math.round(starvPct * 100)}% — idle with work queued.` });
  }

  // L3 — Queue depth exceeds capacity
  for (const queue of model?.queues || []) {
    const qName = queue.name;
    const capacity = Number(queue.capacity);
    if (!Number.isFinite(capacity) || capacity < 1 || !qName) continue;
    const waiting = snap.byQueue?.[qName]?.waiting ?? 0;
    if (waiting > capacity) {
      flags.push({ code: "L3", severity: "warning", resource: qName,
        message: `${qName} at ${waiting} waiting — exceeded capacity of ${capacity} (${Math.round(waiting / capacity)}×).` });
    }
  }

  // Critical first, then by code
  flags.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return a.code.localeCompare(b.code) || (a.resource || "").localeCompare(b.resource || "");
  });

  return flags;
}
