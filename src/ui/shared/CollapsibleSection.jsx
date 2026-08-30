// ui/shared/CollapsibleSection.jsx — shared collapsible section header button.
// Extracted from ResultsWorkspace.jsx's original local SectionHeader so the same
// controlled + persisted collapse/expand pattern (state lives with the caller,
// not this component) can be reused outside the Results tab — e.g. BottomPanel's
// Live Metrics tab. Behavior/markup is unchanged from the original.
import { useTheme } from "./ThemeContext.jsx";

export function CollapsibleSection({ id, label, badge, isOpen, onToggle, controlsId }) {
  const { C, FONT } = useTheme();
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={controlsId ?? `section-${id}`}
      onClick={() => onToggle(id)}
      style={{
        alignItems: "center",
        background: "none",
        border: "none",
        borderBottom: `1px solid ${C.border}`,
        cursor: "pointer",
        display: "flex",
        fontFamily: FONT,
        gap: 8,
        marginBottom: 0,
        padding: "8px 0",
        textAlign: "left",
        width: "100%",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: C.muted,
          display: "inline-block",
          fontSize: 9,
          lineHeight: 1,
          transition: "transform 160ms cubic-bezier(0.4,0,0.2,1)",
          transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
        }}
      >▶</span>
      <span style={{
        color: C.accent,
        flex: 1,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.2,
      }}>{label.toUpperCase()}</span>
      {badge != null && badge > 0 && (
        <span style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          color: C.muted,
          fontFamily: FONT,
          fontSize: 9,
          fontWeight: 700,
          padding: "1px 7px",
        }}>{badge}</span>
      )}
    </button>
  );
}
