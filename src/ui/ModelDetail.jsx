// ui/ModelDetail.jsx
import { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import pkg from '../../package.json';
import { C, FONT, RADIUS, Z, alpha } from "./shared/tokens.js";
import { Tag, Avatar, Btn, Field, SH, InfoBox, Empty, ErrorBoundary } from "./shared/components.jsx";
import { useToast } from "./shared/ToastContext.jsx";
import { useViewport } from "./shared/hooks.js";
import { SkeletonPanel } from "./shared/SkeletonPanel.jsx";
import { EntityTypeEditor, StateVarEditor, BEventEditor, CEventEditor, QueueEditor } from "./editors/index.jsx";
import { AiGeneratedModelPanel } from "./editors/AiGeneratedModelPanel.jsx";
import { GoalsEditor } from "./editors/GoalsEditor.jsx";
import { ExecutePanel } from "./execute/index.jsx";
import { AiAssistantPanel } from "./execute/AiAssistantPanel.jsx";
import { LogViewer } from "./execute/LogViewer.jsx";
import { EntitySummaryTable } from "./execute/SweepViews.jsx";
import { CsvImportModal } from "./CsvImportModal.jsx";
import { ResultsWorkspace } from "./results/ResultsWorkspace.jsx";
import { ModelHistoryTab } from "./ModelHistoryTab.jsx";
import { ModelCard, NewModelModal } from "./ModelLibrary.jsx";

// Lazy-loaded so @xyflow/react is not included in the initial bundle.
const VisualDesignerPanel = lazy(() =>
  import("./visual-designer/VisualDesignerPanel.jsx").then(m => ({ default: m.VisualDesignerPanel }))
);
import { ModelHealthPanel }  from "./ModelHealthPanel.jsx";
import { ModelDetailHeader } from "./ModelDetailHeader.jsx";
import { ModelTabBar }       from "./ModelTabBar.jsx";
import { SaveBanner }        from "./SaveBanner.jsx";
import { VersionHistoryPanel } from "./VersionHistoryPanel.jsx";
import { fetchRunHistory, listShareLinks } from "../db/models.js";
import { fetchLocalRunHistory } from "../db/local.js";
import { validateModel }                    from "../engine/validation.js";
import { renameEntityType, renameQueue }    from "../engine/queue-refs.js";
import { normalizeModelConditions }         from "../model/conditionFormat.js";

const MODEL_JSON_KEYS = ["entityTypes", "stateVariables", "bEvents", "cEvents", "queues", "graph", "experimentDefaults"];

const AuthoringWorkflowShell = ({ mode, children }) => (
  <section aria-label={`${mode.label} authoring shell`} style={{ display: "block" }}>
    <main aria-label={`${mode.label} workspace`} style={{ minWidth: 0 }}>
      {children}
    </main>
  </section>
);

const TabErrors = ({ tabId, validation }) => {
  const errs = (validation.errors || []).filter(e => e.tab === tabId);
  const warns = (validation.warnings || []).filter(w => w.tab === tabId);
  if (!errs.length && !warns.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
      {errs.map((e, i) => (
        <div key={i} role="alert" style={{ background: alpha(C.red, 0.1), border: `1px solid ${alpha(C.red, 0.4)}`, borderRadius: 6, padding: "8px 12px", color: C.red, fontFamily: FONT, fontSize: 12 }}>
          [{e.code}] {e.message}
        </div>
      ))}
      {warns.map((w, i) => (
        <div key={i} style={{ background: alpha(C.amber, 0.1), border: `1px solid ${alpha(C.amber, 0.4)}`, borderRadius: 6, padding: "8px 12px", color: C.amber, fontFamily: FONT, fontSize: 12 }}>
          [{w.code}] {w.message}
        </div>
      ))}
    </div>
  );
};

function slugifyModelName(name = "") {
  return (name || "untitled")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function modelJsonFromModel(model = {}) {
  const json = MODEL_JSON_KEYS.reduce((acc, key) => {
    if (key === "graph") {
      return model.graph && typeof model.graph === "object" && !Array.isArray(model.graph)
        ? { ...acc, graph: model.graph }
        : acc;
    }
    if (key === "experimentDefaults") {
      return model.experimentDefaults && typeof model.experimentDefaults === "object" && !Array.isArray(model.experimentDefaults)
        ? { ...acc, experimentDefaults: model.experimentDefaults }
        : acc;
    }
    return {
      ...acc,
      [key]: Array.isArray(model[key]) ? model[key] : [],
    };
  }, {});
  // Preserve live-data and time fields in exported JSON
  if (model.timeUnit)                  json.timeUnit    = model.timeUnit;
  if (model.epoch)                     json.epoch       = model.epoch;
  if (model.dataSources?.length)       json.dataSources = model.dataSources;
  return json;
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

function preferMetricValue(primary, fallback) {
  if (fallback == null) return primary ?? null;
  if (primary == null) return fallback;
  if (primary === 0 && fallback !== 0) return fallback;
  return primary;
}

function hydrateResultsFromHistoryRow(row) {
  const json = row?.results_json;
  if (!json || typeof json !== "object") return null;
  const summary = json.summary || {};
  const nextSummary = {
    ...summary,
    total: preferMetricValue(summary.total, row.total_arrived) ?? 0,
    served: preferMetricValue(summary.served, row.total_served) ?? 0,
    reneged: preferMetricValue(summary.reneged, row.total_reneged) ?? 0,
    avgWait: preferMetricValue(summary.avgWait, row.avg_wait_time),
    avgSvc: preferMetricValue(summary.avgSvc, row.avg_service_time),
  };
  return {
    ...json,
    summary: nextSummary,
    runLabel: json.runLabel || row.run_label || null,
    replications: json.replications || row.replications || 1,
  };
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
  execute: "Run",
  results: "Results",
  history: "Run History",
  validate: "Model Health",
};

function isStarterBlankModel(model = {}) {
  const current = model && typeof model === "object" ? model : {};
  return !(current.entityTypes || []).length &&
    !(current.stateVariables || []).length &&
    !(current.bEvents || []).length &&
    !(current.cEvents || []).length &&
    !(current.queues || []).length &&
    !(current.goals || []).length;
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

// ── Data Sources Editor ──────────────────────────────────────────────────────

const BLANK_SOURCE = () => ({
  id: `ds_${Date.now()}`,
  label: '',
  type: 'rest',
  url: '',
  authHeader: '',
  authSecret: '',
  entityType: '',
  targetBEventId: '',
  timeField: 'time',
  attrMap: '{}',
});

function DataSourcesEditor({ sources, onChange, canEdit }) {
  const [expanded, setExpanded] = useState(null);

  const update = (idx, patch) => {
    const next = sources.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange(next);
  };

  const add = () => {
    const blank = BLANK_SOURCE();
    onChange([...sources, blank]);
    setExpanded(sources.length);
  };

  const remove = (idx) => {
    const next = sources.filter((_, i) => i !== idx);
    onChange(next);
    setExpanded(null);
  };

  const S = { row: { display:'flex', alignItems:'center', gap:6, padding:'6px 8px', borderRadius:4, background:C.surface, cursor:'pointer', userSelect:'none' },
               label: { flex:1, fontSize:12, color:C.text, fontFamily:FONT },
               badge: { fontSize:10, padding:'2px 6px', borderRadius:3, background:C.border, color:C.muted, fontFamily:FONT },
               field: { display:'flex', flexDirection:'column', gap:3 },
               fieldLabel: { fontSize:10, fontWeight:600, color:C.muted, letterSpacing:'1.2px', textTransform:'uppercase', fontFamily:FONT },
               input: { background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.text, fontFamily:FONT, fontSize:12, padding:'4px 7px' } };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:8}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2}}>
        <label style={{fontSize:11, fontWeight:600, color:C.muted, letterSpacing:'1.5px', textTransform:'uppercase', fontFamily:FONT}}>Data Sources</label>
        {canEdit && <Btn small variant="ghost" onClick={add}>+ Add source</Btn>}
      </div>

      {sources.length === 0 && (
        <span style={{fontSize:12, color:C.muted, fontFamily:FONT}}>No external data is connected yet.</span>
      )}

      {sources.map((src, idx) => (
        <div key={src.id} style={{border:`1px solid ${C.border}`, borderRadius:6, overflow:'hidden'}}>
          <div style={S.row} onClick={() => setExpanded(expanded === idx ? null : idx)}>
            <span style={S.label}>{src.label || src.id || `Source ${idx + 1}`}</span>
            <span style={S.badge}>{src.type}</span>
            <span style={{fontSize:10, color:C.muted, fontFamily:FONT}}>{expanded === idx ? '▲' : '▼'}</span>
          </div>

          {expanded === idx && (
            <div style={{padding:'10px 12px', display:'flex', flexDirection:'column', gap:8, borderTop:`1px solid ${C.border}`}}>
              <div style={{display:'flex', gap:8}}>
                <div style={{...S.field, flex:1}}>
                  <span style={S.fieldLabel}>ID</span>
                  <input style={S.input} value={src.id} disabled readOnly/>
                </div>
                <div style={{...S.field, flex:2}}>
                  <span style={S.fieldLabel}>Label</span>
                  <input style={S.input} value={src.label||''} disabled={!canEdit}
                    onChange={e => update(idx, { label: e.target.value })}/>
                </div>
                <div style={{...S.field}}>
                  <span style={S.fieldLabel}>Type</span>
                  <select style={S.input} value={src.type} disabled={!canEdit}
                    onChange={e => update(idx, { type: e.target.value })}>
                    <option value="rest">rest</option>
                    <option value="scheduleFeed">scheduleFeed</option>
                    <option value="actualsStream">actualsStream</option>
                    <option value="openSky">openSky (live aircraft)</option>
                  </select>
                </div>
              </div>

              <div style={S.field}>
                <span style={S.fieldLabel}>URL</span>
                <input style={{...S.input, width:'100%'}} value={src.url||''} disabled={!canEdit}
                  onChange={e => update(idx, { url: e.target.value })}/>
              </div>

              <div style={{display:'flex', gap:8}}>
                <div style={{...S.field, flex:1}}>
                  <span style={S.fieldLabel}>Auth header</span>
                  <input style={S.input} value={src.authHeader||''} disabled={!canEdit} placeholder="e.g. Authorization"
                    onChange={e => update(idx, { authHeader: e.target.value })}/>
                </div>
                <div style={{...S.field, flex:2}}>
                  <span style={S.fieldLabel}>Auth secret (env placeholder)</span>
                  <input style={S.input} value={src.authSecret||''} disabled={!canEdit} placeholder="{{env.MY_TOKEN}}"
                    onChange={e => update(idx, { authSecret: e.target.value })}/>
                </div>
              </div>

              {src.type === 'scheduleFeed' && (<>
                <div style={{display:'flex', gap:8}}>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Entity type</span>
                    <input style={S.input} value={src.entityType||''} disabled={!canEdit}
                      onChange={e => update(idx, { entityType: e.target.value })}/>
                  </div>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Arrival event to populate</span>
                    <input style={S.input} value={src.targetBEventId||''} disabled={!canEdit}
                      onChange={e => update(idx, { targetBEventId: e.target.value })}/>
                  </div>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Time field in the incoming data</span>
                    <input style={S.input} value={src.timeField||'time'} disabled={!canEdit}
                      onChange={e => update(idx, { timeField: e.target.value })}/>
                  </div>
                </div>
                <div style={S.field}>
                  <span style={S.fieldLabel}>Match incoming fields to model fields</span>
                  <textarea rows={3}
                    style={{...S.input, fontFamily:'monospace', fontSize:11, resize:'vertical', width:'100%'}}
                    value={typeof src.attrMap === 'object' ? JSON.stringify(src.attrMap, null, 2) : (src.attrMap||'{}')}
                    disabled={!canEdit}
                    onChange={e => {
                      try { update(idx, { attrMap: JSON.parse(e.target.value) }); } catch { /* keep raw string while typing */ }
                    }}/>
                  <span style={{fontSize:10, color:C.muted, fontFamily:FONT}}>
                    Map each incoming field to the model field it should fill. Advanced format example: <code>{'{"patientName": "entityId"}'}</code>.
                  </span>
                </div>
              </>)}

              {src.type === 'openSky' && (<>
                <div style={{display:'flex', gap:8}}>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Airport ICAO code</span>
                    <input style={S.input} value={src.airportIcao||'EGLL'} disabled={!canEdit} placeholder="e.g. EGLL, KJFK"
                      onChange={e => update(idx, { airportIcao: e.target.value.toUpperCase().slice(0, 4) })}/>
                  </div>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Radius (nautical miles)</span>
                    <input style={S.input} type="number" value={src.radiusNm||50} disabled={!canEdit}
                      onChange={e => update(idx, { radiusNm: Math.max(5, parseInt(e.target.value) || 50) })}/>
                  </div>
                </div>
                <div style={{fontSize:10, color:C.muted, fontFamily:FONT, lineHeight:1.5}}>
                  Polls the OpenSky Network API for arriving aircraft near the airport.
                  No API key required. Detects descending aircraft within the radius and computes inter-arrival times.
                  Supported airports: EGLL (Heathrow), KJFK, KLAX, KORD, EDDF, RJTT, YSSY, LFPG.
                </div>
              </>)}

              {canEdit && (
                <div style={{display:'flex', justifyContent:'flex-end'}}>
                  <Btn small variant="ghost" onClick={() => remove(idx)} style={{color:'#e55'}}>Remove</Btn>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const ModelDetail=({modelId,modelData,onBack,onRefresh,onLatestVersionChange,overrides={},initialTab})=>{
  const [model,setModel]=useState(()=>{
    if(!modelData) return null;
    return normalizeModelConditions({
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
  });
  const toast = useToast();
  const [tab,setTab]=useState(initialTab||"overview");
  const [dirty,setDirty]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState(null);
  const [discardConfirm,setDiscardConfirm]=useState(false);
  const [past,setPast]=useState([]);    // undo stack — model snapshots, capped at 20
  const [future,setFuture]=useState([]); // redo stack
  const [historyRows,setHistoryRows]=useState([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState("");
  const [historyShowArchived,setHistoryShowArchived]=useState(false);
  const [shareLinksMap,setShareLinksMap]=useState({});
  const [showCsvImport,setShowCsvImport]=useState(false);
  const [latestResults,setLatestResults]=useState(null);
  const [latestReplicationResults,setLatestReplicationResults]=useState([]);
  const [latestWarmupDetection,setLatestWarmupDetection]=useState(null);
  const [latestLog,setLatestLog]=useState([]);
  const [resultsView,setResultsView]=useState("summary");
  const [selectedResultsRunId,setSelectedResultsRunId]=useState("");
  const [starterGuideDismissed,setStarterGuideDismissed]=useState(()=>{
    try { return localStorage.getItem(`des_starter_${modelId}`) === "1"; } catch { return false; }
  });
  const { width: viewportWidth, isMobile: _vpMobile, isCompact: _vpCompact } = useViewport();
  const [showMoreTabs,setShowMoreTabs]=useState(false);
  const [currentVersion,setCurrentVersion]=useState(null);
  const [currentVersionId,setCurrentVersionId]=useState(null);
  const [showBaselineModal,setShowBaselineModal]=useState(false);
  const [baselineName,setBaselineName]=useState("");
  const [baselineSaving,setBaselineSaving]=useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname.replace(/\/+$/, "") : "";
  const isOwner=overrides.isOwner!==undefined?overrides.isOwner:false;
  const canEdit=overrides.canEdit!==undefined?overrides.canEdit:false;

  useEffect(() => {
    let cancelled = false;
    async function loadVersion() {
      try {
        const { listVersions } = await import("../db/models.js");
        const versions = await listVersions(modelId);
        if (!cancelled && versions.length > 0) {
          setCurrentVersion(versions[0].version);
          setCurrentVersionId(versions[0].id);
        }
      } catch {
        // versions table may not exist if migration not applied
      }
    }
    if (isOwner) loadVersion();
    return () => { cancelled = true; };
  }, [modelId, isOwner]);

  const handleRestoreVersion = (versionModelJson) => {
    const restored = normalizeModelConditions({
      ...model,
      entityTypes:        versionModelJson.entityTypes        || [],
      stateVariables:     versionModelJson.stateVariables     || [],
      bEvents:            versionModelJson.bEvents            || [],
      cEvents:            versionModelJson.cEvents            || [],
      queues:             versionModelJson.queues             || [],
      graph:              versionModelJson.graph              ?? null,
      experimentDefaults: versionModelJson.experimentDefaults || {},
      goals:              versionModelJson.goals              || [],
    });
    setWholeModel(restored);
  };

  const handleSaveAsBaseline = async () => {
    if (!overrides.onSaveAsBaseline || !baselineName.trim()) return;
    setBaselineSaving(true);
    try {
      await overrides.onSaveAsBaseline(modelId, baselineName.trim(), modelId);
      setShowBaselineModal(false);
      setBaselineName("");
      toast.success("Scenario baseline created");
    } catch (e) {
      toast.error(e?.message || "Could not create baseline");
    } finally {
      setBaselineSaving(false);
    }
  };

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

  const allowStarterGuide = overrides.showStarterGuide !== false;
  const starterGuideAutoHidden = (model?.entityTypes?.length > 0) || (Number.isFinite(model?.stats?.runs) ? model.stats.runs > 0 : false);
  const showStarterGuide = canEdit && allowStarterGuide && !starterGuideDismissed && !starterGuideAutoHidden;
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
  };
  const setWholeModel=(nextModel)=>{
    setPast(p=>[...p.slice(-19),model]);
    setFuture([]);
    setModel(normalizeModelConditions(nextModel));
    setDirty(true);
  };
  const mergeGeneratedModel=(current,nextModel)=>normalizeModelConditions({
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
    setSaveError(null);
    try{
      await overrides.onSave?.(model);
      setDirty(false);
      toast.success("Model saved");
      await onRefresh?.();
    }catch(error){
      setDirty(true);
      const msg = error?.message || "Save failed";
      setSaveError(msg);
      toast.error(msg);
    }finally{
      setSaving(false);
    }
  };
  _ur.current={undo,redo,save};

  const discard=()=>{
    if (!modelData) return;
    setModel(normalizeModelConditions({
      ...modelData,
      entityTypes:   modelData.entityTypes   || [],
      stateVariables:modelData.stateVariables || [],
      bEvents:       modelData.bEvents        || [],
      cEvents:       modelData.cEvents        || [],
      queues:        modelData.queues         || [],
      graph:         modelData.graph          || null,
      experimentDefaults: modelData.experimentDefaults || {},
      access:        modelData.access         || {},
    }));
    setDirty(false);
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
  const runHistoryFetcher = useMemo(
    () => (overrides.userId ? (filters => fetchRunHistory(modelId, filters)) : () => Promise.resolve(fetchLocalRunHistory(modelId))),
    [overrides.userId, modelId]
  );
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
    if(tab==="results"){
      setHistoryLoading(true);setHistoryError("");
      runHistoryFetcher({ archived: historyShowArchived })
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

  const hasResultsPayload = row => {
    const json = row?.results_json;
    return !!(json && typeof json === "object" && (json.summary || json.timeSeries || json.waitDist));
  };

  const loadResultsRun = runId => {
    const row = historyRows.find(r => r.id === runId);
    if (!hasResultsPayload(row)) return;
    setSelectedResultsRunId(row.id);
    const hydratedResults = hydrateResultsFromHistoryRow(row);
    setLatestResults(hydratedResults);
    setLatestLog(Array.isArray(hydratedResults?.log) ? hydratedResults.log : []);
  };

  const openResultsForRun = useCallback((row, nextSubtab = "summary") => {
    if (!hasResultsPayload(row)) return;
    setSelectedResultsRunId(row.id);
    const hydratedResults = hydrateResultsFromHistoryRow(row);
    setLatestResults(hydratedResults);
    setLatestLog(Array.isArray(hydratedResults?.log) ? hydratedResults.log : []);
    setResultsView(nextSubtab);
    setTab("results");
  }, []);



  const TABS=[
    {id:"overview",label:"Overview"},
    {id:"visual",label:"Draw"},
    {id:"ai",label:"Describe"},
    {id:"entities",label:"Entity Types"},
    {id:"queues",label:"Queues"},
    {id:"bevents",label:"B-Events"},
    {id:"cevents",label:"C-Events"},
    {id:"state",label:"Model Data"},
    {id:"validate",label:"Model Health"},
    {id:"execute",label:"Run"},
    {id:"results",label:"Results"},
    ...(isOwner?[{id:"access",label:"Access"}]:[]),
    ...(isOwner?[{id:"versions",label:"Versions"}]:[]),
  ];
  const selectableTabs = TABS.filter(t => !t.disabled);
  const NAV_MODES=[
    {id:"overview",label:"Overview",primaryTab:"overview",tabs:["overview"]},
    {id:"design",label:"Design",primaryTab:"visual",tabs:["visual","ai","entities","queues","bevents","cevents","state","validate"]},
    {id:"execute",label:"Run",primaryTab:"execute",tabs:["execute"]},
    {id:"results",label:"Results",primaryTab:"results",tabs:["results"]},
    ...(isOwner?[{id:"access",label:"Access",primaryTab:"access",tabs:["access"]}]:[]),
    ...(isOwner?[{id:"versions",label:"Versions",primaryTab:"versions",tabs:["versions"]}]:[]),
  ];
  const isMobileLayout = viewportWidth < 720;
  const isCompactLayout = viewportWidth >= 720 && viewportWidth < 1024;
  const DISPLAY_MODES = isMobileLayout
      ? [
        {id:"overview",label:"Overview",primaryTab:"overview",tabs:["overview"]},
        {id:"design",label:"Design",primaryTab:"visual",tabs:["visual","ai","entities","queues","bevents","cevents","state","validate"]},
        {id:"execute",label:"Run",primaryTab:"execute",tabs:["execute"]},
        {id:"results",label:"Results",primaryTab:"results",tabs:["results"]},
      ]
    : NAV_MODES;
  const activeMode = DISPLAY_MODES.find(mode => mode.tabs.includes(tab)) || DISPLAY_MODES[0];
  const contextualTabs = useMemo(() => {
    if (activeMode?.id === "overview") return ["overview"];
    if (activeMode?.id === "design") return ["visual", "ai", "entities", "queues", "bevents", "cevents", "state", "validate"];
    if (activeMode?.id === "execute") return ["execute"];
    if (activeMode?.id === "results") return ["results"];
    if (activeMode?.id === "access") return ["access"];
    if (activeMode?.id === "versions") return ["versions"];
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
  const authoringShellMode = !isMobileLayout && ["design"].includes(activeMode.id)
    ? activeMode
    : null;
  const renderAuthoringShell = content => (
    authoringShellMode ? <AuthoringWorkflowShell mode={authoringShellMode}>{content}</AuthoringWorkflowShell> : content
  );

  useEffect(()=>{
    if(isMobileLayout && !DISPLAY_MODES.some(mode => mode.tabs.includes(tab))) setTab("overview");
  },[isMobileLayout, tab]);

  useEffect(()=>{
    if(tab!=="results")return;
    setHistoryLoading(true);setHistoryError("");
    Promise.all([
      runHistoryFetcher({ archived: historyShowArchived }),
      listShareLinks(modelId).catch(()=>[]),
    ]).then(([rows, links])=>{
      const nextRows = rows || [];
      setHistoryRows(nextRows);
      const map = {};
      (links||[]).forEach(link => { if (link.isActive && link.runId) map[link.runId] = link; });
      setShareLinksMap(map);
      const selected = nextRows.find(row => row.id === selectedResultsRunId && hasResultsPayload(row));
      const fallback = nextRows.find(hasResultsPayload);
      const row = selected || fallback;
      if(row && !latestResults){
        setSelectedResultsRunId(row.id);
        const hydratedResults = hydrateResultsFromHistoryRow(row);
        setLatestResults(hydratedResults);
        setLatestLog(Array.isArray(hydratedResults?.log) ? hydratedResults.log : []);
      }
    }).catch(e=>setHistoryError(e.message))
    .finally(()=>setHistoryLoading(false));
  },[tab,modelId,selectedResultsRunId,latestResults,historyShowArchived,runHistoryFetcher]);

  if(!model)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',
      justifyContent:'center',color:C.red,fontFamily:FONT,fontSize:13}}>
      Error: model not found
    </div>
  );
  const runCountValue = model.statsLoading || model.statsError ? "—" : model.stats?.runs ?? 0;
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100dvh",minHeight:"100vh",background:C.bg}}>
      <ModelDetailHeader
        model={model} canEdit={canEdit} dirty={dirty} saving={saving}
        past={past} future={future} currentVersion={currentVersion}
        onBack={handleBack} onUndo={undo} onRedo={redo} onSave={save} onDiscard={discard}
        onHelpOpen={overrides.onHelpOpen}
      />
      <ModelTabBar
        tab={tab} setTab={setTab}
        DISPLAY_MODES={DISPLAY_MODES} activeMode={activeMode}
        visibleSelectableTabs={visibleSelectableTabs}
        validation={validation} tabIssueCounts={tabIssueCounts}
        isCompactLayout={isCompactLayout}
        showMoreTabs={showMoreTabs} setShowMoreTabs={setShowMoreTabs}
      />
      <div style={{flex:1,overflowY:"auto",padding:"clamp(12px,2vw,20px)"}}>
        <SaveBanner canEdit={canEdit} dirty={dirty} saving={saving} discardConfirm={discardConfirm} setDiscardConfirm={setDiscardConfirm} onSave={save} onDiscard={discard}/>
        {saveError&&<div role="alert" style={{background:C.errorBg,border:`1px solid ${C.danger}`,borderRadius:6,padding:'8px 12px',color:C.error,fontFamily:FONT,fontSize:12,marginBottom:8}}>{saveError}</div>}
        {tab==="overview" && <ModelHealthPanel model={model} validation={healthValidation} isStarterBlank={isStarterBlank} tab={tab} setTab={setTab} latestResults={latestResults}/>}
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
              <VisualDesignerPanel model={model} canEdit={canEdit} onModelChange={setWholeModel} onModelInit={async (nextModel) => { setModel(nextModel); try { await overrides.onSave?.(nextModel); } catch {} }}/>
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
                    {title:"Describe",body:"Describe the system in plain language and let the assistant draft the model.",action:"Open Describe",onClick:()=>{setTab("ai");dismissStarterGuide();}},
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
            {model.parentModelId && (
              <div style={{background:`${C.accent}0d`,border:`1px solid ${alpha(C.accent,0.25)}`,borderRadius:6,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:C.accent,fontFamily:FONT}}>
                  Forked from <strong>{overrides.parentModelName||"another model"}</strong>
                </span>
              </div>
            )}
            <Field label="Name" value={model.name} onChange={canEdit?v=>setField("name",v):null} inputStyle={{fontFamily:"Inter, Segoe UI, Arial, sans-serif",fontSize:13}}/>
            <Field label="Description" value={model.description} onChange={canEdit?v=>setField("description",v):null} multiline rows={4} inputStyle={{fontFamily:"Inter, Segoe UI, Arial, sans-serif",fontSize:13}}/>
            {canEdit && overrides.onSaveAsBaseline && (
              <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:C.text,fontFamily:FONT,marginBottom:2}}>Save as scenario baseline</div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>Fork this model under a new name to explore a variant, keeping a link back to this original.</div>
                </div>
                <Btn small variant="ghost" onClick={()=>{setBaselineName(`Scenario from ${model.name||"this model"}`);setShowBaselineModal(true);}}>Save as scenario baseline</Btn>
              </div>
            )}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
              <GoalsEditor goals={model.goals||[]} onChange={canEdit?v=>setField("goals",v):()=>{}}/>
            </div>
          </div>)
        )}
        {tab==="entities"&&(
          renderAuthoringShell(<div style={{maxWidth:1100,display:"flex",flexDirection:"column",gap:14}}>
            <TabErrors tabId="entities" validation={validation}/>
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
        {tab==="state"&&renderAuthoringShell(
          <div style={{maxWidth:900,display:"flex",flexDirection:"column",gap:14}}>
            <TabErrors tabId="state" validation={validation}/>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase"}}>Time unit</label>
              <select
                value={model.timeUnit||"minutes"}
                onChange={canEdit?(e=>setField("timeUnit",e.target.value)):undefined}
                disabled={!canEdit}
                style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:"Inter, Segoe UI, Arial, sans-serif",fontSize:12,padding:"5px 8px",width:160}}
              >
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:"1.5px",textTransform:"uppercase"}}>Real-world start date and time</label>
              <input
                type="datetime-local"
                value={(model.epoch||"").slice(0,16)}
                onChange={canEdit?(e=>setField("epoch", e.target.value ? new Date(e.target.value).toISOString() : "")):undefined}
                disabled={!canEdit}
                style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:model.epoch?C.text:C.muted,fontFamily:"Inter, Segoe UI, Arial, sans-serif",fontSize:12,padding:"5px 8px",width:220}}
              />
              <span style={{fontSize:10,color:C.muted,fontFamily:"Inter, Segoe UI, Arial, sans-serif"}}>
                Optional. Use this if simulation time should map to real calendar dates and times. Required for CSV timestamp import.
              </span>
            </div>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
              <div style={{fontSize:10,color:C.muted,fontFamily:FONT,lineHeight:1.6,marginBottom:8}}>
                Connect external schedules or live updates to this model.
              </div>
              <DataSourcesEditor sources={model.dataSources||[]} onChange={canEdit?v=>setField("dataSources",v):()=>{}} canEdit={canEdit}/>
            </div>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
              <StateVarEditor vars={model.stateVariables||[]} onChange={canEdit?v=>setField("stateVariables",v):()=>{}}/>
            </div>
          </div>
        )}
        {tab==="bevents"&&renderAuthoringShell(<div style={{maxWidth:1100}}><TabErrors tabId="bevents" validation={validation}/><BEventEditor events={model.bEvents||[]} entityTypes={model.entityTypes||[]} stateVariables={model.stateVariables||[]} queues={model.queues||[]} cEvents={model.cEvents||[]} onChange={canEdit?v=>setField("bEvents",v):()=>{}} epoch={model.epoch||null} timeUnit={model.timeUnit||'minutes'}/></div>)}
        {tab==="cevents"&&renderAuthoringShell(<div style={{maxWidth:1100}}><TabErrors tabId="cevents" validation={validation}/><CEventEditor events={model.cEvents||[]} bEvents={model.bEvents||[]} entityTypes={model.entityTypes||[]} stateVariables={model.stateVariables||[]} queues={model.queues||[]} onChange={canEdit?v=>setField("cEvents",v):()=>{}}/></div>)}
        {tab==="queues"&&renderAuthoringShell(<div style={{maxWidth:900}}><TabErrors tabId="queues" validation={validation}/><QueueEditor queues={model.queues||[]} entityTypes={model.entityTypes||[]} onChange={canEdit?newQueues=>{
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
                <div style={{fontSize:13,color:C.text,fontFamily:FONT,fontWeight:700}}>Readiness and blockers</div>
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
            {(validation.errors.length || validation.warnings.length) ? (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {validation.errors.map((issue,index)=>(
                  <button key={`err-${issue.code}-${index}`} type="button" onClick={()=>setTab(issue.tab||"overview")}
                    style={{background:alpha(C.red,0.1),border:`1px solid ${alpha(C.red,0.4)}`,borderRadius:6,color:C.red,cursor:"pointer",fontFamily:FONT,fontSize:11,padding:"9px 11px",textAlign:"left"}}>
                    {MODEL_HEALTH_TAB_LABELS[issue.tab||"overview"]||"Overview"}: {issue.message}{issue.code?` · Code ${issue.code}`:""}
                  </button>
                ))}
                {validation.warnings.map((issue,index)=>(
                  <button key={`warn-${issue.code}-${index}`} type="button" onClick={()=>setTab(issue.tab||"overview")}
                    style={{background:alpha(C.amber,0.1),border:`1px solid ${alpha(C.amber,0.4)}`,borderRadius:6,color:C.amber,cursor:"pointer",fontFamily:FONT,fontSize:11,padding:"9px 11px",textAlign:"left"}}>
                    {MODEL_HEALTH_TAB_LABELS[issue.tab||"overview"]||"Overview"}: {issue.message}{issue.code?` · Code ${issue.code}`:""}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{background:C.panel,border:`1px solid ${C.green}55`,borderRadius:8,padding:16,color:C.green,fontFamily:FONT,fontSize:12}}>
                No validation issues found.
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
              plan={overrides.plan}
              isAdmin={overrides.isAdmin}
              currentVersion={currentVersion}
              currentVersionId={currentVersionId}
              onRunSaved={handleRunSaved}
              onResultsReady={setLatestResults}
              onRunComplete={({ results, replicationResults, warmupDetection, log }) => {
                setLatestResults(results);
                setLatestReplicationResults(replicationResults || []);
                setLatestWarmupDetection(warmupDetection || null);
                setLatestLog(log || []);
              }}
              onGoToResults={() => { setTab("results"); setResultsView("summary"); }}
              autoRun={overrides.autoRun}
              onExperimentDefaultsChange={canEdit ? defaults => setField("experimentDefaults", defaults) : null}
              onApplyPatchedModel={canEdit ? (patchedModel, suggestion) => {
                setWholeModel(patchedModel);
                toast.success(`Applied: ${suggestion.change?.target} → ${suggestion.change?.to}`);
              } : null}
            />
          </ErrorBoundary>
        )}
        {tab==="results"&&(
          <div style={{maxWidth:1200,display:"flex",flexDirection:"column",gap:0}}>
            <div style={{display:"flex",alignItems:"center",gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:16,overflowX:"auto"}}>
              {[
                {id:"summary",label:"Summary"},
                {id:"log",label:"Log"},
                {id:"entities",label:"Entities"},
                {id:"history",label:"History"},
                {id:"explain",label:"Explain"},
              ].map(sub=>(
                <button
                  key={sub.id}
                  onClick={()=>setResultsView(sub.id)}
                  style={{
                    background:"none",border:"none",borderBottom:resultsView===sub.id?`2px solid ${C.accent}`:"2px solid transparent",
                    color:resultsView===sub.id?C.accent:C.muted,cursor:"pointer",
                    fontFamily:FONT,fontSize:12,fontWeight:resultsView===sub.id?700:400,
                    padding:"8px 14px",marginBottom:-1,whiteSpace:"nowrap",outline:"none",
                    transition:"color 0.15s",
                  }}
                  aria-current={resultsView===sub.id?"page":undefined}
                >
                  {sub.label}
                </button>
              ))}
              <div style={{flex:1}}/>
              <Btn small variant="ghost" onClick={()=>setTab("execute")} style={{marginRight:4,flexShrink:0}}>← Run</Btn>
            </div>

            {resultsView==="summary"&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {historyLoading&&<div style={{color:C.muted,fontFamily:FONT,fontSize:12}}>Loading saved runs…</div>}
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
                  <ResultsWorkspace
                    results={latestResults}
                    model={model}
                    replicationResults={latestReplicationResults}
                    warmupDetection={latestWarmupDetection}
                  />
                ) : (
                  <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:18,color:C.muted,fontFamily:FONT,fontSize:12,lineHeight:1.7}}>
                    No results yet. Open <strong>Run</strong> to execute the simulation, then come back here to explore the output.
                  </div>
                )}
              </div>
            )}
            {resultsView==="log"&&(
              (latestLog.length > 0 || Array.isArray(latestResults?.log)) ? (
                <LogViewer log={latestLog.length > 0 ? latestLog : latestResults?.log || []} model={model}/>
              ) : (
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:18,color:C.muted,fontFamily:FONT,fontSize:12,lineHeight:1.7}}>
                  No log available. Run the simulation first to capture event log data.
                </div>
              )
            )}
            {resultsView==="entities"&&(
              latestResults?.entitySummary ? (
                <EntitySummaryTable
                  entitySummary={latestResults.entitySummary}
                  meanWait={latestResults.summary?.avgWait}
                />
              ) : (
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:18,color:C.muted,fontFamily:FONT,fontSize:12,lineHeight:1.7}}>
                  No entity data yet. Run the simulation first to see per-entity-type breakdowns.
                </div>
              )
            )}
            {resultsView==="history"&&(
              <ModelHistoryTab
                historyRows={historyRows} setHistoryRows={setHistoryRows}
                historyLoading={historyLoading} setHistoryLoading={setHistoryLoading}
                historyError={historyError} setHistoryError={setHistoryError}
                historyShowArchived={historyShowArchived} setHistoryShowArchived={setHistoryShowArchived}
                shareLinksMap={shareLinksMap} setShareLinksMap={setShareLinksMap}
                modelId={modelId} userId={overrides.userId} model={model} baseUrl={baseUrl}
                onExplainRun={row=>openResultsForRun(row,"explain")}
                onViewResults={row=>openResultsForRun(row,"summary")}
              />
            )}
            {resultsView==="explain"&&(
              latestResults ? (
                <AiAssistantPanel
                  model={model}
                  results={latestResults}
                  exportConfig={{
                    modelId,
                    runLabel: historyRows.find(row => row.id === selectedResultsRunId)?.run_label || latestResults?.runLabel || null,
                    replications: historyRows.find(row => row.id === selectedResultsRunId)?.replications || latestResults?.replications || 1,
                    warmupPeriod: historyRows.find(row => row.id === selectedResultsRunId)?.warmup_period || null,
                    maxSimTime: historyRows.find(row => row.id === selectedResultsRunId)?.max_simulation_time || null,
                    terminationMode: "time",
                    terminationCondition: null,
                  }}
                  aggregateStats={latestResults?.aggregateStats || {}}
                  comparisonRuns={historyRows.filter(hasResultsPayload).map(row => ({
                    id: `saved-${row.id}`,
                    label: row.run_label || new Date(row.ran_at || Date.now()).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }),
                    payload: row,
                    source: "saved",
                  }))}
                  comparisonLoading={historyLoading}
                  comparisonError={historyError}
                  embedded
                />
              ) : (
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:18,color:C.muted,fontFamily:FONT,fontSize:12,lineHeight:1.7}}>
                  Results from the latest run will appear here. Open Run to generate them, or select a saved run when run history is available.
                </div>
              )
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
        {tab==="versions"&&isOwner&&(
          <VersionHistoryPanel
            model={model}
            userId={overrides.userId}
            isOwner={isOwner}
            onToast={toast}
            onVersionChange={(ver, verId) => { setCurrentVersion(ver); setCurrentVersionId(verId); onLatestVersionChange?.(ver); }}
            currentModel={model}
            onRestoreVersion={handleRestoreVersion}
          />
        )}
        {showBaselineModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1200,padding:16}}>
            <div role="dialog" aria-modal="true" style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:24,width:"min(440px,100%)",fontFamily:FONT,display:"flex",flexDirection:"column",gap:14}}>
              <div style={{fontSize:15,fontWeight:700,color:C.text}}>Save as scenario baseline</div>
              <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>
                Creates a new private model forked from this one, with a link back to the original.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:1}}>NAME FOR NEW SCENARIO</label>
                <input
                  autoFocus
                  value={baselineName}
                  onChange={e=>setBaselineName(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter")handleSaveAsBaseline();if(e.key==="Escape"){setShowBaselineModal(false);setBaselineName("");}}}
                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:12,padding:"8px 10px",outline:"none"}}
                  placeholder="e.g. High-demand scenario"
                />
              </div>
              <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                <Btn variant="ghost" onClick={()=>{setShowBaselineModal(false);setBaselineName("");}}>Cancel</Btn>
                <Btn variant="primary" disabled={!baselineName.trim()||baselineSaving} onClick={handleSaveAsBaseline}>
                  {baselineSaving?"Creating…":"Create"}
                </Btn>
              </div>
            </div>
          </div>
        )}
        </ErrorBoundary>
      </div>
    </div>
  );
};

// ── App ──────────────────────────────────────────────────────

export {
  ModelCard,
  NewModelModal,
  ModelDetail,
  buildModelExportPayload, buildRunHistoryCsv, buildRunHistoryExportPayload,
  slugifyModelName, modelJsonFromModel,
};

