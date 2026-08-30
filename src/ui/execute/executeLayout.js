// Execute-canvas Dagre layout — separate from the visual designer's layout.
// Uses the one fixed card size every node type actually renders at, so
// nodes in the same column are centre-aligned and don't overlap.
import dagre from "@dagrejs/dagre";

export const EXEC_NODE_WIDTH = 180;   // 160 px card + 20 px breathing room
export const EXEC_CARD_WIDTH = 160;   // width every Execute*Node card actually renders
// Height every Execute*Node card actually renders — all four node types
// (source/queue/activity/sink) are pinned to this one fixed height (content
// that would need more room is capped/scrolled, not grown; see e.g.
// ExecuteActivityNode's row cap), the same fixed-box discipline the Draw
// canvas's own NODE_WIDTH/NODE_HEIGHT already use (src/ui/visual-designer/graph.js,
// which derives its own NODE_HEIGHT from this constant). Used below both to
// reserve Dagre's per-node layout slot and to centre nodes in their column.
export const EXEC_CARD_HEIGHT = 155;
const EXEC_RANK_SEP   = 80;    // horizontal gap between columns
const EXEC_NODE_SEP   = 50;    // vertical gap between nodes in the same column
const EXEC_MARGIN_X   = 60;
const EXEC_MARGIN_Y   = 60;

// ── Canvas auto-fill height (F9C.9) ──────────────────────────────────────────
// Shared by ExecuteCanvas.jsx and the Draw canvas (FlowDiagramReactFlow.jsx) —
// a pure, component-free module (per ADR-020: Execute *components* don't cross
// into the designer, but sharing pure layout utilities through this neutral
// module is the same established pattern EXEC_CARD_WIDTH/HEIGHT above already
// use). Each caller passes its own reservedBottom (how much chrome sits below
// its own canvas), since that differs between the two surfaces.
const CANVAS_FILL_FLOOR = 280;
// Default reserved-bottom — space for Execute's collapsed BottomPanel bar +
// layout gap. Callers with different chrome below their canvas (e.g. Draw)
// should pass their own value explicitly rather than relying on this default.
const CANVAS_RESERVED_BOTTOM = 64;

/**
 * How tall a canvas should be to fill the remaining viewport below it.
 * Pure so it's directly testable without mounting ReactFlow.
 */
export function computeCanvasFillHeight(topOffset, viewportHeight, reservedBottom = CANVAS_RESERVED_BOTTOM) {
  if (!Number.isFinite(topOffset) || !Number.isFinite(viewportHeight)) return null;
  return Math.max(CANVAS_FILL_FLOOR, viewportHeight - topOffset - reservedBottom);
}

/**
 * Produces execute-canvas node positions.
 * Saved x/y from the visual designer are preserved whenever present.
 * For nodes without saved positions, a Dagre left-to-right layout is used.
 */
export function computeExecuteLayout(nodes, edges) {
  if (!nodes?.length) return nodes ?? [];

  const withSaved = nodes.map(node => {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) return node;
    return null;
  });
  const savedCount = withSaved.filter(Boolean).length;
  if (savedCount === nodes.length) return withSaved;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir:   "LR",
    ranksep:   EXEC_RANK_SEP,
    nodesep:   EXEC_NODE_SEP,
    marginx:   EXEC_MARGIN_X,
    marginy:   EXEC_MARGIN_Y,
    acyclicer: "greedy",
    ranker:    "network-simplex",
  });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(node =>
    g.setNode(node.id, { width: EXEC_NODE_WIDTH, height: EXEC_CARD_HEIGHT })
  );

  (edges ?? []).forEach(edge => {
    if (!edge.loop && g.hasNode(edge.from) && g.hasNode(edge.to))
      g.setEdge(edge.from, edge.to);
  });

  dagre.layout(g);

  return nodes.map(node => {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) return node;
    const pos = g.node(node.id);
    return {
      ...node,
      x: pos ? Math.round(pos.x - EXEC_NODE_WIDTH / 2)   : EXEC_MARGIN_X,
      y: pos ? Math.round(pos.y - EXEC_CARD_HEIGHT / 2)  : EXEC_MARGIN_Y,
    };
  });
}
