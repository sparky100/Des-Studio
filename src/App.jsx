// AppEditors.jsx — Full model editor, no engine
// ANON KEY is on line 8

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// ── Supabase — update YOUR_ANON_KEY below ──────────────────
const SUPABASE_URL  = 'https://znkknldzdfajcrpabtmg.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpua2tubGR6ZGZhamNycGFidG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTIyMzMsImV4cCI6MjA4OTMyODIzM30.2puQY_UNe3bOBT88Uyo2rtFU3AIUp3wgCNxcAVtw2ng'
const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Data helpers ─────────────────────────────────────────────
const norm=(r)=>({
  id:r.id,name:r.name,description:r.description||'',
  visibility:r.visibility,access:r.access||{},
  entityTypes:r.entity_types||[],stateVariables:r.state_variables||[],
  bEvents:r.b_events||[],cEvents:r.c_events||[],
  owner_id:r.owner_id,owner:r.owner_id,
  createdAt:r.created_at,updatedAt:r.updated_at,
})
async function dbModels(){
  const {data,error}=await sb.from('des_models').select('*').order('updated_at',{ascending:false})
  if(error)throw error
  return(data||[]).map(norm)
}
async function dbProfiles(){
  const {data,error}=await sb.from('profiles').select('id,full_name,initials,color,role')
  if(error)throw error
  return data||[]
}
async function dbSave(model,uid){
  const row={
    name:model.name,description:model.description||'',
    visibility:model.visibility||'private',access:model.access||{},
    entity_types:model.entityTypes||[],state_variables:model.stateVariables||[],
    b_events:model.bEvents||[],c_events:model.cEvents||[],owner_id:uid,
  }
  if(model.id){
    const {data,error}=await sb.from('des_models').update(row).eq('id',model.id).select().single()
    if(error)throw error
    return norm(data)
  }else{
    const {data,error}=await sb.from('des_models').insert(row).select().single()
    if(error)throw error
    return norm(data)
  }
}
async function dbDelete(id){
  const {error}=await sb.from('des_models').delete().eq('id',id)
  if(error)throw error
}
async function dbSetVis(id,vis){
  const {error}=await sb.from('des_models').update({visibility:vis}).eq('id',id)
  if(error)throw error
}
async function dbSetAccess(id,access){
  const {error}=await sb.from('des_models').update({access}).eq('id',id)
  if(error)throw error
}

// ── Auth Screen ──────────────────────────────────────────────
function AuthScreen(){
  const [mode,setMode]=useState('login')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [name,setName]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [info,setInfo]=useState('')
  const submit=async()=>{
    setError('');setInfo('');setLoading(true)
    try{
      if(mode==='login'){
        const {error}=await sb.auth.signInWithPassword({email,password})
        if(error)throw error
      }else{
        const {error}=await sb.auth.signUp({email,password,options:{data:{full_name:name}}})
        if(error)throw error
        setInfo('Account created! Sign in directly.')
        setMode('login')
      }
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  }
  const inp={background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:13,padding:'10px 12px',outline:'none',width:'100%',boxSizing:'border-box'}
  return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>
      <div style={{width:380,display:'flex',flexDirection:'column',gap:20}}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:28,fontWeight:700,color:C.accent,letterSpacing:3}}>DES STUDIO</div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>Three-Phase Discrete-Event Simulation</div>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:24,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
            {['login','signup'].map(m=>(
              <button key={m} onClick={()=>setMode(m)} style={{flex:1,background:'none',border:'none',borderBottom:mode===m?`2px solid ${C.accent}`:'2px solid transparent',color:mode===m?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:'8px 0',cursor:'pointer',fontWeight:mode===m?700:400,textTransform:'uppercase',letterSpacing:1}}>
                {m==='login'?'Sign In':'Sign Up'}
              </button>
            ))}
          </div>
          {mode==='signup'&&<div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:'uppercase'}}>Full Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" style={inp}/></div>}
          <div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:'uppercase'}}>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email" style={inp}/></div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:'uppercase'}}>Password</label><input value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" type="password" style={inp}/></div>
          {error&&<div style={{background:C.red+'18',border:`1px solid ${C.red}44`,borderRadius:5,padding:'8px 12px',fontSize:12,color:C.red}}>{error}</div>}
          {info&&<div style={{background:C.green+'18',border:`1px solid ${C.green}44`,borderRadius:5,padding:'8px 12px',fontSize:12,color:C.green}}>{info}</div>}
          <button onClick={submit} disabled={loading} style={{background:C.accent,color:'#080c10',border:'none',borderRadius:6,padding:'11px 0',fontFamily:FONT,fontSize:13,fontWeight:700,cursor:loading?'not-allowed':'pointer',opacity:loading?0.6:1,width:'100%'}}>
            {loading?'Please wait...':mode==='login'?'Sign In':'Create Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

const ModelDetail=({modelId,modelData,onBack,onRefresh,overrides={}})=>{
  const [model,setModel]=useState(()=>modelData||null);
  const [tab,setTab]=useState("overview");
  const [dirty,setDirty]=useState(false);
  const isOwner=overrides.isOwner!==undefined?overrides.isOwner:false;
  const canEdit=overrides.canEdit!==undefined?overrides.canEdit:false;
  const setField=(f,v)=>{setModel(m=>({...m,[f]:v}));setDirty(true);};
  const save=async()=>{if(overrides.onSave)await overrides.onSave(model);setDirty(false);onRefresh();};

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
        <div style={{display:"flex",gap:10}}><Btn variant="ghost" onClick={onClose} full>Cancel</Btn><Btn variant="primary" onClick={create} disabled={!name.trim()} full disabled={saving}>{saving?"Saving...":"Create"}</Btn></div>
      </div>
    </div>
  );
};

// ── App ──────────────────────────────────────────────────────
export default function App(){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [profiles,setProfiles]=useState([])
  const [models,setModels]=useState([])
  const [tab,setTab]=useState('my')
  const [openId,setOpenId]=useState(null)
  const [showNew,setShowNew]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{
    sb.auth.getSession().then(({data:{session}})=>{
      setSession(session)
      if(!session)setLoading(false)
    })
    const {data:{subscription}}=sb.auth.onAuthStateChange((_,session)=>{
      setSession(session)
      if(!session){setLoading(false);setModels([]);setProfile(null)}
    })
    return ()=>subscription.unsubscribe()
  },[])

  const loadData=useCallback(async()=>{
    if(!session)return
    setLoading(true);setError('')
    try{
      const [mods,profs]=await Promise.all([dbModels(),dbProfiles()])
      setModels(mods);setProfiles(profs)
      setProfile(profs.find(p=>p.id===session.user.id)||null)
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[session])

  useEffect(()=>{loadData()},[loadData])

  const uid=session?.user?.id
  const signOut=()=>sb.auth.signOut()

  if(!session)return <AuthScreen/>

  if(loading)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted,fontFamily:FONT,fontSize:13}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>
      Loading...
    </div>
  )

  if(error)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.red,fontFamily:FONT,fontSize:13,padding:24,textAlign:'center'}}>
      ERROR: {error}
    </div>
  )

  const myModels=models.filter(m=>m.owner_id===uid||m.access?.[uid])
  const pubModels=models.filter(m=>m.visibility==='public'&&m.owner_id!==uid)

  if(openId){
    const model=models.find(m=>m.id===openId)
    const isOwner=model?.owner_id===uid
    const canEdit=isOwner||model?.access?.[uid]==='editor'
    return(
      <div style={{background:C.bg,minHeight:'100vh'}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <ModelDetail modelId={openId}
          modelData={models.find(m=>m.id===openId)||null}
          onBack={()=>{setOpenId(null);loadData()}}
          onRefresh={loadData}
          overrides={{
            isOwner,canEdit,profiles,
            onSave:async(m)=>{await dbSave(m,uid);await loadData()},
            onDelete:async(id)=>{await dbDelete(id)},
            onSetVisibility:dbSetVis,
            onSetAccess:dbSetAccess,
          }}
        />
      </div>
    )
  }

  return(
    <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 24px',display:'flex',alignItems:'center',gap:16,height:52}}>
        <div style={{fontWeight:700,fontSize:14,color:C.accent,letterSpacing:2}}>DES STUDIO</div>
        <div style={{fontSize:11,color:C.muted,borderLeft:`1px solid ${C.border}`,paddingLeft:16}}>Three-Phase · Entities · Servers</div>
        <div style={{flex:1}}/>
        {profile&&(
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:(profile.color||C.accent)+'22',border:`1.5px solid ${profile.color||C.accent}55`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:profile.color||C.accent}}>
              {profile.initials||'?'}
            </div>
            <span style={{fontSize:12,color:C.muted}}>{profile.full_name}</span>
          </div>
        )}
        <button onClick={signOut} style={{background:'#ffffff08',border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,fontFamily:FONT,fontSize:11,padding:'5px 12px',cursor:'pointer',fontWeight:600}}>Sign Out</button>
      </div>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:700,color:C.text,marginBottom:4}}>Model Library</h1>
            <p style={{fontSize:12,color:C.muted}}>Build and share discrete-event simulation models.</p>
          </div>
          <Btn variant="primary" onClick={()=>setShowNew(true)}>+ New Model</Btn>
        </div>
        <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:24}}>
          {[{id:'my',label:`My Models (${myModels.length})`},{id:'public',label:`Public Library (${pubModels.length})`}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${C.accent}`:'2px solid transparent',color:tab===t.id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:'10px 18px',cursor:'pointer',fontWeight:tab===t.id?700:400}}>{t.label}</button>
          ))}
        </div>
        {tab==='my'&&(myModels.length===0
          ?<Empty icon="📐" msg="No models yet. Create your first DES model."/>
          :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
            {myModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>setOpenId(m.id)}/>)}
          </div>)}
        {tab==='public'&&(pubModels.length===0
          ?<Empty icon="🌐" msg="No public models available."/>
          :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
            {pubModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>setOpenId(m.id)}/>)}
          </div>)}
      </div>
      {showNew&&(
        <NewModelModal onClose={()=>setShowNew(false)} onCreate={async(name,desc)=>{
          const m=await dbSave({name,description:desc,entityTypes:[],stateVariables:[],bEvents:[],cEvents:[]},uid)
          await loadData()
          setOpenId(m.id)
        }}/>
      )}
    </div>
  )
}
