import { describe, expect, it } from "vitest";
import {
  computeRunOverlaps,
  nodeRunRect,
  rectsOverlap,
  runFootprintSize,
} from "../../../src/ui/visual-designer/runFootprint.js";
import { deriveGraphFromModel } from "../../../src/ui/visual-designer/graph.js";
import {
  EXEC_CARD_WIDTH,
  EXEC_NODE_HEIGHT,
  EXEC_DEFAULT_HEIGHT,
} from "../../../src/ui/execute/executeLayout.js";

describe("runFootprintSize", () => {
  it("returns the rendered Run-card width and per-type heights", () => {
    expect(runFootprintSize("source")).toEqual({ width: EXEC_CARD_WIDTH, height: EXEC_NODE_HEIGHT.source });
    expect(runFootprintSize("queue")).toEqual({ width: EXEC_CARD_WIDTH, height: EXEC_NODE_HEIGHT.queue });
    expect(runFootprintSize("activity")).toEqual({ width: EXEC_CARD_WIDTH, height: EXEC_NODE_HEIGHT.activity });
    expect(runFootprintSize("sink")).toEqual({ width: EXEC_CARD_WIDTH, height: EXEC_NODE_HEIGHT.sink });
  });

  it("falls back to the default Run height for container/unknown types", () => {
    expect(runFootprintSize("container").height).toBe(EXEC_DEFAULT_HEIGHT);
    expect(runFootprintSize(undefined).height).toBe(EXEC_DEFAULT_HEIGHT);
  });
});

describe("nodeRunRect", () => {
  it("builds the rect from a graph node (top-level x/y and type)", () => {
    const rect = nodeRunRect({ id: "activity:a", type: "activity", x: 10, y: 20 });
    expect(rect).toEqual({
      left: 10, top: 20,
      right: 10 + EXEC_CARD_WIDTH, bottom: 20 + EXEC_NODE_HEIGHT.activity,
      width: EXEC_CARD_WIDTH, height: EXEC_NODE_HEIGHT.activity,
    });
  });

  it("builds the rect from a React Flow node (position + data.type wins over renderer type)", () => {
    const rect = nodeRunRect({ id: "queue:q", type: "desNode", position: { x: 5, y: 6 }, data: { type: "queue" } });
    expect(rect.left).toBe(5);
    expect(rect.top).toBe(6);
    expect(rect.height).toBe(EXEC_NODE_HEIGHT.queue);
  });
});

describe("rectsOverlap", () => {
  const base = { left: 0, top: 0, right: 100, bottom: 100 };
  it("does not flag rects that merely share an edge", () => {
    expect(rectsOverlap(base, { left: 100, top: 0, right: 200, bottom: 100 })).toBe(false);
  });
  it("flags rects that intersect", () => {
    expect(rectsOverlap(base, { left: 99, top: 99, right: 200, bottom: 200 })).toBe(true);
  });
  it("flags near-misses when a margin is set", () => {
    const gap5 = { left: 105, top: 0, right: 200, bottom: 100 };
    expect(rectsOverlap(base, gap5)).toBe(false);
    expect(rectsOverlap(base, gap5, 10)).toBe(true);
  });
});

describe("computeRunOverlaps", () => {
  it("flags the motivating case: a design-safe vertical pitch that collides on Run", () => {
    // 104px is the Draw dagre pitch (NODE_HEIGHT 68 + nodesep 36) — clean on
    // Draw, but the activity's Run card is 145 tall and swallows the queue.
    const nodes = [
      { id: "activity:a", type: "activity", x: 0, y: 0 },
      { id: "queue:q", type: "queue", x: 0, y: 104 },
    ];
    const result = computeRunOverlaps(nodes);
    expect(result.pairs).toEqual([{ aId: "activity:a", bId: "queue:q" }]);
    expect([...result.nodeIds].sort()).toEqual(["activity:a", "queue:q"]);
  });

  it("is clear once the vertical pitch reaches the Run height", () => {
    const nodes = [
      { id: "activity:a", type: "activity", x: 0, y: 0 },
      { id: "queue:q", type: "queue", x: 0, y: EXEC_NODE_HEIGHT.activity },
    ];
    expect(computeRunOverlaps(nodes).pairs).toEqual([]);
  });

  it("flags a horizontal pitch that fits Draw cards but not Run cards", () => {
    // 150px apart: fine for 142-wide Draw cards, colliding at Run's 160.
    const nodes = [
      { id: "queue:q", type: "queue", x: 0, y: 0 },
      { id: "activity:a", type: "activity", x: 150, y: 0 },
    ];
    expect(computeRunOverlaps(nodes).pairs.length).toBe(1);
    const clear = [
      { id: "queue:q", type: "queue", x: 0, y: 0 },
      { id: "activity:a", type: "activity", x: EXEC_CARD_WIDTH, y: 0 },
    ];
    expect(computeRunOverlaps(clear).pairs).toEqual([]);
    expect(computeRunOverlaps(clear, { margin: 10 }).pairs.length).toBe(1);
  });

  it("ignores section panels and handles empty input", () => {
    const nodes = [
      { id: "section-1", type: "sectionPanel", x: 0, y: 0 },
      { id: "queue:q", type: "queue", x: 0, y: 0 },
    ];
    expect(computeRunOverlaps(nodes).pairs).toEqual([]);
    expect(computeRunOverlaps([]).pairs).toEqual([]);
    expect(computeRunOverlaps(undefined).pairs).toEqual([]);
  });
});

describe("run-aware auto-layout", () => {
  it("dagre-lays-out a model with no saved graph so Run footprints never overlap", () => {
    // A fan-out model puts several nodes in the same dagre rank — the shape
    // that used to overlap on Run when boxes were reserved at Draw size.
    const model = {
      queues: [
        { id: "q-in", name: "Intake" },
        { id: "q-a", name: "Branch A" },
        { id: "q-b", name: "Branch B" },
        { id: "q-c", name: "Branch C" },
      ],
      bEvents: [
        { id: "arrive", name: "Arrivals", targetQueue: "Intake", dist: "Fixed", distParams: { value: "5" } },
      ],
      cEvents: [
        {
          id: "triage", name: "Triage", primaryQueue: "Intake",
          routing: [
            { targetQueue: "Branch A", probability: 0.4 },
            { targetQueue: "Branch B", probability: 0.3 },
            { targetQueue: "Branch C", probability: 0.3 },
          ],
          cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };
    const graph = deriveGraphFromModel(model);
    expect(graph.nodes.length).toBeGreaterThan(3);
    expect(computeRunOverlaps(graph.nodes).pairs).toEqual([]);
  });
});
