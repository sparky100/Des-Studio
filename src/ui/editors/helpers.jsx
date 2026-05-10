import { C, FONT, toTitleCase, normTypeName } from "../shared/tokens.js";

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

const assignOptions = (entityTypes, stateVariables=[], queues=[], contextName="") => {
  const custs   = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>normTypeName(e.name));
  const servers = (entityTypes||[]).filter(e=>e.role==='server').map(e=>normTypeName(e.name));
  const opts = [{label:'— select effect —',value:''}];
  const cName = contextName || "service";
  // Queue-based ASSIGN combinations
  if(queues.length > 0) {
    opts.push({label:'── Start service from queue ──', value:'', disabled:true});
    queues.forEach(q => {
      servers.forEach(s => {
        opts.push({label:`Start ${cName} with ${s} and ${q.customerType||'entity'} from ${queueDisplayName(q.name)}`, value:`ASSIGN(${q.name}, ${s})`});
      });
    });
  }
  // ASSIGN combinations
  if(custs.length>0&&servers.length>0){
    opts.push({label:'── ASSIGN ──',value:'',disabled:true});
    custs.forEach(c=>servers.forEach(s=>{
      opts.push({label:`Start ${cName} with ${s} and ${c}`,value:`ASSIGN(${c}, ${s})`});
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
  return opts;
};

const bEffectOptions = (entityTypes, queues=[], stateVariables=[]) => {
  const custs   = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>normTypeName(e.name));
  const servers = (entityTypes||[]).filter(e=>e.role==='server').map(e=>normTypeName(e.name));
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
  if(servers.length>0){
    opts.push({label:'── Release server (multi-stage routing) ──',value:'',disabled:true});
    servers.forEach(s=>{
      opts.push({label:`Release ${s} (entity stays in current stage)`,value:`RELEASE(${s})`});
    });
  }
  if(queues.length > 0 && servers.length > 0) {
    opts.push({label:'── Release server and route entity to next queue ──', value:'', disabled:true});
    servers.forEach(s => {
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
  return opts;
};

// Dropdown — structured options only, no free-text escape hatch (audit C1)
const DropField = ({value, onChange, options, color}) => {
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

export { displayEventName, queueDisplayName, conditionOptions, assignOptions, bEffectOptions, DropField, toTitleCase, normTypeName };
