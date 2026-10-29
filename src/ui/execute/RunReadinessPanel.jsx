// Moved verbatim out of execute/index.jsx (max-lines ratchet, expert review C-11).
import { Btn, Tag } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { formatEstimate } from "./runHelpers.js";

/** Run-readiness strip above the Run canvas: blockers, advisories and the
 * workload estimate. The expanded / estimate-visible toggles stay in
 * ExecutePanel so they survive the strip being hidden during a run. */
export function RunReadinessPanel({ runAdmission, complexityEstimate, runLabel, lastRunEstimateAccuracy, readinessExpanded, setReadinessExpanded, showEstimate, setShowEstimate }) {
  const { C, FONT } = useTheme();
  const hasAdmissionErrors = runAdmission.hardErrors.length > 0;
  const estimateHasActionableContent = runAdmission.warnings.length > 0 || runAdmission.confirmations.length > 0;
  const effectiveShowEstimate = showEstimate != null ? showEstimate : estimateHasActionableContent;
  const readinessTagColor = hasAdmissionErrors ? C.red : C.green;
  const readinessTagBg = hasAdmissionErrors ? C.errorBg : `${C.green}18`;
  const readinessBorder = hasAdmissionErrors ? C.danger : `${C.green}66`;
  const readinessTitle = hasAdmissionErrors
    ? "Needs attention"
    : "Ready to run";
  const readinessSummary = hasAdmissionErrors
    ? `${runAdmission.hardErrors.length} blocker${runAdmission.hardErrors.length === 1 ? "" : "s"} to resolve before running.`
    : "No blocking issues found for this scenario.";
  const readinessIssues = runAdmission.hardErrors;
  // A hard blocker always shows full detail — collapsing "Needs attention" to
  // one line would hide *why* the run is blocked. The advisory/all-green case
  // defaults to one line; the user can still expand it.
  const effectiveReadinessExpanded = hasAdmissionErrors || readinessExpanded;
  const readinessAdvisoryCount = runAdmission.warnings.length;
  const readinessDigestParts = [
    formatEstimate(complexityEstimate.expectedEntities) !== "—" ? `≈ ${formatEstimate(complexityEstimate.expectedEntities)} entities` : null,
    formatEstimate(complexityEstimate.estimatedCEventScans) !== "—" ? `${formatEstimate(complexityEstimate.estimatedCEventScans)} scans/rep` : null,
    complexityEstimate.confidence ? `${complexityEstimate.confidence} confidence` : null,
  ].filter(Boolean);

  return (
    <div
      role={hasAdmissionErrors ? "alert" : "status"}
      data-run-readiness=""
      style={{
        background: C.panel,
        border: `1px solid ${readinessBorder}`,
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {!effectiveReadinessExpanded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              background: readinessTagBg,
              border: `1px solid ${readinessBorder}`,
              borderRadius: 999,
              color: readinessTagColor,
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {readinessTitle}
          </span>
          {readinessAdvisoryCount > 0 && (
            <span style={{ fontSize: 11, color: C.amber, fontFamily: FONT, whiteSpace: "nowrap" }}>
              {readinessAdvisoryCount} advisor{readinessAdvisoryCount === 1 ? "y" : "ies"}
            </span>
          )}
          {readinessDigestParts.length > 0 && (
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>
              {readinessDigestParts.join(" · ")}
            </span>
          )}
          {runLabel.trim() && <Tag label={runLabel.trim()} color={C.accent} />}
          <button
            onClick={() => setReadinessExpanded(true)}
            style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontFamily: FONT, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}
          >
            Details ▸
          </button>
        </div>
      ) : (
      <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              background: readinessTagBg,
              border: `1px solid ${readinessBorder}`,
              borderRadius: 999,
              color: readinessTagColor,
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 10px",
            }}
          >
            {readinessTitle}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 2 }}>
              RUN READINESS
            </div>
            <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
              {readinessSummary}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {runLabel.trim() && <Tag label={runLabel.trim()} color={C.accent} />}
          {!hasAdmissionErrors && (
            <button
              onClick={() => setReadinessExpanded(false)}
              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontFamily: FONT, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}
            >
              ▴ Collapse
            </button>
          )}
        </div>
      </div>
      {readinessIssues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {readinessIssues.slice(0, 4).map((issue, index) => (
            <div
              key={`${issue.code}-${index}`}
              style={{
                background: hasAdmissionErrors ? C.errorBg : C.warmup,
                border: `1px solid ${hasAdmissionErrors ? C.danger : C.amber}55`,
                borderRadius: 6,
                color: hasAdmissionErrors ? C.error : C.warnBg,
                fontFamily: FONT,
                fontSize: 11,
                padding: "8px 10px",
              }}
            >
              [{issue.code}] {issue.message}
            </div>
          ))}
          {readinessIssues.length > 4 && (
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
              {readinessIssues.length - 4} more item{readinessIssues.length - 4 === 1 ? "" : "s"} in Model Health.
            </div>
          )}
        </div>
      )}
      {runAdmission.warnings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {runAdmission.warnings.map((issue, index) => (
            <div
              key={`warn-${issue.code}-${index}`}
              style={{
                background: `${C.amber}12`,
                border: `1px solid ${C.amber}44`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT,
                fontSize: 11,
                padding: "8px 10px",
              }}
            >
              [{issue.code}] {issue.message}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>WORKLOAD ESTIMATE</div>
          <button
            onClick={() => setShowEstimate(!effectiveShowEstimate)}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontFamily: FONT, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}
          >{effectiveShowEstimate ? "Hide" : "Show"}</button>
        </div>
        {effectiveShowEstimate && <div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Planned arrivals", value: formatEstimate(complexityEstimate.plannedArrivals) },
            { label: "Planned schedule rows", value: formatEstimate(complexityEstimate.plannedScheduleRows) },
            { label: "Expected entities", value: formatEstimate(complexityEstimate.expectedEntities) },
            { label: "Stage moves", value: formatEstimate(complexityEstimate.estimatedStageTransitions) },
            { label: "C-event scans / rep", value: formatEstimate(complexityEstimate.estimatedCEventScans) },
            { label: "Replications", value: formatEstimate(complexityEstimate.replications) },
          ].map(item => (
            <div
              key={item.label}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                minWidth: 112,
                padding: "8px 10px",
              }}
            >
              <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
          Confidence: {complexityEstimate.confidence}. This estimate uses arrival and service means, so real runs may be smaller or larger.
          {complexityEstimate.scanBasisDescription ? ` Scans per replication: ${formatEstimate(complexityEstimate.estimatedBEventFirings)} B-events × ${complexityEstimate.scanBasisDescription}` : ""}
        </div>
        {lastRunEstimateAccuracy && (
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
            Last run: {lastRunEstimateAccuracy.scansRatio != null ? `${lastRunEstimateAccuracy.scansRatio}×` : "n/a"} scans, {lastRunEstimateAccuracy.entitiesRatio != null ? `${lastRunEstimateAccuracy.entitiesRatio}×` : "n/a"} entities vs. estimate.
          </div>
        )}
        {complexityEstimate.unknowns.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {complexityEstimate.unknowns.slice(0, 2).map((item, index) => (
              <div
                key={`${index}-${item}`}
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  color: C.muted,
                  fontFamily: FONT,
                  fontSize: 11,
                  padding: "8px 10px",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
        </div>}
      </div>
      </>
      )}
    </div>
  );
}

/** Status chip at the start of the Run toolbar (blockers / warnings / ready).
 * It used to be a disabled button, so it looked greyed out and did nothing;
 * clicking it now opens the readiness strip's details and scrolls to them. */
export function RunReadinessStatusButton({ runAdmission, onShowDetails }) {
  const blockers = runAdmission.hardErrors.length;
  const warnings = runAdmission.warnings.length;
  const showDetails = () => {
    onShowDetails?.();
    requestAnimationFrame(() => {
      document.querySelector("[data-run-readiness]")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    });
  };
  if (blockers > 0) {
    return (
      <Btn variant="danger" onClick={showDetails} title={`${blockers} blocker(s) must be resolved before running. Click to see them.`}>
        {blockers} blocker{blockers !== 1 ? "s" : ""}
      </Btn>
    );
  }
  if (warnings > 0) {
    return (
      <Btn variant="amber" onClick={showDetails} title={`${warnings} warning(s): the model can run, but they are worth checking. Click to see them.`}>
        {warnings} warning{warnings !== 1 ? "s" : ""}
      </Btn>
    );
  }
  return (
    <Btn variant="success" onClick={showDetails} title="Model is valid and ready to run. Click for run readiness details.">
      ✓ Ready
    </Btn>
  );
}
