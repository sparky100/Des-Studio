// Schema Contract round-trip test (see CLAUDE.md): entityTypes[].quantityAttr
// (B1) is a new model_json field. It must survive saveModel → row → norm(),
// both via entity_types and model_json.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { __resetDesModelsSchemaModeForTests, norm, saveModel } from "../../src/db/models.js";
import { supabase } from "../../src/db/supabase.js";

describe("entityTypes[].quantityAttr round-trip", () => {
  beforeEach(() => { vi.clearAllMocks(); __resetDesModelsSchemaModeForTests(); });

  it("is preserved through save and load", async () => {
    const model = {
      id: "m1", name: "Oil",
      entityTypes: [{ id: "et_cargo", name: "Crude Cargo", role: "customer", quantityAttr: "volume",
        attrDefs: [{ name: "volume", valueType: "number", defaultValue: 4 }] }],
      stateVariables: [], bEvents: [], cEvents: [], queues: [],
    };
    supabase.from("des_models").update.mockReturnThis();
    supabase.from("des_models").eq.mockReturnThis();
    supabase.from("des_models").select.mockResolvedValueOnce({ data: [{ id: "m1", owner_id: "u1" }], error: null });

    await saveModel(model, "u1");
    const row = supabase.from("des_models").update.mock.calls.at(-1)[0];
    expect(row.entity_types[0].quantityAttr).toBe("volume");
    expect(row.model_json.entityTypes[0].quantityAttr).toBe("volume");

    const loaded = norm(JSON.parse(JSON.stringify({ ...row, id: "m1" })));
    expect(loaded.entityTypes[0].quantityAttr).toBe("volume");
  });
});
