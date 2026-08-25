// ui/shared/CiBadge.jsx — Confidence-interval badge shared by ResultsWorkspace and ModelHistoryTab.
//
// Renders the relative half-width as a colour-banded pill, plus a small always-visible
// secondary line with the absolute half-width and replication count — so the reliability
// detail (previously only in a `title` tooltip, unreachable by keyboard/touch) is persistent.
// The 95% interval bounds remain available via `title` as supplementary detail.

export function CiBadge({ ci, C, FONT }) {
  if (!ci?.halfWidth || !ci?.mean || !Number.isFinite(ci.mean) || ci.mean === 0) return null;

  const relHw = (ci.halfWidth / Math.abs(ci.mean)) * 100;
  const color = relHw < 10 ? C.green : relHw < 25 ? C.amber : C.red;
  const halfWidthText = ci.halfWidth.toFixed(1);
  const detailText = `±${halfWidthText} · n=${ci.n} reps`;
  const title = Number.isFinite(ci.lower) && Number.isFinite(ci.upper)
    ? `95% CI: [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}] — ±${halfWidthText} half-width, n=${ci.n} reps`
    : `±${halfWidthText} half-width, n=${ci.n} reps`;

  return (
    <span
      title={title}
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: "flex-start",
        gap: 1, marginLeft: 5, verticalAlign: "top",
      }}
    >
      <span
        style={{
          fontSize: 10, fontWeight: 700, color, fontFamily: FONT,
          background: `${color}18`, border: `1px solid ${color}44`,
          borderRadius: 999, padding: "2px 6px", whiteSpace: "nowrap",
        }}
      >
        ±{relHw.toFixed(0)}%
      </span>
      <span
        style={{
          fontSize: 9, color: C.muted, fontFamily: FONT,
          whiteSpace: "nowrap", padding: "0 2px",
        }}
      >
        {detailText}
      </span>
    </span>
  );
}
