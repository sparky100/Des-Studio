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
      {/* Server label */}
      <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"space-between"}}>
        <div>
          <div style={{fontWeight:700,fontSize:12,color:C.server,fontFamily:FONT}}>Server #{server.id}</div>
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT}}>{server.type}</div>
        </div>
        <Tag label={server.status} color={isB?C.amber:C.green}/>
      </div>
      {/* Server icon */}
      <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
        {/* Server entity visual */}
        <div style={{width:48,height:48,borderRadius:8,background:C.server+"18",border:`2px solid ${C.server}55`,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="4" rx="1" stroke={C.server} strokeWidth="1.5"/>
            <rect x="3" y="13" width="18" height="4" rx="1" stroke={C.server} strokeWidth="1.5"/>
            <circle cx="6.5" cy="8" r="1" fill={isB?C.amber:C.green}/>
            <circle cx="6.5" cy="15" r="1" fill={isB?C.amber:C.green}/>
          </svg>
        </div>
        {/* Arrow if busy */}
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
      {/* Server attributes */}
      <div style={{fontSize:10,color:C.muted,fontFamily:FONT,borderTop:`1px solid ${C.border}`,paddingTop:6}}>
        {Object.entries(server.attrs||{}).map(([k,v])=>(
          <span key={k} style={{marginRight:8}}><span style={{color:C.server}}>{k}</span>={v}</span>
        ))}
      </div>
    </div>
  );
};

const VisualView=({snap})=>{
  if(!snap) return <Empty icon="▶" msg="Run or step the simulation to see the visual view."/>;

  const allEntities=snap.entities||[];
  const servers=allEntities.filter(e=>e.role==="server");
  const customers=allEntities.filter(e=>e.role!=="server");
  const waiting=customers.filter(e=>e.status==="waiting");
  const done=customers.filter(e=>e.status==="done");
  const reneged=customers.filter(e=>e.status==="reneged");

  const scalarEntries=Object.entries(snap.scalars||{});

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Clock + counters */}
      <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:16,alignItems:"start"}}>
        {/* Big clock */}
        <div style={{background:C.panel,border:`2px solid ${C.purple}44`,borderRadius:12,padding:"20px 28px",textAlign:"center",minWidth:140}}>
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:2,marginBottom:6}}>SIM CLOCK</div>
          <div style={{fontSize:40,fontWeight:700,color:C.purple,fontFamily:FONT,lineHeight:1}}>
            {parseFloat(snap.clock).toFixed(2)}
          </div>
          <div style={{fontSize:11,color:C.muted,fontFamily:FONT,marginTop:4}}>time units</div>
        </div>
        {/* State counters */}
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
          {/* Custom scalar vars */}
          {scalarEntries.length>0&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {scalarEntries.map(([k,v])=>(
                <div key={k} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 12px",fontFamily:FONT,fontSize:12}}>
                  <span style={{color:C.purple}}>{k}</span>
                  <span style={{color:C.muted}}> = </span>
                  <span style={{color:C.amber}}>{String(v)}</span>
                </div>
              ))}
            </div>
          )}
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

      {/* Queue lane */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>
          QUEUE  ({waiting.length} waiting)
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.waiting}33`,borderRadius:10,padding:14,minHeight:72,
          display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",position:"relative"}}>
          {waiting.length===0&&(
            <div style={{fontSize:12,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>Queue empty</div>
          )}
          {/* Entrance arrow */}
          {waiting.length>0&&<div style={{fontSize:14,color:C.muted}}>→</div>}
          {waiting.slice().reverse().map(e=>(
            <div key={e.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <CustomerToken entity={e} size={40}/>
              <span style={{fontSize:9,color:C.muted,fontFamily:FONT}}>
                t={e.arrivalTime?.toFixed?.(1)}
              </span>
            </div>
          ))}
          {waiting.length>0&&<div style={{fontSize:14,color:C.muted}}>→ servers</div>}
        </div>
      </div>

      {/* Done / reneged row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {/* Served */}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:10,color:C.served,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>
            SERVED  ({done.length})
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.served}22`,borderRadius:8,padding:10,
            display:"flex",gap:6,flexWrap:"wrap",minHeight:52,alignItems:"center"}}>
            {done.length===0&&<span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>None yet</span>}
            {done.map(e=><CustomerToken key={e.id} entity={e} size={32} showId={false}/>)}
          </div>
        </div>
        {/* Reneged */}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:10,color:C.reneged,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>
            RENEGED  ({reneged.length})
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.reneged}22`,borderRadius:8,padding:10,
            display:"flex",gap:6,flexWrap:"wrap",minHeight:52,alignItems:"center"}}>
            {reneged.length===0&&<span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>None yet</span>}
            {reneged.map(e=><CustomerToken key={e.id} entity={e} size={32} showId={false}/>)}
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

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE PANEL — with step-through, run-all, visual, and log views
// ═══════════════════════════════════════════════════════════════════════════════
const ExecutePanel=({model,modelId,userId})=>{
  const [mode,setMode]=useState("idle"); // idle | stepping | done
  const [execStatus,setExecStatus]=useState(""); // checkpoint messages
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
    const typeNames=(model.entityTypes||[]).map(e=>e.name.trim().toLowerCase());
    if((model.entityTypes||[]).length===0) issues.push("No entity types defined");
    if((model.bEvents||[]).filter(b=>parseFloat(b.scheduledTime)<900).length===0)
      issues.push("No B-events with t<900 — nothing seeds the FEL");
    (model.bEvents||[]).forEach(b=>{
      const m=(b.effect||'').match(/ARRIVE\((\w+)\)/i);
      if(m&&!typeNames.includes(m[1].toLowerCase()))
        issues.push(`B-event "${b.name}": ARRIVE(${m[1]}) — type not defined`);
    });
    (model.cEvents||[]).forEach(c=>{
      const m=(c.effect||'').match(/ASSIGN\((\w+)\s*,\s*(\w+)\)/i);
      if(m){
        if(!typeNames.includes(m[1].toLowerCase()))
          issues.push(`C-event "${c.name}": customer type "${m[1]}" not defined`);
        if(!typeNames.includes(m[2].toLowerCase()))
          issues.push(`C-event "${c.name}": server type "${m[2]}" not defined`);
      }
    });
    return issues;
  };
  const validationIssues=validate();

  const initEngine=useCallback(()=>{
    try{
      setExecStatus("Step 1: calling buildEngine...");
      engineRef.current=buildEngine(model);
      setExecStatus("Step 2: buildEngine OK — calling getSnap...");
      const s=engineRef.current.getSnap();
      setExecStatus("Step 3: getSnap OK — setting state...");
      setCurrentSnap(s);
      setLog([{phase:"INIT",time:0,message:"Engine initialised — click Step or Run All"}]);
      setCycleLog([]);
      setFelSize(engineRef.current.getFelSize());
      hasSaved.current=false;
      startTimeRef.current=Date.now();
      setMode("stepping");
      setSummary(null);
      setExecStatus("Step 4: Engine ready");
    }catch(e){
      setExecStatus("ERROR in initEngine: "+e.message);
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
      setExecStatus("Running...");
      stopAuto();
      const t0=Date.now();
      if(reps<=1){
        engineRef.current=buildEngine(model);
        const r=engineRef.current.runAll();
        const ms=Date.now()-t0;
        setCurrentSnap(r.snap);setLog(r.log||[]);setCycleLog([]);setFelSize(0);
        hasSaved.current=true; // useEffect watches mode→done; doRunAll saves here instead
        setMode("done");setSummary(r.summary);setAggStats(null);setExecStatus("Complete");
        if(modelId&&userId){
          try{await saveSimulationRun(modelId,userId,r,{replications:1,durationMs:ms});showToast("✓ Saved");}
          catch(e){showToast("⚠ Save failed",C.red);}
        }
      }else{
        const results=[];
        for(let i=0;i<reps;i++){engineRef.current=buildEngine(model);results.push(engineRef.current.runAll());}
        const ms=Date.now()-t0;
        const last=results[results.length-1];
        setCurrentSnap(last.snap);setLog(last.log||[]);setCycleLog([]);setFelSize(0);
        hasSaved.current=true; // useEffect watches mode→done; doRunAll saves all reps here instead
        setMode("done");setSummary(last.summary);setAggStats(computeAgg(results));setExecStatus("Complete");
        if(modelId&&userId){
          try{
            await Promise.all(results.map(r=>saveSimulationRun(modelId,userId,r,{replications:reps,durationMs:Math.round(ms/reps)})));
            showToast(`✓ Saved (${reps} reps)`);
          }catch(e){showToast("⚠ Save failed",C.red);}
        }
      }
    }catch(e){setExecStatus("ERROR in doRunAll: "+e.message);}
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

  // Save whenever simulation reaches "done" regardless of how it got there.
  // hasSaved.current prevents double-save when doRunAll already saved.
  useEffect(()=>{
    if(mode!=="done"||!summary||hasSaved.current||!modelId||!userId)return;
    hasSaved.current=true;
    let unmounted=false;
    const durationMs=startTimeRef.current?Date.now()-startTimeRef.current:null;
    const result={summary,snap:currentSnap};
    (async()=>{
      try{
        await saveSimulationRun(modelId,userId,result,{replications:1,durationMs});
        if(!unmounted)showToast("✓ Saved");
      }catch{
        if(!unmounted)showToast("⚠ Save failed",C.red);
      }
    })();
    return()=>{unmounted=true;};
  },[mode,summary,modelId,userId]);

  const statusColor={waiting:C.waiting,serving:C.serving,done:C.served,reneged:C.reneged,idle:C.green,busy:C.amber};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {toast&&(
        <div style={{position:"fixed",bottom:24,right:24,background:toast.color+"22",border:`1px solid ${toast.color}`,borderRadius:6,padding:"8px 18px",fontFamily:FONT,fontSize:12,fontWeight:700,color:toast.color,zIndex:999,pointerEvents:"none"}}>
          {toast.msg}
        </div>
      )}
      {/* Controls */}
      <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:14,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <Btn variant="primary" onClick={initEngine} disabled={!canRun||validationIssues.length>0}>⟳ Reset</Btn>
        <Btn variant="success" onClick={()=>{if(mode==="idle")initEngine();else doStep();}} disabled={!canRun||mode==="done"}>
          ⏭ Step
        </Btn>
        <Btn variant={autoRunning?"danger":"amber"} onClick={()=>{if(mode==="idle")initEngine();toggleAuto();}} disabled={!canRun||mode==="done"}>
          {autoRunning?"⏹ Stop Auto":"▶ Auto"}
        </Btn>
        {/* Speed slider */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Speed:</span>
          <input type="range" min="50" max="1000" step="50" value={1050-autoSpeed}
            onChange={e=>setAutoSpeed(1050-parseInt(e.target.value))}
            style={{width:80,accentColor:C.amber}}/>
          <span style={{fontSize:10,color:C.amber,fontFamily:FONT}}>{Math.round(1000/autoSpeed*10)/10} step/s</span>
        </div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Reps:</span>
          <input type="number" min="1" max="20" value={reps}
            onChange={e=>setReps(Math.min(20,Math.max(1,parseInt(e.target.value)||1)))}
            style={{width:48,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 6px",outline:"none",textAlign:"center"}}/>
        </div>
        <Btn variant="ghost" onClick={doRunAll} disabled={!canRun}>⚡ Run All</Btn>
        {/* Status */}
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <Tag label={mode==="idle"?"ready":mode==="done"?"complete":"stepping"} color={mode==="done"?C.green:mode==="stepping"?C.amber:C.muted}/>
          {mode!=="idle"&&<span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>FEL: {felSize} events</span>}
          {currentSnap&&<span style={{fontSize:11,color:C.purple,fontFamily:FONT}}>t={parseFloat(currentSnap.clock).toFixed(3)}</span>}
          {execStatus&&<span style={{fontSize:11,color:execStatus.startsWith("ERROR")?C.red:C.green,fontFamily:FONT,fontWeight:600}}>{execStatus}</span>}
        </div>
      </div>


      {/* Validation warnings */}
      {validationIssues.length>0&&(
        <div style={{background:C.amber+'18',border:`1px solid ${C.amber}44`,borderRadius:6,padding:12}}>
          <div style={{fontSize:10,color:C.amber,fontFamily:FONT,letterSpacing:1.5,marginBottom:8,fontWeight:700}}>
            ⚠ MODEL ISSUES — fix before executing
          </div>
          {validationIssues.map((issue,i)=>(
            <div key={i} style={{fontSize:12,color:C.amber,fontFamily:FONT,marginBottom:4}}>• {issue}</div>
          ))}
        </div>
      )}
      {/* Summary when done */}
      {summary&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8}}>
          {[
            {label:"Final Clock",  value:`${parseFloat(currentSnap?.clock||0).toFixed(2)} t`, color:C.purple},
            {label:"Arrived",      value:summary.total,   color:C.accent},
            {label:"Served",       value:summary.served,  color:C.served},
            {label:"Reneged",      value:summary.reneged, color:C.reneged},
            {label:"Avg Wait",     value:summary.avgWait!=null?`${summary.avgWait.toFixed(2)} t`:"—", color:C.amber},
            {label:"Avg Sojourn",  value:summary.avgSojourn!=null?`${summary.avgSojourn.toFixed(2)} t`:"—", color:C.server},
            {label:"Max Sojourn",  value:summary.maxSojourn!=null?`${summary.maxSojourn.toFixed(2)} t`:"—", color:C.red},
          ].map(s=>(
            <div key={s.label} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:9,color:C.muted,fontFamily:FONT,marginBottom:4}}>{s.label}</div>
              <div style={{fontSize:18,fontWeight:700,color:s.color,fontFamily:FONT}}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Aggregate stats (multi-rep) */}
      {aggStats&&(
        <div style={{background:C.surface,border:`1px solid ${C.purple}44`,borderRadius:8,padding:14}}>
          <div style={{fontSize:10,color:C.purple,fontFamily:FONT,letterSpacing:1.5,fontWeight:700,marginBottom:10}}>
            AGGREGATE — {aggStats.n} REPLICATIONS
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[
              {label:"Served",      s:aggStats.served,     color:C.served,  unit:""},
              {label:"Reneged",     s:aggStats.reneged,    color:C.reneged, unit:""},
              {label:"Avg Wait",    s:aggStats.avgWait,    color:C.amber,   unit:" t"},
              {label:"Avg Sojourn", s:aggStats.avgSojourn, color:C.server,  unit:" t"},
            ].map(({label,s,color,unit})=>(
              <div key={label} style={{background:C.bg,border:`1px solid ${color}33`,borderRadius:6,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:C.muted,fontFamily:FONT,marginBottom:4}}>{label}</div>
                <div style={{fontSize:16,fontWeight:700,color,fontFamily:FONT}}>{s.mean.toFixed(2)}{unit}</div>
                <div style={{fontSize:10,color:C.muted,fontFamily:FONT}}>± {s.std.toFixed(2)}{unit}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View tabs */}
      <div style={{display:"flex",gap:8,borderBottom:`1px solid ${C.border}`,paddingBottom:0}}>
        {[["visual","🗺 Visual"],["log","📋 Log"],["entities","👥 Entities"]].map(([id,label])=>(
          <button key={id} onClick={()=>setView(id)} style={{
            background:"none",border:"none",
            borderBottom:view===id?`2px solid ${C.accent}`:"2px solid transparent",
            color:view===id?C.accent:C.muted,fontFamily:FONT,fontSize:12,
            padding:"8px 14px",cursor:"pointer",fontWeight:view===id?700:400}}>{label}</button>
        ))}
      </div>

      {view==="visual"&&<VisualView snap={currentSnap}/>}

      {view==="log"&&(
        <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:14}}>
          {/* Cycle highlight */}
          {cycleLog.length>0&&mode==="stepping"&&(
            <div style={{marginBottom:12,background:C.purple+"0f",border:`1px solid ${C.purple}33`,borderRadius:6,padding:10}}>
              <div style={{fontSize:10,color:C.purple,fontFamily:FONT,letterSpacing:1.5,marginBottom:6}}>LAST CYCLE</div>
              {cycleLog.map((r,i)=>(
                <div key={i} style={{display:"flex",gap:8,padding:"3px 0",fontFamily:FONT,fontSize:11,alignItems:"flex-start"}}>
                  <PhaseTag phase={r.phase}/>
                  <span style={{color:C.text,flex:1,lineHeight:1.5}}>{r.message}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,marginBottom:8}}>FULL LOG ({log.length} entries)</div>
          <div style={{maxHeight:320,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
            {log.map((r,i)=>(
              <div key={i} style={{display:"flex",gap:8,padding:"4px 8px",
                background:i%2===0?C.surface+"80":"transparent",borderRadius:4,
                alignItems:"flex-start",fontFamily:FONT,fontSize:11,opacity:r.skipped?0.5:1}}>
                <span style={{color:C.amber,minWidth:52,flexShrink:0}}>t={parseFloat(r.time||0).toFixed(2)}</span>
                <PhaseTag phase={r.phase}/>
                <span style={{color:r.skipped?C.red:C.text,flex:1,lineHeight:1.5}}>{r.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view==="entities"&&currentSnap&&(
        <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:14}}>
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,marginBottom:12}}>ENTITY TRACKER</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:FONT,fontSize:11}}>
              <thead><tr>{["#","Type","Role","Status","Arrived","Wait","Service","Sojourn","Stages"].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"6px 10px",color:C.muted,borderBottom:`1px solid ${C.border}`,fontSize:10,letterSpacing:1,fontWeight:700}}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {(currentSnap.entities||[]).map((e,i)=>{
                  const wt=e.status==="done"&&e.serviceStart!=null?(e.serviceStart-e.arrivalTime).toFixed(2)
                    :e.status==="reneged"&&e.renegeTime!=null?(e.renegeTime-e.arrivalTime).toFixed(2)
                    :e.status==="waiting"?(parseFloat(currentSnap.clock)-e.arrivalTime).toFixed(2)+"*":"—";
                  const st=e.status==="done"&&e.completionTime!=null?(e.completionTime-e.serviceStart).toFixed(2):"—";
                  return (
                    <tr key={e.id} style={{background:i%2===0?C.surface+"60":"transparent"}}>
                      <td style={{padding:"5px 10px",color:C.muted}}>#{e.id}</td>
                      <td style={{padding:"5px 10px",color:e.role==="server"?C.server:C.accent}}>{e.type}</td>
                      <td style={{padding:"5px 10px"}}><Tag label={e.role||"customer"} color={e.role==="server"?C.server:C.muted}/></td>
                      <td style={{padding:"5px 10px"}}><Tag label={e.status} color={statusColor[e.status]||C.muted}/></td>
                      <td style={{padding:"5px 10px",color:C.text}}>{e.arrivalTime?.toFixed?.(2)||"0"}</td>
                      <td style={{padding:"5px 10px",color:e.status==="reneged"?C.reneged:C.text}}>{wt} t</td>
                      <td style={{padding:"5px 10px",color:e.status==="done"?C.green:C.muted}}>{st}{st!=="—"?" t":""}</td>
                      <td style={{padding:"5px 10px",color:C.server}}>{e.sojournTime!=null?e.sojournTime.toFixed(2)+" t":"—"}</td>
                      <td style={{padding:"5px 10px",color:C.muted,fontSize:10}}>{(e.stages||[]).length>0?(e.stages||[]).map((st,i)=>`S${i+1}:${st.stageService.toFixed(1)}t`).join("→"):"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// EDITORS
// ═══════════════════════════════════════════════════════════════════════════════


export { CustomerToken, VisualView, ExecutePanel };

