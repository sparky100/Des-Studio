// Every model_json field must survive every path that rebuilds a model from
// parts. Each of these used to keep its own field list and drop something
// (see src/model/modelJsonFields.js). A model with every field set goes through:
//   save → row → load (db/models.js), export → JSON → import, version restore,
//   template start, and the import-model edge function's source.
// Adding a field to MODEL_JSON_FIELDS without wiring it through fails here.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDesModelsSchemaModeForTests, norm, saveModel } from "../../src/db/models.js";
import { supabase } from "../../src/db/supabase.js";
import { MODEL_JSON_FIELDS, MODEL_JSON_ARRAY_FIELDS, pickModelJsonFields } from "../../src/model/modelJsonFields.js";
import { buildModelExportPayload, modelPayloadFromTemplate, restoreModelFromVersion } from "../../src/ui/modelDetailHelpers.js";
import { extractImportedModelPayload } from "../../src/ui/shared/utils.js";

// A distinctive, engine-valid-enough value for every field.
const FULL = {
  id: "m1",
  name: "Every field",
  description: "All model_json fields set",
  entityTypes: [{ id: "et_c", name: "Cargo", role: "customer", count: 0, attrDefs: [] }, { id: "et_s", name: "Unit", role: "server", count: 2, attrDefs: [], skillProfiles: [{ count: 2, skills: ["sour"] }] }],
  stateVariables: [{ id: "sv1", name: "level", valueType: "number", initialValue: 3 }],
  bEvents: [{ id: "b1", name: "Arrive", scheduledTime: "0", effect: ["ARRIVE(Cargo, Q)"], schedules: [] }],
  cEvents: [{ id: "c1", name: "Serve", priority: 1, condition: { variable: "queue(Q).length", operator: ">", value: 0 }, effect: ["ASSIGN(Q, Unit, Entity.grade, SCAN)"], cSchedules: [] }],
  queues: [{ id: "q1", name: "Q", customerType: "Cargo", discipline: "FIFO" }],
  containerTypes: [{ id: "tank", capacity: 100, initialLevel: 10 }],
  distances: [{ id: "d1", fromQueue: "Q", toQueue: "Q2", distance: 7 }],
  skills: ["sour", "sweet"],
  goals: [{ label: "Tank", metric: "container.maxLevel", scope: { type: "container", id: "tank", name: "tank" }, operator: "<", target: 90 }],
  dataSources: [{ id: "ds1", type: "csv", name: "feed" }],
  sections: [{ id: "sec1", name: "Supply", color: "#4A90D9", memberIds: ["q1"] }],
  exposedParams: [{ path: "stateVariables.level.initialValue", businessLabel: "Level" }],
  graph: { nodes: [{ id: "n1", x: 1, y: 2 }], edges: [] },
  experimentDefaults: { seed: 7, replications: 3, maxSimTime: 50, warmupPeriod: 5 },
  timeUnit: "days",
  epoch: "2026-01-01T00:00:00.000Z",
  notes: "## Notes\n\nKeep me.",
};

it("the test model sets every listed field", () => {
  for (const field of MODEL_JSON_FIELDS) {
    expect(FULL[field], field).toBeTruthy();
    if (MODEL_JSON_ARRAY_FIELDS.includes(field)) expect(FULL[field].length, field).toBeGreaterThan(0);
  }
});

describe("every model_json field survives", () => {
  beforeEach(() => { vi.clearAllMocks(); __resetDesModelsSchemaModeForTests(); });

  it("save → row → load (db/models.js)", async () => {
    supabase.from("des_models").update.mockReturnThis();
    supabase.from("des_models").eq.mockReturnThis();
    supabase.from("des_models").select.mockResolvedValueOnce({ data: [{ id: "m1", owner_id: "u1" }], error: null });

    await saveModel(FULL, "u1");
    const row = supabase.from("des_models").update.mock.calls.at(-1)[0];
    const loaded = norm(JSON.parse(JSON.stringify({ ...row, id: "m1" })));
    for (const field of MODEL_JSON_FIELDS) expect(loaded[field], field).toEqual(FULL[field]);
  });

  it("export → JSON → import (graph is recomputed on import by design)", () => {
    const file = JSON.parse(JSON.stringify(buildModelExportPayload(FULL, "2026-10-11T00:00:00.000Z")));
    const imported = extractImportedModelPayload(file);
    for (const field of MODEL_JSON_FIELDS) {
      if (field === "graph") expect(imported.graph).toBeNull();
      else expect(imported[field], field).toEqual(FULL[field]);
    }
  });

  it("version restore takes every field from the version", () => {
    // The current model has different values for every field.
    const current = { ...FULL, ...Object.fromEntries(MODEL_JSON_ARRAY_FIELDS.map(f => [f, []])), graph: null, experimentDefaults: {}, timeUnit: "minutes", epoch: null, notes: "today" };
    const restored = restoreModelFromVersion(current, JSON.parse(JSON.stringify(FULL)));
    for (const field of MODEL_JSON_FIELDS) expect(restored[field], field).toEqual(FULL[field]);
    expect(restored.id).toBe(current.id);
  });

  it("version restore of an older snapshot without a scalar keeps the model's own value", () => {
    const { timeUnit: _omit, ...older } = FULL;
    const restored = restoreModelFromVersion({ ...FULL, timeUnit: "hours" }, older);
    expect(restored.timeUnit).toBe("hours");
  });

  it("template start copies every field", () => {
    const payload = modelPayloadFromTemplate(FULL);
    for (const field of MODEL_JSON_FIELDS) expect(payload[field], field).toEqual(FULL[field]);
    expect(payload.visibility).toBe("private");
  });

  it("pickModelJsonFields defaults missing fields", () => {
    const picked = pickModelJsonFields({});
    for (const field of MODEL_JSON_ARRAY_FIELDS) expect(picked[field], field).toEqual([]);
    expect(picked.graph).toBeNull();
    expect(picked.experimentDefaults).toEqual({});
    expect(picked).not.toHaveProperty("timeUnit");
  });
});

// The import-model edge function is deployed on its own (Deno) and can't
// import modelJsonFields.js, so check its source covers every field both when
// reading the request and when building the saved model_json.
describe("supabase/functions/import-model covers every model_json field", () => {
  const src = readFileSync(new URL("../../supabase/functions/import-model/index.ts", import.meta.url), "utf8");
  const normalize = src.slice(src.indexOf("function normalizeModel"), src.indexOf("function effectText"));
  const modelJsonBlock = src.slice(src.indexOf("model_json: {"), src.indexOf("owner_id: user.id"));

  it.each(MODEL_JSON_FIELDS.filter(f => f !== "graph" && f !== "experimentDefaults"))("%s is read from the request", field => {
    const listed = new RegExp(`MODEL_JSON_KEYS = \\[[^\\]]*"${field}"`).test(src);
    expect(listed || normalize.includes(`source.${field}`), field).toBe(true);
  });

  it.each(MODEL_JSON_FIELDS)("%s is written to model_json", field => {
    expect(modelJsonBlock.includes(`model.${field}`), field).toBe(true);
  });
});
