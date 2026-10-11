// Moved verbatim out of execute/index.jsx (max-lines ratchet, expert review C-11).
import { Tag } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { ScanLimitBanner } from "./ScanLimitBanner.jsx";
import { fmt } from "./executeHelpers.js";

/** Status panels under the readiness strip: model check results, truncation
 * and limit warnings, save status, "model modified" and single-run progress. */
export function RunStatusBanners({ modelCheckerOpen, modelCheckerIssues, setModelCheckerOpen, phaseCTruncated, model, totalReplicationCount, truncatedReplicationCount, cycleLimitReached, scanLimitReplicationCount, runAdmission, saveStatus, isModelModified, singleRunStatus, singleRunProgress }) {
  const { C, FONT } = useTheme();
  return (
    <>
    {/* Model Checker panel */}
    {modelCheckerOpen && modelCheckerIssues !== null && (
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MODEL CHECK</span>
          <button
            onClick={() => setModelCheckerOpen(false)}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 13 }}
            aria-label="Close model checker"
          >✕</button>
        </div>
        {modelCheckerIssues.length === 0 ? (
          <div style={{ fontSize: 12, color: C.green, fontFamily: FONT }}>No structural issues found.</div>
        ) : (
          modelCheckerIssues.map((issue, i) => {
            const color = issue.severity === "error" ? C.red : issue.severity === "warning" ? C.amber : C.accent;
            const icon = issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
            return (
              <div
                key={i}
                style={{ background: C.bg, border: `1px solid ${color}44`, borderRadius: 6, padding: "8px 10px", display: "flex", gap: 8, alignItems: "flex-start" }}
              >
                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color, fontFamily: FONT, fontWeight: 700, marginBottom: 2 }}>{issue.code}</div>
                  <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>{issue.message}</div>
                  {issue.nodeName && (
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>Node: {issue.nodeName}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    )}

    {phaseCTruncated && (
      <div style={{ background: C.amber + '18', border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, fontFamily: FONT }}>
          This batch or individual run may contain unreliable results.
        </div>
        <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT, marginTop: 4, opacity: 0.8 }}>
          The conditional-event logic couldn't resolve within {model.maxCPasses || 5000} passes — some events that should have fired may not have.
          {totalReplicationCount > 1 && ` ${truncatedReplicationCount} of ${totalReplicationCount} replications were affected.`}
        </div>
      </div>
    )}

    {cycleLimitReached && (
      <div style={{ background: C.danger + '18', border: `1px solid ${C.danger}44`, borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.danger, fontFamily: FONT }}>
          This run hit its internal cycle limit and stopped before reaching its intended duration or termination condition.
        </div>
        <div style={{ fontSize: 11, color: C.danger, fontFamily: FONT, marginTop: 4, opacity: 0.8 }}>
          Results reflect a partial run. Re-run to retry — the engine sizes its cycle limit to the model automatically, so this should be rare.
        </div>
      </div>
    )}

    <ScanLimitBanner count={scanLimitReplicationCount} total={totalReplicationCount} cap={runAdmission.effectiveSettings?.maxCEventScans} />

    {saveStatus && (
      <div
        role={saveStatus.state === 'error' ? 'alert' : 'status'}
        style={{
          background: saveStatus.state === 'error' ? C.errorBg : saveStatus.state === 'success' ? C.green + '18' : C.surface,
          border: `1px solid ${saveStatus.state === 'error' ? C.danger : saveStatus.state === 'success' ? C.green + '44' : C.border}`,
          borderRadius: 6, padding: 12, color: saveStatus.state === 'error' ? C.error : saveStatus.state === 'success' ? C.green : C.text,
          fontSize: 12, fontFamily: FONT,
        }}>
        {saveStatus.message}
      </div>
    )}

    {isModelModified && (
      <div style={{
        background: C.warmup,
        border: `1px solid ${C.amber}44`,
        borderRadius: 6,
        color: C.amber,
        fontFamily: FONT,
        fontSize: 12,
        padding: "10px 12px",
      }}>
        ⚠ Model has been modified since this run. Results shown are from the saved run record, not the current model. Run again for updated results.
      </div>
    )}

    {singleRunStatus !== "idle" && (
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SINGLE RUN</div>
          <Tag label={singleRunStatus} color={singleRunStatus === "complete" ? C.green : singleRunStatus === "cancelled" ? C.red : C.amber} />
        </div>
        <div aria-live="off" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Sim time",       value: singleRunProgress?.clock != null ? fmt(singleRunProgress.clock) : "—" },
            { label: "Cycle",          value: `${singleRunProgress?.completed || 0}${singleRunProgress?.total ? `/${singleRunProgress.total}` : ""}` },
            { label: "Future Events",  value: String(singleRunProgress?.felSize || 0) },
            { label: "Events",         value: String(singleRunProgress?.eventsProcessed || 0) },
          ].map(item => (
            <div key={item.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, minWidth: 96, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 13, color: C.text, fontFamily: FONT, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>
        {(singleRunStatus === "cancelling" || singleRunStatus === "cancelled") && (
          <div role="status" style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
            Cancellation waits for the next safe engine checkpoint, then shows partial results without saving them.
          </div>
        )}
      </div>
    )}
    </>
  );
}
