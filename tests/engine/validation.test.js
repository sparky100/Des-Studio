import { describe, expect, it } from "vitest";
import { validateModel } from "../../src/engine/validation.js";

describe("validateModel", () => {
  it("validates structured predicate JSON conditions without crashing", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      bEvents: [],
      queues: [{ id: "main", name: "Main Queue", discipline: "FIFO" }],
      cEvents: [{
        id: "c1",
        name: "Start Service",
        condition: {
          operator: "AND",
          clauses: [
            { variable: "Queue.Main Queue.length", operator: ">", value: 0 },
          ],
        },
        cSchedules: [],
      }],
    };

    expect(() => validateModel(model)).not.toThrow();
    expect(validateModel(model).errors.filter(error => error.code === "V9")).toEqual([]);
  });

  it("reports unknown queues from structured predicate JSON conditions", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      bEvents: [],
      queues: [{ id: "main", name: "Main Queue", discipline: "FIFO" }],
      cEvents: [{
        id: "c1",
        name: "Start Service",
        condition: { variable: "Queue.Missing Queue.length", operator: ">", value: 0 },
        cSchedules: [],
      }],
    };

    expect(validateModel(model).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V9" }),
    ]));
  });

  it("detects COMPLETE effects when a B-event stores effects as an array", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: ["ARRIVE(Customer)"], schedules: [] },
        { id: "complete", name: "Service Complete", effect: ["COMPLETE()"], schedules: [] },
      ],
      cEvents: [],
    };

    expect(validateModel(model).warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "V8",
        message: expect.stringContaining("COMPLETE"),
      }),
    ]));
  });

  it("detects ARRIVE effects when generated B-events store effects as objects", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: [{ macro: "arrive", args: ["Customer", "Main Queue"] }], schedules: [] },
        { id: "complete", name: "Service Complete", effect: [{ macro: "complete", args: [] }], schedules: [] },
      ],
      cEvents: [],
    };

    expect(validateModel(model).warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "V8",
        message: expect.stringContaining("ARRIVE"),
      }),
    ]));
  });

  it("blocks execution when both source and sink are missing", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "noop", name: "No-op", effect: "x = 1", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V8", tab: "bevents" }),
    ]));
    expect(result.warnings.filter(w => w.code === "V8")).toEqual([]);
  });

  it("warns (not blocks) when a source exists but no sink exists", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors.filter(e => e.code === "V8")).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V8", message: expect.stringContaining("may never leave the system") }),
    ]));
  });

  it("warns (not blocks) when a sink exists but no source exists", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "complete", name: "Complete", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors.filter(e => e.code === "V8")).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V8", message: expect.stringContaining("no entity arrivals") }),
    ]));
  });

  // ── V25: RENEGE argument validation ──────────────────────────────────────

  it("warns when RENEGE() argument is a type name instead of 'ctx'", () => {
    const model = {
      entityTypes: [{ id: "et_caller", name: "Caller", attrDefs: [] }],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "bad_renege", name: "Bad Abandonment Timer", effect: "RENEGE(Caller)", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "V25",
          message: expect.stringContaining("RENEGE('Caller')"),
        }),
      ])
    );
  });

  it("does not warn when RENEGE() argument is 'ctx'", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "good_renege", name: "Good Abandonment Timer", effect: "RENEGE(ctx)", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.warnings.filter(w => w.code === "V25")).toEqual([]);
  });

  it("does not flag RENEGE_OLDEST as a bad RENEGE argument", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "oldest", name: "Oldest Reneger", effect: "RENEGE_OLDEST(Caller)", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.warnings.filter(w => w.code === "V25")).toEqual([]);
  });

  it("warns when C-Event uses RENEGE() with a non-ctx argument", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [],
      cEvents: [{
        id: "c_bad",
        name: "Bad C RENEGE",
        priority: 1,
        condition: { variable: "Queue.Some.length", operator: ">", value: 0 },
        effect: "RENEGE(Caller)",
        cSchedules: [],
      }],
    };

    const result = validateModel(model);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "V25",
          message: expect.stringContaining("RENEGE('Caller')"),
        }),
      ])
    );
  });

  it("does not warn when effect has no RENEGE at all", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.warnings.filter(w => w.code === "V25")).toEqual([]);
  });

  it("uses the default 500 run duration when maxSimTime is not stored on the model", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.warnings.filter(w => w.code === "V16")).toEqual([]);
  });

  it("still warns when run duration is explicitly cleared to zero and no stop condition exists", () => {
    const model = {
      maxSimTime: 0,
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V16" }),
    ]));
  });

  it("uses saved experiment defaults as the model run duration", () => {
    const model = {
      experimentDefaults: { maxSimTime: 250 },
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.warnings.filter(w => w.code === "V16")).toEqual([]);
  });

  it("blocks non-numeric B-event scheduled times", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "bad", name: "Bad Time", scheduledTime: "soon", effect: "ARRIVE(Customer)", schedules: [] },
      ],
      cEvents: [],
    };

    expect(validateModel(model).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V26", tab: "bevents" }),
    ]));
  });

  it("ignores empty routing arrays left behind by stored models", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Patient", role: "customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Waiting", discipline: "FIFO", customerType: "Patient" }],
      bEvents: [
        {
          id: "arrival",
          name: "Arrival",
          effect: ["ARRIVE(Patient, Waiting)"],
          routing: [],
          probabilisticRouting: [],
          schedules: [],
        },
        {
          id: "depart",
          name: "Depart",
          effect: "COMPLETE()",
          routing: [],
          probabilisticRouting: [],
          schedules: [],
        },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors.filter(error => error.code === "V17" || error.code === "V18")).toEqual([]);
  });

  it("ignores stale defaultQueueName when no conditional routing rows exist", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Patient", role: "customer", attrDefs: [] }],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Waiting", discipline: "FIFO", customerType: "Patient" },
        { id: "q2", name: "Treatment", discipline: "FIFO", customerType: "Patient" },
      ],
      bEvents: [
        {
          id: "depart",
          name: "Depart",
          effect: "RELEASE(Nurse, Treatment)",
          routing: [],
          defaultQueueName: "Waiting",
          probabilisticRouting: [],
          schedules: [],
        },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors.filter(error => error.code === "V17" || error.code === "V18")).toEqual([]);
  });

  it("ignores blank conditional routing placeholder rows", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Patient", role: "customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Waiting", discipline: "FIFO", customerType: "Patient" }],
      bEvents: [
        {
          id: "arrival",
          name: "Arrival",
          effect: ["ARRIVE(Patient, Waiting)"],
          routing: [{ condition: { variable: "", operator: "==", value: "" }, queueName: "" }],
          schedules: [],
        },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors.filter(error => error.code === "V17" || error.code === "V18")).toEqual([]);
  });
});

// ── V26 / V27: Container validation (Sprint 39) ───────────────────────────────

const baseModel = {
  entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [],
};

describe("V26 — container type validation", () => {
  it("passes for a valid container with capacity and initialLevel", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "Tank", capacity: "1000", initialLevel: "500" }],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V26")).toHaveLength(0);
  });

  it("errors when container id is empty", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "", capacity: "1000", initialLevel: "0" }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V26")).toBe(true);
  });

  it("errors on duplicate container id", () => {
    const model = {
      ...baseModel,
      containerTypes: [
        { id: "Tank", capacity: "1000", initialLevel: "0" },
        { id: "Tank", capacity: "500",  initialLevel: "0" },
      ],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V26")).toBe(true);
  });

  it("errors when capacity is <= 0", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "Tank", capacity: "0", initialLevel: "0" }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V26")).toBe(true);
  });

  it("errors when initialLevel is negative", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "Tank", capacity: "1000", initialLevel: "-10" }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V26")).toBe(true);
  });

  it("errors when initialLevel exceeds capacity", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "Tank", capacity: "100", initialLevel: "150" }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V26")).toBe(true);
  });
});

describe("V27 — FILL/DRAIN must reference declared container", () => {
  it("passes when FILL references a declared container", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "Fuel", capacity: "500", initialLevel: "200" }],
      bEvents: [{ id: "f1", name: "Fill", effect: "FILL(Fuel, 50)", schedules: [] }],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V27")).toHaveLength(0);
  });

  it("errors when FILL references an undeclared container in B-event", () => {
    const model = {
      ...baseModel,
      containerTypes: [],
      bEvents: [{ id: "f1", name: "Fill", effect: "FILL(Ghost, 50)", schedules: [] }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V27")).toBe(true);
  });

  it("errors when DRAIN references an undeclared container in C-event", () => {
    const model = {
      ...baseModel,
      containerTypes: [],
      cEvents: [{ id: "d1", name: "Drain", condition: "true", effect: "DRAIN(Ghost, 10)", cSchedules: [] }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V27")).toBe(true);
  });

  it("is case-insensitive when matching container id", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "fuel", capacity: "500", initialLevel: "0" }],
      bEvents: [{ id: "f1", name: "Fill", effect: "FILL(Fuel, 50)", schedules: [] }],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V27")).toHaveLength(0);
  });
});
