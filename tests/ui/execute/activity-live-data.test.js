import { describe, test, expect } from "vitest";
import { extractServerTypes, buildServerTypeIndex, deriveActivityLiveData } from "../../../src/ui/execute/activityLiveData.js";

describe("extractServerTypes", () => {
  test("ASSIGN returns a single server type", () => {
    const effect = [{ macro: "ASSIGN", args: ["Queue", "Server"] }];
    expect(extractServerTypes(effect)).toEqual(["Server"]);
  });

  test("COSEIZE with 2 types returns both", () => {
    const effect = [{ macro: "COSEIZE", args: ["SurgeryQueue", "Surgeon", "Anesthetist"] }];
    expect(extractServerTypes(effect)).toEqual(["Surgeon", "Anesthetist"]);
  });

  test("COSEIZE with 3+ types returns all", () => {
    const effect = [{ macro: "COSEIZE", args: ["Queue", "TypeA", "TypeB", "TypeC"] }];
    expect(extractServerTypes(effect)).toEqual(["TypeA", "TypeB", "TypeC"]);
  });

  test("returns empty array when no effect", () => {
    expect(extractServerTypes(null)).toEqual([]);
  });

  test("handles string effect", () => {
    expect(extractServerTypes("COSEIZE(Queue, Surgeon, Anesthetist)")).toEqual(["Surgeon", "Anesthetist"]);
  });

  test("strips the per-type [Skill] filter so the plain type name is returned", () => {
    const effect = "COSEIZE(Biopsy Queue, Surgeon[Surgery], Anaesthetist[Anaesthesia])";
    expect(extractServerTypes(effect)).toEqual(["Surgeon", "Anaesthetist"]);
  });

  test("strips [Skill] filters on a 3-type COSEIZE", () => {
    const effect = "COSEIZE(MDT Queue, Haematologist[Haematology], Radiologist[CTReporting], Pathologist[Haematopathology])";
    expect(extractServerTypes(effect)).toEqual(["Haematologist", "Radiologist", "Pathologist"]);
  });
});

describe("buildServerTypeIndex", () => {
  test("indexes ASSIGN and COSEIZE c-events with capacities", () => {
    const cEvents = [
      { id: "ce-1", name: "Serve", effect: [{ macro: "ASSIGN", args: ["Queue", "Clerk"] }] },
      { id: "ce-2", name: "Surgery", effect: [{ macro: "COSEIZE", args: ["SurgeryQueue", "Surgeon", "Anesthetist"] }] },
    ];
    const entityTypes = [
      { name: "Clerk", role: "server", count: "2" },
      { name: "Surgeon", role: "server", count: "3" },
      { name: "Anesthetist", role: "server", count: "1" },
    ];
    const index = buildServerTypeIndex(cEvents, entityTypes);
    expect(index.get("ce-1")).toEqual({ serverTypes: ["Clerk"], capacities: [2], ceventName: "Serve" });
    expect(index.get("ce-2")).toEqual({ serverTypes: ["Surgeon", "Anesthetist"], capacities: [3, 1], ceventName: "Surgery" });
  });

  test("skips c-events with no server types", () => {
    const cEvents = [{ id: "ce-3", name: "NoOp", effect: null }];
    const index = buildServerTypeIndex(cEvents, []);
    expect(index.has("ce-3")).toBe(false);
  });
});

function makeSnap({ clock = 10.0, entities = [], served = 0 } = {}) {
  return { clock, entities, served };
}

describe("deriveActivityLiveData", () => {
  const model = {
    cEvents: [{ id: "ce-2", name: "Surgery", effect: [{ macro: "COSEIZE", args: ["SurgeryQueue", "Surgeon", "Anesthetist"] }] }],
  };

  test("returns null when no snapshot", () => {
    expect(deriveActivityLiveData(null, "ce-2", new Map(), model)).toBeNull();
  });

  test("produces a perType entry per server type for COSEIZE", () => {
    const serverTypeIndex = buildServerTypeIndex(model.cEvents, [
      { name: "Surgeon", role: "server", count: "2" },
      { name: "Anesthetist", role: "server", count: "1" },
    ]);
    const snap = makeSnap({
      entities: [
        { id: 1, type: "Surgeon", role: "server", status: "busy", currentCustId: 100 },
        { id: 2, type: "Surgeon", role: "server", status: "idle" },
        { id: 3, type: "Anesthetist", role: "server", status: "busy", currentCustId: 100 },
        { id: 100, type: "Patient", role: "customer", status: "busy", ceventName: "Surgery" },
      ],
    });
    const live = deriveActivityLiveData(snap, "ce-2", serverTypeIndex, model);
    expect(live.perType).toHaveLength(2);

    const surgeon = live.perType.find(t => t.serverTypeName === "Surgeon");
    expect(surgeon.capacity).toBe(2);
    expect(surgeon.busyCount).toBe(1);
    expect(surgeon.idleCount).toBe(1);
    expect(surgeon.activityBusyCount).toBe(1);

    const anesthetist = live.perType.find(t => t.serverTypeName === "Anesthetist");
    expect(anesthetist.capacity).toBe(1);
    expect(anesthetist.busyCount).toBe(1);
    expect(anesthetist.activityBusyCount).toBe(1);

    // Top-level fields mirror the first type (Surgeon) for backward compatibility.
    expect(live.serverTypeName).toBe("Surgeon");
    expect(live.capacity).toBe(2);
  });

  test("returns empty perType and zeroed fields when c-event isn't indexed", () => {
    const snap = makeSnap({ entities: [{ id: 1, type: "Clerk", role: "server", status: "idle" }] });
    const live = deriveActivityLiveData(snap, "ce-unknown", new Map(), model);
    expect(live.perType).toEqual([]);
    expect(live.serverTypeName).toBeNull();
    expect(live.busyCount).toBe(0);
  });

  test("COSEIZE with per-type [Skill] filters still matches real entities (regression)", () => {
    const skilledModel = {
      cEvents: [{ id: "ce-skill", name: "Biopsy", effect: "COSEIZE(Biopsy Queue, Surgeon[Surgery], Anaesthetist[Anaesthesia])" }],
    };
    const serverTypeIndex = buildServerTypeIndex(skilledModel.cEvents, [
      { name: "Surgeon", role: "server", count: "2" },
      { name: "Anaesthetist", role: "server", count: "2" },
    ]);
    const snap = makeSnap({
      entities: [
        { id: 1, type: "Surgeon", role: "server", status: "busy", currentCustId: 100, _currentSkill: "Surgery" },
        { id: 2, type: "Surgeon", role: "server", status: "idle" },
        { id: 3, type: "Anaesthetist", role: "server", status: "busy", currentCustId: 100, _currentSkill: "Anaesthesia" },
        { id: 4, type: "Anaesthetist", role: "server", status: "idle" },
        { id: 100, type: "Patient", role: "customer", status: "busy", ceventName: "Biopsy" },
      ],
    });
    const live = deriveActivityLiveData(snap, "ce-skill", serverTypeIndex, skilledModel);
    expect(live.perType).toHaveLength(2);

    // Before the fix, the bracketed "Surgeon[Surgery]" string never matched a
    // real entity.type, so capacity/busyCount collapsed to 0 for every row.
    const surgeon = live.perType.find(t => t.serverTypeName === "Surgeon");
    expect(surgeon.capacity).toBe(2);
    expect(surgeon.busyCount).toBe(1);
    expect(surgeon.activityBusyCount).toBe(1);

    const anaesthetist = live.perType.find(t => t.serverTypeName === "Anaesthetist");
    expect(anaesthetist.capacity).toBe(2);
    expect(anaesthetist.busyCount).toBe(1);
    expect(anaesthetist.activityBusyCount).toBe(1);
  });
});
