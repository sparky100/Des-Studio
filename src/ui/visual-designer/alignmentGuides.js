// visual-designer/alignmentGuides.js — pure geometry for Figma/Lens-style
// "smart guides" shown while dragging a single node on the canvas.
//
// Compares the dragged node's edges/center against every other node's edges/
// center on each axis independently, snaps to the closest match within a
// zoom-adjusted screen-pixel threshold, and returns guide lines to render.
// Ported from sparky100/Lens's alignmentGuides.js, adapted to this
// codebase's node shape: React Flow v12 nodes always carry `.position.x/y`
// (see FlowDiagramReactFlow.jsx's toFlowNode), and size falls back through
// `.measured.width/height` (set by React Flow once a node has mounted) then
// plain `.width/height` then the NODE_WIDTH/NODE_HEIGHT constants — the same
// fallback chain already used by useFitNodeRef.js.
import { NODE_WIDTH, NODE_HEIGHT } from "./graph.js";

const SNAP_PX = 6;
const GUIDE_OVERHANG = 40;

export function nodeBounds(node) {
  const left = node.position?.x ?? node.x ?? 0;
  const top = node.position?.y ?? node.y ?? 0;
  const width = node.measured?.width ?? node.width ?? NODE_WIDTH;
  const height = node.measured?.height ?? node.height ?? NODE_HEIGHT;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/**
 * @param {object} draggedNode
 * @param {object[]} otherNodes
 * @param {number} [zoom]
 * @returns {{ snappedPosition: {x:number,y:number}, guides: Array<{orientation:"vertical"|"horizontal", position:number, from:number, to:number}> }}
 */
export function computeAlignmentGuides(draggedNode, otherNodes, zoom = 1) {
  const threshold = SNAP_PX / (zoom || 1);
  const db = nodeBounds(draggedNode);

  const dCandX = [db.left, (db.left + db.right) / 2, db.right];
  const dCandY = [db.top, (db.top + db.bottom) / 2, db.bottom];

  let bestX = null;
  let bestY = null;

  for (const other of otherNodes) {
    if (other.type === "sectionPanel") continue;
    const ob = nodeBounds(other);
    const oCandX = [ob.left, (ob.left + ob.right) / 2, ob.right];
    const oCandY = [ob.top, (ob.top + ob.bottom) / 2, ob.bottom];

    for (const dv of dCandX) {
      for (const ov of oCandX) {
        const delta = dv - ov;
        if (Math.abs(delta) < threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, guideAt: ov, other: ob };
        }
      }
    }
    for (const dv of dCandY) {
      for (const ov of oCandY) {
        const delta = dv - ov;
        if (Math.abs(delta) < threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, guideAt: ov, other: ob };
        }
      }
    }
  }

  const snappedPosition = {
    x: bestX ? db.left - bestX.delta : db.left,
    y: bestY ? db.top - bestY.delta : db.top,
  };

  const guides = [];
  if (bestX) {
    const from = Math.min(db.top, bestX.other.top) - GUIDE_OVERHANG;
    const to = Math.max(db.bottom, bestX.other.bottom) + GUIDE_OVERHANG;
    guides.push({ orientation: "vertical", position: bestX.guideAt, from, to });
  }
  if (bestY) {
    const from = Math.min(db.left, bestY.other.left) - GUIDE_OVERHANG;
    const to = Math.max(db.right, bestY.other.right) + GUIDE_OVERHANG;
    guides.push({ orientation: "horizontal", position: bestY.guideAt, from, to });
  }

  return { snappedPosition, guides };
}
