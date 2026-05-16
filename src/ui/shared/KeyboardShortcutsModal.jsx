// ui/shared/KeyboardShortcutsModal.jsx
import { useEffect } from "react";
import { C, FONT, Z, RADIUS, SPACE, alpha } from "./tokens.js";
import { Btn } from "./components.jsx";

const SHORTCUTS = [
  { keys: ["Ctrl", "Z"],        description: "Undo last model edit" },
  { keys: ["Ctrl", "Shift", "Z"], description: "Redo last undone edit" },
  { keys: ["Ctrl", "S"],        description: "Save model" },
  { keys: ["?"],                description: "Show this keyboard shortcuts list" },
  { keys: ["Esc"],              description: "Close modal / cancel action" },
];

function Key({ label }) {
  return (
    <kbd style={{
      display: "inline-block",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: RADIUS.sm,
      padding: "2px 7px",
      fontFamily: FONT,
      fontSize: 11,
      color: C.text,
      lineHeight: 1.6,
    }}>
      {label}
    </kbd>
  );
}

export function KeyboardShortcutsModal({ onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.67)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z.modal, padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kbd-modal-title"
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: RADIUS.lg,
          padding: SPACE.xl,
          width: "min(480px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: SPACE.md,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div id="kbd-modal-title" style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: C.text }}>
            Keyboard Shortcuts
          </div>
          <Btn small variant="ghost" onClick={onClose} ariaLabel="Close keyboard shortcuts">✕</Btn>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
          <tbody>
            {SHORTCUTS.map((s, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${alpha(C.border, 0.5)}` }}>
                <td style={{ padding: "8px 0", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    {s.keys.map((k, j) => (
                      <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {j > 0 && <span style={{ color: C.muted, fontSize: 10, fontFamily: FONT }}>+</span>}
                        <Key label={k} />
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: "8px 0 8px 16px", fontSize: 12, color: C.muted, verticalAlign: "middle" }}>
                  {s.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, marginTop: SPACE.xs }}>
          Mac users: use ⌘ (Cmd) in place of Ctrl.
        </div>
      </div>
    </div>
  );
}
