// ui/execute/index.jsx — CustomerToken, VisualView, ExecutePanel
import { useState, useEffect, useRef, useCallback } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Tag, PhaseTag, Btn, SH, InfoBox, Empty } from "../shared/components.jsx";
import { buildEngine } from "../../engine/index.js";
import { saveSimulationRun } from "../../db/models.js";

const TOKEN_COLORS=["#06b6d4","#f59e0b","#8b5cf6","#3fb950","#f87171","#a78bfa","#34d399","#fbbf24"];
const tokenColor=(id)=>TOKEN_COLORS[(id-1)%TOKEN_COLORS.length];

const CustomerToken=({entity,size=36,showId=true})=>{
  const col=tokenColor(entity.id);
  const statusBorder={waiting:C.waiting,serving:C.serving,done:C.served,reneged:C.reneged,idle:C.green,busy:C.amber}[entity.status]||C.muted;
  return (
    <div title={`#${entity.id} ${entity.type} — ${entity.status}\narrived t=${entity.arrivalTime?.toFixed?.(2)}`}
      style={{width:size,height:size,borderRadius:"50%",background:col+"22",border:`2.5px solid ${statusBorder}`,
        display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT,fontSize:size*0.28,
        fontWeight:700,color:col,flexShrink:0,cursor:"default",transition:"all .2s",
        boxShadow:entity.status==="serving"?`0 0 8px ${col}66`:"none"}}>
      {showId?`#${entity.id}`:""}
    </div>
  );
};

const ServerBay=({server,customers})=>{
  const servingCust=customers.find(e=>e.id===server.currentCustId);
  const isB=server.status==="busy";
  const borderCol=isB?C.busy:C.idle;
  return (
    <div style={{background:C.panel,border:`2px solid ${borderCol}44`,borderRadius:10,padding:14,
      display:"flex",flexDirection:"column",gap:10,minWidth:160,position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"space-between"}}>
        <div>
          <div style={{fontWeight:700,fontSize:12,color:C.server,fontFamily:FONT}}>Server #{server.id}</div>
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT}}>{server.type}</div>
        </div>
        <Tag label={server.status} color={isB?C.amber:C.green}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
        <div style={{width:48,height:48,borderRadius:8,background:C.server+"18",border:`2px solid ${C.server}55`,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="4" rx="1" stroke={C.server} strokeWidth="1.5"/>
            <rect x="3" y="13" width="18" height="4" rx="1" stroke={C.server} strokeWidth="1.5"/>
            <circle cx="6.5" cy="8" r="1" fill={isB?C.amber:C.green}/>
            <circle cx="6.5" cy="15" r="1" fill={isB?C.amber:C.green}/>
          </svg>
        </div>
        {servingCust && (
          <>
            <div style={{fontSize:18,color:C.muted}}>→</div>
            <CustomerToken entity={servingCust} size={44}/>
          </>
        )}
        {!servingCust && (
          <div style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>idle</div>
        )}
      </div>
      <div style={{fontSize:10,color:C.muted,fontFamily:FONT,borderTop:`1px solid ${C.border}`,paddingTop:6}}>
        {Object.entries(server.attrs||{}).map(([k,v])=>(
          <span key={k} style={{marginRight:8}}><span style={{color:C.server}}>{k}</span>={v}</span>
        ))}
      </div>
    </div>
  );
};

const VisualView=({snap, model})=>{
  if(!snap) return <Empty icon="▶" msg="Run or step the simulation to see the visual view."/>;

  const allEntities=snap.entities||[];
  const servers=allEntities.filter(e=>e.role==="server");
  const customers=allEntities.filter(e=>e.role!=="server");
  const waiting=customers.filter(e=>e.status==="waiting");
  
  // FIX: Identify if we should use Multi-Queue mode based on the MODEL definition
  // This prevents the UI from flipping back to "Single Queue" when the simulation is idle.
  const definedQueues = model.queues || [];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Clock + counters */}
      <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:16,alignItems:"start"}}>
        <div style={{background:C.panel,border:`2px solid ${C.purple}44`,borderRadius:12,padding:"20px 28px",textAlign:"center",minWidth:140}}>
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:2,marginBottom:6}}>SIM CLOCK</div>
          <div style={{fontSize:40,fontWeight:700,color:C.purple,fontFamily:FONT,lineHeight:1}}>
            {parseFloat(snap.clock).toFixed(2)}
          </div>
          <div style={{fontSize:11,color:C.muted,fontFamily:FONT,marginTop:4}}>time units</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[
              {label:"Arrived",  value:customers.length,     color:C.accent},
              {label:"Served",   value:snap.served||0,       color:C.served},
              {label:"Reneged",  value:snap.reneged||0,      color:C.reneged},
              {label:"Waiting",  value:waiting.length,       color:C.waiting},
            ].map(s=>(
              <div key={s.label} style={{background:C.panel,border:`1px solid ${s.color}33`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:C.muted,fontFamily:FONT,marginBottom:2}}>{s.label}</div>
                <div style={{fontSize:26,fontWeight:700,color:s.color,fontFamily:FONT}}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Server bays */}
      {servers.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>SERVER BAYS</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {servers.map(srv=>(
              <ServerBay key={srv.id} server={srv} customers={customers}/>
            ))}
          </div>
        </div>
      )}

      {/* Queue Lanes: Always show multiple lanes if they are defined in the model */}
      {definedQueues.length > 0 ? (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>QUEUE LANES</div>
          {definedQueues.map((qDef) => {
            const qName = qDef.name;
            // Get data from simulation snapshot, or default to empty
            const qData = (snap.queues && snap.queues[qName]) || { length: 0, entities: [], avgWaitTime: 0 };

            const allLengths = Object.values(snap.queues || {}).map(q => q.length || 0);
            const avgLength = allLengths.length ? allLengths.reduce((s, n) => s + n, 0) / allLengths.length : 0;
            const isBottleneck = qData.length > 2 && qData.length > avgLength * 1.5;

            return (
              <div key={qName} style={{
                background: C.surface,
                border: `1px solid ${isBottleneck ? C.amber : C.border}`,
                borderLeft: `3px solid ${isBottleneck ? C.amber : C.cEvent}`,
                borderRadius: 8,
                padding: 12,
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:11,fontWeight:700,color:C.cEvent,fontFamily:FONT,letterSpacing:1}}>
                      {qName.toUpperCase()}
                    </span>
                    {isBottleneck && (
                      <span style={{fontSize:9,background:C.amber+'22',border:`1px solid ${C.amber}55`,color:C.amber,borderRadius:3,padding:'1px 6px',fontFamily:FONT,fontWeight:700}}>
                        ⚠ BOTTLENECK
                      </span>
                    )}
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:isBottleneck?C.amber:C.text,fontFamily:FONT}}>
                    {qData.length}
                  </span>
                </div>

                <div style={{display:'flex',gap:6,flexWrap:'wrap',minHeight:36}}>
                  {qData.length === 0 ? (
                    <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>empty</span>
                  ) : (
                    <>
                      {(qData.entities||[]).slice(0, 8).map(e => (
                         <CustomerToken key={e.id} entity={e} size={32} showId={true} />
                      ))}
                      {qData.length > 8 && (
                        <div style={{display:'flex',alignItems:'center',fontSize:11,color:C.muted,fontFamily:FONT}}>
                           +{qData.length - 8} more
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div style={{display:'flex',gap:16,marginTop:8}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>
                    avg wait: {(qData.avgWaitTime||0).toFixed(1)} t
                  </span>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>
                    peak: {qData.peakLength||qData.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Fallback: Standard queue for models without specific definitions */
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,marginBottom:8}}>QUEUE</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',minHeight:36}}>
            {waiting.length === 0 ? (
              <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>empty</span>
            ) : (
              waiting.slice(0, 12).map(e => (
                <CustomerToken key={e.id} entity={e} size={32} showId={true} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Done / reneged row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:10,color:C.served,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>SERVED ({snap.served||0})</div>
          <div style={{background:C.panel,border:`1px solid ${C.served}22`,borderRadius:8,padding:10,display:"flex",gap:6,flexWrap:"wrap",minHeight:52,alignItems:"center"}}>
            {allEntities.filter(e=>e.status==='done').length===0 && <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>None yet</span>}
            {allEntities.filter(e=>e.status==='done').map(e=><CustomerToken key={e.id} entity={e} size={32} showId={false}/>)}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:10,color:C.reneged,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>RENEGED ({snap.reneged||0})</div>
          <div style={{background:C.panel,border:`1px solid ${C.reneged}22`,borderRadius:8,padding:10,display:"flex",gap:6,flexWrap:"wrap",minHeight:52,alignItems:"center"}}>
            {allEntities.filter(e=>e.status==='reneged').length===0 && <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>None yet</span>}
            {allEntities.filter(e=>e.status==='reneged').map(e=><CustomerToken key={e.id} entity={e} size={32} showId={false}/>)}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Aggregate stats helper ────────────────────────────────────────────────────
function computeAgg(results) {
  const vals=k=>results.map(r=>r.summary?.[k]).filter(v=>v!=null&&!isNaN(v));
  const mean=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
  const std=arr=>{if(arr.length<2)return 0;const m=mean(arr);return Math.sqrt(arr.reduce((s,x)=>s+(x-m)**2,0)/(arr.length-1));};
  const stat=k=>{const a=vals(k);return{mean:mean(a),std:std(a)};};
  return{n:results.length,served:stat('served'),reneged:stat('reneged'),avgWait:stat('avgWait'),avgSojourn:stat('avgSojourn')};
}

const ExecutePanel=({model,modelId,userId})=>{
  const [mode,setMode]=useState("idle");
  const [execStatus,setExecStatus]=useState("");
  const [currentSnap,setCurrentSnap]=useState(null);
  const [log,setLog]=useState([]);
  const [cycleLog,setCycleLog]=useState([]);
  const [felSize,setFelSize]=useState(0);
  const [view,setView]=useState("visual");
  const [autoSpeed,setAutoSpeed]=useState(400);
  const [autoRunning,setAutoRunning]=useState(false);
  const [summary,setSummary]=useState(null);
  const [reps,setReps]=useState(1);
  const [aggStats,setAggStats]=useState(null);
  const [toast,setToast]=useState(null);
  const engineRef=useRef(null);
  const autoRef=useRef(null);
  const hasSaved=useRef(false);
  const startTimeRef=useRef(null);

  const showToast=(msg,color=C.green)=>{setToast({msg,color});setTimeout(()=>setToast(null),2000);};

  const canRun=(model.bEvents||[]).filter(b=>parseFloat(b.scheduledTime)<900).length>0;

  const validate=()=>{
    const issues=[];
    if((model.entityTypes||[]).length===0) issues.push("No entity types defined");
    if((model.bEvents||[]).filter(b=>parseFloat(b.scheduledTime)<900).length===0)
      issues.push("No B-events with t<900 — nothing seeds the FEL");
    return issues;
  };
  const validationIssues=validate();

  const initEngine=useCallback(()=>{
    try{
      engineRef.current=buildEngine(model);
      const s=engineRef.current.getSnap();
      setCurrentSnap(s);
      setLog([{phase:"INIT",time:0,message:"Engine initialised"}]);
      setCycleLog([]);
      setFelSize(engineRef.current.getFelSize());
      hasSaved.current=false;
      startTimeRef.current=Date.now();
      setMode("stepping");
      setSummary(null);
    }catch(e){
      setExecStatus("ERROR: "+e.message);
    }
  },[model]);

  const doStep=useCallback(()=>{
    if(!engineRef.current||mode==="done")return;
    const r=engineRef.current.step();
    setCurrentSnap(r.snap);
    setCycleLog(r.cycleLog||[]);
    setLog(prev=>[...prev,...(r.cycleLog||[])]);
    setFelSize(r.felSize||0);
    if(r.done){setMode("done");setSummary(r.summary);}
  },[mode]);

  const doRunAll=useCallback(async()=>{
    try{
      stopAuto();
      const t0=Date.now();
      if(reps<=1){
        engineRef.current=buildEngine(model);
        const r=engineRef.current.runAll();
        const ms=Date.now()-t0;
        setCurrentSnap(r.snap);setLog(r.log||[]);setCycleLog([]);setFelSize(0);
        setMode("done");setSummary(r.summary);setAggStats(null);
        if(modelId&&userId) await saveSimulationRun(modelId,userId,r,{replications:1,durationMs:ms});
      }else{
        const results=[];
        for(let i=0;i<reps;i++){engineRef.current=buildEngine(model);results.push(engineRef.current.runAll());}
        const ms=Date.now()-t0;
        const last=results[results.length-1];
        setCurrentSnap(last.snap);setLog(last.log||[]);setCycleLog([]);setFelSize(0);
        setMode("done");setSummary(last.summary);setAggStats(computeAgg(results));
        if(modelId&&userId) await Promise.all(results.map(r=>saveSimulationRun(modelId,userId,r,{replications:reps,durationMs:Math.round(ms/reps)})));
      }
    }catch(e){setExecStatus("ERROR: "+e.message);}
  },[model,reps,modelId,userId]);

  const stopAuto=()=>{if(autoRef.current){clearInterval(autoRef.current);autoRef.current=null;setAutoRunning(false);}};

  const toggleAuto=()=>{
    if(autoRunning){stopAuto();return;}
    if(mode==="idle")initEngine();
    setAutoRunning(true);
    autoRef.current=setInterval(()=>{
      if(!engineRef.current){stopAuto();return;}
      const r=engineRef.current.step();
      setCurrentSnap(r.snap);
      setCycleLog(r.cycleLog||[]);
      setLog(prev=>[...prev,...(r.cycleLog||[])]);
      setFelSize(r.felSize||0);
      if(r.done){stopAuto();setMode("done");setSummary(r.summary);}
    },autoSpeed);
  };

  useEffect(()=>()=>stopAuto(),[]);

  const statusColor={waiting:C.waiting,serving:C.serving,done:C.served,reneged:C.reneged,idle:C.green,busy:C.amber};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:14,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <Btn variant="primary" onClick={initEngine} disabled={!canRun||validationIssues.length>0}>⟳ Reset</Btn>
        <Btn variant="success" onClick={()=>{if(mode==="idle")initEngine();else doStep();}} disabled={!canRun||mode==="done"}>⏭ Step</Btn>
        <Btn variant={autoRunning?"danger":"amber"} onClick={()=>{if(mode==="idle")initEngine();toggleAuto();}} disabled={!canRun||mode==="done"}>
          {autoRunning?"Stop Auto":"Auto"}
        </Btn>
        <input type="range" min="50" max="1000" step="50" value={1050-autoSpeed} onChange={e=>setAutoSpeed(1050-parseInt(e.target.value))} style={{width:80,accentColor:C.amber}}/>
        <div style={{flex:1}}/>
        <Btn variant="ghost" onClick={doRunAll} disabled={!canRun}>⚡ Run All</Btn>
      </div>

      <div style={{display:"flex",gap:8,borderBottom:`1px solid ${C.border}`}}>
        {[["visual","🗺 Visual"],["log","📋 Log"],["entities","👥 Entities"]].map(([id,label])=>(
          <button key={id} onClick={()=>setView(id)} style={{background:"none",border:"none",borderBottom:view===id?`2px solid ${C.accent}`:"2px solid transparent",color:view===id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:"8px 14px",cursor:"pointer",fontWeight:view===id?700:400}}>{label}</button>
        ))}
      </div>

      {view==="visual"&&<VisualView snap={currentSnap} model={model}/>}

      {view==="log" && (
        <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:14,maxHeight:400,overflowY:'auto'}}>
          {log.map((r,i)=>(<div key={i} style={{fontSize:11,fontFamily:FONT,padding:'2px 0'}}><PhaseTag phase={r.phase}/> t={r.time?.toFixed(2)}: {r.message}</div>))}
        </div>
      )}

      {view==="entities" && currentSnap && (
        <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:14}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:FONT,fontSize:11}}>
             <thead><tr>{["#","Type","Status"].map(h=><th key={h} style={{textAlign:'left'}}>{h}</th>)}</tr></thead>
             <tbody>
               {currentSnap.entities?.map(e=>(
                 <tr key={e.id}><td>#{e.id}</td><td>{e.type}</td><td><Tag label={e.status} color={statusColor[e.status]}/></td></tr>
               ))}
             </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export { CustomerToken, VisualView, ExecutePanel };
