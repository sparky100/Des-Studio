// ui/public/PublicDiagram.jsx — a read-only picture of a published model.
//
// A visitor opens the page to understand a model, and a model is easiest to
// understand as its flow. This draws the same graph the Draw canvas derives
// (same layout, same section panels) as a plain SVG: no editor, no React Flow
// bundle on a public page, nothing to click that edits.
//
// It fits the page width first; zoom is for reading labels on a large model.
import { useMemo, useState } from "react";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { deriveGraphFromModel, NODE_WIDTH } from "../visual-designer/graph.js";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";
const BOX_H = 52;
const PAD = 24;
const MAX_LABEL = 21;

const TYPE_NAMES = { source: "Arrivals", queue: "Queue", activity: "Activity", sink: "Exit", container: "Container" };
// [singular, plural] for the summary line ("1 arrival source, 14 activities").
const TYPE_COUNTS = {
  source: ["arrival source", "arrival sources"], queue: ["queue", "queues"], activity: ["activity", "activities"],
  sink: ["exit", "exits"], container: ["container", "containers"],
};

/** Same hue per node type as the Draw canvas, so the two read as one product. */
function nodeColor(type, C) {
  return { source: C.green, queue: C.cEvent, activity: C.purple, sink: C.red, container: C.amber }[type] || C.accent;
}

function clip(text) {
  const t = String(text || "");
  return t.length > MAX_LABEL ? `${t.slice(0, MAX_LABEL - 1)}…` : t;
}

/**
 * @param {{ model: Record<string, any> }} props
 */
export function PublicDiagram({ model }) {
  const { C } = useTheme();
  const [zoom, setZoom] = useState(1);

  const view = useMemo(() => {
    let graph;
    try { graph = deriveGraphFromModel(model); } catch { return null; }
    const nodes = (graph.nodes || []).filter(n => Number.isFinite(n.x) && Number.isFinite(n.y));
    if (!nodes.length) return null;
    const panels = graph.sectionPanels || [];
    const byId = new Map(nodes.map(n => [n.id, n]));
    const xs = [...nodes.map(n => n.x), ...panels.map(p => p.x)];
    const ys = [...nodes.map(n => n.y), ...panels.map(p => p.y)];
    const x2 = [...nodes.map(n => n.x + NODE_WIDTH), ...panels.map(p => p.x + p.width)];
    const y2 = [...nodes.map(n => n.y + BOX_H), ...panels.map(p => p.y + p.height)];
    const minX = Math.min(...xs) - PAD;
    const minY = Math.min(...ys) - PAD;
    const counts = nodes.reduce((acc, n) => ({ ...acc, [n.type]: (acc[n.type] || 0) + 1 }), {});
    return {
      nodes,
      panels,
      edges: (graph.edges || []).filter(e => byId.has(e.from) && byId.has(e.to)),
      byId,
      box: { x: minX, y: minY, w: Math.max(...x2) + PAD - minX, h: Math.max(...y2) + PAD - minY },
      counts,
    };
  }, [model]);

  if (!view) return null;
  const { nodes, panels, edges, byId, box, counts } = view;
  const summary = Object.entries(counts)
    .map(([type, n]) => `${n} ${(TYPE_COUNTS[type] || [type, `${type}s`])[n === 1 ? 0 : 1]}`)
    .join(", ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: SANS, marginRight: "auto" }}>{summary}</span>
        <Btn small variant="ghost" onClick={() => setZoom(z => Math.max(1, z / 1.5))} disabled={zoom <= 1} ariaLabel="Zoom out">−</Btn>
        <Btn small variant="ghost" onClick={() => setZoom(1)} disabled={zoom === 1}>Fit</Btn>
        <Btn small variant="ghost" onClick={() => setZoom(z => Math.min(6, z * 1.5))} disabled={zoom >= 6} ariaLabel="Zoom in">+</Btn>
      </div>
      <div style={{
        overflow: "auto", maxHeight: 440, background: C.bg,
        border: `1px solid ${C.border}`, borderRadius: 8,
      }}>
        <svg
          role="img"
          aria-label={`Diagram of the model: ${summary}`}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          style={{ display: "block", width: `${zoom * 100}%`, height: "auto" }}
        >
          <defs>
            <marker id="public-diagram-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill={C.muted} />
            </marker>
          </defs>
          {panels.map(panel => (
            <g key={panel.id}>
              <rect x={panel.x} y={panel.y} width={panel.width} height={panel.height} rx={14}
                fill={`${panel.color || C.accent}14`} stroke={`${panel.color || C.accent}66`} strokeWidth={2} />
              <text x={panel.x + 16} y={panel.y + 30} fontSize={22} fontWeight={700} fill={panel.color || C.accent} fontFamily={SANS}>
                {panel.name}
              </text>
            </g>
          ))}
          {edges.map(edge => {
            const a = byId.get(edge.from);
            const b = byId.get(edge.to);
            const x1 = a.x + NODE_WIDTH;
            const y1 = a.y + BOX_H / 2;
            const x2 = b.x;
            const y2 = b.y + BOX_H / 2;
            const bend = Math.max(40, Math.abs(x2 - x1) / 2);
            return (
              <path key={edge.id} d={`M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`}
                fill="none" stroke={C.muted} strokeOpacity={0.55} strokeWidth={1.6} markerEnd="url(#public-diagram-arrow)" />
            );
          })}
          {nodes.map(node => {
            const color = nodeColor(node.type, C);
            return (
              <g key={node.id}>
                <title>{`${TYPE_NAMES[node.type] || node.type}: ${node.label}`}</title>
                <rect x={node.x} y={node.y} width={NODE_WIDTH} height={BOX_H} rx={8}
                  fill={C.panel} stroke={color} strokeWidth={2} />
                <rect x={node.x} y={node.y} width={6} height={BOX_H} rx={3} fill={color} />
                <text x={node.x + 16} y={node.y + 21} fontSize={13} fontWeight={600} fill={C.text} fontFamily={SANS}>
                  {clip(node.label)}
                </text>
                <text x={node.x + 16} y={node.y + 40} fontSize={11} fill={C.muted} fontFamily={SANS}>
                  {TYPE_NAMES[node.type] || node.type}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
