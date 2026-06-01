import { useState } from "react";
import { normTypeName } from "../shared/tokens.js";
import { Tag, Btn, CommitInput, SH, InfoBox, Empty, DistPicker, SectionPanel } from "../shared/components.jsx";
import { AttrEditor } from "./AttrEditor.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const EntityTypeEditor=({types,onChange})=>{
  const [filterText,setFilterText]=useState("");
  const [expandedIds,setExpandedIds]=useState(new Set());

  const toggleExpand=(id)=>setExpandedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const expandAll=()=>setExpandedIds(new Set(types.map(e=>e.id)));
  const collapseAll=()=>setExpandedIds(new Set());

  const add=()=>{
  const { C, FONT } = useTheme();
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
  const addShift=(i)=>{
    const n=[...types];
    const schedule=[...(n[i].shiftSchedule||[])];
    const last=schedule[schedule.length-1];
    schedule.push({time:last?String((parseFloat(last.time)||0)+60):"0",capacity:last?.capacity||n[i].count||"1"});
    n[i]={...n[i],shiftSchedule:schedule};
    onChange(n);
  };
  const remShift=(i,j)=>{
    const n=[...types];
    n[i]={...n[i],shiftSchedule:(n[i].shiftSchedule||[]).filter((_,idx)=>idx!==j)};
    onChange(n);
  };

  const lcFilter=filterText.toLowerCase();
  const filtered=lcFilter?types.filter(et=>(et.name||"").toLowerCase().includes(lcFilter)):types;
  const effectiveExpanded=lcFilter?new Set(filtered.map(e=>e.id)):expandedIds;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <SH label="Entity Types" color={C.server}><Btn small variant="ghost" onClick={add}>+ Add Type</Btn></SH>
      {types.length>1&&(
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Filter by name…"
            style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none"}}/>
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
      {types.length===0&&<Empty icon="👥" msg="No entity types."/>}
      {filtered.length===0&&types.length>0&&(
        <div style={{fontFamily:FONT,fontSize:11,color:C.muted,padding:"8px 0",fontStyle:"italic"}}>No types match "{filterText}"</div>
      )}
      {filtered.map((et)=>{
        const i=types.findIndex(e=>e.id===et.id);
        if(i===-1)return null;
        const isExpanded=effectiveExpanded.has(et.id);
        const attrCount=(Array.isArray(et.attrDefs)?et.attrDefs:[]).length;
        const roleSummary=et.role==="server"?`resource · pool ${et.count||1}`:"arriving entity";

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
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>pool size:</span>
                  <input
                    aria-label={`Server pool size for ${et.name||"server"}`}
                    type="number" min="1" step="1"
                    value={et.count||""} onChange={e=>upd(i,"count",e.target.value)} placeholder="1"
                    style={{width:60,background:"transparent",border:`1px solid ${C.server}55`,borderRadius:4,color:C.server,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
                  {parseInt(et.count||"1",10)>1&&(
                    <span style={{fontSize:10,color:C.server,fontFamily:FONT}}>
                      ({parseInt(et.count,10)} servers in pool)
                    </span>
                  )}
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
                  status={Array.isArray(et.shiftSchedule)?`${et.shiftSchedule.length} shift${et.shiftSchedule.length!==1?"s":""}` :"off"}
                  color={C.server}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:FONT,fontSize:11,color:Array.isArray(et.shiftSchedule)?C.server:C.muted}}>
                    <input type="checkbox" checked={Array.isArray(et.shiftSchedule)} onChange={e=>setShiftEnabled(i,e.target.checked)} style={{accentColor:C.server}}/>
                    Use shift schedule (overrides static pool size)
                  </label>
                  {Array.isArray(et.shiftSchedule)&&(<>
                    {(et.shiftSchedule||[]).map((step,j)=>{
                      const time=parseFloat(step.time);
                      const prev=j>0?parseFloat(et.shiftSchedule[j-1].time):null;
                      const capacity=Number(step.capacity);
                      const invalidTime=!Number.isFinite(time)||(j===0&&time!==0)||(j>0&&Number.isFinite(prev)&&time<prev);
                      const invalidCapacity=!Number.isInteger(capacity)||capacity<1;
                      return (
                        <div key={j} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>from t:</span>
                          <input type="number" value={step.time??""} disabled={j===0} onChange={e=>updShift(i,j,{time:e.target.value})}
                            style={{width:72,background:"transparent",border:`1px solid ${invalidTime?C.red:C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:"4px 7px",outline:"none",opacity:j===0?0.7:1}}/>
                          <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>capacity:</span>
                          <input type="number" value={step.capacity??""} onChange={e=>updShift(i,j,{capacity:e.target.value})}
                            style={{width:72,background:"transparent",border:`1px solid ${invalidCapacity?C.red:C.border}`,borderRadius:4,color:C.server,fontFamily:FONT,fontSize:11,padding:"4px 7px",outline:"none"}}/>
                          <Btn small variant="danger" ariaLabel={`Remove shift period ${j+1}`} onClick={()=>remShift(i,j)}>x</Btn>
                        </div>
                      );
                    })}
                    <Btn small variant="ghost" onClick={()=>addShift(i)} style={{alignSelf:"flex-start"}}>+ Add Shift</Btn>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>
                      The first shift sets initial capacity; static count is ignored while this is enabled.
                    </span>
                  </>)}
                </SectionPanel>
              )}
              {et.role==="server"&&(
                <SectionPanel
                  label="Failure Model (MTBF / MTTR)"
                  status={et.mtbfDist?"configured":"off"}
                  color={C.red}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:FONT,fontSize:11,color:et.mtbfDist?C.red:C.muted}}>
                    <input type="checkbox" checked={!!et.mtbfDist} style={{accentColor:C.red}}
                      onChange={e=>{const n=[...types];n[i]=e.target.checked?{...n[i],mtbfDist:"Exponential",mtbfDistParams:{mean:"60"},mttrDist:"Exponential",mttrDistParams:{mean:"10"}}:{...n[i],mtbfDist:undefined,mtbfDistParams:undefined,mttrDist:undefined,mttrDistParams:undefined};onChange(n);}}/>
                    Model server failures
                  </label>
                  {et.mtbfDist&&(<>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:80}}>MTBF dist:</span>
                      <DistPicker compact allowPiecewise={false}
                        value={{dist:et.mtbfDist||"Exponential",distParams:et.mtbfDistParams||{mean:"60"}}}
                        onChange={v=>{const n=[...types];n[i]={...n[i],mtbfDist:v.dist,mtbfDistParams:v.distParams};onChange(n);}}/>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:FONT,minWidth:80}}>MTTR dist:</span>
                      <DistPicker compact allowPiecewise={false}
                        value={{dist:et.mttrDist||"Exponential",distParams:et.mttrDistParams||{mean:"10"}}}
                        onChange={v=>{const n=[...types];n[i]={...n[i],mttrDist:v.dist,mttrDistParams:v.distParams};onChange(n);}}/>
                    </div>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>
                      The engine automatically schedules FAIL and REPAIR events for servers of this type.
                    </span>
                  </>)}
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
