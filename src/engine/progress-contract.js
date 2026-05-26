function asNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function asFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function makeBatchProgress(progress = {}) {
  const total = Math.max(1, asNonNegativeInteger(progress.total, 1));
  const completed = Math.min(total, asNonNegativeInteger(progress.completed, 0));
  const running = Math.max(0, asNonNegativeInteger(progress.running, 0));
  const pending = Math.max(0, progress.pending ?? (total - completed - running));
  const cancelled = !!progress.cancelled;

  return {
    mode: "batch",
    completed,
    total,
    running,
    pending,
    cancelled,
    workerCount: Math.max(1, asNonNegativeInteger(progress.workerCount, running || 1)),
  };
}

export function makeSingleRunProgress(progress = {}) {
  const total = Math.max(1, asNonNegativeInteger(progress.total, 1));
  const completed = Math.min(total, asNonNegativeInteger(progress.completed, 0));
  const cancelled = !!progress.cancelled;
  const running = progress.running == null ? (cancelled || completed >= total ? 0 : 1) : Math.max(0, asNonNegativeInteger(progress.running, 0));

  return {
    mode: "single",
    completed,
    total,
    running,
    pending: 0,
    cancelled,
    workerCount: 1,
    clock: asFiniteNumber(progress.clock, 0),
    felSize: Math.max(0, asNonNegativeInteger(progress.felSize, 0)),
    eventsProcessed: Math.max(0, asNonNegativeInteger(progress.eventsProcessed, 0)),
    maxCycles: total,
    terminationMode: progress.terminationMode === "condition" ? "condition" : "time",
  };
}
