import { describe, expect, it } from "vitest";
import { backingRegisterWarnings } from "../backing-warnings.js";
import { validateModel } from "../validation.js";

const NOW = new Date("2026-10-28T00:00:00Z");
const bEvent = () => ({
  id: "b1", name: "Arrive", effect: ["ARRIVE(Patient, Triage)"], scheduledTime: "0",
  schedules: [{ distName: "Exponential", distParams: { mean: "12" } }],
});
const model = (extra = {}) => ({
  entityTypes: [], stateVariables: [], cEvents: [], goals: [],
  queues: [{ id: "q1", name: "Triage", capacity: 5 }],
  bEvents: [bEvent()],
  evidence: [], assumptions: [], backingLinks: [],
  ...extra,
});
const codes = ws => ws.map(w => w.code);

describe("no new warnings on models without records", () => {
  it("a model with no evidence, assumptions or links produces none", () => {
    expect(backingRegisterWarnings(model(), NOW)).toEqual([]);
  });
});

describe("V-BACK-01 broken links", () => {
  it("reports a link whose target no longer exists", () => {
    const m = model({
      evidence: [{ id: "ev1", name: "Audit", type: "data", description: "d", source: "" }],
      backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "queue", targetId: "gone" }],
    });
    const w = backingRegisterWarnings(m, NOW).find(x => x.code === "V-BACK-01");
    expect(w).toBeTruthy();
    expect(w.message).toMatch(/^Backing link is broken/);
    expect(w.affectedIds.backingLinkIds).toEqual(["bl1"]);
    expect(w.tab).toBe("evidence");
  });
});

describe("V-BACK-02 orphaned records", () => {
  it("reports a record that backs nothing, by its name", () => {
    const m = model({ assumptions: [{ id: "as1", name: "FIFO", text: "First come", contested: false }] });
    const w = backingRegisterWarnings(m, NOW).find(x => x.code === "V-BACK-02");
    expect(w.message).toBe("Assumption 'FIFO' is not attached to anything.");
  });
});

describe("V-BACK-03 stale evidence", () => {
  it("reports evidence last verified more than 12 months ago", () => {
    const m = model({
      evidence: [{ id: "ev1", name: "Old", type: "data", lastVerified: "2025-01-01", description: "d", source: "" }],
      backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "queue", targetId: "q1" }],
    });
    const w = backingRegisterWarnings(m, NOW).find(x => x.code === "V-BACK-03");
    expect(w.message).toMatch(/^Evidence 'Old' was last verified \d+ months ago/);
  });

  it("does not report recent evidence", () => {
    const m = model({
      evidence: [{ id: "ev1", name: "New", type: "data", lastVerified: "2026-09-01", description: "d", source: "" }],
      backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "queue", targetId: "q1" }],
    });
    expect(codes(backingRegisterWarnings(m, NOW))).not.toContain("V-BACK-03");
  });
});

describe("V-BACK-04 contested assumption on a key parameter", () => {
  it("names the arrival parameter a contested assumption sets", () => {
    const m = model({
      assumptions: [{ id: "as1", name: "Triage order", text: "FIFO", contested: true, confidence: 0.3 }],
      backingLinks: [{ id: "bl1", recordType: "assumption", recordId: "as1", targetType: "b_event", targetId: "b1", targetPath: "schedules[0].distParams.mean" }],
    });
    const w = backingRegisterWarnings(m, NOW).find(x => x.code === "V-BACK-04");
    expect(w.message).toMatch(/^Assumption 'Triage order' is contested and sets 1 arrival or capacity parameter: /);
  });

  it("ignores a contested assumption on a parameter that is not arrival or capacity", () => {
    const m = model({
      assumptions: [{ id: "as1", name: "Routing", text: "t", contested: true }],
      backingLinks: [{ id: "bl1", recordType: "assumption", recordId: "as1", targetType: "queue", targetId: "q1", targetPath: "balkProbability" }],
    });
    expect(codes(backingRegisterWarnings(m, NOW))).not.toContain("V-BACK-04");
  });
});

describe("V-BACK-05 key parameters with no backing", () => {
  it("counts unbacked arrival and capacity parameters once, when records exist", () => {
    const m = model({
      evidence: [{ id: "ev1", name: "Audit", type: "data", description: "d", source: "" }],
      backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "queue", targetId: "q1" }],
    });
    // The queue's capacity is backed through its element-wide link. The
    // B-event's arrival mean is not, so exactly one key parameter is unbacked.
    const w = backingRegisterWarnings(m, NOW).find(x => x.code === "V-BACK-05");
    expect(w.message).toMatch(/^Evidence coverage: 1 arrival or capacity parameter has no evidence/);
  });

  it("is suppressed when there are no records at all", () => {
    const m = model({
      backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "missing", targetType: "queue", targetId: "q1" }],
    });
    expect(codes(backingRegisterWarnings(m, NOW))).not.toContain("V-BACK-05");
  });
});

describe("validateModel includes the register warnings", () => {
  it("adds V-BACK warnings to validateModel's output, never errors", () => {
    const m = model({ assumptions: [{ id: "as1", name: "Orphan", text: "t", contested: false }] });
    const { errors, warnings } = validateModel(m);
    expect(warnings.map(w => w.code)).toContain("V-BACK-02");
    expect(errors.map(e => e.code)).not.toContain("V-BACK-02");
  });
});
