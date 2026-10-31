import { Handle, Position } from "../shared/xyflow.js";
import { useTheme } from "../shared/ThemeContext.jsx";
import { SPACE, RADIUS, TYPO } from "../shared/tokens.js";
import { EXEC_CARD_WIDTH, EXEC_CARD_HEIGHT } from "./executeLayout.js";

const fmt = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// One section on the Run canvas's Sections view: the stage's name, what it holds
// and, once a run has started, how many customers are in it and how long they spend.
export function SectionCardNode({ data }) {
  const { C, FONT } = useTheme();
  const live = data.liveData;
  const muted = { color: C.muted, ...TYPO.caption, margin: 0 };
  return (
    <div
      title={data.description || undefined}
      onDoubleClick={e => { e.stopPropagation(); data.onShowDetail?.(); }}
      style={{
        width: EXEC_CARD_WIDTH, height: EXEC_CARD_HEIGHT, boxSizing: "border-box", overflow: "hidden",
        padding: SPACE.sm, borderRadius: RADIUS.md, background: C.surface, color: C.text,
        border: `2px solid ${data.sectionColor || C.accent}`, fontFamily: FONT,
        display: "flex", flexDirection: "column", gap: 2,
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: SPACE.xs }}>
        <strong title={data.label} style={{ ...TYPO.body, flex: 1, minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflowWrap: "anywhere" }}>{data.label}</strong>
        <button
          type="button"
          aria-label={`Show ${data.label} in detail`}
          title={`Show ${data.label} in detail`}
          onClick={e => { e.stopPropagation(); data.onShowDetail?.(); }}
          style={{ flexShrink: 0, background: "none", border: "none", padding: 0, color: C.muted, fontFamily: FONT, fontSize: 14, lineHeight: 1, cursor: "pointer" }}
        >▸</button>
      </div>
      <p style={{ ...muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.sublabel}</p>
      {live ? (
        <>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{live.inNow} <span style={{ ...muted, fontWeight: 400 }}>in section</span></div>
          <p style={muted}>{live.entered} entered · {live.left} left</p>
          <p style={muted}>{live.avgTime != null ? `avg ${fmt(live.avgTime)} ${data.timeUnit || ""}`.trim() : "no completed stays yet"}</p>
          {live.busiest && <p style={{ ...muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{live.busiest.name} {Math.round(live.busiest.utilisation)}%</p>}
        </>
      ) : (
        <p style={muted}>Starts when the run does</p>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
