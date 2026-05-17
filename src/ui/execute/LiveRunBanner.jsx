// ui/execute/LiveRunBanner.jsx — Status banner shown during a rolling (live WebSocket) run
//
// Displays:
//   - A pulsing green "LIVE" indicator dot
//   - Per-source: label, current param field, current value, time since last fetch
//
// Props:
//   sources      Array of { id, label, field, value, lastFetchMs } objects
//   paramValues  Fallback map { sourceId: { field: value } } (alternative to sources[].value)

import { useEffect, useState } from "react";
import { C, FONT, alpha } from "../shared/tokens.js";

function timeSince(ms) {
  if (ms == null) return "no data";
  const secs = Math.round((Date.now() - ms) / 1000);
  if (secs < 2) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
}

/**
 * LiveRunBanner — shown while a rolling run is active.
 *
 * @param {{ sources?: Array<{ id: string, label: string, field?: string, value?: number|string|null, lastFetchMs?: number|null }>, paramValues?: Record<string,*> }} props
 */
export function LiveRunBanner({ sources = [], paramValues = {} }) {
  // Tick every second to refresh the "X seconds ago" display
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-label="Live run active"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
        background: alpha(C.green, 0.08),
        border: `1px solid ${alpha(C.green, 0.3)}`,
        borderRadius: 6,
        fontFamily: FONT,
        fontSize: 12,
        flexWrap: "wrap",
      }}
    >
      {/* Live indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: C.green,
            boxShadow: `0 0 6px ${C.green}`,
            animation: "livePulse 1.4s ease-in-out infinite",
          }}
        />
        <span style={{ color: C.green, fontWeight: 700, letterSpacing: 1.2, fontSize: 10 }}>
          LIVE
        </span>
      </div>

      {/* Separator */}
      <span style={{ color: C.border }}>|</span>

      {/* Per-source chips */}
      {sources.length === 0 ? (
        <span style={{ color: C.muted }}>Waiting for data...</span>
      ) : (
        sources.map(src => {
          const displayValue = src.value ?? (paramValues?.[src.id] ?? null);
          const displayLabel = src.label || src.id;
          const field        = src.field || "";
          const lastFetch    = src.lastFetchMs ?? null;

          return (
            <div
              key={src.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: alpha(C.green, 0.05),
                border: `1px solid ${alpha(C.green, 0.18)}`,
                borderRadius: 4,
                padding: "3px 8px",
              }}
            >
              <span style={{ color: C.muted }}>{displayLabel}</span>
              {field && (
                <>
                  <span style={{ color: C.border }}>:</span>
                  <span style={{ color: C.text }}>{field}</span>
                </>
              )}
              <span style={{ color: C.border }}>:</span>
              <span style={{ color: C.green, fontWeight: 700 }}>
                {displayValue == null ? "—" : String(displayValue)}
              </span>
              <span style={{ color: C.muted, fontSize: 10 }}>
                ({timeSince(lastFetch)})
              </span>
            </div>
          );
        })
      )}

      {/* Keyframes injected inline once */}
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
