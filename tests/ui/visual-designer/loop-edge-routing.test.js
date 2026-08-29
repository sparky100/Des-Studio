import { describe, expect, it } from "vitest";
import { computeLoopRailYById, LOOP_LANE_GAP, LOOP_LANE_SPACING } from "../../../src/ui/visual-designer/loopEdgeRouting.js";
import { NODE_HEIGHT } from "../../../src/ui/visual-designer/graph.js";

describe("computeLoopRailYById", () => {
  it("returns an empty map when there are no loop edges", () => {
    const nodes = [{ id: "a", y: 0 }, { id: "b", y: 100 }];
    const edges = [{ id: "e1", from: "a", to: "b" }];
    expect(computeLoopRailYById(nodes, edges).size).toBe(0);
  });

  it("routes a single loop edge to a rail below the lowest node's bottom edge", () => {
    const nodes = [{ id: "a", y: 0 }, { id: "b", y: 200 }, { id: "c", y: 400 }];
    const edges = [{ id: "loop1", from: "c", to: "a", loop: true }];
    const railYById = computeLoopRailYById(nodes, edges);
    expect(railYById.size).toBe(1);
    const railY = railYById.get("loop1");
    const maxBottom = 400 + NODE_HEIGHT;
    expect(railY).toBe(maxBottom + LOOP_LANE_GAP);
    // Regression guard: the rail must clear every node's bottom edge.
    nodes.forEach(n => expect(railY).toBeGreaterThan(n.y + NODE_HEIGHT));
  });

  it("stacks multiple loop edges into distinct, non-overlapping lanes", () => {
    const nodes = [{ id: "a", y: 0 }, { id: "b", y: 50 }];
    const edges = [
      { id: "loop1", from: "a", to: "b", loop: true },
      { id: "loop2", from: "b", to: "a", loop: true },
    ];
    const railYById = computeLoopRailYById(nodes, edges);
    expect(railYById.size).toBe(2);
    const [y1, y2] = [railYById.get("loop1"), railYById.get("loop2")];
    expect(y1).not.toBe(y2);
    expect(Math.abs(y1 - y2)).toBe(LOOP_LANE_SPACING);
    const maxBottom = 50 + NODE_HEIGHT;
    [y1, y2].forEach(y => expect(y).toBeGreaterThan(maxBottom));
  });

  it("ignores non-loop edges when computing the max node bottom is irrelevant to their presence", () => {
    const nodes = [{ id: "a", y: 0 }];
    const edges = [
      { id: "forward", from: "a", to: "b" },
      { id: "loop1", from: "b", to: "a", loop: true },
    ];
    const railYById = computeLoopRailYById(nodes, edges);
    expect(railYById.has("forward")).toBe(false);
    expect(railYById.has("loop1")).toBe(true);
  });
});
