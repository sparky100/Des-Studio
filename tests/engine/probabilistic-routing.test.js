// tests/engine/probabilistic-routing.test.js — F10.2 probabilistic entity routing
//
// Two-layer approach per CLAUDE.md §22 (log-snapshot memory guidance):
//  1. Direct RNG test: 10,000 rolls of the routing algorithm using mulberry32
//     — fast, no engine overhead, verifies the 3% frequency spec.
//  2. Engine integration tests: small bounded runs (maxSimTime=5) that verify
//     the probabilistic routing block in fireBEvent is correctly wired.
import { describe, test, expect } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { mulberry32 }  from "../../src/engine/distributions.js";

// ── Direct distribution test ──────────────────────────────────────────────────
// Mirrors the selection loop in phases.js exactly.

function selectBranch(rng, branches) {
  const roll = rng();
  let cum = 0;
  let chosen = branches[branches.length - 1].queueName;
  for (const b of branches) {
    cum += b.probability;
    if (roll < cum) { chosen = b.queueName; break; }
  }
  return chosen;
}

describe("probabilistic branch selection — direct RNG (10,000 rolls)", () => {
  test("70/30 split is within 3% of expected over 10,000 rolls", () => {
    const rng = mulberry32(42);
    const branches = [
      { probability: 0.7, queueName: "Ward Queue" },
      { probability: 0.3, queueName: "ICU Queue"  },
    ];
    let ward = 0;
    for (let n = 0; n < 10000; n++) {
      if (selectBranch(rng, branches) === "Ward Queue") ward++;
    }
    expect(ward / 10000).toBeGreaterThan(0.67);
    expect(ward / 10000).toBeLessThan(0.73);
  });

  test("probability 1.0 always selects that branch", () => {
    const rng = mulberry32(7);
    const branches = [{ probability: 1.0, queueName: "ICU Queue" }];
    for (let n = 0; n < 100; n++) {
      expect(selectBranch(rng, branches)).toBe("ICU Queue");
    }
  });

  test("same seed produces identical sequence (rng threaded across calls)", () => {
    const branches = [
      { probability: 0.5, queueName: "Ward Queue" },
      { probability: 0.5, queueName: "ICU Queue"  },
    ];
    // Each sequence uses ONE rng instance, consuming successive values
    const rng1a = mulberry32(99); const seq1 = Array.from({ length: 20 }, () => selectBranch(rng1a, branches));
    const rng1b = mulberry32(99); const seq2 = Array.from({ length: 20 }, () => selectBranch(rng1b, branches));
    expect(seq1).toEqual(seq2);
  });

  test("different seeds produce different sequences", () => {
    const branches = [
      { probability: 0.5, queueName: "Ward Queue" },
      { probability: 0.5, queueName: "ICU Queue"  },
    ];
    const rng1 = mulberry32(11); const seq1 = Array.from({ length: 50 }, () => selectBranch(rng1, branches));
    const rng2 = mulberry32(22); const seq2 = Array.from({ length: 50 }, () => selectBranch(rng2, branches));
    expect(seq1).not.toEqual(seq2);
  });
});

// ── Engine integration tests ──────────────────────────────────────────────────
// One patient arrives at t=0, is served, then released with probabilistic routing.
// maxSimTime=5 keeps the entity pool to 1 entity and avoids memory growth.

function onePatientModel(branches) {
  return {
    entityTypes: [
      { id: "et-p", name: "Patient", role: "customer", attrDefs: [] },
      { id: "et-n", name: "Nurse",   role: "server",   count: "1", attrDefs: [] },
    ],
    queues: [
      { id: "q-wait", name: "Waiting Queue", discipline: "FIFO" },
      { id: "q-icu",  name: "ICU Queue",     discipline: "FIFO" },
      { id: "q-ward", name: "Ward Queue",    discipline: "FIFO" },
    ],
    bEvents: [
      {
        id: "be-arrive", name: "Patient Arrives", scheduledTime: "0",
        effect: "ARRIVE(Patient, Waiting Queue)", schedules: [],
      },
      {
        id: "be-release", name: "Released", scheduledTime: "9999",
        effect: "RELEASE(Nurse)",
        probabilisticRouting: branches,
        schedules: [],
      },
    ],
    cEvents: [{
      id: "ce-serve", name: "Start Service", priority: 1,
      condition: "queue(Patient).length > 0 AND idle(Nurse).count > 0",
      effect: "ASSIGN(Waiting Queue, Nurse)",
      cSchedules: [{ eventId: "be-release", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    }],
    stateVariables: [],
  };
}

describe("RELEASE — engine integration", () => {
  test("probability 1.0 routes single patient to ICU Queue", () => {
    const result = buildEngine(onePatientModel([{ probability: 1.0, queueName: "ICU Queue" }]), 1, 0, 5).runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient?.queue).toBe("ICU Queue");
    expect(patient?.status).toBe("waiting");
    expect(patient?.waitingFor).toEqual({
      kind: "queue",
      queueName: "ICU Queue",
      enteredAt: 1,
    });
  });

  test("probability 1.0 routes single patient to Ward Queue", () => {
    const result = buildEngine(onePatientModel([{ probability: 1.0, queueName: "Ward Queue" }]), 2, 0, 5).runAll();
    expect(result.entitySummary.find(e => e.role === "customer")?.queue).toBe("Ward Queue");
  });

  test("direct exit route records a per-sink count for the Execute canvas", () => {
    const result = buildEngine(onePatientModel([{ probability: 1.0, queueName: null }]), 3, 0, 5).runAll();
    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient?.status).toBe("done");
    expect(patient?.outcome).toEqual(expect.objectContaining({
      status: "completed",
      routeId: "route-exit:be-release",
      routeLabel: "Exit",
      endedBy: "direct-routing",
    }));
    expect(result.summary.outcomes["route-exit:be-release"]).toEqual(expect.objectContaining({
      routeLabel: "Exit",
      status: "completed",
      endedBy: "direct-routing",
      count: 1,
    }));
    expect(result.snap.eventCounts["be-release"]).toBe(1);
    expect(result.snap.eventCounts["route-exit:be-release"]).toBe(1);
  });

  test("same seed reproduces identical routing", () => {
    const branches = [{ probability: 0.5, queueName: "Ward Queue" }, { probability: 0.5, queueName: "ICU Queue" }];
    const q1 = buildEngine(onePatientModel(branches), 42, 0, 5).runAll().entitySummary.find(e => e.role === "customer")?.queue;
    const q2 = buildEngine(onePatientModel(branches), 42, 0, 5).runAll().entitySummary.find(e => e.role === "customer")?.queue;
    expect(q1).toBe(q2);
    expect(q1).toBeTruthy();
  });

  test("backward compat — B-event without probabilisticRouting unchanged", () => {
    const model = onePatientModel([]);
    model.bEvents[1].probabilisticRouting = undefined;
    model.bEvents[1].effect = "RELEASE(Nurse, Ward Queue)";
    const result = buildEngine(model, 5, 0, 5).runAll();
    expect(result.entitySummary.find(e => e.role === "customer")?.queue).toBe("Ward Queue");
  });
});
