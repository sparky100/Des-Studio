// ui/execute/SectionReturnEdge.jsx — a return arrow between section cards on the Run
// canvas's Sections view. The route is computed in ExecuteCanvas.jsx: it leaves the
// source card from its bottom edge, runs along a rail below every card, and enters the
// target card from its bottom edge, so it never crosses a card.
// Registered as edgeType "sectionReturnEdge". data.points: [{ x, y }, ...]; data.label.
import { BaseEdge } from "../shared/xyflow.js";

export function SectionReturnEdge({ data, style, markerEnd }) {
  const points = data?.points || [];
  if (points.length < 2) return null;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const railStart = points[1];
  const railEnd = points[2];
  const labelX = (railStart.x + railEnd.x) / 2;
  const labelY = railStart.y - 8;
  return (
    <>
      <BaseEdge path={path} style={style} markerEnd={markerEnd} />
      {data?.label && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fontSize={11}
          fill={style?.stroke}
          style={{ paintOrder: "stroke", stroke: "var(--sections-label-halo, #ffffff)", strokeWidth: 3 }}
        >
          {data.label}
        </text>
      )}
    </>
  );
}
