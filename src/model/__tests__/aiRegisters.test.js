import { describe, expect, it } from "vitest";
import { mergeAiRegisters } from "../aiRegisters.js";

const current = () => ({
  evidence: [{ id: "ev_audit", name: "Audit", type: "data", description: "d" }],
  assumptions: [{ id: "as_fifo", name: "FIFO", text: "First come", contested: false }],
  backingLinks: [{ id: "bl_1", recordType: "evidence", recordId: "ev_audit", targetType: "b_event", targetId: "b1" }],
});

describe("mergeAiRegisters", () => {
  it("never takes evidence from the AI, even when it proposes some", () => {
    const merged = mergeAiRegisters(current(), {
      evidence: [{ id: "ev_invented", name: "Study 2019", type: "literature", description: "made up" }],
    });
    expect(merged.evidence.map(e => e.id)).toEqual(["ev_audit"]);
  });

  it("adds new assumptions and keeps the modeller's existing ones", () => {
    const merged = mergeAiRegisters(current(), {
      assumptions: [
        { id: "as_fifo", name: "Overwritten?", text: "changed" },
        { id: "as_new", name: "No balking", text: "Patients do not balk." },
      ],
    });
    expect(merged.assumptions.map(a => a.id)).toEqual(["as_fifo", "as_new"]);
    expect(merged.assumptions[0].name).toBe("FIFO");
  });

  it("adds assumption links only when they point at a known assumption", () => {
    const merged = mergeAiRegisters(current(), {
      assumptions: [{ id: "as_new", name: "x", text: "y" }],
      backingLinks: [
        { id: "bl_a", recordType: "assumption", recordId: "as_new", targetType: "queue", targetId: "q1" },
        { id: "bl_b", recordType: "assumption", recordId: "nope", targetType: "queue", targetId: "q1" },
        { id: "bl_c", recordType: "evidence", recordId: "ev_audit", targetType: "queue", targetId: "q1" },
      ],
    });
    expect(merged.backingLinks.map(l => l.id)).toEqual(["bl_1", "bl_a"]);
  });

  it("returns the modeller's own registers unchanged when the AI proposes none", () => {
    const merged = mergeAiRegisters(current(), {});
    expect(merged).toEqual(current());
  });
});
