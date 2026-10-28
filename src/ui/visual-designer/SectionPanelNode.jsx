import { useTheme } from "../shared/ThemeContext.jsx";

// Semi-transparent bounding-box panel rendered behind section member nodes.
// The background is pointer-events:none so pan/select is unaffected;
// only the chevron (show as a card) and the label (toggle section focus) capture clicks.
export function SectionPanelNode({ data }) {
  const isFocused = !!data.isFocused;
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        background: isFocused ? `${data.color}22` : `${data.color}14`,
        border: `2px solid ${isFocused ? `${data.color}dd` : `${data.color}77`}`,
        borderRadius: 10,
        boxSizing: "border-box",
        pointerEvents: "none",
        position: "relative",
        transition: "background 180ms, border-color 180ms",
      }}
    >
      {!data.controlsSeparate && <SectionPanelControls data={data} />}
    </div>
  );
}

// The chevron and name label. On the Draw canvas they are a node of their own, drawn
// above every section box and member node, so another section's box or a node that
// overlaps this one can never cover them (see FlowDiagramReactFlow).
export function SectionPanelControls({ data, standalone = false }) {
  const { FONT } = useTheme();
  const isFocused = !!data.isFocused;
  return (
    <div style={{ ...(standalone ? {} : { position: "absolute", top: 5, left: 8 }), display: "flex", alignItems: "center", gap: 4, pointerEvents: standalone ? "auto" : "none" }}>
        {data.onCollapse && <button
          type="button"
          aria-label={`Show ${data.name} as a card`}
          title="Show this section as a card"
          onClick={e => { e.stopPropagation(); data.onCollapse(); }}
          style={{
            background: `${data.color}22`,
            border: `1px solid ${data.color}99`,
            borderRadius: 4,
            color: data.color,
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 10,
            lineHeight: 1,
            padding: "3px 5px",
            pointerEvents: "auto",
          }}
        >▾</button>}
      <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            data.onToggleFocus?.();
          }}
          title={[isFocused ? `Clear focus: ${data.name}` : `Focus section: ${data.name}`, data.description].filter(Boolean).join("\n")}
          style={{
            background: isFocused ? `${data.color}44` : `${data.color}22`,
            border: `1px solid ${isFocused ? data.color : `${data.color}99`}`,
            borderRadius: 4,
            color: data.color,
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            lineHeight: 1,
            padding: "3px 8px",
            pointerEvents: "auto",
            textTransform: "uppercase",
            transition: "background 180ms",
          }}
        >
          {data.name}
      </button>
    </div>
  );
}

export function SectionPanelControlsNode({ data }) {
  return <SectionPanelControls data={data} standalone />;
}
