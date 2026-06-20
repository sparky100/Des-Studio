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

  it("passes V4 when a PRIORITY queue uses an entity type with numeric priority", () => {
    const model = {
      entityTypes: [
        {
          id: "et_customer",
          name: "Customer",
          attrDefs: [{ name: "priority", valueType: "number", defaultValue: "1" }],
        },
      ],
      stateVariables: [],
      queues: [{ id: "q1", name: "Priority Queue", discipline: "PRIORITY", customerType: "Customer" }],
      bEvents: [],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors.filter(error => error.code === "V4")).toEqual([]);
  });

  it("fails V4 when a PRIORITY queue uses a string priority attribute", () => {
    const model = {
      entityTypes: [
        {
          id: "et_customer",
          name: "Customer",
          attrDefs: [{ name: "priority", valueType: "string", defaultValue: "high" }],
        },
      ],
      stateVariables: [],
      queues: [{ id: "q1", name: "Priority Queue", discipline: "PRIORITY", customerType: "Customer" }],
      bEvents: [],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "V4",
        tab: "queues",
        message: expect.stringContaining("must define 'priority' as a number"),
      }),
    ]));
  });

  it("fails V4 when a PRIORITY queue entity type is missing priority", () => {
    const model = {
      entityTypes: [
        {
          id: "et_customer",
          name: "Customer",
          attrDefs: [{ name: "severity", valueType: "number", defaultValue: "1" }],
        },
      ],
      stateVariables: [],
      queues: [{ id: "q1", name: "Priority Queue", discipline: "PRIORITY", customerType: "Customer" }],
      bEvents: [],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "V4",
        tab: "queues",
        message: expect.stringContaining("has no 'priority' attribute"),
      }),
    ]));
  });

  it("passes when a server has a complete MTBF/MTTR failure model", () => {
    const model = {
      entityTypes: [
        {
          id: "et_server",
          name: "Machine",
          role: "server",
          attrDefs: [],
          mtbfDist: "Exponential",
          mtbfDistParams: { mean: "120" },
          mttrDist: "Exponential",
          mttrDistParams: { mean: "20" },
        },
      ],
      stateVariables: [],
      queues: [],
      bEvents: [],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors.filter(error => error.code === "V36" || error.code === "V37" || error.code === "V5")).toEqual([]);
  });

  it("fails when a server has MTBF without MTTR", () => {
    const model = {
      entityTypes: [
        {
          id: "et_server",
          name: "Machine",
          role: "server",
          attrDefs: [],
          mtbfDist: "Exponential",
          mtbfDistParams: { mean: "120" },
        },
      ],
      stateVariables: [],
      queues: [],
      bEvents: [],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "V37",
        tab: "entities",
        message: expect.stringContaining("MTTR distribution and MTTR parameters"),
      }),
    ]));
  });

  it("fails when a server has MTTR without MTBF", () => {
    const model = {
      entityTypes: [
        {
          id: "et_server",
          name: "Machine",
          role: "server",
          attrDefs: [],
          mttrDist: "Exponential",
          mttrDistParams: { mean: "20" },
        },
      ],
      stateVariables: [],
      queues: [],
      bEvents: [],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "V37",
        tab: "entities",
        message: expect.stringContaining("MTBF distribution and MTBF parameters"),
      }),
    ]));
  });

  it("fails when a non-server entity defines failure-model fields", () => {
    const model = {
      entityTypes: [
        {
          id: "et_customer",
          name: "Customer",
          role: "customer",
          attrDefs: [],
          mtbfDist: "Exponential",
          mtbfDistParams: { mean: "120" },
          mttrDist: "Exponential",
          mttrDistParams: { mean: "20" },
        },
      ],
      stateVariables: [],
      queues: [],
      bEvents: [],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "V36",
        tab: "entities",
        message: expect.stringContaining("only server entity types"),
      }),
    ]));
  });

  // ── V25: RENEGE argument validation ──────────────────────────────────────

  it("errors when RENEGE() argument is a type name instead of 'ctx'", () => {
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
    expect(result.errors).toEqual(
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

  it("errors when C-Event uses RENEGE() with a non-ctx argument", () => {
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
    expect(result.errors).toEqual(
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

  it("errors when replication count is not a positive integer", () => {
    const model = {
      experimentDefaults: { replications: 0 },
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "V34",
        tab: "execute",
        message: expect.stringContaining("Replication count"),
      }),
    ]));
  });

  it("errors when warm-up time is not shorter than the run duration in time mode", () => {
    const model = {
      experimentDefaults: { terminationMode: "time", warmupPeriod: 500, maxSimTime: 500 },
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "V35",
        tab: "execute",
        message: expect.stringContaining("Warm-up time"),
      }),
    ]));
  });

  it("does not error on warm-up length when using condition-based stopping", () => {
    const model = {
      experimentDefaults: {
        terminationMode: "condition",
        warmupPeriod: 500,
        replications: 2,
      },
      terminationCondition: { metric: "served", operator: ">=", value: 10 },
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [],
    };

    const result = validateModel(model);
    expect(result.errors.filter(error => error.code === "V35")).toEqual([]);
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

describe("affectedIds — structured event/queue/entity references", () => {
  it("V6 populates affectedIds with the C-event ID", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [{ id: "b1", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [{ dist: "Exponential", distParams: { mean: "5" } }] }],
      cEvents: [{ id: "c_bad", name: "Bad C", condition: "queue(Queue1).length > 0", effect: "ASSIGN(Queue1, Server)", cSchedules: [{ eventId: "b_missing", dist: "Fixed", distParams: { value: "1" } }] }],
    };
    const { errors } = validateModel(model);
    const v6 = errors.find(e => e.code === "V6");
    expect(v6).toBeDefined();
    expect(v6.affectedIds).toEqual({ eventIds: ["c_bad"] });
  });

  it("V6 populates affectedIds with the B-event ID", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [],
      bEvents: [{ id: "b_bad", name: "Bad B", effect: "ARRIVE(Customer)", schedules: [{ eventId: "b_missing", dist: "Fixed", distParams: { value: "1" } }] }],
      cEvents: [],
    };
    const { errors } = validateModel(model);
    const v6 = errors.find(e => e.code === "V6");
    expect(v6).toBeDefined();
    expect(v6.affectedIds).toEqual({ eventIds: ["b_bad"] });
  });

  it("V9 populates affectedIds with the C-event ID", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [],
      bEvents: [],
      cEvents: [{ id: "c_bad", name: "Bad C", condition: "queue(UnknownQ).length > 0", effect: "ASSIGN(UnknownQ, Server)", cSchedules: [] }],
    };
    const { errors } = validateModel(model);
    const v9 = errors.find(e => e.code === "V9");
    expect(v9).toBeDefined();
    expect(v9.affectedIds).toEqual({ eventIds: ["c_bad"] });
  });

  it("W-CAP-01 populates affectedIds with ALL competing C-event IDs", () => {
    const model = {
      entityTypes: [
        { id: "et1", name: "Customer", role: "customer", attrDefs: [] },
        { id: "ets", name: "Server", role: "server", count: "1", attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "q1", name: "QueueA", discipline: "FIFO", customerType: "Customer" }, { id: "q2", name: "QueueB", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [
        { id: "b1", name: "Arrive A", effect: "ARRIVE(Customer, QueueA)", schedules: [{ dist: "Exponential", distParams: { mean: "5" } }] },
        { id: "b2", name: "Arrive B", effect: "ARRIVE(Customer, QueueB)", schedules: [{ dist: "Exponential", distParams: { mean: "5" } }] },
        { id: "b3", name: "Done", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [
        { id: "c1", name: "Serve A", condition: "Queue.QueueA.length > 0", effect: "ASSIGN(QueueA, Server)", cSchedules: [{ eventId: "b3", dist: "Fixed", distParams: { value: "10" } }], priority: 1 },
        { id: "c2", name: "Serve B", condition: "Queue.QueueB.length > 0", effect: "ASSIGN(QueueB, Server)", cSchedules: [{ eventId: "b3", dist: "Fixed", distParams: { value: "5" } }], priority: 2 },
      ],
    };
    const { warnings } = validateModel(model);
    const cap = warnings.find(w => w.code === "W-CAP-01");
    expect(cap).toBeDefined();
    expect(cap.affectedIds.eventIds).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(cap.affectedIds.eventIds).toHaveLength(2);
  });

  it("V20 populates affectedIds with queue ID", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      bEvents: [],
      cEvents: [],
      queues: [{ id: "q_bad", name: "BadQ", capacity: "abc", discipline: "FIFO" }],
    };
    const { errors } = validateModel(model);
    const v20 = errors.find(e => e.code === "V20");
    expect(v20).toBeDefined();
    expect(v20.affectedIds).toEqual({ queueIds: ["q_bad"] });
  });

  it("V4 populates affectedIds with queue ID", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      bEvents: [],
      cEvents: [],
      queues: [{ id: "q_prio", name: "PrioQ", discipline: "PRIORITY", customerType: "Customer" }],
    };
    const { errors } = validateModel(model);
    const v4 = errors.find(e => e.code === "V4");
    expect(v4).toBeDefined();
    expect(v4.affectedIds).toEqual({ queueIds: ["q_prio"] });
  });

  it("V25 populates affectedIds with event ID for RENEGE in B-event", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [{ id: "b_bad", name: "Bad B", effect: "RENEGE(Customer)", schedules: [] }],
      cEvents: [],
    };
    const { errors } = validateModel(model);
    const v25 = errors.find(e => e.code === "V25");
    expect(v25).toBeDefined();
    expect(v25.affectedIds).toEqual({ eventIds: ["b_bad"] });
  });

  it("V27 populates affectedIds with event ID for FILL/DRAIN", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [{ id: "b1", name: "Bad Fill", effect: "FILL(MissingTank, 10)", schedules: [] }],
      cEvents: [],
      containerTypes: [],
    };
    const { errors } = validateModel(model);
    const v27 = errors.find(e => e.code === "V27");
    expect(v27).toBeDefined();
    expect(v27.affectedIds).toEqual({ eventIds: ["b1"] });
  });

  it("V8 (no source or sink) does NOT have affectedIds", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      bEvents: [],
      cEvents: [],
      queues: [],
    };
    const { errors } = validateModel(model);
    const v8 = errors.find(e => e.code === "V8");
    expect(v8).toBeDefined();
    expect(v8.affectedIds).toBeUndefined();
  });

  it("V34 (invalid replication count) does NOT have affectedIds", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      bEvents: [{ id: "b1", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [{ dist: "Exponential", distParams: { mean: "5" } }] }],
      cEvents: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      experimentDefaults: { replications: 0 },
    };
    const { errors } = validateModel(model);
    const v34 = errors.find(e => e.code === "V34");
    expect(v34).toBeDefined();
    expect(v34.affectedIds).toBeUndefined();
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

describe("V47 — DELAY queue reference and useEntityCtx nudge", () => {
  it("passes when DELAY references a declared queue and useEntityCtx is set", () => {
    const model = {
      ...baseModel,
      queues: [{ id: "q", name: "RecoveryQueue", discipline: "FIFO" }],
      cEvents: [{
        id: "c1", name: "Delay", condition: "queue(RecoveryQueue).length >= 1",
        effect: "DELAY(RecoveryQueue)",
        cSchedules: [{ eventId: "b1", dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }],
      }],
    };
    const { errors, warnings } = validateModel(model);
    expect(errors.filter(e => e.code === "V47")).toHaveLength(0);
    expect(warnings.filter(w => w.code === "V47")).toHaveLength(0);
  });

  it("errors when DELAY references an undeclared queue", () => {
    const model = {
      ...baseModel,
      queues: [],
      cEvents: [{
        id: "c1", name: "Delay", condition: "true",
        effect: "DELAY(GhostQueue)",
        cSchedules: [{ eventId: "b1", dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }],
      }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V47")).toBe(true);
  });

  it("warns when a DELAY C-event's cSchedule lacks useEntityCtx", () => {
    const model = {
      ...baseModel,
      queues: [{ id: "q", name: "RecoveryQueue", discipline: "FIFO" }],
      cEvents: [{
        id: "c1", name: "Delay", condition: "true",
        effect: "DELAY(RecoveryQueue)",
        cSchedules: [{ eventId: "b1", dist: "Fixed", distParams: { value: "5" } }],
      }],
    };
    const { warnings } = validateModel(model);
    expect(warnings.some(w => w.code === "V47")).toBe(true);
  });

  it("warns when a DELAY C-event's cSchedule uses ServerAttr (no server is ever claimed)", () => {
    const model = {
      ...baseModel,
      queues: [{ id: "q", name: "RecoveryQueue", discipline: "FIFO" }],
      cEvents: [{
        id: "c1", name: "Delay", condition: "true",
        effect: "DELAY(RecoveryQueue)",
        cSchedules: [{ eventId: "b1", dist: "ServerAttr", distParams: { attr: "serviceTime" }, useEntityCtx: true }],
      }],
    };
    const { warnings } = validateModel(model);
    expect(warnings.some(w => w.code === "V47")).toBe(true);
  });

  it("errors when a DELAY C-event's cSchedule targets a B-event with an ARRIVE effect", () => {
    const model = {
      ...baseModel,
      queues: [
        { id: "q", name: "RecoveryQueue", discipline: "FIFO" },
        { id: "q2", name: "Queue 2", discipline: "FIFO" },
      ],
      bEvents: [{ id: "b1", name: "Recovery Complete", effect: "ARRIVE(Customer, Queue 2)", schedules: [] }],
      cEvents: [{
        id: "c1", name: "Delay", condition: "true",
        effect: "DELAY(RecoveryQueue)",
        cSchedules: [{ eventId: "b1", dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }],
      }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V47")).toBe(true);
  });

  it("passes when a DELAY C-event's cSchedule targets a B-event with COMPLETE()", () => {
    const model = {
      ...baseModel,
      queues: [{ id: "q", name: "RecoveryQueue", discipline: "FIFO" }],
      bEvents: [{ id: "b1", name: "Recovery Complete", effect: "COMPLETE()", schedules: [] }],
      cEvents: [{
        id: "c1", name: "Delay", condition: "true",
        effect: "DELAY(RecoveryQueue)",
        cSchedules: [{ eventId: "b1", dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }],
      }],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V47")).toHaveLength(0);
  });

  it("passes when ARRIVE is combined with RELEASE() on the same B-event (legit derived-entity pattern)", () => {
    const model = {
      ...baseModel,
      queues: [
        { id: "q", name: "RecoveryQueue", discipline: "FIFO" },
        { id: "q2", name: "Queue 2", discipline: "FIFO" },
      ],
      entityTypes: [{ id: "w", name: "Worker", role: "server", count: "1", attrDefs: [] }],
      bEvents: [{
        id: "b1", name: "Recovery Complete",
        effect: ["RELEASE(Worker, Queue 2)", "ARRIVE(LogEntry, Queue 2)"],
        schedules: [],
      }],
      cEvents: [{
        id: "c1", name: "Delay", condition: "true",
        effect: "DELAY(RecoveryQueue)",
        cSchedules: [{ eventId: "b1", dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }],
      }],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V47")).toHaveLength(0);
  });
});

// ── S40.1 — EntityAttr skips distribution parameter validation ────────────────

describe("V5 — EntityAttr skips dist validation", () => {
  const baseModel = {
    entityTypes: [
      { id: "J", name: "Job", role: "customer", attrDefs: [] },
      { id: "W", name: "Worker", role: "server", count: "1", attrDefs: [] },
    ],
    queues: [{ id: "q", name: "Queue", customerType: "Job", discipline: "FIFO" }],
    stateVariables: [],
    bEvents: [
      { id: "arr", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Job, Queue)", schedules: [] },
      { id: "done", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    ],
    containerTypes: [],
  };

  it("does not emit V5 error for EntityAttr cSchedule without extra params", () => {
    const model = {
      ...baseModel,
      cEvents: [{
        id: "c1", name: "Assign", condition: "true",
        effect: "ASSIGN(Queue, Worker)",
        cSchedules: [{ eventId: "done", dist: "EntityAttr", distParams: { attr: "serviceTime" }, useEntityCtx: true }],
      }],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V5")).toHaveLength(0);
  });

  it("does not emit V5 error for EntityAttr with empty distParams", () => {
    const model = {
      ...baseModel,
      cEvents: [{
        id: "c1", name: "Assign", condition: "true",
        effect: "ASSIGN(Queue, Worker)",
        cSchedules: [{ eventId: "done", dist: "EntityAttr", distParams: {}, useEntityCtx: true }],
      }],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V5")).toHaveLength(0);
  });

  it("does not emit V5 for ServerAttr (existing behavior preserved)", () => {
    const model = {
      ...baseModel,
      cEvents: [{
        id: "c1", name: "Assign", condition: "true",
        effect: "ASSIGN(Queue, Worker)",
        cSchedules: [{ eventId: "done", dist: "ServerAttr", distParams: { attr: "serviceTime" }, useEntityCtx: true }],
      }],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V5")).toHaveLength(0);
  });

  it("emits V30 error when probabilisticRouting has null queue without COMPLETE() or RENEGE()", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [
        {
          id: "b1",
          name: "Arrival",
          effect: ["ARRIVE(Customer)"],
          schedules: [{ dist: "Exponential", distParams: { mean: "5" } }],
        },
        {
          id: "b_exit",
          name: "Exit",
          effect: ["SET(var, 1)"],
          schedules: [],
          probabilisticRouting: [{ queueName: null, probability: 1 }],
        },
      ],
      cEvents: [{
        id: "c1",
        name: "Start Service",
        condition: "queue(Queue1).length > 0",
        effect: "ASSIGN(Queue1, Server)",
        cSchedules: [{ eventId: "b_exit", dist: "Fixed", distParams: { value: "10" } }],
      }],
    };
    const { errors } = validateModel(model);
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V30", tab: "bevents" }),
    ]));
  });

  it("does not emit V30 when probabilisticRouting has null queue AND COMPLETE() effect", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [
        {
          id: "b1",
          name: "Arrival",
          effect: ["ARRIVE(Customer)"],
          schedules: [{ dist: "Exponential", distParams: { mean: "5" } }],
        },
        {
          id: "b_exit",
          name: "Exit",
          effect: ["RELEASE(Server)", "COMPLETE()"],
          schedules: [],
          probabilisticRouting: [{ queueName: null, probability: 1 }],
        },
      ],
      cEvents: [{
        id: "c1",
        name: "Start Service",
        condition: "queue(Queue1).length > 0",
        effect: "ASSIGN(Queue1, Server)",
        cSchedules: [{ eventId: "b_exit", dist: "Fixed", distParams: { value: "10" } }],
      }],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V30")).toHaveLength(0);
  });

  it("does not emit V30 when probabilisticRouting has null queue AND RENEGE(ctx) effect", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [
        {
          id: "b1",
          name: "Arrival",
          effect: ["ARRIVE(Customer)"],
          schedules: [{ dist: "Exponential", distParams: { mean: "5" } }],
        },
        {
          id: "b_exit",
          name: "Exit",
          effect: ["RENEGE(ctx)"],
          schedules: [],
          probabilisticRouting: [{ queueName: null, probability: 1 }],
        },
      ],
      cEvents: [],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V30")).toHaveLength(0);
  });

  it("still emits V30 when probabilisticRouting has null queue AND invalid RENEGE effect", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [
        {
          id: "b1",
          name: "Arrival",
          effect: ["ARRIVE(Customer)"],
          schedules: [{ dist: "Exponential", distParams: { mean: "5" } }],
        },
        {
          id: "b_exit",
          name: "Exit",
          effect: ["RENEGE(Customer)"],
          schedules: [],
          probabilisticRouting: [{ queueName: null, probability: 1 }],
        },
      ],
      cEvents: [],
    };
    const { errors } = validateModel(model);
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V25", tab: "bevents" }),
      expect.objectContaining({ code: "V30", tab: "bevents" }),
    ]));
  });

  it("warns when a single 100% null probabilistic exit is used with COMPLETE()", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [
        {
          id: "b1",
          name: "Arrival",
          effect: ["ARRIVE(Customer)"],
          schedules: [{ dist: "Exponential", distParams: { mean: "5" } }],
        },
        {
          id: "b_exit",
          name: "Exit",
          effect: ["RELEASE(Server)", "COMPLETE()"],
          schedules: [],
          probabilisticRouting: [{ queueName: null, probability: 1 }],
        },
      ],
      cEvents: [],
    };
    const { warnings } = validateModel(model);
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V33", tab: "bevents" }),
    ]));
  });

  it("errors when conditional routing exits to null without COMPLETE() or RENEGE(ctx)", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [{ name: "severity", valueType: "number" }] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [
        {
          id: "b1",
          name: "Arrival",
          effect: ["ARRIVE(Customer)"],
          schedules: [{ dist: "Exponential", distParams: { mean: "5" } }],
        },
        {
          id: "b_exit",
          name: "Exit",
          effect: ["SET(var, 1)"],
          schedules: [],
          routing: [{ condition: { variable: "Entity.severity", operator: ">", value: 1 }, queueName: null }],
        },
      ],
      cEvents: [],
    };
    const { errors } = validateModel(model);
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V31", tab: "bevents" }),
    ]));
  });

  it("errors when a terminal B-event uses both COMPLETE() and RENEGE(ctx)", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" }],
      bEvents: [
        {
          id: "b_exit",
          name: "Exit",
          effect: ["COMPLETE()", "RENEGE(ctx)"],
          schedules: [],
          probabilisticRouting: [{ queueName: null, probability: 1 }],
        },
      ],
      cEvents: [],
    };
    const { errors } = validateModel(model);
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V32", tab: "bevents" }),
    ]));
  });

  it("errors when routing is combined with RELEASE(Server, Queue)", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [{ name: "severity", valueType: "number" }] }],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" },
        { id: "q2", name: "Queue2", discipline: "FIFO", customerType: "Customer" },
      ],
      bEvents: [
        {
          id: "b_route",
          name: "Route",
          effect: "RELEASE(Server, Queue2)",
          schedules: [],
          routing: [{ condition: { variable: "Entity.severity", operator: ">", value: 1 }, queueName: "Queue1" }],
        },
      ],
      cEvents: [],
    };
    const { errors } = validateModel(model);
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V17", tab: "bevents" }),
    ]));
  });

  it("does not emit V30 when probabilisticRouting all point to defined queues", () => {
    const model = {
      entityTypes: [{ id: "et1", name: "Customer", attrDefs: [] }],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue1", discipline: "FIFO", customerType: "Customer" },
        { id: "q2", name: "Queue2", discipline: "FIFO", customerType: "Customer" },
      ],
      bEvents: [
        {
          id: "b1",
          name: "Arrival",
          effect: ["ARRIVE(Customer)"],
          schedules: [{ dist: "Exponential", distParams: { mean: "5" } }],
        },
        {
          id: "b_route",
          name: "Route",
          effect: ["RELEASE(Server)"],
          schedules: [],
          probabilisticRouting: [
            { queueName: "Queue1", probability: 0.5 },
            { queueName: "Queue2", probability: 0.5 },
          ],
        },
      ],
      cEvents: [],
    };
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V30")).toHaveLength(0);
  });

  describe("V45 — orphaned queue detection", () => {
    it("fires V45 for a queue that is never a routing destination", () => {
      const model = {
        entityTypes: [],
        stateVariables: [],
        queues: [
          { id: "q_a", name: "Queue A", discipline: "FIFO" },
          { id: "q_b", name: "Queue B", discipline: "FIFO" },
        ],
        bEvents: [
          { id: "b_arr", name: "Arrival", effect: ["ARRIVE(Customer, Queue A)"], schedules: [] },
          { id: "b_done", name: "Complete", effect: ["COMPLETE()"], schedules: [] },
        ],
        cEvents: [],
      };
      const { errors } = validateModel(model);
      expect(errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "V45", affectedIds: { queueIds: ["q_b"] } }),
      ]));
      expect(errors.filter(e => e.code === "V45" && e.affectedIds?.queueIds?.includes("q_a"))).toHaveLength(0);
    });

    it("does not fire V45 when the second queue is referenced by a RELEASE routing", () => {
      const model = {
        entityTypes: [],
        stateVariables: [],
        queues: [
          { id: "q_a", name: "Queue A", discipline: "FIFO" },
          { id: "q_b", name: "Queue B", discipline: "FIFO" },
        ],
        bEvents: [
          { id: "b_arr", name: "Arrival", effect: ["ARRIVE(Customer, Queue A)"], schedules: [] },
          { id: "b_route", name: "Route", effect: ["RELEASE(Server, Queue B)"], schedules: [] },
          { id: "b_done", name: "Complete", effect: ["COMPLETE()"], schedules: [] },
        ],
        cEvents: [],
      };
      const { errors } = validateModel(model);
      expect(errors.filter(e => e.code === "V45")).toHaveLength(0);
    });

    it("does not fire V45 when single-arg ARRIVE is used with one queue (implicit routing)", () => {
      const model = {
        entityTypes: [],
        stateVariables: [],
        queues: [
          { id: "q_a", name: "Queue A", discipline: "FIFO" },
        ],
        bEvents: [
          { id: "b_arr", name: "Arrival", effect: ["ARRIVE(Customer)"], schedules: [] },
          { id: "b_done", name: "Complete", effect: ["COMPLETE()"], schedules: [] },
        ],
        cEvents: [],
      };
      const { errors } = validateModel(model);
      expect(errors.filter(e => e.code === "V45")).toHaveLength(0);
    });
  });

  describe("V46 — overflowDestination cycle detection", () => {
    it("fires V46 when two queues name each other as overflow destinations", () => {
      const model = {
        entityTypes: [],
        stateVariables: [],
        queues: [
          { id: "q_a", name: "Queue A", discipline: "FIFO", capacity: 1, overflowDestination: "Queue B" },
          { id: "q_b", name: "Queue B", discipline: "FIFO", capacity: 1, overflowDestination: "Queue A" },
        ],
        bEvents: [
          { id: "b_arr", name: "Arrival", effect: ["ARRIVE(Customer, Queue A)"], schedules: [] },
        ],
        cEvents: [],
      };
      const { errors } = validateModel(model);
      const v46 = errors.filter(e => e.code === "V46");
      expect(v46.length).toBeGreaterThan(0);
      expect(v46.some(e => e.affectedIds?.queueIds?.includes("q_a"))).toBe(true);
      expect(v46.some(e => e.affectedIds?.queueIds?.includes("q_b"))).toBe(true);
    });

    it("fires V46 for a longer cycle (A -> B -> C -> A)", () => {
      const model = {
        entityTypes: [],
        stateVariables: [],
        queues: [
          { id: "q_a", name: "Queue A", discipline: "FIFO", capacity: 1, overflowDestination: "Queue B" },
          { id: "q_b", name: "Queue B", discipline: "FIFO", capacity: 1, overflowDestination: "Queue C" },
          { id: "q_c", name: "Queue C", discipline: "FIFO", capacity: 1, overflowDestination: "Queue A" },
        ],
        bEvents: [
          { id: "b_arr", name: "Arrival", effect: ["ARRIVE(Customer, Queue A)"], schedules: [] },
        ],
        cEvents: [],
      };
      const { errors } = validateModel(model);
      expect(errors.filter(e => e.code === "V46").length).toBeGreaterThan(0);
    });

    it("does not fire V46 for a terminating overflow chain (A -> B -> exit)", () => {
      const model = {
        entityTypes: [],
        stateVariables: [],
        queues: [
          { id: "q_a", name: "Queue A", discipline: "FIFO", capacity: 1, overflowDestination: "Queue B" },
          { id: "q_b", name: "Queue B", discipline: "FIFO", capacity: 1 },
        ],
        bEvents: [
          { id: "b_arr", name: "Arrival", effect: ["ARRIVE(Customer, Queue A)"], schedules: [] },
        ],
        cEvents: [],
      };
      const { errors } = validateModel(model);
      expect(errors.filter(e => e.code === "V46")).toHaveLength(0);
    });
  });
});
