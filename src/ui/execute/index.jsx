// ui/execute/index.jsx — CustomerToken, VisualView, ExecutePanel
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, FONT, TOKEN_COLORS } from "../shared/tokens.js";
import { Tag, PhaseTag, Btn, SH, InfoBox, Empty } from "../shared/components.jsx";
import { buildEngine } from "../../engine/index.js";
import { runReplications } from "../../engine/replication-runner.js";
import { summarizeReplicationResults } from "../../engine/statistics.js";
import { fetchRunHistory, saveSimulationRun } from "../../db/models.js";
import { validateModel } from "../../engine/validation.js";
import { ConditionBuilder } from "../editors/index.jsx";
import { streamNarrative } from "../../llm/apiClient.js";
import { buildCiResults, buildComparisonPrompt, buildNarrativePrompt, buildSensitivityPrompt } from "../../llm/prompts.js";

const tokenColor = (id) => TOKEN_COLORS[(id - 1) % TOKEN_COLORS.length];
const CI_METRICS = ["summary.avgWait", "summary.avgSvc", "summary.avgSojourn", "summary.served", "summary.reneged"];
const METRIC_LABELS = {
  "summary.avgWait": "Avg wait",
  "summary.avgSvc": "Avg service",
  "summary.avgSojourn": "Avg sojourn",
  "summary.served": "Served",
  "summary.reneged": "Reneged",
};

const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const makeBatchId = () => {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

function makeBatchResult(replicationPayloads, aggregateStats, maxTime, warmupPeriod) {
  const summaries = replicationPayloads.map(payload => payload.result?.summary || {});
  const total = summaries.reduce((sum, summary) => sum + (summary.total || 0), 0);
  const served = summaries.reduce((sum, summary) => sum + (summary.served || 0), 0);
  const reneged = summaries.reduce((sum, summary) => sum + (summary.reneged || 0), 0);
  const finalTime = Math.max(...replicationPayloads.map(payload => payload.result?.finalTime || 0), 0);

  return {
    snap: { clock: finalTime },
    summary: {
      total,
      served,
      reneged,
      avgWait: aggregateStats["summary.avgWait"]?.mean ?? null,
      avgSvc: aggregateStats["summary.avgSvc"]?.mean ?? null,
      avgSojourn: aggregateStats["summary.avgSojourn"]?.mean ?? null,
      warmupPeriod,
      maxSimTime: maxTime,
    },
  };
}

function slugifyResultName(name = "model") {
  const slug = String(name || "model")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "model";
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function buildResultsExportPayload({
  model,
  results,
  replicationResults = [],
  aggregateStats = {},
  config = {},
  batchStatus = "idle",
  exportedAt = new Date().toISOString(),
} = {}) {
  return {
    schema: "des-studio.results.v1",
    exportedAt,
    status: results ? "complete" : "partial",
    batchStatus,
    model: {
      id: config.modelId ?? null,
      name: model?.name ?? "Untitled model",
    },
    experiment: {
      runLabel: config.runLabel ?? null,
      seed: config.seed ?? null,
      replications: config.replications ?? Math.max(replicationResults.length, results ? 1 : 0),
      warmupPeriod: config.warmupPeriod ?? 0,
      maxSimTime: config.maxSimTime ?? null,
      terminationMode: config.terminationMode ?? "time",
      terminationCondition: config.terminationCondition ?? null,
    },
    results: results ?? null,
    replications: replicationResults.map(payload => ({
      replicationIndex: payload.replicationIndex,
      seed: payload.seed,
      summary: payload.result?.summary ?? payload.summary ?? {},
      finalTime: payload.result?.finalTime ?? payload.finalTime ?? payload.result?.snap?.clock ?? null,
    })),
    aggregateStats,
  };
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildResultsCsv({ results, replicationResults = [], aggregateStats = {}, config = {} } = {}) {
  const rows = [["runLabel", "replicationIndex", "seed", "served", "reneged", "avgWait", "avgSvc", "avgSojourn", "finalTime"]];

  const resultRows = replicationResults.length
    ? replicationResults.map(payload => ({
        replicationIndex: payload.replicationIndex,
        runLabel: payload.run_label || payload.label || config.runLabel || "",
        seed: payload.seed,
        summary: payload.result?.summary ?? payload.summary ?? {},
        finalTime: payload.result?.finalTime ?? payload.finalTime ?? payload.result?.snap?.clock ?? null,
      }))
    : results
      ? [{
          replicationIndex: 0,
          runLabel: config.runLabel || "",
          seed: config.seed ?? null,
          summary: results.summary ?? {},
          finalTime: results.finalTime ?? results.snap?.clock ?? null,
        }]
      : [];

  for (const row of resultRows) {
    rows.push([
      row.runLabel,
      row.replicationIndex,
      row.seed,
      row.summary.served,
      row.summary.reneged,
      row.summary.avgWait,
      row.summary.avgSvc,
      row.summary.avgSojourn,
      row.finalTime,
    ]);
  }

  const aggregateRows = Object.entries(aggregateStats)
    .filter(([, stat]) => stat && stat.n > 0)
    .map(([metric, stat]) => [
      metric,
      stat.n,
      stat.mean,
      stat.lower,
      stat.upper,
      stat.halfWidth,
    ]);

  if (aggregateRows.length) {
    rows.push([]);
    rows.push(["metric", "n", "mean", "lower95", "upper95", "halfWidth"]);
    rows.push(...aggregateRows);
  }

  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const CustomerToken = ({ entity, size = 36, showId = true }) => {
  const col = tokenColor(entity.id);
  const statusBorder = { waiting: C.waiting, serving: C.serving, done: C.served, reneged: C.reneged, idle: C.green, busy: C.amber }[entity.status] || C.muted;
  return (
    <div title={`#${entity.id} ${entity.type} — ${entity.status}\narrived t=${entity.arrivalTime?.toFixed?.(2)}`}
      style={{
        width: size, height: size, borderRadius: "50%", background: col + "22", border: `2.5px solid ${statusBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: size * 0.28,
        fontWeight: 700, color: col, flexShrink: 0, cursor: "default", transition: "all .2s",
        boxShadow: entity.status === "serving" ? `0 0 8px ${col}66` : "none"
      }}>
      {showId ? `#${entity.id}` : ""}
    </div>
  );
};

const ServerBay = ({ server, customers }) => {
  const servingCust = customers.find(e => e.id === server.currentCustId);
  const isB = server.status === "busy";
  const borderCol = isB ? C.busy : C.idle;
  return (
    <div style={{
      background: C.panel, border: `2px solid ${borderCol}44`, borderRadius: 10, padding: 14,
      display: "flex", flexDirection: "column", gap: 10, minWidth: 160, position: "relative"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, color: "#a78bfa", fontFamily: FONT }}>Server #{server.id}</div>
          <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT }}>{server.type}</div>
        </div>
        <Tag label={server.status} color={isB ? C.amber : C.green} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 8, background: "#a78bfa18", border: `2px solid #a78bfa55`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="4" rx="1" stroke="#a78bfa" strokeWidth="1.5" />
            <rect x="3" y="13" width="18" height="4" rx="1" stroke="#a78bfa" strokeWidth="1.5" />
            <circle cx="6.5" cy="8" r="1" fill={isB ? C.amber : C.green} />
          </svg>
        </div>
        {servingCust ? (
          <><div style={{ fontSize: 18, color: "#4b5563" }}>→</div><CustomerToken entity={servingCust} size={44} /></>
        ) : (
          <div style={{ fontSize: 11, color: "#4b5563", fontFamily: FONT, fontStyle: "italic" }}>idle</div>
        )}
      </div>
    </div>
  );
};

const VisualView = ({ snap, model, summary }) => {
  if (!snap) return <Empty icon="▶" msg="Run or step the simulation to see the visual view." />;

  const allEntities = snap.entities || [];
  const servers = allEntities.filter(e => e.role === "server");
  const customers = allEntities.filter(e => e.role !== "server");
  const waiting = customers.filter(e => e.status === "waiting");
  const definedQueues = model.queues || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {summary?.warmupPeriod > 0 && (
        <div style={{ background: "#78350f22", border: `1px solid ${C.amber}44`, borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>WARM-UP DURATION</span>
              <span style={{ fontSize: 14, color: C.amber, fontWeight: 700 }}>{summary.warmupPeriod}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>OBS. EXCLUDED</span>
              <span style={{ fontSize: 14, color: C.reneged, fontWeight: 700 }}>{summary.excludedCount || 0}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>OBS. INCLUDED</span>
              <span style={{ fontSize: 14, color: C.served, fontWeight: 700 }}>{summary.total || 0}</span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, fontFamily: FONT, letterSpacing: 1 }}>WARM-UP AUDIT TRAIL</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ background: "#111", border: `2px solid #a855f744`, borderRadius: 12, padding: "20px 28px", textAlign: "center", minWidth: 140 }}>
          <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 2, marginBottom: 6 }}>SIM CLOCK</div>
          <div style={{ fontSize: 42, fontWeight: 300, color: "#fff", fontFamily: FONT, lineHeight: 1 }}>
            {parseFloat(snap.clock).toFixed(0)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[
            { label: "Arrived", value: customers.length, color: "#38bdf8" },
            { label: "Served", value: snap.served || 0, color: "#10b981" },
            { label: "Reneged", value: snap.reneged || 0, color: "#ef4444" },
            { label: "Waiting", value: waiting.length, color: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#888", fontWeight: 700, marginBottom: 4 }}>{s.label.toUpperCase()}</div>
              <div style={{ fontSize: 20, color: s.color, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {servers.map(srv => <ServerBay key={srv.id} server={srv} customers={customers} />)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>QUEUE LANES</div>
        {definedQueues.length > 0 ? (
          definedQueues.map((qDef, idx) => {
            const qName = qDef.name;
            const qEntities = waiting.filter(e => e.queue === qName || (idx === 0 && !e.queue));
            return (
              <div key={qName} style={{ background: "#111", border: `1px solid #333`, borderLeft: `4px solid ${C.cEvent || '#8b5cf6'}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{qName.toUpperCase()}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: qEntities.length > 0 ? "#f59e0b" : "#fff", fontFamily: FONT }}>{qEntities.length}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 40 }}>
                  {qEntities.length === 0 ? <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>empty</span> : qEntities.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ background: "#111", border: `1px solid #333`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>GENERAL QUEUE</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{waiting.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

function makeRunLabel(payload) {
  if (!payload) return "Run";
  if (payload.run_label) return payload.run_label;
  if (payload.label) return payload.label;
  if (payload.replicationIndex != null) return `Replication ${payload.replicationIndex + 1} (seed ${payload.seed ?? "?"})`;
  return "Completed run";
}

function makeRunPromptPayload(label, payload) {
  const summary = payload?.result?.summary || payload?.summary || payload?.results?.summary || {};
  return {
    label,
    experimentConfig: payload?.experiment || payload?.experimentConfig || {},
    kpis: {
      served: summary.served ?? null,
      reneged: summary.reneged ?? null,
      totalEntities: summary.total ?? null,
      avgWait: summary.avgWait ?? null,
      avgService: summary.avgSvc ?? null,
      avgSojourn: summary.avgSojourn ?? null,
    },
    finalTime: payload?.result?.finalTime ?? payload?.finalTime ?? payload?.results?.snap?.clock ?? null,
  };
}

function makeSavedRunPromptPayload(row) {
  const summary = row?.results_json?.summary || {};
  return {
    label: row?.run_label || row?.label || row?.ran_at || "Saved run",
    experimentConfig: {
      warmupPeriod: row?.warmup_period ?? null,
      maxSimTime: row?.max_simulation_time ?? row?.results_json?.summary?.maxSimTime ?? null,
      replications: row?.replications ?? 1,
      seed: row?.seed ?? null,
    },
    kpis: {
      served: row?.total_served ?? summary.served ?? null,
      reneged: row?.total_reneged ?? summary.reneged ?? null,
      totalEntities: row?.total_arrived ?? summary.total ?? null,
      avgWait: row?.avg_wait_time ?? summary.avgWait ?? null,
      avgService: row?.avg_service_time ?? summary.avgSvc ?? null,
      avgSojourn: summary.avgSojourn ?? null,
      renegeRate: row?.renege_rate ?? null,
    },
    finalTime: row?.results_json?.clock ?? row?.results_json?.summary?.finalTime ?? null,
  };
}

const AiAssistantPanel = ({
  model,
  results,
  exportConfig,
  aggregateStats,
  comparisonRuns,
  comparisonLoading,
  comparisonError,
  onClose,
}) => {
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(comparisonRuns[0]?.id || "");
  const abortRef = useRef(null);
  const ciResults = useMemo(() => buildCiResults(aggregateStats), [aggregateStats]);
  const sensitivityReady = ciResults.some(item => item.n >= 5);
  const isStreaming = status === "loading" || status === "streaming";
  const selectedRun = comparisonRuns.find(run => run.id === selectedRunId);

  useEffect(() => {
    if (!selectedRunId && comparisonRuns[0]) setSelectedRunId(comparisonRuns[0].id);
  }, [comparisonRuns, selectedRunId]);

  useEffect(() => () => abortRef.current?.abort(), []);

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

  const stopStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus(response ? "complete" : "idle");
  };

  const copyResponse = () => {
    if (!response || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(response);
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

  const panelButtonStyle = { width: "100%", justifyContent: "center" };

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
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Read-only results analysis</div>
        </div>
        <Btn small variant="ghost" onClick={onClose} ariaLabel="Close AI assistant">x</Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Btn variant="primary" onClick={explainResults} disabled={!results || isStreaming} style={panelButtonStyle}>
          Explain results
        </Btn>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="compare-run" style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>COMPARE RUNS</label>
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
          Sensitivity
        </Btn>
      </div>

      {status === "error" && (
        <div role="alert" style={{ background: C.amber + "18", border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 10, color: C.amber, fontFamily: FONT, fontSize: 11 }}>
          Analysis unavailable - try again. {error}
        </div>
      )}

      <div style={{
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
        {status === "loading" && "Waiting for analysis..."}
        {response || (status !== "loading" ? "Run the model to generate insights." : "")}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {isStreaming && <Btn small variant="danger" onClick={stopStream}>Stop</Btn>}
        {status === "complete" && response && <Btn small variant="ghost" onClick={copyResponse}>Copy</Btn>}
      </div>
    </aside>
  );
};

const ExecutePanel = ({ model, modelId, userId, onRunSaved }) => {
  const [mode, setMode] = useState("idle");
  const [currentSnap, setCurrentSnap] = useState(null);
  const [log, setLog] = useState([]);
  const [view, setView] = useState("visual");
  const [autoSpeed, setAutoSpeed] = useState(400);
  const [autoRunning, setAutoRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [phaseCTruncated, setPhaseCTruncated] = useState(false);
  const [results, setResults] = useState(null);
  const [batchStatus, setBatchStatus] = useState("idle");
  const [batchProgress, setBatchProgress] = useState(null);
  const [replicationResults, setReplicationResults] = useState([]);
  const [aggregateStats, setAggregateStats] = useState({});
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [warmupPeriod, setWarmupPeriod] = useState(0);
  const [maxSimTime, setMaxSimTime] = useState(500);
  const [terminationMode, setTerminationMode] = useState("time");
  const [terminationCondition, setTerminationCondition] = useState(null);
  const [replications, setReplications] = useState(1);
  const [runLabel, setRunLabel] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [savedRunHistory, setSavedRunHistory] = useState([]);
  const [runHistoryStatus, setRunHistoryStatus] = useState("idle");
  const [runHistoryError, setRunHistoryError] = useState("");
  const runSeedRef = useRef(seed);
  const engineRef = useRef(null);
  const autoRef = useRef(null);
  const runnerRef = useRef(null);
  const saveInProgressRef = useRef(false);

  const validation = useMemo(() => {
    const v = validateModel({
      ...model,
      maxSimTime: terminationMode === 'time' ? maxSimTime : 0,
      terminationCondition: terminationMode === 'condition' ? terminationCondition : null
    });
    
    // F3.4 Additional Validations
    if (terminationMode === 'time' && warmupPeriod >= maxSimTime) {
      v.errors.push({ code: 'V14', message: 'Warm-up period must be less than the run duration.', tab: 'execute' });
    }
    if (!Number.isInteger(replications) || replications < 1) {
      v.errors.push({ code: 'V15', message: 'Replication count must be a positive integer.', tab: 'execute' });
    }
    
    return v;
  }, [model, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications]);
  const hasErrors = validation.errors.length > 0;

  const initEngine = useCallback(() => {
    if (hasErrors) return;
    runSeedRef.current = seed;
    engineRef.current = buildEngine(
      model, 
      seed, 
      warmupPeriod, 
      terminationMode === 'time' ? maxSimTime : null,
      terminationMode === 'condition' ? terminationCondition : null
    );
    setCurrentSnap(engineRef.current.getSnap());
    setLog([{ phase: "INIT", time: 0, message: `Simulation initialized  (seed: ${seed}, warmup: ${warmupPeriod})` }]);
    setMode("stepping");
    setSaveStatus(null);
    setPhaseCTruncated(false);
    setResults(null);
    setBatchStatus("idle");
    setBatchProgress(null);
    setReplicationResults([]);
    setAggregateStats({});
  }, [model, seed, hasErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition]);

  const stopAuto = useCallback(() => {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
      setAutoRunning(false);
    }
  }, []);

  const doStep = useCallback(() => {
    if (!engineRef.current) return;
    const r = engineRef.current.step();
    setCurrentSnap(r.snap);
    setLog(prev => [...prev, ...(r.cycleLog || [])]);
    if (r.phaseCTruncated) setPhaseCTruncated(true);

    if (r.done) {
      setMode("done");
      stopAuto();
      const summary = engineRef.current.getSummary();
      const fullResult = {
        snap: r.snap,
        summary: {
          ...summary,
          total: r.snap?.entities?.filter(e => e.role !== 'server').length || 0,
          served: r.snap?.served || 0,
          reneged: r.snap?.reneged || 0,
        },
      };
      setResults(fullResult);
      if (userId && modelId) {
        setSaveStatus({ state: 'saving', message: 'Saving results...' });
        setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "💾 Auto-saving simulation results..." }]);
        
        saveSimulationRun(modelId, userId, fullResult, { 
          seed: runSeedRef.current, 
          runLabel,
          warmupPeriod,
          maxTime: terminationMode === 'time' ? maxSimTime : null
        })
          .then(() => {
            setSaveStatus({ state: 'success', message: '✓ Saved successfully!' });
            setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "✅ History record completed." }]);
            onRunSaved?.();
          })
          .catch(e => {
            setSaveStatus({ state: 'error', message: `✗ Save failed: ${e.message}` });
            setLog(prev => [...prev, { phase: "ERROR", time: r.snap.clock, message: `❌ Save error: ${e.message}` }]);
          });
      }
    }
  }, [userId, modelId, runLabel, warmupPeriod, maxSimTime, terminationMode, stopAuto, onRunSaved]);

  const doRunAll = useCallback(async () => {
    stopAuto();
    if (hasErrors) return;
    if (saveInProgressRef.current) return;
    if (!userId || !modelId) {
      setSaveStatus({ state: 'error', message: '✗ Missing User/Model ID' });
      return;
    }

    const runSeed = seed;
    const maxTimeForRun = terminationMode === 'time' ? maxSimTime : null;
    const stopConditionForRun = terminationMode === 'condition' ? terminationCondition : null;

    if (replications > 1) {
      const batchId = makeBatchId();
      const completedPayloads = [];

      setMode("running");
      setCurrentSnap(null);
      setResults(null);
      setLog([{ phase: "INIT", time: 0, message: `Replication batch started  (N=${replications}, base seed: ${runSeed})` }]);
      setSaveStatus(null);
      setPhaseCTruncated(false);
      setBatchStatus("running");
      setBatchProgress({ completed: 0, total: replications, running: 0, pending: replications, cancelled: false, workerCount: 0 });
      setReplicationResults([]);
      setAggregateStats({});

      runnerRef.current = runReplications({
        model,
        replications,
        baseSeed: runSeed,
        warmupPeriod,
        maxSimTime: maxTimeForRun,
        terminationCondition: stopConditionForRun,
        onProgress: progress => setBatchProgress(progress),
        onReplicationComplete: payload => {
          completedPayloads[payload.replicationIndex] = payload;
          const ordered = completedPayloads.filter(Boolean);
          const nextStats = summarizeReplicationResults(ordered, CI_METRICS);

          setReplicationResults(ordered);
          setAggregateStats(nextStats);
          setCurrentSnap(payload.result?.snap || null);
          setLog(prev => [
            ...prev,
            {
              phase: "REP",
              time: payload.result?.finalTime || 0,
              message: `Replication ${payload.replicationIndex + 1}/${replications} complete  (seed: ${payload.seed})`,
            },
          ]);
          if (payload.result?.summary?.phaseCTruncated) setPhaseCTruncated(true);
        },
        onComplete: async payloads => {
          saveInProgressRef.current = true;
          try {
            const ordered = payloads.filter(Boolean);
            const stats = summarizeReplicationResults(ordered, CI_METRICS);
            const batchResult = makeBatchResult(ordered, stats, maxTimeForRun, warmupPeriod);

            setBatchStatus("complete");
            setResults(batchResult);
            setAggregateStats(stats);
            setSaveStatus({ state: 'saving', message: 'Saving replication batch...' });

            try {
              await saveSimulationRun(modelId, userId, batchResult, {
                seed: runSeed,
                runLabel,
                replications,
                warmupPeriod,
                maxTime: maxTimeForRun,
                batchId,
                aggregateStats: stats,
                replicationResults: ordered.map(payload => ({
                  replicationIndex: payload.replicationIndex,
                  seed: payload.seed,
                  summary: payload.result?.summary || {},
                  finalTime: payload.result?.finalTime,
                })),
              });
              setSaveStatus({ state: 'success', message: '✓ Replication batch saved successfully!' });
              setLog(prev => [...prev, { phase: "SAVE", time: batchResult.snap.clock, message: "Replication batch saved." }]);
              onRunSaved?.();
            } catch (saveError) {
              setSaveStatus({ state: 'error', message: `✗ Failed to save batch: ${saveError.message}` });
              setLog(prev => [...prev, { phase: "ERROR", time: batchResult.snap.clock, message: `❌ Database error: ${saveError.message}` }]);
            }
          } catch (setupError) {
            setBatchStatus("complete");
            setSaveStatus({ state: 'error', message: `✗ Batch error: ${setupError.message}` });
          } finally {
            saveInProgressRef.current = false;
            runnerRef.current = null;
            setMode("done");
          }
        },
        onError: error => {
          setBatchStatus("error");
          setSaveStatus({ state: 'error', message: `✗ Replication failed: ${error.message}` });
          setLog(prev => [...prev, { phase: "ERROR", time: 0, message: `Replication ${error.replicationIndex + 1} failed: ${error.message}` }]);
          runnerRef.current = null;
          setMode("idle");
        },
        onCancelled: () => {
          setBatchStatus("cancelled");
          setSaveStatus({ state: 'error', message: 'Replication batch cancelled. Results were not saved.' });
          setLog(prev => [...prev, { phase: "CANCEL", time: 0, message: "Replication batch cancelled." }]);
          runnerRef.current = null;
          setMode("idle");
        },
      });
      return;
    }

    setResults(null);
    setSaveStatus(null);
    setPhaseCTruncated(false);
    setLog([{ phase: "INIT", time: 0, message: `Run started  (seed: ${runSeed})` }]);
    setMode("running");

    const engine = buildEngine(
      model,
      runSeed,
      warmupPeriod,
      maxTimeForRun,
      stopConditionForRun
    );
    const result = engine.runAll();

    setCurrentSnap(result.snap);
    setResults(result);
    setLog(result.log);
    setMode("done");
    if (result.summary?.phaseCTruncated) setPhaseCTruncated(true);

    saveInProgressRef.current = true;
    setSaveStatus({ state: 'saving', message: 'Saving results...' });
    setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "💾 Committing simulation history to database..." }]);

    try {
      await saveSimulationRun(modelId, userId, result, {
        seed: runSeed,
        runLabel,
        replications: 1,
        warmupPeriod,
        maxTime: maxTimeForRun
      });
      setSaveStatus({ state: 'success', message: '✓ History saved successfully!' });
      setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "✅ History commit complete." }]);
      onRunSaved?.();
    } catch (e) {
      setSaveStatus({ state: 'error', message: `✗ Failed to save: ${e.message}` });
      setLog(prev => [...prev, { phase: "ERROR", time: result.snap.clock, message: `❌ Database error: ${e.message}` }]);
    } finally {
      saveInProgressRef.current = false;
    }
  }, [model, userId, modelId, seed, runLabel, hasErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, stopAuto, onRunSaved]);

  const cancelBatch = useCallback(() => {
    if (!runnerRef.current) return;
    setBatchStatus("cancelling");
    runnerRef.current.cancel();
  }, []);

  const toggleAuto = () => {
    if (autoRunning) {
      stopAuto();
    } else {
      if (mode === "idle") initEngine();
      setAutoRunning(true);
    }
  };

  useEffect(() => {
    if (!autoRunning) return;
    autoRef.current = setInterval(doStep, autoSpeed);
    return () => {
      if (autoRef.current) {
        clearInterval(autoRef.current);
        autoRef.current = null;
      }
    };
  }, [autoRunning, autoSpeed, doStep]);

  useEffect(() => {
    return () => runnerRef.current?.cancel();
  }, []);

  useEffect(() => {
    if (!aiPanelOpen || !modelId) return;
    let cancelled = false;
    setRunHistoryStatus("loading");
    setRunHistoryError("");
    fetchRunHistory(modelId)
      .then(rows => {
        if (cancelled) return;
        setSavedRunHistory(rows || []);
        setRunHistoryStatus("loaded");
      })
      .catch(error => {
        if (cancelled) return;
        setSavedRunHistory([]);
        setRunHistoryError(error?.message || "could not load run history");
        setRunHistoryStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [aiPanelOpen, modelId]);

  const batchActive = batchStatus === "running" || batchStatus === "cancelling";
  const partialBatchStatus = batchStatus === "cancelled" || batchStatus === "error";
  const canExportResults = Boolean(results || (partialBatchStatus && replicationResults.length));
  const exportConfig = useMemo(() => ({
    modelId,
    seed: runSeedRef.current,
    runLabel: runLabel.trim() || null,
    replications,
    warmupPeriod,
    maxSimTime: terminationMode === "time" ? maxSimTime : null,
    terminationMode,
    terminationCondition: terminationMode === "condition" ? terminationCondition : null,
  }), [modelId, runLabel, replications, warmupPeriod, maxSimTime, terminationMode, terminationCondition]);
  const exportPartial = partialBatchStatus && replicationResults.length > 0;
  const resultFilenameBase = `des-studio-results-${slugifyResultName(model.name)}${exportPartial ? "-partial" : ""}-${timestampForFilename()}`;
  const comparisonRuns = useMemo(() => {
    const savedRuns = savedRunHistory.map(row => ({
      id: `saved-${row.id}`,
      label: row.run_label || `Saved ${row.ran_at ? new Date(row.ran_at).toLocaleString() : row.id}`,
      payload: row,
      source: "saved",
    }));
    const currentReplications = replicationResults.map(payload => ({
      id: `rep-${payload.replicationIndex}`,
      label: makeRunLabel(payload),
      payload,
      source: "session",
    }));
    return [...savedRuns, ...currentReplications];
  }, [savedRunHistory, replicationResults]);

  const exportResultsJson = useCallback(() => {
    const payload = buildResultsExportPayload({
      model,
      results,
      replicationResults,
      aggregateStats,
      config: exportConfig,
      batchStatus,
    });
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      `${resultFilenameBase}.json`,
      "application/json"
    );
  }, [model, results, replicationResults, aggregateStats, exportConfig, batchStatus, resultFilenameBase]);

  const exportResultsCsv = useCallback(() => {
    const csv = buildResultsCsv({
      results,
      replicationResults,
      aggregateStats,
      config: exportConfig,
    });
    downloadTextFile(
      csv,
      `${resultFilenameBase}.csv`,
      "text/csv;charset=utf-8"
    );
  }, [results, replicationResults, aggregateStats, exportConfig, resultFilenameBase]);

  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minWidth: 0 }}>
      {/* Experiment Controls Section */}
      <div style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>WARM-UP PERIOD</span>
            <input
              aria-label="Warm-up period"
              type="number"
              value={warmupPeriod}
              onChange={e => setWarmupPeriod(parseFloat(e.target.value) || 0)}
              style={{ width: 100, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                padding: "6px 8px", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>REPLICATIONS</span>
            <input
              aria-label="Replication count"
              type="number"
              value={replications}
              onChange={e => setReplications(parseInt(e.target.value) || 0)}
              style={{ width: 80, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                padding: "6px 8px", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SEED</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                aria-label="Simulation seed"
                type="number"
                value={seed}
                onChange={e => setSeed(parseInt(e.target.value) || 0)}
                style={{ width: 120, background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                  padding: "6px 8px", outline: "none" }}
              />
              <Btn small variant="ghost" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>rand</Btn>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN LABEL</span>
            <input
              aria-label="Run label"
              value={runLabel}
              onChange={e => setRunLabel(e.target.value)}
              placeholder="Baseline"
              style={{ width: 160, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12,
                padding: "6px 8px", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>TERMINATION MODE</span>
            <div style={{ display: "flex", gap: 12, alignItems: "center", height: 32 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                <input type="radio" name="terminationMode" checked={terminationMode === "time"} onChange={() => setTerminationMode("time")} />
                Time-based
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                <input type="radio" name="terminationMode" checked={terminationMode === "condition"} onChange={() => setTerminationMode("condition")} />
                Condition-based
              </label>
            </div>
          </div>

          {terminationMode === "time" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN DURATION</span>
              <input
                aria-label="Run duration"
                type="number"
                value={maxSimTime}
                onChange={e => setMaxSimTime(parseFloat(e.target.value) || 0)}
                style={{ width: 100, background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                  padding: "6px 8px", outline: "none" }}
              />
            </div>
          )}
        </div>

        {terminationMode === "condition" && (
          <div style={{ borderTop: `1px solid #333`, paddingTop: 14 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, display: "block", marginBottom: 8 }}>STOP CONDITION</span>
            <ConditionBuilder 
              condition={terminationCondition}
              entityTypes={model.entityTypes}
              stateVariables={model.stateVariables}
              queues={model.queues}
              onChange={setTerminationCondition}
            />
          </div>
        )}
      </div>

      <div style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 8, padding: 14, display: "flex", gap: 10, rowGap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="primary" onClick={initEngine} disabled={hasErrors || batchActive}>⟳ Reset</Btn>
        <Btn variant="success" onClick={doStep} disabled={mode === "done" || hasErrors || batchActive}>⏭ Step</Btn>
        <Btn variant={autoRunning ? "danger" : "amber"} onClick={toggleAuto} disabled={hasErrors || batchActive}>{autoRunning ? "Stop Auto" : "Auto Run"}</Btn>
        <Btn variant="ghost" onClick={doRunAll} disabled={hasErrors || batchActive || saveStatus?.state === 'saving' || saveInProgressRef.current}>⚡ Run All</Btn>
        <Btn variant="ghost" onClick={exportResultsJson} disabled={!canExportResults}>Export Results</Btn>
        <Btn variant="ghost" onClick={exportResultsCsv} disabled={!canExportResults}>Export Results CSV</Btn>
        <Btn variant={aiPanelOpen ? "primary" : "ghost"} onClick={() => setAiPanelOpen(open => !open)}>AI Insights</Btn>
        {batchActive && <Btn variant="danger" onClick={cancelBatch} disabled={batchStatus === "cancelling"}>Cancel Batch</Btn>}
        <div style={{ flex: 1, minWidth: 12 }} />
        <div role="tablist" aria-label="Execute views" style={{ display: "flex", background: "#000", borderRadius: 6, padding: 2, marginLeft: "auto" }}>
          {["visual", "log", "entities"].map(v => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} style={{ padding: "6px 12px", background: view === v ? "#333" : "transparent", border: "none", color: view === v ? "#fff" : "#888", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div role="alert" style={{ background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: 6,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', fontFamily: FONT, marginBottom: 4 }}>
            Model has {validation.errors.length} blocking error{validation.errors.length > 1 ? 's' : ''} — fix before running:
          </div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fca5a5', fontFamily: FONT }}>
              [{e.code}] {e.message}
            </div>
          ))}
        </div>
      )}

      {validation.errors.length === 0 && validation.warnings.length > 0 && (
        <div style={{ background: '#78350f', border: '1px solid #d97706', borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fde68a', fontFamily: FONT, marginBottom: 4 }}>
            {validation.warnings.length} warning{validation.warnings.length > 1 ? 's' : ''} — run will proceed:
          </div>
          {validation.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fde68a', fontFamily: FONT }}>
              [{w.code}] {w.message}
            </div>
          ))}
        </div>
      )}

      {phaseCTruncated && model.maxCPasses && (
        <div style={{ background: C.amber + '18', border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, fontFamily: FONT }}>
            Phase C scan hit the {model.maxCPasses}-pass cap — model may have an unstable or conflicting C-event condition
          </div>
          <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT, marginTop: 4, opacity: 0.8 }}>
            Check your C-event conditions for cycles or conditions that never become false.
          </div>
        </div>
      )}

      {saveStatus && (
        <div style={{
          background: saveStatus.state === 'error' ? '#7f1d1d' : saveStatus.state === 'success' ? '#1b4332' : '#1f2937',
          border: `1px solid ${saveStatus.state === 'error' ? '#dc2626' : saveStatus.state === 'success' ? '#31a24c' : '#4b5563'}`,
          borderRadius: 6, padding: 12, color: saveStatus.state === 'error' ? '#fca5a5' : saveStatus.state === 'success' ? '#86efac' : '#e5e7eb',
          fontSize: 12, fontFamily: FONT,
        }}>
          {saveStatus.message}
        </div>
      )}

      {runLabel.trim() && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN LABEL</span>
          <Tag label={runLabel.trim()} color={C.accent} />
        </div>
      )}

      {(batchStatus !== "idle" || replicationResults.length > 0) && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>REPLICATION BATCH</div>
            <Tag label={batchStatus} color={batchStatus === "complete" ? C.green : batchStatus === "error" || batchStatus === "cancelled" ? C.red : C.amber} />
            <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
              {batchStatus === "complete"
                ? `${replicationResults.length} replications complete`
                : `Running ${batchProgress?.completed || replicationResults.length}/${batchProgress?.total || replications}`}
            </div>
            {batchStatus !== "complete" && (
              <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>
                Pool: {batchProgress?.workerCount || "—"} · Running: {batchProgress?.running || 0} · Pending: {batchProgress?.pending || 0}
              </div>
            )}
          </div>

          {/* Aggregate KPI summary — shown prominently at the top only when complete */}
          {batchStatus === "complete" && Object.values(aggregateStats).some(stat => stat.n >= 2) && (
            <div style={{
              background: `${C.green}0d`,
              border: `1px solid ${C.green}44`,
              borderRadius: 6,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              <div style={{ fontSize: 10, color: C.green, fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>
                AGGREGATE RESULTS — {replicationResults.length} REPLICATIONS
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 10,
              }}>
                {CI_METRICS.map(metric => {
                  const stat = aggregateStats[metric];
                  if (!stat || stat.n < 2) return null;
                  return (
                    <div key={metric} style={{
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 5,
                      padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 4 }}>
                        {METRIC_LABELS[metric]}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontFamily: FONT }}>
                        {fmt(stat.mean)}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>
                        ±{fmt(stat.halfWidth)} (95% CI)
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Individual replication rows */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: 8 }}>Rep #</th>
                  <th style={{ padding: 8 }}>Seed</th>
                  <th style={{ padding: 8 }}>Served</th>
                  <th style={{ padding: 8 }}>Avg wait</th>
                  <th style={{ padding: 8 }}>Avg service</th>
                  <th style={{ padding: 8 }}>Avg sojourn</th>
                  <th style={{ padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {replicationResults.map(payload => (
                  <tr key={payload.replicationIndex} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: 8 }}>{payload.replicationIndex + 1}</td>
                    <td style={{ padding: 8, color: C.amber }}>{payload.seed}</td>
                    <td style={{ padding: 8 }}>{payload.result?.summary?.served ?? "—"}</td>
                    <td style={{ padding: 8 }}>{fmt(payload.result?.summary?.avgWait)}</td>
                    <td style={{ padding: 8 }}>{fmt(payload.result?.summary?.avgSvc)}</td>
                    <td style={{ padding: 8 }}>{fmt(payload.result?.summary?.avgSojourn)}</td>
                    <td style={{ padding: 8 }}><Tag label="complete" color={C.green} /></td>
                  </tr>
                ))}
                {!replicationResults.length && (
                  <tr>
                    <td colSpan={7} style={{ padding: 8, color: C.muted }}>Waiting for first replication result...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* CI confidence-interval table — live-updates as reps complete, always shown when n≥2 */}
          {Object.values(aggregateStats).some(stat => stat.n >= 2) && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: 8 }}>Metric</th>
                    <th style={{ padding: 8 }}>Mean</th>
                    <th style={{ padding: 8 }}>Lower 95%</th>
                    <th style={{ padding: 8 }}>Upper 95%</th>
                    <th style={{ padding: 8 }}>Half-width</th>
                    <th style={{ padding: 8 }}>n</th>
                  </tr>
                </thead>
                <tbody>
                  {CI_METRICS.map(metric => {
                    const stat = aggregateStats[metric];
                    if (!stat || stat.n < 2) return null;
                    return (
                      <tr key={metric} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: 8 }}>{METRIC_LABELS[metric]}</td>
                        <td style={{ padding: 8, color: C.accent }}>{fmt(stat.mean)}</td>
                        <td style={{ padding: 8 }}>{fmt(stat.lower)}</td>
                        <td style={{ padding: 8 }}>{fmt(stat.upper)}</td>
                        <td style={{ padding: 8, color: C.amber }}>{fmt(stat.halfWidth)}</td>
                        <td style={{ padding: 8 }}>{stat.n}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "visual" && <VisualView snap={currentSnap} model={model} summary={results?.summary} />}

      {view === "log" && (
        <div style={{ background: "#050505", border: `1px solid #333`, borderRadius: 6, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid #333` }}>
            <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>SIMULATION LOG (NEWEST FIRST)</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", fontFamily: FONT }}>
              Steps: {log.length} | Clock: {currentSnap?.clock?.toFixed(0) || '—'}
            </div>
          </div>
          <div style={{ maxHeight: 350, overflowY: 'auto' }}>
            {log.length === 0 ? <div style={{ color: "#444", fontSize: 12 }}>Log empty. Run simulation to see events.</div> :
              [...log].reverse().map((r, i) => (
                <div key={i}>
                  {r.phase === "WARMUP" && (
                    <div style={{ padding: "12px 0", borderBottom: "1px solid #333", borderTop: "1px solid #333", margin: "8px 0", textAlign: "center", color: C.amber, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, background: "#78350f22" }}>
                      ──── WARM-UP ENDED AT T={r.time?.toFixed(0)} ────
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontFamily: "monospace", color: r.phase === "WARMUP" ? C.amber : "#10b981", borderBottom: "1px solid #1a1a1a", padding: "4px 0" }}>
                    <span style={{ color: "#666" }}>[t={r.time?.toFixed(0)}]</span> <PhaseTag phase={r.phase} /> {r.message}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {view === "entities" && currentSnap && (
        <div style={{ background: "#050505", border: `1px solid #333`, borderRadius: 6, padding: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", color: "#fff", fontSize: 12, textAlign: "left" }}>
            <thead>
              <tr style={{ color: "#888", borderBottom: "2px solid #333" }}>
                <th style={{ padding: 8 }}>Entity</th><th style={{ padding: 8 }}>Type</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Queue</th>
              </tr>
            </thead>
            <tbody>
              {currentSnap.entities.map(e => (
                <tr key={e.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <td style={{ padding: 8, color: "#38bdf8" }}>#{e.id}</td>
                  <td style={{ padding: 8 }}>{e.type}</td>
                  <td style={{ padding: 8 }}><Tag label={e.status} color={e.status === 'waiting' ? "#f59e0b" : "#10b981"} /></td>
                  <td style={{ padding: 8, color: "#666" }}>{e.queue || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {aiPanelOpen && (
        <AiAssistantPanel
          model={model}
          results={results}
          exportConfig={exportConfig}
          aggregateStats={aggregateStats}
          comparisonRuns={comparisonRuns}
          comparisonLoading={runHistoryStatus === "loading"}
          comparisonError={runHistoryError}
          onClose={() => setAiPanelOpen(false)}
        />
      )}
    </div>
  );
};

export {
  buildResultsCsv,
  buildResultsExportPayload,
  CustomerToken,
  ExecutePanel,
  slugifyResultName,
  timestampForFilename,
  VisualView,
};
