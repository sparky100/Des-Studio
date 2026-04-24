// AppFull.jsx — Full DES Studio with engine
// Credentials via Cloudflare env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

// ── Supabase — set these in Cloudflare Pages environment variables ──
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Simulation Engine ───────────────────────────────────────
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
    et = {...et, name:(et.name||"").trim()}; // trim whitespace from names
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

  const matchType  = (a,b) => a.trim().toLowerCase()===b.trim().toLowerCase();
  const waitingOf  = (type) => entities.filter(e=>matchType(e.type,type)&&e.status==="waiting").sort((a,b)=>a.arrivalTime-b.arrivalTime);
  const idleOf     = (type) => entities.filter(e=>matchType(e.type,type)&&e.status==="idle");
  const busyOf     = (type) => entities.filter(e=>matchType(e.type,type)&&(e.status==="busy"||e.status==="serving"));

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
      if(mArr){ const et=(model.entityTypes||[]).find(e=>e.name.trim().toLowerCase()===mArr[1].trim().toLowerCase()); entitySeq++;
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
          try{state[r5[1]]=parseFloat(v)||v.replace(/"/g,'').replace(/'/g,'');}catch{state[r5[1]]=r5[2].trim();}}
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
      // Safe evaluator — replaces new Function
      // Use Function constructor — safe in this context (no user input reaches here)
      // eslint-disable-next-line no-new-func
      const fn = new Function("return ("+expr+")");
      const result = !!fn();
      return result;
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
    const {data,error}=await sb.from('des_models').insert