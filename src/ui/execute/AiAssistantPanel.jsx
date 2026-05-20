// ui/execute/AiAssistantPanel.jsx — AiAssistantPanel

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { useToast } from "../shared/ToastContext.jsx";
import { streamNarrative } from "../../llm/apiClient.js";
import { buildCiResults, buildComparisonPrompt, buildExplainResultsPrompt, buildResultsQueryPrompt, buildSuggestionPrompt, parseSuggestionResponse, applySuggestionPatch } from "../../llm/prompts.js";
import { makeRunPromptPayload, makeRunLabel, makeSavedRunPromptPayload } from "./executeHelpers.js";

function ConfidenceBadge({ confidence }) {
  const color = confidence === "high" ? C.green : confidence === "medium" ? C.amber : C.red;
  return (
    <span style={{ fontSize: 9, fontFamily: FONT, fontWeight: 700, color, border: `1px solid ${color}44`, borderRadius: 3, padding: "1px 5px", letterSpacing: 1 }}>
      {String(confidence || "").toUpperCase()}
    </span>
  );
}

function BeforeAfterTable({ goals, baselineStats, afterStats }) {
  if (!goals || !goals.length) return null;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: FONT, marginTop: 8 }}>
      <thead>
        <tr>
          {["Metric", "Before", "After", "Goal", "Met?"].map(h => (
            <th key={h} scope="col" style={{ textAlign: "left", color: C.muted, padding: "2px 4px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {goals.map(g => {
          const beforeStat = baselineStats?.[g.metric];
          const afterStat = afterStats?.[g.metric];
          const beforeVal = beforeStat?.mean ?? null;
          const afterVal = afterStat?.mean ?? null;
          const met = afterVal !== null
            ? (g.operator === "<"  ? afterVal < g.target
             : g.operator === "<=" ? afterVal <= g.target
             : g.operator === ">"  ? afterVal > g.target
             : g.operator === ">=" ? afterVal >= g.target
             : afterVal === g.target)
            : null;
          const metColor = met === true ? C.green : met === false ? C.red : C.muted;
          const fmt = v => v === null ? "—" : Number.isFinite(v) ? v.toFixed(2) : "—";
          return (
            <tr key={g.metric}>
              <td style={{ color: C.text, padding: "2px 4px" }}>{g.label || g.metric}</td>
              <td style={{ color: C.muted, padding: "2px 4px" }}>{fmt(beforeVal)}</td>
              <td style={{ color: met === true ? C.green : met === false ? C.red : C.text, padding: "2px 4px" }}>{fmt(afterVal)}</td>
              <td style={{ color: C.muted, padding: "2px 4px" }}>{g.operator} {g.target}</td>
              <td style={{ color: metColor, padding: "2px 4px", fontWeight: 700 }}>{met === true ? "Yes" : met === false ? "No" : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SuggestionCard({ suggestion, model, aggregateStats, onRunWithPatch, verifyStatus, verifyResult }) {
  const isManual = suggestion.change?.type === "manual";
  const canApply = !isManual && typeof onRunWithPatch === "function";
  const running = verifyStatus === "running";

  const changeLabel = isManual
    ? "Manual change required"
    : `${suggestion.change?.target} count/capacity/value: ${suggestion.change?.from} -> ${suggestion.change?.to}`;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, marginTop: 8, background: C.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: FONT, fontWeight: 700, color: C.accent, border: `1px solid ${C.accent}44`, borderRadius: 3, padding: "1px 5px" }}>
          #{suggestion.rank}
        </span>
        <ConfidenceBadge confidence={suggestion.confidence} />
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Constraint: </span>{suggestion.constraint}
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Cause: </span>{suggestion.cause}
      </div>
      <div style={{ color: isManual ? C.muted : C.amber, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Proposed: </span>{changeLabel}
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Predicted: </span>{suggestion.predicted}
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 6 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Goal impact: </span>{suggestion.goalImpact}
      </div>
      <Btn
        small
        variant="primary"
        disabled={!canApply || running}
        onClick={() => onRunWithPatch(suggestion)}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {running ? "Running simulation…" : "Run with this change"}
      </Btn>
      {running && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: C.surface, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic", animation: "pulse 1.5s ease-in-out infinite" }}>
            Verifying…
          </div>
        </div>
      )}
      {!running && verifyResult && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>BEFORE / AFTER</div>
          <BeforeAfterTable
            goals={model?.goals || []}
            baselineStats={aggregateStats}
            afterStats={verifyResult.aggregateStats}
          />
        </div>
      )}
    </div>
  );
}

export const AiAssistantPanel = ({
  model,
  results,
  exportConfig,
  aggregateStats,
  comparisonRuns,
  comparisonLoading,
  comparisonError,
  onClose,
  onSaveInsights,
  onRunWithPatch,
}) => {
  const toast = useToast();
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(comparisonRuns[0]?.id || "");
  const [queryText, setQueryText] = useState("");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [savedSummary, setSavedSummary] = useState(null);
  const [activeKind, setActiveKind] = useState(null);
  const [parsedSuggestion, setParsedSuggestion] = useState(null);
  const [verifyStatus, setVerifyStatus] = useState({});
  const [verifyResults, setVerifyResults] = useState({});
  const abortRef = useRef(null);
  const responseAreaRef = useRef(null);
  const ciResults = useMemo(() => buildCiResults(aggregateStats), [aggregateStats]);
  const sensitivityReady = ciResults.some(item => item.n >= 5);
  const isStreaming = status === "loading" || status === "streaming";
  const selectedRun = comparisonRuns.find(run => run.id === selectedRunId);

  useEffect(() => {
    if (!selectedRunId && comparisonRuns[0]) setSelectedRunId(comparisonRuns[0].id);
  }, [comparisonRuns, selectedRunId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (responseAreaRef.current) {
      responseAreaRef.current.scrollTop = responseAreaRef.current.scrollHeight;
    }
  }, [response, conversationHistory]);

  const runPrompt = useCallback((prompt, kind = null) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setResponse("");
    setError("");
    setStatus("loading");
    setActiveKind(kind);
    if (kind !== "suggestion" && kind !== "explainResults") {
      setParsedSuggestion(null);
      setVerifyStatus({});
      setVerifyResults({});
    }

    let accumulated = "";
    streamNarrative(prompt, {
      signal: controller.signal,
      onToken: token => {
        setStatus("streaming");
        accumulated += token;
        setResponse(accumulated);
      },
      onComplete: () => {
        abortRef.current = null;
        setStatus("complete");
        if (kind === "suggestion" || kind === "explainResults") {
          setParsedSuggestion(parseSuggestionResponse(accumulated));
          setResponse("");
        }
      },
      onError: err => {
        abortRef.current = null;
        const msg = err?.message || "Analysis unavailable";
        setError(msg);
        setStatus("error");
        if (/rate.?limit|429/i.test(msg)) toast.warning("AI rate limit reached. Please wait a moment and try again.");
      },
    });
  }, [toast]);

  const runQuery = useCallback((question) => {
    if (!question.trim() || !results) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setStatus("streaming");
    setActiveKind("query");

    const userEntry = { role: "user", content: question };
    setConversationHistory(prev => [...prev, userEntry]);
    setQueryText("");

    const prompt = buildResultsQueryPrompt(
      question,
      model,
      { ...results, aggregateStats },
      conversationHistory
    );

    let accumulated = "";
    streamNarrative(prompt, {
      signal: controller.signal,
      onToken: token => {
        accumulated += token;
        setResponse(accumulated);
      },
      onComplete: () => {
        abortRef.current = null;
        setConversationHistory(prev => [...prev, { role: "assistant", content: accumulated }]);
        setResponse("");
        setStatus("complete");
      },
      onError: err => {
        abortRef.current = null;
        const msg = err?.message || "Query unavailable";
        setError(msg);
        setStatus("error");
        if (/rate.?limit|429/i.test(msg)) toast.warning("AI rate limit reached. Please wait a moment and try again.");
      },
    });
  }, [model, results, aggregateStats, conversationHistory, toast]);

  const stopStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus(response ? "complete" : "idle");
  };

  const copyResponse = () => {
    const textToCopy = response || conversationHistory.map(e =>
      `${e.role === "user" ? "Q" : "A"}: ${e.content}`
    ).join("\n\n");
    if (!textToCopy || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(textToCopy);
  };

  const clearConversation = () => {
    setConversationHistory([]);
    setResponse("");
    setStatus("idle");
    setError("");
    setParsedSuggestion(null);
    setVerifyStatus({});
    setVerifyResults({});
  };

  const explainResults = () => {
    runPrompt(buildExplainResultsPrompt(model, exportConfig, {
      ...results,
      aggregateStats,
    }, ciResults), "explainResults");
  };

  const compareRuns = () => {
    if (!selectedRun) return;
    const comparisonPayload = selectedRun.source === "saved"
      ? makeSavedRunPromptPayload(selectedRun.payload)
      : makeRunPromptPayload(selectedRun.label, selectedRun.payload);

    runPrompt(buildComparisonPrompt(
      model.name,
      makeRunPromptPayload("Current completed run", { results, experiment: exportConfig }),
      comparisonPayload
    ), "comparison");
  };

  const handleApplyAndRerun = useCallback(async (suggestion) => {
    if (!onRunWithPatch) return;
    const rank = suggestion.rank;
    setVerifyStatus(prev => ({ ...prev, [rank]: "running" }));
    try {
      const patched = applySuggestionPatch(model, suggestion.change);
      const result = await onRunWithPatch(patched);
      if (result) {
        setVerifyResults(prev => ({ ...prev, [rank]: result }));
        setVerifyStatus(prev => ({ ...prev, [rank]: "done" }));
      } else {
        setVerifyStatus(prev => ({ ...prev, [rank]: "error" }));
      }
    } catch {
      setVerifyStatus(prev => ({ ...prev, [rank]: "error" }));
    }
  }, [model, onRunWithPatch]);

  const handleQueryKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      runQuery(queryText);
    }
  };

  const panelButtonStyle = { width: "100%", justifyContent: "center" };

  const renderContent = () => {
    if (isStreaming && (activeKind === "suggestion" || activeKind === "explainResults")) {
      return (
        <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11 }}>
          Building suggestions…
        </div>
      );
    }
    if (parsedSuggestion) {
      const analysisText = parsedSuggestion.analysis
        .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      return (
        <div>
          {analysisText && (
            <div style={{ color: C.text, fontFamily: FONT, fontSize: 12, lineHeight: 1.7, marginBottom: 10, whiteSpace: "pre-wrap" }}>
              {analysisText}
            </div>
          )}
          {parsedSuggestion.suggestions.length === 0 && (
            <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11 }}>No structured suggestions found.</div>
          )}
          {parsedSuggestion.suggestions.map(s => (
            <SuggestionCard
              key={s.rank}
              suggestion={s}
              model={model}
              aggregateStats={aggregateStats}
              onRunWithPatch={onRunWithPatch ? (sug) => handleApplyAndRerun(sug) : null}
              verifyStatus={verifyStatus[s.rank]}
              verifyResult={verifyResults[s.rank]}
            />
          ))}
        </div>
      );
    }
    if (conversationHistory.length > 0) {
      return conversationHistory.map((entry, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{
            color: entry.role === "user" ? C.accent : C.text,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 1,
            marginBottom: 4,
          }}>
            {entry.role === "user" ? "YOU" : "AI"}
          </div>
          <div style={{ color: C.text, fontFamily: FONT, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {entry.content}
          </div>
        </div>
      ));
    }
    if (status === "loading") return "Waiting for analysis...";
    if (response) return response;
    return "Run the model to start asking questions.";
  };

  return (
    <aside aria-label="AI assistant" style={{
      width: 320,
      flex: "0 0 320px",
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      minHeight: 520,
      alignSelf: "stretch",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: C.text, fontFamily: FONT, fontWeight: 700 }}>AI Assistant</div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Ask questions about the latest run.</div>
        </div>
        <Btn small variant="ghost" onClick={onClose} ariaLabel="Close AI assistant">x</Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Btn variant="primary" onClick={explainResults} disabled={!results || isStreaming} style={panelButtonStyle}>
          Explain results
        </Btn>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="compare-run" style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>COMPARE WITH</label>
          <select
            id="compare-run"
            value={selectedRunId}
            onChange={event => setSelectedRunId(event.target.value)}
            disabled={!comparisonRuns.length || isStreaming}
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 8px" }}
          >
            {!comparisonRuns.length && <option value="">{comparisonLoading ? "Loading saved runs..." : "No comparison runs"}</option>}
            {comparisonRuns.map(run => <option key={run.id} value={run.id}>{run.label}</option>)}
          </select>
          {comparisonError && (
            <div role="status" style={{ color: C.amber, fontFamily: FONT, fontSize: 10 }}>
              Saved runs unavailable: {comparisonError}
            </div>
          )}
          <Btn variant="ghost" onClick={compareRuns} disabled={!results || !selectedRun || isStreaming} style={panelButtonStyle}>
            Compare
          </Btn>
        </div>
      </div>

      {status === "error" && (
        <div role="alert" style={{ background: C.amber + "18", border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 10, color: C.amber, fontFamily: FONT, fontSize: 11 }}>
          Analysis unavailable - try again. {error}
        </div>
      )}

      <div ref={responseAreaRef} aria-live="polite" aria-label="AI analysis response" style={{
        flex: 1,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 12,
        overflowY: "auto",
        color: (response || parsedSuggestion) ? C.text : C.muted,
        fontFamily: FONT,
        fontSize: 12,
        lineHeight: 1.7,
        whiteSpace: parsedSuggestion ? "normal" : "pre-wrap",
      }}>
        {renderContent()}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isStreaming && <Btn small variant="danger" onClick={stopStream}>Stop</Btn>}
        {status === "complete" && (response || conversationHistory.length > 0) && <Btn small variant="ghost" onClick={copyResponse}>Copy</Btn>}
        {status === "complete" && response && !savedSummary && onSaveInsights && (
          <Btn small variant="primary" onClick={() => {
            const insights = { summary: response.slice(0, 500), recommendation: "", savedAt: new Date().toISOString() };
            onSaveInsights(insights);
            setSavedSummary(insights);
          }}>Save to run</Btn>
        )}
        {savedSummary && <span style={{ fontSize: 10, color: C.green, fontFamily: FONT, fontWeight: 700, alignSelf: "center" }}>Saved</span>}
        {(conversationHistory.length > 0 || parsedSuggestion) && !isStreaming && <Btn small variant="ghost" onClick={clearConversation}>Clear</Btn>}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <label htmlFor="query-input" style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, display: "block", marginBottom: 6 }}>
          ASK A QUESTION
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            id="query-input"
            type="text"
            value={queryText}
            onChange={event => setQueryText(event.target.value)}
            onKeyDown={handleQueryKeyDown}
            disabled={!results || isStreaming}
            placeholder={results ? "e.g. Which queue had the longest wait?" : "Run the model first..."}
            style={{
              flex: 1,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              color: C.text,
              fontFamily: FONT,
              fontSize: 12,
              padding: "7px 8px",
            }}
          />
          <Btn
            small
            variant="primary"
            onClick={() => runQuery(queryText)}
            disabled={!results || !queryText.trim() || isStreaming}
            ariaLabel="Ask question"
          >
            Ask
          </Btn>
        </div>
      </div>
    </aside>
  );
};
