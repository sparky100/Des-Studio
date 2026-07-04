// ui/shared/useFitNodeRef.js
import { useReactFlow } from "@xyflow/react";

// Wires `fitNodeRef`/`fitAllRef` (refs owned by a parent canvas component) to
// pan/zoom the current React Flow viewport. Must be called from a component
// rendered inside <ReactFlow>, since it relies on the useReactFlow() context.
//
// Using setCenter instead of fitView prevents the "whole diagram shifts" effect
// that occurs when fitView recalculates bounds for a single node with large padding.
export function useFitNodeRef({ fitNodeRef, fitAllRef, defaultWidth = 160, defaultHeight = 40 } = {}) {
  const { fitView, getNode, setCenter, getViewport } = useReactFlow();

  if (fitAllRef) {
    fitAllRef.current = () => fitView({ padding: 0.15, duration: 0 });
  }

  if (fitNodeRef) {
    fitNodeRef.current = (nodeId) => {
      if (nodeId) {
        const node = getNode(nodeId);
        if (node) {
          const { zoom } = getViewport();
          const w = node.measured?.width ?? node.width ?? defaultWidth;
          const h = node.measured?.height ?? node.height ?? defaultHeight;
          setCenter(node.position.x + w / 2, node.position.y + h / 2, {
            zoom: Math.max(zoom, 0.6),
            duration: 350,
          });
          return;
        }
      }
      fitView({ padding: 0.15, duration: 350 });
    };
  }

  return { fitView };
}
