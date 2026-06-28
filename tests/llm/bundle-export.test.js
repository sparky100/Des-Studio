import { describe, it, expect } from "vitest";
import { buildLLMBundle } from "../../src/llm/bundleExport.js";

const model = {
  name: "Clinic",
  description: "A small outpatient clinic.",
  timeUnit: "minutes",
  entityTypes: [
    { name: "Patient", role: "customer", attrDefs: [{ name: "priority", valueType: "number", defaultValue: "1" }] },
    { name: "Nurse", role: "server", count: 2, attrDefs: [] },
  ],
  queues: [
    { name: "WaitingRoom", customerType: "Patient", discipline: "FIFO" },
  ],
  bEvents: [
    { name: "Arrival", effect: ["ARRIVE(Patient, WaitingRoom)"], schedules: [{ dist: "Exponential", distParams: { mean: "5" } }] },
  ],
  cEvents: [
    { name: "StartService", priority: 1, condition: "queue(WaitingRoom) > 0 AND Nurse.idle > 0", effect: ["ASSIGN(WaitingRoom, Nurse)"] },
  ],
  goals: [
    { label: "Wait < 10 min", metric: "avgWait", operator: "<", target: "10" },
  ],
};

const singleRepResults = {
  summary: {
    total: 100, served: 95, reneged: 5,
    avgWait: 7.42, avgSvc: 3.1, avgSojourn: 10.52, avgWIP: 1.3,
  },
  waitDist: {
    WaitingRoom: { n: 95, mean: 7.42, p50: 6.1, p90: 14.2, p95: 16.8, p99: 21.3 },
  },
  replications: [
    { replicationIndex: 1, seed: 42, summary: { served: 95, reneged: 5, avgWait: 7.42 } },
  ],
};

const multiRepResults = {
  ...singleRepResults,
  aggregateStats: {
    avgWait: { n: 10, mean: 7.42, lower: 6.9, upper: 7.94, halfWidth: 0.52 },
    served: { n: 10, mean: 95, lower: 92, upper: 98, halfWidth: 3 },
  },
  replications: Array.from({ length: 10 }, (_, i) => ({
    replicationIndex: i + 1,
    seed: 42 + i,
    summary: { served: 90 + i, reneged: 5, avgWait: 7 + i * 0.1 },
  })),
};

describe("buildLLMBundle", () => {
  it("produces a non-empty Markdown string with required top-level sections", () => {
    const bundle = buildLLMBundle(model, singleRepResults, { replications: 1, maxSimTime: 480 });
    expect(typeof bundle).toBe("string");
    expect(bundle).toContain("# simmodlr");
    expect(bundle).toContain("## Model Definition");
    expect(bundle).toContain("## Experiment Configuration");
    expect(bundle).toContain("## Results");
  });

  it("includes description but omits notes, even when notes is present", () => {
    const modelWithNotes = { ...model, notes: "Internal: excludes weekend shifts." };
    const bundle = buildLLMBundle(modelWithNotes, singleRepResults, { replications: 1 });
    expect(bundle).toContain("**Description:** A small outpatient clinic.");
    expect(bundle).not.toContain("**Notes:**");
    expect(bundle).not.toContain("Internal: excludes weekend shifts.");
  });

  it("contains Three-Phase method reference in the preamble", () => {
    const bundle = buildLLMBundle(model, singleRepResults, {});
    expect(bundle).toContain("Three-Phase");
    expect(bundle).toContain("Phase A");
    expect(bundle).toContain("Phase B");
    expect(bundle).toContain("Phase C");
  });

  it("omits the Confidence Intervals and Replication Summary sections for single-replication runs", () => {
    const bundle = buildLLMBundle(model, singleRepResults, { replications: 1 });
    expect(bundle).not.toContain("### Confidence Intervals");
    expect(bundle).not.toContain("## Replication Summary");
  });

  it("includes Confidence Intervals and Replication Summary for multi-replication runs", () => {
    const bundle = buildLLMBundle(model, multiRepResults, { replications: 10 });
    expect(bundle).toContain("### Confidence Intervals (95%)");
    expect(bundle).toContain("## Replication Summary");
    expect(bundle).toContain("avgWait");
    expect(bundle).toContain("6.90");
  });

  it("includes a Goals Assessment table when goals are defined", () => {
    const bundle = buildLLMBundle(model, multiRepResults, { replications: 10 });
    expect(bundle).toContain("### Goals Assessment");
    expect(bundle).toContain("Wait < 10 min");
    expect(bundle).toContain("PASS");
  });

  it("produces output that exceeds the 2000-word prompt cap without truncation", () => {
    const bundle = buildLLMBundle(model, multiRepResults, {
      runLabel: "Test run",
      replications: 10,
      maxSimTime: 480,
      warmupPeriod: 60,
      seed: 42,
      engineVersion: "7.2.0",
      prngAlgorithm: "mulberry32",
    });
    const wordCount = bundle.split(/\s+/).filter(Boolean).length;
    // Bundle must not have been cut at the 2000-word boundary
    expect(bundle.endsWith(" ...")).toBe(false);
    // Should contain well-formed pipe table rows (at least one)
    expect(bundle).toMatch(/^\|.+\|$/m);
    // Word count should be reasonable (not near-empty)
    expect(wordCount).toBeGreaterThan(100);
  });
});
