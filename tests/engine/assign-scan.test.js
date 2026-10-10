// B2 — ASSIGN(Q, ServerType|ANY, Entity.attr, SCAN[:N]) looks past an entity
// at the front whose skill has no idle server.
import { describe, test, expect, beforeEach } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { resetSeq } from "../../src/engine/entities.js";
import { validateModel } from "../../src/engine/validation.js";

beforeEach(() => { resetSeq(); });

// Queue at t=0 is [sour, sweet, sweet]; the only unit is sweet-capable.
function model(assignEffect, { sweetUnits = "1" } = {}) {
  const arrive = (id, grade) => ({ id, name: `Arrive ${id}`, scheduledTime: "0", effect: `ARRIVE(Crude, Hub);SET_ATTR(grade, "${grade}")`, schedules: [] });
  return {
    entityTypes: [
      { id: "crude", name: "Crude", role: "customer", attrDefs: [{ name: "grade", valueType: "string", defaultValue: "sour" }] },
      { id: "sweetUnit", name: "Sweet Unit", role: "server", count: sweetUnits, skills: ["sweet"], attrDefs: [] },
    ],
    queues: [{ id: "hub", name: "Hub", customerType: "Crude", discipline: "FIFO" }],
    stateVariables: [],
    bEvents: [
      arrive("a1", "sour"), arrive("a2", "sweet"), arrive("a3", "sweet"),
      { id: "done", name: "Refined", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    ],
    cEvents: [{
      id: "refine", name: "Refine", priority: 1, effect: assignEffect,
      condition: "queue(Hub).length > 0 AND idle(Sweet Unit).count > 0",
      cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    }],
  };
}

function serviceStarts(result) {
  return (result.log || [])
    .map(e => (e.message || "").match(/#(\d+) \(Hub\) → serving by #\d+ \(Sweet Unit\).*?\(skill: (\w+)/))
    .filter(Boolean)
    .map(m => ({ id: Number(m[1]), grade: m[2] }));
}

describe("ASSIGN ... SCAN", () => {
  test("without SCAN the sour cargo at the front blocks the sweet ones", () => {
    const r = buildEngine(model("ASSIGN(Hub, Sweet Unit, Entity.grade)"), 1, 0, 5).runAll();
    expect(serviceStarts(r)).toEqual([]);
    expect(r.summary.served).toBe(0);
  });

  test("with SCAN the first sweet is assigned and FIFO order holds among sweets", () => {
    const r = buildEngine(model("ASSIGN(Hub, Sweet Unit, Entity.grade, SCAN)"), 1, 0, 5).runAll();
    const starts = serviceStarts(r);
    expect(starts.map(s => s.grade)).toEqual(["sweet", "sweet"]);
    expect(starts[0].id).toBeLessThan(starts[1].id); // earlier arrival first
    expect(r.summary.served).toBe(2); // the sour cargo still waits
  });

  test("ANY form scans too", () => {
    const r = buildEngine(model("ASSIGN(Hub, ANY, Entity.grade, SCAN)"), 1, 0, 5).runAll();
    expect(r.summary.served).toBe(2);
  });

  test("SCAN:1 limits the look-ahead to the front entity", () => {
    const r = buildEngine(model("ASSIGN(Hub, Sweet Unit, Entity.grade, SCAN:1)"), 1, 0, 5).runAll();
    expect(r.summary.served).toBe(0);
    const r2 = buildEngine(model("ASSIGN(Hub, Sweet Unit, Entity.grade, SCAN:2)"), 1, 0, 5).runAll();
    expect(r2.summary.served).toBe(2);
  });
});

describe("validation — V77", () => {
  const v77 = effect => validateModel(model(effect)).errors.filter(e => e.code === "V77");

  test("SCAN with a skill argument is valid", () => {
    expect(v77("ASSIGN(Hub, Sweet Unit, Entity.grade, SCAN)")).toEqual([]);
    expect(v77('ASSIGN(Hub, ANY, "sweet", SCAN:10)')).toEqual([]);
  });

  test("SCAN without a skill argument is blocking", () => {
    expect(v77("ASSIGN(Hub, Sweet Unit, SCAN)")).toHaveLength(1);
  });

  test("SCAN:N must be a positive whole number", () => {
    expect(v77("ASSIGN(Hub, Sweet Unit, Entity.grade, SCAN:0)")).toHaveLength(1);
    expect(v77("ASSIGN(Hub, Sweet Unit, Entity.grade, SCAN:x)")).toHaveLength(1);
  });

  test("SCAN is not mistaken for a container clause", () => {
    const errs = validateModel(model("ASSIGN(Hub, Sweet Unit, Entity.grade, SCAN:3)")).errors;
    expect(errs.filter(e => e.code === "V27")).toEqual([]);
  });
});
