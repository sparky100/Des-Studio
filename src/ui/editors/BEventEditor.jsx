import { useState, useEffect, useRef } from "react";
import { Tag, Btn, CommitInput, Field, SH, InfoBox, Empty, DistPicker, SectionPanel } from "../shared/components.jsx";
import { displayEventName, queueDisplayName, bEffectOptions, DropField, EffectPicker, SectionFilterTabs, filterBySection } from "./helpers.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

const BEventEditor=({events,onChange,entityTypes=[],stateVariables=[],queues=[],cEvents=[],sections=[],containerTypes=[],dataSources=[],epoch,timeUnit,namedSchedules=[],focusBEventId=null,onFocusHandled,onGoToSchedule,errorFilter=null,onClearErrorFilter})=>{
  const { C, FONT } = useTheme();
  const [filterText,setFilterText]=useState("");
  const [expandedIds,setExpandedIds]=useState(new Set());
  const [activeSectionId,setActiveSectionId]=useState("all");
  const cardRefs=useRef({});

  useEffect(()=>{
    if(!focusBEventId)return;
    setExpandedIds(prev=>new Set([...prev,focusBEventId]));
    setFilterText("");
    setTimeout(()=>{
      cardRefs.current[focusBEventId]?.scrollIntoView({behavior:"smooth",block:"start"});
      onFocusHandled?.();
    },80);
  },[focusBEventId]);

  const toggleExpand=(id)=>setExpandedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const expandAll=()=>setExpandedIds(new Set(events.map(e=>e.id)));
  const collapseAll=()=>setExpandedIds(new Set());

  const add=()=>{
    const id="b"+Date.now();
    onChange([...events,{id,name:"",scheduledTime:"0",effect:[],schedules:[],description:""}]);
    setExpandedIds(prev=>new Set([...prev,id]));
  };
  const upd=(i,f,v)=>{const n=[...events];n[i]={...n[i],[f]:v};onChange(n);};
  const commitName=(i,v)=>{
    if((events[i]?.name||"")===v) return;
    const n=[...events];
    n[i]={...n[i],name:v};
    onChange(n);
  };
  const rem=(i)=>{
    const ev=events[i];
    const refs=cEvents.filter(c=>(c.cSchedules||[]).some(s=>s.eventId===ev.id));
    if(refs.length>0){
      const names=refs.map(c=>`'${c.name||c.id}'`).join(', ');
      if(!window.confirm(`B-Event '${ev.name||ev.id}' is referenced by C-Event${refs.length>1?'s':''} ${names}.\n\nDeleting it will leave a stale reference. Delete anyway?`))return;
    }
    onChange(events.filter((_,idx)=>idx!==i));
  };
  const addS=(i)=>{const n=[...events];n[i]={...n[i],schedules:[...(n[i].schedules||[]),{eventId:"",dist:"Exponential",distParams:{mean:"1"},isRenege:false}]};onChange(n);};
  const updS=(i,j,p)=>{const n=[...events];const s=[...n[i].schedules];s[j]={...s[j],...p};n[i]={...n[i],schedules:s};onChange(n);};
  const remS=(i,j)=>{const n=[...events];n[i]={...n[i],schedules:n[i].schedules.filter((_,idx)=>idx!==j)};onChange(n);};

  const lcFilter=filterText.toLowerCase();
  const sectionFiltered=filterBySection(events, sections, activeSectionId);
  const filteredEventIds=errorFilter?.filteredEventIds;
  const filtered=sectionFiltered.filter(ev=>{
    const matchesText=!lcFilter||(ev.name||"").toLowerCase().includes(lcFilter);
    const matchesError=!filteredEventIds||filteredEventIds.includes(ev.id);
    return matchesText&&matchesError;
  });
  const effectiveExpanded=(lcFilter||filteredEventIds)?new Set(filtered.map(e=>e.id)):expandedIds;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS}}>B-Events</div>
          <div style={{fontSize:12,color:C.muted,fontFamily:SANS,marginTop:2}}>Timed events scheduled at specific simulation times</div>
        </div>
        <Btn variant="primary" onClick={add}>+ Add B-Event</Btn>
      </div>
      <SectionFilterTabs sections={sections} activeId={activeSectionId} onChange={setActiveSectionId}/>
      {events.length>1&&(
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Filter by name…"
            style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none"}}/>
          {filteredEventIds&&(
            <div style={{display:"flex",alignItems:"center",gap:4,background:`${C.amber}26`,border:`1px solid ${C.amber}80`,borderRadius:4,padding:"3px 8px",color:C.amber,fontSize:11,fontFamily:FONT,whiteSpace:"nowrap"}}>
              Filtered by error
              <Btn small variant="ghost" onClick={onClearErrorFilter} style={{padding:"0 4px",minWidth:0}}>✕</Btn>
            </div>
          )}
          <Btn small variant="ghost" onClick={expandAll}>Expand all</Btn>
          <Btn small variant="ghost" onClick={collapseAll}>Collapse all</Btn>
        </div>
      )}
      <InfoBox color={C.bEvent}>
        <strong style={{color:C.bEvent}}>Arrivals</strong> add an entity to an explicit queue.{" "}
        <strong style={{color:C.bEvent}}>Completion</strong> releases the matched resource and either routes the entity onward or marks it complete.{" "}
        Follow-on completion and reneging events are scheduled by another event, so leave them unticked for simulation start.
      </InfoBox>
      {events.length===0&&(
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px 24px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{fontSize:32,lineHeight:1}}>⏰</div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:SANS}}>No timed events yet</div>
          <div style={{fontSize:13,color:C.muted,fontFamily:SANS,lineHeight:1.6,maxWidth:380}}>Add an arrival or completion event that fires at a scheduled point in simulation time.</div>
          <Btn variant="primary" onClick={add}>+ Add B-Event</Btn>
        </div>
      )}
      {filtered.length===0&&events.length>0&&(
        <div style={{fontFamily:FONT,fontSize:11,color:C.muted,padding:"8px 0",fontStyle:"italic"}}>No events match "{filterText}"</div>
      )}
      {filtered.map((ev)=>{
        const i=events.findIndex(e=>e.id===ev.id);
        if(i===-1)return null;
        const isExpanded=effectiveExpanded.has(ev.id);

        const isTmpl=parseFloat(ev.scheduledTime)>=900;
        const isStart=parseFloat(ev.scheduledTime)===0;
        const showTimeInput=!isStart&&!isTmpl;
        const effects=Array.isArray(ev.effect)?ev.effect:(ev.effect?[ev.effect]:[]);
        const updEffects=(newEffects)=>{const n=[...events];n[i]={...n[i],effect:newEffects};onChange(n);};
        const updBalk=(f,v)=>{const n=[...events];n[i]={...n[i],[f]:v===''||v===null?undefined:v};onChange(n);};
        const hasRelease=effects.some(eff=>typeof eff==='string'&&/^RELEASE\s*\(/i.test(eff));
        const hasArriveEffect=effects.some(eff=>typeof eff==='string'&&/^ARRIVE\s*\(/i.test(eff));
        const hasRouting=Array.isArray(ev.routing) && ev.routing.some(row=>String(row?.condition?.variable||row?.condition?.token||row?.condition?.left||"").trim()!=="");
        const hasProb=Array.isArray(ev.probabilisticRouting) && ev.probabilisticRouting.length>0;
        const routingMode=hasRouting?"conditional":hasProb?"probabilistic":"none";
        const routingEntityAttrs=entityTypes.filter(et=>et.role!=="server").flatMap(et=>(et.attrDefs||et.attrs||[]).map(a=>`Entity.${a.name||a}`)).filter(Boolean);
        const setRoutingMode=(mode)=>{
          const n=[...events];
          const{routing:_r,defaultQueueName:_d,probabilisticRouting:_pr,...rest}=n[i];
          const cleanEff=effects.map(eff=>typeof eff==='string'?eff.replace(/^(RELEASE\s*\([^,)]+),\s*[^)]+\)/i,'$1)'):eff);
          if(mode==="conditional") n[i]={...rest,routing:[],defaultQueueName:'',effect:cleanEff};
          else if(mode==="probabilistic") n[i]={...rest,probabilisticRouting:[{probability:1,queueName:''}],effect:cleanEff};
          else n[i]={...rest};
          onChange(n);
        };
        const addRoutingRow=()=>{const n=[...events];const r=[...(n[i].routing||[])];r.push({condition:{variable:'',operator:'==',value:''},queueName:''});n[i]={...n[i],routing:r};onChange(n);};
        const updRoutingRow=(j,p)=>{const n=[...events];const r=[...n[i].routing];r[j]={...r[j],...p};n[i]={...n[i],routing:r};onChange(n);};
        const remRoutingRow=(j)=>{const n=[...events];n[i]={...n[i],routing:n[i].routing.filter((_,idx)=>idx!==j)};onChange(n);};
        const addProbRow=()=>{const n=[...events];const pr=[...(n[i].probabilisticRouting||[])];pr.push({probability:0,queueName:''});n[i]={...n[i],probabilisticRouting:pr};onChange(n);};
        const updProbRow=(j,p)=>{const n=[...events];const pr=[...n[i].probabilisticRouting];pr[j]={...pr[j],...p};n[i]={...n[i],probabilisticRouting:pr};onChange(n);};
        const remProbRow=(j)=>{const n=[...events];n[i]={...n[i],probabilisticRouting:n[i].probabilisticRouting.filter((_,idx)=>idx!==j)};onChange(n);};
        const probTotal=parseFloat(((ev.probabilisticRouting||[]).reduce((s,b)=>s+(parseFloat(b.probability)||0),0)).toFixed(4));

        const loopEnabled=!!(ev.loopConfig);
        const toggleLoop=(on)=>{
          const n=[...events];
          n[i]=on?{...n[i],loopConfig:{maxLoopCount:3,exitQueueName:""}}:{...n[i],loopConfig:undefined};
          onChange(n);
        };
        const updLoop=(f,v)=>{const n=[...events];n[i]={...n[i],loopConfig:{...n[i].loopConfig,[f]:v}};onChange(n);};

        const hasBalkProb=ev.balkProbability!=null&&ev.balkProbability!==""&&!isNaN(ev.balkProbability);
        const hasBalkCond=!!(ev.balkCondition);
        const balkMode=hasBalkCond?"condition":hasBalkProb?"probability":"none";
        const setBalkMode=(mode)=>{
          const n=[...events];
          const{balkProbability:_p,balkCondition:_c,...rest}=n[i];
          if(mode==="probability") n[i]={...rest,balkProbability:0.1};
          else if(mode==="condition") n[i]={...rest,balkCondition:{variable:'',operator:'>',value:0}};
          else n[i]={...rest};
          onChange(n);
        };

        const schedStatus=String((ev.schedules||[]).length||"0");
        const routingStatus=routingMode==="none"?"off":routingMode;
        const balkStatus=balkMode==="none"?"off":balkMode==="probability"?`prob ${Math.round((ev.balkProbability||0)*100)}%`:"condition";
        const loopStatus=loopEnabled?`max ${ev.loopConfig?.maxLoopCount||"?"}x`:"off";

        const effectSummary=effects.length===0?"no effects":effects.length===1?(effects[0].match(/^\w+/)?.[0]||"effect"):`${effects.length} effects`;

        return (
          <div key={ev.id} ref={el=>cardRefs.current[ev.id]=el} style={{background:C.bg,border:`1px solid ${isTmpl?C.muted+"44":C.bEvent+"33"}`,
            borderLeft:`3px solid ${isTmpl?C.muted:C.bEvent}`,borderRadius:6,padding:12,display:"flex",flexDirection:"column",gap:8}}>

            {/* Header */}
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <button onClick={()=>toggleExpand(ev.id)}
                style={{background:"none",border:"none",cursor:"pointer",padding:"2px 3px",color:isExpanded?C.bEvent:C.muted,fontFamily:FONT,fontSize:11,lineHeight:1,flexShrink:0}}
                aria-label={isExpanded?"Collapse":"Expand"}>{isExpanded?"▾":"▸"}</button>
              <Tag label={isTmpl?"scheduled follow-on":"B-event"} color={isTmpl?C.muted:C.bEvent}/>
              <CommitInput value={ev.name} onCommit={value=>commitName(i,value)} placeholder="Event name"
                style={{flex:1,minWidth:130,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
              {!isExpanded&&(
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,background:`${C.bEvent}18`,borderRadius:3,padding:"2px 6px"}}>{effectSummary}</span>
              )}
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Behavior:</span>
                <select value={isStart?"start":isTmpl?"scheduled":"time"}
                  onChange={e=>{const v=e.target.value;if(v==="start")upd(i,"scheduledTime","0");else if(v==="scheduled")upd(i,"scheduledTime","9999");else upd(i,"scheduledTime","1");}}
                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
                  <option value="start">Fire at start</option>
                  <option value="scheduled">Scheduled follow-on</option>
                  <option value="time">Specific time (t=)</option>
                </select>
              </div>
              {showTimeInput&&(
                <input value={ev.scheduledTime} type="number" step="0.5" onChange={e=>upd(i,"scheduledTime",e.target.value)}
                  style={{width:65,background:"transparent",border:`1px solid ${C.bEvent+"66"}`,borderRadius:4,color:C.bEvent,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
              )}
              <Btn small variant="danger" ariaLabel={`Remove B-event ${ev.name||i+1}`} onClick={()=>rem(i)}>✕</Btn>
            </div>

            {isExpanded&&<>
              {/* Effects — chip picker */}
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1}}>EFFECTS</span>
                <EffectPicker
                  effects={effects}
                  options={bEffectOptions(entityTypes,queues,stateVariables,containerTypes)}
                  expressionContext={{
                    stateVars: (stateVariables||[]).map(sv=>sv.name).filter(Boolean),
                    attrs: (entityTypes||[]).filter(e=>e.role==='customer').flatMap(et=>(et.attrDefs||[]).filter(a=>a.mutable!==false).map(a=>a.name).filter(Boolean))
                  }}
                  onChange={updEffects}
                />
              </div>

              {/* Routing — collapsible, shown only when a RELEASE effect is present */}
              {hasRelease&&(
                <SectionPanel label="Release Routing" status={routingStatus} color={C.bEvent}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Mode:</span>
                    <select value={routingMode} onChange={e=>setRoutingMode(e.target.value)}
                      style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
                      <option value="none">Single queue (no routing)</option>
                      <option value="conditional">Conditional routing</option>
                      <option value="probabilistic">Probabilistic routing</option>
                    </select>
                  </div>
                  {routingMode==="conditional"&&(<>
                    {(ev.routing||[]).map((row,j)=>(
                      <div key={j} style={{background:C.bg,borderRadius:4,padding:"8px 10px",border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>IF</span>
                          <select value={row.condition?.variable||""} onChange={e=>updRoutingRow(j,{condition:{...row.condition,variable:e.target.value}})}
                            style={{flex:1,minWidth:110,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 6px",outline:"none"}}>
                            <option value="">— attribute —</option>
                            {routingEntityAttrs.map(a=><option key={a} value={a}>{a}</option>)}
                          </select>
                          <select value={row.condition?.operator||"=="} onChange={e=>updRoutingRow(j,{condition:{...row.condition,operator:e.target.value}})}
                            style={{width:52,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 3px",outline:"none"}}>
                            {["==","!=","<",">","<=",">="].map(op=><option key={op} value={op}>{op}</option>)}
                          </select>
                          <input value={row.condition?.value||""} onChange={e=>updRoutingRow(j,{condition:{...row.condition,value:e.target.value}})} placeholder="value"
                            style={{width:80,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:"4px 6px",outline:"none"}}/>
                          <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>→</span>
                          <select value={row.queueName||""} onChange={e=>updRoutingRow(j,{queueName:e.target.value})}
                            style={{flex:1,minWidth:100,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 6px",outline:"none"}}>
                            <option value="">— queue —</option>
                            {queues.map(q=><option key={q.id||q.name} value={q.name}>{q.name}</option>)}
                          </select>
                          <Btn small variant="danger" ariaLabel={`Remove routing row ${j+1}`} onClick={()=>remRoutingRow(j)}>✕</Btn>
                        </div>
                      </div>
                    ))}
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:FONT,whiteSpace:"nowrap"}}>FALLBACK →</span>
                      <select value={ev.defaultQueueName||""} onChange={e=>upd(i,"defaultQueueName",e.target.value)}
                        style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
                        <option value="">— required fallback queue —</option>
                        {queues.map(q=><option key={q.id||q.name} value={q.name}>{q.name}</option>)}
                      </select>
                    </div>
                    <Btn small variant="ghost" onClick={addRoutingRow}>+ Add condition</Btn>
                  </>)}
                  {routingMode==="probabilistic"&&(<>
                    {(ev.probabilisticRouting||[]).map((row,j)=>(
                      <div key={j} style={{background:C.bg,borderRadius:4,padding:"8px 10px",border:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        <input value={row.probability} type="number" min="0" max="1" step="0.01" onChange={e=>updProbRow(j,{probability:parseFloat(e.target.value)||0})} aria-label={`Probability for route ${j+1}`}
                          style={{width:70,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:"4px 6px",outline:"none"}}/>
                        <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>→</span>
                        <select
                          value={row.queueName == null ? "__EXIT__" : (row.queueName || "")}
                          onChange={e => updProbRow(j, { queueName: e.target.value === "__EXIT__" ? null : e.target.value })}
                          style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:row.queueName == null ? C.green : C.text,fontFamily:FONT,fontSize:11,padding:"4px 6px",outline:"none"}}>
                          <option value="">— queue —</option>
                          <option value="__EXIT__">Exit system (discharge)</option>
                          {queues.map(q=><option key={q.id||q.name} value={q.name}>{q.name}</option>)}
                        </select>
                        <Btn small variant="danger" ariaLabel={`Remove probabilistic row ${j+1}`} onClick={()=>remProbRow(j)}>✕</Btn>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <Btn small variant="ghost" onClick={addProbRow}>+ Add branch</Btn>
                      <span style={{fontSize:11,fontFamily:FONT,fontWeight:700,color:Math.abs(probTotal-1)>0.001?C.red:C.green}}>
                        Total: {probTotal.toFixed(3)}{Math.abs(probTotal-1)>0.001?" ≠ 1.0 ✗":" ✓"}
                      </span>
                    </div>
                    {(ev.probabilisticRouting||[]).some(r=>r.queueName==null)&&(
                      <div style={{fontSize:10,color:C.muted,fontFamily:FONT,lineHeight:1.6,padding:"4px 2px"}}>
                        Use <strong style={{color:C.text}}>RELEASE()</strong> in Effects to free the server — the exit branch counts patients as served automatically. Do not add COMPLETE() here; it has no effect after RELEASE().
                      </div>
                    )}
                  </>)}
                </SectionPanel>
              )}

              {/* Balking — collapsible, shown only for arrival events */}
              {hasArriveEffect&&(
                <SectionPanel label="Balking" status={balkStatus} color={C.amber}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Mode:</span>
                    <select value={balkMode} onChange={e=>setBalkMode(e.target.value)}
                      style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
                      <option value="none">No balking</option>
                      <option value="probability">Probability-based</option>
                      <option value="condition">Condition-based</option>
                    </select>
                  </div>
                  {balkMode==="probability"&&(<>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>Balk probability (0–1):</span>
                      <input aria-label="Balk probability" type="number" min="0" max="1" step="0.01"
                        value={ev.balkProbability??''} onChange={e=>updBalk('balkProbability',e.target.value===''?null:parseFloat(e.target.value))}
                        placeholder="e.g. 0.2"
                        style={{width:100,background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:'4px 8px',outline:'none'}}/>
                    </div>
                    {ev.balkProbability>0&&(
                      <div style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>
                        {Math.round(ev.balkProbability*100)}% of arrivals decline to join the queue.
                      </div>
                    )}
                  </>)}
                  {balkMode==="condition"&&(()=>{
                    const bc=typeof ev.balkCondition==='object'&&ev.balkCondition!==null?ev.balkCondition:{variable:'',operator:'>',value:0};
                    const updBc=(patch)=>updBalk('balkCondition',{...bc,...patch});
                    const balkVars=[
                      ...queues.map(q=>({label:`Queue.${q.name}.length`,value:`Queue.${q.name}.length`})),
                      ...stateVariables.filter(sv=>sv.name).map(sv=>({label:sv.name,value:sv.name})),
                    ];
                    const selSt={background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:'4px 6px',outline:'none'};
                    return(<>
                    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>IF</span>
                      <select value={bc.variable||''} onChange={e=>updBc({variable:e.target.value})} style={{...selSt,flex:1,minWidth:140}}>
                        <option value=''>— variable —</option>
                        {balkVars.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}
                      </select>
                      <select value={bc.operator||'>'} onChange={e=>updBc({operator:e.target.value})} style={{...selSt,width:52}}>
                        {['==','!=','<','>','<=','>='].map(op=><option key={op} value={op}>{op}</option>)}
                      </select>
                      <input type="number" value={bc.value??''} onChange={e=>updBc({value:e.target.value===''?0:Number(e.target.value)})}
                        style={{width:70,background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:'4px 6px',outline:'none'}}/>
                    </div>
                    <div style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>
                      Entity skips the queue on arrival when this condition is true.
                    </div>
                    </>);
                  })()}
                </SectionPanel>
              )}

              {/* Loop Guard — collapsible */}
              <SectionPanel label="Loop Guard" status={loopStatus} color={C.purple}>
                <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',
                  fontFamily:FONT,fontSize:11,color:loopEnabled?C.purple:C.muted}}>
                  <input type="checkbox" checked={loopEnabled} onChange={e=>toggleLoop(e.target.checked)}
                    style={{accentColor:C.purple}}/>
                  Limit entity recirculations
                </label>
                {loopEnabled&&(<>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Max loops:</span>
                    <input type="number" min="1" step="1"
                      value={ev.loopConfig?.maxLoopCount||""}
                      onChange={e=>updLoop('maxLoopCount',parseInt(e.target.value)||1)}
                      placeholder="3"
                      style={{width:70,background:'transparent',border:`1px solid ${C.purple}55`,borderRadius:4,color:C.purple,fontFamily:FONT,fontSize:11,padding:'4px 8px',outline:'none'}}/>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Exit to:</span>
                    <select value={ev.loopConfig?.exitQueueName||""}
                      onChange={e=>updLoop('exitQueueName',e.target.value)}
                      style={{flex:1,background:C.bg,border:`1px solid ${C.purple}55`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:'4px 8px',outline:'none'}}>
                      <option value="">exit system (entity discarded)</option>
                      {queues.map(q=><option key={q.id||q.name} value={q.name}>{q.name}</option>)}
                    </select>
                  </div>
                  <div style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>
                    After {ev.loopConfig?.maxLoopCount||"N"} loops the entity is routed to the exit queue (or removed) instead of recirculating.
                  </div>
                </>)}
              </SectionPanel>

              {/* Schedules — collapsible */}
              <SectionPanel label="Schedules — Follow-on B-Events" status={schedStatus} color={C.bEvent}>
                <div style={{display:"flex",justifyContent:"flex-end"}}>
                  <Btn small variant="ghost" onClick={()=>addS(i)}>+ Schedule</Btn>
                </div>
                {(ev.schedules||[]).length===0&&(
                  <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>
                    None. Add a schedule to chain a follow-on B-event from this one.
                  </span>
                )}
                {(ev.schedules||[]).map((s,j)=>(
                  <div key={j} style={{background:C.bg,borderRadius:5,padding:"10px 12px",border:`1px solid ${s.isRenege?C.reneged+"44":C.border}40`,display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <select value={s.eventId} onChange={e=>updS(i,j,{eventId:e.target.value})}
                        style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
                        <option value="">— select B-event —</option>
                        {events.map(b=><option key={b.id} value={b.id}>{displayEventName(b.name)||b.id}</option>)}
                      </select>
                      <Btn small variant="danger" ariaLabel={`Remove B-event schedule ${j+1}`} onClick={()=>remS(i,j)}>✕</Btn>
                    </div>
                    {s.scheduleRef ? (
                      <>
                        <div
                          onClick={()=>onGoToSchedule?.(s.scheduleRef)}
                          style={{background:`${C.green}12`,border:`1px solid ${C.green}44`,borderRadius:5,padding:"8px 12px",display:"flex",alignItems:"center",gap:10,cursor:onGoToSchedule?"pointer":"default"}}
                          title={onGoToSchedule?"Go to schedule":""}
                        >
                          <span style={{fontSize:16,lineHeight:1}}>📅</span>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,color:C.green,fontFamily:FONT,fontWeight:700,textDecoration:onGoToSchedule?"underline dotted":"none"}}>
                              {namedSchedules.find(ns=>ns.id===s.scheduleRef)?.name ?? "Named schedule"}
                            </div>
                            <div style={{fontSize:10,color:C.muted,fontFamily:FONT,marginTop:2}}>Arrival times driven by this timetable.{onGoToSchedule?" Click to open in Schedules tab.":""}</div>
                          </div>
                          {onGoToSchedule&&<span style={{fontSize:14,color:C.green,opacity:0.7}}>→</span>}
                        </div>
                        {/* Jitter — applies random offset to each planned arrival time */}
                        {(()=>{
                          const jd=s.distParams?.jitterDist||"";
                          const jp=s.distParams?.jitterParams||{};
                          const updJitter=p=>updS(i,j,{distParams:{...s.distParams,...p}});
                          const selSt={fontSize:11,fontFamily:FONT,background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 6px"};
                          const inpSt={fontSize:11,fontFamily:FONT,background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 5px",width:60};
                          return (
                            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:6}}>
                              <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:36}}>Jitter:</span>
                              <select value={jd} style={selSt}
                                onChange={e=>updJitter({jitterDist:e.target.value,jitterParams:{}})}>
                                <option value="">None</option>
                                <option value="Normal">Normal (symmetric ±)</option>
                                <option value="Uniform">Uniform (min to max)</option>
                              </select>
                              {jd==="Normal"&&(
                                <label style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>stddev:</span>
                                  <input type="number" value={jp.stddev||""} style={inpSt}
                                    onChange={e=>updJitter({jitterParams:{...jp,stddev:e.target.value}})}/>
                                </label>
                              )}
                              {jd==="Uniform"&&(<>
                                <label style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>min:</span>
                                  <input type="number" value={jp.min||""} style={inpSt}
                                    onChange={e=>updJitter({jitterParams:{...jp,min:e.target.value}})}/>
                                </label>
                                <label style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>max:</span>
                                  <input type="number" value={jp.max||""} style={inpSt}
                                    onChange={e=>updJitter({jitterParams:{...jp,max:e.target.value}})}/>
                                </label>
                              </>)}
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <>
                        {s.rows?.length>0&&!s.dist&&onGoToSchedule&&(
                          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:2}}>
                            <button onClick={()=>onGoToSchedule(null)}
                              style={{background:"none",border:`1px solid ${C.border}`,borderRadius:4,cursor:"pointer",padding:"3px 8px",fontSize:10,color:C.muted,fontFamily:FONT}}>
                              Move to named schedule →
                            </button>
                          </div>
                        )}
                        <DistPicker
                          value={s.rows?.length>0&&!s.dist
                            ?{dist:"Schedule",distParams:{rows:s.rows}}
                            :{dist:s.dist,distParams:s.distParams}}
                          onChange={v=>updS(i,j,{dist:v.dist,distParams:v.distParams,rows:undefined})} compact
                          attrDefs={(()=>{const arrM=(Array.isArray(ev.effect)?ev.effect.join(";"):ev.effect||"").match(/ARRIVE\s*\(\s*([^,)]+)/i);const tName=arrM?.[1]?.trim();return tName?(entityTypes.find(t=>t.name?.trim()===tName)?.attrDefs||[]):[];})()}
                          epoch={epoch} timeUnit={timeUnit}/>
                      </>
                    )}
                    {dataSources.length>0&&!s.rows?.length&&s.dist&&s.dist!=="Schedule"&&(
                      <details style={{fontSize:11,color:C.muted,fontFamily:FONT}}>
                        <summary style={{cursor:"pointer",userSelect:"none"}}>Live parameter binding{s.paramSource?.sourceId?` (${s.paramSource.sourceId})`:""}</summary>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6,alignItems:"center"}}>
                          <select value={s.paramSource?.sourceId||""} onChange={e=>{const v=e.target.value;updS(i,j,{paramSource:v?{...(s.paramSource||{}),sourceId:v}:undefined});}}
                            style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 7px"}}>
                            <option value="">— none —</option>
                            {dataSources.map(ds=><option key={ds.id} value={ds.id}>{ds.label||ds.id}</option>)}
                          </select>
                          {s.paramSource?.sourceId&&<>
                            <input value={s.paramSource?.field||""} onChange={e=>updS(i,j,{paramSource:{...s.paramSource,field:e.target.value}})}
                              placeholder="field" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 7px",width:100}}/>
                            <input value={s.paramSource?.targetParam||""} onChange={e=>updS(i,j,{paramSource:{...s.paramSource,targetParam:e.target.value||undefined}})}
                              placeholder="param (e.g. mean)" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 7px",width:120}}/>
                            <input type="number" value={s.paramSource?.fallback??""} onChange={e=>updS(i,j,{paramSource:{...s.paramSource,fallback:e.target.value===''?undefined:Number(e.target.value)}})}
                              placeholder="fallback" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:"4px 7px",width:80}}/>
                          </>}
                        </div>
                      </details>
                    )}
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",color:s.isRenege?C.reneged:C.muted,fontFamily:FONT,fontSize:11,fontWeight:600}}>
                      <input type="checkbox" checked={!!s.isRenege} onChange={e=>updS(i,j,{isRenege:e.target.checked})} style={{accentColor:C.reneged}}/>
                      Reneging timer
                    </label>
                    {s.isRenege&&(
                      <div style={{background:C.reneged+"0f",border:`1px solid ${C.reneged}33`,borderRadius:4,padding:"6px 10px",fontSize:11,color:C.reneged,fontFamily:FONT}}>
                        ⚠ Reneging timer — fires for most recently arrived customer. Skipped if already served.
                      </div>
                    )}
                  </div>
                ))}
              </SectionPanel>

              <input value={ev.description} onChange={e=>upd(i,"description",e.target.value)} placeholder="Description"
                style={{background:"transparent",border:`1px solid ${C.border}40`,borderRadius:4,color:C.muted,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none",width:"100%",boxSizing:"border-box"}}/>
            </>}
          </div>
        );
      })}
    </div>
  );
};

export { BEventEditor };
