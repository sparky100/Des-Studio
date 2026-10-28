import { describe, it, expect } from "vitest";
import { validateModel } from "../../src/engine/validation.js";
import { summarizeSectionContents } from "../../src/ui/visual-designer/graph.js";

const base = {
  entityTypes: [{ id: "et1", name: "Customer", role: "customer", count: 0, attrDefs: [] }],
  queues: [{ id: "q1", name: "Q", customerType: "Customer", discipline: "FIFO" }],
  bEvents: [], cEvents: [], stateVariables: [],
};

describe("V82 — one section per element", () => {
  it("warns when an element is in two sections", () => {
    const { warnings } = validateModel({ ...base, sections: [
      { id: "a", name: "Front", memberIds: ["q1"] },
      { id: "b", name: "Back", memberIds: ["q1"] },
    ] });
    const w = warnings.filter(x => x.code === "V82");
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain("Front, Back");
  });

  it("is silent when every element has one section", () => {
    const { warnings } = validateModel({ ...base, sections: [
      { id: "a", name: "Front", memberIds: ["q1"] },
      { id: "b", name: "Back", memberIds: ["et1"] },
    ] });
    expect(warnings.some(x => x.code === "V82")).toBe(false);
  });
});

describe("summarizeSectionContents", () => {
  it("reads like a process, in flow order", () => {
    const nodes = [{ type: "queue" }, { type: "queue" }, { type: "activity" }, { type: "activity" }, { type: "activity" }, { type: "sink" }];
    expect(summarizeSectionContents(nodes)).toBe("2 queues · 3 activities · 1 exit");
  });
});
