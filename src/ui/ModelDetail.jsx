// ui/ModelDetail.jsx — ModelDetail, ModelCard, NewModelModal
import { useState, useEffect, useMemo, useRef } from "react";
import pkg from '../../package.json';
import { C, FONT } from "./shared/tokens.js";
import { Tag, Avatar, Btn, Field, SH, InfoBox, Empty, ErrorBoundary } from "./shared/components.jsx";
import { EntityTypeEditor, StateVarEditor, BEventEditor, CEventEditor, QueueEditor } from "./editors/index.jsx";
import { AiGeneratedModelPanel } from "./editors/AiGeneratedModelPanel.jsx";
import { ExecutePanel } from "./execute/index.jsx";
import { fetchRunHistory } from "../db/models.js";
import { validateModel } from "../engine/validation.js";

const MODEL_JSON_KEYS = ["entityTypes", "stateVariables", "bEvents", "cEvents", "queues"];

function slugifyModelName(name = "") {
  return (name || "untitled")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function modelJsonFromModel(model = {}) {
  return MODEL_JSON_KEYS.reduce((json, key) => ({
    ...json,
    [key]: Array.isArray(model[key]) ? model[key] : [],
  }), {});
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

const ModelDetail=({modelId,modelData,onBack,onRefresh,overrides={}})=>{
  const [model,setModel]=useState(()=>{
    if(!modelData) return null;
    return {
      ...modelData,
      entityTypes:   modelData.entityTypes   || [],
      stateVariables:modelData.stateVariables || [],
      bEvents:       modelData.bEvents        || [],
      cEvents:       modelData.cEvents        || [],
      queues:        modelData.queues         || [],
      access:        modelData.access         || {},
    };
  });
  const [tab,setTab]=useState("overview");
  const [dirty,setDirty]=useState(false);
  const [saveStatus,setSaveStatus]=useState(null);
  const [saving,setSaving]=useState(false);
  const [past,setPast]=useState([]);    // undo stack — model snapshots, capped at 20
  const [future,setFuture]=useState([]); // redo stack
  const [historyRows,setHistoryRows]=useState([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState("");
  const isOwner=overrides.isOwner!==undefined?overrides.isOwner:false;
  const canEdit=overrides.canEdit!==undefined?overrides.canEdit:false;

  const setField=(f,v)=>{
    setPast(p=>[...p.slice(-19),model]); // push snapshot before change, cap at 20
    setFuture([]);                        // new edit clears redo stack
    setModel(m=>({...m,[f]:v}));
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

  const TabErrors = ({ tabId }) => {
    const errs  = validation.errors.filter(e => e.tab === tabId);
    const warns = validation.warnings.filter(w => w.tab === tabId);
    if (!errs.length && !warns.length) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {errs.map((e, i) => (
          <div key={i} role="alert" style={{ background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: 6,
            padding: '8px 12px', color: '#fca5a5', fontFamily: FONT, fontSize: 12 }}>
            [{e.code}] {e.message}
          </div>
        ))}
        {warns.map((w, i) => (
          <div key={i} style={{ background: '#78350f', border: '1px solid #d97706', borderRadius: 6,
            padding: '8px 12px', color: '#fde68a', fontFamily: FONT, fontSize: 12 }}>
            [{w.code}] {w.message}
          </div>
        ))}
      </div>
    );
  };

  const TABS=[
    {id:"overview",label:"Overview"},{id:"entities",label:"Entity Types"},
    {id:"state",label:"State Vars"},{id:"bevents",label:"B-Events"},
    {id:"cevents",label:"C-Events"},{id:"queues",label:"Queues"},
    {id:"ai",label:"AI Generated Model"},
    {id:"execute",label:"▶ Execute"},
    {id:"history",label:"History"},
    ...(isOwner?[{id:"access",label:"Access"}]:[]),
  ];

  useEffect(()=>{
    if(tab!=="history")return;
    setHistoryLoading(true);setHistoryError("");
    fetchRunHistory(modelId)
      .then(rows=>setHistoryRows(rows))
      .catch(e=>setHistoryError(e.message))
      .finally(()=>setHistoryLoading(false));
  },[tab,modelId]);

  if(!model)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',
      justifyContent:'center',color:C.red,fontFamily:FONT,fontSize:13}}>
      Error: model not found
    </div>
  );
  const runCountValue = model.statsLoading || model.statsError ? "—" : model.stats?.runs ?? 0;
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:C.bg}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 20px",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,flexWrap:"wrap"}}>
        <Btn small variant="ghost" onClick={handleBack}>← Back</Btn>
        <div style={{flex:1,fontWeight:700,fontSize:14,color:C.text,fontFamily:FONT}}>{model.name}</div>
        <Tag label={model.visibility} color={model.visibility==="public"?C.green:C.accent}/>
        <Tag label={`v${pkg.version}`} color={C.purple}/>
        {canEdit&&<Btn small variant="ghost" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">↩ Undo</Btn>}
        {canEdit&&<Btn small variant="ghost" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">↪ Redo</Btn>}
        <Btn small variant="ghost" onClick={exportJson}>Export JSON</Btn>
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
      <div role="tablist" aria-label="Model sections" style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,paddingLeft:20,flexShrink:0,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} type="button" role="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",whiteSpace:"nowrap",
            borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",
            color:tab===t.id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:"10px 16px",cursor:"pointer",fontWeight:tab===t.id?700:400}}>{t.label}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        <ErrorBoundary
          key={tab}
          title="Model panel crashed"
          message="This tab could not render. Try opening the tab again."
        >
        {tab==="ai"&&(
          <AiGeneratedModelPanel model={model} canEdit={canEdit} onApplyModel={applyGeneratedModel} onSaveModel={saveGeneratedModel}/>
        )}
        {tab==="overview"&&(
          <div style={{maxWidth:700,display:"flex",flexDirection:"column",gap:14}}>
            <Field label="Name" value={model.name} onChange={canEdit?v=>setField("name",v):null}/>
            <Field label="Description" value={model.description} onChange={canEdit?v=>setField("description",v):null} multiline rows={4}/>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
              <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,marginBottom:12}}>MODEL STRUCTURE</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
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
          </div>
        )}
        {tab==="entities"&&<div style={{maxWidth:800}}><TabErrors tabId="entities"/><EntityTypeEditor types={model.entityTypes||[]} onChange={canEdit?v=>setField("entityTypes",v):()=>{}}/></div>}
        {tab==="state"&&<div style={{maxWidth:750}}><TabErrors tabId="state"/><StateVarEditor vars={model.stateVariables||[]} onChange={canEdit?v=>setField("stateVariables",v):()=>{}}/></div>}
        {tab==="bevents"&&<div style={{maxWidth:880}}><TabErrors tabId="bevents"/><BEventEditor events={model.bEvents||[]} entityTypes={model.entityTypes||[]} stateVariables={model.stateVariables||[]} queues={model.queues||[]} cEvents={model.cEvents||[]} onChange={canEdit?v=>setField("bEvents",v):()=>{}}/></div>}
        {tab==="cevents"&&<div style={{maxWidth:860}}><TabErrors tabId="cevents"/><CEventEditor events={model.cEvents||[]} bEvents={model.bEvents||[]} entityTypes={model.entityTypes||[]} stateVariables={model.stateVariables||[]} queues={model.queues||[]} onChange={canEdit?v=>setField("cEvents",v):()=>{}}/></div>}
        {tab==="queues"&&<div style={{maxWidth:800}}><TabErrors tabId="queues"/><QueueEditor queues={model.queues||[]} entityTypes={model.entityTypes||[]} onChange={canEdit?v=>setField("queues",v):()=>{}}/></div>}
        {tab==="execute"&&(
          <ErrorBoundary
            title="Execute panel crashed"
            message="The simulation controls could not render."
          >
            <div style={{maxWidth:1080}}><ExecutePanel model={model} modelId={modelId} userId={overrides.userId}/></div>
          </ErrorBoundary>
        )}
        {tab==="history"&&(
          <div style={{maxWidth:960}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700,flex:1,minWidth:180}}>RUN HISTORY (LAST 20)</div>
              <Btn small variant="ghost" onClick={exportRunHistoryJson} disabled={!historyRows.length}>Export History JSON</Btn>
              <Btn small variant="ghost" onClick={exportRunHistoryCsv} disabled={!historyRows.length}>Export History CSV</Btn>
            </div>
            {historyLoading&&<div style={{color:C.muted,fontFamily:FONT,fontSize:12}}>Loading...</div>}
            {historyError&&<div style={{color:C.red,fontFamily:FONT,fontSize:12}}>{historyError}</div>}
            {!historyLoading&&!historyError&&historyRows.length===0&&(
              <Empty icon="📊" msg="No runs yet. Run the simulation from the Execute tab."/>
            )}
            {!historyLoading&&historyRows.length>0&&(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:FONT,fontSize:11}}>
                  <thead>
                    <tr>{["Date / Time","Label","Arrived","Served","Reneged","Renege %","Avg Wait","Avg Sojourn","Duration (ms)"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"6px 12px",color:C.muted,borderBottom:`1px solid ${C.border}`,fontSize:10,letterSpacing:1,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row,i)=>{
                      const dt=new Date(row.ran_at);
                      const dateStr=dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
                      const timeStr=dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
                      const renPct=row.total_arrived>0?((row.total_reneged/row.total_arrived)*100).toFixed(1):"—";
                      return(
                        <tr key={row.id} style={{background:i%2===0?C.surface+"60":"transparent"}}>
                          <td style={{padding:"6px 12px",color:C.muted,whiteSpace:"nowrap"}}>{dateStr} {timeStr}</td>
                          <td style={{padding:"6px 12px",color:row.run_label?C.text:C.muted,whiteSpace:"nowrap"}}>{row.run_label || "-"}</td>
                          <td style={{padding:"6px 12px",color:C.accent,fontWeight:700}}>{row.total_arrived}</td>
                          <td style={{padding:"6px 12px",color:C.served,fontWeight:700}}>{row.total_served}</td>
                          <td style={{padding:"6px 12px",color:C.reneged,fontWeight:700}}>{row.total_reneged}</td>
                          <td style={{padding:"6px 12px",color:row.total_reneged>0?C.reneged:C.muted}}>{renPct}{renPct!=="—"?"%":""}</td>
                          <td style={{padding:"6px 12px",color:C.amber}}>{row.avg_wait_time!=null?row.avg_wait_time.toFixed(2)+" t":"—"}</td>
                          <td style={{padding:"6px 12px",color:C.server}}>{row.avg_service_time!=null?row.avg_service_time.toFixed(2)+" t":"—"}</td>
                          <td style={{padding:"6px 12px",color:C.muted}}>{row.duration_ms!=null?row.duration_ms:"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
  const srvTypes=(model.entityTypes||[]).filter(et=>et.role==="server");
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
          {srvTypes.length>0&&<Tag label={srvTypes.map(s=>`${s.count||1}× ${s.name}`).join(", ")} color={C.server}/>}
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

