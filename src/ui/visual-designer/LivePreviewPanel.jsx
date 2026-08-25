// LivePreviewPanel — Phase 1 of ADR-020 (Draw/Run live preview). A collapsible
// strip docked below the Draw canvas that runs a small, non-persisting
// simulation and renders it through the existing, unmodified ExecuteCanvas —
// no new canvas or node code. Off by default; toggled per-model via the same
// localStorage convention the rest of the Draw canvas uses (des.<feature>).
// See docs/decisions/ADR-020-draw-run-live-preview.md.
import { lazy, Suspense, useState } from "react";
import { useTheme } from "../shared/ThemeContext.jsx";
import { useLivePreview } from "./useLivePreview.js";

// Lazy — same code-splitting boundary ModelDetail already uses for
// VisualDesignerPanel itself. Keeps the whole Execute canvas machinery (xyflow
// node components, token animation) out of the Draw tab's bundle unless the
// preview is actually expanded, and avoids pulling ExecuteCanvas.jsx into the
// Draw chunk's static import graph, which changed load-order enough in tests
// to race with the always-mounted (but hidden) Execute tab's own canvas.
const ExecuteCanvas = lazy(() =>
  import("../execute/ExecuteCanvas.jsx").then(m => ({ default: m.ExecuteCanvas }))
);

export function LivePreviewPanel({ model, hasBlockingErrors }) {
  const { C, FONT } = useTheme();
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem("des.livePreview.enabled") === "1"; } catch { return false; }
  });

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem("des.livePreview.enabled", next ? "1" : "0"); } catch { /* storage unavailable (private mode) — non-critical */ }
  };

  const active = enabled && !hasBlockingErrors;
  const { snap, error } = useLivePreview(model, { enabled: active });

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={enabled}
        aria-label={enabled ? "Collapse live preview" : "Expand live preview — runs a small simulation of this model in the background"}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          background: "transparent", border: "none", cursor: "pointer",
          padding: "8px 12px", fontFamily: FONT, color: C.text, textAlign: "left",
        }}
      >
        <span aria-hidden="true" style={{ transform: enabled ? "rotate(90deg)" : "none", transition: "transform 150ms", fontSize: 10, color: C.muted }}>▶</span>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Live Preview</span>
        <span style={{ fontSize: 11, color: C.muted }}>
          {enabled ? (active ? "running a quick preview of this model" : "fix Model Health errors to preview") : "see a small run of this model as you draw it"}
        </span>
        {active && !error && (
          <span aria-hidden="true" style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: C.green }} />
        )}
      </button>

      {enabled && (
        <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${C.border}` }}>
          {hasBlockingErrors ? (
            <div role="status" style={{ padding: "16px 8px", fontSize: 12, color: C.muted, fontFamily: FONT, textAlign: "center" }}>
              This model has validation errors that would stop it running — check Model Health, then the preview will pick up automatically.
            </div>
          ) : error ? (
            <div role="alert" style={{ padding: "16px 8px", fontSize: 12, color: C.red, fontFamily: FONT, textAlign: "center" }}>
              {error}
            </div>
          ) : (
            <div style={{ marginTop: 8, opacity: snap ? 1 : 0.4, transition: "opacity 200ms" }}>
              <Suspense fallback={<div style={{ padding: "16px 8px", fontSize: 12, color: C.muted, fontFamily: FONT, textAlign: "center" }}>Loading preview…</div>}>
                <ExecuteCanvas model={model} snap={snap} kpiSlots={[]} animationEnabled />
              </Suspense>
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 10, color: C.muted, fontFamily: FONT }}>
            A short, capped preview run (up to {60} sim-time units) — not saved, not a substitute for a real Run.
          </div>
        </div>
      )}
    </div>
  );
}
