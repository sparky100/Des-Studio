// visual-designer/runFootprint.js — pure geometry for predicting Run-canvas
// overlap from Draw-canvas positions.
//
// The Run canvas renders cards at the exact same top-left x/y as Draw
// (positions pass through 1:1 — see ExecuteCanvas.jsx), but its cards are
// bigger: EXEC_CARD_WIDTH wide with per-type heights, versus Draw's uniform
// NODE_WIDTH x NODE_HEIGHT. So two nodes that look comfortably spaced on
// Draw can collide on Run. These helpers compute each node's Run footprint
// and flag the pairs whose footprints intersect, letting the Draw canvas
// warn (and draw ghost outlines) without ever mounting Execute components.
import { EXEC_CARD_WIDTH, EXEC_NODE_HEIGHT, EXEC_DEFAULT_HEIGHT } from "../execute/executeLayout.js";

export function runFootprintSize(type) {
  return { width: EXEC_CARD_WIDTH, height: EXEC_NODE_HEIGHT[type] ?? EXEC_DEFAULT_HEIGHT };
}

// Accepts both graph nodes ({x, y, type}) and React Flow nodes
// ({position: {x, y}, data}) — same position fallback as alignmentGuides.js.
// Flow nodes carry the semantic type in data.type (their top-level type is
// the renderer name "desNode"), so data.type wins when present.
export function nodeRunRect(node) {
  const left = node.position?.x ?? node.x ?? 0;
  const top = node.position?.y ?? node.y ?? 0;
  const { width, height } = runFootprintSize(node.data?.type ?? node.type);
  return { left, top, right: left + width, bottom: top + height, width, height };
}

// Strict inequalities: footprints that merely share an edge do not overlap.
// A positive margin flags near-misses too (gap smaller than margin).
export function rectsOverlap(a, b, margin = 0) {
  return a.left < b.right + margin &&
    b.left < a.right + margin &&
    a.top < b.bottom + margin &&
    b.top < a.bottom + margin;
}

/**
 * @param {object[]} nodes graph or React Flow nodes (section panels ignored)
 * @param {{margin?: number}} [options]
 * @returns {{ pairs: Array<{aId: string, bId: string}>, nodeIds: Set<string> }}
 */
export function computeRunOverlaps(nodes, { margin = 0 } = {}) {
  const candidates = (nodes || []).filter(n => n && n.type !== "sectionPanel");
  const rects = candidates.map(nodeRunRect);
  const pairs = [];
  const nodeIds = new Set();
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (rectsOverlap(rects[i], rects[j], margin)) {
        pairs.push({ aId: candidates[i].id, bId: candidates[j].id });
        nodeIds.add(candidates[i].id);
        nodeIds.add(candidates[j].id);
      }
    }
  }
  return { pairs, nodeIds };
}
