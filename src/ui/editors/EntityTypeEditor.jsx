import { useState } from "react";
import { normTypeName } from "../shared/tokens.js";
import { Tag, Btn, CommitInput, SH, InfoBox, Empty, DistPicker, SectionPanel } from "../shared/components.jsx";
import { SectionFilterTabs, filterBySection } from "./helpers.jsx";
import { AttrEditor } from "./AttrEditor.jsx";
import { WeeklyPatternEditor } from "./WeeklyPatternEditor.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";
import { useTheme } from "../shared/ThemeContext.jsx";

// Operator display mapping for shift `when` rows — mirrors ConditionBuilder's
// stored-operator convention (>=, >, ==, !=, <, <=) with friendlier glyphs.
const SHIFT_OP_DISPLAY = [
  { stored: '>=', label: '≥' },
  { stored: '>',  label: '>' },
  { stored: '==', label: '=' },
  { stored: '!=', label: '≠' },
  { stored: '<',  label: '<' },
  { stored: '<=', label: '≤' },
];

// Reverse-map a stored shiftSchedule `when.variable` to a dropdown value:
// "state.X" -> "state.X" (display: X), "Queue.Y.length" -> as-is (display: "Queue length: Y").
// Unknown/missing variables still render — caller surfaces the not-found warning.
const shiftWhenVariableLabel=(variable,stateVariables,queues)=>{
  if(!variable)return"";
  if(variable.startsWith("state.")){
    const name=variable.slice(6);
    const exists=(stateVariables||[]).some(sv=>sv.name===name);
    return exists?name:`${name} (not found)`;
  }
  if(variable.startsWith("Queue.")&&variable.endsWith(".length")){
    const name=variable.slice(6,-7);
    const exists=(queues||[]).some(q=>q.name===name);
    return exists?`Queue length: ${name}`:`Queue length: ${name} (not found)`;
  }
  return variable;
};

const EntityTypeEditor=({types,sections=[],stateVariables=[],queues=[],epoch=null,timeUnit="minutes",errorFilter=null,onClearErrorFilter,skills=[],onChange})=>{
  const { C, FONT } = useTheme();
  const [filterText,setFilterText]=useState("");
  const [expandedIds,setExpandedIds]=useState(new Set());
  const [activeSectionIds,setActiveSectionIds]=useState([]);

  const toggleExpand=(id)=>setExpandedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const expandAll=()=>setExpandedIds(new Set(types.map(e=>e.id)));
  const collapseAll=()=>setExpandedIds(new Set());

  const add=()=>{
    const id="et"+Date.now();
    onChange([...types,{id,name:"",role:"customer",count:"",attrs:"",description:""}]);
    setExpandedIds(prev=>new Set([...prev,id]));
  };
  const upd=(i,f,v)=>{const n=[...types];n[i]={...n[i],[f]:v};onChange(n);};
  const commitName=(i,v)=>{
    const nextName = normTypeName(v);
    if ((types[i]?.name || "") === nextName) return;
    const n=[...types];
    n[i]={...n[i],name:nextName};
    onChange(n);
  };
  const rem=(i)=>onChange(types.filter((_,idx)=>idx!==i));
  const setShiftEnabled=(i,enabled)=>{
    const n=[...types];
    n[i]={...n[i],shiftSchedule:enabled
      ?(Array.isArray(n[i].shiftSchedule)&&n[i].shiftSchedule.length?n[i].shiftSchedule:[{time:"0",capacity:n[i].count||"1"}])
      :undefined};
    onChange(n);
  };
  const updShift=(i,j,patch)=>{
    const n=[...types];
    const schedule=[...(n[i].shiftSchedule||[])];
    schedule[j]={...schedule[j],...patch};
    n[i]={...n[i],shiftSchedule:schedule};
    onChange(n);
  };
  const addShift=(i,kind="time")=>{
    const n=[...types];
    const schedule=[...(n[i].shiftSchedule||[])];
    const last=schedule[schedule.length-1];
    if(kind==="when"){
      const defaultVar=(stateVariables[0]&&`state.${stateVariables[0].name}`)||(queues[0]&&`Queue.${queues[0].name}.length`)||"";
      schedule.push({when:{variable:defaultVar,operator:">=",value:""},capacity:last?.capacity||n[i].count||"1"});
    } else {
      schedule.push({time:last?String((parseFloat(last.time)||0)+60):"0",capacity:last?.capacity||n[i].count||"1"});
    }
    n[i]={...n[i],shiftSchedule:schedule};
    onChange(n);
  };
  const remShift=(i,j)=>{
    const n=[...types];
    n[i]={...n[i],shiftSchedule:(n[i].shiftSchedule||[]).filter((_,idx)=>idx!==j)};
    onChange(n);
  };
  const setShiftRowKind=(i,j,kind)=>{
    const n=[...types];
    const schedule=[...(n[i].shiftSchedule||[])];
    const step=schedule[j];
    if(kind==="when"){
      const defaultVar=(stateVariables[0]&&`state.${stateVariables[0].name}`)||(queues[0]&&`Queue.${queues[0].name}.length`)||"";
      schedule[j]={capacity:step.capacity,when:{variable:defaultVar,operator:">=",value:""}};
    } else {
      schedule[j]={capacity:step.capacity,time:"0"};
    }
    n[i]={...n[i],shiftSchedule:schedule};
    onChange(n);
  };
  const updShiftWhen=(i,j,patch)=>{
    const n=[...types];
    const schedule=[...(n[i].shiftSchedule||[])];
    schedule[j]={...schedule[j],when:{...schedule[j].when,...patch}};
    n[i]={...n[i],shiftSchedule:schedule};
    onChange(n);
  };

  const setPatternEnabled=(i,enabled)=>{
    const n=[...types];
    if(enabled){
      if(!epoch){
        alert("A weekly schedule pattern requires a Real-world start date (Epoch). Set one in Experiment Settings first.");
        return;
      }
      n[i]={...n[i],schedulePattern:{type:"weekly",defaultCapacity:0,periods:[],exceptions:[]},shiftSchedule:undefined};
    } else {
      n[i]={...n[i],schedulePattern:undefined};
    }
    onChange(n);
  };
  const updPattern=(i,patch)=>{
    const n=[...types];
    n[i]={...n[i],schedulePattern:patch};
    onChange(n);
  };

  const lcFilter=filterText.toLowerCase();
  const sectionFiltered=filterBySection(types, sections, activeSectionIds);
  const filteredEntityTypeIds=errorFilter?.filteredEntityTypeIds;
  const filtered=sectionFiltered.filter(et=>{
    const matchesText=!lcFilter||(et.name||"").toLowerCase().includes(lcFilter);
    const matchesError=!filteredEntityTypeIds||filteredEntityTypeIds.includes(et.id);
    return matchesText&&matchesError;
  });
  const effectiveExpanded=(lcFilter||filteredEntityTypeIds)?new Set(filtered.map(e=>e.id)):expandedIds;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS}}>Entity Types</div>
          <div style={{fontSize:12,color:C.muted,fontFamily:SANS,marginTop:2}}>Arriving entities and resource pools</div>
        </div>
        <Btn variant="primary" onClick={add}>+ Add Type</Btn>
      </div>
      <SectionFilterTabs sections={sections} activeIds={activeSectionIds} onToggle={setActiveSectionIds}/>
      {types.length>1&&(
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Filter by name…"
            style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none"}}/>
          {filteredEntityTypeIds&&(
            <div style={{display:"flex",alignItems:"center",gap:4,background:`${C.amber}26`,border:`1px solid ${C.amber}80`,borderRadius:4,padding:"3px 8px",color:C.amber,fontSize:11,fontFamily:FONT,whiteSpace:"nowrap"}}>
              Filtered by error
              <Btn small variant="ghost" onClick={onClearErrorFilter} style={{padding:"0 4px",minWidth:0}}>✕</Btn>
            </div>
          )}
          <Btn small variant="ghost" onClick={expandAll}>Expand all</Btn>
          <Btn small variant="ghost" onClick={collapseAll}>Collapse all</Btn>
        </div>
      )}
      <InfoBox color={C.server}>
        <strong style={{color:C.server}}>Arriving entity</strong> types are the things that join queues.{" "}
        <strong style={{color:C.server}}>Resource</strong> types are pre-created at t=0 with the given <em>count</em>.{" "}
        You can use resource properties in rules and timing decisions.{" "}
        Technical detail: server attributes such as <code>serviceTime=3</code> are available in C-event conditions via <code>attr(Type,attrName)</code>{" "}
        and in schedule delays via <code>server.attrName</code>.
      </InfoBox>
      {types.length===0&&(
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px 24px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{fontSize:32,lineHeight:1}}>👥</div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:SANS}}>No entity types yet</div>
          <div style={{fontSize:13,color:C.muted,fontFamily:SANS,lineHeight:1.6,maxWidth:380}}>Add an arriving entity type (customers, patients, calls) or a resource pool (nurses, servers, machines).</div>
          <Btn variant="primary" onClick={add}>+ Add Type</Btn>
        </div>
      )}
      {filtered.length===0&&types.length>0&&(
        <div style={{fontFamily:FONT,fontSize:11,color:C.muted,padding:"8px 0",fontStyle:"italic"}}>No types match{filteredEntityTypeIds?" error filter":filterText&&` "${filterText}"`}</div>
      )}
      {filtered.map((et)=>{
        const i=types.findIndex(e=>e.id===et.id);
        if(i===-1)return null;
        const isExpanded=effectiveExpanded.has(et.id);
        const attrCount=(Array.isArray(et.attrDefs)?et.attrDefs:[]).length;
        const hasShifts=et.role==="server"&&Array.isArray(et.shiftSchedule)&&et.shiftSchedule.length>0;
        const shiftFirstCap=hasShifts?parseInt(et.shiftSchedule[0]?.capacity,10)||1:null;
        const roleSummary=et.role==="server"?(hasShifts?`resource · pool ${shiftFirstCap} · ${et.shiftSchedule.length} shift${et.shiftSchedule.length!==1?"s":""}`:`resource · pool ${et.count||1}`):"arriving entity";

        return (
          <div key={et.id} style={{background:C.bg,border:`1px solid ${et.role==="server"?C.server+"44":C.cEvent+"33"}`,
            borderLeft:`3px solid ${et.role==="server"?C.server:C.cEvent}`,borderRadius:6,padding:12,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <button onClick={()=>toggleExpand(et.id)}
                style={{background:"none",border:"none",cursor:"pointer",padding:"2px 3px",color:isExpanded?(et.role==="server"?C.server:C.cEvent):C.muted,fontFamily:FONT,fontSize:11,lineHeight:1,flexShrink:0}}
                aria-label={isExpanded?"Collapse":"Expand"}>{isExpanded?"▾":"▸"}</button>
              <Tag label={et.role||"customer"} color={et.role==="server"?C.server:C.cEvent}/>
              <CommitInput value={et.name} onCommit={value=>commitName(i,value)} placeholder="TypeName"
                style={{width:130,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
              {!isExpanded&&(
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,background:`${C.border}30`,borderRadius:3,padding:"2px 6px"}}>{roleSummary}{attrCount>0?` · ${attrCount} attr${attrCount!==1?"s":""}`:""}</span>
              )}
              {isExpanded&&<>
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Role:</span>
                <select value={et.role||"customer"} onChange={e=>upd(i,"role",e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"}}>
                  <option value="customer">Arriving Entity</option>
                  <option value="server">Pre-created Resource</option>
                </select>
                {et.role==="server"&&<>
                  {hasShifts?(<>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>pool size:</span>
                    <span style={{fontSize:12,color:C.server,fontFamily:FONT,fontWeight:700,background:`${C.server}15`,border:`1px solid ${C.server}44`,borderRadius:4,padding:"5px 10px",minWidth:40,textAlign:"center"}}>{shiftFirstCap}</span>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>set by shift schedule</span>
                  </>):(<>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>pool size:</span>
                    <input
                      aria-label={`Server pool size for ${et.name||"server"}`}
                      type="number" min="1" step="1"
                      value={et.count||""} onChange={e=>upd(i,"count",parseInt(e.target.value,10)||"")} placeholder="1"
                      style={{width:60,background:"transparent",border:`1px solid ${C.server}55`,borderRadius:4,color:C.server,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
                    {parseInt(et.count||"1",10)>1&&(
                      <span style={{fontSize:10,color:C.server,fontFamily:FONT}}>
                        ({parseInt(et.count,10)} servers in pool)
                      </span>
                    )}
                  </>)}
                </>}
              </>}
              <Btn small variant="danger" ariaLabel={`Remove entity type ${et.name || i + 1}`} onClick={()=>rem(i)}>✕</Btn>
            </div>

            {isExpanded&&<>
              <AttrEditor
                attrs={Array.isArray(et.attrDefs)?et.attrDefs:[]}
                role={et.role||'customer'}
                onChange={v=>upd(i,'attrDefs',v)}
              />
              {et.role==="server"&&(
                <SectionPanel
                  label="Shift Schedule"
                  status={et.schedulePattern?"weekly pattern":Array.isArray(et.shiftSchedule)?`${et.shiftSchedule.length} shift${et.shiftSchedule.length!==1?"s":""}` :"off"}
                  color={C.server}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:FONT,fontSize:11,color:et.schedulePattern?C.server:Array.isArray(et.shiftSchedule)?C.server:C.muted}}>
                    <input type="checkbox" checked={!!et.schedulePattern} onChange={e=>setPatternEnabled(i,e.target.checked)} style={{accentColor:C.server}} disabled={!epoch}/>
                    Use recurring weekly schedule
                    {!epoch&&<span style={{fontSize:9,color:C.amber,marginLeft:4}}>(requires epoch)</span>}
                  </label>
                  {et.schedulePattern&&(
                    <WeeklyPatternEditor
                      pattern={et.schedulePattern}
                      epoch={epoch}
                      onChange={v=>updPattern(i,v)}
                    />
                  )}
                  {!et.schedulePattern&&<>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:FONT,fontSize:11,color:Array.isArray(et.shiftSchedule)?C.server:C.muted}}>
                    <input type="checkbox" checked={Array.isArray(et.shiftSchedule)} onChange={e=>setShiftEnabled(i,e.target.checked)} style={{accentColor:C.server}}/>
                    Use shift schedule (overrides static pool size)
                  </label>
                  {Array.isArray(et.shiftSchedule)&&(<>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>When capacity drops mid-shift:</span>
                      <select value={et.shiftBehavior||"delay"} onChange={e=>upd(i,"shiftBehavior",e.target.value)}
                        style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:10,padding:"3px 6px",outline:"none"}}>
                        <option value="delay">Delay — finish current entity, then go offline</option>
                        <option value="preempt">Preempt — interrupt entity, store remaining time</option>
                        <option value="suspend">Suspend — freeze work in place</option>
                      </select>
                    </div>
                    {(et.shiftSchedule||[]).map((step,j)=>{
                      const isWhen=!!step.when;
                      const capacity=Number(step.capacity);
                      const invalidCapacity=!Number.isInteger(capacity)||capacity<1;

                      if(isWhen){
                        const variable=step.when?.variable||"";
                        const operator=step.when?.operator||">=";
                        const whenValue=step.when?.value;
                        const varOptions=[
                          ...stateVariables.map(sv=>({value:`state.${sv.name}`,label:sv.name})),
                          ...queues.map(q=>({value:`Queue.${q.name}.length`,label:`Queue length: ${q.name}`})),
                        ];
                        const noVarsAvailable=varOptions.length===0;
                        const referencesMissingStateVar=variable.startsWith("state.")&&!stateVariables.some(sv=>`state.${sv.name}`===variable);
                        const errors=[];
                        if(!variable)errors.push("Select a variable");
                        if(whenValue===undefined||whenValue===null||whenValue==="")errors.push("Enter a value");
                        if(invalidCapacity)errors.push("Enter a whole number");
                        const warnings=[];
                        if(variable&&referencesMissingStateVar){
                          warnings.push(`State variable '${variable.slice(6)}' not found — this condition will never fire`);
                        }
                        return (
                          <div key={j} style={{display:"flex",flexDirection:"column",gap:4}}>
                            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                              <Btn small variant="ghost" onClick={()=>setShiftRowKind(i,j,"time")}>At time</Btn>
                              <Btn small variant="primary">When condition</Btn>
                              <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>when:</span>
                              <select value={variable} disabled={noVarsAvailable} onChange={e=>updShiftWhen(i,j,{variable:e.target.value})}
                                style={{minWidth:160,background:C.bg,border:`1px solid ${errors.includes("Select a variable")?C.red:C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 7px",outline:"none"}}>
                                {noVarsAvailable&&<option value="">No state variables defined — add one first</option>}
                                {!noVarsAvailable&&!varOptions.some(o=>o.value===variable)&&variable&&(
                                  <option value={variable}>{shiftWhenVariableLabel(variable,stateVariables,queues)}</option>
                                )}
                                {varOptions.map(o=>(<option key={o.value} value={o.value}>{o.label}</option>))}
                              </select>
                              <select value={operator} onChange={e=>updShiftWhen(i,j,{operator:e.target.value})}
                                style={{width:50,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 7px",outline:"none"}}>
                                {SHIFT_OP_DISPLAY.map(o=>(<option key={o.stored} value={o.stored}>{o.label}</option>))}
                              </select>
                              <input type="number" value={whenValue??""} placeholder="value" onChange={e=>updShiftWhen(i,j,{value:e.target.value})}
                                style={{width:72,background:"transparent",border:`1px solid ${errors.includes("Enter a value")?C.red:C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:"4px 7px",outline:"none"}}/>
                              <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>capacity:</span>
                              <input type="number" value={step.capacity??""} onChange={e=>updShift(i,j,{capacity:e.target.value})}
                                style={{width:72,background:"transparent",border:`1px solid ${invalidCapacity?C.red:C.border}`,borderRadius:4,color:C.server,fontFamily:FONT,fontSize:11,padding:"4px 7px",outline:"none"}}/>
                              <Btn small variant="danger" ariaLabel={`Remove shift period ${j+1}`} onClick={()=>remShift(i,j)}>x</Btn>
                            </div>
                            {(errors.length>0||warnings.length>0)&&(
                              <div style={{display:"flex",flexDirection:"column",gap:2,paddingLeft:8}}>
                                {errors.map((msg,ei)=>(<span key={ei} style={{fontSize:10,color:C.red,fontFamily:FONT}}>{msg}</span>))}
                                {warnings.map((msg,wi)=>(<span key={wi} style={{fontSize:10,color:C.amber,fontFamily:FONT}}>{msg}</span>))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      const time=parseFloat(step.time);
                      const prev=j>0?parseFloat(et.shiftSchedule[j-1].time):null;
                      const invalidTime=!Number.isFinite(time)||(j===0&&time!==0)||(j>0&&Number.isFinite(prev)&&time<prev);
                      const incomplete=(step.time===undefined||step.time===null||step.time==="")&&!step.when;
                      return (
                        <div key={j} style={{display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                            {j>0&&<>
                              <Btn small variant="primary">At time</Btn>
                              <Btn small variant="ghost" onClick={()=>setShiftRowKind(i,j,"when")}>When condition</Btn>
                            </>}
                            <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>from t:</span>
                            <input type="number" value={step.time??""} disabled={j===0} onChange={e=>updShift(i,j,{time:e.target.value})}
                              style={{width:72,background:"transparent",border:`1px solid ${invalidTime?C.red:C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:"4px 7px",outline:"none",opacity:j===0?0.7:1}}/>
                            <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>capacity:</span>
                            <input type="number" value={step.capacity??""} onChange={e=>updShift(i,j,{capacity:e.target.value})}
                              style={{width:72,background:"transparent",border:`1px solid ${invalidCapacity?C.red:C.border}`,borderRadius:4,color:C.server,fontFamily:FONT,fontSize:11,padding:"4px 7px",outline:"none"}}/>
                            <Btn small variant="danger" ariaLabel={`Remove shift period ${j+1}`} onClick={()=>remShift(i,j)}>x</Btn>
                          </div>
                          {(invalidCapacity||incomplete)&&(
                            <div style={{display:"flex",flexDirection:"column",gap:2,paddingLeft:8}}>
                              {invalidCapacity&&<span style={{fontSize:10,color:C.red,fontFamily:FONT}}>Enter a whole number</span>}
                              {incomplete&&<span style={{fontSize:10,color:C.red,fontFamily:FONT}}>Incomplete entry</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <Btn small variant="ghost" onClick={()=>addShift(i,"time")}>+ Add Shift</Btn>
                      <Btn small variant="ghost" onClick={()=>addShift(i,"when")}>+ Add Shift (when condition)</Btn>
                    </div>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>
                      The first shift period sets the initial pool size; the static count is ignored while shifts are in use. Shift changes add or remove idle servers at the scheduled times or when their condition first becomes true.
                    </span>
                  </>)}
                  </>}
                </SectionPanel>
              )}
              {et.role==="server"&&(
                <SectionPanel
                  label="Failure Model (MTBF / MTTR)"
                  status={et.mtbfDist?"configured":"off"}
                  color={C.red}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:FONT,fontSize:11,color:et.mtbfDist?C.red:C.muted}}>
                    <input type="checkbox" checked={!!et.mtbfDist} style={{accentColor:C.red}}
                      onChange={e=>{const n=[...types];n[i]=e.target.checked?{...n[i],failureScope:"unit",mtbfDist:"Exponential",mtbfDistParams:{mean:"120"},mttrDist:"Exponential",mttrDistParams:{mean:"20"}}:{...n[i],failureScope:undefined,mtbfDist:undefined,mtbfDistParams:undefined,mttrDist:undefined,mttrDistParams:undefined};onChange(n);}}/>
                    Model server failures
                  </label>
                  {et.mtbfDist&&(<>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:80}}>MTBF dist:</span>
                      <DistPicker compact allowPiecewise={false}
                        value={{dist:et.mtbfDist||"Exponential",distParams:et.mtbfDistParams||{mean:"120"}}}
                        onChange={v=>{const n=[...types];n[i]={...n[i],mtbfDist:v.dist,mtbfDistParams:v.distParams};onChange(n);}}/>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:80}}>MTTR dist:</span>
                      <DistPicker compact allowPiecewise={false}
                        value={{dist:et.mttrDist||"Exponential",distParams:et.mttrDistParams||{mean:"20"}}}
                        onChange={v=>{const n=[...types];n[i]={...n[i],mttrDist:v.dist,mttrDistParams:v.distParams};onChange(n);}}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:80}}>Failure scope:</span>
                      <select value={et.failureScope||"unit"} onChange={e=>{const n=[...types];n[i]={...n[i],failureScope:e.target.value};onChange(n);}}
                        style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:10,padding:"3px 6px",outline:"none"}}>
                        <option value="unit">Each unit — servers fail independently</option>
                        <option value="pool">Whole pool — one outage affects all servers</option>
                      </select>
                    </div>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>
                      {(et.failureScope||"unit")==="unit"
                        ? "Each server fails and recovers independently. A failure takes one unit offline; the rest keep working."
                        : "One failure takes the entire pool offline. All servers are repaired together."}
                    </span>
                  </>)}
                </SectionPanel>
              )}
              {et.role==="server"&&skills.length>0&&(
                <SectionPanel label="Skills" status={Array.isArray(et.skills)&&et.skills.length?`${et.skills.length} skill${et.skills.length>1?"s":""}`:"none"} color={C.server}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {skills.map(skill=>{
                      const has=Array.isArray(et.skills)&&et.skills.includes(skill);
                      return (
                        <label key={skill} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontFamily:FONT,fontSize:11,color:has?C.server:C.muted,userSelect:"none"}}>
                          <input type="checkbox" checked={has} style={{accentColor:C.server}}
                            onChange={()=>{
                              const n=[...types];
                              const current=Array.isArray(n[i].skills)?[...n[i].skills]:[];
                              n[i]={...n[i],skills:has?current.filter(s=>s!==skill):[...current,skill]};
                              onChange(n);
                            }}/>
                          {skill}
                        </label>
                      );
                    })}
                  </div>
                </SectionPanel>
              )}
              <input value={et.description||""} onChange={e=>upd(i,"description",e.target.value)} placeholder="Description"
                style={{background:"transparent",border:`1px solid ${C.border}40`,borderRadius:4,color:C.muted,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none",width:"100%",boxSizing:"border-box"}}/>
            </>}
          </div>
        );
      })}
    </div>
  );
};

export { EntityTypeEditor };
