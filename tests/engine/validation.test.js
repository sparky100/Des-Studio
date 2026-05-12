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
});
