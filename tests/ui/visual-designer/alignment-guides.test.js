import { describe, expect, it } from "vitest";
import { computeAlignmentGuides, nodeBounds } from "../../../src/ui/visual-designer/alignmentGuides.js";
import { NODE_WIDTH, NODE_HEIGHT } from "../../../src/ui/visual-designer/graph.js";

function node(id, x, y, overrides = {}) {
  return { id, type: "desNode", position: { x, y }, ...overrides };
}

describe("nodeBounds", () => {
  it("falls back to NODE_WIDTH/NODE_HEIGHT when a node hasn't been measured yet", () => {
    const b = nodeBounds(node("a", 10, 20));
    expect(b).toEqual({ left: 10, top: 20, right: 10 + NODE_WIDTH, bottom: 20 + NODE_HEIGHT, width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  it("prefers .measured dimensions over the NODE_WIDTH/NODE_HEIGHT fallback", () => {
    const b = nodeBounds(node("a", 0, 0, { measured: { width: 300, height: 90 } }));
    expect(b.width).toBe(300);
    expect(b.height).toBe(90);
  });
});

describe("computeAlignmentGuides", () => {
  it("returns no guides and an unchanged position when nothing aligns", () => {
    const dragged = node("dragged", 0, 0);
    const other = node("other", 500, 500);
    const { guides, snappedPosition } = computeAlignmentGuides(dragged, [other], 1);
    expect(guides).toEqual([]);
    expect(snappedPosition).toEqual({ x: 0, y: 0 });
  });

  it("produces a vertical guide and snaps x when left edges align within threshold", () => {
    // Dragged node's left edge (x=102) is 2px off from other's left edge (x=100) — within the 6px/zoom threshold.
    const dragged = node("dragged", 102, 0);
    const other = node("other", 100, 300);
    const { guides, snappedPosition } = computeAlignmentGuides(dragged, [other], 1);
    expect(guides).toHaveLength(1);
    expect(guides[0]).toMatchObject({ orientation: "vertical", position: 100 });
    expect(snappedPosition.x).toBe(100);
    expect(snappedPosition.y).toBe(0); // y-axis untouched — no vertical alignment found
  });

  it("produces a horizontal guide when top edges align", () => {
    const dragged = node("dragged", 0, 0);
    const other = node("other", 300, 0);
    const { guides } = computeAlignmentGuides(dragged, [other], 1);
    const horizontal = guides.filter(g => g.orientation === "horizontal");
    expect(horizontal).toHaveLength(1);
    expect(horizontal[0].position).toBe(0);
  });

  it("finds a center-to-center match distinct from either node's edges", () => {
    // dragged: top=0, height=68 (default) => center=34.
    // other: top=14, height=40 (measured) => center=34 — centers coincide exactly,
    // while every top/bottom combination between the two is >6px apart, so this
    // can only be a center-to-center match, not a coincidental edge match.
    const dragged = node("dragged", 0, 0);
    const other = node("other", 300, 14, { measured: { width: NODE_WIDTH, height: 40 } });
    const { guides } = computeAlignmentGuides(dragged, [other], 1);
    const horizontal = guides.find(g => g.orientation === "horizontal");
    expect(horizontal).toBeDefined();
    expect(horizontal.position).toBe(34);
  });

  it("adjusts the snap threshold by zoom — a 5px delta matches at zoom=1 but not at zoom=2", () => {
    const dragged = node("dragged", 105, 0);
    const other = node("other", 100, 300);

    const atZoom1 = computeAlignmentGuides(dragged, [other], 1);
    expect(atZoom1.guides.some(g => g.orientation === "vertical")).toBe(true);

    const atZoom2 = computeAlignmentGuides(dragged, [other], 2);
    expect(atZoom2.guides.some(g => g.orientation === "vertical")).toBe(false);
  });

  it("excludes sectionPanel nodes from being alignment targets", () => {
    const dragged = node("dragged", 100, 0);
    const sectionPanel = node("panel", 100, 300, { type: "sectionPanel" });
    const { guides, snappedPosition } = computeAlignmentGuides(dragged, [sectionPanel], 1);
    expect(guides).toEqual([]);
    expect(snappedPosition).toEqual({ x: 100, y: 0 });
  });

  it("ignores a candidate exactly at the threshold boundary (strict less-than)", () => {
    // Effective threshold at zoom=1 is exactly 6px — a 6px delta should NOT match (Math.abs(delta) < threshold).
    const dragged = node("dragged", 106, 0);
    const other = node("other", 100, 300);
    const { guides } = computeAlignmentGuides(dragged, [other], 1);
    expect(guides.some(g => g.orientation === "vertical")).toBe(false);
  });

  it("extends the guide line to overhang past both nodes' bounds", () => {
    const dragged = node("dragged", 100, 50);
    const other = node("other", 100, 400);
    const { guides } = computeAlignmentGuides(dragged, [other], 1);
    const vertical = guides.find(g => g.orientation === "vertical");
    expect(vertical.from).toBeLessThan(Math.min(50, 400));
    expect(vertical.to).toBeGreaterThan(Math.max(50 + NODE_HEIGHT, 400 + NODE_HEIGHT));
  });

  it("snap-at-drop is the same function applied to the final drop position", () => {
    // This is exactly what FlowDiagramReactFlow.jsx's onNodeDragStop does: call
    // computeAlignmentGuides again with the node's final position and commit
    // snappedPosition instead of the raw drop position when within threshold.
    const droppedAt = node("dragged", 103, 0); // 3px off from other's x=100
    const other = node("other", 100, 300);
    const { snappedPosition } = computeAlignmentGuides(droppedAt, [other], 1);
    expect(snappedPosition.x).toBe(100);

    const droppedFar = node("dragged", 400, 0); // far from any target
    const { snappedPosition: unsnapped } = computeAlignmentGuides(droppedFar, [other], 1);
    expect(unsnapped.x).toBe(400);
  });
});
