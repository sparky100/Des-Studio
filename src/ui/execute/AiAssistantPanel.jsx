// ui/execute/AiAssistantPanel.jsx — AiAssistantPanel

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { streamNarrative } from "../../llm/apiClient.js";
import { buildCiResults, buildComparisonPrompt, buildNarrativePrompt, buildResultsQueryPrompt, buildSensitivityPrompt, buildSuggestionPrompt } from "../../llm/prompts.js";
import { makeRunPromptPayload, makeRunLabel, makeSavedRunPromptPayload } from "./executeHelpers.js";

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
}) => {
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(comparisonRuns[0]?.id || "");
  const [queryText, setQueryText] = useState("");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [savedSummary, setSavedSummary] = useState(null);
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

  const runPrompt = useCallback((prompt) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setResponse("");
    setError("");
    setStatus("loading");

    streamNarrative(prompt, {
      signal: controller.signal,
      onToken: token => {
        setStatus("streaming");
        setResponse(prev => `${prev}${token}`);
      },
      onComplete: () => {
        abortRef.current = null;
        setStatus("complete");
      },
      onError: err => {
        abortRef.current = null;
        setError(err?.message || "Analysis unavailable");
        setStatus("error");
      },
    });
  }, []);

  const runQuery = useCallback((question) => {
    if (!question.trim() || !results) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setStatus("streaming");

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
        setError(err?.message || "Query unavailable");
        setStatus("error");
      },
    });
  }, [model, results, aggregateStats, conversationHistory]);

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
  };

  const explainResults = () => {
    runPrompt(buildNarrativePrompt(model, exportConfig, {
      ...results,
      aggregateStats,
    }));
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
    ));
  };

  const explainSensitivity = () => {
    runPrompt(buildSensitivityPrompt(model.name, exportConfig, ciResults));
  };

  const suggestChanges = () => {
    runPrompt(buildSuggestionPrompt(model, exportConfig, {
      ...results,
      aggregateStats,
    }));
  };

  const handleQueryKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      runQuery(queryText);
    }
  };

  const panelButtonStyle = { width: "100%", justifyContent: "center" };

  const renderContent = () => {
    if (conversationHistory.length > 0) {
      return conversationHistory.map((entry, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{
            color: entry.role === "user" ? C.accent : C.primary,
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
        <Btn variant="amber" onClick={explainSensitivity} disabled={!sensitivityReady || isStreaming} style={panelButtonStyle}>
          Explore sensitivity
        </Btn>
        <Btn variant="primary" onClick={suggestChanges} disabled={!results || isStreaming} style={panelButtonStyle}>
          Suggest model changes
        </Btn>
      </div>

      {status === "error" && (
        <div role="alert" style={{ background: C.amber + "18", border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 10, color: C.amber, fontFamily: FONT, fontSize: 11 }}>
          Analysis unavailable - try again. {error}
        </div>
      )}

      <div ref={responseAreaRef} style={{
        flex: 1,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 12,
        overflowY: "auto",
        color: response ? C.text : C.muted,
        fontFamily: FONT,
        fontSize: 12,
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
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
        {savedSummary && <span style={{ fontSize: 10, color: C.green, fontFamily: FONT, fontWeight: 700, alignSelf: "center" }}>✓ Saved</span>}
        {conversationHistory.length > 0 && !isStreaming && <Btn small variant="ghost" onClick={clearConversation}>Clear</Btn>}
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
