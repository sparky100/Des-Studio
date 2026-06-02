// Execute-canvas Dagre layout — separate from the visual designer's layout.
// Uses per-type height estimates that match the actual rendered card sizes,
// so nodes in the same column are centre-aligned and don't overlap.
import dagre from "@dagrejs/dagre";

const EXEC_NODE_WIDTH = 180;   // 160 px card + 20 px breathing room
const EXEC_RANK_SEP   = 80;    // horizontal gap between columns
const EXEC_NODE_SEP   = 50;    // vertical gap between nodes in the same column
const EXEC_MARGIN_X   = 60;
const EXEC_MARGIN_Y   = 60;

// Estimated rendered card heights at typical run-time content.
// Dagre uses these to reserve the right vertical slot per node type and to
// centre nodes within a column — subtracting h/2 below converts Dagre's
// centre-point to the React Flow top-left origin.
const EXEC_NODE_HEIGHT = {
  source:   95,
  queue:   120,
  activity: 145,
  sink:    155,
};
const DEFAULT_HEIGHT = 120;

function execHeight(type) {
  return EXEC_NODE_HEIGHT[type] ?? DEFAULT_HEIGHT;
}

/**
 * Runs a fresh Dagre left-to-right layout with execute-canvas dimensions.
 * Returns a new array of nodes with updated x/y — does not mutate input.
 * Intentionally ignores any stored visual-designer positions.
 */
export function computeExecuteLayout(nodes, edges) {
  if (!nodes?.length) return nodes ?? [];

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
    g.setNode(node.id, { width: EXEC_NODE_WIDTH, height: execHeight(node.type) })
  );

  (edges ?? []).forEach(edge => {
    if (!edge.loop && g.hasNode(edge.from) && g.hasNode(edge.to))
      g.setEdge(edge.from, edge.to);
  });

  dagre.layout(g);

  return nodes.map(node => {
    const pos = g.node(node.id);
    const h   = execHeight(node.type);
    return {
      ...node,
      x: pos ? Math.round(pos.x - EXEC_NODE_WIDTH / 2) : EXEC_MARGIN_X,
      y: pos ? Math.round(pos.y - h / 2)               : EXEC_MARGIN_Y,
    };
  });
}
