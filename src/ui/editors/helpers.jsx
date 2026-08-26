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
  // Cross-type pooling: ASSIGN(Queue|Type, ANY, "Skill") — seize an idle server
  // of any type that has the skill, rather than a fixed server type.
  if(modelSkills.length > 0) {
    opts.push({label:'── ASSIGN (any type with skill) ──', value:'', disabled:true});
    modelSkills.forEach(skill => {
      if (queues.length > 0) {
        queues.forEach(q => {
          opts.push({label:`Start ${cName} with any type (${skill}) and ${q.customerType||'entity'} from ${queueDisplayName(q.name)}`, value:`ASSIGN(${q.name}, ANY, "${skill}")`});
        });
      } else {
        custs.forEach(c => {
          opts.push({label:`Start ${cName} with any type (${skill}) and ${c}`, value:`ASSIGN(${c}, ANY, "${skill}")`});
        });
      }
    });
  }
  // Consumable resource gating: ASSIGN(..., Container:amount) — the service
  // only starts if the named container has at least `amount` available;
  // the amount is deducted atomically alongside the server claim.
  const ctNamesForAssign = (containerTypes||[]).map(ct=>ct.id).filter(Boolean);
  if(ctNamesForAssign.length > 0 && activeServers.length > 0) {
    opts.push({label:'── ASSIGN gated by consumable container ──', value:'', disabled:true});
    ctNamesForAssign.forEach(ctn => {
      if (queues.length > 0) {
        queues.forEach(q => {
          activeServers.forEach(s => {
            opts.push({
              label: `Start ${cName} with ${s} and ${q.customerType||'entity'} from ${queueDisplayName(q.name)}, consuming 1 ${ctn}`,
              value: `ASSIGN(${q.name}, ${s}, ${ctn}:1)`,
            });
          });
        });
      } else {
        custs.forEach(c => {
          activeServers.forEach(s => {
            opts.push({
              label: `Start ${cName} with ${s} and ${c}, consuming 1 ${ctn}`,
              value: `ASSIGN(${c}, ${s}, ${ctn}:1)`,
            });
          });
        });
      }
    });
  }
  // BATCH is added via the EffectPicker's expression-macro row (a queue picker
  // plus an editable, validated quantity — see EffectPicker's 'BATCH' case)
  // rather than enumerated here at fixed sizes; the engine has no ceiling
  // (V22 only requires size >= 2), so a fixed 2/5/10 list was an artificial
  // cliff, not a real constraint (M-3).
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
  // DRAIN is added via the EffectPicker's expression-macro row (a container
  // picker plus an editable, validated amount) rather than enumerated here
  // at fixed amounts — the engine accepts any positive amount (M-3).
  // MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue) — pairs one entity from each
  // of two queues, merges attrs (B overwrites A on collision), routes pair to TargetQueue.
  // Capped (F-8): this is O(|Q|³) — for a realistic model this can generate
  // hundreds of entries in a single flat <select>, which stops being findable
  // long before it stops being technically valid. Above the cap, the option
  // list stays empty for this family and the EffectPicker's own MATCH
  // composer (queue A / queue B / target pickers) is the only path — same
  // result, no enumeration cost.
  const MATCH_OPTION_CAP = 50;
  if(queues.length>=2 && queues.length*(queues.length-1)/2*queues.length <= MATCH_OPTION_CAP){
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
  // Capped (F-8): O(|Q|·|S|²·skills) — same rationale as MATCH above. The
  // EffectPicker's COSEIZE composer (queue + two server-type pickers, no
  // skill variants) covers the capped case; skill-specific combinations
  // stay available via the enumerated list while it's under the cap.
  const COSEIZE_OPTION_CAP = 50;
  let coseizeCombosPerQueue = 0;
  for(let i=0;i<servers.length;i++){
    for(let j=i+1;j<servers.length;j++){
      coseizeCombosPerQueue += 1 + (serverSkills[servers[i]]||[]).length + (serverSkills[servers[j]]||[]).length;
    }
  }
  if(queues.length>0&&servers.length>=2&&queues.length*coseizeCombosPerQueue<=COSEIZE_OPTION_CAP){
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
  // FINISH(ServerType) — ends an in-progress service the instant this C-event's
  // condition becomes true, for "activity of unknown duration" patterns where
  // completion isn't driven by a sampled/scheduled delay.
  if(servers.length>0){
    opts.push({label:'── FINISH (end in-progress service now, on condition) ──',value:'',disabled:true});
    servers.forEach(s=>{
      opts.push({label:`Finish ${s}'s current service immediately`,value:`FINISH(${s})`});
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
  const isCoseized = Array.isArray(contextServers) && activeServers.length >= 2;
  if (isCoseized) {
    const coseizedList = activeServers.join(', ');
    const coseizedLabel = activeServers.join(' & ');
    opts.push({label:'── Release all co-seized resources (recommended) ──',value:'',disabled:true});
    opts.push({label:`Release ${coseizedLabel} (entity stays in current stage)`,value:`RELEASE_COSEIZED([${coseizedList}])`});
    if (queues.length > 0) {
      queues.forEach(q => {
        const entityLabel = q.customerType ? normTypeName(q.customerType) : 'entity';
        opts.push({
          label: `Release ${coseizedLabel} and route ${entityLabel} to ${queueDisplayName(q.name)}`,
          value: `RELEASE_COSEIZED([${coseizedList}], ${q.name})`
        });
      });
    }
  }
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
  // SPLIT and FILL are added via the EffectPicker's expression-macro row (a
  // queue/container picker plus an editable, validated quantity/amount)
  // rather than enumerated here at fixed sizes — same rationale as BATCH
  // and DRAIN above (M-3).
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
          color:col,fontFamily:FONT,fontSize:12,padding:'6px 8px',width:'100%'}}>
        {options.map((o,i)=><option key={i} value={o.value} disabled={!!o.disabled}>{o.label}</option>)}
      </select>
    </div>
  );
};

// ── Effect categorisation ──────────────────────────────────────────────────────
const categorizeEffect = (value) => {
  const v = String(value||"").trim();
  if (!v) return 'other';
  if (/^ARRIVE\s*\(/i.test(v)||/^BATCH\s*\(/i.test(v)||/^UNBATCH\s*\(/i.test(v)||/^SPLIT\s*\(/i.test(v)||/^MATCH\s*\(/i.test(v)||/^RENEGE/i.test(v)||/^CANCEL\s*\(/i.test(v)) return 'queue';
  if (/^(COMPLETE|RELEASE|ASSIGN|COSEIZE|FINISH)\s*\(/i.test(v)) return 'service';
  if (/^SET_ATTR\s*\(/i.test(v)||/^SET\s*\(/i.test(v)||/^ROUND_ROBIN\s*\(/i.test(v)||/(\+\+|--|[+\-]=\s*\d|=\s*\d)/.test(v)) return 'state';
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
  const eventNames = expressionContext?.eventNames || [];
  const matchQueues = expressionContext?.matchQueues || [];
  const containerNames = (expressionContext?.containerTypes || []).map(ct => ct.id).filter(Boolean);
  const serverTypes = expressionContext?.serverTypes || [];
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
  const [matchQueueA, setMatchQueueA] = useState('');
  const [matchQueueB, setMatchQueueB] = useState('');
  const [matchTarget, setMatchTarget] = useState('');
  const [opQueue, setOpQueue] = useState('');
  const [opContainer, setOpContainer] = useState('');
  const [coseizeServer1, setCoseizeServer1] = useState('');
  const [coseizeServer2, setCoseizeServer2] = useState('');
  const [search, setSearch] = useState('');

  const remove = (j) => onChange(effects.filter((_,i)=>i!==j));
  const add = (val) => {
    if (!val) return;
    onChange([...effects, val]);
    setAdding(false);
    setCategory('all');
    setExprValue('');
  };
  const addExpr = () => {
    if (exprMacro === 'CANCEL') {
      if (!exprName) return;
      add(`CANCEL(${exprName})`);
      setExprName('');
      return;
    }
    if (exprMacro === 'MATCH') {
      if (!matchQueueA || !matchQueueB || !matchTarget || !exprValue.trim()) return;
      const qa = matchQueues.find(q => q.name === matchQueueA);
      const qb = matchQueues.find(q => q.name === matchQueueB);
      if (!qa || !qb) return;
      add(`MATCH(${qa.type}, ${qa.name}, ${qb.type}, ${qb.name}, ${matchTarget}, "${exprValue.trim()}")`);
      setExprValue('');
      return;
    }
    if (exprMacro === 'COSEIZE') {
      if (!opQueue || !coseizeServer1 || !coseizeServer2 || coseizeServer1 === coseizeServer2) return;
      add(`COSEIZE(${opQueue}, ${coseizeServer1}, ${coseizeServer2})`);
      return;
    }
    if (exprMacro === 'BATCH') {
      if (!opQueue || !exprValue.trim()) return;
      const n = Math.max(2, Math.round(Number(exprValue)) || 2);
      add(`BATCH(${opQueue}, ${n})`);
      setExprValue('');
      return;
    }
    if (exprMacro === 'SPLIT') {
      if (!opQueue || !exprValue.trim()) return;
      const q = matchQueues.find(q => q.name === opQueue);
      if (!q) return;
      const n = Math.max(2, Math.round(Number(exprValue)) || 2);
      add(`SPLIT(${q.type}, ${n}, ${opQueue})`);
      setExprValue('');
      return;
    }
    if (exprMacro === 'DRAIN' || exprMacro === 'FILL') {
      if (!opContainer || !exprValue.trim()) return;
      const amt = Number(exprValue);
      if (!Number.isFinite(amt) || amt <= 0) return;
      add(`${exprMacro}(${opContainer}, ${amt})`);
      setExprValue('');
      return;
    }
    if (!exprValue.trim()) return;
    let val;
    if (exprMacro === 'COST') val = `COST(${exprValue.trim()})`;
    else if (exprMacro === 'SET' && exprName) val = `SET(${exprName}, ${exprValue.trim()})`;
    else if (exprMacro === 'SET_ATTR' && exprName) val = `SET_ATTR(${exprName}, ${exprValue.trim()})`;
    else if (exprMacro === 'ROUND_ROBIN' && exprName) val = `ROUND_ROBIN(${exprName}, ${exprValue.trim()})`;
    if (!val) return;
    add(val);
    setExprName('');
    setExprValue('');
  };

  const nonHeader = options.filter(o=>o.value&&!o.disabled);
  const categoryFiltered = category==='all'
    ? options
    : options.filter(o=>o.disabled || (o.value && categorizeEffect(o.value)===category));
  // Type-ahead filter (M-2): on realistic models the category chips alone
  // still leave hundreds of near-identical entries in one flat <select> —
  // same pattern as LogViewer's search box. Options are grouped by their
  // preceding disabled header row so a header only survives the filter if
  // at least one option under it still matches (no empty headings).
  const q = search.trim().toLowerCase();
  const filteredOpts = (() => {
    if (!q) return categoryFiltered;
    const groups = [];
    let current = { header: null, items: [] };
    for (const o of categoryFiltered) {
      if (o.disabled) {
        if (current.header || current.items.length) groups.push(current);
        current = { header: o, items: [] };
      } else {
        current.items.push(o);
      }
    }
    groups.push(current);
    return groups.flatMap(({ header, items }) => {
      const matched = items.filter(o => !o.value || o.label.toLowerCase().includes(q));
      if (!matched.length) return [];
      return header ? [header, ...matched] : matched;
    });
  })();

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
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Search effects…"
            style={{background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,
              color:C.text,fontFamily:FONT,fontSize:11,padding:'5px 9px',width:'100%',boxSizing:'border-box'}}
          />
          <select value="" onChange={e=>{if(e.target.value)add(e.target.value);}}
            style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
              color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px',width:'100%'}}>
            <option value="">— select effect —</option>
            {filteredOpts.filter(o=>o.value||o.disabled).map((o,i)=>(
              <option key={i} value={o.value} disabled={!!o.disabled}>{o.label}</option>
            ))}
          </select>
          {/* Expression macros: structured operand pickers + a validated value/
              quantity field, for every macro that needs more than a fixed
              enumeration — free-form expressions (COST/SET/etc.) and
              quantity-bearing macros (BATCH/DRAIN/FILL/SPLIT/COSEIZE) alike.
              No free-text macro name or operand ever appears here (audit C1)
              — only the numeric/expression value is typed. */}
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
              {stateVars.length>0&&(
                <button onClick={()=>{setExprMacro('ROUND_ROBIN');if(!exprName&&stateVars[0])setExprName(stateVars[0]);}}
                  style={{background:exprMacro==='ROUND_ROBIN'?C.amber+'22':'transparent',
                    border:`1px solid ${exprMacro==='ROUND_ROBIN'?C.amber:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='ROUND_ROBIN'?C.amber:C.muted,cursor:'pointer',fontWeight:700}}>ROUND_ROBIN</button>
              )}
              {eventNames.length>0&&(
                <button onClick={()=>{setExprMacro('CANCEL');setExprValue('');if(!exprName&&eventNames[0])setExprName(eventNames[0]);}}
                  style={{background:exprMacro==='CANCEL'?C.red+'22':'transparent',
                    border:`1px solid ${exprMacro==='CANCEL'?C.red:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='CANCEL'?C.red:C.muted,cursor:'pointer',fontWeight:700}}>CANCEL</button>
              )}
              {matchQueues.length>=2&&(
                <button onClick={()=>{
                    setExprMacro('MATCH');setExprValue('');
                    if(!matchQueueA)setMatchQueueA(matchQueues[0].name);
                    if(!matchQueueB)setMatchQueueB(matchQueues[1].name);
                    if(!matchTarget)setMatchTarget(matchQueues[0].name);
                  }}
                  style={{background:exprMacro==='MATCH'?C.cEvent+'22':'transparent',
                    border:`1px solid ${exprMacro==='MATCH'?C.cEvent:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='MATCH'?C.cEvent:C.muted,cursor:'pointer',fontWeight:700}}>MATCH (compatible pair)</button>
              )}
              {matchQueues.length>0&&(
                <button onClick={()=>{setExprMacro('BATCH');setExprValue('2');if(!opQueue)setOpQueue(matchQueues[0].name);}}
                  style={{background:exprMacro==='BATCH'?C.cEvent+'22':'transparent',
                    border:`1px solid ${exprMacro==='BATCH'?C.cEvent:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='BATCH'?C.cEvent:C.muted,cursor:'pointer',fontWeight:700}}>BATCH</button>
              )}
              {matchQueues.length>0&&(
                <button onClick={()=>{setExprMacro('SPLIT');setExprValue('2');if(!opQueue)setOpQueue(matchQueues[0].name);}}
                  style={{background:exprMacro==='SPLIT'?C.cEvent+'22':'transparent',
                    border:`1px solid ${exprMacro==='SPLIT'?C.cEvent:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='SPLIT'?C.cEvent:C.muted,cursor:'pointer',fontWeight:700}}>SPLIT</button>
              )}
              {containerNames.length>0&&(
                <button onClick={()=>{setExprMacro('DRAIN');setExprValue('');if(!opContainer)setOpContainer(containerNames[0]);}}
                  style={{background:exprMacro==='DRAIN'?C.purple+'22':'transparent',
                    border:`1px solid ${exprMacro==='DRAIN'?C.purple:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='DRAIN'?C.purple:C.muted,cursor:'pointer',fontWeight:700}}>DRAIN</button>
              )}
              {containerNames.length>0&&(
                <button onClick={()=>{setExprMacro('FILL');setExprValue('');if(!opContainer)setOpContainer(containerNames[0]);}}
                  style={{background:exprMacro==='FILL'?C.purple+'22':'transparent',
                    border:`1px solid ${exprMacro==='FILL'?C.purple:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='FILL'?C.purple:C.muted,cursor:'pointer',fontWeight:700}}>FILL</button>
              )}
              {serverTypes.length>=2&&matchQueues.length>0&&(
                <button onClick={()=>{
                    setExprMacro('COSEIZE');
                    if(!opQueue)setOpQueue(matchQueues[0].name);
                    if(!coseizeServer1)setCoseizeServer1(serverTypes[0]);
                    if(!coseizeServer2)setCoseizeServer2(serverTypes[1]);
                  }}
                  style={{background:exprMacro==='COSEIZE'?C.red+'22':'transparent',
                    border:`1px solid ${exprMacro==='COSEIZE'?C.red:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='COSEIZE'?C.red:C.muted,cursor:'pointer',fontWeight:700}}>COSEIZE (2 server types)</button>
              )}
            </div>
            {exprMacro==='MATCH'&&matchQueues.length>=2&&(
              <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>A:</span>
                <select value={matchQueueA} onChange={e=>setMatchQueueA(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
                    color:C.cEvent,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                  {matchQueues.map(q=><option key={q.name} value={q.name}>{q.name} ({q.type})</option>)}
                </select>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>B:</span>
                <select value={matchQueueB} onChange={e=>setMatchQueueB(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
                    color:C.cEvent,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                  {matchQueues.map(q=><option key={q.name} value={q.name}>{q.name} ({q.type})</option>)}
                </select>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>→</span>
                <select value={matchTarget} onChange={e=>setMatchTarget(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
                    color:C.cEvent,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                  {matchQueues.map(q=><option key={q.name} value={q.name}>{q.name}</option>)}
                </select>
              </div>
            )}
            {exprMacro==='COSEIZE'&&serverTypes.length>=2&&matchQueues.length>0&&(
              <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>From:</span>
                <select value={opQueue||matchQueues[0].name} onChange={e=>setOpQueue(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.red}55`,borderRadius:4,
                    color:C.red,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                  {matchQueues.map(q=><option key={q.name} value={q.name}>{q.name}</option>)}
                </select>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Seize:</span>
                <select value={coseizeServer1||serverTypes[0]} onChange={e=>setCoseizeServer1(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.red}55`,borderRadius:4,
                    color:C.red,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                  {serverTypes.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>+</span>
                <select value={coseizeServer2||serverTypes[1]} onChange={e=>setCoseizeServer2(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.red}55`,borderRadius:4,
                    color:C.red,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                  {serverTypes.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              {(exprMacro==='BATCH'||exprMacro==='SPLIT')&&matchQueues.length>0&&(
                <select value={opQueue||matchQueues[0].name} onChange={e=>setOpQueue(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
                    color:C.cEvent,fontFamily:FONT,fontSize:12,padding:'6px 8px',flexShrink:0}}>
                  {matchQueues.map(q=><option key={q.name} value={q.name}>{q.name}</option>)}
                </select>
              )}
              {(exprMacro==='DRAIN'||exprMacro==='FILL')&&containerNames.length>0&&(
                <select value={opContainer||containerNames[0]} onChange={e=>setOpContainer(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.purple}55`,borderRadius:4,
                    color:C.purple,fontFamily:FONT,fontSize:12,padding:'6px 8px',flexShrink:0}}>
                  {containerNames.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {(exprMacro==='SET'||exprMacro==='ROUND_ROBIN')&&stateVars.length>0&&(
                <select value={exprName||stateVars[0]} onChange={e=>setExprName(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.amber}55`,borderRadius:4,
                    color:C.amber,fontFamily:FONT,fontSize:12,padding:'6px 8px',width:120,flexShrink:0}}>
                  {stateVars.map(v=><option key={v} value={v}>{v}</option>)}
                </select>
              )}
              {exprMacro==='SET_ATTR'&&attrs.length>0&&(
                <select value={exprName||attrs[0]} onChange={e=>setExprName(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.amber}55`,borderRadius:4,
                    color:C.amber,fontFamily:FONT,fontSize:12,padding:'6px 8px',width:120,flexShrink:0}}>
                  {attrs.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
              )}
              {exprMacro==='CANCEL'&&eventNames.length>0&&(
                <select value={exprName||eventNames[0]} onChange={e=>setExprName(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.red}55`,borderRadius:4,
                    color:C.red,fontFamily:FONT,fontSize:12,padding:'6px 8px',width:160,flexShrink:0}}>
                  {eventNames.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              )}
              {exprMacro!=='CANCEL'&&exprMacro!=='COSEIZE'&&(
                exprMacro==='BATCH'||exprMacro==='SPLIT'?(
                  <input type="number" min={2} step={1}
                    value={exprValue}
                    onChange={e=>setExprValue(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addExpr();}}}
                    placeholder="quantity (≥ 2)"
                    style={{width:120,flexShrink:0,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
                      color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}
                  />
                ):exprMacro==='DRAIN'||exprMacro==='FILL'?(
                  <input type="number" min={0} step="any"
                    value={exprValue}
                    onChange={e=>setExprValue(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addExpr();}}}
                    placeholder="amount (> 0)"
                    style={{width:120,flexShrink:0,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
                      color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}
                  />
                ):(
                  <input
                    value={exprValue}
                    onChange={e=>setExprValue(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addExpr();}}}
                    placeholder={exprMacro==='COST'?'e.g. Entity.priority * 2.5':exprMacro==='ROUND_ROBIN'?'e.g. 3 (number of destinations)':exprMacro==='MATCH'?'e.g. Entity.bloodType == Other.bloodType':`e.g. ${exprName||stateVars[0]||'x'} + 1`}
                    style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
                      color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}
                  />
                )
              )}
              <Btn small variant="ghost" onClick={addExpr}
                disabled={
                  exprMacro==='CANCEL' ? !exprName
                  : exprMacro==='MATCH' ? (!matchQueueA||!matchQueueB||!matchTarget||!exprValue.trim())
                  : exprMacro==='COSEIZE' ? (!opQueue||!coseizeServer1||!coseizeServer2||coseizeServer1===coseizeServer2)
                  : exprMacro==='BATCH'||exprMacro==='SPLIT' ? (!opQueue||!exprValue.trim())
                  : exprMacro==='DRAIN'||exprMacro==='FILL' ? (!opContainer||!exprValue.trim())
                  : (!exprValue.trim()||(exprMacro!=='COST'&&!(exprName||stateVars[0]||attrs[0])))
                }>Add</Btn>
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

// reorderCEventByPriority — moves the C-event with `id` to the array position implied
// by `newPriority` (1-based, clamped to [1, events.length]) and densely renumbers every
// event's priority to its new index+1. Array order is the source of truth for priority
// (mirrors the drag-to-reorder semantics in CEventEditor's handleDrop) — this is the one
// place that reconciles a typed priority value with that invariant, so both the C-event
// list editor and the Visual Designer inspector route through it. Pure: returns a new
// array, does not mutate `events`.
function reorderCEventByPriority(events, id, newPriority) {
  const list = Array.isArray(events) ? events : [];
  const fromIdx = list.findIndex(ev => ev.id === id);
  if (fromIdx === -1) return list;
  const n = list.length;
  const parsed = Math.round(Number(newPriority));
  const clamped = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 1, 1), n);
  const reordered = [...list];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(clamped - 1, 0, moved);
  return reordered.map((ev, idx) => ({ ...ev, priority: idx + 1 }));
}

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

export { displayEventName, queueDisplayName, conditionOptions, assignOptions, bEffectOptions, DropField, EffectPicker, toTitleCase, normTypeName, SectionFilterTabs, reorderCEventByPriority };
