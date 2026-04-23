import { useState, useRef, useCallback, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// DISTRIBUTIONS
// ═══════════════════════════════════════════════════════════════════════════════
const DISTRIBUTIONS = {
  Fixed:       { params:["value"],            label:"Fixed",                    hint:"Always exactly this value" },
  Uniform:     { params:["min","max"],        label:"Uniform(min, max)",        hint:"Equal chance across [min, max]" },
  Exponential: { params:["mean"],             label:"Exponential(mean)",        hint:"Memoryless — classic inter-arrival" },
  Normal:      { params:["mean","stddev"],    label:"Normal(μ, σ)",             hint:"Bell curve, clipped at 0" },
  Triangular:  { params:["min","mode","max"], label:"Triangular(min,mode,max)", hint:"Best/likely/worst estimate" },
  Erlang:      { params:["k","mean"],         label:"Erlang(k, mean)",          hint:"k-phase service process" },
  ServerAttr:  { params:["attr"],             label:"Server attribute",         hint:"Read from matched server entity (e.g. serviceTime)" },
};

function sample(dist, params) {
  const p = params || {};
  switch (dist) {
    case "Fixed":       return parseFloat(p.value) || 0;
    case "Uniform":     { const lo=parseFloat(p.min)||0,hi=parseFloat(p.max)||1; return lo+Math.random()*(hi-lo); }
    case "Exponential": return -(parseFloat(p.mean)||1)*Math.log(Math.max(1e-15,1-Math.random()));
    case "Normal":      { const m=parseFloat(p.mean)||1,s=parseFloat(p.stddev)||0.2,u1=Math.random(),u2=Math.random();
                          return Math.max(0,m+s*Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2)); }
    case "Triangular":  { const a=parseFloat(p.min)||0,c=parseFloat(p.mode)||0.5,b=parseFloat(p.max)||1,
                              u=Math.random(),fc=(c-a)/(b-a);
                          return u<fc ? a+Math.sqrt(u*(b-a)*(c-a)) : b-Math.sqrt((1-u)*(b-a)*(b-c)); }
    case "Erlang":      { const k=Math.max(1,Math.round(parseFloat(p.k)||1)),m=parseFloat(p.mean)||1;
                          let prod=1; for(let i=0;i<k;i++) prod*=Math.random();
                          return -Math.log(Math.max(1e-15,prod))/(k/m); }
    default:            return parseFloat(p.value)||0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEPPER ENGINE — produces one cycle at a time for step-through UI
// ═══════════════════════════════════════════════════════════════════════════════
function buildEngine(model) {
  let entitySeq = 0;

  // Initialise scalar state
  const state = { __served:0, __reneged:0 };
  (model.stateVariables||[]).forEach(sv => {
    try   { state[sv.name] = JSON.parse(sv.initialValue); }
    catch { state[sv.name] = sv.initialValue; }
  });

  // Pre-create server entities
  const entities = [];
  (model.entityTypes||[]).forEach(et => {
    if (et.role === "server") {
      const n = parseInt(et.count)||1;
      for (let i=0;i<n;i++) {
        entitySeq++;
        entities.push({ id:entitySeq, type:et.name, role:"server", status:"idle",
          attrs:parseAttrs(et.attrs), arrivalTime:0 });
      }
    }
  });

  function parseAttrs(s) {
    const o={};
    if (!s) return o;
    s.split(",").forEach(p=>{const[k,v]=(p||"").split("=").map(x=>x.trim());if(!k)return;const n=parseFloat(v);o[k]=isNaN(n)?v:n;});
    return o;
  }

  const waitingOf  = (type) => entities.filter(e=>e.type===type&&e.status==="waiting").sort((a,b)=>a.arrivalTime-b.arrivalTime);
  const idleOf     = (type) => entities.filter(e=>e.type===type&&e.status==="idle");
  const busyOf     = (type) => entities.filter(e=>e.type===type&&(e.status==="busy"||e.status==="serving"));

  let _lastCustId=null, _lastSrvId=null;

  function resolveDelay(raw, srvId, custId) {
    const n=parseFloat(raw); if(!isNaN(n)) return n;
    const sm=String(raw).match(/^server\.(\w+)$/i);  if(sm){ const e=entities.find(x=>x.id===srvId); return parseFloat(e?.attrs?.[sm[1]])||1; }
    const cm=String(raw).match(/^customer\.(\w+)$/i);if(cm){ const e=entities.find(x=>x.id===custId);return parseFloat(e?.attrs?.[cm[1]])||1; }
    return 0;
  }

  // Parse inline dist params from SCHEDULE: "mean=3;stddev=0.5"
  function parseInlineDistParams(s) {
    const o={};
    (s||"").split(";").forEach(kv=>{const[k,v]=(kv||"").split("=").map(x=>x.trim());if(k)o[k]=v;});
    return o;
  }

  // Apply SCHEDULE macro — used by both B and C effect processors
  function scheduleFromSpec(spec, clock, felEntries, msgs) {
    // spec: { eventName, dist, distParams, rawDelay }
    const bev = (model.bEvents||[]).find(b=>b.name.trim()===spec.eventName.trim());
    if (!bev) { msgs.push(`SCHEDULE: B-event "${spec.eventName}" not found`); return; }

    let delay;
    if (spec.dist && DISTRIBUTIONS[spec.dist]) {
      delay = Math.max(0, sample(spec.dist, spec.distParams||{}));
    } else {
      delay = Math.max(0, resolveDelay((spec.rawDelay||"0").trim(), _lastSrvId, _lastCustId));
    }

    const entry = { ...bev, scheduledTime:clock+delay,
      _sampledDelay:`${spec.dist||"fixed"}(${delay.toFixed(3)})`,
      _contextCustId:_lastCustId, _contextSrvId:_lastSrvId };
    felEntries.push(entry);
    msgs.push(`Scheduled "${spec.eventName}" @ t=${(clock+delay).toFixed(3)} [delay=${delay.toFixed(3)}${spec.dist?` via ${spec.dist}`:""}${_lastCustId?`, cust #${_lastCustId}`:""}${_lastSrvId?`, srv #${_lastSrvId}`:""}]`);
  }

  function applyEffect(effect, clock, felRef) {
    if (!effect||!effect.trim()) return {msgs:[],felEntries:[]};
    const msgs=[], felEntries=[];
    _lastCustId=felRef?._contextCustId||null;
    _lastSrvId =felRef?._contextSrvId||null;

    effect.split(";").map(s=>s.trim()).filter(Boolean).forEach(part=>{

      // ARRIVE(Type)
      const mArr=part.match(/^ARRIVE\((\w+)\)$/i);
      if(mArr){ const et=(model.entityTypes||[]).find(e=>e.name===mArr[1]); entitySeq++;
        const ent={id:entitySeq,type:mArr[1],role:et?.role||"customer",status:"waiting",
          attrs:parseAttrs(et?.attrs||""),arrivalTime:clock};
        entities.push(ent); _lastCustId=ent.id;
        msgs.push(`Entity #${ent.id} (${mArr[1]}) arrived → waiting [queue: ${waitingOf(mArr[1]).length}]`); return; }

      // ASSIGN(CustomerType, ServerType)
      const mAss=part.match(/^ASSIGN\((\w+)\s*,\s*(\w+)\)$/i);
      if(mAss){ const[,ct,st]=mAss; const cust=waitingOf(ct)[0]; const srv=idleOf(st)[0];
        if(cust&&srv){ cust.status="serving";cust.serviceStart=clock;cust.serverId=srv.id;
          srv.status="busy";srv.currentCustId=cust.id; _lastCustId=cust.id;_lastSrvId=srv.id;
          msgs.push(`#${cust.id} (${ct}) → serving by Server #${srv.id} [waited ${(clock-cust.arrivalTime).toFixed(3)} t, srv.attrs: ${JSON.stringify(srv.attrs)}]`);
        } else msgs.push(`ASSIGN(${ct},${st}): no match — q=${waitingOf(ct).length} idle=${idleOf(st).length}`);
        return; }

      // SCHEDULE(eventName, delay [, DistName, distParams])
      // Also handles SCHEDULE(eventName, server.attr) with no dist
      const mSch=part.match(/^SCHEDULE\(\s*([^,]+?)\s*,\s*([^,)]+?)(?:\s*,\s*(\w+)(?:\s*,\s*(.+?))?)?\s*\)$/i);
      if(mSch){
        const[,evName,rawDelay,distName,distParamsStr]=mSch;
        scheduleFromSpec({
          eventName:evName.trim(),
          dist: distName&&DISTRIBUTIONS[distName]?distName:null,
          distParams: distName&&DISTRIBUTIONS[distName]?parseInlineDistParams(distParamsStr):{},
          rawDelay:rawDelay.trim()
        }, clock, felEntries, msgs);
        return; }

      // COMPLETE()  — use FEL context
      const mCmp=part.match(/^COMPLETE\(\)$/i);
      if(mCmp){ const cust=entities.find(e=>e.id===felRef?._contextCustId);
        const srv=entities.find(e=>e.id===felRef?._contextSrvId);
        if(cust&&(cust.status==="serving"||cust.status==="waiting")){
          cust.status="done";cust.completionTime=clock;
          state.__served=(state.__served||0)+1;
          msgs.push(`#${cust.id} (${cust.type}) → done [svc ${(clock-(cust.serviceStart||clock)).toFixed(3)} t]`); }
        if(srv){srv.status="idle";delete srv.currentCustId;msgs.push(`Server #${srv.id} → idle`);}
        return; }

      // RENEGE(ctx) — skip if not waiting
      const mRen=part.match(/^RENEGE\((\w+)\)$/i);
      if(mRen){ const id=mRen[1]==="ctx"?(felRef?._contextCustId):parseInt(mRen[1]);
        const ent=entities.find(e=>e.id===id);
        if(ent&&ent.status==="waiting"){ent.status="reneged";ent.renegeTime=clock;
          state.__reneged=(state.__reneged||0)+1;
          msgs.push(`#${ent.id} reneged after ${(clock-ent.arrivalTime).toFixed(3)} t`);}
        else if(ent) msgs.push(`RENEGE skipped — #${id} already ${ent.status}`);
        return; }

      // RENEGE_OLDEST(Type)
      const mRO=part.match(/^RENEGE_OLDEST\((\w+)\)$/i);
      if(mRO){ const ent=waitingOf(mRO[1])[0];
        if(ent){ent.status="reneged";ent.renegeTime=clock;
          state.__reneged=(state.__reneged||0)+1;
          msgs.push(`#${ent.id} (${mRO[1]}) reneged after ${(clock-ent.arrivalTime).toFixed(3)} t`);}
        return; }

      // Scalar effects
      try{
        const r1=part.match(/^(\w+)\+\+$/),r2=part.match(/^(\w+)--$/),
              r3=part.match(/^(\w+)\s*\+=\s*(.+)$/),r4=part.match(/^(\w+)\s*-=\s*(.+)$/),
              r5=part.match(/^(\w+)\s*=\s*(.+)$/);
        if(r1)state[r1[1]]=(Number(state[r1[1]])||0)+1;
        else if(r2)state[r2[1]]=(Number(state[r2[1]])||0)-1;
        else if(r3)state[r3[1]]=(Number(state[r3[1]])||0)+parseFloat(r3[2]);
        else if(r4)state[r4[1]]=(Number(state[r4[1]])||0)-parseFloat(r4[2]);
        else if(r5){let v=r5[2].trim();
          Object.keys(state).filter(k=>!k.startsWith("__")).forEach(k=>{
            v=v.replace(new RegExp(`\\b${k}\\b`,"g"),typeof state[k]==="string"?`"${state[k]}"`:String(state[k]));});
          v=v.replace(/\bclock\b/g,String(clock));
          try{state[r5[1]]=new Function(`return(${v})`)();}catch{state[r5[1]]=r5[2].trim();}}
      }catch(e){msgs.push(`Effect error: ${e.message}`);}
    });
    return {msgs,felEntries};
  }

  function evalCond(cond, clock) {
    if(!cond||!cond.trim())return false;
    try{
      let expr=cond;
      expr=expr.replace(/queue\((\w+)\)\.length/g,(_,t)=>String(waitingOf(t).length));
      expr=expr.replace(/idle\((\w+)\)\.count/g,(_,t)=>String(idleOf(t).length));
      expr=expr.replace(/busy\((\w+)\)\.count/g,(_,t)=>String(busyOf(t).length));
      expr=expr.replace(/attr\((\w+)\s*,\s*(\w+)\)/g,(_,t,a)=>{
        const e=idleOf(t)[0]; const v=e?.attrs?.[a];
        return v===undefined?"0":(typeof v==="string"?`"${v}"`:String(v));});
      expr=expr.replace(/\bserved\b/g,String(state.__served||0));
      expr=expr.replace(/\breneged\b/g,String(state.__reneged||0));
      expr=expr.replace(/\bclock\b/g,String(clock));
      Object.keys(state).filter(k=>!k.startsWith("__")).forEach(k=>{
        expr=expr.replace(new RegExp(`\\b${k}\\b`,"g"),typeof state[k]==="string"?`"${state[k]}"`:String(state[k]));});
      expr=expr.replace(/\bAND\b/gi,"&&").replace(/\bOR\b/gi,"||");
      return !!new Function(`return(${expr})`)();
    }catch{return false;}
  }

  function snap(clock) {
    const types=[...new Set(entities.map(e=>e.type))];
    const byType={};
    types.forEach(t=>{byType[t]={waiting:waitingOf(t).length,idle:idleOf(t).length,busy:busyOf(t).length,total:entities.filter(e=>e.type===t).length};});
    return { clock:clock||0, served:state.__served||0, reneged:state.__reneged||0,
      byType, entities:entities.map(e=>({...e,attrs:{...e.attrs}})),
      scalars:Object.fromEntries(Object.entries(state).filter(([k])=>!k.startsWith("__")))};
  }

  // Build initial FEL
  let fel = (model.bEvents||[]).filter(ev=>parseFloat(ev.scheduledTime)<900)
    .map(ev=>({...ev,scheduledTime:parseFloat(ev.scheduledTime)||0}))
    .sort((a,b)=>a.scheduledTime-b.scheduledTime);

  let clock=0;
  const log=[];
  log.push({phase:"INIT",time:0,message:"Simulation initialised",snap:snap(0)});

  // Step function: run ONE full Phase A→B→C cycle, return {done, cycleLog, snap}
  function step() {
    if (fel.length===0) {
      log.push({phase:"END",time:clock,message:"FEL empty — simulation complete",snap:snap(clock)});
      return {done:true, cycleLog:[{phase:"END",time:clock,message:"FEL empty — simulation complete"}], snap:snap(clock)};
    }

    const cycleLog=[];

    // Phase A
    clock=fel[0].scheduledTime;
    cycleLog.push({phase:"A",time:clock,message:`Clock → t=${clock.toFixed(3)}`});
    log.push({phase:"A",time:clock,message:`Clock → t=${clock.toFixed(3)}`,snap:snap(clock)});

    // Phase B
    const due=fel.filter(ev=>Math.abs(ev.scheduledTime-clock)<1e-9);
    fel=fel.filter(ev=>Math.abs(ev.scheduledTime-clock)>=1e-9);

    due.forEach(ev=>{
      // Reneging guard
      if(ev._contextCustId!==undefined&&ev.name.toLowerCase().includes("renege")){
        const c=entities.find(e=>e.id===ev._contextCustId);
        if(c&&c.status!=="waiting"){
          const m=`Skipped: "${ev.name}" — #${ev._contextCustId} already ${c?.status}`;
          cycleLog.push({phase:"B",time:clock,message:m,skipped:true});
          log.push({phase:"B",time:clock,message:m,snap:snap(clock),skipped:true});
          return;
        }
      }
      const {msgs,felEntries}=applyEffect(ev.effect,clock,ev);
      (ev.schedules||[]).forEach(s=>{
        const tmpl=(model.bEvents||[]).find(b=>b.id===s.eventId); if(!tmpl)return;
        const delay=Math.max(0,sample(s.dist||"Fixed",s.distParams||{value:s.delay||"0"}));
        const entry={...tmpl,scheduledTime:clock+delay,_sampledDelay:`${s.dist||"Fixed"}(${delay.toFixed(3)})`,_isRenege:!!s.isRenege,
          ...(s.isRenege?(()=>{const newest=entities.filter(e=>e.status==="waiting").sort((a,b)=>b.arrivalTime-a.arrivalTime)[0];return newest?{_contextCustId:newest.id}:{}})():{})};
        felEntries.push(entry);
      });
      felEntries.forEach(e=>fel.push(e));
      fel.sort((a,b)=>a.scheduledTime-b.scheduledTime);
      const m=[`B: "${ev.name}"`,ev._sampledDelay?`[${ev._sampledDelay}]`:"",...msgs].filter(Boolean).join("  ·  ");
      cycleLog.push({phase:"B",time:clock,message:m});
      log.push({phase:"B",time:clock,message:m,snap:snap(clock)});
    });

    // Phase C
    let cFired=true,cPass=0;
    while(cFired&&cPass<100){
      cFired=false;cPass++;
      (model.cEvents||[]).forEach(ev=>{
        if(!evalCond(ev.condition,clock))return;
        // applyEffect handles ASSIGN macro and sets _lastCustId / _lastSrvId as side-effect
        const {msgs,felEntries}=applyEffect(ev.effect,clock,null);

        // ── Structured cSchedules — the reliable C→B scheduling path ─────────
        // Each entry: { eventId, dist, distParams, useEntityCtx }
        // dist="ServerAttr" reads the matched server's attribute instead of sampling
        (ev.cSchedules||[]).forEach(s=>{
          const tmpl=(model.bEvents||[]).find(b=>b.id===s.eventId);
          if(!tmpl){msgs.push(`cSchedule: B-event "${s.eventId}" not found`);return;}
          let delay=0;
          if(s.dist==="ServerAttr"){
            const attrName=(s.distParams&&s.distParams.attr)||"serviceTime";
            const srv=entities.find(e=>e.id===_lastSrvId);
            delay=Math.max(0,parseFloat(srv&&srv.attrs&&srv.attrs[attrName])||1);
            msgs.push(`Scheduled "${tmpl.name}" delay=${delay.toFixed(3)} from server.${attrName}`);
          } else {
            delay=Math.max(0,sample(s.dist||"Fixed",s.distParams||{value:"1"}));
            msgs.push(`Scheduled "${tmpl.name}" @ t=${(clock+delay).toFixed(3)} [${s.dist||"Fixed"}(${delay.toFixed(3)})]`);
          }
          felEntries.push({
            ...tmpl,
            scheduledTime:clock+delay,
            _sampledDelay:`${s.dist}(${delay.toFixed(3)})`,
            _contextCustId:s.useEntityCtx?_lastCustId:undefined,
            _contextSrvId: s.useEntityCtx?_lastSrvId :undefined,
          });
        });

        felEntries.forEach(e=>fel.push(e));
        if(felEntries.length)fel.sort((a,b)=>a.scheduledTime-b.scheduledTime);
        cFired=true;
        const m=[`C: "${ev.name}"`,...msgs].filter(Boolean).join("  ·  ");
        cycleLog.push({phase:"C",time:clock,message:m});
        log.push({phase:"C",time:clock,message:m,snap:snap(clock)});
      });
      if(!cFired){
        cycleLog.push({phase:"C",time:clock,message:"No C-events can fire → Phase A"});
        log.push({phase:"C",time:clock,message:"No C-events can fire → Phase A",snap:snap(clock)});
      }
    }

    return {done:false, cycleLog, snap:snap(clock), felSize:fel.length};
  }

  function runAll(maxCycles=800) {
    let c=0; while(fel.length>0&&c<maxCycles){c++;const r=step();if(r.done)break;}
    log.push({phase:"END",time:clock,message:"Simulation complete",snap:snap(clock)});
    const customers=entities.filter(e=>e.role!=="server");
    const servers=entities.filter(e=>e.role==="server");
    const served=customers.filter(e=>e.status==="done").length;
    const reneged=customers.filter(e=>e.status==="reneged").length;
    const avgWait=(()=>{const d=customers.filter(e=>e.status==="done"&&e.serviceStart!=null);if(!d.length)return null;return d.reduce((s,e)=>s+(e.serviceStart-e.arrivalTime),0)/d.length;})();
    const avgSvc=(()=>{const d=customers.filter(e=>e.status==="done"&&e.completionTime!=null);if(!d.length)return null;return d.reduce((s,e)=>s+(e.completionTime-e.serviceStart),0)/d.length;})();
    return { finalTime:clock, log, snap:snap(clock),
      summary:{total:customers.length,served,reneged,avgWait,avgSvc},
      entitySummary:entities.map(e=>({...e,attrs:{...e.attrs}})) };
  }

  return { step, runAll, getSnap:()=>snap(clock), getFelSize:()=>fel.length };
}

// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
const sb=createClient(
  'https://znkknldzdfajcrpabtmg.supabase.co',
  'YOUR_ANON_KEY'
);
const norm=(r)=>({
  id:r.id,name:r.name,description:r.description||'',
  visibility:r.visibility,access:r.access||{},
  entityTypes:r.entity_types||[],stateVariables:r.state_variables||[],
  bEvents:r.b_events||[],cEvents:r.c_events||[],
  owner_id:r.owner_id,owner:r.owner_id,
  createdAt:r.created_at,updatedAt:r.updated_at,
});
async function dbGetModels(){
  const {data,error}=await sb.from('des_models').select('*').order('updated_at',{ascending:false});
  if(error)throw error;
  return(data||[]).map(norm);
}
async function dbGetProfiles(){
  const {data,error}=await sb.from('profiles').select('id,full_name,initials,color,role');
  if(error)throw error;
  return data||[];
}
async function dbSave(model,userId){
  const row={
    name:model.name,description:model.description||'',
    visibility:model.visibility||'private',access:model.access||{},
    entity_types:model.entityTypes||[],state_variables:model.stateVariables||[],
    b_events:model.bEvents||[],c_events:model.cEvents||[],
    owner_id:userId,
  };
  if(model.id){
    const {data,error}=await sb.from('des_models').update(row).eq('id',model.id).select().single();
    if(error)throw error;return norm(data);
  }else{
    const {data,error}=await sb.from('des_models').insert(row).select().single();
    if(error)throw error;return norm(data);
  }
}
async function dbDelete(id){const {error}=await sb.from('des_models').delete().eq('id',id);if(error)throw error;}
async function dbSetVisibility(id,vis){const {error}=await sb.from('des_models').update({visibility:vis}).eq('id',id);if(error)throw error;}
async function dbSetAccess(id,access){const {error}=await sb.from('des_models').update({access}).eq('id',id);if(error)throw error;}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function AuthScreen(){
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');
  const submit=async()=>{
    setError('');setInfo('');setLoading(true);
    try{
      if(mode==='login'){const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;}
      else{const {error}=await sb.auth.signUp({email,password,options:{data:{full_name:name}}});if(error)throw error;setInfo('Check your email to confirm, then sign in.');setMode('login');}
    }catch(e){setError(e.message);}
    finally{setLoading(false);}
  };
  const inp={background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:13,padding:'10px 12px',outline:'none',width:'100%',boxSizing:'border-box'};
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
            {loading?'⟳ Please wait…':mode==='login'?'Sign In':'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

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

const ModelDetail=({modelId,onBack,onRefresh,overrides={}})=>{
  const [model,setModel]=useState(()=>DB.get(modelId));
  const [tab,setTab]=useState("overview");
  const [dirty,setDirty]=useState(false);
  const isOwner=overrides.isOwner!==undefined?overrides.isOwner:DB.isOwner(modelId);
  const canEdit=overrides.canEdit!==undefined?overrides.canEdit:DB.canEdit(modelId);
  const setField=(f,v)=>{setModel(m=>({...m,[f]:v}));setDirty(true);};
  const save=async()=>{if(overrides.onSave)await overrides.onSave(model);else DB.save(model);setDirty(false);onRefresh();};

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
              <Btn variant={model.visibility==="private"?"primary":"ghost"} onClick={()=>{if(overrides.onSetVisibility)overrides.onSetVisibility(modelId,"private").then(onRefresh);else{DB.setVisibility(modelId,"private");setModel({...DB.get(modelId)});onRefresh();}}} small>🔒 Private</Btn>
              <Btn variant={model.visibility==="public"?"success":"ghost"} onClick={()=>{if(overrides.onSetVisibility)overrides.onSetVisibility(modelId,"public").then(onRefresh);else{DB.setVisibility(modelId,"public");setModel({...DB.get(modelId)});onRefresh();}}} small>🌐 Public</Btn>
            </div>
            {(overrides.profiles||DB.allUsers().map(u=>({id:u.id,full_name:u.name,initials:u.initials,color:u.color}))).filter(u=>u.id!==model.owner_id&&u.id!==model.owner).map(u=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <Avatar u={u} size={26}/>
                <span style={{flex:1,fontSize:12,color:C.text,fontFamily:FONT}}>{u.name}</span>
                <select value={model.access?.[u.id]||"none"} onChange={e=>{if(overrides.onSetAccess)overrides.onSetAccess(modelId,{...(model.access||{}),[u.id]:e.target.value}).then(onRefresh);else{DB.setAccess(modelId,u.id,e.target.value);setModel({...DB.get(modelId)});}}}
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
  const [saving,setSaving]=useState(false);
  const create=async()=>{if(!name.trim())return;setSaving(true);try{await onCreate(name.trim(),desc.trim());}finally{setSaving(false);}onClose();};
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:28,width:420,fontFamily:FONT,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text}}>New DES Model</div>
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Queue with Reneging"/>
        <Field label="Description" value={desc} onChange={setDesc} multiline rows={3}/>
        <div style={{display:"flex",gap:10}}><Btn variant="ghost" onClick={onClose} full>Cancel</Btn><Btn variant="primary" onClick={create} disabled={!name.trim()} full disabled={saving}>{saving?"Creating…":"Create"}</Btn></div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [profiles,setProfiles]=useState([]);
  const [models,setModels]=useState([]);
  const [tab,setTab]=useState('my');
  const [openId,setOpenId]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    sb.auth.getSession().then(({data:{session}})=>{setSession(session);if(!session)setLoading(false);});
    const {data:{subscription}}=sb.auth.onAuthStateChange((_,session)=>{
      setSession(session);
      if(!session){setLoading(false);setModels([]);setProfile(null);}
    });
    return ()=>subscription.unsubscribe();
  },[]);

  const loadData=useCallback(async()=>{
    if(!session)return;
    setLoading(true);setError('');
    try{
      const [mods,profs]=await Promise.all([dbGetModels(),dbGetProfiles()]);
      setModels(mods);setProfiles(profs);
      setProfile(profs.find(p=>p.id===session.user.id)||null);
    }catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[session]);

  useEffect(()=>{loadData();},[loadData]);

  const userId=session?.user?.id;
  const signOut=()=>sb.auth.signOut();

  if(!session)return <AuthScreen/>;

  if(loading)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted,fontFamily:FONT,fontSize:13}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>
      ⟳ Loading…
    </div>
  );

  const myModels=models.filter(m=>m.owner_id===userId||m.access?.[userId]);
  const publicModels=models.filter(m=>m.visibility==='public'&&m.owner_id!==userId);

  if(openId){
    const model=models.find(m=>m.id===openId);
    const isOwner=model?.owner_id===userId;
    const canEdit=isOwner||model?.access?.[userId]==='editor';
    return(
      <div style={{background:C.bg,minHeight:'100vh'}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <ModelDetail modelId={openId} onBack={()=>{setOpenId(null);loadData();}} onRefresh={loadData}
          overrides={{
            isOwner,canEdit,profiles,
            onSave:async(m)=>{await dbSave(m,userId);await loadData();},
            onSetVisibility:dbSetVisibility,
            onSetAccess:dbSetAccess,
          }}
        />
      </div>
    );
  }

  return(
    <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 24px',display:'flex',alignItems:'center',gap:16,height:52}}>
        <div style={{fontWeight:700,fontSize:14,color:C.accent,letterSpacing:2}}>DES STUDIO</div>
        <div style={{fontSize:11,color:C.muted,borderLeft:`1px solid ${C.border}`,paddingLeft:16}}>Three-Phase · Entities · Servers · Step-Through · Visual</div>
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
        {error&&<div style={{background:C.red+'18',border:`1px solid ${C.red}44`,borderRadius:6,padding:'10px 14px',fontSize:12,color:C.red,fontFamily:FONT,marginBottom:16}}>{error}</div>}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:700,color:C.text,marginBottom:4}}>Model Library</h1>
            <p style={{fontSize:12,color:C.muted}}>Build, execute and share discrete-event simulation models.</p>
          </div>
          <Btn variant="primary" onClick={()=>setShowNew(true)}>+ New Model</Btn>
        </div>
        <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:24}}>
          {[{id:'my',label:`My Models (${myModels.length})`},{id:'public',label:`Public Library (${publicModels.length})`}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${C.accent}`:'2px solid transparent',color:tab===t.id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:'10px 18px',cursor:'pointer',fontWeight:tab===t.id?700:400}}>{t.label}</button>
          ))}
        </div>
        {tab==='my'&&(myModels.length===0
          ?<Empty icon="📐" msg="No models yet. Create your first DES model."/>
          :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
            {myModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>setOpenId(m.id)}/>)}
          </div>)}
        {tab==='public'&&(publicModels.length===0
          ?<Empty icon="🌐" msg="No public models available."/>
          :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
            {publicModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>setOpenId(m.id)}/>)}
          </div>)}
      </div>
      {showNew&&<NewModelModal onClose={()=>setShowNew(false)} onCreate={async(name,desc)=>{
        const m=await dbSave({name,description:desc,entityTypes:[],stateVariables:[],bEvents:[],cEvents:[]},userId);
        await loadData();setOpenId(m.id);
      }}/>}
    </div>
  );
}
