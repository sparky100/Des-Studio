import { describe, expect, it } from "vitest";
import { deriveGraphFromModel } from "../../../src/ui/visual-designer/graph.js";
import { twoStageClinicModel } from "../../__helpers__/twoStageModel.js";

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Sections that interleave in the flow: "Front" holds the first and last stages, "Middle" sits between them.
const interleaved = {
  ...twoStageClinicModel,
  sections: [
    { id: "front", name: "Front", color: "#4A90D9", memberIds: ["arrive", "consult-q", "start-consult", "consult-complete"] },
    { id: "middle", name: "Middle", color: "#27AE60", memberIds: ["triage-q", "start-triage", "triage-complete"] },
  ],
};

describe("section-aware automatic layout", () => {
  it("keeps section boxes from overlapping when sections interleave in the flow", () => {
    const graph = deriveGraphFromModel(interleaved);
    const panels = graph.sectionPanels;
    expect(panels).toHaveLength(2);
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        expect(overlaps(panels[i], panels[j])).toBe(false);
      }
    }
  });

  it("keeps every node clear of the other sections' boxes", () => {
    const graph = deriveGraphFromModel(interleaved);
    graph.nodes.filter(n => n.sectionId).forEach(node => {
      graph.sectionPanels
        .filter(p => p.sectionId !== node.sectionId)
        .forEach(panel => {
          expect(overlaps({ x: node.x, y: node.y, width: 160, height: 155 }, panel)).toBe(false);
        });
    });
  });

  it("keeps nodes exactly where a saved layout puts them", () => {
    const graph = deriveGraphFromModel({
      ...interleaved,
      graph: { nodes: [{ id: "queue:triage-q", type: "queue", refId: "triage-q", x: 500, y: 40 }] },
    });
    expect(graph.nodes.find(n => n.id === "queue:triage-q")).toMatchObject({ x: 500, y: 40 });
  });
});
