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

  it("recognizes the function-call dialect (queue(...)) in structured predicate conditions", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      bEvents: [],
      queues: [{ id: "main", name: "ServiceQueue", discipline: "FIFO" }],
      cEvents: [{
        id: "c1",
        name: "Start Service",
        condition: {
          operator: "AND",
          clauses: [
            { variable: "queue(ServiceQueue).length", operator: ">", value: 0 },
          ],
        },
        cSchedules: [],
      }],
    };

    expect(validateModel(model).errors.filter(error => error.code === "V9")).toEqual([]);
  });

  it("reports unknown queues referenced via the function-call dialect", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      bEvents: [],
      queues: [{ id: "main", name: "ServiceQueue", discipline: "FIFO" }],
      cEvents: [{
        id: "c1",
        name: "Start Service",
        condition: { variable: "queue(MissingQueue).length", operator: ">", value: 0 },
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

describe("V27 — FILL/DRAIN amount shape (expression support)", () => {
  it("errors when a bare numeric amount is zero", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "Fuel", capacity: "500", initialLevel: "0" }],
      bEvents: [{ id: "f1", name: "Fill", effect: "FILL(Fuel, 0)", schedules: [] }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V27")).toBe(true);
  });

  it("errors when a bare numeric amount is negative", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "Fuel", capacity: "500", initialLevel: "200" }],
      cEvents: [{ id: "d1", name: "Drain", condition: "true", effect: "DRAIN(Fuel, -5)", cSchedules: [] }],
    };
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === "V27" && e.severity !== "warning")).toBe(true);
  });

  it("passes (no error/warning) for a positive bare numeric amount", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "Fuel", capacity: "500", initialLevel: "0" }],
      bEvents: [{ id: "f1", name: "Fill", effect: "FILL(Fuel, 50)", schedules: [] }],
    };
    const { errors, warnings } = validateModel(model);
    expect(errors.filter(e => e.code === "V27")).toHaveLength(0);
    expect((warnings || []).filter(w => w.code === "V27")).toHaveLength(0);
  });

  it("warns when amount is a bare non-numeric identifier with no matching state variable", () => {
    const model = {
      ...baseModel,
      containerTypes: [{ id: "Fuel", capacity: "500", initialLevel: "0" }],
      bEvents: [{ id: "f1", name: "Fill", effect: "FILL(Fuel, abc)", schedules: [] }],
    };
    const { errors, warnings } = validateModel(model);
    expect(errors.filter(e => e.code === "V27")).toHaveLength(0);
    expect((warnings || []).some(w => w.code === "V27")).toBe(true);
  });

  it("does not warn when the bare amount matches a declared state variable", () => {
    const model = {
      ...baseModel,
      stateVariables: [{ name: "RefillRate", initialValue: "10" }],
      containerTypes: [{ id: "Fuel", capacity: "500", initialLevel: "0" }],
      bEvents: [{ id: "f1", name: "Fill", effect: "FILL(Fuel, RefillRate)", schedules: [] }],
    };
    const { errors, warnings } = validateModel(model);
    expect(errors.filter(e => e.code === "V27")).toHaveLength(0);
    expect((warnings || []).filter(w => w.code === "V27")).toHaveLength(0);
  });

  it("does not warn when the amount is an arithmetic expression", () => {
    const model = {
      ...baseModel,
      stateVariables: [{ name: "RefillRate", initialValue: "10" }],
      containerTypes: [{ id: "Fuel", capacity: "500", initialLevel: "0" }],
      bEvents: [{ id: "f1", name: "Fill", effect: "FILL(Fuel, RefillRate * 2)", schedules: [] }],
    };
    const { errors, warnings } = validateModel(model);
    expect(errors.filter(e => e.code === "V27")).toHaveLength(0);
    expect((warnings || []).filter(w => w.code === "V27")).toHaveLength(0);
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

  // ── V50–V56: Weekly Schedule Pattern ─────────────────────────────────────

  describe("V50–V56: Weekly Schedule Pattern validation", () => {
    function baseModel(overrides) {
      return {
        entityTypes: [{
          id: "srv",
          name: "Server",
          role: "server",
          count: 2,
          ...overrides,
        }],
        queues: [{ id: "q", name: "Queue", discipline: "FIFO" }],
        bEvents: [{ id: "b_arr", name: "Arrival", effect: ["ARRIVE(Customer)"], schedules: [] }],
        cEvents: [{ id: "c_assign", name: "Assign", condition: { variable: "Queue.Queue.length", operator: ">", value: 0 }, cSchedules: [{ eventId: "b_arr", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] }],
        epoch: "2026-01-05T09:00:00Z",
        timeUnit: "minutes",
      };
    }

    it("V50: passes with valid weekly schedule pattern", () => {
      const { errors, warnings } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          periods: [{ dayOfWeek: 1, start: "00:00", end: "23:59", capacity: 2 }],
        },
      }));
      expect(errors.filter(e => e.code.startsWith("V5"))).toHaveLength(0);
      expect(warnings.filter(e => e.code.startsWith("V5"))).toHaveLength(0);
    });

    it("V50: requires at least one period", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [] },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V50" }));
    });

    it("V50: rejects missing periods array", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly" },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V50" }));
    });

    it("V50: rejects concurrent schedulePattern and shiftSchedule", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 2 }] },
        shiftSchedule: [{ time: 0, capacity: 2 }],
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V50" }));
    });

    it("V50: rejects missing start time", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 1, end: "17:00", capacity: 2 }] },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V50" }));
    });

    it("V50: rejects invalid HH:MM format", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 1, start: "9am", end: "5pm", capacity: 2 }] },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V50" }));
    });

    it("V50: rejects start >= end", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 1, start: "17:00", end: "09:00", capacity: 2 }] },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V50" }));
    });

    it("V51: rejects overlapping periods on same day", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          periods: [
            { dayOfWeek: 1, start: "09:00", end: "13:00", capacity: 2 },
            { dayOfWeek: 1, start: "12:00", end: "17:00", capacity: 1 },
          ],
        },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V51" }));
    });

    it("V51: allows non-overlapping periods on same day", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          periods: [
            { dayOfWeek: 1, start: "09:00", end: "12:00", capacity: 2 },
            { dayOfWeek: 1, start: "13:00", end: "17:00", capacity: 1 },
          ],
        },
      }));
      expect(errors.filter(e => e.code.startsWith("V5"))).toHaveLength(0);
    });

    it("V52: rejects non-integer capacity", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: "many" }] },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V52" }));
    });

    it("V52: rejects negative capacity", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: -1 }] },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V52" }));
    });

    it("V52: accepts zero capacity", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 0 }] },
      }));
      expect(errors.filter(e => e.code === "V52")).toHaveLength(0);
    });

    it("V53: rejects non-integer dayOfWeek", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: "mondays", start: "09:00", end: "17:00", capacity: 2 }] },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V53" }));
    });

    it("V53: rejects dayOfWeek out of range", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 8, start: "09:00", end: "17:00", capacity: 2 }] },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V53" }));
    });

    it("V53: accepts dayOfWeek 1 through 7", () => {
      for (const day of [1, 3, 7]) {
        const { errors } = validateModel(baseModel({
          schedulePattern: { type: "weekly", periods: [{ dayOfWeek: day, start: "09:00", end: "17:00", capacity: 2 }] },
        }));
        expect(errors.filter(e => e.code.startsWith("V5"))).toHaveLength(0);
      }
    });

    it("V54: rejects invalid exception date", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 2 }],
          exceptions: [{ date: "not-a-date" }],
        },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V54" }));
    });

    it("V54: accepts valid ISO exception date", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 2 }],
          exceptions: [{ date: "2026-01-26", periods: [{ start: "10:00", end: "14:00", capacity: 1 }] }],
        },
      }));
      expect(errors.filter(e => e.code.startsWith("V5"))).toHaveLength(0);
    });

    it("V54: rejects exception with invalid HH:MM in periods", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 2 }],
          exceptions: [{ date: "2026-01-26", periods: [{ start: "bad", end: "14:00", capacity: 1 }] }],
        },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V50" }));
    });

    it("V55: rejects schedulePattern without epoch", () => {
      const model = baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 2 }] },
      });
      model.epoch = "";
      const { errors } = validateModel(model);
      expect(errors).toContainEqual(expect.objectContaining({ code: "V55" }));
    });

    it("V55: passes with epoch set", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: { type: "weekly", periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 2 }] },
      }));
      expect(errors.filter(e => e.code === "V55")).toHaveLength(0);
    });

    it("V56: warns when initial capacity is 0", () => {
      const { warnings } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 0 }],
        },
      }));
      expect(warnings).toContainEqual(expect.objectContaining({ code: "V56" }));
    });

    it("V56: no warning when initial capacity > 0", () => {
      const { warnings } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          periods: [{ dayOfWeek: 1, start: "00:00", end: "23:59", capacity: 2 }],
        },
      }));
      expect(warnings.filter(e => e.code === "V56")).toHaveLength(0);
    });
  });

  // ── V57–V60: Multiplier mode ─────────────────────────────────────────────

  describe("V57–V60: Multiplier mode validation", () => {
    const baseModel = (overrides = {}) => ({
      entityTypes: [{
        id: "et1",
        name: "Nurse",
        role: "server",
        count: 6,
        attributes: [],
        ...overrides,
      }],
      queues: [],
      bEvents: [],
      cEvents: [],
      stateVariables: [],
      containerTypes: [],
      epoch: "2026-06-01T00:00:00Z",
      timeUnit: "minutes",
      experimentDefaults: { replications: 1, maxSimTime: 10080, warmupPeriod: 0 },
    });

    it("V57: requires baseCapacity in multiplier mode", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 1.0 }],
        },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V57" }));
    });

    it("V57: rejects negative baseCapacity", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          baseCapacity: -5,
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 1.0 }],
        },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V57" }));
    });

    it("V57: passes with valid baseCapacity", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          baseCapacity: 6,
          defaultCapacity: 0,
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 1.0 }],
        },
      }));
      expect(errors.filter(e => e.code === "V57")).toHaveLength(0);
    });

    it("V58: rejects period capacity > 1.0 in multiplier mode", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          baseCapacity: 6,
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 1.5 }],
        },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V58" }));
    });

    it("V58: rejects negative period capacity in multiplier mode", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          baseCapacity: 6,
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: -0.5 }],
        },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V58" }));
    });

    it("V58: accepts period capacity 0.0–1.0 in multiplier mode", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          baseCapacity: 6,
          defaultCapacity: 0,
          periods: [
            { dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 1.0 },
            { dayOfWeek: 1, start: "17:00", end: "22:00", capacity: 0.5 },
            { dayOfWeek: 2, start: "09:00", end: "17:00", capacity: 0 },
          ],
        },
      }));
      expect(errors.filter(e => e.code === "V58")).toHaveLength(0);
    });

    it("V59: rejects defaultCapacity > 1.0 in multiplier mode", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          baseCapacity: 6,
          defaultCapacity: 1.5,
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 1.0 }],
        },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V59" }));
    });

    it("V59: accepts defaultCapacity 0.0–1.0 in multiplier mode", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          baseCapacity: 6,
          defaultCapacity: 0.33,
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 1.0 }],
        },
      }));
      expect(errors.filter(e => e.code === "V59")).toHaveLength(0);
    });

    it("V60: rejects exception period capacity > 1.0 in multiplier mode", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          baseCapacity: 6,
          defaultCapacity: 0,
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 1.0 }],
          exceptions: [{
            date: "2026-06-01",
            periods: [{ start: "10:00", end: "14:00", capacity: 1.5 }],
          }],
        },
      }));
      expect(errors).toContainEqual(expect.objectContaining({ code: "V60" }));
    });

    it("V60: accepts exception period capacity 0.0–1.0 in multiplier mode", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "multiplier",
          baseCapacity: 6,
          defaultCapacity: 0,
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 1.0 }],
          exceptions: [{
            date: "2026-06-01",
            periods: [{ start: "10:00", end: "14:00", capacity: 0.5 }],
          }],
        },
      }));
      expect(errors.filter(e => e.code === "V60")).toHaveLength(0);
    });

    it("does not apply multiplier validation in absolute mode", () => {
      const { errors } = validateModel(baseModel({
        schedulePattern: {
          type: "weekly",
          mode: "absolute",
          defaultCapacity: 0,
          periods: [{ dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 5 }],
        },
      }));
      expect(errors.filter(e => ["V57", "V58", "V59", "V60"].includes(e.code))).toHaveLength(0);
    });
  });

  describe("V-SKILL-7: entity-side Categorical skill requirements must be coverable by a server", () => {
    const baseSkillModel = (serverOverrides = {}) => ({
      entityTypes: [
        {
          id: "patient", name: "Patient", role: "customer",
          attrDefs: [{
            name: "requiredSkill", valueType: "string", dist: "Categorical",
            distParams: { options: [{ value: "Surgery", weight: 100 }] },
          }],
        },
        { id: "doctor", name: "Doctor", role: "server", count: 2, ...serverOverrides },
      ],
      skills: ["Surgery", "Consultation"],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO", customerType: "Patient" }],
      bEvents: [{ id: "b", name: "Arrive", effect: ["ARRIVE(Patient)"], schedules: [] }],
      cEvents: [{
        id: "c", name: "Serve",
        effect: "ASSIGN(Queue, Doctor, Entity.requiredSkill)",
        cSchedules: [{ eventId: "b", useEntityCtx: true }],
      }],
    });

    it("warns when no server instance — type-level or per-profile — has the required skill", () => {
      const { warnings } = validateModel(baseSkillModel({ skills: ["Consultation"] }));
      const v7 = warnings.filter(w => w.code === "V-SKILL-7");
      expect(v7).toHaveLength(1);
      expect(v7[0].message).toMatch(/Surgery/);
    });

    it("does not warn when the type-level skills cover the required value", () => {
      const { warnings } = validateModel(baseSkillModel({ skills: ["Surgery"] }));
      expect(warnings.filter(w => w.code === "V-SKILL-7")).toHaveLength(0);
    });

    it("does not warn when a skillProfiles entry (not the base skills) covers the required value", () => {
      const { warnings } = validateModel(baseSkillModel({
        skills: ["Consultation"],
        skillProfiles: [{ name: "Surgeon", skills: ["Surgery"], count: 1 }],
      }));
      expect(warnings.filter(w => w.code === "V-SKILL-7")).toHaveLength(0);
    });

    it("does not warn for non-Categorical entity attributes used in ASSIGN", () => {
      const model = baseSkillModel({ skills: ["Consultation"] });
      model.entityTypes[0].attrDefs[0] = { name: "requiredSkill", valueType: "number", dist: "Fixed", distParams: { value: "1" } };
      const { warnings } = validateModel(model);
      expect(warnings.filter(w => w.code === "V-SKILL-7")).toHaveLength(0);
    });
  });
});

describe("V38c/V38d — RELEASE / RELEASE_COSEIZED consistency with scheduling COSEIZE", () => {
  const coseizeModel = (bEffect) => ({
    entityTypes: [
      { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
      { id: "surgeon", name: "Surgeon", role: "server", count: 1, attrDefs: [] },
      { id: "anesthetist", name: "Anesthetist", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [{ id: "surgery_q", name: "SurgeryQueue", discipline: "FIFO" }],
    bEvents: [
      { id: "arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Patient, SurgeryQueue)",
        schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1" } }] },
      { id: "surgery_done", name: "Surgery Complete", scheduledTime: "9999", effect: bEffect, schedules: [] },
    ],
    cEvents: [{
      id: "ce_surgery", name: "Perform Surgery", priority: 1,
      condition: "queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0",
      effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
      cSchedules: [{ eventId: "surgery_done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }],
    }],
  });

  it("V38c: warns when two separate RELEASE() calls target co-seized types", () => {
    const model = coseizeModel(["RELEASE(Surgeon)", "RELEASE(Anesthetist)"]);
    const { warnings } = validateModel(model);
    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "V38c" })]));
  });

  it("V38c: does not warn for a single RELEASE() targeting one co-seized type", () => {
    const model = coseizeModel(["RELEASE(Surgeon)"]);
    const { warnings } = validateModel(model);
    expect(warnings.filter(w => w.code === "V38c")).toHaveLength(0);
  });

  it("V38c: does not warn for COMPLETE() or a single RELEASE_COSEIZED([...]) call", () => {
    expect(validateModel(coseizeModel(["COMPLETE()"])).warnings.filter(w => w.code === "V38c")).toHaveLength(0);
    expect(validateModel(coseizeModel(["RELEASE_COSEIZED([Surgeon, Anesthetist])"])).warnings.filter(w => w.code === "V38c")).toHaveLength(0);
  });

  it("V38d: warns when RELEASE_COSEIZED([...]) lists a type not part of the scheduling COSEIZE", () => {
    const model = coseizeModel(["RELEASE_COSEIZED([Surgeon, Nurse])"]);
    const { warnings } = validateModel(model);
    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "V38d" })]));
  });

  it("V38d: does not warn when RELEASE_COSEIZED([...]) types match the scheduling COSEIZE", () => {
    const model = coseizeModel(["RELEASE_COSEIZED([Surgeon, Anesthetist])"]);
    const { warnings } = validateModel(model);
    expect(warnings.filter(w => w.code === "V38d")).toHaveLength(0);
  });

  it("does not warn V38c/V38d for a B-event not scheduled by any COSEIZE", () => {
    const model = coseizeModel(["RELEASE(Surgeon)"]);
    model.cEvents[0].effect = "ASSIGN(SurgeryQueue, Surgeon)";
    const { warnings } = validateModel(model);
    expect(warnings.filter(w => w.code === "V38c" || w.code === "V38d")).toHaveLength(0);
  });

  it("V45: does not flag a queue as orphaned when it's only reachable via RELEASE_COSEIZED([...], Queue)", () => {
    const model = coseizeModel(["RELEASE_COSEIZED([Surgeon, Anesthetist], WardQueue)"]);
    model.queues.push({ id: "ward_q", name: "WardQueue", discipline: "FIFO" });
    const { errors } = validateModel(model);
    expect(errors.filter(e => e.code === "V45")).toHaveLength(0);
  });

  it("V45: still flags a genuinely orphaned queue alongside a RELEASE_COSEIZED-reached one", () => {
    const model = coseizeModel(["RELEASE_COSEIZED([Surgeon, Anesthetist], WardQueue)"]);
    model.queues.push({ id: "ward_q", name: "WardQueue", discipline: "FIFO" });
    model.queues.push({ id: "orphan_q", name: "OrphanQueue", discipline: "FIFO" });
    const { errors } = validateModel(model);
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "V45", message: expect.stringContaining("OrphanQueue") }),
    ]));
    expect(errors.filter(e => e.code === "V45" && e.message.includes("WardQueue"))).toHaveLength(0);
  });
});
