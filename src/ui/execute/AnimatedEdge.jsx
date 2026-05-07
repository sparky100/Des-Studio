// ui/execute/AnimatedEdge.jsx — custom ReactFlow edge that travels token circles
// along the bezier path when routing events fire (F9C.6).
// Registered as edgeType "animatedEdge" in ExecuteCanvas.
// data.tokens shape: [{ id, color }] — max 5 per edge, managed by ExecuteCanvas.
import { BaseEdge, getBezierPath } from "@xyflow/react";

const ANIM_DUR = "0.3s";

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

      {/* Animated token circles — each gets a unique React key so the
          animateMotion restarts from the beginning when a new token is added. */}
      {tokens.map(token => (
        <circle key={token.id} r={5} fill={token.color} opacity={0.85}>
          <animateMotion dur={ANIM_DUR} fill="freeze" begin="0s">
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}
    </>
  );
}
