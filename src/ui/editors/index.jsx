// ui/editors/index.jsx — All model editor components
import { useState } from "react";
import { C, FONT, normTypeName } from "../shared/tokens.js";
import { Tag, Btn, Field, SH, InfoBox, Empty } from "../shared/components.jsx";
import { DISTRIBUTIONS } from "../../engine/distributions.js";
import { buildConditionTokens } from "../../engine/conditions.js";

// ── UI Polish Helpers ─────────────────────────────────────────────────────────
const toTitleCase = s => s.trim().replace(/\b\w/g, c => c.toUpperCase());

const conditionOptions = (entityTypes, stateVariables=[], queues=[]) => {
  const custs   = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>normTypeName(e.name));
  const servers = (entityTypes||[]).filter(e=>e.role==='server').map(e=>normTypeName(e.name));
  const opts = [{label:'— select condition —',value:''}];
  if(queues.length > 0) {
    opts.push({label:'── Queue lengths ──', value:'', disabled:true});
    queues.forEach(q => {
      opts.push({label:`queue(${q.name}).length > 0`, value:`queue(${q.name}).length > 0`});
      opts.push({label:`queue(${q.name}).length == 0`, value:`queue(${q.name}).length == 0`});
    });
  }
  if(queues.length > 0 && servers.length > 0) {
    opts.push({label:'── Queue + Server combinations ──', value:'', disabled:true});
    queues.forEach(q => {
      servers.forEach(s => {
        opts.push({
          label: `queue(${q.name}).length > 0 AND idle(${s}).count > 0`,
          value: `queue(${q.name}).length > 0 AND idle(${s}).count > 0`,
        });
      });
    });
  }
  custs.forEach(c=>{
    opts.push({label:`queue(${c}).length > 0`,value:`queue(${c}).length > 0`});
    opts.push({label:`queue(${c}).length == 0`,value:`queue(${c}).length == 0`});
  });
  servers.forEach(s=>{
    opts.push({label:`idle(${s}).count > 0`,value:`idle(${s}).count > 0`});
    opts.push({label:`busy(${s}).count > 0`,value:`busy(${s}).count > 0`});
  });
  if(custs.length>0&&servers.length>0){
    const c=custs[0],s=servers[0];
    opts.push({label:`queue(${c}).length > 0 AND idle(${s}).count > 0`,
               value:`queue(${c}).length > 0 AND idle(${s}).count > 0`});
  }
  opts.push({label:'served > 0',value:'served > 0'});
  opts.push({label:'reneged > 0',value:'reneged > 0'});
  opts.push({label:'Custom...',value:'__custom__'});
  return opts;
};

const assignOptions = (entityTypes, stateVariables=[], queues=[]) => {
  const custs   = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>normTypeName(e.name));
  const servers = (entityTypes||[]).filter(e=>e.role==='server').map(e=>normTypeName(e.name));
  const opts = [{label:'— select effect —',value:''}];
  // Queue-based ASSIGN combinations
  if(queues.length > 0) {
    opts.push({label:'── ASSIGN from queue ──', value:'', disabled:true});
    queues.forEach(q => {
      servers.forEach(s => {
        opts.push({label:`ASSIGN(${q.name}, ${s})`, value:`ASSIGN(${q.name}, ${s})`});
      });
    });
  }
  // ASSIGN combinations
  if(custs.length>0&&servers.length>0){
    opts.push({label:'── ASSIGN ──',value:'',disabled:true});
    custs.forEach(c=>servers.forEach(s=>{
      opts.push({label:`ASSIGN(${c}, ${s})`,value:`ASSIGN(${c}, ${s})`});
    }));
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
  opts.push({label:'Custom...',value:'__custom__'});
  return opts;
};

const bEffectOptions = (entityTypes, queues=[]) => {
  const custs   = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>normTypeName(e.name));
  const servers = (entityTypes||[]).filter(e=>e.role==='server').map(e=>normTypeName(e.name));
  const opts = [{label:'— select effect —',value:''}];
  custs.forEach(c=>{
    opts.push({label:`ARRIVE(${c})`,value:`ARRIVE(${c})`});
    opts.push({label:`ARRIVE(${c}); totalArrived++`,value:`ARRIVE(${c}); totalArrived++`});
  });
  if(queues.length > 0) {
    opts.push({label:'── ARRIVE into queue ──', value:'', disabled:true});
    custs.forEach(c => {
      queues.forEach(q => {
        opts.push({label:`ARRIVE(${c}, ${q.name})`, value:`ARRIVE(${c}, ${q.name})`});
        opts.push({label:`ARRIVE(${c}, ${q.name}); totalArrived++`, value:`ARRIVE(${c}, ${q.name}); totalArrived++`});
      });
    });
  }
  opts.push({label:'COMPLETE()',value:'COMPLETE()'});
  opts.push({label:'RENEGE(ctx)',value:'RENEGE(ctx)'});
  custs.forEach(c=>{
    opts.push({label:`RENEGE_OLDEST(${c})`,value:`RENEGE_OLDEST(${c})`});
  });
  if(servers.length>0){
    opts.push({label:'── Release server ──',value:'',disabled:true});
    servers.forEach(s=>{
      opts.push({label:`RELEASE(${s})`,value:`RELEASE(${s})`});
    });
  }
  if(queues.length > 0) {
    opts.push({label:'── RELEASE to queue ──', value:'', disabled:true});
    servers.forEach(s => {
      queues.forEach(q => {
        opts.push({label:`RELEASE(${s}, ${q.name})`, value:`RELEASE(${s}, ${q.name})`});
        opts.push({label:`RELEASE(${s}, ${q.name}); totalTriaged++`, value:`RELEASE(${s}, ${q.name}); totalTriaged++`});
      });
    });
  }
  opts.push({label:'Custom...',value:'__custom__'});
  return opts;
};

// Dropdown + optional custom free-text
const DropField = ({value, onChange, options, color, placeholder}) => {
  const matched = options.some(o=>o.value===value&&o.value!=='__custom__'&&o.value!=='');
  const [custom, setCustom] = useState(!matched&&!!value);
  const col = color||C.green;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:4,flex:1}}>
      <select value={custom?'__custom__':(value||'')}
        onChange={e=>{
          if(e.target.value==='__custom__'){setCustom(true);}
          else{setCustom(false);onChange(e.target.value);}
        }}
        style={{background:C.bg,border:`1px solid ${col}55`,borderRadius:4,
          color:col,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none',width:'100%'}}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {custom&&(
        <input value={value||''} onChange={e=>onChange(e.target.value)}
          placeholder={placeholder||'Enter custom value'}
          style={{background:'transparent',border:`1px solid ${col}44`,borderRadius:4,
            color:col,fontFamily:FONT,fontSize:12,padding:'5px 8px',outline:'none',
            width:'100%',boxSizing:'border-box'}}/>
      )}
    </div>
  );
};


// Distribution picker — used by BEventEditor schedule rows
const DistPicker = ({value, onChange, compact}) => {
  const v = value||{dist:"Exponential",distParams:{}};
  const dd = DISTRIBUTIONS[v.dist||"Fixed"]||DISTRIBUTIONS.Fixed;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <select value={v.dist||"Exponential"} onChange={e=>onChange({...v,dist:e.target.value,distParams:{}})}
          style={{width:compact?160:200,background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
            color:C.cEvent,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
          {Object.keys(DISTRIBUTIONS).map(d=><option key={d} value={d}>{DISTRIBUTIONS[d].label}</option>)}
        </select>
        {dd.params.map(param=>(
          <div key={param} style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>{param}:</span>
            <input value={(v.distParams||{})[param]||""} onChange={e=>onChange({...v,distParams:{...(v.distParams||{}),[param]:e.target.value}})}
              style={{width:60,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,
                color:C.amber,fontFamily:FONT,fontSize:11,padding:"3px 6px",outline:"none"}}/>
          </div>
        ))}
      </div>
      <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>{dd.hint}</span>
    </div>
  );
};

// ── Attribute Definition Editor ───────────────────────────────────────────────
// Each attribute: { id, name, dist, distParams }
// For servers: dist is typically Fixed (deterministic serviceTime)
// For customers: dist can be any distribution (sampled fresh per ARRIVE)

const AttrEditor = ({attrs=[], onChange, role='customer'}) => {
  const add = () => onChange([...attrs, {
    id:'a'+Date.now(), name:'', dist:'Fixed', distParams:{value:'1'}
  }]);
  const upd = (i, patch) => {
    const n=[...attrs]; n[i]={...n[i],...patch}; onChange(n);
  };
  const rem = (i) => onChange(attrs.filter((_,idx)=>idx!==i));

  const inpStyle = (color) => ({
    background:'transparent', border:`1px solid ${color||C.border}`,
    borderRadius:4, color:C.text, fontFamily:FONT, fontSize:11,
    padding:'4px 7px', outline:'none',
  });

  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>
          ATTRIBUTES {role==='customer'?'(sampled per arrival)':'(fixed per server)'}
        </span>
        <Btn small variant="ghost" onClick={add}>+ Add Attr</Btn>
      </div>
      {attrs.length===0&&(
        <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>
          No attributes. {role==='customer'
            ? 'Add e.g. patience with Uniform distribution for reneging.'
            : 'Add e.g. serviceTime=3 (Fixed) for service duration.'}
        </span>
      )}
      {attrs.map((a,i)=>{
        const dd = DISTRIBUTIONS[a.dist||'Fixed']||DISTRIBUTIONS.Fixed;
        return (
          <div key={a.id} style={{background:C.surface,borderRadius:6,padding:'8px 10px',
            border:`1px solid ${role==='server'?C.server+'33':C.cEvent+'33'}`,
            display:'flex',flexDirection:'column',gap:6}}>
            {/* Row 1: name + distribution */}
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              <input value={a.name} onChange={e=>upd(i,{name:e.target.value})}
                placeholder="attrName" style={{...inpStyle(C.amber),width:110}}/>
              <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>~</span>
              <select value={a.dist||'Fixed'} onChange={e=>upd(i,{dist:e.target.value,distParams:{}})}
                style={{...inpStyle(C.accent),flex:1}}>
                {Object.entries(DISTRIBUTIONS).map(([k,v])=>(
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <Btn small variant="danger" onClick={()=>rem(i)}>✕</Btn>
            </div>
            {/* Row 2: distribution params */}
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',paddingLeft:4}}>
              {dd.params.map(p=>(
                <div key={p} style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>{p}:</span>
                  <input value={(a.distParams||{})[p]||''}
                    onChange={e=>upd(i,{distParams:{...(a.distParams||{}),[p]:e.target.value}})}
                    style={{...inpStyle(C.amber),width:60}}/>
                </div>
              ))}
              <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>
                {dd.hint}
              </span>
            </div>
            {/* Preview */}
            {a.name&&(
              <div style={{fontSize:10,color:C.muted,fontFamily:FONT}}>
                → <span style={{color:C.accent}}>{a.name}</span> sampled from{' '}
                <span style={{color:C.amber}}>{a.dist||'Fixed'}({Object.values(a.distParams||{}).join(', ')})</span>
                {' '}on each {role==='customer'?'arrival':'server creation'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const EntityTypeEditor=({types,onChange})=>{
  const add=()=>onChange([...types,{id:"et"+Date.now(),name:"",role:"customer",count:"",attrs:"",description:""}]);
  const upd=(i,f,v)=>{const n=[...types];n[i]={...n[i],[f]:v};onChange(n);};
  const blurName=(i,v)=>{const n=[...types];n[i]={...n[i],name:normTypeName(v)};onChange(n);};
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
            <input value={et.name} onChange={e=>upd(i,"name",e.target.value)} onBlur={e=>blurName(i,e.target.value)} placeholder="TypeName"
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
          <AttrEditor
            attrs={Array.isArray(et.attrDefs)?et.attrDefs:[]}
            role={et.role||'customer'}
            onChange={v=>upd(i,'attrDefs',v)}
          />
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

const BEventEditor=({events,onChange,entityTypes=[],queues=[]})=>{
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
              <DropField value={ev.effect} onChange={v=>upd(i,'effect',v)}
                options={bEffectOptions(entityTypes, queues)} color={C.green}
                placeholder="e.g. ARRIVE(Customer); totalArrived++"/>
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


// ── Condition Builder ─────────────────────────────────────────────────────────
// Builds a validated condition string from structured rows.
// Each row: { id, token, operator, value, join } 
// join = 'AND' | 'OR' (ignored on first row)

const buildConditionStr = (rows) => {
  return rows.map((r,i) => {
    const clause = `${r.token} ${r.operator} ${r.value}`;
    return i===0 ? clause : `${r.join} ${clause}`;
  }).join(' ');
};

const parseConditionStr = (str, tokens) => {
  // Try to parse existing condition string back into rows
  // Supports: TOKEN OP VALUE (AND|OR TOKEN OP VALUE)*
  if(!str||!str.trim()) return [];
  const parts = str.trim().split(/\b(AND|OR)\b/i);
  const rows = [];
  let join = 'AND';
  parts.forEach(part => {
    part = part.trim();
    if(part.toUpperCase()==='AND'||part.toUpperCase()==='OR'){
      join = part.toUpperCase(); return;
    }
    const m = part.match(/^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
    if(m){
      const token = m[1].trim();
      const op    = m[2].trim();
      const val   = m[3].trim();
      const knownToken = tokens.find(t=>t.value===token);
      rows.push({
        id: 'r'+Date.now()+Math.random(),
        token: knownToken ? token : (tokens[0]?.value||''),
        operator: ['>=','<=','==','!=','>','<'].includes(op) ? op : '>',
        value: val||'0',
        join,
      });
      join = 'AND';
    }
  });
  return rows;
};

const ConditionBuilder = ({value, onChange, entityTypes=[], stateVariables=[], queues=[]}) => {
  // Build token list from queues, entity types and state variables
  const queueTokens = (queues||[]).map(q => ({
    label: `queue(${q.name}).length — entities in ${q.name}`,
    value: `queue(${q.name}).length`,
    valueType: 'number',
  }));
  const entityTypeTokens = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>({
    label: `queue(${normTypeName(e.name)}).length  — customers waiting`,
    value: `queue(${normTypeName(e.name)}).length`,
    valueType: 'number',
  }));
  const serverTokens = (entityTypes||[]).filter(e=>e.role==='server').map(e=>([
    { label:`idle(${normTypeName(e.name)}).count  — idle servers`,
      value:`idle(${normTypeName(e.name)}).count`, valueType:'number' },
    { label:`busy(${normTypeName(e.name)}).count  — busy servers`,
      value:`busy(${normTypeName(e.name)}).count`, valueType:'number' },
  ])).flat();
  const builtInTokens = [
    { label:'served  — cumulative customers served', value:'served', valueType:'number' },
    { label:'reneged  — cumulative customers reneged', value:'reneged', valueType:'number' },
  ];
  const stateVarTokens = (stateVariables||[]).filter(sv=>sv.name).map(sv=>({
    label: `${sv.name}  — ${sv.description||'state variable'}`,
    value: sv.name,
    valueType: 'number',
  }));
  const tokens = [
    ...queueTokens,
    ...entityTypeTokens,
    ...serverTokens,
    ...builtInTokens,
    ...stateVarTokens,
  ];

  const OPERATORS = ['>', '>=', '<', '<=', '==', '!='];

  const [rows, setRows] = useState(()=>parseConditionStr(value, tokens));

  // Sync rows → condition string whenever rows change
  const updateRows = (newRows) => {
    setRows(newRows);
    onChange(buildConditionStr(newRows));
  };

  const addRow = () => {
    const defaultToken = tokens[0]?.value||'';
    updateRows([...rows, {
      id:'r'+Date.now(), token:defaultToken,
      operator:'>', value:'0', join:'AND',
    }]);
  };

  const removeRow = (idx) => updateRows(rows.filter((_,i)=>i!==idx));

  const updRow = (idx, patch) => {
    const n = [...rows];
    n[idx] = {...n[idx], ...patch};
    updateRows(n);
  };

  const sel = (extra={}) => ({
    background:C.bg, border:`1px solid ${C.cEvent}55`, borderRadius:4,
    color:C.cEvent, fontFamily:FONT, fontSize:12,
    padding:'6px 8px', outline:'none', ...extra,
  });

  if(tokens.length===0) return (
    <div style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic',padding:'6px 0'}}>
      Define entity types and state variables first — they appear here as condition tokens.
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {rows.length===0 && (
        <div style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>
          No conditions yet — tap + Add Clause to build a condition.
        </div>
      )}
      {rows.map((row,idx)=>(
        <div key={row.id} style={{display:'flex',flexDirection:'column',gap:6}}>
          {/* AND/OR join (not shown for first row) */}
          {idx>0&&(
            <div style={{display:'flex',gap:6,paddingLeft:8}}>
              {['AND','OR'].map(j=>(
                <button key={j} onClick={()=>updRow(idx,{join:j})} style={{
                  background: row.join===j ? C.cEvent+'33' : 'transparent',
                  border:`1px solid ${row.join===j ? C.cEvent : C.border}`,
                  borderRadius:4, color:row.join===j?C.cEvent:C.muted,
                  fontFamily:FONT, fontSize:11, fontWeight:700,
                  padding:'3px 12px', cursor:'pointer',
                }}>{j}</button>
              ))}
            </div>
          )}
          {/* Clause row: token + operator + value + remove */}
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',
            background:C.bg,border:`1px solid ${C.cEvent}22`,
            borderRadius:6,padding:'8px 10px'}}>
            {/* Token dropdown */}
            <select value={row.token} onChange={e=>updRow(idx,{token:e.target.value})}
              style={{...sel(),flex:2,minWidth:180}}>
              {tokens.map(t=>(
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {/* Operator dropdown */}
            <select value={row.operator} onChange={e=>updRow(idx,{operator:e.target.value})}
              style={{...sel(),width:60}}>
              {OPERATORS.map(op=><option key={op} value={op}>{op}</option>)}
            </select>
            {/* Value input */}
            <input type="number" value={row.value}
              onChange={e=>updRow(idx,{value:e.target.value})}
              style={{width:60,background:'transparent',border:`1px solid ${C.border}`,
                borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,
                padding:'5px 8px',outline:'none'}}/>
            {/* Remove */}
            <Btn small variant="danger" onClick={()=>removeRow(idx)}>✕</Btn>
          </div>
        </div>
      ))}
      {/* Add clause + preview */}
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <Btn small variant="ghost" onClick={addRow}>+ Add Clause</Btn>
        {rows.length>0&&(
          <div style={{fontSize:11,color:C.muted,fontFamily:FONT,
            background:C.surface,borderRadius:4,padding:'4px 10px',flex:1}}>
            <span style={{color:C.cEvent}}>{buildConditionStr(rows)||'—'}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const CEventEditor=({events, onChange, bEvents=[], entityTypes=[], stateVariables=[], queues=[]})=>{
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
        <strong style={{color:C.cEvent}}>Effect macros:</strong>{" "}
        <code>ASSIGN(CustomerType, ServerType)</code> — match customer to server.{" "}
        <strong>Scalar effects</strong> also supported: <code>VAR++</code> · <code>VAR--</code> · <code>VAR += N</code> · <code>VAR = value</code><br/>
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
          <div style={{display:"flex",flexDirection:'column',gap:6}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.5,fontWeight:700}}>CONDITION</span>
            <ConditionBuilder
              value={ev.condition}
              onChange={v=>upd(i,'condition',v)}
              entityTypes={entityTypes}
              stateVariables={stateVariables}
              queues={queues}
            />
          </div>

          {/* Effect — ASSIGN only */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:72}}>effect(s):</span>
            <DropField value={ev.effect} onChange={v=>upd(i,'effect',v)}
              options={assignOptions(entityTypes, stateVariables, queues)} color={C.green}
              placeholder="e.g. ASSIGN(Customer, Server); totalServed++"/>
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


const QueueEditor = ({queues=[], entityTypes=[], onChange}) => {
  const customerTypes = (entityTypes||[])
    .filter(e=>e.role==='customer')
    .map(e=>e.name.trim());

  const add = () => onChange([...queues, {
    id: 'q'+Date.now(),
    name: '',
    customerType: customerTypes[0]||'',
    capacity: '',
    discipline: 'FIFO',
    description: '',
  }]);

  const upd = (i, f, v) => { const n=[...queues]; n[i]={...n[i],[f]:v}; onChange(n); };
  const rem = (i) => onChange(queues.filter((_,idx)=>idx!==i));

  const inpStyle = (color) => ({
    background:'transparent', border:`1px solid ${color||C.border}`,
    borderRadius:4, color:C.text, fontFamily:FONT, fontSize:12,
    padding:'6px 8px', outline:'none', width:'100%', boxSizing:'border-box',
  });

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <SH label="Queues" color={C.cEvent}><Btn small variant="ghost" onClick={add}>+ Add Queue</Btn></SH>
      <InfoBox color={C.cEvent}>
        Configure per-customer-type queue properties. Each <strong style={{color:C.cEvent}}>customer</strong> type
        automatically has an implicit queue. Set <em>capacity</em> for bounded queues (blank = unlimited).{' '}
        <strong>Discipline:</strong> FIFO (default), LIFO, or Priority.
      </InfoBox>
      {queues.length===0&&<Empty icon="🗂️" msg="No explicit queue configuration — all customer queues default to FIFO with unlimited capacity."/>}
      {queues.map((q,i)=>(
        <div key={q.id} style={{background:C.bg,border:`1px solid ${C.cEvent}33`,
          borderLeft:`3px solid ${C.cEvent}`,borderRadius:6,padding:12,
          display:'flex',flexDirection:'column',gap:10}}>

          {/* Row 1: Queue Name — full width */}
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>QUEUE NAME</span>
            <input value={q.name||''} onChange={e=>upd(i,'name',e.target.value)}
              placeholder="e.g. TriageQueue"
              style={{...inpStyle(C.cEvent+'88'),color:C.text}}/>
          </div>

          {/* Row 2: Accepts dropdown + Discipline dropdown + ✕ */}
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{display:'flex',flexDirection:'column',gap:4,flex:1,minWidth:140}}>
              <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>ACCEPTS</span>
              <select value={q.customerType||''} onChange={e=>upd(i,'customerType',e.target.value)}
                style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:4,
                  color:C.cEvent,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none',width:'100%'}}>
                <option value=''>— select customer type —</option>
                {customerTypes.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:120}}>
              <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>DISCIPLINE</span>
              <select value={q.discipline||'FIFO'} onChange={e=>upd(i,'discipline',e.target.value)}
                style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
                  color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none',width:'100%'}}>
                <option value='FIFO'>FIFO</option>
                <option value='LIFO'>LIFO</option>
                <option value='Priority'>Priority</option>
              </select>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4,justifyContent:'flex-end'}}>
              <span style={{fontSize:10,color:'transparent',fontFamily:FONT}}>&nbsp;</span>
              <Btn small variant="danger" onClick={()=>rem(i)}>✕</Btn>
            </div>
          </div>

          {/* Row 3: Max length + Description */}
          <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:120}}>
              <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>MAX LENGTH</span>
              <input value={q.capacity||''} onChange={e=>upd(i,'capacity',e.target.value)}
                placeholder="unlimited"
                style={{...inpStyle(C.border),color:C.amber,width:120}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4,flex:1,minWidth:160}}>
              <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>DESCRIPTION</span>
              <input value={q.description||''} onChange={e=>upd(i,'description',e.target.value)}
                placeholder="Description"
                style={{...inpStyle(C.border+'40'),color:C.muted}}/>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export {
  AttrEditor, EntityTypeEditor, StateVarEditor,
  BEventEditor, CEventEditor, ConditionBuilder,
  QueueEditor,
  toTitleCase, normTypeName, conditionOptions, assignOptions, bEffectOptions, DropField
};

