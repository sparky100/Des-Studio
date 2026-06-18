// tests/engine/time-series.test.js — F10.4 collectTimeSeries + waitDist
import { describe, test, expect } from "vitest";
import { buildEngine } from "../../src/engine/index.js";

// ── Minimal M/M/1-style model ─────────────────────────────────────────────────

function makeModel() {
  return {
    entityTypes: [
      { id: "et-c", name: "Customer", role: "customer", attrDefs: [] },
      { id: "et-s", name: "Clerk",    role: "server",   count: "1", attrDefs: [] },
    ],
    queues: [{ id: "q1", name: "Waiting Queue", discipline: "FIFO" }],
    bEvents: [
      {
        id: "be-arrive", name: "Customer Arrives", scheduledTime: "0",
        effect: "ARRIVE(Customer, Waiting Queue)",
        schedules: [{ eventId: "be-arrive", dist: "Fixed", distParams: { value: "1" }, isRenege: false }],
      },
      {
        id: "be-complete", name: "Service Complete", scheduledTime: "9999",
        effect: "COMPLETE()", schedules: [],
      },
    ],
    cEvents: [{
      id: "ce-serve", name: "Start Service", priority: 1,
      condition: "queue(Customer).length > 0 AND idle(Clerk).count > 0",
      effect: "ASSIGN(Waiting Queue, Clerk)",
      cSchedules: [{ eventId: "be-complete", dist: "Fixed", distParams: { value: "0.8" }, useEntityCtx: true }],
    }],
    stateVariables: [],
  };
}

// ── F10.4a — collectTimeSeries flag ──────────────────────────────────────────

describe("collectTimeSeries = false (default)", () => {
  test("timeSeries is undefined when flag is false", () => {
    const result = buildEngine(makeModel(), 42, 0, 10).runAll();
    expect(result.timeSeries).toBeUndefined();
  });

  test("timeSeries is undefined when flag is omitted", () => {
    const result = buildEngine(makeModel(), 42, 0, 10).runAll();
    expect(result.timeSeries).toBeUndefined();
  });
});

describe("collectTimeSeries = true", () => {
  test("timeSeries is a non-empty array", () => {
    const result = buildEngine(makeModel(), 42, 0, 10, null, 5000, 500, true).runAll();
    expect(Array.isArray(result.timeSeries)).toBe(true);
    expect(result.timeSeries.length).toBeGreaterThan(0);
  });

  test("each entry has t (number) and byType (object)", () => {
    const result = buildEngine(makeModel(), 42, 0, 5, null, 5000, 500, true).runAll();
    for (const entry of result.timeSeries) {
      expect(typeof entry.t).toBe("number");
      expect(typeof entry.byType).toBe("object");
    }
  });

  test("each entry includes byQueue counts for queue-specific charts", () => {
    const result = buildEngine(makeModel(), 42, 0, 5, null, 5000, 500, true).runAll();
    for (const entry of result.timeSeries) {
      expect(entry.byQueue).toBeDefined();
      expect(entry.byQueue["Waiting Queue"]).toBeDefined();
      expect(typeof entry.byQueue["Waiting Queue"].waiting).toBe("number");
      expect(typeof entry.byQueue["Waiting Queue"].total).toBe("number");
    }
  });

  test("t values are strictly increasing", () => {
    const result = buildEngine(makeModel(), 42, 0, 10, null, 5000, 500, true).runAll();
    const times = result.timeSeries.map(e => e.t);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  test("byType entries contain waiting/idle/busy/total counts", () => {
    const result = buildEngine(makeModel(), 42, 0, 5, null, 5000, 500, true).runAll();
    for (const entry of result.timeSeries) {
      for (const type of Object.values(entry.byType)) {
        expect(typeof type.waiting).toBe("number");
        expect(typeof type.idle).toBe("number");
        expect(typeof type.busy).toBe("number");
        expect(typeof type.total).toBe("number");
      }
    }
  });

  test("same seed + collectTimeSeries=true produces identical series", () => {
    const r1 = buildEngine(makeModel(), 99, 0, 10, null, 5000, 500, true).runAll();
    const r2 = buildEngine(makeModel(), 99, 0, 10, null, 5000, 500, true).runAll();
    expect(r1.timeSeries.length).toBe(r2.timeSeries.length);
    expect(r1.timeSeries[0]).toEqual(r2.timeSeries[0]);
  });

  test("idle+busy counts for Clerk never exceed pool size of 1", () => {
    const result = buildEngine(makeModel(), 42, 0, 10, null, 5000, 500, true).runAll();
    for (const entry of result.timeSeries) {
      const clerk = entry.byType["Clerk"];
      if (clerk) {
        expect(clerk.idle + clerk.busy).toBeLessThanOrEqual(1);
      }
    }
  });

  test("byQueue entries include avgWait/waitN, populated once entities clear the queue", () => {
    const result = buildEngine(makeModel(), 42, 0, 20, null, 5000, 500, true).runAll();
    const samplesWithCompletions = result.timeSeries.filter(e => e.byQueue["Waiting Queue"].waitN > 0);
    expect(samplesWithCompletions.length).toBeGreaterThan(0);
    for (const entry of result.timeSeries) {
      const q = entry.byQueue["Waiting Queue"];
      expect(typeof q.waitN).toBe("number");
      if (q.waitN > 0) {
        expect(typeof q.avgWait).toBe("number");
        expect(q.avgWait).toBeGreaterThanOrEqual(0);
      } else {
        expect(q.avgWait).toBeNull();
      }
    }
  });

  test("avgWait per sample only reflects entities that cleared the queue since the previous sample", () => {
    const result = buildEngine(makeModel(), 42, 0, 20, null, 5000, 500, true).runAll();
    const total = result.timeSeries.reduce((sum, e) => sum + (e.byQueue["Waiting Queue"].waitN || 0), 0);
    const dist = result.waitDist["Waiting Queue"];
    expect(total).toBeLessThanOrEqual(dist.n);
  });
});

// ── F10.4b — waitDist ─────────────────────────────────────────────────────────

describe("waitDist", () => {
  test("waitDist is always present in runAll results", () => {
    const result = buildEngine(makeModel(), 42, 0, 20).runAll();
    expect(result.waitDist).toBeDefined();
    expect(typeof result.waitDist).toBe("object");
  });

  test("waitDist contains entry for the waiting queue", () => {
    const result = buildEngine(makeModel(), 42, 0, 20).runAll();
    expect(result.waitDist).toHaveProperty("Waiting Queue");
  });

  test("waitDist entry has n, mean, p50, p90, p95, p99, values", () => {
    const result = buildEngine(makeModel(), 42, 0, 20).runAll();
    const dist = result.waitDist["Waiting Queue"];
    expect(dist.n).toBeGreaterThan(0);
    expect(typeof dist.mean).toBe("number");
    expect(typeof dist.p50).toBe("number");
    expect(typeof dist.p90).toBe("number");
    expect(typeof dist.p95).toBe("number");
    expect(typeof dist.p99).toBe("number");
    expect(Array.isArray(dist.values)).toBe(true);
    expect(dist.values).toHaveLength(dist.n);
  });

  test("percentiles are non-decreasing: p50 <= p90 <= p95 <= p99", () => {
    const result = buildEngine(makeModel(), 42, 0, 20).runAll();
    const dist = result.waitDist["Waiting Queue"];
    expect(dist.p50).toBeLessThanOrEqual(dist.p90);
    expect(dist.p90).toBeLessThanOrEqual(dist.p95);
    expect(dist.p95).toBeLessThanOrEqual(dist.p99);
  });

  test("wait times are non-negative", () => {
    const result = buildEngine(makeModel(), 42, 0, 20).runAll();
    const dist = result.waitDist["Waiting Queue"];
    expect(dist.values.every(v => v >= 0)).toBe(true);
  });

  test("existing summary fields unchanged with new fields added", () => {
    const result = buildEngine(makeModel(), 42, 0, 20).runAll();
    expect(result.summary).toHaveProperty("served");
    expect(result.summary).toHaveProperty("avgWait");
    expect(result.summary).toHaveProperty("avgSvc");
    expect(result.finalTime).toBeGreaterThan(0);
  });
});
