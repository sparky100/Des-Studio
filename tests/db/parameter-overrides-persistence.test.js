// Schema Contract round-trip test (see CLAUDE.md): results_json._experiment_config
// gains parameterOverrides — the parameter values a run used that differ from the
// saved model. A run with overrides must never read as a baseline run once saved.

import { describe, it, expect } from "vitest";
import { buildRunRecord } from "../../src/db/runRecord.js";
import { buildPersistedResultsJson } from "../../src/db/results-persistence.js";
import { applySweepValues, enumerateSweepableParams } from "../../src/engine/sweep-params.js";
import { buildParameterOverrideRecord } from "../../src/ui/execute/executeHelpers.js";

const baseModel = {
  id: "m1",
  name: "World Oil",
  stateVariables: [{ name: "closureEnabled", initialValue: "0" }],
};

function overriddenRun() {
  const paramConfig = enumerateSweepableParams(baseModel).find(p => p.path === "stateVariables.closureEnabled.initialValue");
  const effectiveOverrides = [{ paramConfig, value: 1 }];
  const effectiveModel = applySweepValues(baseModel, effectiveOverrides);
  const overrides = buildParameterOverrideRecord(effectiveOverrides, new Set([paramConfig.path]));
  const result = { summary: { served: 10 } };
  const runRecord = buildRunRecord(effectiveModel, result, {
    maxSimTime: 365, warmupPeriod: 60, replications: 10, terminationMode: "time", parameterOverrides: overrides,
  }, 42, { includeModelSnapshot: true });
  return { result, runRecord };
}

describe("parameter overrides survive persistence", () => {
  for (const level of ["full", "compact", "minimal"]) {
    it(`keeps _experiment_config.parameterOverrides and the overridden snapshot at '${level}' detail`, () => {
      const { result, runRecord } = overriddenRun();
      const saved = JSON.parse(JSON.stringify(buildPersistedResultsJson(result, {
        resultDetailLevel: level, runRecord, includeModelSnapshot: true,
      })));
      expect(saved._experiment_config.parameterOverrides).toEqual([{
        path: "stateVariables.closureEnabled.initialValue",
        label: "closureEnabled — starting value",
        type: "stateVarInit",
        targetId: "closureEnabled",
        baseValue: 0,
        value: 1,
        source: "adhoc",
      }]);
      expect(saved._model_snapshot.stateVariables[0].initialValue).toBe("1");
    });
  }

  it("records an empty list for a baseline run", () => {
    const record = buildRunRecord(baseModel, { summary: {} }, { replications: 1 }, 1);
    expect(record.experiment_config.parameterOverrides).toEqual([]);
  });
});
