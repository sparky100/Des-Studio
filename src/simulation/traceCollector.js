// src/simulation/traceCollector.js — F69.1: Structured trace collector
// Accumulates event evaluation trace records from the simulation engine.
// Cap at TRACE_CAP records to bound token usage when sent to the AI debugger.

const TRACE_CAP = 1000;

export class TraceCollector {
  constructor() {
    this.startTrace();
  }

  startTrace() {
    this._records = [];
    this._truncated = false;
    this._totalEvents = 0;
    this._firedEvents = 0;
    this._suppressedEvents = 0;
    this._entitiesCreated = 0;
    this._entitiesDestroyed = 0;
    this._simulatedDuration = 0;
    this._queuePeaks = {};
    this._serverUtilisation = {};
  }

  record(traceRecord) {
    this._totalEvents++;
    if (traceRecord.fired === true) this._firedEvents++;
    else if (traceRecord.conditionResult === false) this._suppressedEvents++;

    if (traceRecord.queueSnapshots) {
      for (const [qId, len] of Object.entries(traceRecord.queueSnapshots)) {
        if (this._queuePeaks[qId] == null || len > this._queuePeaks[qId]) {
          this._queuePeaks[qId] = len;
        }
      }
    }

    if (this._records.length < TRACE_CAP) {
      this._records.push(traceRecord);
    } else {
      this._truncated = true;
    }
  }

  getTrace() {
    return [...this._records].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  }

  getSummary() {
    return {
      type: "run_summary",
      totalEvents: this._totalEvents,
      firedEvents: this._firedEvents,
      suppressedEvents: this._suppressedEvents,
      entitiesCreated: this._entitiesCreated,
      entitiesDestroyed: this._entitiesDestroyed,
      simulatedDuration: this._simulatedDuration,
      queuePeaks: { ...this._queuePeaks },
      serverUtilisation: { ...this._serverUtilisation },
      traceTruncated: this._truncated,
    };
  }
}

/**
 * Convert engine internal log entries to the structured trace format.
 * Returns { trace: TraceRecord[], traceTruncated: boolean, summary: RunSummary }.
 */
export function buildTraceFromLog(log, model, engineSummary) {
  const collector = new TraceCollector();
  const queues = model?.queues || [];

  for (const entry of log) {
    if (entry.phase !== "B" && entry.phase !== "C") continue;

    const ev = entry.event;
    const cEval = entry.cEval;

    if (!ev && !cEval) continue;

    // Skip "skipped due to restart" C-scan entries — they aren't true evaluations
    if (cEval?.skippedBecause === "restart") continue;

    const eventId = cEval?.eventId ?? ev?.id ?? null;
    const eventName = cEval?.eventName ?? ev?.name ?? null;
    const fired = cEval?.conditionTrue ?? (ev?.fired === true);
    const conditionResult = cEval != null ? (cEval.conditionTrue === true) : null;

    // Derive a basic queueSnapshot from model queues (lengths not tracked per-entry)
    const queueSnapshots = {};
    for (const q of queues) {
      if (q.name) queueSnapshots[q.id || q.name] = 0;
    }

    const record = {
      t: entry.time ?? 0,
      type: "event_evaluation",
      eventId,
      eventName,
      entityId: ev?.entityIds?.[0] ?? null,
      entityType: null,
      fired,
      conditionResult,
      conditionDetail: cEval
        ? {
            pass: cEval.pass ?? null,
            priority: cEval.priority ?? null,
            failureReason: cEval.failureReason ?? null,
          }
        : null,
      queueSnapshots,
      followOnScheduled: ev?.newEvents?.[0]?.id ?? null,
    };

    collector.record(record);
  }

  // Set summary fields from engine summary
  if (engineSummary) {
    collector._simulatedDuration = engineSummary.simulatedDuration ?? 0;
    collector._entitiesCreated = engineSummary.total ?? 0;
    collector._entitiesDestroyed = engineSummary.served ?? 0;
    if (engineSummary.perResource) {
      for (const [type, data] of Object.entries(engineSummary.perResource)) {
        collector._serverUtilisation[type] = data.utilisation ?? 0;
      }
    }
  }

  return {
    trace: collector.getTrace(),
    traceTruncated: collector._truncated,
    traceSummary: collector.getSummary(),
  };
}
