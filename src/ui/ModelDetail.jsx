// ui/ModelDetail.jsx — ModelDetail, ModelCard, NewModelModal
import { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import pkg from '../../package.json';
import { C, FONT, RADIUS, SPACE, SHADOW, Z, alpha } from "./shared/tokens.js";
import { Tag, Avatar, Btn, Field, SH, InfoBox, Empty, ErrorBoundary } from "./shared/components.jsx";
import { useToast } from "./shared/ToastContext.jsx";
import { useViewport } from "./shared/hooks.js";
import { SkeletonPanel } from "./shared/SkeletonPanel.jsx";
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
import { fetchRunHistory, listShareLinks, updateRunLabel, updateRunTags, archiveRun, unarchiveRun, deleteSimulationRun } from "../db/models.js";
import { validateModel }                    from "../engine/validation.js";
import { renameEntityType, renameQueue }    from "../engine/queue-refs.js";

const MODEL_JSON_KEYS = ["entityTypes", "stateVariables", "bEvents", "cEvents", "queues", "graph", "experimentDefaults"];

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
    if (key === "experimentDefaults") {
      return model.experimentDefaults && typeof model.experimentDefaults === "object" && !Array.isArray(model.experimentDefaults)
        ? { ...json, experimentDefaults: model.experimentDefaults }
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
  visual: "Design",
  ai: "AI Designer",
  entities: "Entity Types",
  queues: "Queues",
  bevents: "B-Events",
  cevents: "C-Events",
  state: "Model Data",
  execute: "Execute",
  results: "Analysis",
  history: "History",
  validate: "Model Health",
};

function isStarterBlankModel(model = {}) {
  return !(model.entityTypes || []).length &&
    !(model.stateVariables || []).length &&
    !(model.bEvents || []).length &&
    !(model.cEvents || []).length &&
    !(model.queues || []).length &&
    !(model.goals || []).length;
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

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
      experimentDefaults: modelData.experimentDefaults || {},
      access:        modelData.access         || {},
    };
  });
  const toast = useToast();
  const [tab,setTab]=useState(initialTab||"overview");
  const [dirty,setDirty]=useState(false);
  const [saving,setSaving]=useState(false);
  const [discardConfirm,setDiscardConfirm]=useState(false);
  const [past,setPast]=useState([]);    // undo stack — model snapshots, capped at 20
  const [future,setFuture]=useState([]); // redo stack
  const [historyRows,setHistoryRows]=useState([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState("");
  const [historySearch,setHistorySearch]=useState("");
  const [historyShowArchived,setHistoryShowArchived]=useState(false);
  const [historyEditLabelId,setHistoryEditLabelId]=useState(null);
  const [historyEditLabelVal,setHistoryEditLabelVal]=useState("");
  const [historySelected,setHistorySelected]=useState(new Set());
  const [shareLinksMap,setShareLinksMap]=useState({});
  const [showCsvImport,setShowCsvImport]=useState(false);
  const [analyseRun,setAnalyseRun]=useState(null);
  const [latestResults,setLatestResults]=useState(null);
  const [selectedResultsRunId,setSelectedResultsRunId]=useState("");
  const [starterGuideDismissed,setStarterGuideDismissed]=useState(()=>{
    try { return localStorage.getItem(`des_starter_${modelId}`) === "1"; } catch { return false; }
  });
  const { width: viewportWidth, isMobile: _vpMobile, isCompact: _vpCompact } = useViewport();
  const [showMoreTabs,setShowMoreTabs]=useState(false);

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

  const starterGuideAutoHidden = (model?.entityTypes?.length > 0) || (Number.isFinite(model?.stats?.runs) ? model.stats.runs > 0 : false);
  const showStarterGuide = canEdit && !starterGuideDismissed && !starterGuideAutoHidden;
  const dismissStarterGuide = () => {
    try { localStorage.setItem(`des_starter_${modelId}`, "1"); } catch {}
    setStarterGuideDismissed(true);
  };
  const reopenStarterGuide = () => {
    try { localStorage.removeItem(`des_starter_${modelId}`); } catch {}
    setStarterGuideDismissed(false);
  };

  const setField=(f,v)=>{
    if (valuesEqual(model?.[f], v)) return;
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
    experimentDefaults: nextModel.experimentDefaults && typeof nextModel.experimentDefaults === "object" && !Array.isArray(nextModel.experimentDefaults)
      ? nextModel.experimentDefaults
      : (current.experimentDefaults || {}),
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
    try{
      await overrides.onSave?.(merged);
      setDirty(false);
      toast.success("Model saved");
      await onRefresh?.();
    }catch(error){
      setDirty(true);
      toast.error(error?.message || "Save failed");
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
  const _ur=useRef({undo,redo,save:null});
  _ur.current={undo,redo,save};
  useEffect(()=>{
    const onKey=(e)=>{
      if(!(e.ctrlKey||e.metaKey))return;
      if(e.key==='z'&&!e.shiftKey){e.preventDefault();_ur.current.undo();}
      if((e.key==='z'&&e.shiftKey)||e.key==='y'){e.preventDefault();_ur.current.redo();}
      if(e.key==='s'){e.preventDefault();_ur.current.save?.();}
    };
    document.addEventListener('keydown',onKey);
    return()=>document.removeEventListener('keydown',onKey);
  },[]);

  const save=async()=>{
    setSaving(true);
    try{
      await overrides.onSave?.(model);
      setDirty(false);
      toast.success("Model saved");
      await onRefresh?.();
    }catch(error){
      setDirty(true);
      toast.error(error?.message || "Save failed");
    }finally{
      setSaving(false);
    }
  };

  const discard=()=>{
    if (!modelData) return;
    setModel({
      ...modelData,
      entityTypes:   modelData.entityTypes   || [],
      stateVariables:modelData.stateVariables || [],
      bEvents:       modelData.bEvents        || [],
      cEvents:       modelData.cEvents        || [],
      queues:        modelData.queues         || [],
      graph:         modelData.graph          || null,
      experimentDefaults: modelData.experimentDefaults || {},
      access:        modelData.access         || {},
    });
    setDirty(false);
    setSaveStatus(null);
    setPast([]);
    setFuture([]);
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
  const isStarterBlank = useMemo(() => isStarterBlankModel(model), [model]);
  const healthValidation = useMemo(() => (
    isStarterBlank ? { errors: [], warnings: [] } : validation
  ), [isStarterBlank, validation]);

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
      fetchRunHistory(modelId, { archived: historyShowArchived })
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
    toast.success(`Exported ${historyRows.length} run${historyRows.length !== 1 ? "s" : ""} as JSON`);
  };

  const exportRunHistoryCsv = () => {
    const csv = buildRunHistoryCsv(historyRows);
    downloadTextFile(csv, `des-studio-run-history-${slugifyModelName(model.name)}.csv`, "text/csv;charset=utf-8");
    toast.success(`Exported ${historyRows.length} run${historyRows.length !== 1 ? "s" : ""} as CSV`);
  };

  const exportSelectedCsv = () => {
    const rows = historyRows.filter(r => historySelected.has(r.id));
    const csv = buildRunHistoryCsv(rows);
    downloadTextFile(csv, `des-studio-selected-runs-${slugifyModelName(model.name)}.csv`, "text/csv;charset=utf-8");
    toast.success(`Exported ${rows.length} selected run${rows.length !== 1 ? "s" : ""} as CSV`);
  };
  const archiveSelected = async () => {
    const userId = overrides.userId;
    if (!userId) return;
    const ids = [...historySelected];
    await Promise.all(ids.map(id => archiveRun(id, userId).catch(() => {})));
    if (!historyShowArchived) setHistoryRows(prev => prev.filter(r => !historySelected.has(r.id)));
    else setHistoryRows(prev => prev.map(r => historySelected.has(r.id) ? { ...r, archived: true } : r));
    setHistorySelected(new Set());
    toast.success(`Archived ${ids.length} run${ids.length !== 1 ? "s" : ""}`);
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
    const blockers = healthValidation.errors || [];
    const warnings = healthValidation.warnings || [];
    const issues = [...blockers, ...warnings].slice(0, 5);
    const hasBlockers = blockers.length > 0;
    const hasWarnings = warnings.length > 0;
    const isGettingStarted = isStarterBlank;
    const isExecuteTab = tab === "execute";
    const statusColor = isGettingStarted ? C.accent : hasBlockers ? C.red : hasWarnings ? C.amber : C.green;
    const statusBg = isGettingStarted ? alpha(C.accent, 0.08) : hasBlockers ? C.errorBg : hasWarnings ? C.warmup : alpha(C.green, 0.08);
    const statusBorder = isGettingStarted ? C.accent : hasBlockers ? C.danger : hasWarnings ? C.amber : C.green;
    const statusTitle = isGettingStarted
      ? "Getting started"
      : hasBlockers
      ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`
      : hasWarnings
        ? `Ready with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
        : "Ready to run";
    const completedRuns = Number.isFinite(model.stats?.runs) ? model.stats.runs : 0;
    const actionHint = isGettingStarted
      ? "Choose a build path below to start defining your model."
      : hasBlockers
      ? "Resolve the listed issues first."
      : isExecuteTab
        ? "Use the controls below to run this scenario or review recent runs."
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
                : isGettingStarted
                  ? "Start with a template, the visual designer, AI designer, or forms to build the first runnable version."
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
            {!isGettingStarted && !hasBlockers && !isExecuteTab && <Btn small variant="primary" onClick={()=>setTab("execute")}>Open Execute</Btn>}
            {!isGettingStarted && !hasBlockers && latestResults && <Btn small variant="ghost" onClick={()=>setTab("results")}>Open Analysis</Btn>}
            {!isGettingStarted && !hasBlockers && completedRuns > 0 && <Btn small variant="ghost" onClick={()=>setTab("history")}>Run History</Btn>}
          </div>
        </div>
      </section>
    );
  };

  const TABS=[
    {id:"overview",label:"Overview"},
    {id:"visual",label:"Design"},
    {id:"ai",label:"AI"},
    {id:"entities",label:"Entity Types"},
    {id:"queues",label:"Queues"},
    {id:"bevents",label:"B-Events"},
    {id:"cevents",label:"C-Events"},
    {id:"state",label:"Model Data"},
    {id:"validate",label:"Model Health"},
    {id:"execute",label:"Execute"},
    {id:"results",label:"Analysis"},
    {id:"history",label:"History"},
    ...(isOwner?[{id:"access",label:"Access"}]:[]),
  ];
  const selectableTabs = TABS.filter(t => !t.disabled);
  const NAV_MODES=[
    {id:"overview",label:"Overview",primaryTab:"overview",tabs:["overview"]},
    {id:"design",label:"Design",primaryTab:"visual",tabs:["visual","ai","entities","queues","bevents","cevents","state","validate"]},
    {id:"execute",label:"Execute",primaryTab:"execute",tabs:["execute"]},
    {id:"results",label:"Analysis",primaryTab:"results",tabs:["results","history"]},
    ...(isOwner?[{id:"access",label:"Access",primaryTab:"access",tabs:["access"]}]:[]),
  ];
  const isMobileLayout = viewportWidth < 720;
  const isCompactLayout = viewportWidth >= 720 && viewportWidth < 1024;
  const DISPLAY_MODES = isMobileLayout
      ? [
        {id:"overview",label:"Overview",primaryTab:"overview",tabs:["overview"]},
        {id:"design",label:"Design",primaryTab:"visual",tabs:["visual","ai","entities","queues","bevents","cevents","state","validate"]},
        {id:"execute",label:"Run",primaryTab:"execute",tabs:["execute"]},
        {id:"results",label:"Analysis",primaryTab:"results",tabs:["results","history"]},
      ]
    : NAV_MODES;
  const activeMode = DISPLAY_MODES.find(mode => mode.tabs.includes(tab)) || DISPLAY_MODES[0];
  const contextualTabs = useMemo(() => {
    if (activeMode?.id === "overview") return ["overview"];
    if (activeMode?.id === "design") return ["visual", "ai", "entities", "queues", "bevents", "cevents", "state", "validate"];
    if (activeMode?.id === "execute") return ["execute"];
    if (activeMode?.id === "results") return ["results", "history"];
    if (activeMode?.id === "access") return ["access"];
    return ["overview"];
  }, [activeMode?.id]);
  const hasModelIssues = validation.errors.length > 0 || validation.warnings.length > 0;
  const visibleTabs = selectableTabs.filter(t => {
    if (!contextualTabs.includes(t.id)) return false;
    if (t.id === "validate" && !hasModelIssues && tab !== "validate") return false;
    return true;
  });
  const visibleSelectableTabs = visibleTabs.filter(t => !t.disabled);
  const tabById = Object.fromEntries(selectableTabs.map(t => [t.id, t]));
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
  const tabIssueTooltip = tabId => {
    const errs  = validation.errors.filter(e => (e.tab || "overview") === tabId).slice(0, 2);
    const warns = validation.warnings.filter(w => (w.tab || "overview") === tabId).slice(0, errs.length < 2 ? 2 - errs.length : 0);
    return [...errs.map(e => `Error: ${e.message}`), ...warns.map(w => `Warning: ${w.message}`)].join(" | ");
  };
  const authoringShellMode = !isMobileLayout && ["design"].includes(activeMode.id)
    ? activeMode
    : null;
  const AuthoringWorkflowShell = ({mode, children}) => {
    return (
      <section
        aria-label={`${mode.label} authoring shell`}
        style={{
          display: "block",
        }}
      >
        <main aria-label={`${mode.label} workspace`} style={{minWidth:0}}>
          {children}
        </main>
      </section>
    );
  };
  const renderAuthoringShell = content => (
    authoringShellMode ? <AuthoringWorkflowShell mode={authoringShellMode}>{content}</AuthoringWorkflowShell> : content
  );

  useEffect(()=>{
    if(isMobileLayout && !DISPLAY_MODES.some(mode => mode.tabs.includes(tab))) setTab("overview");
  },[isMobileLayout, tab]);

  useEffect(()=>{
    if(tab!=="history"&&tab!=="results")return;
    setHistoryLoading(true);setHistoryError("");
    Promise.all([
      fetchRunHistory(modelId, { archived: historyShowArchived }),
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
        {canEdit&&<Btn small variant="ghost" onClick={undo} disabled={!past.length} title="Undo the last model edit (Ctrl+Z)" ariaLabel="Undo last model edit">↩ Undo</Btn>}
        {canEdit&&<Btn small variant="ghost" onClick={redo} disabled={!future.length} title="Redo the last undone model edit (Ctrl+Shift+Z)" ariaLabel="Redo last model edit">↪ Redo</Btn>}
        {canEdit&&dirty&&(
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <Btn small variant="primary" onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Btn>
            <Btn small variant="ghost" onClick={discard} disabled={saving}>Discard</Btn>
          </div>
        )}
      </div>
      <div aria-label={isMobileLayout ? "Mobile model workflow" : "Model workflow modes"} style={{display:"flex",alignItems:"stretch",gap:8,padding:"8px 20px",borderBottom:`1px solid ${C.border}`,background:C.bg,overflowX:"auto",flexShrink:0}}>
        {DISPLAY_MODES.map(mode=>{
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
      {visibleSelectableTabs.length > 1 && (()=>{
        const COMPACT_HIDDEN=["access","history","validate"];
        const primaryTabs=isCompactLayout?visibleTabs.filter(t=>!COMPACT_HIDDEN.includes(t.id)):visibleTabs;
        const moreTabs=isCompactLayout?visibleTabs.filter(t=>!t.disabled&&COMPACT_HIDDEN.includes(t.id)):[];
        const activeInMore=moreTabs.some(t=>t.id===tab);
        const renderTab=(t)=>{
          if(t.disabled) return <div key={t.id} style={{fontSize:9,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700,padding:"10px 8px",whiteSpace:"nowrap",userSelect:"none",opacity:0.5}}>{t.label}</div>;
          const accessibleLabel=t.id==="ai"?"AI Designer":t.label;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tab===t.id}
              aria-label={`${accessibleLabel}${tabIssueLabel(t.id)?`, ${tabIssueLabel(t.id)}`:""}`}
              onClick={()=>{setTab(t.id);setShowMoreTabs(false);}}
              style={{background:"none",border:"none",whiteSpace:"nowrap",
                borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",
                color:tab===t.id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:"10px 16px",
                cursor:"pointer",fontWeight:tab===t.id?700:400,display:"inline-flex",alignItems:"center",gap:6}}>
              <span>{t.label}</span>
              {tabIssueCounts[t.id]?.errors>0&&(
                <span aria-hidden="true" title={tabIssueTooltip(t.id)} style={{background:C.errorBg,border:`1px solid ${C.danger}66`,borderRadius:10,color:C.error,fontSize:9,fontWeight:700,padding:"1px 5px"}}>
                  {tabIssueCounts[t.id].errors}
                </span>
              )}
              {!tabIssueCounts[t.id]?.errors&&tabIssueCounts[t.id]?.warnings>0&&(
                <span aria-hidden="true" title={tabIssueTooltip(t.id)} style={{background:C.warmup,border:`1px solid ${C.amber}66`,borderRadius:10,color:C.warnBg,fontSize:9,fontWeight:700,padding:"1px 5px"}}>
                  {tabIssueCounts[t.id].warnings}
                </span>
              )}
            </button>
          );
        };
        return (
          <div style={{display:"flex",alignItems:"stretch",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,minWidth:0}}>
            <div role="tablist" aria-label="Model sections" style={{display:"flex",paddingLeft:12,flex:1,minWidth:0,overflowX:"auto"}}>
              {primaryTabs.map(renderTab)}
              {moreTabs.length>0&&(
                <div style={{position:"relative"}}>
                  <button type="button"
                    aria-expanded={showMoreTabs}
                    aria-haspopup="true"
                    onClick={()=>setShowMoreTabs(v=>!v)}
                    style={{background:"none",border:"none",whiteSpace:"nowrap",
                      borderBottom:activeInMore?`2px solid ${C.accent}`:"2px solid transparent",
                      color:activeInMore?C.accent:C.muted,fontFamily:FONT,fontSize:12,
                      padding:"10px 16px",cursor:"pointer",fontWeight:activeInMore?700:400}}>
                    More ▾
                  </button>
                  {showMoreTabs&&(
                    <div role="listbox" style={{position:"absolute",top:"100%",right:0,
                      background:C.panel,border:`1px solid ${C.border}`,borderRadius:RADIUS.md,
                      zIndex:Z.dropdown,minWidth:140,boxShadow:"0 4px 12px rgba(0,0,0,0.3)",padding:4}}>
                      {moreTabs.map(t=>(
                        <button key={t.id} type="button" role="option" aria-selected={tab===t.id}
                          onClick={()=>{setTab(t.id);setShowMoreTabs(false);}}
                          style={{display:"block",width:"100%",textAlign:"left",background:tab===t.id?alpha(C.accent,0.1):"transparent",
                            border:"none",borderRadius:RADIUS.sm,color:tab===t.id?C.accent:C.text,
                            fontFamily:FONT,fontSize:12,padding:"8px 12px",cursor:"pointer"}}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
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
            <div style={{display:"flex",gap:6}}>
              <Btn small variant="primary" onClick={save} disabled={saving}>{saving?"Saving...":"Save Changes"}</Btn>
              {discardConfirm
                ? <>
                    <Btn small variant="danger" onClick={()=>{setDiscardConfirm(false);discard();}} disabled={saving}>Confirm discard</Btn>
                    <Btn small variant="ghost" onClick={()=>setDiscardConfirm(false)} disabled={saving}>Cancel</Btn>
                  </>
                : <Btn small variant="ghost" onClick={()=>setDiscardConfirm(true)} disabled={saving}>Discard Changes</Btn>
              }
            </div>
          </div>
        )}
        {tab==="overview" && <ModelHealthPanel/>}
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
            <Suspense fallback={<SkeletonPanel rows={5} />}>
              <VisualDesignerPanel model={model} canEdit={canEdit} onModelChange={setWholeModel}/>
            </Suspense>
          )
        )}
        {tab==="overview"&&(
          renderAuthoringShell(<div style={{maxWidth:900,display:"flex",flexDirection:"column",gap:14}}>
            {canEdit && showStarterGuide && (
              <div style={{background:`${C.accent}0d`,border:`1px solid ${alpha(C.accent,0.3)}`,borderRadius:RADIUS.md,padding:16,display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:FONT,marginBottom:4}}>Get started building your model</div>
                    <div style={{fontSize:12,color:C.muted,fontFamily:FONT,lineHeight:1.6}}>
                      Pick the path that feels most natural. You can switch between them at any point.
                    </div>
                  </div>
                  <Btn small variant="ghost" onClick={dismissStarterGuide} ariaLabel="Dismiss getting started guide">✕</Btn>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:10}}>
                  {[
                    {title:"Design",body:"Sketch the process map first, then refine the generated structure.",action:"Open Design",onClick:()=>{setTab("visual");dismissStarterGuide();},primary:true},
                    {title:"AI Designer",body:"Describe the system in plain language and let the assistant draft the model.",action:"Open AI Designer",onClick:()=>{setTab("ai");dismissStarterGuide();}},
                    {title:"Use a Template",body:"Start from a proven template and copy it into your own model workspace.",action:"Browse Templates",onClick:()=>{dismissStarterGuide();overrides.onExitToTemplates?.();}},
                  ].map(option=>(
                    <div key={option.title} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:RADIUS.sm,padding:12,display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{fontSize:12,fontWeight:700,color:C.text,fontFamily:FONT}}>{option.title}</div>
                      <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.6,flex:1}}>{option.body}</div>
                      <Btn small variant={option.primary?"primary":"ghost"} onClick={option.onClick}>{option.action}</Btn>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {canEdit && !showStarterGuide && (
              <div style={{display:"flex",justifyContent:"flex-end"}}>
                <Btn small variant="ghost" onClick={reopenStarterGuide}>Show getting started guide</Btn>
              </div>
            )}
            <Field label="Name" value={model.name} onChange={canEdit?v=>setField("name",v):null} inputStyle={{fontFamily:"Inter, Segoe UI, Arial, sans-serif",fontSize:13}}/>
            <Field label="Description" value={model.description} onChange={canEdit?v=>setField("description",v):null} multiline rows={4} inputStyle={{fontFamily:"Inter, Segoe UI, Arial, sans-serif",fontSize:13}}/>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
              <GoalsEditor goals={model.goals||[]} onChange={canEdit?v=>setField("goals",v):()=>{}}/>
            </div>
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
            <EntityTypeEditor types={model.entityTypes||[]} onChange={canEdit?newTypes=>{
              const oldTypes = model.entityTypes || [];
              let updated = { ...model, entityTypes: newTypes };
              for (let i = 0; i < newTypes.length; i++) {
                const oldName = oldTypes[i]?.name?.trim();
                const newName = newTypes[i]?.name?.trim();
                const role = oldTypes[i]?.role || newTypes[i]?.role || "customer";
                if (oldName && newName && oldName !== newName) {
                  updated = renameEntityType(updated, oldName, newName, role);
                }
              }
              setWholeModel(updated);
            }:()=>{}}/>
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
                <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700,marginBottom:4}}>MODEL HEALTH</div>
                <div style={{fontSize:13,color:C.text,fontFamily:FONT,fontWeight:700}}>Readiness, blockers, and warnings</div>
              </div>
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
            <ExecutePanel
              model={model}
              modelId={modelId}
              userId={overrides.userId}
              onRunSaved={handleRunSaved}
              onResultsReady={setLatestResults}
              autoRun={overrides.autoRun}
              analyseRun={analyseRun}
              onClearAnalyse={()=>setAnalyseRun(null)}
              onExperimentDefaultsChange={canEdit ? defaults => setField("experimentDefaults", defaults) : null}
            />
          </ErrorBoundary>
        )}
        {tab==="results"&&(
          <div style={{maxWidth:1200,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700,marginBottom:4}}>ANALYSIS WORKSPACE</div>
                <div style={{fontSize:13,color:C.text,fontFamily:FONT,fontWeight:700}}>Run charts and diagnostics</div>
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
                Analysis from the latest run will appear here. Run the model from Execute, or select a saved run when history is available.
              </div>
            )}
          </div>
        )}
        {tab==="history"&&(
          <div style={{maxWidth:1200}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700,flex:1,minWidth:180}}>RUN HISTORY (LAST 20)</div>
              <input
                aria-label="Search run history"
                type="text"
                value={historySearch}
                onChange={e=>setHistorySearch(e.target.value)}
                placeholder="Search by label…"
                style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none",width:160}}
              />
              <Btn small variant={historyShowArchived?"primary":"ghost"} onClick={()=>{
                setHistoryShowArchived(v=>!v);
                setHistoryLoading(true);setHistoryError("");
                fetchRunHistory(modelId,{archived:!historyShowArchived})
                  .then(rows=>setHistoryRows(rows))
                  .catch(e=>setHistoryError(e.message))
                  .finally(()=>setHistoryLoading(false));
              }}>{historyShowArchived?"Hide archived":"Show archived"}</Btn>
              <Btn small variant="ghost" onClick={exportRunHistoryJson} disabled={!historyRows.length}>Export History</Btn>
              <Btn small variant="ghost" onClick={exportRunHistoryCsv} disabled={!historyRows.length}>Export History CSV</Btn>
            </div>
            {historyLoading&&<div style={{color:C.muted,fontFamily:FONT,fontSize:12}}>Loading...</div>}
            {historyError&&<div style={{color:C.red,fontFamily:FONT,fontSize:12}}>{historyError}</div>}
            {!historyLoading&&!historyError&&historyRows.length===0&&(
              <Empty icon="📊" msg="No runs yet. Run the simulation from the Execute tab."/>
            )}
            {historySelected.size > 0 && (
              <div style={{background:alpha(C.accent,0.08),border:`1px solid ${alpha(C.accent,0.3)}`,borderRadius:6,padding:"8px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:4}}>
                <span style={{fontSize:12,fontFamily:FONT,color:C.text}}>{historySelected.size} run{historySelected.size!==1?"s":""} selected</span>
                <Btn small variant="ghost" onClick={archiveSelected}>Archive selected</Btn>
                <Btn small variant="ghost" onClick={exportSelectedCsv}>Export selected as CSV</Btn>
                <Btn small variant="ghost" onClick={()=>setHistorySelected(new Set())}>Clear selection</Btn>
              </div>
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
                    <tr>
                      <th scope="col" style={{padding:"6px 8px",borderBottom:`1px solid ${C.border}`,width:32}}>
                        <input type="checkbox" aria-label="Select all runs"
                          checked={historySelected.size>0&&historyRows.every(r=>historySelected.has(r.id))}
                          onChange={e=>{
                            if(e.target.checked) setHistorySelected(new Set(historyRows.map(r=>r.id)));
                            else setHistorySelected(new Set());
                          }}
                        />
                      </th>
                      {["Date / Time","Label","Served","Reneged","Avg Wait","Summary","Reshare","Actions"].map(h=>(
                        <th key={h} scope="col" style={{textAlign:"left",padding:"6px 12px",color:C.muted,borderBottom:`1px solid ${C.border}`,fontSize:11,letterSpacing:1,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.filter(row => {
                      if (!historySearch.trim()) return true;
                      return (row.run_label||"").toLowerCase().includes(historySearch.toLowerCase());
                    }).map((row,i)=>{
                      const dt=new Date(row.ran_at);
                      const dateStr=dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
                      const timeStr=dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
                      const renPct=row.total_arrived>0?((row.total_reneged/row.total_arrived)*100).toFixed(1):"—";
                      const insight = row.ai_insights?.summary || null;
                      const isEditingLabel = historyEditLabelId === row.id;
                      const userId = overrides.userId;
                      return(
                        <tr key={row.id} style={{background:historySelected.has(row.id)?alpha(C.accent,0.06):i%2===0?C.surface+"60":"transparent",opacity:row.archived?0.55:1}}>
                          <td style={{padding:"6px 8px"}}>
                            <input type="checkbox" aria-label={`Select run ${row.run_label||dateStr}`}
                              checked={historySelected.has(row.id)}
                              onChange={e=>{
                                setHistorySelected(prev=>{
                                  const next=new Set(prev);
                                  e.target.checked?next.add(row.id):next.delete(row.id);
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td style={{padding:"6px 12px",color:C.muted,whiteSpace:"nowrap"}}>{dateStr} {timeStr}</td>
                          <td style={{padding:"6px 12px",minWidth:120}}>
                            {isEditingLabel ? (
                              <input
                                aria-label="Edit run label"
                                type="text"
                                value={historyEditLabelVal}
                                onChange={e=>setHistoryEditLabelVal(e.target.value)}
                                onBlur={async()=>{
                                  if(userId){
                                    await updateRunLabel(row.id,userId,historyEditLabelVal).catch(()=>{});
                                    setHistoryRows(prev=>prev.map(r=>r.id===row.id?{...r,run_label:historyEditLabelVal}:r));
                                  }
                                  setHistoryEditLabelId(null);
                                }}
                                onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape"){setHistoryEditLabelId(null);}}}
                                autoFocus
                                style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,color:C.text,fontFamily:FONT,fontSize:11,padding:"2px 6px",outline:"none",width:"100%"}}
                              />
                            ) : (
                              <span
                                onClick={()=>{setHistoryEditLabelId(row.id);setHistoryEditLabelVal(row.run_label||"");}}
                                style={{color:row.run_label?C.text:C.muted,cursor:"text",fontSize:12,fontFamily:FONT}}
                                title="Click to edit label"
                              >{row.run_label || "—"}</span>
                            )}
                          </td>
                          <td style={{padding:"6px 12px",color:C.served,fontWeight:700}}>{row.total_served||0}</td>
                          <td style={{padding:"6px 12px",color:row.total_reneged>0?C.reneged:C.muted}}>{row.total_reneged||0}</td>
                          <td style={{padding:"6px 12px",color:C.amber}}>{row.avg_wait_time!=null?row.avg_wait_time.toFixed(2):"—"}t</td>
                          <td style={{padding:"6px 12px",fontSize:10,color:insight?C.purple:C.muted,fontFamily:FONT,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={insight||""}>{insight||"—"}</td>
                          <td style={{padding:"6px 12px"}}>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                              {(row.tags||[]).map(tag=>(
                                <span key={tag} style={{background:C.border,borderRadius:999,padding:"2px 7px",fontSize:10,color:C.text,fontFamily:FONT,cursor:"pointer"}}
                                  onClick={async()=>{
                                    if(!userId)return;
                                    const next=(row.tags||[]).filter(t=>t!==tag);
                                    await updateRunTags(row.id,userId,next).catch(()=>{});
                                    setHistoryRows(prev=>prev.map(r=>r.id===row.id?{...r,tags:next}:r));
                                  }}
                                  title="Click to remove tag"
                                >#{tag} ×</span>
                              ))}
                              <input
                                aria-label={`Add tag to run ${row.id}`}
                                type="text"
                                placeholder="+ tag"
                                style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:999,color:C.muted,fontFamily:FONT,fontSize:10,padding:"2px 7px",outline:"none",width:56}}
                                onKeyDown={async(e)=>{
                                  if((e.key==="Enter"||e.key===",")&&e.target.value.trim()&&userId){
                                    const tag=e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g,"");
                                    if(!tag){e.target.value="";return;}
                                    const next=[...(row.tags||[]).filter(t=>t!==tag),tag];
                                    await updateRunTags(row.id,userId,next).catch(()=>{});
                                    setHistoryRows(prev=>prev.map(r=>r.id===row.id?{...r,tags:next}:r));
                                    e.target.value="";
                                  }
                                }}
                              />
                            </div>
                          </td>
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
                              {userId&&<Btn small variant="ghost" onClick={async()=>{
                                if(row.archived){
                                  await unarchiveRun(row.id,userId).catch(()=>{});
                                  setHistoryRows(prev=>prev.map(r=>r.id===row.id?{...r,archived:false}:r));
                                } else {
                                  await archiveRun(row.id,userId).catch(()=>{});
                                  if(!historyShowArchived) setHistoryRows(prev=>prev.filter(r=>r.id!==row.id));
                                  else setHistoryRows(prev=>prev.map(r=>r.id===row.id?{...r,archived:true}:r));
                                }
                              }}>{row.archived?"Unarchive":"Archive"}</Btn>}
                              {userId&&<Btn small variant="ghost" onClick={async()=>{
                                if(!confirm(`Delete this run? This cannot be undone.`))return;
                                await deleteSimulationRun(row.id,userId).catch(()=>{});
                                setHistoryRows(prev=>prev.filter(r=>r.id!==row.id));
                              }}>Delete</Btn>}
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
          <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:18}}>
            <section aria-label="Sharing settings" style={{display:"flex",flexDirection:"column",gap:10}}>
              <SH label="Sharing"/>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Btn variant={model.visibility==="private"?"primary":"ghost"} onClick={()=>{if(overrides.onSetVisibility)overrides.onSetVisibility(modelId,"private").then(onRefresh);}} small>🔒 Private</Btn>
                <Btn variant={model.visibility==="public"?"success":"ghost"} onClick={()=>{if(overrides.onSetVisibility)overrides.onSetVisibility(modelId,"public").then(onRefresh);}} small>🌐 Public</Btn>
              </div>
            </section>
            <section aria-label="Export model" style={{display:"flex",flexDirection:"column",gap:10}}>
              <SH label="Export"/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
                <div>
                  <div style={{fontSize:12,color:C.text,fontFamily:FONT,fontWeight:700,marginBottom:4}}>Model JSON</div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>Download a portable copy of this model definition.</div>
                </div>
                <Btn small variant="ghost" onClick={exportJson}>Export Model</Btn>
              </div>
            </section>
            <section aria-label="Collaborator access" style={{display:"flex",flexDirection:"column",gap:4}}>
              <SH label="Collaborators"/>
              {(overrides.profiles||[]).filter(u=>u.id!==model.owner_id).length===0&&(
                <div style={{fontSize:11,color:C.muted,fontFamily:FONT}}>No collaborators available.</div>
              )}
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
            </section>
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

const NewModelModal=({onClose,onCreate,onUseTemplate})=>{
  const [name,setName]=useState(""); const [desc,setDesc]=useState("");
  const [saving,setSaving]=useState(false);
  const create=async()=>{if(!name.trim())return;setSaving(true);try{await onCreate(name.trim(),desc.trim());}finally{setSaving(false);}onClose();};
  return (
    <div style={{position:"fixed",inset:0,background:C.overlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:Z.modal}}>
      <div role="dialog" aria-modal="true" aria-labelledby="new-model-title" style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:28,width:420,fontFamily:FONT,display:"flex",flexDirection:"column",gap:14}}>
        <div id="new-model-title" style={{fontSize:15,fontWeight:700,color:C.text}}>New DES Model</div>
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Queue with Reneging" autoFocus/>
        <Field label="Description" value={desc} onChange={setDesc} multiline rows={3}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <Btn variant="ghost" onClick={onClose} full>Cancel</Btn>
          <Btn variant="ghost" onClick={()=>{onClose();onUseTemplate?.();}} full>Use a Template</Btn>
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

