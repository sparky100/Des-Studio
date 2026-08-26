// ui/shared/ModalShell.jsx — Shared overlay/dialog chrome for centered modals (C-1 one-modal-system foundation).
//
// Consolidates the overlay + role="dialog" + aria-labelledby + Escape/focus-
// trap/initial-autofocus/focus-restore pattern FeedbackModal.jsx already had
// right, which every other centered modal in the app previously reimplemented
// slightly differently (and with drifting z-index values — 9999, 200/201,
// 1000, 1200 — instead of the shared Z.modal token). New centered-modal
// dialogs should build on this instead of hand-rolling overlay/focus-trap
// code; it fixes z-index drift by construction since Z.modal is the only
// value used here.
import { useId } from "react";
import { useFocusTrap } from "./useFocusTrap.js";
import { SPACE, RADIUS, TYPO, Z, SHADOW } from "./tokens.js";
import { useTheme } from "./ThemeContext.jsx";

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   title?: import("react").ReactNode,
 *   children: import("react").ReactNode,
 *   footer?: import("react").ReactNode,
 *   width?: string,
 *   labelledBy?: string,
 * }} props
 */
export function ModalShell({ isOpen, onClose, title, children, footer, width = "min(520px, 100%)", labelledBy }) {
  const { C, FONT } = useTheme();
  const generatedId = useId();
  const headingId = title !== undefined ? (labelledBy || `modal-shell-heading-${generatedId}`) : labelledBy;
  const dialogRef = useFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: C.overlay,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z.modal, padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: RADIUS.lg,
          width,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: SHADOW.modal,
          overflow: "hidden",
        }}
      >
        {title !== undefined && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: `${SPACE.md}px ${SPACE.lg}px`,
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}>
            <div id={headingId} style={{ fontFamily: FONT, ...TYPO.heading, color: C.text }}>
              {title}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: C.muted, fontFamily: FONT, fontSize: 16, lineHeight: 1,
                padding: 4, borderRadius: RADIUS.sm,
              }}
            >
              ✕
            </button>
          </div>
        )}
        <div style={{
          padding: title !== undefined ? `${SPACE.md}px ${SPACE.lg}px` : SPACE.lg,
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: SPACE.md,
        }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: `0 ${SPACE.lg}px ${SPACE.lg}px`,
            display: "flex", justifyContent: "flex-end", gap: SPACE.sm, flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
