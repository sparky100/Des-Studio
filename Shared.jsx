// shared.jsx — Design tokens and reusable micro-components

import { useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════════
const C={
  bg:"#080c10",surface:"#0d1117",panel:"#111820",border:"#1e2d3d",
  accent:"#06b6d4",text:"#cdd9e5",muted:"#5c7a99",
  green:"#3fb950",amber:"#f0883e",red:"#f85149",purple:"#8b5cf6",
  bEvent:"#f59e0b",cEvent:"#06b6d4",server:"#a78bfa",
  phaseA:"#8b5cf6",phaseB:"#f59e0b",phaseC:"#06b6d4",
  waiting:"#f0883e",serving:"#06b6d4",served:"#3fb950",reneged:"#f85149",idle:"#3fb950",busy:"#f59e0b",
};
const FONT="'JetBrains Mono','Fira Code',monospace";

// ═══════════════════════════════════════════════════════════════════════════════
// MICRO-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
const Tag=({label,color=C.muted})=>(
  <span style={{background:color+"18",border:`1px solid ${color}44`,color,borderRadius:3,padding:"2px 7px",fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",fontFamily:FONT}}>{label}</span>
);
const PhaseTag=({phase})=>{
  const cfg={A:{color:C.phaseA,label:"Phase A"},B:{color:C.phaseB,label:"Phase B"},
             C:{color:C.phaseC,label:"Phase C"},INIT:{color:C.muted,label:"Init"},END:{color:C.green,label:"Done"}};
  const c=cfg[phase]||{color:C.muted,label:phase};
  return <Tag label={c.label} color={c.color}/>;
};
const Avatar=({u,size=28})=>(
  <div style={{width:size,height:size,borderRadius:"50%",background:u.color+"22",border:`1.5px solid ${u.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:u.color,fontFamily:FONT,flexShrink:0}}>{u.initials}</div>
);
const Btn=({children,onClick,variant="ghost",small,disabled,full,style={}})=>{
  const v={primary:{bg:C.accent,fg:"#080c10",br:C.accent},ghost:{bg:"#ffffff08",fg:C.text,br:C.border},
    danger:{bg:C.red+"18",fg:C.red,br:C.red+"44"},success:{bg:C.green+"18",fg:C.green,br:C.green+"44"},
    amber:{bg:C.amber+"18",fg:C.amber,br:C.amber+"44"}}[variant]||{bg:"#ffffff08",fg:C.text,br:C.border};
  return <button onClick={onClick} disabled={disabled} style={{background:v.bg,color:v.fg,border:`1px solid ${v.br}`,borderRadius:5,padding:small?"4px 10px":"7px 14px",fontSize:small?11:12,fontWeight:600,fontFamily:FONT,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.45:1,display:"inline-flex",alignItems:"center",gap:6,width:full?"100%":undefined,justifyContent:full?"center":undefined,transition:"opacity .15s",flexShrink:0,...style}}>{children}</button>;
};
const Field=({label,value,onChange,multiline,rows=2,placeholder=""})=>(
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label&&<label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase",fontFamily:FONT}}>{label}</label>}
    {multiline
      ?<textarea value={value||""} onChange={e=>onChange?.(e.target.value)} rows={rows} placeholder={placeholder} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:12,padding:"8px 10px",resize:"vertical",outline:"none",lineHeight:1.6}}/>
      :<input value={value||""} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:12,padding:"8px 10px",outline:"none",width:"100%",boxSizing:"border-box"}}/>}
  </div>
);
const SH=({label,color=C.muted,children})=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,paddingBottom:8,marginBottom:12}}>
    <span style={{fontSize:10,fontWeight:700,letterSpacing:1.8,textTransform:"uppercase",color,fontFamily:FONT}}>{label}</span>
    {children}
  </div>
);
const InfoBox=({color,children})=>(
  <div style={{background:color+"0f",border:`1px solid ${color}33`,borderRadius:6,padding:"10px 14px",fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.8}}>{children}</div>
);
const Empty=({icon,msg})=>(
  <div style={{textAlign:"center",padding:"24px 16px",color:C.muted,fontFamily:FONT,fontSize:12}}>
    <div style={{fontSize:24,marginBottom:8}}>{icon}</div>{msg}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// DISTRIBUTION PICKER — reusable widget used by both B-event schedules and C-events
// ═══════════════════════════════════════════════════════════════════════════════
const DistPicker=({value,onChange,compact})=>{
  // value: { dist:"Exponential", distParams:{ mean:"3" } }
  const v=value||{dist:"Exponential",distParams:{}};
  const dd=DISTRIBUTIONS[v.dist||"Fixed"]||DISTRIBUTIONS.Fixed;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <select value={v.dist||"Exponential"} onChange={e=>onChange({...v,dist:e.target.value,distParams:{}})}
          style={{width:compact?160:200,background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,color:C.cEvent,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
          {Object.keys(DISTRIBUTIONS).map(d=><option key={d} value={d}>{DISTRIBUTIONS[d].label}</option>)}
        </select>
        {dd.params.map(param=>(
          <div key={param} style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>{param}:</span>
            <input value={(v.distParams||{})[param]||""} onChange={e=>onChange({...v,distParams:{...(v.distParams||{}),[param]:e.target.value}})}
              style={{width:60,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:"3px 6px",outline:"none"}}/>
          </div>
        ))}
      </div>
      <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>{dd.hint}</span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL SIMULATION VIEW
// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE PANEL — with step-through, run-all, visual, and log views
// ═══════════════════════════════════════════════════════════════════════════════
const ExecutePanel=({model})=>{
  const [mode,setMode]=useState("idle"); // idle | stepping | done
  const [currentSnap,setCurrentSnap]=useState(null);
  const [log,setLog]=useState([]);
  const [cycleLog,setCycleLog]=useState([]);
  const [felSize,setFelSize]=useState(0);
  const [view,setView]=useState("visual");
  const [autoSpeed,setAutoSpeed]=useState(400);
  const [autoRunning,setAutoRunning]=useState(false);
  const [summary,setSummary]=useState(null);
  const engineRef=useRef(null);
  const autoRef=useRef(null);

  const canRun=(model.bEvents||[]).filter(b=>parseFloat(b.scheduledTime)<900).length>0;

  const initEngine=useCallback(()=>{
    engineRef.current=buildEngine(model);
    const s=engineRef.current.getSnap();
    setCurrentSnap(s);
    setLog([{phase:"INIT",time:0,message:"Engine initialised — click Step or Run All"}]);
    setCycleLog([]);
    setFelSize(engineRef.current.getFelSize());
    setMode("stepping");
    setSummary(null);
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

  const doRunAll=useCallback(()=>{
    stopAuto();
    engineRef.current=buildEngine(model);
    const r=engineRef.current.runAll();
    setCurrentSnap(r.snap);
    setLog(r.log||[]);
    setCycleLog([]);
    setFelSize(0);
    setMode("done");
    setSummary(r.summary);
  },[model]);

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
      {/* Controls */}
      <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:14,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <Btn variant="primary" onClick={initEngine} disabled={!canRun}>⟳ Reset</Btn>
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
        <Btn variant="ghost" onClick={doRunAll} disabled={!canRun}>⚡ Run All</Btn>
        {/* Status */}
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <Tag label={mode==="idle"?"ready":mode==="done"?"complete":"stepping"} color={mode==="done"?C.green:mode==="stepping"?C.amber:C.muted}/>
          {mode!=="idle"&&<span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>FEL: {felSize} events</span>}
          {currentSnap&&<span style={{fontSize:11,color:C.purple,fontFamily:FONT}}>t={parseFloat(currentSnap.clock).toFixed(3)}</span>}
        </div>
      </div>

      {/* Summary when done */}
      {summary&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
          {[
            {label:"Final Clock", value:`${parseFloat(currentSnap?.clock||0).toFixed(2)} t`,  color:C.purple},
            {label:"Arrived",     value:summary.total,  color:C.accent},
            {label:"Served",      value:summary.served, color:C.served},
            {label:"Reneged",     value:summary.reneged,color:C.reneged},
            {label:"Avg Wait",    value:summary.avgWait!=null?`${summary.avgWait.toFixed(2)} t`:"—",color:C.amber},
          ].map(s=>(
            <div key={s.label} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:9,color:C.muted,fontFamily:FONT,marginBottom:4}}>{s.label}</div>
              <div style={{fontSize:18,fontWeight:700,color:s.color,fontFamily:FONT}}>{s.value}</div>
            </div>
          ))}
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
              <thead><tr>{["#","Type","Role","Status","Arrived","Wait","Service","Attrs"].map(h=>(
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
                      <td style={{padding:"5px 10px",color:C.amber,fontFamily:FONT}}>{JSON.stringify(e.attrs||{})}</td>
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

export { C, FONT, Tag, PhaseTag, Avatar, Btn, Field, SH, InfoBox, Empty };
