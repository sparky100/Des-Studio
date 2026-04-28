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
    <div style={{background:"#1a1a1a",border:`2px solid ${borderCol}44`,borderRadius:10,padding:14,
      display:"flex",flexDirection:"column",gap:10,minWidth:160,position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"space-between"}}>
        <div>
          <div style={{fontWeight:700,fontSize:12,color:"#a78bfa",fontFamily:FONT}}>Server #{server.id}</div>
          <div style={{fontSize:10,color:"#9ca3af",fontFamily:FONT}}>{server.type}</div>
        </div>
        <Tag label={server.status} color={isB?C.amber:C.green}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
        <div style={{width:48,height:48,borderRadius:8,background:"#a78bfa18",border:`2px solid #a78bfa55`,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="4" rx="1" stroke="#a78bfa" strokeWidth="1.5"/>
            <rect x="3" y="13" width="18" height="4" rx="1" stroke="#a78bfa" strokeWidth="1.5"/>
            <circle cx="6.5" cy="8" r="1" fill={isB?C.amber:C.green}/>
          </svg>
        </div>
        {servingCust ? (
          <><div style={{fontSize:18,color:"#4b5563"}}>→</div><CustomerToken entity={servingCust} size={44}/></>
        ) : (
          <div style={{fontSize:11,color:"#4b5563",fontFamily:FONT,fontStyle:"italic"}}>idle</div>
        )}
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
  const definedQueues = model.queues || [];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:16,alignItems:"start"}}>
        <div style={{background:"#111",border:`2px solid #a855f744`,borderRadius:12,padding:"20px 28px",textAlign:"center",minWidth:140}}>
          <div style={{fontSize:10,color:"#9ca3af",fontFamily:FONT,letterSpacing:2,marginBottom:6}}>SIM CLOCK</div>
          <div style={{fontSize:40,fontWeight:700,color:"#a855f7",fontFamily:FONT,lineHeight:1}}>
            {parseFloat(snap.clock).toFixed(2)}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {[
            {label:"Arrived",  value:customers.length,     color:"#38bdf8"},
            {label:"Served",   value:snap.served||0,       color:"#10b981"},
            {label:"Reneged",  value:snap.reneged||0,      color:"#ef4444"},
            {label:"Waiting",  value:waiting.length,       color:"#f59e0b"},
          ].map(s=>(
            <div key={s.label} style={{background:"#1a1a1a",border:`1px solid ${s.color}33`,borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#9ca3af",fontFamily:FONT,marginBottom:2}}>{s.label}</div>
              <div style={{fontSize:26,fontWeight:700,color:s.color,fontFamily:FONT}}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {servers.map(srv=><ServerBay key={srv.id} server={srv} customers={customers}/>)}
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={{fontSize:10,color:"#9ca3af",fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>QUEUE LANES</div>
        {definedQueues.length > 0 ? (
          definedQueues.map((qDef, idx) => {
            const qName = qDef.name;
            // Robust matching: include entities with this queue name, OR if first lane, include unassigned waiting entities
            const qEntities = waiting.filter(e => e.queue === qName || (idx === 0 && !e.queue));

            return (
              <div key={qName} style={{background: "#111", border: `1px solid #333`, borderLeft: `4px solid ${C.cEvent || '#8b5cf6'}`, borderRadius: 8, padding: 12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:FONT}}>{qName.toUpperCase()}</span>
                  <span style={{fontSize:13,fontWeight:700,color:qEntities.length > 0 ? "#f59e0b" : "#fff",fontFamily:FONT}}>{qEntities.length}</span>
                </div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',minHeight:40}}>
                  {qEntities.length === 0 ? <span style={{fontSize:11,color:"#444",fontStyle:"italic"}}>empty</span> : qEntities.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{background: "#111", border:`1px solid #333`, borderRadius:8, padding:12}}>
            <div style={{fontSize:11,color:"#f59e0b",fontWeight:700,marginBottom:8}}>GENERAL QUEUE</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{waiting.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

const ExecutePanel=({model,modelId,userId})=>{
  const [mode,setMode]=useState("idle");
  const [currentSnap,setCurrentSnap]=useState(null);
  const [log,setLog]=useState([]);
  const [view,setView]=useState("visual");
  const [autoSpeed,setAutoSpeed] = useState(400);
  const [autoRunning,setAutoRunning] = useState(false);
  const engineRef=useRef(null);
  const autoRef=useRef(null);

  const initEngine=useCallback(()=>{
    engineRef.current=buildEngine(model);
    setCurrentSnap(engineRef.current.getSnap());
    setLog([{phase:"INIT",time:0,message:"Simulation Initialized"}]);
    setMode("stepping");
  },[model]);

  const doStep=useCallback(()=>{
    if(!engineRef.current) return;
    const r=engineRef.current.step();
    setCurrentSnap(r.snap);
    setLog(prev=>[...prev,...(r.cycleLog||[])]);
    if(r.done) {
        setMode("done");
        stopAuto();
        // Save the simulation results when stepping completes
        if(userId && modelId) {
          const fullResult = {
            snap: r.snap,
            summary: {
              total: r.snap?.entities?.filter(e => e.role !== 'server').length || 0,
              served: r.snap?.served || 0,
              reneged: r.snap?.reneged || 0,
              avgWait: r.snap?.avgWait,
              avgSojourn: r.snap?.avgSojourn,
            },
          };
          console.log("Saving stepped simulation run...", {modelId, userId});
          saveSimulationRun(modelId, userId, fullResult)
            .then(() => console.log("✓ Simulation run saved successfully"))
            .catch(e => console.error("✗ Failed to save simulation run:", e));
        }
    }
  },[userId, modelId]);

  const doRunAll = useCallback(async () => {
    stopAuto();
    const engine = buildEngine(model);
    const result = engine.runAll();
    setCurrentSnap(result.snap);
    setLog(result.log || []);
    setMode("done");
    
    // Save the simulation results when run all completes
    if(userId && modelId) {
      try {
        console.log("Saving full simulation run...", {modelId, userId, resultHasSnap: !!result.snap});
        await saveSimulationRun(modelId, userId, result, {
          replications: 1,
          durationMs: result.durationMs,