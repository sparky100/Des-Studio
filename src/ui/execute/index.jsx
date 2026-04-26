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
    <div style={{background:C.panel || "#1e1e1e",border:`2px solid ${borderCol}44`,borderRadius:10,padding:14,
      display:"flex",flexDirection:"column",gap:10,minWidth:160,position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"space-between"}}>
        <div>
          <div style={{fontWeight:700,fontSize:12,color:C.server || "#8b5cf6",fontFamily:FONT}}>Server #{server.id}</div>
          <div style={{fontSize:10,color:C.muted || "#9ca3af",fontFamily:FONT}}>{server.type}</div>
        </div>
        <Tag label={server.status} color={isB?C.amber:C.green}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
        <div style={{width:48,height:48,borderRadius:8,background:(C.server || "#8b5cf6")+"18",border:`2px solid ${(C.server || "#8b5cf6")}55`,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="4" rx="1" stroke={C.server || "#8b5cf6"} strokeWidth="1.5"/>
            <rect x="3" y="13" width="18" height="4" rx="1" stroke={C.server || "#8b5cf6"} strokeWidth="1.5"/>
            <circle cx="6.5" cy="8" r="1" fill={isB?C.amber:C.green}/>
            <circle cx="6.5" cy="15" r="1" fill={isB?C.amber:C.green}/>
          </svg>
        </div>
        {servingCust && (
          <>
            <div style={{fontSize:18,color:C.muted || "#9ca3af"}}>→</div>
            <CustomerToken entity={servingCust} size={44}/>
          </>
        )}
        {!servingCust && (
          <div style={{fontSize:11,color:C.muted || "#9ca3af",fontFamily:FONT,fontStyle:"italic"}}>idle</div>
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
      {/* Simulation Clock & Global Counters */}
      <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:16,alignItems:"start"}}>
        <div style={{background:C.panel || "#1e1e1e",border:`2px solid ${C.purple}44`,borderRadius:12,padding:"20px 28px",textAlign:"center",minWidth:140}}>
          <div style={{fontSize:10,color:C.muted || "#9ca3af",fontFamily:FONT,letterSpacing:2,marginBottom:6}}>SIM CLOCK</div>
          <div style={{fontSize:40,fontWeight:700,color:C.purple || "#a855f7",fontFamily:FONT,lineHeight:1}}>
            {parseFloat(snap.clock).toFixed(2)}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {[
            {label:"Arrived",  value:customers.length,     color:C.accent || "#0ea5e9"},
            {label:"Served",   value:snap.served||0,       color:C.served || "#10b981"},
            {label:"Reneged",  value:snap.reneged||0,      color:C.reneged || "#ef4444"},
            {label:"Waiting",  value:waiting.length,       color:C.waiting || "#f59e0b"},
          ].map(s=>(
            <div key={s.label} style={{background:C.panel || "#1e1e1e",border:`1px solid ${s.color}33`,borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:C.muted || "#9ca3af",fontFamily:FONT,marginBottom:2}}>{s.label}</div>
              <div style={{fontSize:26,fontWeight:700,color:s.color,fontFamily:FONT}}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Server Bays */}
      {servers.length>0 && (
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {servers.map(srv=><ServerBay key={srv.id} server={srv} customers={customers}/>)}
        </div>
      )}

      {/* Multiple Queue Lanes (Driven by Model) */}
      {definedQueues.length > 0 ? (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:10,color:C.muted || "#9ca3af",fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>QUEUE LANES</div>
          {definedQueues.map((qDef) => {
            const qName = qDef.name;
            const qData = (snap.queues && snap.queues[qName]) || { length: 0, entities: [], avgWaitTime: 0 };
            return (
              <div key={qName} style={{background: C.surface || "#121212", border: `1px solid ${C.border || "#333"}`, borderLeft: `4px solid ${C.cEvent || "#8b5cf6"}`, borderRadius: 8, padding: 12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:700,color:C.text || "#ffffff",fontFamily:FONT}}>{qName.toUpperCase()}</span>
                  <span style={{fontSize:13,fontWeight:700,color:C.text || "#ffffff",fontFamily:FONT}}>{qData.length}</span>
                </div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',minHeight:36}}>
                  {qData.length === 0 ? <span style={{fontSize:11,color:C.muted || "#9ca3af",fontStyle:"italic"}}>empty</span> : 
                    qData.entities.slice(0, 10).map(e => <CustomerToken key={e.id} entity={e} size={30} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Fallback for single queue */
        <div style={{background:C.surface || "#121212", border:`1px solid ${C.border || "#333"}`, borderRadius:8, padding:12}}>
          <div style={{fontSize:10,color:C.muted || "#9ca3af",marginBottom:8}}>QUEUE</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{waiting.map(e => <CustomerToken key={e.id} entity={e} size={30} />)}</div>
        </div>
      )}
    </div>
  );
};

const ExecutePanel=({model,modelId,userId})=>{
  const [mode,setMode]=useState("idle");
  const [currentSnap,setCurrentSnap]=useState(null);
  const [log,setLog]=useState([]);
  const [view,setView]=useState("visual");
  const [autoSpeed,setAutoSpeed]=useState(400);
  const [autoRunning,setAutoRunning]=useState(false);
  const engineRef=useRef(null);
  const autoRef=useRef(null);

  const initEngine=useCallback(()=>{
    engineRef.current=buildEngine(model);
    setCurrentSnap(engineRef.current.getSnap());
    setLog([{phase:"INIT",time:0,message:"Engine initialised"}]);
    setMode("stepping");
  },[model]);

  const doStep=useCallback(()=>{
    if(!engineRef.current) return;
    const r=engineRef.current.step();
    setCurrentSnap(r.snap);
    setLog(prev=>[...prev,...(r.cycleLog||[])]);
    if(r.done) setMode("done");
  },[]);

  const stopAuto=()=>{ if(autoRef.current){clearInterval(autoRef.current);autoRef.current=null;setAutoRunning(false);}};
  const toggleAuto=()=>{
    if(autoRunning){stopAuto();return;}
    if(mode==="idle")initEngine();
    setAutoRunning(true);
    autoRef.current=setInterval(()=>doStep(), autoSpeed);
  };

  useEffect(()=>()=>stopAuto(),[]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14, color: C.text || "#ffffff"}}>
      {/* Toolbar */}
      <div style={{background:C.panel || "#1e1e1e",border:`1px solid ${C.border || "#333"}`,borderRadius:8,padding:14,display:"flex",gap:10}}>
        <Btn variant="primary" onClick={initEngine}>⟳ Reset</Btn>
        <Btn variant="success" onClick={doStep} disabled={mode==="done"}>⏭ Step</Btn>
        <Btn variant={autoRunning?"danger":"amber"} onClick={toggleAuto}>{autoRunning?"Stop":"Auto"}</Btn>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:4}}>
          <button onClick={()=>setView("visual")} style={{padding:"6px 12px", background:view==="visual"?C.accent:"transparent", border:"none", color:"#fff", borderRadius:4, cursor:"pointer"}}>Visual</button>
          <button onClick={()=>setView("log")} style={{padding:"6px 12px", background:view==="log"?C.accent:"transparent", border:"none", color:"#fff", borderRadius:4, cursor:"pointer"}}>Log</button>
          <button onClick={()=>setView("entities")} style={{padding:"6px 12px", background:view==="entities"?C.accent:"transparent", border:"none", color:"#fff", borderRadius:4, cursor:"pointer"}}>Entities</button>
        </div>
      </div>

      {view==="visual" && <VisualView snap={currentSnap} model={model}/>}

      {/* LOG VIEW - Explicitly using high contrast text */}
      {view==="log" && (
        <div style={{background:"#0a0a0a", border:`1px solid ${C.border || "#333"}`, borderRadius:6, padding:14, maxHeight:400, overflowY:'auto'}}>
          {log.map((r,i)=>(
            <div key={i} style={{fontSize:12, fontFamily:"monospace", padding:'4px 0', color:"#00ff00", borderBottom:"1px solid #222"}}>
              <span style={{color:"#888"}}>[{r.time?.toFixed(2)}]</span> <span style={{color:C.accent}}>{r.phase}</span>: {r.message}
            </div>
          ))}
        </div>
      )}

      {/* ENTITY VIEW - Explicitly using high contrast text */}
      {view==="entities" && currentSnap && (
        <div style={{background:"#0a0a0a", border:`1px solid ${C.border || "#333"}`, borderRadius:6, padding:14, overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", color:"#eee", fontSize:12, textAlign:"left"}}>
             <thead>
               <tr style={{borderBottom:"2px solid #444", color:"#888"}}>
                 <th style={{padding:8}}>ID</th>
                 <th style={{padding:8}}>Type</th>
                 <th style={{padding:8}}>Status</th>
                 <th style={{padding:8}}>Arrival</th>
               </tr>
             </thead>
             <tbody>
               {currentSnap.entities?.map(e=>(
                 <tr key={e.id} style={{borderBottom:"1px solid #222"}}>
                   <td style={{padding:8, color:C.accent}}>#{e.id}</td>
                   <td style={{padding:8}}>{e.type}</td>
                   <td style={{padding:8}}><Tag label={e.status} color={e.status==='waiting'?C.waiting:C.serving}/></td>
                   <td style={{padding:8, color:"#888"}}>{e.arrivalTime?.toFixed(2)}</td>
                 </tr>
               ))}
             </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export { CustomerToken, VisualView, ExecutePanel };
