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

  // Sprint 95 — COSEIZE Type:N quantity syntax
  test("strips a :N quantity suffix so the plain type name is returned", () => {
    const effect = "COSEIZE(Queue, Nurse:2, Doctor)";
    expect(extractServerTypes(effect)).toEqual(["Nurse", "Doctor"]);
  });

  test("strips both [Skill] and :N together", () => {
    const effect = "COSEIZE(Queue, Doctor[Surgery]:2, Nurse)";
    expect(extractServerTypes(effect)).toEqual(["Doctor", "Nurse"]);
  });

  // PREEMPT/FAIL/FINISH/REPAIR target a resource without ever ASSIGNing or
  // COSEIZEing it — without these, a C-event built purely from one of them
  // (e.g. a "preempt this resource for a higher-priority customer" activity)
  // fell through to deriveActivityLiveData's no-serverTypes branch, which
  // shows the total server count across every resource type in the whole
  // model instead of the one this activity actually concerns.
  test("PREEMPT returns its target server type, ignoring the optional criterion", () => {
    expect(extractServerTypes("PREEMPT(Staff, PRIORITY(taskPriority))")).toEqual(["Staff"]);
    expect(extractServerTypes("PREEMPT(Staff)")).toEqual(["Staff"]);
  });

  test("FAIL returns its target server type, ignoring the optional count", () => {
    expect(extractServerTypes("FAIL(Machine, 2)")).toEqual(["Machine"]);
    expect(extractServerTypes("FAIL(Doctor)")).toEqual(["Doctor"]);
  });

  test("FINISH returns its target server type, ignoring the optional criterion", () => {
    expect(extractServerTypes("FINISH(Nurse, LONGEST)")).toEqual(["Nurse"]);
  });

  test("REPAIR returns its target server type, ignoring the optional count", () => {
    expect(extractServerTypes("REPAIR(Machine, 1)")).toEqual(["Machine"]);
  });

  test("a multi-effect PREEMPT (e.g. alongside a SET) still resolves the server type", () => {
    const effect = ["PREEMPT(Staff, PRIORITY(taskPriority))", "SET(repairsInProgress, repairsInProgress - 1)"];
    expect(extractServerTypes(effect)).toEqual(["Staff"]);
  });

  // Regression: the old ASSIGN regex required the 2nd argument to be
  // followed immediately by the closing ")", so any ASSIGN with a 3rd
  // argument failed to match at all — falling through to the no-serverTypes
  // branch, which shows the total server count across every resource type
  // in the whole model instead of the one real server type this activity
  // actually seizes.
  test("ASSIGN with a trailing container-claim quantity still resolves the server type", () => {
    expect(extractServerTypes("ASSIGN(Hire Queue, Staff, BikesAvailable:1)")).toEqual(["Staff"]);
  });

  test("ASSIGN(Queue, ANY, \"Skill\") still resolves to ANY (for buildServerTypeIndex's cross-type pooling)", () => {
    expect(extractServerTypes('ASSIGN(Queue, ANY, "Skill")')).toEqual(["ANY"]);
  });

  test("ASSIGN with a trailing Entity.attr argument still resolves the server type", () => {
    expect(extractServerTypes("ASSIGN(Queue, Staff, Entity.priority)")).toEqual(["Staff"]);
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

  test("indexes an ASSIGN with a trailing container-claim quantity, ignoring the container argument", () => {
    const cEvents = [{ id: "ce-hire", name: "Serve Hire Customer", effect: "ASSIGN(Hire Queue, Staff, BikesAvailable:1)" }];
    const entityTypes = [{ name: "Staff", role: "server", count: "3" }];
    const index = buildServerTypeIndex(cEvents, entityTypes);
    expect(index.get("ce-hire")).toEqual({ serverTypes: ["Staff"], capacities: [3], ceventName: "Serve Hire Customer" });
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

  test("a PREEMPT-only activity resolves to its own target's stats, not a total across every resource type (regression)", () => {
    // Before the PREEMPT/FAIL/FINISH/REPAIR fix in extractServerTypes, this
    // C-event wasn't indexed at all, so this fell through to the "no
    // serverTypes" branch: capacity = every server entity in the whole
    // model (here, 2 Staff + 10 TimeAway = 12), a meaningless number shown
    // with the same "pool" styling as a real per-resource card.
    const preemptModel = {
      cEvents: [{ id: "ce-preempt", name: "Preempt Repair for Hire Customer", effect: "PREEMPT(Staff, PRIORITY(taskPriority))" }],
    };
    const serverTypeIndex = buildServerTypeIndex(preemptModel.cEvents, [
      { name: "Staff", role: "server", count: "2" },
      { name: "TimeAway", role: "server", count: "10" },
    ]);
    const snap = makeSnap({
      entities: [
        { id: 1, type: "Staff", role: "server", status: "busy" },
        { id: 2, type: "Staff", role: "server", status: "idle" },
        ...Array.from({ length: 10 }, (_, i) => ({ id: 10 + i, type: "TimeAway", role: "server", status: "idle" })),
      ],
    });
    const live = deriveActivityLiveData(snap, "ce-preempt", serverTypeIndex, preemptModel);
    expect(live.serverTypeName).toBe("Staff");
    expect(live.capacity).toBe(2);
    expect(live.busyCount).toBe(1);
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

  test("ASSIGN with a trailing container-claim resolves to the real server type's stats, not a whole-model total (regression)", () => {
    // Before the fix, "ASSIGN(Hire Queue, Staff, BikesAvailable:1)" wasn't
    // indexed at all (extractServerTypes returned []), so this fell through
    // to the "no serverTypes" branch: capacity = every server entity in the
    // whole model (here, 3 Staff + 15 OnHire = 18) — exactly reproducing the
    // reported "0 active / 0/18 pool" bug, instead of Staff's real capacity (3).
    const hireModel = {
      cEvents: [{ id: "ce-hire", name: "Serve Hire Customer", effect: "ASSIGN(Hire Queue, Staff, BikesAvailable:1)" }],
    };
    const serverTypeIndex = buildServerTypeIndex(hireModel.cEvents, [
      { name: "Staff", role: "server", count: "3" },
      { name: "OnHire", role: "server", count: "15" },
    ]);
    const snap = makeSnap({
      entities: [
        { id: 1, type: "Staff", role: "server", status: "busy", currentCustId: 100 },
        { id: 2, type: "Staff", role: "server", status: "idle" },
        { id: 3, type: "Staff", role: "server", status: "idle" },
        ...Array.from({ length: 15 }, (_, i) => ({ id: 20 + i, type: "OnHire", role: "server", status: "idle" })),
        { id: 100, type: "Customer", role: "customer", status: "busy", ceventName: "Serve Hire Customer" },
      ],
    });
    const live = deriveActivityLiveData(snap, "ce-hire", serverTypeIndex, hireModel);
    expect(live.serverTypeName).toBe("Staff");
    expect(live.capacity).toBe(3);
    expect(live.busyCount).toBe(1);
    expect(live.activityBusyCount).toBe(1);
  });
});
