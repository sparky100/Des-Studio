// ui/execute/AdaptiveBatchPanel.jsx — Modal panel for the ✦ Explore feature
// Runs an adaptive batch (stepping up replications until CI converges),
// streams an LLM opportunity analysis, and saves results to the DB.
import { useState, useEffect, useRef, useMemo } from "react";
import { runAdaptiveBatch } from "../../engine/adaptive-batch.js";
import { buildBatchAnalysisPrompt } from "../../llm/prompts.js";
import { streamNarrative } from "../../llm/apiClient.js";
import { makeBatchResult, CI_METRICS } from "./executeHelpers.js";
import { summarizeReplicationResults } from "../../engine/statistics.js";
import { RUN_ADMISSION_TIERS, getRunAdmission } from "../../engine/run-admission.js";
import { C, FONT, RADIUS, Z, SPACE, SHADOW } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";

const RISK_LABELS = { small: "Low", medium: "Medium", large: "High", too_large: "Very high" };
const RISK_COLORS = { small: C => C.green, medium: C => C.amber, large: C => C.amber, too_large: C => C.red };

export function AdaptiveBatchPanel({
  model,
  tier,
  schedulesMap = {},
  experimentConfig = {},
  onSave,
  onSaveInsights,
  onGoToResults,
  onClose,
}) {
  const [phase, setPhase] = useState("confirming");
  const [roundHistory, setRoundHistory] = useState([]);
  const [totalReps, setTotalReps] = useState(0);
  const [currentCiPct, setCurrentCiPct] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const [streamedText, setStreamedText] = useState("");
  const [savedRunId, setSavedRunId] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const baseSeedRef = useRef(Date.now() % 1_000_000);

  const tierPolicy = RUN_ADMISSION_TIERS[tier] || RUN_ADMISSION_TIERS.free;
  const tierMax = tierPolicy.maxReplications;
  const maxSimTime = experimentConfig.maxSimTime ?? 500;
  const warmupPeriod = experimentConfig.warmupPeriod ?? 0;

  // Run pre-flight admission check synchronously — no simulation started yet
  const admission = useMemo(() => getRunAdmission(model, {
    tier,
    replications: tierMax,
    maxSimTime,
    warmupPeriod,
    terminationMode: "time",
    collectTimeSeries: false,
  }), [model, tier, tierMax, maxSimTime, warmupPeriod]);

  const riskLevel = admission.complexityEstimate?.riskLevel || "small";
  const riskColor = (RISK_COLORS[riskLevel] || (C => C.muted))(C);
  const hasHardErrors = admission.hardErrors.length > 0;
  const hasWarnings = admission.warnings.length > 0;

  // Cleanup workers on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function handleProceed() {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("running");
    runPipeline(controller.signal);
  }

  async function runPipeline(signal) {
    try {
      const adaptiveResult = await runAdaptiveBatch({
        model,
        tier,
        baseSeed: baseSeedRef.current,
        warmupPeriod,
        maxSimTime,
        schedulesMap,
        signal,
        onRoundComplete: ({ totalReps: reps, relativeHalfWidth }) => {
          setTotalReps(reps);
          setCurrentCiPct(relativeHalfWidth != null ? +relativeHalfWidth.toFixed(1) : null);
          setRoundHistory(prev => [...prev, { reps, relativeHalfWidth }]);
        },
      });
      setBatchResult(adaptiveResult);
      setTotalReps(adaptiveResult.finalReps);

      const aggregateStats = summarizeReplicationResults(adaptiveResult.results, CI_METRICS);
      const combinedResult = makeBatchResult(adaptiveResult.results, aggregateStats, maxSimTime, warmupPeriod);

      let runId = null;
      if (onSave) {
        try {
          runId = await onSave(combinedResult, {
            replications: adaptiveResult.finalReps,
            maxTime: maxSimTime,
            warmupPeriod,
            seed: baseSeedRef.current,
            runLabel: `✦ Explore (${adaptiveResult.finalReps} reps)`,
          });
          setSavedRunId(runId);
        } catch { /* non-fatal — proceed to analysis */ }
      }

      setPhase("analysing");
      const prompt = buildBatchAnalysisPrompt(
        model,
        combinedResult,
        aggregateStats,
        {
          kpiPath: adaptiveResult.kpiPath,
          ci: adaptiveResult.ci,
          converged: adaptiveResult.converged,
          finalReps: adaptiveResult.finalReps,
          relativeHalfWidth: adaptiveResult.relativeHalfWidth,
        },
        tier
      );

      let accumulated = "";
      await streamNarrative(prompt, {
        signal,
        onToken: token => {
          accumulated += token;
          setStreamedText(accumulated);
        },
        onComplete: async () => {
          setPhase("done");
          if (runId && onSaveInsights && accumulated) {
            try {
              await onSaveInsights(runId, {
                summary: accumulated.slice(0, 500),
                savedAt: new Date().toISOString(),
              });
            } catch { /* non-fatal */ }
          }
        },
        onError: err => {
          setError(err?.message || "Analysis unavailable");
          setPhase("done");
        },
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        setPhase("cancelled");
        return;
      }
      setError(err?.message || "Run failed");
      setPhase("error");
    }
  }

  const pct = tierMax > 0 ? Math.round((totalReps / tierMax) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Explore panel"
      style={{
        position: "fixed", inset: 0, zIndex: Z.modal,
        background: C.overlay,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: SPACE.lg,
      }}
      onClick={e => { if (e.target === e.currentTarget && phase === "confirming") onClose?.(); }}
    >
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.overlay,
        width: "100%",
        maxWidth: 560,
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{
          padding: `${SPACE.md}px ${SPACE.lg}px`,
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: SPACE.sm,
          flexShrink: 0,
        }}>
          <span style={{ color: C.accent, fontSize: 14 }}>✦</span>
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: C.text, flex: 1 }}>
            Explore
          </span>
          <span style={{ fontFamily: FONT, fontSize: 11, color: C.muted }}>
            {tier} plan · max {tierMax} reps
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: SPACE.lg }}>

          {/* ── Confirming phase ── */}
          {phase === "confirming" && (
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                Explore will run up to <strong style={{ color: C.accent }}>{tierMax} replications</strong> ({tier} plan),
                stepping up in batches until the 95% confidence interval is within ±5% of the mean,
                then stream an AI opportunity analysis.
              </div>

              {/* Model complexity row */}
              <div style={{
                display: "flex", gap: SPACE.md, padding: `${SPACE.sm}px ${SPACE.md}px`,
                background: C.panel, borderRadius: RADIUS.md,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontSize: 10, color: C.muted, letterSpacing: "0.8px", textTransform: "uppercase" }}>
                    Model complexity
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: riskColor, marginTop: 2 }}>
                    {RISK_LABELS[riskLevel] || "Unknown"}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontSize: 10, color: C.muted, letterSpacing: "0.8px", textTransform: "uppercase" }}>
                    Run duration
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: C.text, marginTop: 2 }}>
                    {maxSimTime.toLocaleString()} time units
                    {warmupPeriod > 0 && ` (+${warmupPeriod} warmup)`}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontSize: 10, color: C.muted, letterSpacing: "0.8px", textTransform: "uppercase" }}>
                    Target CI
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: C.text, marginTop: 2 }}>
                    ±5% of mean
                  </div>
                </div>
              </div>

              {/* Hard errors — block proceed */}
              {hasHardErrors && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: SPACE.xs,
                  padding: `${SPACE.sm}px ${SPACE.md}px`,
                  background: C.errorBg, borderRadius: RADIUS.md,
                  border: `1px solid ${C.danger}`,
                }}>
                  <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: C.error }}>
                    Cannot run — fix these issues first:
                  </div>
                  {admission.hardErrors.map((e, i) => (
                    <div key={i} style={{ fontFamily: FONT, fontSize: 11, color: C.error }}>
                      · {e.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings — show but allow proceed */}
              {!hasHardErrors && hasWarnings && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: SPACE.xs,
                  padding: `${SPACE.sm}px ${SPACE.md}px`,
                  background: C.panel, borderRadius: RADIUS.md,
                  border: `1px solid ${C.amber}`,
                }}>
                  <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: C.amber }}>
                    Warnings — you can still proceed:
                  </div>
                  {admission.warnings.map((w, i) => (
                    <div key={i} style={{ fontFamily: FONT, fontSize: 11, color: C.amber }}>
                      · {w.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Running phase ── */}
          {phase === "running" && (
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
                Running adaptive batch — stepping up replications to achieve statistical confidence...
              </div>
              <div style={{
                height: 6, borderRadius: RADIUS.sm,
                background: C.panel, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: C.accent,
                  borderRadius: RADIUS.sm,
                  transition: "width 300ms ease",
                }} />
              </div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted }}>
                {totalReps} / {tierMax} replications
                {currentCiPct != null && ` — CI ±${currentCiPct}%`}
              </div>
            </div>
          )}

          {/* ── Analysing + done phases ── */}
          {(phase === "analysing" || phase === "done") && (
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
              {batchResult && (
                <div style={{
                  padding: `${SPACE.sm}px ${SPACE.md}px`,
                  background: C.panel,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${batchResult.converged ? C.green : C.amber}`,
                }}>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: batchResult.converged ? C.green : C.amber }}>
                    {batchResult.converged
                      ? `✓ Confidence achieved: ±${batchResult.relativeHalfWidth?.toFixed(1)}% with ${batchResult.finalReps} replication${batchResult.finalReps !== 1 ? "s" : ""}`
                      : `⚠ Tier limit reached (${batchResult.finalReps} reps)${batchResult.relativeHalfWidth != null ? ` — CI ±${batchResult.relativeHalfWidth.toFixed(1)}%` : ""} — results are indicative`}
                  </span>
                </div>
              )}
              {phase === "analysing" && !streamedText && (
                <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
                  Analysing results...
                </div>
              )}
              {streamedText && (
                <div
                  aria-live={phase === "analysing" ? "polite" : "off"}
                  style={{
                    fontFamily: FONT, fontSize: 12, color: C.text,
                    lineHeight: 1.65, whiteSpace: "pre-wrap",
                  }}
                >
                  {streamedText}
                  {phase === "analysing" && (
                    <span style={{ color: C.accent }}>▌</span>
                  )}
                </div>
              )}
              {error && (
                <div style={{
                  padding: `${SPACE.sm}px ${SPACE.md}px`,
                  background: C.errorBg,
                  borderRadius: RADIUS.md,
                  fontFamily: FONT, fontSize: 11, color: C.error,
                }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Cancelled phase ── */}
          {phase === "cancelled" && (
            <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
              Exploration cancelled.
              {roundHistory.length > 0
                ? ` Completed ${totalReps} replication${totalReps !== 1 ? "s" : ""} before stopping.`
                : ""}
            </div>
          )}

          {/* ── Error phase ── */}
          {phase === "error" && (
            <div style={{
              padding: `${SPACE.sm}px ${SPACE.md}px`,
              background: C.errorBg,
              borderRadius: RADIUS.md,
              fontFamily: FONT, fontSize: 12, color: C.error,
            }}>
              {error || "An unexpected error occurred."}
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: `${SPACE.sm}px ${SPACE.lg}px`,
          borderTop: `1px solid ${C.border}`,
          display: "flex", gap: SPACE.sm, justifyContent: "flex-end",
          flexShrink: 0,
        }}>
          {phase === "confirming" && (
            <>
              <Btn small variant="ghost" onClick={onClose}>Cancel</Btn>
              {!hasHardErrors && (
                <Btn small variant="primary" onClick={handleProceed}>
                  {hasWarnings ? "Proceed anyway" : "Proceed"}
                </Btn>
              )}
            </>
          )}
          {phase === "running" && (
            <Btn small variant="ghost" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Btn>
          )}
          {phase === "done" && savedRunId && (
            <Btn small variant="primary" onClick={onGoToResults}>
              View Results
            </Btn>
          )}
          {(phase === "done" || phase === "cancelled" || phase === "error") && (
            <Btn small variant="ghost" onClick={onClose}>
              Close
            </Btn>
          )}
        </div>

      </div>
    </div>
  );
}
