// ui/execute/DiagnosticsTab.jsx — F69.3 + F69.4: AI diagnosis panel and chat
import { useCallback, useEffect, useRef, useState } from "react";
;
import { Btn } from "../shared/components.jsx";
import { supabase } from "../../db/supabase.js";
import { useTheme } from "../shared/ThemeContext.jsx";

function getProxyUrl() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/llm-proxy`;
  return "/functions/v1/llm-proxy";
}

async function callDiagnosticsApi(messages, maxTokens = 1000) {
  const sessionResponse = await supabase.auth.getSession();
  const accessToken = sessionResponse?.data?.session?.access_token;

  const response = await fetch(getProxyUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      version: "2026-05-05",
      kind: "query",
      messages,
      maxTokens,
      stream: false,
      responseFormat: "text",
    }),
  });

  if (!response.ok) throw new Error(`AI service returned ${response.status}`);
  const payload = await response.json();

  if (Array.isArray(payload?.content)) {
    return payload.content.map(p => p?.text || "").join("");
  }
  return payload?.content || payload?.text || payload?.completion || String(payload || "");
}

const DIAGNOSIS_SYSTEM_PROMPT = `You are an expert discrete event simulation debugger. You are analysing a DES Studio model and its simulation run output to identify why the model is not behaving as expected.

DES Studio uses a three-event paradigm:
- A-events: arrival/generation of entities (always fire, no condition)
- B-events: state-bound events that fire when a condition is met
- C-events: conditional service events requiring both an entity in a queue AND an available server/resource

Common failure patterns:
1. C-event condition checks the wrong queue (entities accumulate in the correct queue but the condition watches a different one)
2. C-event references a server that is always busy due to no departure event freeing it
3. Follow-on chain missing a terminal event, causing runaway scheduling
4. Entities created but never routed to a queue, so C-events never fire
5. Arrival rate far exceeds service rate, causing unbounded queue growth

Respond ONLY with a JSON object. No preamble, no markdown fences.
Schema:
{
  "findings": [
    {
      "severity": "CRITICAL" | "WARNING" | "INFO",
      "title": "<short finding title>",
      "explanation": "<2-4 sentence plain English explanation>",
      "affectedNodeId": "<nodeId or null>",
      "affectedNodeName": "<node name or null>",
      "suggestedFix": "<one sentence describing the fix>"
    }
  ],
  "overallAssessment": "<1-2 sentence summary of the model's main problem>"
}

Order findings by severity: CRITICAL first.
If the model appears to be working correctly, return an empty findings array and say so in overallAssessment.`;

function buildChatSystemPrompt(modelJson, traceJson, statsJson) {
  return `You are an expert DES Studio simulation debugger in a conversation with the model author.

You have full access to the model definition and run trace below.
Use them to answer questions precisely, referencing specific event names, queue IDs, and server names from the model.

Be concise. If a question requires a structural fix, describe exactly which node to change and how. If a question is hypothetical ("what if I..."), reason through the model logic to give a grounded answer.

MODEL DEFINITION:
${modelJson}

RUN TRACE (up to 1000 records, may be truncated):
${traceJson}

RUN STATISTICS:
${statsJson}`;
}

const CHAT_STARTERS = [
  "Why is my queue not draining?",
  "What would happen if I doubled the arrival rate?",
  "Which event is causing the bottleneck?",
  "Explain this model's behaviour in plain English",
];

function FindingCard({ finding, onGoToNode }) {
  const { C, FONT } = useTheme();
  const SEV_COLOR = { CRITICAL: C.red, WARNING: C.amber, INFO: C.accent };
  const SEV_BG = { CRITICAL: `${C.red}18`, WARNING: `${C.amber}18`, INFO: `${C.accent}18` };
  const color = SEV_COLOR[finding.severity] ?? C.muted;
  const bg = SEV_BG[finding.severity] ?? `${C.muted}18`;
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${color}44`,
      borderRadius: 8,
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          background: bg,
          border: `1px solid ${color}66`,
          borderRadius: 4,
          color,
          fontFamily: FONT,
          fontSize: 10,
          fontWeight: 700,
          padding: "2px 8px",
          letterSpacing: 1,
        }}>
          {finding.severity}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT }}>
          {finding.title}
        </span>
      </div>
      <p style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.6, margin: 0 }}>
        {finding.explanation}
      </p>
      {finding.suggestedFix && (
        <div style={{ fontSize: 11, color: C.green, fontFamily: FONT, lineHeight: 1.5 }}>
          Fix: {finding.suggestedFix}
        </div>
      )}
      {finding.affectedNodeName && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: FONT }}>
          <span style={{ color: C.muted }}>Affected:</span>
          <span
            onClick={finding.affectedNodeId ? () => onGoToNode?.(finding.affectedNodeName) : undefined}
            style={{
              color: finding.affectedNodeId ? C.accent : C.text,
              cursor: finding.affectedNodeId ? "pointer" : "default",
              textDecoration: finding.affectedNodeId ? "underline" : "none",
            }}
            title={finding.affectedNodeId ? "Go to node in Visual Designer" : undefined}
          >
            {finding.affectedNodeName}
          </span>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  const { C, FONT } = useTheme();
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "8px 12px" }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: C.muted,
            animation: `pulse 1.2s ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
    </div>
  );
}

function ChatMessage({ msg }) {
  const { C, FONT } = useTheme();
  const isUser = msg.role === "user";
  const isError = msg.role === "error";
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
      gap: 2,
      marginBottom: 10,
    }}>
      <div style={{
        maxWidth: "85%",
        background: isUser ? C.accent + "22" : isError ? C.errorBg : C.panel,
        border: `1px solid ${isUser ? C.accent + "44" : isError ? C.danger : C.border}`,
        borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
        color: isError ? C.error : C.text,
        fontFamily: FONT,
        fontSize: 12,
        lineHeight: 1.6,
        padding: "10px 14px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {msg.content}
      </div>
    </div>
  );
}

export function DiagnosticsTab({ model, results, onGoToNode }) {
  const { C, FONT } = useTheme();
  const hasRun = Boolean(results?.summary);

  // F69.3 state
  const [diagnosisState, setDiagnosisState] = useState("idle"); // idle | loading | done | error
  const [diagnosisResult, setDiagnosisResult] = useState(null);
  const [diagnosisError, setDiagnosisError] = useState(null);
  const [userExpectation, setUserExpectation] = useState("");

  // F69.4 state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const buildContextPackage = useCallback(() => {
    return {
      model,
      runStats: results?.summary ?? null,
      trace: results?.trace ?? [],
      traceTruncated: results?.traceTruncated ?? false,
      structuralIssues: [],
      userExpectation: userExpectation.trim() || null,
    };
  }, [model, results, userExpectation]);

  const handleDiagnose = useCallback(async () => {
    setDiagnosisState("loading");
    setDiagnosisError(null);
    try {
      const ctx = buildContextPackage();
      const messages = [
        { role: "system", content: DIAGNOSIS_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(ctx, null, 0) },
      ];
      const raw = await callDiagnosticsApi(messages, 1000);

      let parsed;
      try {
        const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        parsed = JSON.parse(clean);
      } catch {
        throw new Error("AI returned an unexpected format. Please try again.");
      }
      setDiagnosisResult(parsed);
      setDiagnosisState("done");
    } catch (err) {
      setDiagnosisError(err.message || "Diagnosis failed.");
      setDiagnosisState("error");
    }
  }, [buildContextPackage]);

  const handleChatSend = useCallback(async (messageText) => {
    const text = (messageText ?? chatInput).trim();
    if (!text || chatLoading) return;
    setChatInput("");

    const userMsg = { role: "user", content: text };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const modelJson = JSON.stringify(model, null, 0);
      const traceJson = JSON.stringify(results?.trace ?? [], null, 0);
      const statsJson = JSON.stringify(results?.summary ?? {}, null, 0);

      const history = [...chatMessages, userMsg];
      const messages = [
        { role: "system", content: buildChatSystemPrompt(modelJson, traceJson, statsJson) },
        ...history.map(m => ({ role: m.role === "error" ? "assistant" : m.role, content: m.content })),
      ];

      const reply = await callDiagnosticsApi(messages, 600);
      setChatMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: "error", content: `Error: ${err.message}. Tap to retry.` }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatMessages, chatLoading, model, results]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  const labelStyle = {
    fontSize: 10,
    color: C.muted,
    fontFamily: FONT,
    letterSpacing: 1.2,
    fontWeight: 700,
    textTransform: "uppercase",
  };

  if (!hasRun) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, gap: 12 }}>
        <div style={{ fontSize: 14, color: C.muted, fontFamily: FONT, textAlign: "center" }}>
          Run the model to enable diagnostics.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── F69.3: Diagnosis panel ── */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={labelStyle}>Diagnosis</div>

        {diagnosisState === "idle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
              Describe what you expected the model to do, then request an AI diagnosis of why it behaved differently.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                What did you expect? (optional)
              </label>
              <input
                type="text"
                value={userExpectation}
                onChange={e => setUserExpectation(e.target.value)}
                placeholder="e.g. Server utilisation should be around 80%, but it shows 0%"
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  color: C.text,
                  fontFamily: FONT,
                  fontSize: 12,
                  outline: "none",
                  padding: "8px 10px",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <Btn variant="primary" onClick={handleDiagnose}>
              Diagnose
            </Btn>
          </div>
        )}

        {diagnosisState === "loading" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TypingIndicator />
            <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>Analysing model and run trace…</span>
          </div>
        )}

        {diagnosisState === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: C.errorBg, border: `1px solid ${C.danger}`, borderRadius: 6, color: C.error, fontFamily: FONT, fontSize: 12, padding: "10px 12px" }}>
              {diagnosisError}
            </div>
            <Btn variant="ghost" onClick={() => setDiagnosisState("idle")}>
              Try again
            </Btn>
          </div>
        )}

        {diagnosisState === "done" && diagnosisResult && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {diagnosisResult.overallAssessment && (
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.6 }}>
                {diagnosisResult.overallAssessment}
              </div>
            )}

            {Array.isArray(diagnosisResult.findings) && diagnosisResult.findings.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {diagnosisResult.findings.map((finding, i) => (
                  <FindingCard key={i} finding={finding} onGoToNode={onGoToNode} />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.green, fontFamily: FONT }}>
                No structural issues found in this run.
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="ghost" small onClick={() => { setDiagnosisState("idle"); setDiagnosisResult(null); }}>
                Re-diagnose
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* ── F69.4: Chat panel ── */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={labelStyle}>Debugging Chat</div>
          {chatMessages.length > 0 && (
            <button
              onClick={() => setChatMessages([])}
              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 10, padding: "3px 8px" }}
            >
              Clear chat
            </button>
          )}
        </div>

        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
          AI has full access to your model structure and run trace.
        </div>

        {/* Message history */}
        {chatMessages.length > 0 && (
          <div style={{ maxHeight: 360, overflowY: "auto", padding: "4px 0" }}>
            {chatMessages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
            {chatLoading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "12px 12px 12px 4px" }}>
                  <TypingIndicator />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Starter suggestions — shown when chat is empty */}
        {chatMessages.length === 0 && !chatLoading && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CHAT_STARTERS.map(suggestion => (
              <button
                key={suggestion}
                onClick={() => handleChatSend(suggestion)}
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                  color: C.muted,
                  cursor: "pointer",
                  fontFamily: FONT,
                  fontSize: 11,
                  padding: "5px 12px",
                  transition: "border-color 150ms",
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Input row */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your model…"
            disabled={chatLoading}
            rows={2}
            style={{
              flex: 1,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.text,
              fontFamily: FONT,
              fontSize: 12,
              outline: "none",
              padding: "8px 10px",
              resize: "none",
              opacity: chatLoading ? 0.6 : 1,
            }}
          />
          <Btn
            variant="primary"
            disabled={!chatInput.trim() || chatLoading}
            onClick={() => handleChatSend()}
          >
            Send
          </Btn>
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
          Press Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
