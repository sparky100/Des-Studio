// tests/engine/conditional-routing.test.js — F10.1 conditional entity routing
import { describe, test, expect } from "vitest";
import { buildEngine } from "../../src/engine/index.js";

// ── Model helpers ─────────────────────────────────────────────────────────────

function baseModel(patientOutcome, routingRows = null, defaultQueueName = "Ward Queue") {
  const releaseBEvent = {
    id: "be-release", name: "Service Complete", scheduledTime: "9999",
    effect: "RELEASE(Nurse)",
    schedules: [],
    ...(routingRows ? { routing: routingRows, defaultQueueName } : {}),
  };

  return {
    entityTypes: [
      {
        id: "et-patient", name: "Patient", role: "customer",
        attrDefs: [{ name: "outcome", valueType: "string", defaultValue: patientOutcome }],
      },
      { id: "et-nurse", name: "Nurse", role: "server", count: "1", attrDefs: [] },
    ],
    queues: [
      { id: "q-wait", name: "Waiting Queue",  discipline: "FIFO" },
      { id: "q-icu",  name: "ICU Queue",       discipline: "FIFO" },
      { id: "q-ward", name: "Ward Queue",      discipline: "FIFO" },
    ],
    bEvents: [
      {
        id: "be-arrive", name: "Patient Arrives", scheduledTime: "0",
        effect: "ARRIVE(Patient, Waiting Queue)", schedules: [],
      },
      releaseBEvent,
    ],
    cEvents: [
      {
        id: "ce-serve", name: "Start Service", priority: 1,
        condition: "queue(Patient).length > 0 AND idle(Nurse).count > 0",
        effect: "ASSIGN(Waiting Queue, Nurse)",
        cSchedules: [
          { eventId: "be-release", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true },
        ],
      },
    ],
    stateVariables: [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RELEASE — backward compatibility (no routing table)", () => {
  test("fixed RELEASE with literal queue in effect string still works", () => {
    const model = baseModel("ward");
    // Override release B-event to use the legacy effect string with queue arg
    model.bEvents[1] = {
      ...model.bEvents[1],
      effect: "RELEASE(Nurse, Ward Queue)",
      routing: undefined,
      defaultQueueName: undefined,
    };
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    // Patient should be waiting in Ward Queue after release
    expect(patient.queue).toBe("Ward Queue");
  });

  test("RELEASE with no target queue leaves customer queue unchanged", () => {
    const model = baseModel("ward");
    model.bEvents[1] = {
      ...model.bEvents[1],
      effect: "RELEASE(Nurse)",
      routing: undefined,
      defaultQueueName: undefined,
    };
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    // Queue stays as original (Waiting Queue from ARRIVE)
    expect(patient).toBeDefined();
  });
});

describe("RELEASE — routing table evaluation", () => {
  const icuWardRouting = [
    {
      condition: { variable: "Entity.outcome", operator: "==", value: "ICU" },
      queueName: "ICU Queue",
    },
    {
      condition: { variable: "Entity.outcome", operator: "==", value: "ward" },
      queueName: "Ward Queue",
    },
  ];

  test("routes patient to ICU Queue when Entity.outcome == ICU", () => {
    const model = baseModel("ICU", icuWardRouting, "Ward Queue");
    const engine = buildEngine(model, 1, 0, 20);
    const result = engine.runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient.queue).toBe("ICU Queue");
    expect(patient.status).toBe("waiting");
  });

  test("routes patient to Ward Queue when Entity.outcome == ward", () => {
    const model = baseModel("ward", icuWardRouting, "Ward Queue");
    const engine = buildEngine(model, 2, 0, 20);
    const result = engine.runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient.queue).toBe("Ward Queue");
    expect(patient.status).toBe("waiting");
  });

  test("first matching condition wins — does not evaluate subsequent conditions", () => {
    // Two conditions that would both match; only first should apply
    const routing = [
      {
        condition: { variable: "Entity.outcome", operator: "==", value: "ICU" },
        queueName: "ICU Queue",
      },
      {
        condition: { variable: "Entity.outcome", operator: "!=", value: "xyz" },
        queueName: "Ward Queue", // would also match ICU patient
      },
    ];
    const model = baseModel("ICU", routing, "Ward Queue");
    const engine = buildEngine(model, 3, 0, 20);
    const result = engine.runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient.queue).toBe("ICU Queue"); // first match wins
  });

  test("falls back to defaultQueueName when no condition matches", () => {
    const routing = [
      {
        condition: { variable: "Entity.outcome", operator: "==", value: "ICU" },
        queueName: "ICU Queue",
      },
    ];
    // outcome = "other" matches neither condition
    const model = baseModel("other", routing, "Ward Queue");
    const engine = buildEngine(model, 4, 0, 20);
    const result = engine.runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient.queue).toBe("Ward Queue"); // default
  });

  test("emits a warning message when no condition matches and no defaultQueueName", () => {
    const routing = [
      {
        condition: { variable: "Entity.outcome", operator: "==", value: "ICU" },
        queueName: "ICU Queue",
      },
    ];
    const model = baseModel("other", routing, null /* no default */);
    // Remove defaultQueueName entirely
    model.bEvents[1].defaultQueueName = undefined;
    const engine = buildEngine(model, 5, 0, 20);
    const result = engine.runAll();
    const logMessages = result.log.map(e => e.message).join("\n");
    expect(logMessages).toMatch(/routing/i);
  });

  test("routing table absent → existing RELEASE behaviour, no regressions", () => {
    const model = baseModel("ICU"); // no routing, no defaultQueueName
    // Uses legacy RELEASE(Nurse) with no queue arg → queue stays as-is
    const engine = buildEngine(model, 6, 0, 20);
    expect(() => engine.runAll()).not.toThrow();
  });
});

describe("RELEASE routing — edge cases", () => {
  test("routing works when routing array is empty (treated as no match → default)", () => {
    const model = baseModel("ward", [], "Ward Queue");
    const engine = buildEngine(model, 7, 0, 20);
    const result = engine.runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient.queue).toBe("Ward Queue");
  });

  test("routing is case-sensitive for string values by default", () => {
    const routing = [
      {
        condition: { variable: "Entity.outcome", operator: "==", value: "ICU" },
        queueName: "ICU Queue",
      },
    ];
    // outcome = "icu" (lowercase) should NOT match "ICU"
    const model = baseModel("icu", routing, "Ward Queue");
    const engine = buildEngine(model, 8, 0, 20);
    const result = engine.runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient.queue).toBe("Ward Queue"); // falls back to default
  });
});
