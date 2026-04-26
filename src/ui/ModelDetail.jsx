// ui/ModelDetail.jsx — ModelDetail, ModelCard, NewModelModal
import { useState, useEffect } from "react";
import { C, FONT } from "./shared/tokens.js";
import { Tag, Avatar, Btn, Field, SH, InfoBox, Empty } from "./shared/components.jsx";
import { EntityTypeEditor, StateVarEditor, BEventEditor, CEventEditor, QueueEditor } from "./editors/index.jsx";
import { ExecutePanel } from "./execute/index.jsx";
import { fetchRunHistory } from "../db/models.js";

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
  const [historyRows,setHistoryRows]=useState([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState("");
  const isOwner=overrides.isOwner!==undefined?overrides.isOwner:false;
  const canEdit=overrides.canEdit!==undefined?overrides.canEdit:false;
  const setField=(f,v)=>{setModel(m=>({...m,[f]:v}));setDirty(true);};
  const save=async()=>{if(overrides.onSave)await overrides.onSave(model);setDirty(false);onRefresh();};

  const TABS=[
    {id:"overview",label:"Overview"},{id:"entities",label:"Entity Types"},
    {id:"state",label:"State Vars"},{id:"bevents",label:"B-Events"},
    {id:"cevents",label:"C-Events"},{id:"queues",label:"Queues"},
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
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:C.bg}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 20px",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,flexWrap:"wrap"}}>
        <Btn small variant="ghost" onClick={onBack}>← Back</Btn>
        <div style={{flex:1,fontWeight:700,fontSize:14,color:C.text,fontFamily:FONT}}>{model.name}</div>
        <Tag label={model.visibility} color={model.visibility==="public"?C.green:C.accent}/>
        <Tag label="v6" color={C.purple}/>
        {canEdit&&dirty&&<Btn small variant="primary" onClick={save}>Save</Btn>}
      </div>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,paddingLeft:20,flexShrink:0,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",whiteSpace:"nowrap",
            borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",
            color:tab===t.id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:"10px 16px",cursor:"pointer",fontWeight:tab===t.id?700:400}}>{t.label}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:20}}>
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
                  {label:"Runs",        value:model.stats?.runs||0,color:C.green},
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
        {tab==="entities"&&<div style={{maxWidth:800}}><EntityTypeEditor types={model.entityTypes||[]} onChange={canEdit?v=>setField("entityTypes",v):()=>{}}/></div>}
        {tab==="state"&&<div style={{maxWidth:750}}><StateVarEditor vars={model.stateVariables||[]} onChange={canEdit?v=>setField("stateVariables",v):()=>{}}/></div>}
        {tab==="bevents"&&<div style={{maxWidth:880}}><BEventEditor events={model.bEvents||[]} entityTypes={model.entityTypes||[]} queues={model.queues||[]} onChange={canEdit?v=>setField("bEvents",v):()=>{}}/></div>}
        {tab==="cevents"&&<div style={{maxWidth:860}}><CEventEditor events={model.cEvents||[]} bEvents={model.bEvents||[]} entityTypes={model.entityTypes||[]} stateVariables={model.stateVariables||[]} queues={model.queues||[]} onChange={canEdit?v=>setField("cEvents",v):()=>{}}/></div>}
        {tab==="queues"&&<div style={{maxWidth:800}}><QueueEditor queues={model.queues||[]} entityTypes={model.entityTypes||[]} onChange={canEdit?v=>setField("queues",v):()=>{}}/></div>}
        {tab==="execute"&&<div style={{maxWidth:1080}}><ExecutePanel model={model} modelId={modelId} userId={overrides.userId}/></div>}
        {tab==="history"&&(
          <div style={{maxWidth:960}}>
            <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700,marginBottom:14}}>RUN HISTORY (LAST 20)</div>
            {historyLoading&&<div style={{color:C.muted,fontFamily:FONT,fontSize:12}}>Loading...</div>}
            {historyError&&<div style={{color:C.red,fontFamily:FONT,fontSize:12}}>{historyError}</div>}
            {!historyLoading&&!historyError&&historyRows.length===0&&(
              <Empty icon="📊" msg="No runs yet. Run the simulation from the Execute tab."/>
            )}
            {!historyLoading&&historyRows.length>0&&(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:FONT,fontSize:11}}>
                  <thead>
                    <tr>{["Date / Time","Arrived","Served","Reneged","Renege %","Avg Wait","Avg Sojourn","Duration (ms)"].map(h=>(
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
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRARY
// ═══════════════════════════════════════════════════════════════════════════════
const ModelCard=({model,onOpen})=>{
  const owner=null;
  const fmtDate=iso=>{ try{ return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }catch(e){return '';} };
  const hasRenege=(model.bEvents||[]).some(ev=>(ev.schedules||[]).some(s=>s.isRenege));
  const srvTypes=(model.entityTypes||[]).filter(et=>et.role==="server");
  return (
    <div onClick={onOpen} style={{background:C.panel,border:`1px solid ${C.border}`,borderLeft:`3px solid ${model.visibility==="public"?C.green:C.accent}`,borderRadius:8,padding:16,cursor:"pointer",display:"flex",flexDirection:"column",gap:10}}
      onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{fontWeight:700,fontSize:14,color:C.text,fontFamily:FONT,lineHeight:1.3}}>{model.name}</div>
        <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap"}}>
          <Tag label={model.visibility} color={model.visibility==="public"?C.green:C.accent}/>
          {hasRenege&&<Tag label="reneging" color={C.reneged}/>}
          {srvTypes.length>0&&<Tag label={srvTypes.map(s=>`${s.count||1}× ${s.name}`).join(", ")} color={C.server}/>}
        </div>
      </div>
      <div style={{fontSize:12,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>{model.description}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <Tag label={`${(model.entityTypes||[]).length} types`} color={C.server}/>
        <Tag label={`${(model.bEvents||[]).length} B-events`} color={C.bEvent}/>
        <Tag label={`${(model.cEvents||[]).length} C-events`} color={C.cEvent}/>
        {model.stats?.runs&&<Tag label={`${model.stats.runs} runs`} color={C.green}/>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {owner&&<Avatar u={owner} size={22}/>}
          <span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>{owner?.name}</span>
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
      <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:28,width:420,fontFamily:FONT,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text}}>New DES Model</div>
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Queue with Reneging"/>
        <Field label="Description" value={desc} onChange={setDesc} multiline rows={3}/>
        <div style={{display:"flex",gap:10}}><Btn variant="ghost" onClick={onClose} full>Cancel</Btn><Btn variant="primary" onClick={create} disabled={!name.trim()||saving} full>{saving?"Saving...":"Create"}</Btn></div>
      </div>
    </div>
  );
};

// ── App ──────────────────────────────────────────────────────

export { ModelDetail, ModelCard, NewModelModal };

