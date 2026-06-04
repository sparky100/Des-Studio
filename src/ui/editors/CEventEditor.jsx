import { useState, useRef } from "react";
import { normTypeName } from "../shared/tokens.js";
import { Tag, Btn, CommitInput, SH, InfoBox, Empty, DistPicker } from "../shared/components.jsx";
import { ConditionBuilder, buildConditionStr } from "./ConditionBuilder.jsx";
import { EntityFilterBuilder } from "./EntityFilterBuilder.jsx";
import { EffectPicker, assignOptions, displayEventName, SectionFilterTabs, filterBySection } from "./helpers.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const CEventEditor=({events, onChange, bEvents=[], entityTypes=[], stateVariables=[], queues=[], sections=[], containerTypes=[]})=>{
  const { C, FONT } = useTheme();
  const [filterText,setFilterText]=useState("");
  const [expandedIds,setExpandedIds]=useState(new Set());
  const [activeSectionId,setActiveSectionId]=useState("all");

  const toggleExpand=(id)=>setExpandedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const expandAll=()=>setExpandedIds(new Set(events.map(e=>e.id)));
  const collapseAll=()=>setExpandedIds(new Set());

  const blank=()=>({id:"c"+Date.now(),name:"",condition:"",effect:"",
    cSchedules:[],description:"",priority:events.length+1});
  const add=()=>{
    const ev=blank();
    onChange([...events,ev]);
    setExpandedIds(prev=>new Set([...prev,ev.id]));
  };
  const upd=(i,f,v)=>{const n=[...events];n[i]={...n[i],[f]:v};onChange(n);};
  const commitName=(i,v)=>{
    if((events[i]?.name||"")===v) return;
    const n=[...events];
    n[i]={...n[i],name:v};
    onChange(n);
  };
  const rem=(i)=>{
    const remaining=events.filter((_,idx)=>idx!==i);
    onChange(remaining.map((ev,idx)=>({...ev,priority:idx+1})));
  };

  // Drag-to-reorder state
  const dragIdx=useRef(null);
  const [dragOverIdx,setDragOverIdx]=useState(null);

  const handleDrop=(targetIdx)=>{
    const from=dragIdx.current;
    if(from===null||from===targetIdx){dragIdx.current=null;setDragOverIdx(null);return;}
    const reordered=[...events];
    const [moved]=reordered.splice(from,1);
    reordered.splice(targetIdx,0,moved);
    onChange(reordered.map((ev,idx)=>({...ev,priority:idx+1})));
    dragIdx.current=null;
    setDragOverIdx(null);
  };

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

  const lcFilter=filterText.toLowerCase();
  const sectionFiltered=filterBySection(events, sections, activeSectionId);
  const filtered=lcFilter?sectionFiltered.filter(ev=>(ev.name||"").toLowerCase().includes(lcFilter)):sectionFiltered;
  const effectiveExpanded=lcFilter?new Set(filtered.map(e=>e.id)):expandedIds;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <SH label="C-Events  (Conditional — evaluated in Phase C)" color={C.cEvent}>
        <Btn small variant="ghost" onClick={add}>+ Add C-Event</Btn>
      </SH>
      <SectionFilterTabs sections={sections} activeId={activeSectionId} onChange={setActiveSectionId}/>
      {events.length>1&&(
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Filter by name…"
            style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none"}}/>
          <Btn small variant="ghost" onClick={expandAll}>Expand all</Btn>
          <Btn small variant="ghost" onClick={collapseAll}>Collapse all</Btn>
        </div>
      )}
      <InfoBox color={C.cEvent}>
        <strong style={{color:C.cEvent}}>Conditions:</strong>{" "}
        <code>queue(Type).length</code> · <code>idle(Type).count</code> · <code>busy(Type).count</code> ·{" "}
        <code>attr(Type,attrName)</code> · <code>served</code> · <code>reneged</code><br/>
        <strong style={{color:C.cEvent}}>Service-start effects</strong> match a queued entity to an idle resource.{" "}
        <strong>Scalar effects</strong> also supported: <code>VAR++</code> · <code>VAR--</code> · <code>VAR += N</code> · <code>VAR = value</code><br/>
        <strong style={{color:C.green}}>B-event scheduling</strong> is defined below in the <em>Schedules</em> section —
        select the B-event, distribution, and whether to carry the matched entity context (customer + server IDs).
      </InfoBox>
      {events.length===0&&<Empty icon="🔀" msg="No C-events yet."/>}
      {filtered.length===0&&events.length>0&&(
        <div style={{fontFamily:FONT,fontSize:11,color:C.muted,padding:"8px 0",fontStyle:"italic"}}>No events match "{filterText}"</div>
      )}
      {filtered.map((ev)=>{
        const i=events.findIndex(e=>e.id===ev.id);
        if(i===-1)return null;
        const isExpanded=effectiveExpanded.has(ev.id);
        const condSummary=typeof ev.condition==='string'&&ev.condition.trim()
          ?(ev.condition.length>30?ev.condition.slice(0,28)+"…":ev.condition)
          :"no condition";

        return (
          <div key={ev.id}
            style={{background:C.bg,
              border:`1px solid ${dragOverIdx===i?C.cEvent:C.cEvent+'33'}`,
              borderLeft:`3px solid ${C.cEvent}`,borderRadius:6,padding:12,
              display:"flex",flexDirection:"column",gap:10,
              transition:'border-color 0.1s'}}
            onDragOver={e=>{if(!lcFilter){e.preventDefault();e.dataTransfer.dropEffect='move';setDragOverIdx(i);}}}
            onDragLeave={()=>setDragOverIdx(null)}
            onDrop={e=>{e.preventDefault();if(!lcFilter)handleDrop(i);}}
            onDragEnd={()=>{dragIdx.current=null;setDragOverIdx(null);}}>

            {/* Header row */}
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>toggleExpand(ev.id)}
                style={{background:"none",border:"none",cursor:"pointer",padding:"2px 3px",color:isExpanded?C.cEvent:C.muted,fontFamily:FONT,fontSize:11,lineHeight:1,flexShrink:0}}
                aria-label={isExpanded?"Collapse":"Expand"}>{isExpanded?"▾":"▸"}</button>
              {/* Priority badge — drag grip (only when not filtering) */}
              {!lcFilter&&(
                <div
                  draggable="true"
                  onDragStart={e=>{dragIdx.current=i;e.dataTransfer.effectAllowed='move';}}
                  title="Drag to reorder"
                  style={{cursor:'grab',userSelect:'none',flexShrink:0,display:'flex',alignItems:'center'}}>
                  <span aria-label={`Priority ${ev.priority||i+1}`} style={{
                    background:C.cEvent+'22',border:`1px solid ${C.cEvent}55`,
                    borderRadius:4,color:C.cEvent,fontFamily:FONT,
                    fontSize:11,fontWeight:700,padding:'3px 8px',
                    minWidth:32,textAlign:'center',display:'inline-block',
                  }}>P{ev.priority||i+1}</span>
                </div>
              )}
              <Tag label="C-event" color={C.cEvent}/>
              <CommitInput value={ev.name} onCommit={value=>commitName(i,value)}
                placeholder="Event name"
                style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,
                borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,
                padding:"5px 8px",outline:"none"}}/>
              {!isExpanded&&(
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,background:`${C.cEvent}18`,borderRadius:3,padding:"2px 6px",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{condSummary}</span>
              )}
              <Btn small variant="danger" ariaLabel={`Remove C-event ${ev.name || i + 1}`} onClick={()=>rem(i)}>✕</Btn>
            </div>

            {isExpanded&&<>
              {/* Condition */}
              <div style={{display:"flex",flexDirection:'column',gap:6}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>CONDITION</span>
                <ConditionBuilder
                  value={ev.condition}
                  onChange={v=>upd(i,'condition',v)}
                  entityTypes={entityTypes}
                  stateVariables={stateVariables}
                  queues={queues}
                />
              </div>

              {/* Entity Filter (optional) */}
              <div style={{display:"flex",flexDirection:'column',gap:6}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>ENTITY FILTER</span>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>optional — restricts which entities from the queue SEIZE can match</span>
                </div>
                <EntityFilterBuilder
                  entityTypes={entityTypes}
                  value={ev.entityFilter||null}
                  onChange={v=>upd(i,'entityFilter',v)}
                />
              </div>

              {/* Effects */}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>EFFECTS</span>
                <EffectPicker
                  effects={Array.isArray(ev.effect) ? ev.effect.filter(Boolean) : (ev.effect ? ev.effect.split(';').map(s=>s.trim()).filter(Boolean) : [])}
                  options={assignOptions(entityTypes, stateVariables, queues, ev.name, containerTypes)}
                  onChange={arr=>upd(i,'effect',arr)}
                />
              </div>

              {/* Structured B-event schedules */}
              <div style={{background:C.surface,borderRadius:6,padding:12,
                border:`1px solid ${C.cEvent}22`,display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,color:C.cEvent,fontFamily:FONT,
                    letterSpacing:1.2,fontWeight:700}}>Schedule Follow-on Event</span>
                  <Btn small variant="ghost" onClick={()=>addSched(i)}>+ Add Schedule</Btn>
                </div>
                {(ev.cSchedules||[]).length===0&&(
                  <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>
                    No B-events scheduled. Add one to push a B-event into the FEL when this C-event fires.
                  </span>
                )}
                {(ev.cSchedules||[]).map((s,j)=>{
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
                              {displayEventName(b.name)||b.id}
                            </option>
                          ))}
                        </select>
                        <Btn small variant="danger" ariaLabel={`Remove C-event schedule ${j + 1}`} onClick={()=>remSched(i,j)}>✕</Btn>
                      </div>

                      {/* Row 2: Delay distribution */}
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:60}}>delay via:</span>
                        <DistPicker value={{dist:s.dist||"ServerAttr",distParams:s.distParams||{attr:"serviceTime"}}}
                          onChange={v=>updSched(i,j,{dist:v.dist,distParams:v.distParams})} compact/>
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

                      {/* Row 4: Conditional (when) */}
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",
                          fontFamily:FONT,fontSize:11,color:s.when?C.amber:C.muted}}>
                          <input type="checkbox" checked={!!s.when}
                            onChange={e=>updSched(i,j,{when:e.target.checked?{variable:"Entity.surgery_type",operator:"==",value:""}:null})}
                            style={{accentColor:C.amber}}/>
                          Only fire when entity attribute matches (first-match wins across all entries)
                        </label>
                        {s.when&&(
                          <EntityFilterBuilder
                            value={s.when}
                            entityTypes={entityTypes}
                            onChange={p=>updSched(i,j,{when:p||null})}/>
                        )}
                        {!s.when&&(ev.cSchedules||[]).some(x=>x.when)&&(
                          <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>
                            (no condition — this entry is the fallback)
                          </span>
                        )}
                      </div>

                      {/* Preview of what will be scheduled */}
                      {s.eventId&&(
                        <div style={{background:C.panel,borderRadius:4,padding:"6px 10px",
                          fontSize:10,color:C.muted,fontFamily:FONT,lineHeight:1.7}}>
                          Will schedule: <strong style={{color:C.bEvent}}>
                            {displayEventName(bEvents.find(b=>b.id===s.eventId)?.name)||s.eventId}
                          </strong> at <strong style={{color:C.amber}}>
                            clock + {s.dist==="ServerAttr"
                              ? `server.${s.distParams?.attr||"serviceTime"}`
                              : s.dist==="EntityAttr"
                              ? `entity.${s.distParams?.attr||"serviceTime"}`
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
            </>}
          </div>
        );
      })}
    </div>
  );
};

export { CEventEditor };
