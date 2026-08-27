// ui/execute/AnimatedEdge.jsx — custom ReactFlow edge that travels token circles
// along the bezier path when routing events fire (F9C.6).
// Registered as edgeType "animatedEdge" in ExecuteCanvas.
// data.tokens shape: [{ id, color }] — max 5 per edge, managed by ExecuteCanvas.
import { useEffect, useRef } from "react";
import { BaseEdge, getBezierPath } from "../shared/xyflow.js";
import { prefersReducedMotion } from "../shared/hooks.js";

const ANIM_DUR = "0.3s";

// One travelling dot. SMIL's begin="0s" is relative to the SVG *document*
// timeline, not element insertion — a token added to a long-lived document
// with begin="0s" renders already-finished (a static dot frozen at the path
// end, hidden under the target node). begin="indefinite" + an explicit
// beginElement() on mount makes the motion actually play from the start.
// Under prefers-reduced-motion the dot appears at the path start without
// travelling (beginElement is skipped).
function TokenDot({ token, pathId }) {
  const motionRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    try {
      motionRef.current?.beginElement?.();
    } catch {
      /* SMIL unavailable (jsdom, old browsers) — dot still renders statically */
    }
  }, []);

  return (
    <circle r={5} fill={token.color} opacity={0.85}>
      <animateMotion ref={motionRef} dur={ANIM_DUR} fill="freeze" begin="indefinite">
        <mpath href={`#${pathId}`} />
      </animateMotion>
    </circle>
  );
}

export function AnimatedEdge({
  id,
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  markerEnd, style, data,
}) {
  const [edgePath] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  // Hidden path element that <mpath> references — must have a DOM id.
  // Using edge id guarantees uniqueness within the ReactFlow SVG.
  const pathId = `tok-path-${id}`;
  const tokens = data?.tokens ?? [];

  return (
    <>
      {/* Invisible motion path for <mpath> reference */}
      <path id={pathId} d={edgePath} fill="none" stroke="none" />

      {/* Visible edge line */}
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />

      {/* Animated token circles — unique React keys so each token mounts its
          own TokenDot, which starts its motion explicitly on mount. */}
      {tokens.map(token => (
        <TokenDot key={token.id} token={token} pathId={pathId} />
      ))}
    </>
  );
}
