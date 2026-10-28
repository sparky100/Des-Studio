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
// Instead, every loop edge is routed through a dedicated horizontal "rail".
// A loop that stays inside one section runs on a lane inside that section's
// box (see graph.js); the rest share rails in the open canvas space below all nodes — guaranteed clear regardless of
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
export function computeLoopRailYById(nodes, edges, sectionPanels = []) {
  const all = (edges || []).filter(e => e.loop === true || e.returning === true);
  if (!all.length) return new Map();
  // A loop inside one section already has a lane in that section's box (edge.railY).
  const rails = new Map(all.filter(e => e.railY != null).map(e => [e.id, e.railY]));
  const shared = all.filter(e => e.railY == null);
  if (!shared.length) return rails;
  const maxBottom = (nodes || []).reduce((max, n) => Math.max(max, (n.y || 0) + NODE_HEIGHT), 0);
  const panelBottom = (sectionPanels || []).reduce((max, p) => Math.max(max, (p.y || 0) + (p.height || 0)), 0);
  const baseY = Math.max(maxBottom + LOOP_LANE_GAP, panelBottom + LOOP_LANE_GAP / 2);
  shared.forEach((e, i) => rails.set(e.id, baseY + i * LOOP_LANE_SPACING));
  return rails;
}
