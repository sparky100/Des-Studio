// ui/AboutModal.jsx — Static About panel for DES Studio
import { useEffect, useRef } from "react";
import { SPACE, RADIUS, TYPO, Z, alpha } from "./shared/tokens.js";
import { useTheme } from "./shared/ThemeContext.jsx";

const APP_VERSION = import.meta.env.VITE_APP_VERSION;

const headingId = "about-modal-heading";

/**
 * AboutModal — displays app name, version, copyright, and contact info.
 *
 * @param {{ isOpen: boolean, onClose: () => void }} props
 */
export function AboutModal({ isOpen, onClose }) {
  const { C, FONT } = useTheme();
  const dialogRef = useRef(null);

  // Close on Escape; focus the close button on open
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);

    const raf = requestAnimationFrame(() => {
      dialogRef.current?.querySelector("button")?.focus();
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.67)",
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
          width: "min(420px, 100%)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${SPACE.md}px ${SPACE.lg}px`,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div
            id={headingId}
            style={{ fontFamily: FONT, ...TYPO.heading, color: C.text }}
          >
            About DES Studio
          </div>
          <button
            type="button"
            aria-label="Close about"
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

        {/* Body — target ~240px height */}
        <div style={{
          padding: `${SPACE.lg}px`,
          display: "flex",
          flexDirection: "column",
          gap: SPACE.md,
        }}>
          {/* App name & tagline */}
          <div>
            <div style={{
              fontFamily: FONT,
              fontSize: 22,
              fontWeight: 700,
              color: C.accent,
              letterSpacing: 2,
              marginBottom: 4,
            }}>
              DES Studio
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
              Browser-native simulation modelling for everyone
            </div>
          </div>

          {/* Details grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
            <Row label="Version"   value={`v${APP_VERSION || "—"}`} />
            <Row label="Copyright" value="© 2026 SimModlr. All rights reserved." />
            <Row
              label="Contact"
              value={
                <a
                  href="mailto:support@simmodlr.app"
                  style={{ color: C.accent, textDecoration: "none" }}
                >
                  support@simmodlr.app
                </a>
              }
            />
            <Row label="Method"    value="Three-Phase Simulation approach (Tocher/Pidd)" />
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: `${SPACE.xs}px 0` }} />

          <div style={{
            fontFamily: FONT,
            fontSize: 11,
            color: C.muted,
            lineHeight: 1.6,
          }}>
            Feedback and bug reports are welcome — use the Feedback button in the toolbar.
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", gap: SPACE.md, fontFamily: FONT, fontSize: 12 }}>
      <span style={{ color: C.muted, minWidth: 72, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.text }}>{value}</span>
    </div>
  );
}
