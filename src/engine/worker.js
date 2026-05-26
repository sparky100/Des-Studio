import { buildEngine } from "./index.js";

export const WORKER_MESSAGE_TYPES = {
  RUN_REPLICATION: "RUN_REPLICATION",
  REPLICATION_COMPLETE: "REPLICATION_COMPLETE",
  REPLICATION_ERROR: "REPLICATION_ERROR",
};

export function runReplicationPayload(payload = {}) {
  const {
    replicationIndex,
    model,
    seed,
    warmupPeriod = 0,
    maxSimTime = null,
    terminationCondition = null,
    maxCycles = 5000,
    maxCPasses = 500,
    collectTimeSeries,
  } = payload;

  const engine = buildEngine(
    model,
    seed,
    warmupPeriod,
    maxSimTime,
    terminationCondition,
    maxCycles,
    maxCPasses,
    collectTimeSeries
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

export function handleWorkerMessage(message) {
  if (message?.type !== WORKER_MESSAGE_TYPES.RUN_REPLICATION) {
    return {
      type: WORKER_MESSAGE_TYPES.REPLICATION_ERROR,
      payload: buildReplicationError(message?.payload, new Error(`Unknown worker message type: ${message?.type}`)),
    };
  }

  try {
    return {
      type: WORKER_MESSAGE_TYPES.REPLICATION_COMPLETE,
      payload: runReplicationPayload(message.payload),
    };
  } catch (error) {
    return {
      type: WORKER_MESSAGE_TYPES.REPLICATION_ERROR,
      payload: buildReplicationError(message.payload, error),
    };
  }
}

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.onmessage = (event) => {
    self.postMessage(handleWorkerMessage(event.data));
  };
}
