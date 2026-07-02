import { useState } from "react";
import { toTitleCase, normTypeName } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const displayEventName = name => String(name || "").replace(/\s*\((template|tmpl)\)\s*/gi, "").trim();
const queueDisplayName = name => {
  const text = String(name || "").trim();
  return /queue$/i.test(text) ? text : `${text} Queue`;
};

const conditionOptions = (entityTypes, stateVariables=[], queues=[]) => {
  const custs   = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>normTypeName(e.name));
  const servers = (entityTypes||[]).filter(e=>e.role==='server').map(e=>normTypeName(e.name));
  const opts = [{label:'— select condition —',value:''}];
  if(queues.length > 0) {
    opts.push({label:'── Number waiting in queue ──', value:'', disabled:true});
    queues.forEach(q => {
      const entityLabel = q.customerType ? normTypeName(q.customerType) : 'entity';
      opts.push({label:`${entityLabel} is waiting in ${q.name}`, value:`queue(${q.name}).length > 0`});
      opts.push({label:`${q.name} is empty (no one waiting)`, value:`queue(${q.name}).length == 0`});
    });
  }
  if(queues.length > 0 && servers.length > 0) {
    opts.push({label:'── Service start — queue has customers AND server is free ──', value:'', disabled:true});
    queues.forEach(q => {
      const entityLabel = q.customerType ? normTypeName(q.customerType) : 'entity';
      servers.forEach(s => {
        opts.push({
          label: `${entityLabel} waiting in ${q.name} AND ${s} is available`,
          value: `queue(${q.name}).length > 0 AND idle(${s}).count > 0`,
        });
      });
    });
  }
  if(servers.length > 0) {
    opts.push({label:'── Server availability ──', value:'', disabled:true});
    servers.forEach(s=>{
      opts.push({label:`${s} is available (at least one idle)`, value:`idle(${s}).count > 0`});
      opts.push({label:`${s} is in use (at least one busy)`, value:`busy(${s}).count > 0`});
    });
  }
  if(custs.length > 0) {
    opts.push({label:'── Number waiting by entity type ──', value:'', disabled:true});
    custs.forEach(c=>{
      opts.push({label:`Any ${c} is waiting`, value:`queue(${c}).length > 0`});
      opts.push({label:`No ${c} currently waiting`, value:`queue(${c}).length == 0`});
    });
  }
  opts.push({label:'── System totals ──', value:'', disabled:true});
  opts.push({label:'At least one entity has been served', value:'served > 0'});
  opts.push({label:'At least one entity has reneged', value:'reneged > 0'});
  return opts;
};

const assignOptions = (entityTypes, stateVariables=[], queues=[], contextName="", containerTypes=[], contextServer=null, modelSkills=[]) => {
  const custs   = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>normTypeName(e.name));
  const servers = (entityTypes||[]).filter(e=>e.role==='server').map(e=>normTypeName(e.name));
  const activeServers = contextServer ? servers.filter(s=>s===contextServer) : servers;
  const serverSkills = Object.fromEntries((entityTypes||[]).filter(e=>e.role==='server').map(e=>[normTypeName(e.name),Array.isArray(e.skills)?e.skills:[]]));
  const opts = [{label:'— select effect —',value:''}];
  const cName = contextName || "service";
  // Queue-based ASSIGN combinations
  if(queues.length > 0 && activeServers.length > 0) {
    opts.push({label:'── Start service from queue ──', value:'', disabled:true});
    queues.forEach(q => {
      activeServers.forEach(s => {
        opts.push({label:`Start ${cName} with ${s} and ${q.customerType||'entity'} from ${queueDisplayName(q.name)}`, value:`ASSIGN(${q.name}, ${s})`});
        const skills=serverSkills[s]||[];
        skills.forEach(skill=>{
          opts.push({label:`Start ${cName} with ${s} (${skill}) and ${q.customerType||'entity'} from ${queueDisplayName(q.name)}`, value:`ASSIGN(${q.name}, ${s}, "${skill}")`});
        });
        // Entity-driven skill: use entity's string attributes as skill source
        const custTypeForQueue = (entityTypes||[]).find(e => e.role === 'customer' &&
          (!q.customerType || normTypeName(q.customerType) === normTypeName(e.name)));
        const stringAttrs = ((custTypeForQueue?.attrDefs || [])
          .filter(a => a.valueType === 'string' && a.name)).map(a => a.name);
        stringAttrs.forEach(attr => {
          opts.push({
            label: `Start ${cName} with ${s} (← Entity.${attr}) and ${q.customerType||'entity'} from ${queueDisplayName(q.name)}`,
            value: `ASSIGN(${q.name}, ${s}, Entity.${attr})`,
          });
        });
      });
    });
  }
  // ASSIGN combinations
  if(custs.length>0&&activeServers.length>0){
    opts.push({label:'── ASSIGN ──',value:'',disabled:true});
    custs.forEach(c=>activeServers.forEach(s=>{
      opts.push({label:`Start ${cName} with ${s} and ${c}`,value:`ASSIGN(${c}, ${s})`});
      const skills=serverSkills[s]||[];
      skills.forEach(skill=>{
        opts.push({label:`Start ${cName} with ${s} (${skill}) and ${c}`,value:`ASSIGN(${c}, ${s}, "${skill}")`});
      });
      // Entity-driven skill from customer type's string attributes
      const custType = (entityTypes||[]).find(e => e.role === 'customer' && normTypeName(e.name) === c);
      const stringAttrs = ((custType?.attrDefs || [])
        .filter(a => a.valueType === 'string' && a.name)).map(a => a.name);
      stringAttrs.forEach(attr => {
        opts.push({
          label: `Start ${cName} with ${s} (← Entity.${attr}) and ${c}`,
          value: `ASSIGN(${c}, ${s}, Entity.${attr})`,
        });
      });
    }));
  }
  // BATCH options — C-Event macro
  if(queues.length > 0) {
    opts.push({label:'── BATCH (accumulate entities, fire when queue >= batchSize) ──',value:'',disabled:true});
    queues.forEach(q => {
      opts.push({label:`Batch 2 entities from ${queueDisplayName(q.name)}`, value:`BATCH(${q.name}, 2)`});
      opts.push({label:`Batch 5 entities from ${queueDisplayName(q.name)}`, value:`BATCH(${q.name}, 5)`});
      opts.push({label:`Batch 10 entities from ${queueDisplayName(q.name)}`, value:`BATCH(${q.name}, 10)`});
    });
  }
  // Scalar effects on state variables
  const svNames = (stateVariables||[]).map(sv=>sv.name).filter(Boolean);
  if(svNames.length>0){
    opts.push({label:'── Scalar effects ──',value:'',disabled:true});
    svNames.forEach(v=>{
      opts.push({label:`${v}++`,value:`${v}++`});
      opts.push({label:`${v}--`,value:`${v}--`});
      opts.push({label:`${v} += 1`,value:`${v} += 1`});
      opts.push({label:`${v} = 0`,value:`${v} = 0`});
    });
  }
  // SET state variable
  if(svNames.length>0){
    opts.push({label:'── SET state variable ──',value:'',disabled:true});
    svNames.forEach(v=>{
      opts.push({label:`SET ${v} = 0`,value:`SET(${v}, 0)`});
      opts.push({label:`SET ${v} = ${v} + 1`,value:`SET(${v}, ${v} + 1)`});
    });
  }
  // SET_ATTR entity attribute (mutable only)
  const custAttrs=(entityTypes||[]).filter(e=>e.role==='customer').flatMap(et=>(et.attrDefs||[]).filter(a=>a.mutable!==false).map(a=>a.name).filter(Boolean));
  if(custAttrs.length>0){
    opts.push({label:'── SET_ATTR (mutable entity attributes) ──',value:'',disabled:true});
    custAttrs.forEach(a=>{
      opts.push({label:`SET_ATTR ${a} = 0`,value:`SET_ATTR(${a}, 0)`});
      opts.push({label:`SET_ATTR ${a} = Entity.${a} + 1`,value:`SET_ATTR(${a}, Entity.${a} + 1)`});
    });
  }
  // COST
  opts.push({label:'── COST (accumulate to summary.totalCost) ──',value:'',disabled:true});
  opts.push({label:'COST(1) — flat rate',value:'COST(1)'});
  custAttrs.forEach(a=>{opts.push({label:`COST(Entity.${a})`,value:`COST(Entity.${a})`});});
  const ctNames = (containerTypes||[]).map(ct=>ct.id).filter(Boolean);
  if(ctNames.length>0){
    opts.push({label:'── DRAIN container (fires when level ≥ amount) ──',value:'',disabled:true});
    ctNames.forEach(c=>{
      opts.push({label:`Drain ${c} by 10`,value:`DRAIN(${c}, 10)`});
      opts.push({label:`Drain ${c} by 50`,value:`DRAIN(${c}, 50)`});
      opts.push({label:`Drain ${c} by 100`,value:`DRAIN(${c}, 100)`});
    });
  }
  // MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue) — pairs one entity from each
  // of two queues, merges attrs (B overwrites A on collision), routes pair to TargetQueue.
  if(queues.length>=2){
    opts.push({label:'── MATCH (pair one entity from each of two queues) ──',value:'',disabled:true});
    for(let i=0;i<queues.length;i++){
      for(let j=i+1;j<queues.length;j++){
        const qa=queues[i], qb=queues[j];
        const typeA = qa.customerType ? normTypeName(qa.customerType) : (custs[0]||'Entity');
        const typeB = qb.customerType ? normTypeName(qb.customerType) : (custs[0]||'Entity');
        queues.forEach(qt=>{
          opts.push({
            label: `Match ${typeA} from ${queueDisplayName(qa.name)} + ${typeB} from ${queueDisplayName(qb.name)} → ${queueDisplayName(qt.name)}`,
            value: `MATCH(${typeA}, ${qa.name}, ${typeB}, ${qb.name}, ${qt.name})`,
          });
        });
      }
    }
  }
  // COSEIZE(QueueName, ServerType1, ServerType2[, ...]) — atomically seizes one
  // customer and multiple server types together; fails cleanly if any is unavailable.
  if(queues.length>0&&servers.length>=2){
    opts.push({label:'── COSEIZE (seize entity + 2 server types at once) ──',value:'',disabled:true});
    queues.forEach(q=>{
      const entityLabel = q.customerType ? normTypeName(q.customerType) : 'entity';
      for(let i=0;i<servers.length;i++){
        for(let j=i+1;j<servers.length;j++){
          const s1=servers[i], s2=servers[j];
          const sk1=serverSkills[s1]||[], sk2=serverSkills[s2]||[];
          opts.push({
            label: `Seize ${s1} + ${s2} for ${entityLabel} from ${queueDisplayName(q.name)}`,
            value: `COSEIZE(${q.name}, ${s1}, ${s2})`,
          });
          sk1.forEach(skill=>{
            opts.push({
              label: `Seize ${s1}[${skill}] + ${s2} for ${entityLabel} from ${queueDisplayName(q.name)}`,
              value: `COSEIZE(${q.name}, ${s1}[${skill}], ${s2})`,
            });
          });
          sk2.forEach(skill=>{
            opts.push({
              label: `Seize ${s1} + ${s2}[${skill}] for ${entityLabel} from ${queueDisplayName(q.name)}`,
              value: `COSEIZE(${q.name}, ${s1}, ${s2}[${skill}])`,
            });
          });
        }
      }
    });
  }
  return opts;
};

const bEffectOptions = (entityTypes, queues=[], stateVariables=[], containerTypes=[], contextServers=null) => {
  const custs   = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>normTypeName(e.name));
  const servers = (entityTypes||[]).filter(e=>e.role==='server').map(e=>normTypeName(e.name));
  const activeServers = contextServers != null
    ? servers.filter(s => (Array.isArray(contextServers) ? contextServers : [contextServers]).filter(Boolean).includes(s))
    : servers;
  const opts = [{label:'— select effect —',value:''}];
  if(queues.length > 0) {
    opts.push({label:'── Add arriving entity to queue ──', value:'', disabled:true});
    custs.forEach(c => {
      queues
        .filter(q => !q.customerType || normTypeName(q.customerType) === c)
        .forEach(q => {
          opts.push({label:`Add ${c} to ${queueDisplayName(q.name)}`, value:`ARRIVE(${c}, ${q.name})`});
      });
    });
  } else {
    opts.push({label:'── Legacy arrivals ──', value:'', disabled:true});
    custs.forEach(c=>{
      opts.push({label:`Add ${c} to its default queue`,value:`ARRIVE(${c})`});
    });
  }
  opts.push({label:'Finish current service',value:'COMPLETE()'});
  opts.push({label:'Cancel waiting entity if still queued',value:'RENEGE(ctx)'});
  custs.forEach(c=>{
    opts.push({label:`Cancel oldest waiting ${c} from its queue`,value:`RENEGE_OLDEST(${c})`});
  });
  if(activeServers.length>0){
    opts.push({label:'── Release server (multi-stage routing) ──',value:'',disabled:true});
    activeServers.forEach(s=>{
      opts.push({label:`Release ${s} (entity stays in current stage)`,value:`RELEASE(${s})`});
    });
  }
  if(queues.length > 0 && activeServers.length > 0) {
    opts.push({label:'── Release server and route entity to next queue ──', value:'', disabled:true});
    activeServers.forEach(s => {
      queues.forEach(q => {
        const entityLabel = q.customerType ? normTypeName(q.customerType) : 'entity';
        opts.push({
          label: `Release ${s} and route ${entityLabel} to ${queueDisplayName(q.name)}`,
          value: `RELEASE(${s}, ${q.name})`
        });
      });
    });
  }
  if(queues.length > 0) {
    opts.push({label:'── UNBATCH (restore batch children to queue) ──', value:'', disabled:true});
    queues.forEach(q => {
      opts.push({label:`Unbatch into ${queueDisplayName(q.name)}`, value:`UNBATCH(${q.name})`});
    });
  }
  const svNames = (stateVariables||[]).map(sv=>sv.name).filter(Boolean);
  opts.push({label:'── Scalar effects ──',value:'',disabled:true});
  if(svNames.length>0){
    svNames.forEach(v=>{
      opts.push({label:`${v}++`,value:`${v}++`});
      opts.push({label:`${v}--`,value:`${v}--`});
      opts.push({label:`${v} += 1`,value:`${v} += 1`});
      opts.push({label:`${v} = 0`,value:`${v} = 0`});
    });
  } else {
    opts.push({label:'No state variables defined',value:'',disabled:true});
  }
  // SET state variable
  if(svNames.length>0){
    opts.push({label:'── SET state variable ──',value:'',disabled:true});
    svNames.forEach(v=>{
      opts.push({label:`SET ${v} = 0`,value:`SET(${v}, 0)`});
      opts.push({label:`SET ${v} = ${v} + 1`,value:`SET(${v}, ${v} + 1)`});
    });
  }
  // SET_ATTR entity attribute (mutable only)
  const custAttrs=(entityTypes||[]).filter(e=>e.role==='customer').flatMap(et=>(et.attrDefs||[]).filter(a=>a.mutable!==false).map(a=>a.name).filter(Boolean));
  if(custAttrs.length>0){
    opts.push({label:'── SET_ATTR (mutable entity attributes) ──',value:'',disabled:true});
    custAttrs.forEach(a=>{
      opts.push({label:`SET_ATTR ${a} = 0`,value:`SET_ATTR(${a}, 0)`});
      opts.push({label:`SET_ATTR ${a} = Entity.${a} + 1`,value:`SET_ATTR(${a}, Entity.${a} + 1)`});
    });
  }
  // COST
  opts.push({label:'── COST (accumulate to summary.totalCost) ──',value:'',disabled:true});
  opts.push({label:'COST(1) — flat rate',value:'COST(1)'});
  custAttrs.forEach(a=>{opts.push({label:`COST(Entity.${a})`,value:`COST(Entity.${a})`});});
  // PREEMPT, FAIL, REPAIR
  if(activeServers.length>0){
    opts.push({label:'── Server interruption / failure ──',value:'',disabled:true});
    activeServers.forEach(s=>{
      opts.push({label:`PREEMPT ${s} — interrupt current service`,value:`PREEMPT(${s})`});
      opts.push({label:`FAIL all ${s} servers`,value:`FAIL(${s})`});
      opts.push({label:`REPAIR ${s} servers`,value:`REPAIR(${s})`});
    });
  }
  // SPLIT(EntityType, N, TargetQueue) — creates N-1 clones of the context entity in TargetQueue
  if(queues.length>0&&custs.length>0){
    opts.push({label:'── SPLIT (clone entity into queue) ──',value:'',disabled:true});
    queues.forEach(q=>{
      const entityType = q.customerType ? normTypeName(q.customerType) : custs[0];
      [2,3,5].forEach(n=>{
        opts.push({label:`Split ${entityType} into ${n-1} clone(s) → ${queueDisplayName(q.name)}`,value:`SPLIT(${entityType}, ${n}, ${q.name})`});
      });
    });
  }
  const ctNames = (containerTypes||[]).map(ct=>ct.id).filter(Boolean);
  if(ctNames.length>0){
    opts.push({label:'── FILL container ──',value:'',disabled:true});
    ctNames.forEach(c=>{
      opts.push({label:`Fill ${c} by 10`,value:`FILL(${c}, 10)`});
      opts.push({label:`Fill ${c} by 50`,value:`FILL(${c}, 50)`});
      opts.push({label:`Fill ${c} by 100`,value:`FILL(${c}, 100)`});
    });
  }
  return opts;
};

// Dropdown — structured options only, no free-text escape hatch (audit C1)
const DropField = ({value, onChange, options, color}) => {
  const { C, FONT } = useTheme();
  const col = color || C.green;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:4,flex:1}}>
      <select value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{background:C.bg,border:`1px solid ${col}55`,borderRadius:4,
          color:col,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none',width:'100%'}}>
        {options.map((o,i)=><option key={i} value={o.value} disabled={!!o.disabled}>{o.label}</option>)}
      </select>
    </div>
  );
};

// ── Effect categorisation ──────────────────────────────────────────────────────
const categorizeEffect = (value) => {
  const v = String(value||"").trim();
  if (!v) return 'other';
  if (/^ARRIVE\s*\(/i.test(v)||/^BATCH\s*\(/i.test(v)||/^UNBATCH\s*\(/i.test(v)||/^SPLIT\s*\(/i.test(v)||/^MATCH\s*\(/i.test(v)||/^RENEGE/i.test(v)) return 'queue';
  if (/^(COMPLETE|RELEASE|ASSIGN|COSEIZE)\s*\(/i.test(v)) return 'service';
  if (/^SET_ATTR\s*\(/i.test(v)||/^SET\s*\(/i.test(v)||/(\+\+|--|[+\-]=\s*\d|=\s*\d)/.test(v)) return 'state';
  if (/^COST\s*\(/i.test(v)) return 'cost';
  if (/^(PREEMPT|FAIL|REPAIR)\s*\(/i.test(v)) return 'server';
  if (/^(DRAIN|FILL)\s*\(/i.test(v)) return 'container';
  return 'other';
};

const CAT_ORDER = ['queue','service','state','cost','server','container','other'];

// ── EffectPicker — chips + category-filtered dropdown ─────────────────────────
const EffectPicker = ({effects, options, onChange, expressionContext}) => {
  const { C, FONT } = useTheme();
  const stateVars = expressionContext?.stateVars || [];
  const attrs = expressionContext?.attrs || [];
  const CATEGORY_CONFIG = {
    queue:     {label:'Queue',     color:C.cEvent},
    service:   {label:'Service',   color:C.green},
    state:     {label:'State',     color:C.amber},
    cost:      {label:'Cost',      color:C.server},
    server:    {label:'Server',    color:C.red},
    container: {label:'Container', color:C.purple},
    other:     {label:'Other',     color:C.muted},
  };
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState('all');
  const [exprMacro, setExprMacro] = useState('COST');
  const [exprName,  setExprName]  = useState('');
  const [exprValue, setExprValue] = useState('');

  const remove = (j) => onChange(effects.filter((_,i)=>i!==j));
  const add = (val) => {
    if (!val) return;
    onChange([...effects, val]);
    setAdding(false);
    setCategory('all');
    setExprValue('');
  };
  const addExpr = () => {
    if (!exprValue.trim()) return;
    let val;
    if (exprMacro === 'COST') val = `COST(${exprValue.trim()})`;
    else if (exprMacro === 'SET' && exprName) val = `SET(${exprName}, ${exprValue.trim()})`;
    else if (exprMacro === 'SET_ATTR' && exprName) val = `SET_ATTR(${exprName}, ${exprValue.trim()})`;
    if (!val) return;
    add(val);
    setExprName('');
    setExprValue('');
  };

  const nonHeader = options.filter(o=>o.value&&!o.disabled);
  const filteredOpts = category==='all'
    ? options
    : options.filter(o=>o.disabled || (o.value && categorizeEffect(o.value)===category));

  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {/* Chips */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        {effects.length===0&&!adding&&(
          <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>None — add an effect.</span>
        )}
        {effects.map((eff,j)=>{
          const cat=categorizeEffect(eff);
          const cfg=CATEGORY_CONFIG[cat]||CATEGORY_CONFIG.other;
          const optLabel=options.find(o=>o.value===eff)?.label;
          const display=optLabel
            ? optLabel.replace(/^──\s*/,'').trim()
            : (eff||'(blank)');
          return (
            <span key={j} style={{display:'inline-flex',alignItems:'center',gap:4,
              background:cfg.color+'18',border:`1px solid ${cfg.color}44`,
              borderRadius:5,padding:'3px 8px',fontFamily:FONT,fontSize:11,color:cfg.color}}>
              <span style={{whiteSpace:'nowrap'}}
                title={/^SET_ATTR\s*\(/i.test(eff)?`${display} — requires entity context (must follow ARRIVE, ASSIGN, or COSEIZE)`:display}>{display}</span>
              <button onClick={()=>remove(j)} aria-label={`Remove effect ${j+1}`}
                style={{background:'none',border:'none',color:cfg.color,cursor:'pointer',padding:0,fontSize:13,lineHeight:1,flexShrink:0}}>✕</button>
            </span>
          );
        })}
        <Btn small variant="ghost" onClick={()=>setAdding(a=>!a)}>
          {adding?'Cancel':'+ Add Effect'}
        </Btn>
      </div>

      {/* Category picker + dropdown */}
      {adding&&(
        <div style={{background:C.surface,borderRadius:5,border:`1px solid ${C.border}`,
          padding:'10px 12px',display:'flex',flexDirection:'column',gap:8}}>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {[{key:'all',label:'All',color:C.text}, ...CAT_ORDER.map(k=>({key:k,...CATEGORY_CONFIG[k]}))].map(({key,label,color})=>{
              const count=key==='all'?nonHeader.length:nonHeader.filter(o=>categorizeEffect(o.value)===key).length;
              if(key!=='all'&&count===0) return null;
              const active=category===key;
              return (
                <button key={key} onClick={()=>setCategory(key)}
                  style={{background:active?color+'22':'transparent',
                    border:`1px solid ${active?color:C.border}`,
                    borderRadius:4,padding:'4px 10px',fontSize:10,fontFamily:FONT,
                    color:active?color:C.muted,cursor:'pointer',fontWeight:700,transition:'all .1s'}}>
                  {label} ({count})
                </button>
              );
            })}
          </div>
          <select value="" onChange={e=>{if(e.target.value)add(e.target.value);}}
            style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
              color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none',width:'100%'}}>
            <option value="">— select effect —</option>
            {filteredOpts.filter(o=>o.value||o.disabled).map((o,i)=>(
              <option key={i} value={o.value} disabled={!!o.disabled}>{o.label}</option>
            ))}
          </select>
          {/* Expression macros: SET / SET_ATTR / COST — the only ones needing free-form expressions */}
          <div style={{display:'flex',flexDirection:'column',gap:6,borderTop:`1px solid ${C.border}`,paddingTop:8}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1}}>EXPRESSION EFFECTS</span>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {stateVars.length>0&&(
                <button onClick={()=>{setExprMacro('SET');if(!exprName&&stateVars[0])setExprName(stateVars[0]);}}
                  style={{background:exprMacro==='SET'?C.amber+'22':'transparent',
                    border:`1px solid ${exprMacro==='SET'?C.amber:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='SET'?C.amber:C.muted,cursor:'pointer',fontWeight:700}}>SET</button>
              )}
              {attrs.length>0&&(
                <button onClick={()=>{setExprMacro('SET_ATTR');if(!exprName&&attrs[0])setExprName(attrs[0]);}}
                  style={{background:exprMacro==='SET_ATTR'?C.amber+'22':'transparent',
                    border:`1px solid ${exprMacro==='SET_ATTR'?C.amber:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='SET_ATTR'?C.amber:C.muted,cursor:'pointer',fontWeight:700}}>SET_ATTR</button>
              )}
              <button onClick={()=>{setExprMacro('COST');setExprName('');}}
                style={{background:exprMacro==='COST'?C.server+'22':'transparent',
                  border:`1px solid ${exprMacro==='COST'?C.server:C.border}`,
                  borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                  color:exprMacro==='COST'?C.server:C.muted,cursor:'pointer',fontWeight:700}}>COST</button>
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              {exprMacro==='SET'&&stateVars.length>0&&(
                <select value={exprName||stateVars[0]} onChange={e=>setExprName(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.amber}55`,borderRadius:4,
                    color:C.amber,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none',width:120,flexShrink:0}}>
                  {stateVars.map(v=><option key={v} value={v}>{v}</option>)}
                </select>
              )}
              {exprMacro==='SET_ATTR'&&attrs.length>0&&(
                <select value={exprName||attrs[0]} onChange={e=>setExprName(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.amber}55`,borderRadius:4,
                    color:C.amber,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none',width:120,flexShrink:0}}>
                  {attrs.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
              )}
              <input
                value={exprValue}
                onChange={e=>setExprValue(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addExpr();}}}
                placeholder={exprMacro==='COST'?'e.g. Entity.priority * 2.5':`e.g. ${exprName||stateVars[0]||'x'} + 1`}
                style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
                  color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none'}}
              />
              <Btn small variant="ghost" onClick={addExpr}
                disabled={!exprValue.trim()||(exprMacro!=='COST'&&!(exprName||stateVars[0]||attrs[0]))}>Add</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// SectionFilterTabs — section-aware filter strip shared by all table editors and results.
// sections: model.sections array. activeIds: array of selected section IDs (empty = show all).
// onToggle(id): called when user toggles a section tab.
const SectionFilterTabs = ({ sections = [], activeIds = [], onToggle }) => {
  const { C, FONT } = useTheme();
  if (!sections.length) return null;
  const allSelected = activeIds.length === 0;
  const tabs = [
    { id: "all", label: "All", color: C.muted },
    ...sections.map(s => ({ id: s.id, label: s.name || "Section", color: s.color })),
    { id: "unassigned", label: "Unassigned", color: C.muted },
  ];
  const handleClick = (id) => {
    if (id === "all") { onToggle([]); return; }
    if (id === "unassigned") { onToggle(["unassigned"]); return; }
    const set = new Set(activeIds);
    if (set.has(id)) { set.delete(id); } else { set.add(id); }
    onToggle([...set]);
  };
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
      {tabs.map(t => {
        const active = t.id === "all" ? allSelected : t.id === "unassigned" ? activeIds.includes("unassigned") : activeIds.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => handleClick(t.id)}
            style={{
              fontSize: 11, fontWeight: active ? 700 : 400, fontFamily: FONT,
              padding: "5px 12px", borderRadius: 14, cursor: "pointer",
              border: `1px solid ${active ? t.color : `${t.color}55`}`,
              background: active ? `${t.color}22` : "transparent",
              color: active ? t.color : C.muted,
              transition: "border-color 120ms ease, background 120ms ease",
            }}
          >
            {active && t.id !== "all" && t.id !== "unassigned" && (
              <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: t.color, marginRight: 5, verticalAlign: "middle" }} />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

// filterBySection — returns items whose id appears in any of the selected sections, or all/unassigned.
export function filterBySection(items, sections, activeSectionIds = []) {
  if (!Array.isArray(activeSectionIds) || activeSectionIds.length === 0) return items;
  if (activeSectionIds.includes("unassigned")) {
    const allMemberIds = new Set(sections.flatMap(s => s.memberIds));
    return items.filter(item => !allMemberIds.has(item.id));
  }
  const memberSet = new Set();
  for (const sid of activeSectionIds) {
    const section = sections.find(s => s.id === sid);
    if (section?.memberIds) section.memberIds.forEach(id => memberSet.add(id));
  }
  if (memberSet.size === 0) return items;
  return items.filter(item => memberSet.has(item.id));
}

export { displayEventName, queueDisplayName, conditionOptions, assignOptions, bEffectOptions, DropField, EffectPicker, toTitleCase, normTypeName, SectionFilterTabs };
