// components.jsx — Model editors, detail view, cards

import { useState, useRef, useCallback, useEffect } from 'react';
import { C, FONT, Tag, PhaseTag, Avatar, Btn, Field, SH, InfoBox, Empty } from './Shared.jsx';
import { buildEngine, DISTRIBUTIONS } from './Engine.js';

const EntityTypeEditor=({types,onChange})=>{
  const add=()=>onChange([...types,{id:"et"+Date.now(),name:"",role:"customer",count:"",attrs:"",description:""}]);
  const upd=(i,f,v)=>{const n=[...types];n[i]={...n[i],[f]:v};onChange(n);};
  const rem=(i)=>onChange(types.filter((_,idx)=>idx!==i));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <SH label="Entity Types" color={C.server}><Btn small variant="ghost" onClick={add}>+ Add Type</Btn></SH>
      <InfoBox color={C.server}>
        <strong style={{color:C.server}}>customer</strong> types arrive via <code>ARRIVE(TypeName)</code>.{" "}
        <strong style={{color:C.server}}>server</strong> types are pre-created at t=0 with the given <em>count</em>.{" "}
        Server <strong>attrs</strong> (e.g. <code>serviceTime=3</code>) are readable in C-event conditions via <code>attr(Type,attrName)</code>{" "}
        and in SCHEDULE delays via <code>server.attrName</code>.
      </InfoBox>
      {types.length===0&&<Empty icon="👥" msg="No entity types."/>}
      {types.map((et,i)=>(
        <div key={et.id} style={{background:C.bg,border:`1px solid ${et.role==="server"?C.server+"44":C.cEvent+"33"}`,
          borderLeft:`3px solid ${et.role==="server"?C.server:C.cEvent}`,borderRadius:6,padding:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <Tag label={et.role||"customer"} color={et.role==="server"?C.server:C.cEvent}/>
            <input value={et.name} onChange={e=>upd(i,"name",e.target.value)} placeholder="TypeName"
              style={{width:130,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
            <select value={et.role||"customer"} onChange={e=>upd(i,"role",e.target.value)}
              style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
              <option value="customer">customer</option>
              <option value="server">server</option>
            </select>
            {et.role==="server"&&<>
              <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>count:</span>
              <input value={et.count||""} onChange={e=>upd(i,"count",e.target.value)} placeholder="1"
                style={{width:50,background:"transparent",border:`1px solid ${C.server}55`,borderRadius:4,color:C.server,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
            </>}
            <Btn small variant="danger" onClick={()=>rem(i)}>✕</Btn>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:50}}>attrs:</span>
            <input value={et.attrs||""} onChange={e=>upd(i,"attrs",e.target.value)} placeholder="serviceTime=3, priority=HIGH"
              style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
          </div>
          <input value={et.description||""} onChange={e=>upd(i,"description",e.target.value)} placeholder="Description"
            style={{background:"transparent",border:`1px solid ${C.border}40`,borderRadius:4,color:C.muted,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none",width:"100%",boxSizing:"border-box"}}/>
        </div>
      ))}
    </div>
  );
};

const StateVarEditor=({vars,onChange})=>{
  const add=()=>onChange([...vars,{id:"sv"+Date.now(),name:"",initialValue:"0",description:""}]);
  const upd=(i,f,v)=>{const n=[...vars];n[i]={...n[i],[f]:v};onChange(n);};
  const rem=(i)=>onChange(vars.filter((_,idx)=>idx!==i));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <SH label="Scalar State Variables" color={C.purple}><Btn small variant="ghost" onClick={add}>+ Add Variable</Btn></SH>
      <InfoBox color={C.purple}>
        <strong style={{color:C.purple}}>Built-in:</strong>{" "}
        <code>queue(Type).length</code> · <code>idle(Type).count</code> · <code>busy(Type).count</code> ·{" "}
        <code>attr(Type,attrName)</code> · <code>served</code> · <code>reneged</code> · <code>clock</code>
      </InfoBox>
      {vars.length===0&&<Empty icon="📊" msg="No custom scalar variables needed for most models."/>}
      {vars.map((sv,i)=>(
        <div key={sv.id} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:10,display:"flex",gap:8,alignItems:"center"}}>
          <input value={sv.name} onChange={e=>upd(i,"name",e.target.value)} placeholder="varName"
            style={{width:140,background:"transparent",border:`1px solid ${C.purple}44`,borderRadius:4,color:C.purple,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
          <span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>=</span>
          <input value={sv.initialValue} onChange={e=>upd(i,"initialValue",e.target.value)} placeholder="0"
            style={{width:80,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
          <input value={sv.description} onChange={e=>upd(i,"description",e.target.value)} placeholder="Description"
            style={{flex:1,background:"transparent",border:`1px solid ${C.border}40`,borderRadius:4,color:C.muted,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none"}}/>
          <Btn small variant="danger" onClick={()=>rem(i)}>✕</Btn>
        </div>
      ))}
    </div>
  );
};

const BEventEditor=({events,onChange})=>{
  const add=()=>onChange([...events,{id:"b"+Date.now(),name:"",scheduledTime:"0",effect:"",schedules:[],description:""}]);
  const upd=(i,f,v)=>{const n=[...events];n[i]={...n[i],[f]:v};onChange(n);};
  const rem=(i)=>onChange(events.filter((_,idx)=>idx!==i));
  const addS=(i)=>{const n=[...events];n[i]={...n[i],schedules:[...(n[i].schedules||[]),{eventId:"",dist:"Exponential",distParams:{mean:"1"},isRenege:false}]};onChange(n);};
  const updS=(i,j,p)=>{const n=[...events];const s=[...n[i].schedules];s[j]={...s[j],...p};n[i]={...n[i],schedules:s};onChange(n);};
  const remS=(i,j)=>{const n=[...events];n[i]={...n[i],schedules:n[i].schedules.filter((_,idx)=>idx!==j)};onChange(n);};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <SH label="B-Events  (Bound — scheduled in FEL)" color={C.bEvent}><Btn small variant="ghost" onClick={add}>+ Add B-Event</Btn></SH>
      <InfoBox color={C.bEvent}>
        <strong style={{color:C.bEvent}}>Macros:</strong>{" "}
        <code>ARRIVE(Type)</code> · <code>COMPLETE()</code> · <code>RENEGE(ctx)</code> · <code>RENEGE_OLDEST(Type)</code><br/>
        Set <em>t=999</em> for template B-events (Service Complete, Renege) — never directly in initial FEL.
      </InfoBox>
      {events.length===0&&<Empty icon="⏰" msg="No B-events."/>}
      {events.map((ev,i)=>{
        const isTmpl=parseFloat(ev.scheduledTime)>=900;
        return (
          <div key={ev.id} style={{background:C.bg,border:`1px solid ${isTmpl?C.muted+"44":C.bEvent+"33"}`,
            borderLeft:`3px solid ${isTmpl?C.muted:C.bEvent}`,borderRadius:6,padding:12,display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <Tag label={isTmpl?"template":"B-event"} color={isTmpl?C.muted:C.bEvent}/>
              <input value={ev.name} onChange={e=>upd(i,"name",e.target.value)} placeholder="Event name"
                style={{flex:1,minWidth:130,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
              <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>t=</span>
              <input value={ev.scheduledTime} type="number" step="0.5" onChange={e=>upd(i,"scheduledTime",e.target.value)}
                style={{width:65,background:"transparent",border:`1px solid ${isTmpl?C.muted+"55":C.bEvent+"66"}`,borderRadius:4,color:isTmpl?C.muted:C.bEvent,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
              <Btn small variant="danger" onClick={()=>rem(i)}>✕</Btn>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:46}}>effect:</span>
              <input value={ev.effect} onChange={e=>upd(i,"effect",e.target.value)} placeholder="ARRIVE(Customer); totalArrived++ or COMPLETE()"
                style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.green,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
            </div>
            <input value={ev.description} onChange={e=>upd(i,"description",e.target.value)} placeholder="Description"
              style={{background:"transparent",border:`1px solid ${C.border}40`,borderRadius:4,color:C.muted,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none",width:"100%",boxSizing:"border-box"}}/>
            {/* Schedules */}
            <div style={{background:C.surface,borderRadius:5,padding:10,display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1}}>SCHEDULES FOLLOW-ON B-EVENTS</span>
                <Btn small variant="ghost" onClick={()=>addS(i)}>+ Schedule</Btn>
              </div>
              {(ev.schedules||[]).length===0&&<span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>None.</span>}
              {(ev.schedules||[]).map((s,j)=>(
                <div key={j} style={{background:C.bg,borderRadius:5,padding:"10px 12px",border:`1px solid ${s.isRenege?C.reneged+"44":C.border}40`,display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <select value={s.eventId} onChange={e=>updS(i,j,{eventId:e.target.value})}
                      style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
                      <option value="">— select B-event —</option>
                      {events.map(b=><option key={b.id} value={b.id}>{b.name||b.id}</option>)}
                    </select>
                    <Btn small variant="danger" onClick={()=>remS(i,j)}>✕</Btn>
                  </div>
                  <DistPicker value={{dist:s.dist,distParams:s.distParams}} onChange={v=>updS(i,j,{dist:v.dist,distParams:v.distParams})} compact/>
                  <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",color:s.isRenege?C.reneged:C.muted,fontFamily:FONT,fontSize:11,fontWeight:600}}>
                    <input type="checkbox" checked={!!s.isRenege} onChange={e=>updS(i,j,{isRenege:e.target.checked})} style={{accentColor:C.reneged}}/>
                    Reneging timer
                  </label>
                  {s.isRenege&&<div style={{background:C.reneged+"0f",border:`1px solid ${C.reneged}33`,borderRadius:4,padding:"6px 10px",fontSize:11,color:C.reneged,fontFamily:FONT}}>
                    ⚠ Reneging timer — fires for most recently arrived customer. Skipped if already served.
                  </div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CEventEditor=({events, onChange, bEvents=[]})=>{
  // A C-event has:
  //   name, condition  — as before
  //   effect           — only ASSIGN macro(s), no SCHEDULE needed here
  //   cSchedules       — structured list of B-events to schedule, each with:
  //                        { id, eventId, dist, distParams, useEntityCtx }
  //   description

  const blank=()=>({id:"c"+Date.now(),name:"",condition:"",effect:"",
    cSchedules:[],description:""});
  const add=()=>onChange([...events,blank()]);
  const upd=(i,f,v)=>{const n=[...events];n[i]={...n[i],[f]:v};onChange(n);};
  const rem=(i)=>onChange(events.filter((_,idx)=>idx!==i));

  // cSchedules helpers
  const addSched=(i)=>{
    const n=[...events];
    n[i]={...n[i],cSchedules:[...(n[i].cSchedules||[]),
      {id:"cs"+Date.now(),eventId:"",dist:"ServerAttr",distParams:{attr:"serviceTime"},useEntityCtx:true}]};
    onChange(n);
  };
  const updSched=(i,j,patch)=>{
    const n=[...events];
    const s=[...n[i].cSchedules]; s[j]={...s[j],...patch};
    n[i]={...n[i],cSchedules:s}; onChange(n);
  };
  const remSched=(i,j)=>{
    const n=[...events];
    n[i]={...n[i],cSchedules:n[i].cSchedules.filter((_,idx)=>idx!==j)};
    onChange(n);
  };

  // templates that should never be in initial FEL (t>=900)
  const templateBEvents=bEvents.filter(b=>parseFloat(b.scheduledTime)>=900);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <SH label="C-Events  (Conditional — evaluated in Phase C)" color={C.cEvent}>
        <Btn small variant="ghost" onClick={add}>+ Add C-Event</Btn>
      </SH>
      <InfoBox color={C.cEvent}>
        <strong style={{color:C.cEvent}}>Condition tokens:</strong>{" "}
        <code>queue(Type).length</code> · <code>idle(Type).count</code> · <code>busy(Type).count</code> ·{" "}
        <code>attr(Type,attrName)</code> · <code>served</code> · <code>reneged</code><br/>
        <strong style={{color:C.cEvent}}>Effect — use ASSIGN only:</strong>{" "}
        <code>ASSIGN(CustomerType, ServerType)</code> — matches oldest waiting customer to idle server.<br/>
        <strong style={{color:C.green}}>B-event scheduling</strong> is defined below in the <em>Schedules</em> section —
        select the B-event, distribution, and whether to carry the matched entity context (customer + server IDs).
      </InfoBox>
      {events.length===0&&<Empty icon="🔀" msg="No C-events yet."/>}
      {events.map((ev,i)=>(
        <div key={ev.id} style={{background:C.bg,border:`1px solid ${C.cEvent}33`,
          borderLeft:`3px solid ${C.cEvent}`,borderRadius:6,padding:12,
          display:"flex",flexDirection:"column",gap:10}}>

          {/* Header row */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <Tag label="C-event" color={C.cEvent}/>
            <input value={ev.name} onChange={e=>upd(i,"name",e.target.value)}
              placeholder="Event name"
              style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,
              borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,
              padding:"5px 8px",outline:"none"}}/>
            <Btn small variant="danger" onClick={()=>rem(i)}>✕</Btn>
          </div>

          {/* Condition */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:72}}>condition:</span>
            <input value={ev.condition} onChange={e=>upd(i,"condition",e.target.value)}
              placeholder="queue(Customer).length > 0 AND idle(Server).count > 0"
              style={{flex:1,background:"transparent",border:`1px solid ${C.cEvent}66`,
              borderRadius:4,color:C.cEvent,fontFamily:FONT,fontSize:12,
              padding:"5px 8px",outline:"none"}}/>
          </div>

          {/* Effect — ASSIGN only */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:72}}>effect:</span>
            <input value={ev.effect} onChange={e=>upd(i,"effect",e.target.value)}
              placeholder="ASSIGN(Customer, Server)"
              style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,
              borderRadius:4,color:C.green,fontFamily:FONT,fontSize:12,
              padding:"5px 8px",outline:"none"}}/>
          </div>

          {/* Structured B-event schedules */}
          <div style={{background:C.surface,borderRadius:6,padding:12,
            border:`1px solid ${C.cEvent}22`,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,color:C.cEvent,fontFamily:FONT,
                letterSpacing:1.2,fontWeight:700}}>SCHEDULES B-EVENTS INTO FEL</span>
              <Btn small variant="ghost" onClick={()=>addSched(i)}>+ Add Schedule</Btn>
            </div>
            {(ev.cSchedules||[]).length===0&&(
              <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>
                No B-events scheduled. Add one to push a B-event into the FEL when this C-event fires.
              </span>
            )}
            {(ev.cSchedules||[]).map((s,j)=>{
              const distDef=DISTRIBUTIONS[s.dist||"ServerAttr"]||DISTRIBUTIONS.ServerAttr||DISTRIBUTIONS.Fixed;
              return (
                <div key={s.id||j} style={{background:C.bg,borderRadius:5,padding:"10px 12px",
                  border:`1px solid ${C.bEvent}33`,display:"flex",flexDirection:"column",gap:8}}>

                  {/* Row 1: B-event selector */}
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:60}}>B-event:</span>
                    <select value={s.eventId||""} onChange={e=>updSched(i,j,{eventId:e.target.value})}
                      style={{flex:1,background:C.bg,border:`1px solid ${C.bEvent}55`,borderRadius:4,
                      color:C.bEvent,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}>
                      <option value="">— select B-event to schedule —</option>
                      {bEvents.map(b=>(
                        <option key={b.id} value={b.id}>
                          {b.name}{parseFloat(b.scheduledTime)>=900?" (template)":""}
                        </option>
                      ))}
                    </select>
                    <Btn small variant="danger" onClick={()=>remSched(i,j)}>✕</Btn>
                  </div>

                  {/* Row 2: Delay distribution */}
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:60}}>delay via:</span>
                    <select value={s.dist||"ServerAttr"} onChange={e=>updSched(i,j,{dist:e.target.value,distParams:{}})}
                      style={{width:200,background:C.bg,border:`1px solid ${C.accent}55`,borderRadius:4,
                      color:C.accent,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}>
                      {Object.entries(DISTRIBUTIONS).map(([k,v])=>(
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    {/* Distribution params */}
                    {distDef.params.map(param=>(
                      <div key={param} style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>{param}:</span>
                        <input value={(s.distParams||{})[param]||""}
                          onChange={e=>updSched(i,j,{distParams:{...(s.distParams||{}),[param]:e.target.value}})}
                          style={{width:72,background:"transparent",border:`1px solid ${C.border}`,
                          borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,
                          padding:"3px 6px",outline:"none"}}/>
                      </div>
                    ))}
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic",flex:1}}>
                      {distDef.hint}
                    </span>
                  </div>

                  {/* Row 3: Entity context checkbox */}
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",
                      fontFamily:FONT,fontSize:11,color:s.useEntityCtx?C.purple:C.muted}}>
                      <input type="checkbox" checked={!!s.useEntityCtx}
                        onChange={e=>updSched(i,j,{useEntityCtx:e.target.checked})}
                        style={{accentColor:C.purple}}/>
                      Pass entity context (customer + server IDs) to scheduled B-event
                    </label>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>
                      Required for COMPLETE() to know which customer/server to mark done
                    </span>
                  </div>

                  {/* Preview of what will be scheduled */}
                  {s.eventId&&(
                    <div style={{background:C.panel,borderRadius:4,padding:"6px 10px",
                      fontSize:10,color:C.muted,fontFamily:FONT,lineHeight:1.7}}>
                      Will schedule: <strong style={{color:C.bEvent}}>
                        {bEvents.find(b=>b.id===s.eventId)?.name||s.eventId}
                      </strong> at <strong style={{color:C.amber}}>
                        clock + {s.dist==="ServerAttr"
                          ? `server.${s.distParams?.attr||"serviceTime"}`
                          : `sample(${s.dist||"Fixed"})`}
                      </strong>
                      {s.useEntityCtx&&<span style={{color:C.purple}}> · carrying cust+server IDs</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Note */}
          <input value={ev.description||""} onChange={e=>upd(i,"description",e.target.value)}
            placeholder="When and why this event fires"
            style={{background:"transparent",border:`1px solid ${C.border}40`,borderRadius:4,
            color:C.muted,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none",
            width:"100%",boxSizing:"border-box"}}/>
        </div>
      ))}
    </div>
  );
};

const ModelDetail=({modelId,onBack,onRefresh})=>{
  const [model,setModel]=useState(()=>DB.get(modelId));
  const [tab,setTab]=useState("overview");
  const [dirty,setDirty]=useState(false);
  const isOwner=DB.isOwner(modelId);
  const canEdit=DB.canEdit(modelId);
  const setField=(f,v)=>{setModel(m=>({...m,[f]:v}));setDirty(true);};
  const save=()=>{DB.save(model);setDirty(false);onRefresh();};

  const TABS=[
    {id:"overview",label:"Overview"},{id:"entities",label:"Entity Types"},
    {id:"state",label:"State Vars"},{id:"bevents",label:"B-Events"},
    {id:"cevents",label:"C-Events"},{id:"execute",label:"▶ Execute"},
    ...(isOwner?[{id:"access",label:"Access"}]:[]),
  ];

  if(!model)return null;
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
        {tab==="bevents"&&<div style={{maxWidth:880}}><BEventEditor events={model.bEvents||[]} onChange={canEdit?v=>setField("bEvents",v):()=>{}}/></div>}
        {tab==="cevents"&&<div style={{maxWidth:860}}><CEventEditor events={model.cEvents||[]} bEvents={model.bEvents||[]} onChange={canEdit?v=>setField("cEvents",v):()=>{}}/></div>}
        {tab==="execute"&&<div style={{maxWidth:1080}}><ExecutePanel model={model}/></div>}
        {tab==="access"&&isOwner&&(
          <div style={{maxWidth:480,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:8}}>
              <Btn variant={model.visibility==="private"?"primary":"ghost"} onClick={()=>{DB.setVisibility(modelId,"private");setModel({...DB.get(modelId)});onRefresh();}} small>🔒 Private</Btn>
              <Btn variant={model.visibility==="public"?"success":"ghost"} onClick={()=>{DB.setVisibility(modelId,"public");setModel({...DB.get(modelId)});onRefresh();}} small>🌐 Public</Btn>
            </div>
            {DB.allUsers().filter(u=>u.id!==model.owner).map(u=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <Avatar u={u} size={26}/>
                <span style={{flex:1,fontSize:12,color:C.text,fontFamily:FONT}}>{u.name}</span>
                <select value={model.access?.[u.id]||"none"} onChange={e=>{DB.setAccess(modelId,u.id,e.target.value);setModel({...DB.get(modelId)});}}
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
  const owner=DB.getUser(model.owner);
  const fmtDate=iso=>new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
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
  const create=()=>{if(!name.trim())return;const m=DB.save({name:name.trim(),description:desc.trim()});onCreate(m.id);onClose();};
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:28,width:420,fontFamily:FONT,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text}}>New DES Model</div>
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Queue with Reneging"/>
        <Field label="Description" value={desc} onChange={setDesc} multiline rows={3}/>
        <div style={{display:"flex",gap:10}}><Btn variant="ghost" onClick={onClose} full>Cancel</Btn><Btn variant="primary" onClick={create} disabled={!name.trim()} full>Create</Btn></div>
      </div>
    </div>
  );
};


export { EntityTypeEditor, StateVarEditor, BEventEditor, CEventEditor, ModelDetail, ModelCard, NewModelModal };
