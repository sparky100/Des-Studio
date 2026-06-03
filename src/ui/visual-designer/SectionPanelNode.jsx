import { useTheme } from "../shared/ThemeContext.jsx";

// Semi-transparent bounding-box panel rendered behind section member nodes.
// The background is pointer-events:none so pan/select is unaffected;
// only the label button captures clicks to toggle section focus.
export function SectionPanelNode({ data }) {
  const { C, FONT } = useTheme();
  const isFocused = !!data.isFocused;
  return (
    <div
      aria-hidden="true"
      style={{
        width: data.width,
        height: data.height,
        background: isFocused ? `${data.color}1a` : `${data.color}0d`,
        border: `1.5px solid ${isFocused ? `${data.color}cc` : `${data.color}44`}`,
        borderRadius: 10,
        boxSizing: "border-box",
        pointerEvents: "none",
        position: "relative",
        transition: "background 180ms, border-color 180ms",
      }}
    >
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          data.onToggleFocus?.();
        }}
        title={isFocused ? `Clear focus: ${data.name}` : `Focus section: ${data.name}`}
        style={{
          position: "absolute",
          top: 5,
          left: 8,
          background: isFocused ? `${data.color}33` : "transparent",
          border: isFocused ? `1px solid ${data.color}88` : "none",
          borderRadius: 4,
          color: data.color,
          cursor: "pointer",
          fontFamily: FONT,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          lineHeight: 1,
          padding: "2px 6px",
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
