import { buildEngine } from "./index.js";

export const WORKER_MESSAGE_TYPES = {
  INIT_RUN: "INIT_RUN",
  RUN_REPLICATION: "RUN_REPLICATION",
  REPLICATION_COMPLETE: "REPLICATION_COMPLETE",
  REPLICATION_ERROR: "REPLICATION_ERROR",
};

export function runReplicationPayload(payload = {}, shared = null) {
  const {
    replicationIndex,
    model,
    seed,
    warmupPeriod = 0,
    maxSimTime = null,
    terminationCondition = null,
    maxCycles = 5000,
    maxCPasses = 5000,
    collectTimeSeries,
    collectTrace,
    entityDetail,
    schedulesMap,    // ADR-016: resolved schedule rows keyed by scheduleRef UUID
  } = shared ? { ...shared, ...payload } : payload;

  const engine = buildEngine(
    model,
    seed,
    warmupPeriod,
    maxSimTime,
    terminationCondition,
    maxCycles,
    maxCPasses,
    collectTimeSeries,
    undefined,
    { schedulesMap, collectTrace, entityDetail }
  );

  return {
    replicationIndex,
    seed,
    result: engine.runAll(),
  };
}

export function buildReplicationError(payload = {}, error) {
  return {
    replicationIndex: payload.replicationIndex,
    seed: payload.seed,
    message: error?.message || String(error),
    stack: error?.stack || "",
  };
}

export function handleWorkerMessage(message, shared = null) {
  if (message?.type !== WORKER_MESSAGE_TYPES.RUN_REPLICATION) {
    return {
      type: WORKER_MESSAGE_TYPES.REPLICATION_ERROR,
      payload: buildReplicationError(message?.payload, new Error(`Unknown worker message type: ${message?.type}`)),
    };
  }

  try {
    return {
      type: WORKER_MESSAGE_TYPES.REPLICATION_COMPLETE,
      payload: runReplicationPayload(message.payload, shared),
    };
  } catch (error) {
    return {
      type: WORKER_MESSAGE_TYPES.REPLICATION_ERROR,
      payload: buildReplicationError(message.payload, error),
    };
  }
}

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  // Shared run config (model, schedules, termination settings) is sent once per
  // worker via INIT_RUN so each RUN_REPLICATION message only carries the seed.
  let sharedRunConfig = null;
  self.onmessage = (event) => {
    const message = event.data;
    if (message?.type === WORKER_MESSAGE_TYPES.INIT_RUN) {
      sharedRunConfig = message.payload || null;
      return;
    }
    self.postMessage(handleWorkerMessage(message, sharedRunConfig));
  };
}
