// Schema Contract round-trip test (see CLAUDE.md): entityTypes[].turnaroundDist /
// turnaroundDistParams (B4) are new model_json fields. They must survive
// saveModel → row → norm(), both via entity_types and model_json.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { __resetDesModelsSchemaModeForTests, norm, saveModel } from "../../src/db/models.js";
import { supabase } from "../../src/db/supabase.js";

describe("entityTypes[].turnaroundDist round-trip", () => {
  beforeEach(() => { vi.clearAllMocks(); __resetDesModelsSchemaModeForTests(); });

  it("is preserved through save and load", async () => {
    const turnaround = { turnaroundDist: "Triangular", turnaroundDistParams: { min: "18", mode: "20", max: "24" } };
    const model = {
      id: "m1", name: "Oil",
      entityTypes: [{ id: "et_vlcc", name: "VLCC", role: "server", count: 4, attrDefs: [], ...turnaround }],
      stateVariables: [], bEvents: [], cEvents: [], queues: [],
    };
    supabase.from("des_models").update.mockReturnThis();
    supabase.from("des_models").eq.mockReturnThis();
    supabase.from("des_models").select.mockResolvedValueOnce({ data: [{ id: "m1", owner_id: "u1" }], error: null });

    await saveModel(model, "u1");
    const row = supabase.from("des_models").update.mock.calls.at(-1)[0];
    expect(row.entity_types[0]).toMatchObject(turnaround);
    expect(row.model_json.entityTypes[0]).toMatchObject(turnaround);

    const loaded = norm(JSON.parse(JSON.stringify({ ...row, id: "m1" })));
    expect(loaded.entityTypes[0]).toMatchObject(turnaround);
  });
});
