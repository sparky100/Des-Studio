import { describe, expect, it } from "vitest";
import { deriveGraphFromModel, findOverlappingSections } from "../../../src/ui/visual-designer/graph.js";
import { tidySectionsModel } from "../../../src/ui/visual-designer/graph-operations.js";
import { twoStageClinicModel } from "../../__helpers__/twoStageModel.js";

const interleaved = {
  ...twoStageClinicModel,
  sections: [
    { id: "front", name: "Front", color: "#4A90D9", memberIds: ["arrive", "consult-q", "start-consult", "consult-complete"] },
    { id: "middle", name: "Middle", color: "#27AE60", memberIds: ["triage-q", "start-triage", "triage-complete"] },
  ],
};

describe("Tidy sections", () => {
  it("re-lays out so no section boxes overlap, and only changes positions", () => {
    const derived = deriveGraphFromModel(interleaved);
    const tidied = tidySectionsModel(interleaved, derived);

    expect(tidied.sections).toEqual(interleaved.sections);
    expect(tidied.queues).toEqual(interleaved.queues);
    expect(tidied.graph.nodes.length).toBeGreaterThan(0);

    const after = deriveGraphFromModel(tidied);
    expect(findOverlappingSections(after.sectionPanels)).toEqual([]);
  });

  it("does nothing to a projected (collapsed) view", () => {
    const derived = { ...deriveGraphFromModel(interleaved), displayProjection: true };
    expect(tidySectionsModel(interleaved, derived)).toBe(interleaved);
  });
});

describe("findOverlappingSections", () => {
  const panel = (name, x, y, width, height) => ({ name, x, y, width, height });

  it("reports pairs of panels whose boxes intersect", () => {
    const overlaps = findOverlappingSections([
      panel("A", 0, 0, 100, 100),
      panel("B", 50, 50, 100, 100),
      panel("C", 500, 0, 100, 100),
    ]);
    expect(overlaps).toEqual([{ a: "A", b: "B" }]);
  });

  it("does not count panels that only touch at an edge", () => {
    expect(findOverlappingSections([panel("A", 0, 0, 100, 100), panel("B", 100, 0, 100, 100)])).toEqual([]);
  });
});
