// Smoke test for src/engine/public-api.js — the documented external-embedding
// surface. Nothing in this app imports from it directly (app code imports the
// internal modules directly), so a re-export drifting out of sync with its
// source module (e.g. naming the wrong file) previously went unnoticed until
// an external embedder's import silently resolved to `undefined`. Extending
// typecheck to src/engine (Sprint 94) caught exactly that: fitDistribution was
// re-exported from statistics.js, but it's actually defined in
// distribution-fitting.js.
import { describe, it, expect } from "vitest";
import * as publicApi from "../../src/engine/public-api.js";

describe("public-api.js exports", () => {
  const expectedFunctionExports = [
    "buildEngine",
    "validateModel",
    "runReplications",
    "createReplicationPool",
    "summarizeReplicationResults",
    "confidenceInterval95",
    "compareScenarios",
    "batchMeansCI",
    "oneWayANOVA",
    "tukeyHSD",
    "fitDistribution",
    "mulberry32",
  ];

  it.each(expectedFunctionExports)("exports %s as a function, not undefined", (name) => {
    expect(typeof publicApi[name]).toBe("function");
  });
});
