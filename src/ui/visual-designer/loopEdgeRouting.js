// loopEdgeRouting.js — routing geometry for rework/loop-back edges on the
// Draw canvas.
//
// Rework/loop-back edges (an Activity's outgoing edge back to an earlier
// Queue, flagged `edge.loop === true` by graph.js's back-edge detection) are
// excluded from dagre's layout graph entirely (see graph.js `withLayout`),
// so nothing ever reserves canvas space for them. Drawn with the default
// bezier used for every other edge, they bow out and cut diagonally across
// whatever nodes/sections happen to sit between source and target.
//
// Instead, every loop edge is routed through a dedicated horizontal "rail"
// in the open canvas space below all nodes — guaranteed clear regardless of
// layout depth or section nesting — with FlowDiagramReactFlow.jsx switching
// those edges from getBezierPath to getSmoothStepPath with `centerY` forced
// down to this rail. Multiple loop edges are stacked into parallel lanes
// (increasing Y) so they don't cross each other either.

import { NODE_HEIGHT } from "./graph.js";

export const LOOP_LANE_GAP = 48;      // clearance below the lowest node's bottom edge
export const LOOP_LANE_SPACING = 28;  // vertical gap between stacked lanes

/**
 * Returns a Map<edgeId, railY> — one entry per loop edge in `edges` — where
 * railY is the Y coordinate of that edge's dedicated horizontal rail, always
 * at or below every node's bottom edge. Non-loop edges are omitted (callers
 * treat their absence in the map as "no special routing").
 */
export function computeLoopRailYById(nodes, edges) {
  const loopEdges = (edges || []).filter(e => e.loop === true);
  if (!loopEdges.length) return new Map();
  const maxBottom = (nodes || []).reduce((max, n) => Math.max(max, (n.y || 0) + NODE_HEIGHT), 0);
  const baseY = maxBottom + LOOP_LANE_GAP;
  return new Map(loopEdges.map((e, i) => [e.id, baseY + i * LOOP_LANE_SPACING]));
}
