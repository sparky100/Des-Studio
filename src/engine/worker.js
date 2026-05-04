import { buildEngine } from "./index.js";

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
  } = payload;

  const engine = buildEngine(
    model,
    seed,
    warmupPeriod,
    maxSimTime,
    terminationCondition,
    maxCycles,
    maxCPasses
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
  if (message?.type !== "RUN_REPLICATION") {
    return {
      type: "REPLICATION_ERROR",
      payload: buildReplicationError(message?.payload, new Error(`Unknown worker message type: ${message?.type}`)),
    };
  }

  try {
    return {
      type: "REPLICATION_COMPLETE",
      payload: runReplicationPayload(message.payload),
    };
  } catch (error) {
    return {
      type: "REPLICATION_ERROR",
      payload: buildReplicationError(message.payload, error),
    };
  }
}

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.onmessage = (event) => {
    self.postMessage(handleWorkerMessage(event.data));
  };
}
