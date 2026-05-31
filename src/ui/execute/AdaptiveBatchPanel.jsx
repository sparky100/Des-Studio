// ui/execute/AdaptiveBatchPanel.jsx — Modal panel for the ✦ Explore feature
// Runs an adaptive batch (stepping up replications until CI converges),
// streams an LLM opportunity analysis, and saves results to the DB.
import { useState, useEffect, useRef } from "react";
import { runAdaptiveBatch } from "../../engine/adaptive-batch.js";
import { buildBatchAnalysisPrompt } from "../../llm/prompts.js";
import { streamNarrative } from "../../llm/apiClient.js";
import { makeBatchResult, CI_METRICS } from "./executeHelpers.js";
import { summarizeReplicationResults } from "../../engine/statistics.js";
import { RUN_ADMISSION_TIERS } from "../../engine/run-admission.js";
import { C, FONT, RADIUS, Z, SPACE, SHADOW } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";

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
  const [phase, setPhase] = useState("running");
  const [roundHistory, setRoundHistory] = useState([]);
  const [totalReps, setTotalReps] = useState(0);
  const [currentCiPct, setCurrentCiPct] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const [streamedText, setStreamedText] = useState("");
  const [savedRunId, setSavedRunId] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const baseSeedRef = useRef(Date.now() % 1_000_000);

  const tierMax = (RUN_ADMISSION_TIERS[tier] || RUN_ADMISSION_TIERS.free).maxReplications;

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    runPipeline(controller.signal);
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPipeline(signal) {
    try {
      const adaptiveResult = await runAdaptiveBatch({
        model,
        tier,
        baseSeed: baseSeedRef.current,
        warmupPeriod: experimentConfig.warmupPeriod ?? 0,
        maxSimTime: experimentConfig.maxSimTime ?? 500,
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

      const maxTime = experimentConfig.maxSimTime ?? 500;
      const warmup = experimentConfig.warmupPeriod ?? 0;
      const aggregateStats = summarizeReplicationResults(adaptiveResult.results, CI_METRICS);
      const combinedResult = makeBatchResult(adaptiveResult.results, aggregateStats, maxTime, warmup);

      let runId = null;
      if (onSave) {
        try {
          runId = await onSave(combinedResult, {
            replications: adaptiveResult.finalReps,
            maxTime,
            warmupPeriod: warmup,
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
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
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

          {phase === "cancelled" && (
            <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
              Exploration cancelled.
              {roundHistory.length > 0
                ? ` Completed ${totalReps} replication${totalReps !== 1 ? "s" : ""} before stopping.`
                : ""}
            </div>
          )}

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
