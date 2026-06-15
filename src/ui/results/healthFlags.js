// Deterministic health flags evaluated from simulation results — no LLM required.
// Returns a sorted array of { code, severity, resource?, message } objects.
// severity: "critical" | "warning"

export function evaluateResultsHealth(results = {}, model = {}) {
  const flags = [];
  const summary = results?.summary || {};
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];

  // H1 — Resource utilisation ≥ 80% / ≥ 90%
  for (const [typeName, stats] of Object.entries(summary.perResource || {})) {
    const util = Number(stats?.utilisation);
    if (!Number.isFinite(util)) continue;
    if (util >= 0.9) {
      flags.push({ code: "H1", severity: "critical", resource: typeName,
        message: `${typeName} at ${Math.round(util * 100)}% utilisation — saturated, queue will grow without more capacity.` });
    } else if (util >= 0.8) {
      flags.push({ code: "H1", severity: "warning", resource: typeName,
        message: `${typeName} at ${Math.round(util * 100)}% utilisation — approaching saturation, expect queue build-up.` });
    }
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
          message: `${q} queue trending up (avg ${earlyMean.toFixed(1)} → ${lateMean.toFixed(1)} waiting) — the system may not reach steady state.` });
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
        message: `${wipPct}% of arrivals (≈${totalWip} entities${splitNote}) still in system at end of run — large unfinished backlog, results may be unreliable.` });
    } else if (wipPct >= 10) {
      flags.push({ code: "H3", severity: "warning",
        message: `${wipPct}% of arrivals (≈${totalWip} entities${splitNote}) still in system at end of run — completion rate is understated.` });
    }
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
          message: `${queue.name} peaked at ${peak} waiting (${Math.round(peak / capacity)}× its capacity of ${capacity}).` });
      }
    } else if (peak > 50) {
      flags.push({ code: "H4", severity: "warning", resource: queue.name,
        message: `${queue.name} peaked at ${peak} waiting.` });
    }
  }

  // Critical first, then by code
  flags.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return a.code.localeCompare(b.code) || (a.resource || "").localeCompare(b.resource || "");
  });

  return flags;
}
