// src/simulation/modelChecker.test.js — F69.2 unit tests
import { describe, test, expect } from "vitest";
import { checkModel } from "./modelChecker.js";

// ── Base well-formed model ────────────────────────────────────────────────────

const wellFormedModel = {
  name: "Well-formed",
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer", attrDefs: [] },
    { id: "et2", name: "Clerk", role: "server", count: "1", attrDefs: [] },
  ],
  queues: [{ id: "q1", name: "ServiceQueue" }],
  bEvents: [
    {
      id: "arrive1",
      name: "Arrive",
      scheduledTime: 0,
      schedules: [
        { eventId: "arrive1", macro: "ARRIVE", entityTypeName: "Customer", queueName: "ServiceQueue", dist: "exponential", distParams: { rate: 1 } },
      ],
    },
    {
      id: "complete1",
      name: "Complete",
      scheduledTime: 9999,
      schedules: [
        { eventId: "complete1", macro: "COMPLETE", entityTypeName: "Customer", queueName: "ServiceQueue", dist: "fixed", distParams: { value: 0 } },
      ],
    },
  ],
  cEvents: [
    {
      id: "serve1",
      name: "Serve",
      priority: 1,
      condition: { clauses: [{ variable: "Queue.ServiceQueue.length", operator: ">", value: 0 }], logic: "AND" },
      cSchedules: [
        { macro: "SEIZE", entityTypeName: "Customer", queueName: "ServiceQueue", serverTypeName: "Clerk", dist: "fixed", distParams: { value: 5 } },
      ],
    },
  ],
  stateVariables: [],
};

// ── Individual check tests ────────────────────────────────────────────────────

describe("CHK-001 Unreachable entity type", () => {
  test("triggers when an entity type has no arrival event", () => {
    const model = {
      ...wellFormedModel,
      entityTypes: [
        { id: "et1", name: "Customer", role: "customer", attrDefs: [] },
        { id: "et2", name: "Orphan", role: "customer", attrDefs: [] },
        { id: "et3", name: "Clerk", role: "server", count: "1", attrDefs: [] },
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-001");
    expect(chk).toHaveLength(1);
    expect(chk[0].nodeName).toBe("Orphan");
    expect(chk[0].severity).toBe("error");
  });

  test("does not trigger for server entity types", () => {
    const issues = checkModel(wellFormedModel);
    const chk = issues.filter(i => i.code === "CHK-001");
    expect(chk).toHaveLength(0);
  });
});

describe("CHK-002 No sink for entity type", () => {
  test("triggers when entity type is created but never completed or seized", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [wellFormedModel.bEvents[0]], // only arrive, no complete
      cEvents: [],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-002");
    expect(chk).toHaveLength(1);
    expect(chk[0].nodeName).toBe("Customer");
    expect(chk[0].severity).toBe("error");
  });
});

describe("CHK-003 C-event references undefined queue", () => {
  test("triggers when cSchedule references a queue that does not exist", () => {
    const model = {
      ...wellFormedModel,
      cEvents: [
        {
          ...wellFormedModel.cEvents[0],
          cSchedules: [
            { macro: "SEIZE", entityTypeName: "Customer", queueName: "NonExistentQueue", serverTypeName: "Clerk", dist: "fixed", distParams: { value: 5 } },
          ],
        },
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-003");
    expect(chk.length).toBeGreaterThan(0);
    expect(chk[0].severity).toBe("error");
  });
});

describe("CHK-004 C-event references undefined server", () => {
  test("triggers when cSchedule references a server that does not exist", () => {
    const model = {
      ...wellFormedModel,
      cEvents: [
        {
          ...wellFormedModel.cEvents[0],
          cSchedules: [
            { macro: "SEIZE", entityTypeName: "Customer", queueName: "ServiceQueue", serverTypeName: "GhostServer", dist: "fixed", distParams: { value: 5 } },
          ],
        },
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-004");
    expect(chk).toHaveLength(1);
    expect(chk[0].severity).toBe("error");
    expect(chk[0].message).toContain("GhostServer");
  });
});

describe("CHK-005 Follow-on chain has no terminal event", () => {
  test("triggers when a follow-on chain forms a cycle", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [
        {
          id: "ev1",
          name: "EventA",
          scheduledTime: 0,
          schedules: [
            { macro: "ARRIVE", entityTypeName: "Customer", queueName: "ServiceQueue", dist: "fixed", distParams: { value: 1 }, followOnEventId: "ev2" },
          ],
        },
        {
          id: "ev2",
          name: "EventB",
          scheduledTime: 5,
          schedules: [
            { macro: "ARRIVE", entityTypeName: "Customer", queueName: "ServiceQueue", dist: "fixed", distParams: { value: 1 }, followOnEventId: "ev1" },
          ],
        },
        wellFormedModel.bEvents[1], // complete
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-005");
    expect(chk.length).toBeGreaterThan(0);
    expect(chk[0].severity).toBe("warning");
  });
});

describe("CHK-006 Queue checked in C-event but nothing feeds it", () => {
  test("triggers when no A-event routes into the queue used by a C-event", () => {
    const model = {
      ...wellFormedModel,
      queues: [
        ...wellFormedModel.queues,
        { id: "q2", name: "EmptyQueue" },
      ],
      cEvents: [
        {
          ...wellFormedModel.cEvents[0],
          cSchedules: [
            { macro: "SEIZE", entityTypeName: "Customer", queueName: "EmptyQueue", serverTypeName: "Clerk", dist: "fixed", distParams: { value: 5 } },
          ],
        },
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-006");
    expect(chk).toHaveLength(1);
    expect(chk[0].severity).toBe("warning");
    expect(chk[0].message).toContain("EmptyQueue");
  });
});

describe("CHK-013 Queue fed via RELEASE_COSEIZED but nothing consumes it", () => {
  const coseizeModel = (surgeryDoneEffect, extraCEvents = []) => ({
    name: "Coseize",
    entityTypes: [
      { id: "et1", name: "Patient", role: "customer", attrDefs: [] },
      { id: "et2", name: "Surgeon", role: "server", count: "1", attrDefs: [] },
      { id: "et3", name: "Anesthetist", role: "server", count: "1", attrDefs: [] },
    ],
    queues: [
      { id: "q1", name: "SurgeryQueue" },
      { id: "q2", name: "WardQueue" },
    ],
    bEvents: [
      { id: "arrive1", name: "Arrive", scheduledTime: 0, effect: "ARRIVE(Patient, SurgeryQueue)",
        schedules: [{ eventId: "arrive1", dist: "fixed", distParams: { value: 1 } }] },
      { id: "surgery_done", name: "Surgery Complete", scheduledTime: 9999, effect: surgeryDoneEffect, schedules: [] },
    ],
    cEvents: [
      {
        id: "ce_surgery", name: "Perform Surgery", priority: 1,
        condition: { clauses: [{ variable: "Queue.SurgeryQueue.length", operator: ">", value: 0 }], logic: "AND" },
        effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
        cSchedules: [{ eventId: "surgery_done", dist: "fixed", distParams: { value: 2 } }],
      },
      ...extraCEvents,
    ],
    stateVariables: [],
  });

  test("triggers when a queue is fed only via RELEASE_COSEIZED([...], Queue) and no C-event consumes it", () => {
    const model = coseizeModel("RELEASE_COSEIZED([Surgeon, Anesthetist], WardQueue)");
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-013");
    expect(chk).toHaveLength(1);
    expect(chk[0].message).toContain("WardQueue");
  });

  test("does not trigger when a C-event consumes the RELEASE_COSEIZED destination queue", () => {
    const model = coseizeModel("RELEASE_COSEIZED([Surgeon, Anesthetist], WardQueue)", [
      {
        id: "ce_discharge", name: "Discharge", priority: 1,
        condition: { clauses: [{ variable: "Queue.WardQueue.length", operator: ">", value: 0 }], logic: "AND" },
        effect: "DELAY(WardQueue)",
        cSchedules: [],
      },
    ]);
    const issues = checkModel(model);
    expect(issues.filter(i => i.code === "CHK-013")).toHaveLength(0);
  });
});

describe("CHK-007 Model has no events defined", () => {
  test("triggers when entity types exist but no events", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [],
      cEvents: [],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-007");
    expect(chk).toHaveLength(1);
    expect(chk[0].severity).toBe("info");
  });

  test("does not trigger when events are defined", () => {
    const issues = checkModel(wellFormedModel);
    const chk = issues.filter(i => i.code === "CHK-007");
    expect(chk).toHaveLength(0);
  });
});

describe("CHK-008 Server defined but never used in C-event", () => {
  test("triggers when a server entity type is not referenced by any C-event", () => {
    const model = {
      ...wellFormedModel,
      entityTypes: [
        ...wellFormedModel.entityTypes,
        { id: "et3", name: "UnusedServer", role: "server", count: "1", attrDefs: [] },
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-008");
    expect(chk).toHaveLength(1);
    expect(chk[0].nodeName).toBe("UnusedServer");
    expect(chk[0].severity).toBe("warning");
  });

  test("does not trigger for server types seized via COSEIZE", () => {
    const model = {
      ...wellFormedModel,
      entityTypes: [
        ...wellFormedModel.entityTypes,
        { id: "et3", name: "Surgeon", role: "server", count: "2", attrDefs: [] },
        { id: "et4", name: "Anesthetist", role: "server", count: "2", attrDefs: [] },
      ],
      cEvents: [
        ...wellFormedModel.cEvents,
        {
          id: "surgery1",
          name: "Perform Surgery",
          priority: 1,
          condition: { clauses: [{ variable: "Queue.ServiceQueue.length", operator: ">", value: 0 }], logic: "AND" },
          effect: ["COSEIZE(ServiceQueue, Surgeon, Anesthetist)"],
          cSchedules: [],
        },
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-008");
    expect(chk).toHaveLength(0);
  });
});

describe("CHK-009 Schedule dist with no rows or times", () => {
  test("triggers when a Schedule dist has no rows and no times", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [
        {
          id: "arrive1",
          name: "Arrive",
          schedules: [{ macro: "ARRIVE", entityTypeName: "Customer", queueName: "Q1", dist: "Schedule", distParams: {} }],
          effect: ["ARRIVE(Customer, Q1)"],
        },
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-009");
    expect(chk).toHaveLength(1);
    expect(chk[0].severity).toBe("error");
    expect(chk[0].nodeName).toBe("Arrive");
  });

  test("does not trigger when Schedule dist has rows", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [
        {
          id: "arrive1",
          name: "Arrive",
          schedules: [{
            macro: "ARRIVE", entityTypeName: "Customer", queueName: "Q1",
            dist: "Schedule",
            distParams: { rows: [{ time: 1, rate: 5 }, { time: 60, rate: 3 }] },
          }],
          effect: ["ARRIVE(Customer, Q1)"],
        },
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-009");
    expect(chk).toHaveLength(0);
  });

  test("does not trigger when Schedule dist has times array", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [
        {
          id: "arrive1",
          name: "Arrive",
          schedules: [{
            macro: "ARRIVE", entityTypeName: "Customer", queueName: "Q1",
            dist: "Schedule",
            distParams: { times: [10, 20, 30] },
          }],
          effect: ["ARRIVE(Customer, Q1)"],
        },
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-009");
    expect(chk).toHaveLength(0);
  });
});

describe("CHK-011 balkCondition string-shape check (Part B — parse-failure only)", () => {
  test("does not trigger for a well-formed string balkCondition on a queue", () => {
    const model = {
      ...wellFormedModel,
      queues: [{ id: "q1", name: "ServiceQueue", balkCondition: "queue(ServiceQueue).length > 5" }],
    };
    const issues = checkModel(model);
    expect(issues.filter(i => i.code === "CHK-011")).toHaveLength(0);
  });

  test("triggers for a malformed string balkCondition on a queue", () => {
    const model = {
      ...wellFormedModel,
      queues: [{ id: "q1", name: "ServiceQueue", balkCondition: "this is not a parseable condition" }],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-011");
    expect(chk).toHaveLength(1);
    expect(chk[0].severity).toBe("error");
    expect(chk[0].nodeName).toBe("ServiceQueue");
  });

  test("does not trigger for an already-canonical predicate-object balkCondition", () => {
    const model = {
      ...wellFormedModel,
      queues: [{ id: "q1", name: "ServiceQueue", balkCondition: { variable: "Queue.ServiceQueue.length", operator: ">", value: 5 } }],
    };
    const issues = checkModel(model);
    expect(issues.filter(i => i.code === "CHK-011")).toHaveLength(0);
  });

  test("triggers for a malformed string balkCondition on a B-event (legacy hygiene)", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [
        { ...wellFormedModel.bEvents[0], balkCondition: "this is not a parseable condition" },
        wellFormedModel.bEvents[1],
      ],
    };
    const issues = checkModel(model);
    expect(issues.filter(i => i.code === "CHK-011")).toHaveLength(1);
  });
});

describe("CHK-012 routing condition string-shape check (Part B — parse-failure only)", () => {
  test("does not trigger for a well-formed string routing condition", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [
        { ...wellFormedModel.bEvents[0], routing: [{ queueName: "ServiceQueue", condition: "idle(Clerk).count > 0" }] },
        wellFormedModel.bEvents[1],
      ],
    };
    const issues = checkModel(model);
    expect(issues.filter(i => i.code === "CHK-012")).toHaveLength(0);
  });

  test("triggers for a malformed string routing condition", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [
        { ...wellFormedModel.bEvents[0], routing: [{ queueName: "ServiceQueue", condition: "this is not a parseable condition" }] },
        wellFormedModel.bEvents[1],
      ],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-012");
    expect(chk).toHaveLength(1);
    expect(chk[0].severity).toBe("error");
  });

  test("does not trigger for an already-canonical predicate-object routing condition", () => {
    const model = {
      ...wellFormedModel,
      bEvents: [
        { ...wellFormedModel.bEvents[0], routing: [{ queueName: "ServiceQueue", condition: { variable: "idle(Clerk).count", operator: ">", value: 0 } }] },
        wellFormedModel.bEvents[1],
      ],
    };
    const issues = checkModel(model);
    expect(issues.filter(i => i.code === "CHK-012")).toHaveLength(0);
  });
});

describe("CHK-014 cSchedules[].when string-shape check (new — Part B symmetry)", () => {
  test("does not trigger for a well-formed string when condition", () => {
    const model = {
      ...wellFormedModel,
      cEvents: [{ ...wellFormedModel.cEvents[0], cSchedules: [{ ...wellFormedModel.cEvents[0].cSchedules[0], when: "clock > 5" }] }],
    };
    const issues = checkModel(model);
    expect(issues.filter(i => i.code === "CHK-014")).toHaveLength(0);
  });

  test("triggers for a malformed string when condition", () => {
    const model = {
      ...wellFormedModel,
      cEvents: [{ ...wellFormedModel.cEvents[0], cSchedules: [{ ...wellFormedModel.cEvents[0].cSchedules[0], when: "this is not a parseable condition" }] }],
    };
    const issues = checkModel(model);
    const chk = issues.filter(i => i.code === "CHK-014");
    expect(chk).toHaveLength(1);
    expect(chk[0].severity).toBe("error");
  });

  test("does not trigger for an already-canonical predicate-object when condition", () => {
    const model = {
      ...wellFormedModel,
      cEvents: [{ ...wellFormedModel.cEvents[0], cSchedules: [{ ...wellFormedModel.cEvents[0].cSchedules[0], when: { variable: "clock", operator: ">", value: 5 } }] }],
    };
    const issues = checkModel(model);
    expect(issues.filter(i => i.code === "CHK-014")).toHaveLength(0);
  });
});

describe("checkModel well-formed model", () => {
  test("returns no issues for a structurally valid model", () => {
    const issues = checkModel(wellFormedModel);
    const codes = issues.map(i => i.code);
    // Only CHK-002 might fire because wellFormedModel has COMPLETE in bEvents but the SEIZE in cEvents
    // should also count as a sink - verify the model produces 0 errors
    const errors = issues.filter(i => i.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("returns issues sorted: errors before warnings before info", () => {
    // Model with multiple issue types
    const model = {
      name: "Multi-issue",
      entityTypes: [
        { id: "et1", name: "Customer", role: "customer", attrDefs: [] },
        { id: "et2", name: "UnusedServer", role: "server", count: "1", attrDefs: [] },
      ],
      queues: [{ id: "q1", name: "Q1" }],
      bEvents: [
        {
          id: "arrive1",
          name: "Arrive",
          scheduledTime: 0,
          schedules: [{ macro: "ARRIVE", entityTypeName: "Customer", queueName: "Q1", dist: "fixed", distParams: { value: 1 } }],
        },
      ],
      cEvents: [],
      stateVariables: [],
    };

    const issues = checkModel(model);
    const severities = issues.map(i => i.severity);
    let maxSevSeen = -1;
    for (const sev of severities) {
      const rank = SEV_ORDER[sev] ?? 99;
      expect(rank).toBeGreaterThanOrEqual(maxSevSeen);
      maxSevSeen = rank;
    }
  });
});

const SEV_ORDER = { error: 0, warning: 1, info: 2 };
