// ui/execute/AdaptiveBatchPanel.jsx — Modal panel for the ✦ Explore feature
// Runs an adaptive batch (stepping up replications until CI converges),
// streams an LLM opportunity analysis, and saves results to the DB.
import { useState, useEffect, useRef, useMemo } from "react";
import { runAdaptiveBatch } from "../../engine/adaptive-batch.js";
import { runReplications } from "../../engine/replication-runner.js";
import { buildBatchAnalysisPrompt, buildApplyOpportunityPrompt, parseSuggestionResponse, applySuggestionPatch } from "../../llm/prompts.js";
import { streamNarrative, streamModelBuilder, callLLMOnce } from "../../llm/apiClient.js";
import { buildModelBuilderSystemPrompt, buildModelBuilderUserMessage } from "../../llm/model-builder-prompts.js";
import { makeBatchResult, CI_METRICS } from "./executeHelpers.js";
import { summarizeReplicationResults, compareScenarios } from "../../engine/statistics.js";
import { RUN_ADMISSION_TIERS, getRunAdmission } from "../../engine/run-admission.js";
import { RADIUS, Z, SPACE, SHADOW } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { ModelDiffPreview } from "../editors/ModelDiffPreview.jsx";
import { SummaryCardGrid } from "../results/ResultsWorkspace.jsx";
import { ScenarioComparisonTable } from "../shared/ScenarioComparisonTable.jsx";

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

function parseOptions(text) {
  if (!text) return [];
  const lines = text.split("\n");
  const options = [];
  let inAutomatable = false;
  for (const line of lines) {
    if (/^###? /.test(line)) inAutomatable = /automatable/i.test(line);
    if (!inAutomatable) continue;
    const m = line.match(/^(\d+)\. (.+)/);
    if (m) options.push(m[2].trim());
  }
  return options;
}

function getResultPathValue(obj, path) {
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

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
  const [checkpointData, setCheckpointData] = useState(null); // null | { totalReps, relativeHalfWidth }
  const [exploreTab, setExploreTab] = useState("analysis"); // "analysis" | "options"
  const [comparisonStates, setComparisonStates] = useState({}); // { [idx]: { status, patchedModel, comparison, explanation, error } }
  const applyAbortRef = useRef(null);
  const abortRef = useRef(null);
  const baseSeedRef = useRef(Date.now() % 1_000_000);
  const checkpointResolveRef = useRef(null);

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

  // Complexity label uses single-rep estimate — the multi-rep multiplier (500) inflates
  // the scan count and makes all non-trivial models appear "Very high"
  const singleRepAdmission = useMemo(() => getRunAdmission(model, {
    tier,
    replications: 1,
    maxSimTime,
    warmupPeriod,
    terminationMode: "time",
    collectTimeSeries: false,
  }), [model, tier, maxSimTime, warmupPeriod]);

  const riskLevel = singleRepAdmission.complexityEstimate?.riskLevel || "small";
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

  function handleCheckpointContinue() {
    setCheckpointData(null);
    checkpointResolveRef.current?.(true);
  }

  function handleCheckpointStop() {
    setCheckpointData(null);
    checkpointResolveRef.current?.(false);
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
        onCheckpoint: ({ totalReps: reps, relativeHalfWidth }) =>
          new Promise(resolve => {
            setCheckpointData({ totalReps: reps, relativeHalfWidth });
            checkpointResolveRef.current = resolve;
          }),
      });
      setBatchResult(adaptiveResult);
      setTotalReps(adaptiveResult.finalReps);

      const aggregateStats = summarizeReplicationResults(adaptiveResult.results, CI_METRICS);
      const combinedResult = {
        ...makeBatchResult(adaptiveResult.results, aggregateStats, maxSimTime, warmupPeriod),
        aggregateStats,
      };
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
            aggregateStats,
            // Embed the experiment config so _experiment_config is written into
            // results_json and the replication count is never reconstructed from
            // the wrong fallback (e.g. the initial-batch size of 5).
            experimentConfig: {
              replications: adaptiveResult.finalReps,
              maxSimTime,
              warmupPeriod,
              seed: baseSeedRef.current,
              terminationMode: 'time',
            },
            replicationResults: adaptiveResult.results.map(p => ({
              replicationIndex: p.replicationIndex,
              seed: p.seed,
              summary: p.result?.summary || {},
              finalTime: p.result?.finalTime,
            })),
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

  async function runComparison(idx, optionText) {
    if (!onApplyModel) return;
    setComparisonStates(prev => ({ ...prev, [idx]: { status: 'generating' } }));
    try {
      const applyPrompt = buildApplyOpportunityPrompt(optionText, model, batchResult || null);
      const rawText = await callLLMOnce(applyPrompt);
      const { analysis, suggestions } = parseSuggestionResponse(rawText);
      const suggestion = suggestions?.[0];
      if (!suggestion?.change || suggestion.change.type === 'manual') {
        setComparisonStates(prev => ({ ...prev, [idx]: { status: 'error', error: 'This change requires manual model edits — use Apply ↗ in the Analysis tab.' } }));
        return;
      }
      const patched = applySuggestionPatch(model, suggestion.change);
      setComparisonStates(prev => ({ ...prev, [idx]: { status: 'running', patchedModel: patched } }));
      const finalReps = batchResult?.finalReps || 10;
      const patchedResults = await new Promise((resolve, reject) => {
        runReplications({
          model: patched,
          replications: finalReps,
          baseSeed: baseSeedRef.current,
          warmupPeriod,
          maxSimTime,
          schedulesMap,
          collectTimeSeries: false,
          onComplete: resolve,
          onError: reject,
        });
      });
      const baselineReps = batchResult?.results || [];
      const comparison = compareScenarios(baselineReps, patchedResults, CI_METRICS, {
        labelA: 'Baseline',
        labelB: 'With change',
      });
      const meansA = {};
      const meansB = {};
      for (const m of CI_METRICS) {
        const valsA = baselineReps.map(r => getResultPathValue(r?.result, m)).filter(v => Number.isFinite(v));
        const valsB = (Array.isArray(patchedResults) ? patchedResults : []).map(r => getResultPathValue(r?.result, m)).filter(v => Number.isFinite(v));
        meansA[m] = valsA.length > 0 ? valsA.reduce((s, v) => s + v, 0) / valsA.length : null;
        meansB[m] = valsB.length > 0 ? valsB.reduce((s, v) => s + v, 0) / valsB.length : null;
      }
      setComparisonStates(prev => ({ ...prev, [idx]: {
        status: 'done',
        patchedModel: patched,
        comparison: { ...comparison, meansA, meansB },
        explanation: analysis || suggestion.predicted || '',
      }}));
    } catch (err) {
      setComparisonStates(prev => ({ ...prev, [idx]: { status: 'error', error: err?.message || 'Comparison failed.' } }));
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
                {tier === 'pro' && (
                  <span style={{ color: C.muted }}> You will be prompted at 100 reps to continue further if needed.</span>
                )}
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
          {(phase === "running" || phase === "checkpoint") && (
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
              {!checkpointData && (
                <>
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
                </>
              )}

              {/* ── Checkpoint dialog ── */}
              {checkpointData && (() => {
                const rhw = checkpointData.relativeHalfWidth;
                const interpretation = rhw == null
                  ? "Statistical precision cannot yet be measured — the model may need more variation across runs."
                  : rhw < 5
                  ? "Results have already converged — the model is statistically stable at this sample size."
                  : rhw < 10
                  ? "Good precision achieved. Running more replications will tighten the confidence interval further."
                  : "Results are still variable. Continuing would significantly improve reliability.";
                return (
                  <div style={{
                    background: C.panel,
                    border: `1px solid ${C.accent}`,
                    borderRadius: RADIUS.md,
                    padding: SPACE.md,
                    display: "flex", flexDirection: "column", gap: SPACE.sm,
                  }}>
                    <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: C.text }}>
                      {checkpointData.totalReps} replications complete
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 12, color: C.accent }}>
                      95% CI precision:{" "}
                      {rhw != null
                        ? `±${rhw.toFixed(1)}% of mean`
                        : "not yet measurable"}
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                      {interpretation}
                    </div>
                    <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.xs }}>
                      <Btn small variant="primary" onClick={handleCheckpointContinue}>
                        Continue to 500 reps
                      </Btn>
                      <Btn small variant="ghost" onClick={handleCheckpointStop}>
                        Stop here — use these results
                      </Btn>
                    </div>
                  </div>
                );
              })()}
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
                  <span style={{ fontFamily: FONT, fontSize: 11, color: batchResult.converged ? C.green : batchResult.stoppedAtCheckpoint ? C.text : C.amber }}>
                    {batchResult.converged
                      ? `✓ Confidence achieved: ±${batchResult.relativeHalfWidth?.toFixed(1)}% with ${batchResult.finalReps} replication${batchResult.finalReps !== 1 ? "s" : ""}`
                      : batchResult.stoppedAtCheckpoint
                      ? `✓ Stopped at ${batchResult.finalReps} replications${batchResult.relativeHalfWidth != null ? ` — CI ±${batchResult.relativeHalfWidth.toFixed(1)}%` : ""}`
                      : `⚠ Tier limit reached (${batchResult.finalReps} reps)${batchResult.relativeHalfWidth != null ? ` — CI ±${batchResult.relativeHalfWidth.toFixed(1)}%` : ""} — results are indicative`}
                  </span>
                </div>
              )}
              {combinedBatchResult && (
                <SummaryCardGrid results={combinedBatchResult} replicationResults={replicationResults} />
              )}

              {/* ── Tab headers ── */}
              {(() => {
                const options = parseOptions(streamedText);
                return (
                  <>
                    <div style={{ display: "flex", gap: 6, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                      {["analysis", "options"].map(tab => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setExploreTab(tab)}
                          style={{
                            background: exploreTab === tab ? C.accent : "transparent",
                            border: `1px solid ${exploreTab === tab ? C.accent : C.border}`,
                            borderRadius: RADIUS.sm,
                            color: exploreTab === tab ? C.surface : C.text,
                            fontFamily: FONT, fontSize: 11, fontWeight: 700,
                            padding: "3px 10px", cursor: "pointer",
                          }}
                        >
                          {tab === "analysis" ? "Analysis" : `Options${options.length > 0 ? ` (${options.length})` : ""}`}
                        </button>
                      ))}
                    </div>

                    {/* ── Analysis tab ── */}
                    {exploreTab === "analysis" && (
                      <div>
                        {phase === "analysing" && !streamedText && (
                          <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
                            Analysing results...
                          </div>
                        )}
                        {streamedText && (
                          <div aria-live={phase === "analysing" ? "polite" : "off"}>
                            {renderMarkdown(streamedText, C, FONT, null)}
                            {phase === "analysing" && (
                              <span style={{ color: C.accent, fontFamily: FONT }}>▌</span>
                            )}
                          </div>
                        )}
                        {/* Legacy apply overlays (used when starting apply from Analysis tab) */}
                        {applyPhase === "generating" && (
                          <div style={{ marginTop: SPACE.md, padding: `${SPACE.sm}px ${SPACE.md}px`, background: C.panel, borderRadius: RADIUS.md, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: SPACE.sm }}>
                            <span style={{ color: C.accent, fontFamily: FONT }}>▌</span>
                            <span style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>Generating model change…</span>
                            <button type="button" onClick={() => { applyAbortRef.current?.abort(); setApplyPhase("idle"); }} style={{ marginLeft: "auto", background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11 }}>Cancel</button>
                          </div>
                        )}
                        {applyPhase === "apply-error" && applyError && (
                          <div style={{ marginTop: SPACE.md, padding: `${SPACE.sm}px ${SPACE.md}px`, background: C.errorBg, borderRadius: RADIUS.md, display: "flex", alignItems: "center", gap: SPACE.sm }}>
                            <span style={{ fontFamily: FONT, fontSize: 11, color: C.error, flex: 1 }}>{applyError}</span>
                            <button type="button" onClick={() => setApplyPhase("idle")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11 }}>Dismiss</button>
                          </div>
                        )}
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
                      </div>
                    )}

                    {/* ── Options tab ── */}
                    {exploreTab === "options" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
                        {phase === "analysing" && options.length === 0 && (
                          <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
                            Identifying improvement options…
                          </div>
                        )}
                        {options.length === 0 && phase === "done" && (
                          <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
                            No numbered options found in analysis. Check the Analysis tab.
                          </div>
                        )}
                        {options.map((optText, idx) => {
                          const cs = comparisonStates[idx];
                          return (
                            <div key={idx} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: SPACE.md, display: "flex", flexDirection: "column", gap: SPACE.sm }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: SPACE.sm }}>
                                <span style={{ color: C.accent, fontFamily: FONT, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{idx + 1}.</span>
                                <span style={{ fontFamily: FONT, fontSize: 12, color: C.text, flex: 1, lineHeight: 1.55 }}>{optText}</span>
                                {onApplyModel && (!cs || cs.status === 'idle') && phase === "done" && (
                                  <Btn small variant="ghost" onClick={() => runComparison(idx, optText)} style={{ flexShrink: 0 }}>
                                    Run Comparison
                                  </Btn>
                                )}
                              </div>
                              {cs?.status === 'generating' && (
                                <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted }}>
                                  ▌ Generating model patch…
                                </div>
                              )}
                              {cs?.status === 'running' && (
                                <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted }}>
                                  ▌ Running {batchResult?.finalReps || 10} replications of patched model…
                                </div>
                              )}
                              {cs?.status === 'error' && (
                                <div style={{ fontFamily: FONT, fontSize: 11, color: C.error }}>
                                  {cs.error}
                                </div>
                              )}
                              {cs?.status === 'done' && cs.comparison && (
                                <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
                                  {cs.explanation && (
                                    <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                                      {cs.explanation}
                                    </div>
                                  )}
                                  <ScenarioComparisonTable comparison={cs.comparison} />
                                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                    <Btn small variant="primary" onClick={() => { onApplyModel(cs.patchedModel); onClose?.(); }}>
                                      Apply to Model
                                    </Btn>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}

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
          {(phase === "running" || phase === "checkpoint") && (
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
