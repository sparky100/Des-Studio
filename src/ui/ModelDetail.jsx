// ui/ModelDetail.jsx — ModelDetail, ModelCard, NewModelModal
import { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import pkg from '../../package.json';
import { C, FONT } from "./shared/tokens.js";
import { Tag, Avatar, Btn, Field, SH, InfoBox, Empty, ErrorBoundary } from "./shared/components.jsx";
import { EntityTypeEditor, StateVarEditor, BEventEditor, CEventEditor, QueueEditor } from "./editors/index.jsx";
import { AiGeneratedModelPanel } from "./editors/AiGeneratedModelPanel.jsx";
import { GoalsEditor } from "./editors/GoalsEditor.jsx";
import { ExecutePanel } from "./execute/index.jsx";
import { CsvImportModal } from "./CsvImportModal.jsx";
import { ResultsWorkspace } from "./results/ResultsWorkspace.jsx";

// Lazy-loaded so @xyflow/react is not included in the initial bundle.
const VisualDesignerPanel = lazy(() =>
  import("./visual-designer/VisualDesignerPanel.jsx").then(m => ({ default: m.VisualDesignerPanel }))
);
import { fetchRunHistory, listShareLinks } from "../db/models.js";
import { validateModel }                    from "../engine/validation.js";
import { renameQueue }                      from "../engine/queue-refs.js";

const MODEL_JSON_KEYS = ["entityTypes", "stateVariables", "bEvents", "cEvents", "queues", "graph"];

function slugifyModelName(name = "") {
  return (name || "untitled")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function modelJsonFromModel(model = {}) {
  return MODEL_JSON_KEYS.reduce((json, key) => {
    if (key === "graph") {
      return model.graph && typeof model.graph === "object" && !Array.isArray(model.graph)
        ? { ...json, graph: model.graph }
        : json;
    }
    return {
      ...json,
      [key]: Array.isArray(model[key]) ? model[key] : [],
    };
  }, {});
}

function buildModelExportPayload(model, exportedAt = new Date().toISOString()) {
  const payload = {
    name: model.name || "Untitled model",
    model_json: modelJsonFromModel(model),
    exportedAt,
    appVersion: pkg.version,
  };
  if (model.description) payload.description = model.description;
  return payload;
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function buildRunHistoryExportPayload(model, rows = [], exportedAt = new Date().toISOString()) {
  return {
    schema: "des-studio.run-history.v1",
    exportedAt,
    model: {
      id: model?.id ?? null,
      name: model?.name ?? "Untitled model",
    },
    runs: rows.map(row => ({
      id: row.id,
      runLabel: row.run_label || "",
      ranAt: row.ran_at,
      seed: row.seed ?? null,
      replications: row.replications ?? 1,
      warmupPeriod: row.warmup_period ?? null,
      maxSimulationTime: row.max_simulation_time ?? null,
      totalArrived: row.total_arrived ?? 0,
      totalServed: row.total_served ?? 0,
      totalReneged: row.total_reneged ?? 0,
      renegeRate: row.renege_rate ?? null,
      avgWaitTime: row.avg_wait_time ?? null,
      avgServiceTime: row.avg_service_time ?? null,
      durationMs: row.duration_ms ?? null,
      resultsJson: row.results_json ?? null,
    })),
  };
}

function buildRunHistoryCsv(rows = []) {
  const table = [[
    "runLabel",
    "ranAt",
    "seed",
    "replications",
    "warmupPeriod",
    "maxSimulationTime",
    "totalArrived",
    "totalServed",
    "totalReneged",
    "renegeRate",
    "avgWaitTime",
    "avgServiceTime",
    "durationMs",
  ]];

  for (const row of rows) {
    table.push([
      row.run_label || "",
      row.ran_at,
      row.seed ?? "",
      row.replications ?? 1,
      row.warmup_period ?? "",
      row.max_simulation_time ?? "",
      row.total_arrived ?? 0,
      row.total_served ?? 0,
      row.total_reneged ?? 0,
      row.renege_rate ?? "",
      row.avg_wait_time ?? "",
      row.avg_service_time ?? "",
      row.duration_ms ?? "",
    ]);
  }

  return table.map(row => row.map(csvEscape).join(",")).join("\n");
}

const MODEL_HEALTH_TAB_LABELS = {
  overview: "Overview",
  visual: "Visual Designer",
  ai: "AI Designer",
  entities: "Entity Types",
  queues: "Queues",
  bevents: "B-Events",
  cevents: "C-Events",
  state: "State Vars",
  execute: "Execute",
  results: "Results",
  history: "History",
};

const ModelDetail=({modelId,modelData,onBack,onRefresh,overrides={},initialTab})=>{
  const [model,setModel]=useState(()=>{
    if(!modelData) return null;
    return {
      ...modelData,
      entityTypes:   modelData.entityTypes   || [],
      stateVariables:modelData.stateVariables || [],
      bEvents:       modelData.bEvents        || [],
      cEvents:       modelData.cEvents        || [],
      queues:        modelData.queues         || [],
      graph:         modelData.graph          || null,
      access:        modelData.access         || {},
    };
  });
  const [tab,setTab]=useState(initialTab||"overview");
  const [dirty,setDirty]=useState(false);
  const [saveStatus,setSaveStatus]=useState(null);
  const [saving,setSaving]=useState(false);
  const [past,setPast]=useState([]);    // undo stack — model snapshots, capped at 20
  const [future,setFuture]=useState([]); // redo stack
  const [historyRows,setHistoryRows]=useState([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState("");
  const [shareLinksMap,setShareLinksMap]=useState({});
  const [showCsvImport,setShowCsvImport]=useState(false);
  const [analyseRun,setAnalyseRun]=useState(null);
  const [latestResults,setLatestResults]=useState(null);
  const [selectedResultsRunId,setSelectedResultsRunId]=useState("");

  const handleAnalyseRun=useCallback((row)=>{setAnalyseRun(row);setTab("execute");},[]);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname.replace(/\/+$/, "") : "";
  const isOwner=overrides.isOwner!==undefined?overrides.isOwner:false;
  const canEdit=overrides.canEdit!==undefined?overrides.canEdit:false;

  useEffect(() => {
    if (modelData?.stats && modelData.stats.runs !== model?.stats?.runs) {
      setModel(m => ({
        ...m,
        stats: modelData.stats,
        statsLoading: modelData.statsLoading,
        statsError: modelData.statsError,
      }));
    } else if (modelData && (modelData.statsLoading !== model?.statsLoading || modelData.statsError !== model?.statsError)) {
      setModel(m => ({
        ...m,
        statsLoading: modelData.statsLoading,
        statsError: modelData.statsError,
      }));
    }
  }, [modelData?.stats, modelData?.statsLoading, modelData?.statsError]);

  const setField=(f,v)=>{
    setPast(p=>[...p.slice(-19),model]); // push snapshot before change, cap at 20
    setFuture([]);                        // new edit clears redo stack
    setModel(m=>({...m,[f]:v}));
    setDirty(true);
    setSaveStatus(null);
  };
  const setWholeModel=(nextModel)=>{
    setPast(p=>[...p.slice(-19),model]);
    setFuture([]);
    setModel(nextModel);
    setDirty(true);
    setSaveStatus(null);
  };
  const mergeGeneratedModel=(current,nextModel)=>({
    ...current,
    ...(nextModel.name ? { name: nextModel.name } : {}),
    ...(nextModel.description ? { description: nextModel.description } : {}),
    entityTypes: Array.isArray(nextModel.entityTypes) ? nextModel.entityTypes : (current.entityTypes || []),
    stateVariables: Array.isArray(nextModel.stateVariables) ? nextModel.stateVariables : (current.stateVariables || []),
    bEvents: Array.isArray(nextModel.bEvents) ? nextModel.bEvents : (current.bEvents || []),
    cEvents: Array.isArray(nextModel.cEvents) ? nextModel.cEvents : (current.cEvents || []),
    queues: Array.isArray(nextModel.queues) ? nextModel.queues : (current.queues || []),
    graph: nextModel.graph && typeof nextModel.graph === "object" && !Array.isArray(nextModel.graph) ? nextModel.graph : (current.graph || null),
  });
  const applyGeneratedModel=(nextModel)=>{
    const merged=mergeGeneratedModel(model,nextModel);
    setPast(p=>[...p.slice(-19),model]);
    setFuture([]);
    setModel(merged);
    setDirty(true);
    setSaveStatus(null);
    return merged;
  };
  const saveGeneratedModel=async(nextModel)=>{
    const merged=mergeGeneratedModel(model,nextModel);
    setPast(p=>[...p.slice(-19),model]);
    setFuture([]);
    setModel(merged);
    setSaving(true);
    setSaveStatus({state:"saving",message:"Saving generated model..."});
    try{
      await overrides.onSave?.(merged);
      setDirty(false);
      setSaveStatus({state:"success",message:"Saved"});
      await onRefresh?.();
    }catch(error){
      setDirty(true);
      setSaveStatus({state:"error",message:error?.message||"Save failed"});
      throw error;
    }finally{
      setSaving(false);
    }
    return merged;
  };
  const undo=()=>{
    if(!past.length)return;
    const prev=past[past.length-1];
    setFuture(f=>[model,...f.slice(0,19)]);
    setPast(p=>p.slice(0,-1));
    setModel(prev);
    setDirty(true);
  };
  const redo=()=>{
    if(!future.length)return;
    const next=future[0];
    setPast(p=>[...p.slice(-19),model]);
    setFuture(f=>f.slice(1));
    setModel(next);
    setDirty(true);
  };

  // Ref keeps keyboard handler current without re-registering on every render
  const _ur=useRef({undo,redo});
  _ur.current={undo,redo};
  useEffect(()=>{
    const onKey=(e)=>{
      if(!(e.ctrlKey||e.metaKey))return;
      if(e.key==='z'&&!e.shiftKey){e.preventDefault();_ur.current.undo();}
      if((e.key==='z'&&e.shiftKey)||e.key==='y'){e.preventDefault();_ur.current.redo();}
    };
    document.addEventListener('keydown',onKey);
    return()=>document.removeEventListener('keydown',onKey);
  },[]);

  const save=async()=>{
    setSaving(true);
    setSaveStatus({state:"saving",message:"Saving..."});
    try{
      await overrides.onSave?.(model);
      setDirty(false);
      setSaveStatus({state:"success",message:"Saved"});
      await onRefresh?.();
    }catch(error){
      setDirty(true);
      setSaveStatus({state:"error",message:error?.message||"Save failed"});
    }finally{
      setSaving(false);
    }
  };

  const handleBack=()=>{
    if(dirty&&!window.confirm('You have unsaved changes. Leave without saving?'))return;
    onBack();
  };

  useEffect(()=>{
    const onBeforeUnload=(e)=>{
      if(!dirty)return;
      e.preventDefault();
      e.returnValue=''; // Chrome requires this to show the native dialog
    };
    window.addEventListener('beforeunload',onBeforeUnload);
    return()=>window.removeEventListener('beforeunload',onBeforeUnload);
  },[dirty]);

  const validation = useMemo(() => model ? validateModel(model) : { errors: [], warnings: [] }, [model]);

  const handleRunSaved=()=>{
    // Increment runs optimistically — do NOT call onRefresh here.
    // onRefresh calls loadData() which sets loading=true, unmounting ModelDetail
    // and losing ExecutePanel state (results, tab position) mid-session.
    setModel(current=>({
      ...current,
      stats:{
        ...(current.stats||{}),
        runs:Number.isFinite(current.stats?.runs) ? current.stats.runs + 1 : 1,
      },
      statsLoading:false,
      statsError:false,
    }));
    if(tab==="history"){
      setHistoryLoading(true);setHistoryError("");
      fetchRunHistory(modelId)
        .then(rows=>setHistoryRows(rows))
        .catch(e=>setHistoryError(e.message))
        .finally(()=>setHistoryLoading(false));
    }
    // Intentionally not calling onRefresh() — it triggers a full loadData()
    // which sets loading=true and unmounts ModelDetail, resetting the execute panel.
  };

  const exportJson = () => {
    const currentValidation = validateModel(model);
    if (currentValidation.errors.length > 0 && !window.confirm("This model has validation errors. Export anyway?")) {
      return;
    }
    const payload = buildModelExportPayload(model);
    downloadJsonFile(payload, `des-studio-${slugifyModelName(model.name)}.json`);
  };

  const exportRunHistoryJson = () => {
    const payload = buildRunHistoryExportPayload(model, historyRows);
    downloadJsonFile(payload, `des-studio-run-history-${slugifyModelName(model.name)}.json`);
  };

  const exportRunHistoryCsv = () => {
    const csv = buildRunHistoryCsv(historyRows);
    downloadTextFile(csv, `des-studio-run-history-${slugifyModelName(model.name)}.csv`, "text/csv;charset=utf-8");
  };

  const hasResultsPayload = row => {
    const json = row?.results_json;
    return !!(json && typeof json === "object" && (json.summary || json.timeSeries || json.waitDist));
  };

  const loadResultsRun = runId => {
    const row = historyRows.find(r => r.id === runId);
    if (!hasResultsPayload(row)) return;
    setSelectedResultsRunId(row.id);
    setLatestResults(row.results_json);
  };
  const formatRunDate = value => {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "Unknown";
    return `${dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} ${dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
  };
  const formatPercent = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
  const formatTime = value => value != null && Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}t` : "—";

  const TabErrors = ({ tabId }) => {
    const errs  = validation.errors.filter(e => e.tab === tabId);
    const warns = validation.warnings.filter(w => w.tab === tabId);
    if (!errs.length && !warns.length) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {errs.map((e, i) => (
          <div key={i} role="alert" style={{ background: C.errorBg, border: `1px solid ${C.danger}`, borderRadius: 6,
            padding: '8px 12px', color: C.error, fontFamily: FONT, fontSize: 12 }}>
            [{e.code}] {e.message}
          </div>
        ))}
        {warns.map((w, i) => (
          <div key={i} style={{ background: C.warmup, border: `1px solid ${C.amber}`, borderRadius: 6,
            padding: '8px 12px', color: C.warnBg, fontFamily: FONT, fontSize: 12 }}>
            [{w.code}] {w.message}
          </div>
        ))}
      </div>
    );
  };

  const ModelHealthPanel = () => {
    const blockers = validation.errors || [];
    const warnings = validation.warnings || [];
    const issues = [...blockers, ...warnings].slice(0, 5);
    const hasBlockers = blockers.length > 0;
    const hasWarnings = warnings.length > 0;
    const statusColor = hasBlockers ? C.red : hasWarnings ? C.amber : C.green;
    const statusBg = hasBlockers ? C.errorBg : hasWarnings ? C.warmup : C.green + "14";
    const statusBorder = hasBlockers ? C.danger : hasWarnings ? C.amber : C.green;
    const statusTitle = hasBlockers
      ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`
      : hasWarnings
        ? `Ready with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
        : "Ready to run";
    const completedRuns = Number.isFinite(model.stats?.runs) ? model.stats.runs : 0;
    const actionHint = hasBlockers
      ? "Resolve the listed issues first."
      : latestResults
        ? "Review the latest run or run another scenario."
        : completedRuns > 0
          ? "Pick a saved run or start a fresh execution."
          : "Run this model to generate results.";

    return (
      <section
        aria-label="Model health"
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 12,
          marginBottom: 14,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{display:"flex",alignItems:"flex-start",gap:10,minWidth:0,flex:"1 1 280px",flexWrap:"wrap"}}>
          <div style={{
            background: statusBg,
            border: `1px solid ${statusBorder}66`,
            borderRadius: 6,
            padding: "6px 9px",
            color: statusColor,
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}>
            {statusTitle}
          </div>
          <div style={{minWidth:0,flex:"1 1 220px"}}>
            <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.4,fontWeight:700,marginBottom:4}}>MODEL HEALTH</div>
            <div style={{fontSize:12,color:C.text,fontFamily:FONT,lineHeight:1.5}}>
              {hasBlockers
                ? "Fix blocking validation issues before running this model."
                : hasWarnings
                  ? "The model can run, but review the warnings before trusting outputs."
                  : "No blocking validation issues found."}
            </div>
          </div>
        </div>
        {issues.length > 0 && (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end",flex:"1 1 320px",minWidth:0}}>
            {issues.map((issue, index) => {
              const targetTab = issue.tab || "overview";
              const tabLabel = MODEL_HEALTH_TAB_LABELS[targetTab] || "Overview";
              const isError = blockers.includes(issue);
              return (
                <button
                  key={`${issue.code}-${index}-${targetTab}`}
                  type="button"
                  onClick={() => setTab(targetTab)}
                  title={issue.message}
                  style={{
                    background: isError ? C.errorBg : C.warmup,
                    border: `1px solid ${isError ? C.danger : C.amber}66`,
                    borderRadius: 6,
                    color: isError ? C.error : C.warnBg,
                    cursor: "pointer",
                    fontFamily: FONT,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "7px 9px",
                    maxWidth: "100%",
                    flex: "1 1 240px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  [{issue.code}] {tabLabel}: {issue.message}
                </button>
              );
            })}
          </div>
        )}
        <div style={{
          borderTop: `1px solid ${C.border}`,
          paddingTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flex: "1 1 100%",
          flexWrap: "wrap",
        }}>
          <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>
            {actionHint}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {!hasBlockers && <Btn small variant="primary" onClick={()=>setTab("execute")}>Run Model</Btn>}
            {!hasBlockers && latestResults && <Btn small variant="ghost" onClick={()=>setTab("results")}>View Results</Btn>}
            {!hasBlockers && completedRuns > 0 && <Btn small variant="ghost" onClick={()=>setTab("history")}>Run History</Btn>}
          </div>
        </div>
      </section>
    );
  };

  const TABS=[
    // ── DESIGN ──
    {id:"overview",label:"Overview"},
    {id:"visual",label:"Visual Designer"},
    {id:"ai",label:"AI Designer"},
    {id:"_model",label:"─── Model ───",disabled:true},
    {id:"entities",label:"Entity Types"},
    {id:"queues",label:"Queues"},
    {id:"bevents",label:"B-Events"},
    {id:"cevents",label:"C-Events"},
    {id:"state",label:"State Vars"},
    {id:"validate",label:"Validate"},
    // ── RUN ──
    {id:"_runlabel",label:"─── Run ───",disabled:true},
    {id:"execute",label:"▶ Execute"},
    {id:"results",label:"Results"},
    {id:"history",label:"History"},
    ...(isOwner?[{id:"access",label:"Access"}]:[]),
  ];
  const selectableTabs = TABS.filter(t => !t.disabled);
  const NAV_MODES=[
    {id:"visual-design",label:"Visual Design",primaryTab:"visual",tabs:["overview","visual","ai"]},
    {id:"entity-model",label:"Entity Model",primaryTab:"entities",tabs:["entities","queues","state"]},
    {id:"event-logic",label:"Event Logic",primaryTab:"bevents",tabs:["bevents","cevents"]},
    {id:"validate",label:"Validate",primaryTab:"validate",tabs:["validate"]},
    {id:"execute",label:"Execute",primaryTab:"execute",tabs:["execute"]},
    {id:"results",label:"Results",primaryTab:"results",tabs:["results","history"]},
    ...(isOwner?[{id:"access",label:"Access",primaryTab:"access",tabs:["access"]}]:[]),
  ];
  const tabById = Object.fromEntries(selectableTabs.map(t => [t.id, t]));
  const activeMode = NAV_MODES.find(mode => mode.tabs.includes(tab)) || NAV_MODES[0];
  const tabIssueCounts = useMemo(() => {
    const counts = {};
    for (const issue of validation.errors || []) {
      const tabId = issue.tab || "overview";
      counts[tabId] = { errors: (counts[tabId]?.errors || 0) + 1, warnings: counts[tabId]?.warnings || 0 };
      counts.validate = { errors: (counts.validate?.errors || 0) + 1, warnings: counts.validate?.warnings || 0 };
    }
    for (const issue of validation.warnings || []) {
      const tabId = issue.tab || "overview";
      counts[tabId] = { errors: counts[tabId]?.errors || 0, warnings: (counts[tabId]?.warnings || 0) + 1 };
      counts.validate = { errors: counts.validate?.errors || 0, warnings: (counts.validate?.warnings || 0) + 1 };
    }
    return counts;
  }, [validation]);
  const tabIssueLabel = tabId => {
    const counts = tabIssueCounts[tabId];
    if (!counts) return "";
    const parts = [];
    if (counts.errors) parts.push(`${counts.errors} error${counts.errors === 1 ? "" : "s"}`);
    if (counts.warnings) parts.push(`${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}`);
    return parts.join(", ");
  };
  const authoringShellMode = ["visual-design", "entity-model", "event-logic"].includes(activeMode.id)
    ? activeMode
    : null;
  const AuthoringWorkflowShell = ({mode, children}) => {
    const modeTabs = mode.tabs.filter(tabId => tabById[tabId]);
    const modeCounts = modeTabs.reduce((acc, tabId) => {
      const counts = tabIssueCounts[tabId] || {};
      return {
        errors: acc.errors + (counts.errors || 0),
        warnings: acc.warnings + (counts.warnings || 0),
      };
    }, {errors: 0, warnings: 0});
    const activeLabel = tabById[tab]?.label || mode.label;
    const nextAction = modeCounts.errors > 0
      ? "Resolve blockers before executing."
      : mode.id === "visual-design"
        ? "Shape the process map, then validate the generated model structure."
        : mode.id === "entity-model"
          ? "Define entities, queues, and state before adding event logic."
          : "Connect B-Events and C-Events, then validate the run path.";

    return (
      <section
        aria-label={`${mode.label} authoring shell`}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <aside
          aria-label={`${mode.label} sections`}
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flex: "0 1 210px",
            minWidth: 180,
          }}
        >
          <div style={{fontSize:9,color:C.muted,fontFamily:FONT,letterSpacing:1.3,fontWeight:700}}>MODE SECTIONS</div>
          {modeTabs.map(tabId => {
            const section = tabById[tabId];
            const selected = tab === tabId;
            const counts = tabIssueCounts[tabId] || {};
            return (
              <button
                key={tabId}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={()=>setTab(tabId)}
                style={{
                  background: selected ? C.accent + "18" : C.surface,
                  border: `1px solid ${selected ? C.accent : C.border}`,
                  borderRadius: 6,
                  color: selected ? C.accent : C.text,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: selected ? 700 : 600,
                  padding: "8px 9px",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <span>{section.label}</span>
                {(counts.errors || counts.warnings) ? (
                  <span style={{color: counts.errors ? C.red : C.amber, fontSize: 10, fontWeight: 700}}>
                    {counts.errors || counts.warnings}
                  </span>
                ) : null}
              </button>
            );
          })}
        </aside>
        <main
          aria-label={`${mode.label} workspace`}
          style={{
            flex: "1 1 520px",
            minWidth: 0,
          }}
        >
          {children}
        </main>
        <aside
          aria-label={`${mode.label} context panel`}
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            flex: "0 1 280px",
            minWidth: 220,
          }}
        >
          <div>
            <div style={{fontSize:9,color:C.muted,fontFamily:FONT,letterSpacing:1.3,fontWeight:700,marginBottom:5}}>WORKFLOW CONTEXT</div>
            <div style={{fontSize:13,color:C.text,fontFamily:FONT,fontWeight:700}}>{activeLabel}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2, minmax(0, 1fr))",gap:8}}>
            {[
              {label:"Blockers",value:modeCounts.errors,color:modeCounts.errors?C.red:C.green},
              {label:"Warnings",value:modeCounts.warnings,color:modeCounts.warnings?C.amber:C.green},
            ].map(item=>(
              <div key={item.label} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 9px"}}>
                <div style={{fontSize:8,color:C.muted,fontFamily:FONT,letterSpacing:1,fontWeight:700,marginBottom:3}}>{item.label.toUpperCase()}</div>
                <div style={{fontSize:16,color:item.color,fontFamily:FONT,fontWeight:700}}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.6}}>
            {nextAction}
          </div>
          <Btn small variant={modeCounts.errors ? "ghost" : "primary"} onClick={()=>setTab("validate")}>
            Open Validate
          </Btn>
        </aside>
      </section>
    );
  };
  const renderAuthoringShell = content => (
    authoringShellMode ? <AuthoringWorkflowShell mode={authoringShellMode}>{content}</AuthoringWorkflowShell> : content
  );

  useEffect(()=>{
    if(tab!=="history"&&tab!=="results")return;
    setHistoryLoading(true);setHistoryError("");
    Promise.all([
      fetchRunHistory(modelId),
      listShareLinks(modelId).catch(()=>[]),
    ]).then(([rows, links])=>{
      const nextRows = rows || [];
      setHistoryRows(nextRows);
      const map = {};
      (links||[]).forEach(link => { if (link.isActive && link.runId) map[link.runId] = link; });
      setShareLinksMap(map);
      if(tab==="results"){
        const selected = nextRows.find(row => row.id === selectedResultsRunId && hasResultsPayload(row));
        const fallback = nextRows.find(hasResultsPayload);
        const row = selected || fallback;
        if(row && !latestResults){
          setSelectedResultsRunId(row.id);
          setLatestResults(row.results_json);
        }
      }
    }).catch(e=>setHistoryError(e.message))
    .finally(()=>setHistoryLoading(false));
  },[tab,modelId,selectedResultsRunId,latestResults]);

  if(!model)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',
      justifyContent:'center',color:C.red,fontFamily:FONT,fontSize:13}}>
      Error: model not found
    </div>
  );
  const runCountValue = model.statsLoading || model.statsError ? "—" : model.stats?.runs ?? 0;
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100dvh",minHeight:"100vh",background:C.bg}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 20px",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,flexWrap:"wrap"}}>
        <Btn small variant="ghost" onClick={handleBack}>← Back</Btn>
        <div style={{flex:"1 1 220px",minWidth:0,fontWeight:700,fontSize:14,color:C.text,fontFamily:FONT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{model.name}</div>
        <Tag label={model.visibility} color={model.visibility==="public"?C.green:C.accent}/>
        <Tag label={`v${pkg.version}`} color={C.purple}/>
        {canEdit&&<Btn small variant="ghost" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">↩ Undo</Btn>}
        {canEdit&&<Btn small variant="ghost" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">↪ Redo</Btn>}
        <Btn small variant="ghost" onClick={exportJson}>Export Model</Btn>
        {saveStatus&&(
          <div role={saveStatus.state==="error"?"alert":"status"} style={{
            color: saveStatus.state==="error"?C.red:saveStatus.state==="success"?C.green:C.muted,
            fontFamily:FONT,
            fontSize:11,
            fontWeight:700,
          }}>
            {saveStatus.message}
          </div>
        )}
        {canEdit&&dirty&&<Btn small variant="primary" onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Btn>}
      </div>
      <div aria-label="Model workflow modes" style={{display:"flex",alignItems:"stretch",gap:8,padding:"8px 20px",borderBottom:`1px solid ${C.border}`,background:C.bg,overflowX:"auto",flexShrink:0}}>
        {NAV_MODES.map(mode=>{
          const selected = activeMode.id === mode.id;
          const modeCounts = mode.tabs.reduce((acc, tabId) => {
            const counts = tabIssueCounts[tabId] || {};
            return { errors: acc.errors + (counts.errors || 0), warnings: acc.warnings + (counts.warnings || 0) };
          }, { errors: 0, warnings: 0 });
          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={selected}
              onClick={()=>setTab(mode.primaryTab)}
              style={{
                background:selected?C.panel:C.surface,
                border:`1px solid ${selected?C.accent:C.border}`,
                borderRadius:6,
                color:selected?C.accent:C.text,
                cursor:"pointer",
                display:"inline-flex",
                alignItems:"center",
                gap:6,
                flexShrink:0,
                fontFamily:FONT,
                fontSize:11,
                fontWeight:700,
                padding:"7px 10px",
                whiteSpace:"nowrap",
              }}
            >
              <span>{mode.label}</span>
              {modeCounts.errors > 0 && (
                <span aria-hidden="true" style={{background:C.errorBg,border:`1px solid ${C.danger}66`,borderRadius:10,color:C.error,fontSize:9,padding:"1px 5px"}}>
                  {modeCounts.errors}
                </span>
              )}
              {!modeCounts.errors && modeCounts.warnings > 0 && (
                <span aria-hidden="true" style={{background:C.warmup,border:`1px solid ${C.amber}66`,borderRadius:10,color:C.warnBg,fontSize:9,padding:"1px 5px"}}>
                  {modeCounts.warnings}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{display:"flex",alignItems:"stretch",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px 6px 20px",borderRight:`1px solid ${C.border}`,flexShrink:0}}>
          <label htmlFor="model-section-jump" style={{fontSize:9,color:C.muted,fontFamily:FONT,letterSpacing:1.1,fontWeight:700,whiteSpace:"nowrap"}}>SECTION</label>
          <select
            id="model-section-jump"
            aria-label="Jump to model section"
            value={tab}
            onChange={e=>setTab(e.target.value)}
            style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"5px 7px",maxWidth:180,outline:"none"}}
          >
            {NAV_MODES.map(mode=>(
              <optgroup key={mode.id} label={mode.label}>
                {mode.tabs.filter(tabId => tabById[tabId]).map(tabId=>{
                  const t = tabById[tabId];
                  const counts = tabIssueCounts[t.id];
                  const suffix = counts ? ` (${counts.errors || 0}/${counts.warnings || 0})` : "";
                  return <option key={t.id} value={t.id}>{t.label}{suffix}</option>;
                })}
              </optgroup>
            ))}
          </select>
        </div>
        <div role="tablist" aria-label="Model sections" style={{display:"flex",paddingLeft:8,flex:1,minWidth:0,overflowX:"auto"}}>
          {TABS.map(t=>t.disabled?(
            <div key={t.id} style={{fontSize:9,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700,padding:"10px 8px",whiteSpace:"nowrap",userSelect:"none",opacity:0.5}}>{t.label}</div>
          ):(
            <button key={t.id} type="button" role="tab" aria-selected={tab===t.id} aria-label={`${t.label}${tabIssueLabel(t.id) ? `, ${tabIssueLabel(t.id)}` : ""}`} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",whiteSpace:"nowrap",
              borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",
              color:tab===t.id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:"10px 16px",cursor:"pointer",fontWeight:tab===t.id?700:400,display:"inline-flex",alignItems:"center",gap:6}}>
              <span>{t.label}</span>
              {tabIssueCounts[t.id]?.errors > 0 && (
                <span aria-hidden="true" style={{background:C.errorBg,border:`1px solid ${C.danger}66`,borderRadius:10,color:C.error,fontSize:9,fontWeight:700,padding:"1px 5px"}}>
                  {tabIssueCounts[t.id].errors}
                </span>
              )}
              {!tabIssueCounts[t.id]?.errors && tabIssueCounts[t.id]?.warnings > 0 && (
                <span aria-hidden="true" style={{background:C.warmup,border:`1px solid ${C.amber}66`,borderRadius:10,color:C.warnBg,fontSize:9,fontWeight:700,padding:"1px 5px"}}>
                  {tabIssueCounts[t.id].warnings}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"clamp(12px,2vw,20px)"}}>
        {canEdit&&dirty&&(
          <div role="status" style={{
            background:C.amber+"18",
            border:`1px solid ${C.amber}66`,
            borderRadius:6,
            padding:"10px 12px",
            marginBottom:14,
            display:"flex",
            alignItems:"center",
            justifyContent:"space-between",
            gap:12,
            flexWrap:"wrap",
            color:C.text,
            fontFamily:FONT,
            fontSize:12,
          }}>
            <span>Unsaved changes in this model.</span>
            <Btn small variant="primary" onClick={save} disabled={saving}>{saving?"Saving...":"Save Changes"}</Btn>
          </div>
        )}
        <ModelHealthPanel/>
        <ErrorBoundary
          key={tab}
          title="Model panel crashed"
          message="This tab could not render. Try opening the tab again."
        >
        {tab==="ai"&&(
          renderAuthoringShell(
            <AiGeneratedModelPanel model={model} canEdit={canEdit} onApplyModel={applyGeneratedModel} onSaveModel={saveGeneratedModel}/>
          )
        )}
        {tab==="visual"&&(
          renderAuthoringShell(
            <Suspense fallback={
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 48,
                color: C.muted,
                fontFamily: FONT,
                fontSize: 12,
              }}>
                Loading Visual Designer…
              </div>
            }>
              <VisualDesignerPanel model={model} canEdit={canEdit} onModelChange={setWholeModel}/>
            </Suspense>
          )
        )}
        {tab==="overview"&&(
          renderAuthoringShell(<div style={{maxWidth:900,display:"flex",flexDirection:"column",gap:14}}>
            <Field label="Name" value={model.name} onChange={canEdit?v=>setField("name",v):null}/>
            <Field label="Description" value={model.description} onChange={canEdit?v=>setField("description",v):null} multiline rows={4}/>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
              <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,marginBottom:12}}>MODEL STRUCTURE</div>
              <div aria-label="Model structure metrics" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))",gap:10}}>
                {[
                  {label:"Entity Types",value:(model.entityTypes||[]).length,color:C.server},
                  {label:"State Vars",  value:(model.stateVariables||[]).length,color:C.purple},
                  {label:"B-Events",    value:(model.bEvents||[]).length,color:C.bEvent},
                  {label:"C-Events",    value:(model.cEvents||[]).length,color:C.cEvent},
                  {label:"Runs",        value:runCountValue,color:C.green},
                ].map(s=>(
                  <div key={s.label} style={{background:C.bg,borderRadius:6,border:`1px solid ${s.color}33`,padding:"12px 14px"}}>
                    <div style={{fontSize:22,fontWeight:700,color:s.color,fontFamily:FONT}}>{s.value}</div>
                    <div style={{fontSize:11,color:C.muted,fontFamily:FONT}}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
              <GoalsEditor goals={model.goals||[]} onChange={canEdit?v=>setField("goals",v):()=>{}}/>
            </div>
            {/* Startup prompt for empty models */}
            {canEdit&&!(model.entityTypes||[]).length&&!runCountValue&&(
              <div style={{background:C.surface,border:`1px solid ${C.accent}44`,borderRadius:8,padding:18,display:"flex",flexDirection:"column",gap:12}}>
                <div style={{fontSize:13,fontWeight:700,color:C.accent,fontFamily:FONT}}>Get started building your model</div>
                <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.6}}>
                  Choose how you'd like to define your simulation model:
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  <Btn variant="primary" onClick={()=>setTab("visual")}>🎨 Visual Designer</Btn>
                  <Btn variant="ghost" onClick={()=>setTab("ai")}>🤖 AI Designer</Btn>
                  <Btn variant="ghost" onClick={()=>setTab("entities")}>📝 Start with forms</Btn>
                </div>
              </div>
            )}
          </div>)
        )}
        {tab==="entities"&&(
          renderAuthoringShell(<div style={{maxWidth:1100,display:"flex",flexDirection:"column",gap:14}}>
            <TabErrors tabId="entities"/>
            {canEdit&&(
              <div style={{display:"flex",justifyContent:"flex-end"}}>
                <Btn small variant="ghost" onClick={()=>setShowCsvImport(true)}>Import from CSV</Btn>
              </div>
            )}
            <EntityTypeEditor types={model.entityTypes||[]} onChange={canEdit?v=>setField("entityTypes",v):()=>{}}/>
            {showCsvImport&&(
              <CsvImportModal
                onClose={()=>setShowCsvImport(false)}
                onApply={(et)=>{
                  const next=[...(model.entityTypes||[]),et];
                  setField("entityTypes",next);
                }}
              />
            )}
          </div>)
        )}
        {tab==="state"&&renderAuthoringShell(<div style={{maxWidth:900}}><TabErrors tabId="state"/><StateVarEditor vars={model.stateVariables||[]} onChange={canEdit?v=>setField("stateVariables",v):()=>{}}/></div>)}
        {tab==="bevents"&&renderAuthoringShell(<div style={{maxWidth:1100}}><TabErrors tabId="bevents"/><BEventEditor events={model.bEvents||[]} entityTypes={model.entityTypes||[]} stateVariables={model.stateVariables||[]} queues={model.queues||[]} cEvents={model.cEvents||[]} onChange={canEdit?v=>setField("bEvents",v):()=>{}}/></div>)}
        {tab==="cevents"&&renderAuthoringShell(<div style={{maxWidth:1100}}><TabErrors tabId="cevents"/><CEventEditor events={model.cEvents||[]} bEvents={model.bEvents||[]} entityTypes={model.entityTypes||[]} stateVariables={model.stateVariables||[]} queues={model.queues||[]} onChange={canEdit?v=>setField("cEvents",v):()=>{}}/></div>)}
        {tab==="queues"&&renderAuthoringShell(<div style={{maxWidth:900}}><TabErrors tabId="queues"/><QueueEditor queues={model.queues||[]} entityTypes={model.entityTypes||[]} onChange={canEdit?newQueues=>{
  // Propagate queue renames through the entire model
  const oldQueues = model.queues || [];
  let updated = { ...model, queues: newQueues };
  for (let i = 0; i < newQueues.length; i++) {
    const oldName = oldQueues[i]?.name?.trim();
    const newName = newQueues[i]?.name?.trim();
    if (oldName && newName && oldName !== newName) {
      updated = renameQueue(updated, oldName, newName);
    }
  }
  setWholeModel(updated);
}:()=>{}}/></div>)}

        {tab==="validate"&&(
          <div style={{maxWidth:1000,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700,marginBottom:4}}>VALIDATION WORKSPACE</div>
                <div style={{fontSize:13,color:C.text,fontFamily:FONT,fontWeight:700}}>Model readiness and issue routing</div>
              </div>
              <Btn small variant="ghost" onClick={()=>setTab("execute")} disabled={validation.errors.length>0}>Run Model</Btn>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:10}}>
              {[
                {label:"Blockers",value:validation.errors.length,color:validation.errors.length?C.red:C.green},
                {label:"Warnings",value:validation.warnings.length,color:validation.warnings.length?C.amber:C.green},
                {label:"Sections",value:Object.keys(tabIssueCounts).filter(id=>id!=="validate").length,color:C.accent},
              ].map(item=>(
                <div key={item.label} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 12px"}}>
                  <div style={{fontSize:9,color:C.muted,fontFamily:FONT,letterSpacing:1.1,fontWeight:700,marginBottom:4}}>{item.label.toUpperCase()}</div>
                  <div style={{fontSize:18,color:item.color,fontFamily:FONT,fontWeight:700}}>{item.value}</div>
                </div>
              ))}
            </div>
            {[...(validation.errors||[]),...(validation.warnings||[])].length ? (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[...(validation.errors||[]),...(validation.warnings||[])].map((issue,index)=>{
                  const isError = validation.errors.includes(issue);
                  const targetTab = issue.tab || "overview";
                  const tabLabel = MODEL_HEALTH_TAB_LABELS[targetTab] || "Overview";
                  return (
                    <button
                      key={`${issue.code}-${index}`}
                      type="button"
                      onClick={()=>setTab(targetTab)}
                      style={{background:isError?C.errorBg:C.warmup,border:`1px solid ${isError?C.danger:C.amber}66`,borderRadius:6,color:isError?C.error:C.warnBg,cursor:"pointer",fontFamily:FONT,fontSize:11,padding:"9px 11px",textAlign:"left"}}
                    >
                      [{issue.code}] {tabLabel}: {issue.message}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{background:C.panel,border:`1px solid ${C.green}55`,borderRadius:8,padding:16,color:C.green,fontFamily:FONT,fontSize:12}}>
                No blocking validation issues found.
              </div>
            )}
          </div>
        )}

        {tab==="execute"&&(
          <ErrorBoundary
            title="Execute panel crashed"
            message="The simulation controls could not render."
          >
            <ExecutePanel model={model} modelId={modelId} userId={overrides.userId} onRunSaved={handleRunSaved} onResultsReady={setLatestResults} autoRun={overrides.autoRun} analyseRun={analyseRun} onClearAnalyse={()=>setAnalyseRun(null)}/>
          </ErrorBoundary>
        )}
        {tab==="results"&&(
          <div style={{maxWidth:1200,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700,marginBottom:4}}>RESULTS WORKSPACE</div>
                <div style={{fontSize:13,color:C.text,fontFamily:FONT,fontWeight:700}}>Run analysis and chart diagnostics</div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Btn small variant="ghost" onClick={()=>setTab("execute")}>Open Execute</Btn>
                <Btn small variant="ghost" onClick={()=>setTab("history")}>Open History</Btn>
              </div>
            </div>
            {historyLoading&&<div style={{color:C.muted,fontFamily:FONT,fontSize:12}}>Loading saved runs...</div>}
            {historyError&&<div role="alert" style={{color:C.red,fontFamily:FONT,fontSize:12}}>{historyError}</div>}
            {historyRows.some(hasResultsPayload)&&(
              <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <label htmlFor="results-run-selector" style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>SAVED RUN</label>
                <select
                  id="results-run-selector"
                  aria-label="Saved run"
                  value={selectedResultsRunId}
                  onChange={e=>loadResultsRun(e.target.value)}
                  style={{minWidth:260,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,padding:"6px 8px",outline:"none"}}
                >
                  {historyRows.filter(hasResultsPayload).map(row=>{
                    const dt=new Date(row.ran_at);
                    const label=row.run_label||dt.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                    return <option key={row.id} value={row.id}>{label}</option>;
                  })}
                </select>
              </div>
            )}
            {latestResults ? (
              <ResultsWorkspace results={latestResults} model={model}/>
            ) : (
              <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:18,color:C.muted,fontFamily:FONT,fontSize:12,lineHeight:1.7}}>
                Results from the latest run will appear here. Run the model from Execute, or select a saved run when history is available.
              </div>
            )}
          </div>
        )}
        {tab==="history"&&(
          <div style={{maxWidth:1200}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700,flex:1,minWidth:180}}>RUN HISTORY (LAST 20)</div>
              <Btn small variant="ghost" onClick={exportRunHistoryJson} disabled={!historyRows.length}>Export History</Btn>
              <Btn small variant="ghost" onClick={exportRunHistoryCsv} disabled={!historyRows.length}>Export History CSV</Btn>            </div>
            {historyLoading&&<div style={{color:C.muted,fontFamily:FONT,fontSize:12}}>Loading...</div>}
            {historyError&&<div style={{color:C.red,fontFamily:FONT,fontSize:12}}>{historyError}</div>}
            {!historyLoading&&!historyError&&historyRows.length===0&&(
              <Empty icon="📊" msg="No runs yet. Run the simulation from the Execute tab."/>
            )}
            {!historyLoading&&historyRows.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {(() => {
                  const latest = historyRows[0];
                  const arrived = Number(latest.total_arrived || 0);
                  const reneged = Number(latest.total_reneged || 0);
                  const renegeRate = arrived > 0 ? (reneged / arrived) * 100 : null;
                  const cells = [
                    { label: "Latest run", value: latest.run_label || formatRunDate(latest.ran_at), color: C.accent },
                    { label: "Served", value: latest.total_served || 0, color: C.served },
                    { label: "Renege rate", value: formatPercent(renegeRate), color: reneged > 0 ? C.reneged : C.muted },
                    { label: "Avg wait", value: formatTime(latest.avg_wait_time), color: C.amber },
                  ];
                  return (
                    <div aria-label="Run history summary" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:10}}>
                      {cells.map(cell=>(
                        <div key={cell.label} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 12px"}}>
                          <div style={{fontSize:9,color:C.muted,fontFamily:FONT,letterSpacing:1.1,fontWeight:700,marginBottom:4}}>{cell.label.toUpperCase()}</div>
                          <div style={{fontSize:14,color:cell.color,fontFamily:FONT,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={String(cell.value)}>{cell.value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:FONT,fontSize:11}}>
                  <thead>
                    <tr>{["Date / Time","Label","Served","Reneged","Avg Wait","Summary","Reshare","Actions"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"6px 12px",color:C.muted,borderBottom:`1px solid ${C.border}`,fontSize:10,letterSpacing:1,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row,i)=>{
                      const dt=new Date(row.ran_at);
                      const dateStr=dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
                      const timeStr=dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
                      const renPct=row.total_arrived>0?((row.total_reneged/row.total_arrived)*100).toFixed(1):"—";
                      const insight = row.ai_insights?.summary || null;
                      return(
                        <tr key={row.id} style={{background:i%2===0?C.surface+"60":"transparent"}}>
                          <td style={{padding:"6px 12px",color:C.muted,whiteSpace:"nowrap"}}>{dateStr} {timeStr}</td>
                          <td style={{padding:"6px 12px",color:row.run_label?C.text:C.muted,whiteSpace:"nowrap"}}>{row.run_label || "-"}</td>
                          <td style={{padding:"6px 12px",color:C.served,fontWeight:700}}>{row.total_served||0}</td>
                          <td style={{padding:"6px 12px",color:row.total_reneged>0?C.reneged:C.muted}}>{row.total_reneged||0}</td>
                          <td style={{padding:"6px 12px",color:C.amber}}>{row.avg_wait_time!=null?row.avg_wait_time.toFixed(2):"—"}t</td>
                          <td style={{padding:"6px 12px",fontSize:10,color:insight?C.purple:C.muted,fontFamily:FONT,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={insight||""}>{insight||"—"}</td>
                          <td style={{padding:"6px 12px"}}>
                            {shareLinksMap[row.id] ? (
                              <Btn small variant="ghost" onClick={() => {
                                navigator.clipboard.writeText(`${baseUrl}/#share/${shareLinksMap[row.id].token}`);
                              }}>📋 Reshare</Btn>
                            ) : <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>—</span>}
                          </td>
                          <td style={{padding:"6px 12px"}}>
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              {hasResultsPayload(row)&&<Btn small variant="ghost" onClick={()=>{setSelectedResultsRunId(row.id);setLatestResults(row.results_json);setTab("results");}}>View Results</Btn>}
                              <Btn small variant="ghost" onClick={()=>handleAnalyseRun(row)}>Analyse</Btn>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        )}
        {tab==="access"&&isOwner&&(
          <div style={{maxWidth:480,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:8}}>
              <Btn variant={model.visibility==="private"?"primary":"ghost"} onClick={()=>{if(overrides.onSetVisibility)overrides.onSetVisibility(modelId,"private").then(onRefresh);}} small>🔒 Private</Btn>
              <Btn variant={model.visibility==="public"?"success":"ghost"} onClick={()=>{if(overrides.onSetVisibility)overrides.onSetVisibility(modelId,"public").then(onRefresh);}} small>🌐 Public</Btn>
            </div>
            {(overrides.profiles||[]).filter(u=>u.id!==model.owner_id).map(u=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <Avatar u={u} size={26}/>
                <span style={{flex:1,fontSize:12,color:C.text,fontFamily:FONT}}>{u.name}</span>
                <select value={model.access?.[u.id]||"none"} onChange={e=>{const a={...(model.access||{}),[u.id]:e.target.value};if(overrides.onSetAccess)overrides.onSetAccess(modelId,a).then(onRefresh);}}
                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
                  <option value="none">No access</option><option value="viewer">Viewer</option><option value="editor">Editor</option>
                </select>
              </div>
            ))}
          </div>
        )}
        </ErrorBoundary>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRARY
// ═══════════════════════════════════════════════════════════════════════════════
const ModelCard=({model,onOpen,onDelete,profiles=[],currentUserId})=>{
  const owner=(profiles||[]).find(p=>p.id===model.owner_id)||null;
  const fmtDate=iso=>{ try{ return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }catch(e){return '';} };
  const hasRenege=(model.bEvents||[]).some(ev=>(ev.schedules||[]).some(s=>s.isRenege));
  const runCount=model.stats?.runs;
  const isOwner=model.owner_id===currentUserId;
  const openFromKeyboard=e=>{
    if(e.key==="Enter"||e.key===" "){
      e.preventDefault();
      onOpen?.();
    }
  };
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={openFromKeyboard} aria-label={`Open model ${model.name}`} style={{background:C.panel,border:`1px solid ${C.border}`,borderLeft:`3px solid ${model.visibility==="public"?C.green:C.accent}`,borderRadius:8,padding:16,cursor:"pointer",display:"flex",flexDirection:"column",gap:10,textAlign:"left",color:"inherit",width:"100%"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{fontWeight:700,fontSize:14,color:C.text,fontFamily:FONT,lineHeight:1.3}}>{model.name}</div>
        <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap"}}>
          <Tag label={model.visibility} color={model.visibility==="public"?C.green:C.accent}/>
          {hasRenege&&<Tag label="reneging" color={C.reneged}/>}
          {isOwner&&onDelete&&<Btn small variant="danger" onClick={e=>{e.stopPropagation();onDelete(model);}}>Delete</Btn>}
        </div>
      </div>
      <div style={{fontSize:12,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>{model.description}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <Tag label={`${(model.entityTypes||[]).length} types`} color={C.server}/>
        <Tag label={`${(model.bEvents||[]).length} B-events`} color={C.bEvent}/>
        <Tag label={`${(model.cEvents||[]).length} C-events`} color={C.cEvent}/>
        {model.statsLoading&&<Tag label="— runs" color={C.muted}/>}
        {!model.statsLoading&&model.statsError&&<Tag label="runs —" color={C.muted}/>}
        {!model.statsLoading&&!model.statsError&&Number.isFinite(runCount)&&runCount>0&&<Tag label={`${runCount} runs`} color={C.green}/>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {owner&&<Avatar u={owner} size={22}/>}
          <span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>{owner?.full_name}</span>
        </div>
        <span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>{fmtDate(model.updatedAt)}</span>
      </div>
    </div>
  );
};

const NewModelModal=({onClose,onCreate})=>{
  const [name,setName]=useState(""); const [desc,setDesc]=useState("");
  const [saving,setSaving]=useState(false);
  const create=async()=>{if(!name.trim())return;setSaving(true);try{await onCreate(name.trim(),desc.trim());}finally{setSaving(false);}onClose();};
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div role="dialog" aria-modal="true" aria-labelledby="new-model-title" style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:28,width:420,fontFamily:FONT,display:"flex",flexDirection:"column",gap:14}}>
        <div id="new-model-title" style={{fontSize:15,fontWeight:700,color:C.text}}>New DES Model</div>
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Queue with Reneging" autoFocus/>
        <Field label="Description" value={desc} onChange={setDesc} multiline rows={3}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Btn variant="ghost" onClick={onClose} full>Cancel</Btn>
          <Btn variant="primary" onClick={create} disabled={!name.trim()||saving} full>{saving?"Saving...":"Create"}</Btn>
        </div>
      </div>
    </div>
  );
};

// ── App ──────────────────────────────────────────────────────

export {
  ModelDetail, ModelCard, NewModelModal,
  buildModelExportPayload, buildRunHistoryCsv, buildRunHistoryExportPayload,
  slugifyModelName, modelJsonFromModel,
};

