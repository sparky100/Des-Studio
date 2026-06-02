// ui/execute/AdaptiveBatchPanel.jsx — Modal panel for the ✦ Explore feature
// Runs an adaptive batch (stepping up replications until CI converges),
// streams an LLM opportunity analysis, and saves results to the DB.
import { useState, useEffect, useRef, useMemo } from "react";
import { runAdaptiveBatch } from "../../engine/adaptive-batch.js";
import { buildBatchAnalysisPrompt, buildApplyOpportunityPrompt, parseSuggestionResponse, applySuggestionPatch } from "../../llm/prompts.js";
import { streamNarrative, streamModelBuilder, callLLMOnce } from "../../llm/apiClient.js";
import { buildModelBuilderSystemPrompt, buildModelBuilderUserMessage } from "../../llm/model-builder-prompts.js";
import { makeBatchResult, CI_METRICS } from "./executeHelpers.js";
import { summarizeReplicationResults } from "../../engine/statistics.js";
import { RUN_ADMISSION_TIERS, getRunAdmission } from "../../engine/run-admission.js";
import { RADIUS, Z, SPACE, SHADOW } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { ModelDiffPreview } from "../editors/ModelDiffPreview.jsx";
import { SummaryCardGrid } from "../results/ResultsWorkspace.jsx";

const RISK_LABELS = { small: "Low", medium: "Medium", large: "High", too_large: "Very high" };

function renderMarkdown(text, C, FONT, onApplyItem) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let key = 0;
  let inBottleneckSection = false;

  const inlineBold = (str) => {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i} style={{ color: C.text, fontWeight: 700 }}>{part.slice(2, -2)}</strong>
        : part
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^### (.+)/.test(line)) {
      const heading = line.replace(/^### /, "");
      inBottleneckSection = /bottleneck/i.test(heading);
      elements.push(
        <div key={key++} style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: "1.1px", textTransform: "uppercase", marginTop: 14, marginBottom: 4, fontFamily: FONT }}>
          {heading}
        </div>
      );
    } else if (/^## (.+)/.test(line)) {
      const heading = line.replace(/^## /, "");
      inBottleneckSection = /bottleneck/i.test(heading);
      elements.push(
        <div key={key++} style={{ fontSize: 12, fontWeight: 700, color: C.text, marginTop: 12, marginBottom: 4, fontFamily: FONT }}>
          {heading}
        </div>
      );
    } else if (/^\d+\. /.test(line)) {
      const itemText = line.replace(/^\d+\. /, "");
      const showApply = onApplyItem && !inBottleneckSection;
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 6, marginTop: 6, fontFamily: FONT, fontSize: 12, color: C.text, lineHeight: 1.6, alignItems: "flex-start" }}>
          <span style={{ color: C.accent, flexShrink: 0, fontWeight: 700 }}>{line.match(/^(\d+)\./)[1]}.</span>
          <span style={{ flex: 1 }}>{inlineBold(itemText)}</span>
          {showApply && (
            <button
              type="button"
              onClick={() => onApplyItem(itemText)}
              style={{
                flexShrink: 0,
                background: "transparent",
                border: `1px solid ${C.accent}`,
                borderRadius: 4,
                color: C.accent,
                fontFamily: FONT,
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                cursor: "pointer",
                lineHeight: 1.6,
                whiteSpace: "nowrap",
              }}
            >
              Apply ↗
            </button>
          )}
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} style={{ height: 4 }} />);
    } else {
      elements.push(
        <div key={key++} style={{ fontFamily: FONT, fontSize: 12, color: C.text, lineHeight: 1.65 }}>
          {inlineBold(line)}
        </div>
      );
    }
  }
  return elements;
}
const RISK_COLORS = { small: C => C.green, medium: C => C.amber, large: C => C.amber, too_large: C => C.red };

export function AdaptiveBatchPanel({
  model,
  tier,
  schedulesMap = {},
  experimentConfig = {},
  onSave,
  onSaveInsights,
  onGoToResults,
  onApplyModel,
  onClose,
}) {
  const { C, FONT } = useTheme();
  const [phase, setPhase] = useState("confirming");
  const [roundHistory, setRoundHistory] = useState([]);
  const [totalReps, setTotalReps] = useState(0);
  const [currentCiPct, setCurrentCiPct] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const [combinedBatchResult, setCombinedBatchResult] = useState(null);
  const [replicationResults, setReplicationResults] = useState([]);
  const [streamedText, setStreamedText] = useState("");
  const [savedRunId, setSavedRunId] = useState(null);
  const [error, setError] = useState(null);
  const [applyPhase, setApplyPhase] = useState("idle"); // "idle" | "generating" | "preview" | "apply-error"
  const [proposedModel, setProposedModel] = useState(null);
  const [proposalExplanation, setProposalExplanation] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const applyAbortRef = useRef(null);
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
    return () => {
      abortRef.current?.abort();
      applyAbortRef.current?.abort();
    };
  }, []);

  function handleProceed() {
    if (hasHardErrors) {
      setError("Fix the blocking issues before running Explore.");
      return;
    }
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
      setCombinedBatchResult(combinedResult);
      setReplicationResults(adaptiveResult.results);

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

  async function startApply(opportunityText) {
    if (!onApplyModel) return;
    applyAbortRef.current?.abort();
    const controller = new AbortController();
    applyAbortRef.current = controller;
    setApplyPhase("generating");
    setApplyError(null);
    setProposedModel(null);
    setProposalExplanation(null);

    try {
      // Step 1: structured patch approach — same schema as the Analyse panel
      const applyPrompt = buildApplyOpportunityPrompt(opportunityText, model, batchResult || null);
      const rawText = await callLLMOnce(applyPrompt);

      if (controller.signal.aborted) return;

      const { analysis, suggestions } = parseSuggestionResponse(rawText);
      const suggestion = suggestions?.[0];

      if (suggestion?.change && suggestion.change.type !== "manual") {
        const patched = applySuggestionPatch(model, suggestion.change);
        const changeDesc = `${suggestion.change.target}: ${suggestion.change.from} → ${suggestion.change.to}`;
        setProposedModel(patched);
        setProposalExplanation(analysis || `${changeDesc}. ${suggestion.predicted || ""}`);
        setApplyPhase("preview");
        return;
      }

      // Step 2: structural / manual change — fall back to full model builder
      const systemPrompt = buildModelBuilderSystemPrompt();
      const userMessage = buildModelBuilderUserMessage(
        `Apply the following improvement to the model. Respond with intent "refine" and include the complete updated model.\n\nImprovement: ${opportunityText}`,
        model,
        batchResult || null
      );
      const response = await streamModelBuilder(systemPrompt, [{ role: "user", content: userMessage }], {
        signal: controller.signal,
        onToken: () => {},
        onError: (err) => {
          setApplyError(err?.message || "Failed to generate model change.");
          setApplyPhase("apply-error");
        },
      });

      if (controller.signal.aborted) return;

      if (!response?.proposedModel) {
        setApplyError(
          response?.explanation || analysis ||
          "This improvement requires structural changes that cannot be applied automatically. Please edit the model manually."
        );
        setApplyPhase("apply-error");
        return;
      }

      setProposedModel(response.proposedModel);
      setProposalExplanation(response.explanation || null);
      setApplyPhase("preview");
    } catch (err) {
      if (controller.signal.aborted) return;
      setApplyError(err?.message || "Failed to generate model change.");
      setApplyPhase("apply-error");
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
                Explore will run up to <strong style={{ color: C.accent }}>{tierMax} replications</strong> of the model,
                stepping up in batches until the 95% confidence interval is within ±5% of the mean,
                then provide an analysis of the results.
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
              {combinedBatchResult && (
                <SummaryCardGrid results={combinedBatchResult} replicationResults={replicationResults} />
              )}
              {phase === "analysing" && !streamedText && (
                <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
                  Analysing results...
                </div>
              )}
              {streamedText && (
                <div aria-live={phase === "analysing" ? "polite" : "off"}>
                  {renderMarkdown(
                    streamedText,
                    C,
                    FONT,
                    phase === "done" && onApplyModel ? startApply : undefined
                  )}
                  {phase === "analysing" && (
                    <span style={{ color: C.accent, fontFamily: FONT }}>▌</span>
                  )}
                </div>
              )}

              {/* ── Apply-generating overlay ── */}
              {applyPhase === "generating" && (
                <div style={{
                  marginTop: SPACE.md,
                  padding: `${SPACE.sm}px ${SPACE.md}px`,
                  background: C.panel,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", gap: SPACE.sm,
                }}>
                  <span style={{ color: C.accent, fontFamily: FONT }}>▌</span>
                  <span style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
                    Generating model change…
                  </span>
                  <button
                    type="button"
                    onClick={() => { applyAbortRef.current?.abort(); setApplyPhase("idle"); }}
                    style={{ marginLeft: "auto", background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11 }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* ── Apply-error ── */}
              {applyPhase === "apply-error" && applyError && (
                <div style={{
                  marginTop: SPACE.md,
                  padding: `${SPACE.sm}px ${SPACE.md}px`,
                  background: C.errorBg,
                  borderRadius: RADIUS.md,
                  display: "flex", alignItems: "center", gap: SPACE.sm,
                }}>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: C.error, flex: 1 }}>{applyError}</span>
                  <button
                    type="button"
                    onClick={() => setApplyPhase("idle")}
                    style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11 }}
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* ── ModelDiffPreview ── */}
              {applyPhase === "preview" && proposedModel && (
                <div style={{ marginTop: SPACE.md }}>
                  <ModelDiffPreview
                    currentModel={model}
                    proposedModel={proposedModel}
                    llmExplanation={proposalExplanation}
                    onApply={(merged) => { onApplyModel(merged); onClose?.(); }}
                    onDiscard={() => setApplyPhase("idle")}
                  />
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
