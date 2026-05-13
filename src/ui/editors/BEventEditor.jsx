import { C, FONT } from "../shared/tokens.js";
import { Tag, Btn, CommitInput, Field, SH, InfoBox, Empty, DistPicker } from "../shared/components.jsx";
import { displayEventName, queueDisplayName, bEffectOptions, DropField } from "./helpers.jsx";

const BEventEditor=({events,onChange,entityTypes=[],stateVariables=[],queues=[],cEvents=[]})=>{
  const add=()=>onChange([...events,{id:"b"+Date.now(),name:"",scheduledTime:"0",effect:[],schedules:[],description:""}]);
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
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <SH label="B-Events (Bound)" color={C.bEvent}><Btn small variant="ghost" onClick={add}>+ Add B-Event</Btn></SH>
      <InfoBox color={C.bEvent}>
        <strong style={{color:C.bEvent}}>Arrivals</strong> add an entity to an explicit queue.{" "}
        <strong style={{color:C.bEvent}}>Completion</strong> releases the matched resource and either routes the entity onward or marks it complete.{" "}
        Follow-on completion and reneging events are scheduled by another event, so leave them unticked for simulation start.
      </InfoBox>
      {events.length===0&&<Empty icon="⏰" msg="No B-events."/>}
      {events.map((ev,i)=>{
        const isTmpl=parseFloat(ev.scheduledTime)>=900;
        const isStart=parseFloat(ev.scheduledTime)===0;
        const showTimeInput=!isStart&&!isTmpl;
        const effects=Array.isArray(ev.effect)?ev.effect:(ev.effect?[ev.effect]:[]);
        const updEff=(j,v)=>{const n=[...events];const ef=[...effects];ef[j]=v;n[i]={...n[i],effect:ef};onChange(n);};
        const addEff=()=>{const n=[...events];n[i]={...n[i],effect:[...effects,'']};onChange(n);};
        const remEff=(j)=>{const n=[...events];n[i]={...n[i],effect:effects.filter((_,idx)=>idx!==j)};onChange(n);};
        // F10.1c / F10.2c — routing mode (none | conditional | probabilistic)
        const hasRelease=effects.some(eff=>typeof eff==='string'&&/^RELEASE\s*\(/i.test(eff));
        const hasArriveEffect=effects.some(eff=>typeof eff==='string'&&/^ARRIVE\s*\(/i.test(eff));
        const updBalk=(f,v)=>{const n=[...events];n[i]={...n[i],[f]:v===''||v===null?undefined:v};onChange(n);};
        const hasRouting=Array.isArray(ev.routing);
        const hasProb=Array.isArray(ev.probabilisticRouting);
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
        return (
          <div key={ev.id} style={{background:C.bg,border:`1px solid ${isTmpl?C.muted+"44":C.bEvent+"33"}`,
            borderLeft:`3px solid ${isTmpl?C.muted:C.bEvent}`,borderRadius:6,padding:12,display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <Tag label={isTmpl?"scheduled follow-on":"B-event"} color={isTmpl?C.muted:C.bEvent}/>
              <CommitInput value={ev.name} onCommit={value=>commitName(i,value)} placeholder="Event name"
                style={{flex:1,minWidth:130,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Behavior:</span>
                <select value={isStart ? "start" : isTmpl ? "scheduled" : "time"} 
                  onChange={e=>{
                    const v = e.target.value;
                    if(v==="start") upd(i,"scheduledTime","0");
                    else if(v==="scheduled") upd(i,"scheduledTime","9999");
                    else upd(i,"scheduledTime","1");
                  }}
                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
                  <option value="start">Fire at start</option>
                  <option value="scheduled">Scheduled follow-on</option>
                  <option value="time">Specific time (t=)</option>
                </select>
              </div>
              {showTimeInput&&<>
                <input value={ev.scheduledTime} type="number" step="0.5" onChange={e=>upd(i,"scheduledTime",e.target.value)}
                  style={{width:65,background:"transparent",border:`1px solid ${C.bEvent+"66"}`,borderRadius:4,color:C.bEvent,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
              </>}
              <Btn small variant="danger" ariaLabel={`Remove B-event ${ev.name || i + 1}`} onClick={()=>rem(i)}>✕</Btn>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1}}>EFFECTS</span>
                <Btn small variant="ghost" onClick={addEff}>+ Add Effect</Btn>
              </div>
              {effects.length===0&&<span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>None — add an effect.</span>}
              {effects.map((eff,j)=>(
                <div key={j} style={{display:'flex',gap:8,alignItems:'center'}}>
                  <DropField value={eff} onChange={v=>updEff(j,v)}
                    options={bEffectOptions(entityTypes, queues, stateVariables)} color={C.green}/>
                  <Btn small variant="danger" ariaLabel={`Remove B-event effect ${j + 1}`} onClick={()=>remEff(j)}>✕</Btn>
                </div>
              ))}
            </div>
            {hasRelease&&(
              <div style={{background:C.surface,borderRadius:5,padding:10,display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1}}>RELEASE ROUTING</span>
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
                      <select value={row.queueName||""} onChange={e=>updProbRow(j,{queueName:e.target.value})}
                        style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 6px",outline:"none"}}>
                        <option value="">— queue —</option>
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
                </>)}
              </div>
            )}
            {hasArriveEffect&&(
              <div style={{background:C.surface,borderRadius:5,padding:10,display:'flex',flexDirection:'column',gap:8}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1}}>BALKING (OPTIONAL)</span>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:11,color:C.muted,fontFamily:FONT,whiteSpace:'nowrap'}}>Balk probability:</span>
                  <input
                    aria-label="Balk probability"
                    type="number" min="0" max="1" step="0.01"
                    value={ev.balkProbability??''} onChange={e=>updBalk('balkProbability',e.target.value===''?null:parseFloat(e.target.value))}
                    placeholder="0 – 1  (blank = no balking)"
                    style={{width:160,background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:'4px 8px',outline:'none'}}/>
                </div>
                {ev.balkProbability!=null&&ev.balkProbability>0&&(
                  <div style={{fontSize:10,color:C.muted,fontFamily:FONT}}>
                    {Math.round(ev.balkProbability*100)}% of arrivals decline to join the queue and exit (or go to the queue's overflow destination).
                  </div>
                )}
              </div>
            )}
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
                      {events.map(b=><option key={b.id} value={b.id}>{displayEventName(b.name)||b.id}</option>)}
                    </select>
                    <Btn small variant="danger" ariaLabel={`Remove B-event schedule ${j + 1}`} onClick={()=>remS(i,j)}>✕</Btn>
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

export { BEventEditor };
