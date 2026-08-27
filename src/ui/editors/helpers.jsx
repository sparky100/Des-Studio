import { useState } from "react";
import { toTitleCase, normTypeName } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { safeArithmetic } from "../../engine/macros.js";

const displayEventName = name => String(name || "").replace(/\s*\((template|tmpl)\)\s*/gi, "").trim();
const queueDisplayName = name => {
  const text = String(name || "").trim();
  return /queue$/i.test(text) ? text : `${text} Queue`;
};

// isPositiveNumber / isValidAmountExpr — client-side validation for expression-bearing
// effect operands (BATCH size, FILL/DRAIN/ASSIGN-container amount). Mirrors
// evalEntityExpr's substitution (engine/macros.js) — Entity.<attr>, known state vars
// (longest-name-first to avoid partial replacement), and clock all resolve to a
// placeholder number, then the engine's own safeArithmetic must consume the whole
// string — so UI validation can never accept something the engine would reject, or
// vice versa, without both changing together.
const isPositiveNumber = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
const isValidAmountExpr = (expr, stateVars = []) => {
  let s = String(expr || "").trim();
  if (!s) return false;
  if (/^["']/.test(s)) return false; // amounts are numeric — never a quoted string
  const hasRef = /\bEntity\.\w+\b/.test(s) || /\bclock\b/.test(s)
    || stateVars.some(k => new RegExp(`\\b${k}\\b`).test(s));
  let sub = s.replace(/\bEntity\.(\w+)\b/g, "1");
  [...stateVars].sort((a, b) => b.length - a.length)
    .forEach(k => { sub = sub.replace(new RegExp(`\\b${k}\\b`, "g"), "1"); });
  sub = sub.replace(/\bclock\b/g, "1");
  const val = safeArithmetic(sub);
  if (!Number.isFinite(val)) return false;
  // A fully literal expression (no Entity./state-var/clock reference) has a
  // known value right now — require it be positive, same as the engine's
  // runtime guard, rather than letting a client-side "-5" or "2 - 10" slip
  // through only to be rejected (or silently no-op) at run time. An
  // expression with a reference can't be pre-evaluated, so it's accepted on
  // grammar alone — its sign is a run-time concern (per evalEntityExpr).
  return hasRef || val > 0;
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
  // the amount is deducted atomically alongside the server claim. Retired
  // the fixed "consuming 1" enumeration (Sprint 94) — the EffectPicker's
  // ASSIGN composer now covers any container at any (expression) amount,
  // combinable with a skill, which this family could never express.
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
  // Capped (F-8): O(|Q|·|S|²) — same rationale as MATCH above. Retired the
  // one-sided-skill enumerated variants (Sprint 94): the EffectPicker's
  // COSEIZE composer now supports any number of server types with a
  // per-type skill on each, which this plain-pairs enumeration could never
  // reach anyway — it stays only as a quick pick for the unskilled 2-type
  // case, under the cap.
  const COSEIZE_OPTION_CAP = 50;
  const coseizeCombosPerQueue = servers.length*(servers.length-1)/2;
  if(queues.length>0&&servers.length>=2&&queues.length*coseizeCombosPerQueue<=COSEIZE_OPTION_CAP){
    opts.push({label:'── COSEIZE (seize entity + 2 server types at once) ──',value:'',disabled:true});
    queues.forEach(q=>{
      const entityLabel = q.customerType ? normTypeName(q.customerType) : 'entity';
      for(let i=0;i<servers.length;i++){
        for(let j=i+1;j<servers.length;j++){
          const s1=servers[i], s2=servers[j];
          opts.push({
            label: `Seize ${s1} + ${s2} for ${entityLabel} from ${queueDisplayName(q.name)}`,
            value: `COSEIZE(${q.name}, ${s1}, ${s2})`,
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
  const numericAttrs = expressionContext?.numericAttrs || [];
  const stringAttrs = expressionContext?.stringAttrs || [];
  const skillsList = expressionContext?.skills || [];
  const customerTypes = expressionContext?.customerTypes || [];
  const serverSkillsByType = expressionContext?.serverSkillsByType || {};
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
  const [coseizeRows, setCoseizeRows] = useState([]); // [{type, skill, qty}], skill '' = none, qty default 1
  const [batchSizeMode, setBatchSizeMode] = useState('literal'); // 'literal' | 'attribute'
  const [batchAttr, setBatchAttr] = useState('');
  const [splitType, setSplitType] = useState(''); // '' = follow the target queue's type
  const [assignSource, setAssignSource] = useState('');
  const [assignServer, setAssignServer] = useState('');
  const [assignSkill, setAssignSkill] = useState(''); // '' | `lit:<skill>` | `attr:<name>`
  const [assignContainer, setAssignContainer] = useState('');
  const [assignAmount, setAssignAmount] = useState('1');
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
      if (!matchQueueA || !matchQueueB || !matchTarget) return;
      const qa = matchQueues.find(q => q.name === matchQueueA);
      const qb = matchQueues.find(q => q.name === matchQueueB);
      if (!qa || !qb) return;
      // Predicate is optional (audit gap 7) — an empty predicate is a plain 5-arg
      // MATCH (front-of-both-queues); a non-empty one keeps the quoted 6-arg form.
      const predicate = exprValue.trim();
      add(predicate
        ? `MATCH(${qa.type}, ${qa.name}, ${qb.type}, ${qb.name}, ${matchTarget}, "${predicate}")`
        : `MATCH(${qa.type}, ${qa.name}, ${qb.type}, ${qb.name}, ${matchTarget})`);
      setExprValue('');
      return;
    }
    if (exprMacro === 'COSEIZE') {
      const types = coseizeRows.map(r => r.type).filter(Boolean);
      const hasDup = new Set(types).size !== types.length;
      const qtys = coseizeRows.map(r => parseInt(r.qty, 10) || 1);
      const hasBadQty = coseizeRows.some(r => !Number.isInteger(parseInt(r.qty, 10)) || parseInt(r.qty, 10) < 1);
      if (!opQueue || coseizeRows.length < 2 || types.length < coseizeRows.length || hasDup || hasBadQty) return;
      // Quantity suffix (Sprint 95) only appears when >1, so the default
      // (every row at qty 1) emits byte-identical strings to before.
      const args = coseizeRows.map((r, i) => {
        const base = r.skill ? `${r.type}[${r.skill}]` : r.type;
        return qtys[i] > 1 ? `${base}:${qtys[i]}` : base;
      }).join(', ');
      add(`COSEIZE(${opQueue}, ${args})`);
      return;
    }
    if (exprMacro === 'BATCH') {
      if (!opQueue) return;
      if (batchSizeMode === 'attribute') {
        if (!batchAttr) return;
        add(`BATCH(${opQueue}, Entity.${batchAttr})`);
        return;
      }
      if (!exprValue.trim()) return;
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
      add(`SPLIT(${splitType || q.type}, ${n}, ${opQueue})`);
      setExprValue('');
      return;
    }
    if (exprMacro === 'DRAIN' || exprMacro === 'FILL') {
      if (!opContainer) return;
      const v = exprValue.trim();
      if (!v) return;
      if (isPositiveNumber(v)) { add(`${exprMacro}(${opContainer}, ${Number(v)})`); setExprValue(''); return; }
      if (isValidAmountExpr(v, stateVars)) { add(`${exprMacro}(${opContainer}, ${v})`); setExprValue(''); return; }
      return;
    }
    if (exprMacro === 'ASSIGN') {
      if (!assignSource || !assignServer) return;
      const skillClause = assignSkill.startsWith('lit:') ? `, "${assignSkill.slice(4)}"`
        : assignSkill.startsWith('attr:') ? `, Entity.${assignSkill.slice(5)}` : '';
      let containerClause = '';
      if (assignContainer) {
        const amt = assignAmount.trim();
        const validAmt = isPositiveNumber(amt) ? Number(amt) : (isValidAmountExpr(amt, stateVars) ? amt : null);
        if (validAmt == null) return;
        containerClause = `, ${assignContainer}:${validAmt}`;
      }
      add(`ASSIGN(${assignSource}, ${assignServer}${skillClause}${containerClause})`);
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
              {serverTypes.length>0&&matchQueues.length>0&&(
                <button onClick={()=>{
                    setExprMacro('ASSIGN');
                    if(!assignSource)setAssignSource(matchQueues[0].name);
                    if(!assignServer)setAssignServer(serverTypes[0]);
                  }}
                  style={{background:exprMacro==='ASSIGN'?C.green+'22':'transparent',
                    border:`1px solid ${exprMacro==='ASSIGN'?C.green:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='ASSIGN'?C.green:C.muted,cursor:'pointer',fontWeight:700}}>ASSIGN (any server, skill + container)</button>
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
                <button onClick={()=>{setExprMacro('BATCH');setExprValue('2');setBatchSizeMode('literal');if(!opQueue)setOpQueue(matchQueues[0].name);if(!batchAttr&&numericAttrs[0])setBatchAttr(numericAttrs[0]);}}
                  style={{background:exprMacro==='BATCH'?C.cEvent+'22':'transparent',
                    border:`1px solid ${exprMacro==='BATCH'?C.cEvent:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='BATCH'?C.cEvent:C.muted,cursor:'pointer',fontWeight:700}}>BATCH</button>
              )}
              {matchQueues.length>0&&(
                <button onClick={()=>{setExprMacro('SPLIT');setExprValue('2');setSplitType('');if(!opQueue)setOpQueue(matchQueues[0].name);}}
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
                    if(coseizeRows.length<2)setCoseizeRows([
                      {type:serverTypes[0],skill:'',qty:1},
                      {type:serverTypes[1],skill:'',qty:1},
                    ]);
                  }}
                  style={{background:exprMacro==='COSEIZE'?C.red+'22':'transparent',
                    border:`1px solid ${exprMacro==='COSEIZE'?C.red:C.border}`,
                    borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                    color:exprMacro==='COSEIZE'?C.red:C.muted,cursor:'pointer',fontWeight:700}}>COSEIZE (N server types)</button>
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
            {exprMacro==='COSEIZE'&&serverTypes.length>=2&&matchQueues.length>0&&(()=>{
              const usedTypes = new Set(coseizeRows.map(r=>r.type));
              const nextUnusedType = serverTypes.find(s=>!usedTypes.has(s));
              const updateRow = (idx, patch) => setCoseizeRows(rows=>rows.map((r,i)=>i===idx?{...r,...patch}:r));
              const removeRow = (idx) => setCoseizeRows(rows=>rows.filter((_,i)=>i!==idx));
              return (
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>From:</span>
                  <select value={opQueue||matchQueues[0].name} onChange={e=>setOpQueue(e.target.value)}
                    style={{background:C.bg,border:`1px solid ${C.red}55`,borderRadius:4,
                      color:C.red,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                    {matchQueues.map(q=><option key={q.name} value={q.name}>{q.name}</option>)}
                  </select>
                </div>
                {coseizeRows.map((row,idx)=>{
                  const rowSkills = serverSkillsByType[row.type] || [];
                  return (
                    <div key={idx} style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>{idx===0?'Seize:':'+'}</span>
                      <select value={row.type} onChange={e=>updateRow(idx,{type:e.target.value,skill:''})}
                        style={{background:C.bg,border:`1px solid ${C.red}55`,borderRadius:4,
                          color:C.red,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                        {serverTypes.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                      <select value={row.skill} onChange={e=>updateRow(idx,{skill:e.target.value})}
                        style={{background:C.bg,border:`1px solid ${C.red}55`,borderRadius:4,
                          color:C.red,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                        <option value="">— no skill —</option>
                        {rowSkills.map(sk=><option key={sk} value={sk}>{sk}</option>)}
                      </select>
                      <input type="number" min={1} step={1} value={row.qty ?? 1}
                        onChange={e=>updateRow(idx,{qty:e.target.value})}
                        aria-label={`Quantity for server type row ${idx+1}`}
                        style={{width:56,background:C.bg,border:`1px solid ${C.red}55`,borderRadius:4,
                          color:C.red,fontFamily:FONT,fontSize:12,padding:'6px 4px'}}
                      />
                      {coseizeRows.length>2&&(
                        <button onClick={()=>removeRow(idx)} aria-label={`Remove server type row ${idx+1}`}
                          style={{background:'none',border:'none',color:C.red,cursor:'pointer',padding:0,fontSize:13}}>✕</button>
                      )}
                    </div>
                  );
                })}
                {nextUnusedType&&(
                  <button onClick={()=>setCoseizeRows(rows=>[...rows,{type:nextUnusedType,skill:'',qty:1}])}
                    style={{alignSelf:'flex-start',background:'transparent',border:`1px dashed ${C.red}55`,
                      borderRadius:4,padding:'3px 10px',fontSize:10,fontFamily:FONT,
                      color:C.red,cursor:'pointer',fontWeight:700}}>＋ add server type</button>
                )}
              </div>
              );
            })()}
            {exprMacro==='ASSIGN'&&serverTypes.length>0&&matchQueues.length>0&&(
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>From:</span>
                  <select value={assignSource||matchQueues[0].name} onChange={e=>setAssignSource(e.target.value)}
                    style={{background:C.bg,border:`1px solid ${C.green}55`,borderRadius:4,
                      color:C.green,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                    {matchQueues.map(q=><option key={q.name} value={q.name}>{q.name}</option>)}
                  </select>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Server:</span>
                  <select value={assignServer||serverTypes[0]} onChange={e=>setAssignServer(e.target.value)}
                    style={{background:C.bg,border:`1px solid ${C.green}55`,borderRadius:4,
                      color:C.green,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                    <option value="ANY">ANY — pool all idle types</option>
                    {serverTypes.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {(skillsList.length>0||stringAttrs.length>0)&&(
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Skill (optional):</span>
                    <select value={assignSkill} onChange={e=>setAssignSkill(e.target.value)}
                      style={{background:C.bg,border:`1px solid ${C.green}55`,borderRadius:4,
                        color:C.green,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                      <option value="">— none —</option>
                      {skillsList.map(sk=><option key={`lit:${sk}`} value={`lit:${sk}`}>{sk}</option>)}
                      {stringAttrs.map(a=><option key={`attr:${a}`} value={`attr:${a}`}>← Entity.{a}</option>)}
                    </select>
                  </div>
                )}
                {containerNames.length>0&&(
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Container gate (optional):</span>
                    <select value={assignContainer} onChange={e=>setAssignContainer(e.target.value)}
                      style={{background:C.bg,border:`1px solid ${C.purple}55`,borderRadius:4,
                        color:C.purple,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}>
                      <option value="">— none —</option>
                      {containerNames.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                    {assignContainer&&(
                      <input value={assignAmount} onChange={e=>setAssignAmount(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addExpr();}}}
                        placeholder="amount — number or expression"
                        style={{width:180,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
                          color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}
                      />
                    )}
                  </div>
                )}
                <div>
                  <Btn small variant="ghost" onClick={addExpr}
                    disabled={!assignSource||!assignServer||(assignContainer&&!(isPositiveNumber(assignAmount.trim())||isValidAmountExpr(assignAmount.trim(),stateVars)))}>Add</Btn>
                </div>
              </div>
            )}
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              {exprMacro==='BATCH'&&matchQueues.length>0&&(
                <>
                  <select value={opQueue||matchQueues[0].name} onChange={e=>setOpQueue(e.target.value)}
                    style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
                      color:C.cEvent,fontFamily:FONT,fontSize:12,padding:'6px 8px',flexShrink:0}}>
                    {matchQueues.map(q=><option key={q.name} value={q.name}>{q.name}</option>)}
                  </select>
                  {numericAttrs.length>0&&(
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>setBatchSizeMode('literal')}
                        style={{background:batchSizeMode==='literal'?C.cEvent+'22':'transparent',
                          border:`1px solid ${batchSizeMode==='literal'?C.cEvent:C.border}`,borderRadius:4,
                          padding:'3px 8px',fontSize:10,fontFamily:FONT,
                          color:batchSizeMode==='literal'?C.cEvent:C.muted,cursor:'pointer',fontWeight:700}}>number</button>
                      <button onClick={()=>{setBatchSizeMode('attribute');if(!batchAttr)setBatchAttr(numericAttrs[0]);}}
                        style={{background:batchSizeMode==='attribute'?C.cEvent+'22':'transparent',
                          border:`1px solid ${batchSizeMode==='attribute'?C.cEvent:C.border}`,borderRadius:4,
                          padding:'3px 8px',fontSize:10,fontFamily:FONT,
                          color:batchSizeMode==='attribute'?C.cEvent:C.muted,cursor:'pointer',fontWeight:700}}>from attribute</button>
                    </div>
                  )}
                  {batchSizeMode==='attribute'&&numericAttrs.length>0&&(
                    <select value={batchAttr||numericAttrs[0]} onChange={e=>setBatchAttr(e.target.value)}
                      style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
                        color:C.cEvent,fontFamily:FONT,fontSize:12,padding:'6px 8px',flexShrink:0}}>
                      {numericAttrs.map(a=><option key={a} value={a}>Entity.{a}</option>)}
                    </select>
                  )}
                </>
              )}
              {exprMacro==='SPLIT'&&matchQueues.length>0&&(
                <>
                  <select value={opQueue||matchQueues[0].name} onChange={e=>setOpQueue(e.target.value)}
                    style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
                      color:C.cEvent,fontFamily:FONT,fontSize:12,padding:'6px 8px',flexShrink:0}}>
                    {matchQueues.map(q=><option key={q.name} value={q.name}>{q.name}</option>)}
                  </select>
                  {customerTypes.length>0&&(
                    <select value={splitType} onChange={e=>setSplitType(e.target.value)}
                      style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
                        color:C.cEvent,fontFamily:FONT,fontSize:12,padding:'6px 8px',flexShrink:0}}>
                      <option value="">— same as queue's entity —</option>
                      {customerTypes.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </>
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
              {exprMacro!=='CANCEL'&&exprMacro!=='COSEIZE'&&exprMacro!=='ASSIGN'&&!(exprMacro==='BATCH'&&batchSizeMode==='attribute')&&(
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
                  <input
                    value={exprValue}
                    onChange={e=>setExprValue(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addExpr();}}}
                    placeholder="amount — number or expression (e.g. Entity.units * 2)"
                    style={{width:220,flexShrink:0,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
                      color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}
                  />
                ):(
                  <input
                    value={exprValue}
                    onChange={e=>setExprValue(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addExpr();}}}
                    placeholder={exprMacro==='COST'?'e.g. Entity.priority * 2.5':exprMacro==='ROUND_ROBIN'?'e.g. 3 (number of destinations)':exprMacro==='MATCH'?'optional — e.g. Entity.bloodType == Other.bloodType':`e.g. ${exprName||stateVars[0]||'x'} + 1`}
                    style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
                      color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px'}}
                  />
                )
              )}
              {exprMacro!=='ASSIGN'&&(
                <Btn small variant="ghost" onClick={addExpr}
                  disabled={
                    exprMacro==='CANCEL' ? !exprName
                    : exprMacro==='MATCH' ? (!matchQueueA||!matchQueueB||!matchTarget)
                    : exprMacro==='COSEIZE' ? (()=>{
                        const types=coseizeRows.map(r=>r.type).filter(Boolean);
                        const badQty=coseizeRows.some(r=>!Number.isInteger(parseInt(r.qty,10))||parseInt(r.qty,10)<1);
                        return !opQueue||coseizeRows.length<2||types.length<coseizeRows.length||new Set(types).size!==types.length||badQty;
                      })()
                    : exprMacro==='BATCH' ? (!opQueue||(batchSizeMode==='attribute'?!batchAttr:!exprValue.trim()))
                    : exprMacro==='SPLIT' ? (!opQueue||!exprValue.trim())
                    : exprMacro==='DRAIN'||exprMacro==='FILL' ? (!opContainer||!(isPositiveNumber(exprValue.trim())||isValidAmountExpr(exprValue.trim(),stateVars)))
                    : (!exprValue.trim()||(exprMacro!=='COST'&&!(exprName||stateVars[0]||attrs[0])))
                  }>Add</Btn>
              )}
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
