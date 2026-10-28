import { describe, expect, it } from "vitest";
import {
  addAssumption, addEvidence, attach, deleteRecord, detach, levelOf, removeBrokenLinks, updateRecord, uniqueId,
} from "../evidenceModelOps.js";

const base = () => ({
  entityTypes: [],
  queues: [{ id: "q1", name: "Triage", capacity: 5 }],
  bEvents: [{ id: "b1", name: "Arrive", schedules: [{ distName: "Exponential", distParams: { mean: "12" } }] }],
  evidence: [],
  assumptions: [],
  backingLinks: [],
});

describe("levelOf", () => {
  it("maps stored numbers to three levels, and a missing value to medium", () => {
    expect(levelOf(0.3)).toBe("low");
    expect(levelOf(0.6)).toBe("medium");
    expect(levelOf(0.9)).toBe("high");
    expect(levelOf(undefined)).toBe("medium");
  });
});

describe("uniqueId", () => {
  it("slugs the base and suffixes collisions", () => {
    const ids = new Set(["ev_audit_log"]);
    expect(uniqueId(ids, "ev_", "Audit log")).toBe("ev_audit_log_2");
    expect(uniqueId(new Set(), "as_", "")).toBe("as_item");
  });
});

describe("addEvidence and addAssumption", () => {
  it("add a record with a unique id and the given name", () => {
    const first = addEvidence(base(), { name: "Audit log", description: "Arrivals" });
    expect(first.record.id).toBe("ev_audit_log");
    expect(first.record.name).toBe("Audit log");
    const second = addEvidence(first.model, { name: "Audit log", description: "Again" });
    expect(second.record.id).toBe("ev_audit_log_2");
    expect(second.model.evidence).toHaveLength(2);
  });

  it("does not mutate the input model", () => {
    const m = base();
    addAssumption(m, { name: "FIFO", text: "First come" });
    expect(m.assumptions).toEqual([]);
  });

  it("store the given strength and confidence", () => {
    const { record } = addEvidence(base(), { name: "x", strength: 0.9 });
    expect(record.strength).toBe(0.9);
    const { record: a } = addAssumption(base(), { name: "y", text: "z", contested: true, confidence: 0.3 });
    expect(a).toMatchObject({ contested: true, confidence: 0.3 });
  });
});

describe("attach and detach", () => {
  it("attaches a record to a whole element", () => {
    const { model, record } = addEvidence(base(), { name: "Audit" });
    const next = attach(model, { recordType: "evidence", recordId: record.id, targetType: "queue", targetId: "q1" });
    expect(next.backingLinks).toHaveLength(1);
    expect(next.backingLinks[0]).toMatchObject({ recordType: "evidence", recordId: record.id, targetType: "queue", targetId: "q1" });
    expect(next.backingLinks[0]).not.toHaveProperty("targetPath");
  });

  it("attaches to one parameter, and keeps the whole-element link separate", () => {
    const { model, record } = addEvidence(base(), { name: "Audit" });
    const withWhole = attach(model, { recordType: "evidence", recordId: record.id, targetType: "queue", targetId: "q1" });
    const withParam = attach(withWhole, { recordType: "evidence", recordId: record.id, targetType: "queue", targetId: "q1", targetPath: "capacity" });
    expect(withParam.backingLinks).toHaveLength(2);
    expect(withParam.backingLinks[1].targetPath).toBe("capacity");
  });

  it("does nothing when the same record is attached to the same target twice", () => {
    const { model, record } = addEvidence(base(), { name: "Audit" });
    const target = { recordType: "evidence", recordId: record.id, targetType: "queue", targetId: "q1" };
    const once = attach(model, target);
    expect(attach(once, target)).toBe(once);
  });

  it("detach removes one link by id", () => {
    const { model, record } = addEvidence(base(), { name: "Audit" });
    const linked = attach(model, { recordType: "evidence", recordId: record.id, targetType: "queue", targetId: "q1" });
    const id = linked.backingLinks[0].id;
    expect(detach(linked, id).backingLinks).toEqual([]);
  });
});

describe("updateRecord and deleteRecord", () => {
  it("updateRecord changes only the named record", () => {
    const { model, record } = addAssumption(base(), { name: "A", text: "old" });
    const next = updateRecord(model, "assumption", record.id, { text: "new", contested: true });
    expect(next.assumptions[0]).toMatchObject({ text: "new", contested: true, name: "A" });
  });

  it("deleteRecord removes the record and its links, and leaves other links alone", () => {
    let m = base();
    const ev = addEvidence(m, { name: "Keep" });
    m = attach(ev.model, { recordType: "evidence", recordId: ev.record.id, targetType: "queue", targetId: "q1" });
    const as = addAssumption(m, { name: "Drop", text: "t" });
    m = attach(as.model, { recordType: "assumption", recordId: as.record.id, targetType: "b_event", targetId: "b1" });
    const after = deleteRecord(m, "assumption", as.record.id);
    expect(after.assumptions).toEqual([]);
    expect(after.evidence).toHaveLength(1);
    expect(after.backingLinks).toHaveLength(1);
    expect(after.backingLinks[0].recordType).toBe("evidence");
  });
});

describe("removeBrokenLinks", () => {
  it("removes links whose target no longer exists and keeps valid ones", () => {
    let m = base();
    const ev = addEvidence(m, { name: "Audit" });
    m = attach(ev.model, { recordType: "evidence", recordId: ev.record.id, targetType: "queue", targetId: "q1" });
    m = attach(m, { recordType: "evidence", recordId: ev.record.id, targetType: "queue", targetId: "gone" });
    const cleaned = removeBrokenLinks(m);
    expect(cleaned.backingLinks).toHaveLength(1);
    expect(cleaned.backingLinks[0].targetId).toBe("q1");
  });

  it("returns the same model when nothing is broken", () => {
    const m = base();
    expect(removeBrokenLinks(m)).toBe(m);
  });
});
