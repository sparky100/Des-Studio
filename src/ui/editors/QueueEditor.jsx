import { useState } from "react";
import { Tag, Btn, CommitInput, SH, InfoBox, Empty } from "../shared/components.jsx";
import { SectionFilterTabs, filterBySection } from "./helpers.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

const disciplineBase = d => {
  if (!d || d.toUpperCase() === 'FIFO') return 'FIFO';
  const m = String(d).match(/^PRIORITY\((\w+)\)$/i);
  if (m) return m[1].toLowerCase() === 'priority' ? 'PRIORITY' : 'PRIORITY_ATTR';
  return String(d).toUpperCase();
};
const disciplineAttr = d => {
  const m = String(d || '').match(/^PRIORITY\((\w+)\)$/i);
  return m ? m[1] : 'priority';
};

const QueueEditor = ({queues=[], entityTypes=[], sections=[], errorFilter=null, onClearErrorFilter, onChange}) => {
  const { C, FONT } = useTheme();
  const [filterText,setFilterText]=useState("");
  const [expandedIds,setExpandedIds]=useState(new Set());
  const [activeSectionId,setActiveSectionId]=useState("all");

  const toggleExpand=(id)=>setExpandedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const expandAll=()=>setExpandedIds(new Set(queues.map(q=>q.id)));
  const collapseAll=()=>setExpandedIds(new Set());

  const customerTypes = (entityTypes||[])
    .filter(e=>e.role==='customer')
    .map(e=>e.name.trim());

  const add = () => {
    const id='q'+Date.now();
    onChange([...queues, {
      id,
      name: '',
      customerType: customerTypes[0]||'',
      capacity: '',
      discipline: 'FIFO',
      description: '',
    }]);
    setExpandedIds(prev=>new Set([...prev,id]));
  };

  const upd = (i, f, v) => { const n=[...queues]; n[i]={...n[i],[f]:v}; onChange(n); };
  const commitName = (i, value) => {
    if ((queues[i]?.name || "") === value) return;
    const n=[...queues];
    n[i]={...n[i],name:value};
    onChange(n);
  };
  const rem = (i) => onChange(queues.filter((_,idx)=>idx!==i));

  const inpStyle = (color) => ({
    background:'transparent', border:`1px solid ${color||C.border}`,
    borderRadius:4, color:C.text, fontFamily:FONT, fontSize:12,
    padding:'6px 8px', outline:'none', width:'100%', boxSizing:'border-box',
  });

  const lcFilter=filterText.toLowerCase();
  const sectionFiltered=filterBySection(queues, sections, activeSectionId);
  const filteredQueueIds=errorFilter?.filteredQueueIds;
  const filtered=sectionFiltered.filter(q=>{
    const matchesText=!lcFilter||(q.name||"").toLowerCase().includes(lcFilter);
    const matchesError=!filteredQueueIds||filteredQueueIds.includes(q.id);
    return matchesText&&matchesError;
  });
  const effectiveExpanded=(lcFilter||filteredQueueIds)?new Set(filtered.map(q=>q.id)):expandedIds;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS}}>Queues</div>
          <div style={{fontSize:12,color:C.muted,fontFamily:SANS,marginTop:2}}>Named waiting lines for arriving entities</div>
        </div>
        <Btn variant="primary" onClick={add}>+ Add Queue</Btn>
      </div>
      <SectionFilterTabs sections={sections} activeId={activeSectionId} onChange={setActiveSectionId}/>
      {queues.length>1&&(
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Filter by name…"
            style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none"}}/>
          {filteredQueueIds&&(
            <div style={{display:"flex",alignItems:"center",gap:4,background:`${C.amber}26`,border:`1px solid ${C.amber}80`,borderRadius:4,padding:"3px 8px",color:C.amber,fontSize:11,fontFamily:FONT,whiteSpace:"nowrap"}}>
              Filtered by error
              <Btn small variant="ghost" onClick={onClearErrorFilter} style={{padding:"0 4px",minWidth:0}}>✕</Btn>
            </div>
          )}
          <Btn small variant="ghost" onClick={expandAll}>Expand all</Btn>
          <Btn small variant="ghost" onClick={collapseAll}>Collapse all</Btn>
        </div>
      )}
      <InfoBox color={C.cEvent}>
        Configure named waiting lines and which arriving entity type each queue accepts. Arrival dropdowns use this binding, so only compatible
        entity-to-queue combinations are offered. Set <em>capacity</em> for bounded queues (blank = unlimited).{' '}
        <strong>Discipline:</strong> FIFO (default), LIFO, or Priority.
      </InfoBox>
      {queues.length===0&&(
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px 24px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{fontSize:32,lineHeight:1}}>🚶</div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:SANS}}>No queues yet</div>
          <div style={{fontSize:13,color:C.muted,fontFamily:SANS,lineHeight:1.6,maxWidth:380}}>Add a named waiting line — define which entity type it accepts, the discipline (FIFO/LIFO/Priority), and an optional capacity.</div>
          <Btn variant="primary" onClick={add}>+ Add Queue</Btn>
        </div>
      )}
      {filtered.length===0&&queues.length>0&&(
        <div style={{fontFamily:FONT,fontSize:11,color:C.muted,padding:"8px 0",fontStyle:"italic"}}>No queues match{filteredQueueIds?" error filter":filterText&&` "${filterText}"`}</div>
      )}
      {filtered.map((q)=>{
        const i=queues.findIndex(x=>x.id===q.id);
        if(i===-1)return null;
        const isExpanded=effectiveExpanded.has(q.id);
        const summary=[q.customerType||"no type",q.discipline||"FIFO",q.capacity?`cap ${q.capacity}`:"unlimited"].join(" · ");

        return (
          <div key={q.id} style={{background:C.bg,border:`1px solid ${C.cEvent}33`,
            borderLeft:`3px solid ${C.cEvent}`,borderRadius:6,padding:12,
            display:'flex',flexDirection:'column',gap:isExpanded?10:0}}>

            {/* Collapsed header — always visible */}
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <button onClick={()=>toggleExpand(q.id)}
                style={{background:"none",border:"none",cursor:"pointer",padding:"2px 3px",color:isExpanded?C.cEvent:C.muted,fontFamily:FONT,fontSize:11,lineHeight:1,flexShrink:0}}
                aria-label={isExpanded?"Collapse":"Expand"}>{isExpanded?"▾":"▸"}</button>
              <CommitInput value={q.name||''} onCommit={value=>commitName(i,value)}
                placeholder="Queue name"
                style={{flex:1,minWidth:130,...inpStyle(C.cEvent+'88'),color:C.text}}/>
              {!isExpanded&&(
                <span style={{fontSize:10,color:C.muted,fontFamily:FONT,background:`${C.border}30`,borderRadius:3,padding:"2px 6px"}}>{summary}</span>
              )}
              <Btn small variant="danger" ariaLabel={`Remove queue ${q.name || i + 1}`} onClick={()=>rem(i)}>✕</Btn>
            </div>

            {isExpanded&&<>
              {/* Row 2: Accepts dropdown + Discipline dropdown */}
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
                <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:160}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>DISCIPLINE</span>
                  <select value={disciplineBase(q.discipline)} onChange={e=>{
                    const v=e.target.value;
                    upd(i,'discipline',v==='PRIORITY_ATTR'?`PRIORITY(${disciplineAttr(q.discipline)||'priority'})`:v);
                  }} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,
                    color:C.text,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none',width:'100%'}}>
                    <option value='FIFO'>FIFO — First In, First Out</option>
                    <option value='LIFO'>LIFO — Last In, First Out</option>
                    <option value='PRIORITY'>Priority (uses "priority" attr)</option>
                    <option value='PRIORITY_ATTR'>Priority (custom attribute)…</option>
                    <option value='SPT'>SPT — Shortest Processing Time</option>
                    <option value='EDD'>EDD — Earliest Due Date</option>
                  </select>
                  {disciplineBase(q.discipline)==='PRIORITY_ATTR'&&(
                    <input value={disciplineAttr(q.discipline)}
                      onChange={e=>upd(i,'discipline',`PRIORITY(${e.target.value})`)}
                      placeholder="attrName (e.g. severity)"
                      style={{background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,
                        color:C.amber,fontFamily:FONT,fontSize:11,padding:'4px 7px',outline:'none'}}/>
                  )}
                </div>
              </div>

              {/* Row 3: Max length + Overflow destination + Description */}
              <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
                <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:120}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>MAX LENGTH</span>
                  <input
                    aria-label={`Max queue length for ${q.name||'queue'}`}
                    type="number" min="1" step="1"
                    value={q.capacity||''} onChange={e=>upd(i,'capacity',e.target.value)}
                    placeholder="unlimited"
                    style={{...inpStyle(C.border),color:C.amber,width:120}}/>
                </div>
                {q.capacity && (
                  <div style={{display:'flex',flexDirection:'column',gap:4,flex:1,minWidth:160}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>WHEN FULL — SEND TO</span>
                    <select
                      aria-label={`Overflow destination for ${q.name||'queue'}`}
                      value={q.overflowDestination||''} onChange={e=>upd(i,'overflowDestination',e.target.value||null)}
                      style={{background:C.bg,border:`1px solid ${C.amber}55`,borderRadius:4,
                        color:q.overflowDestination?C.amber:C.muted,fontFamily:FONT,fontSize:12,padding:'6px 8px',outline:'none',width:'100%'}}>
                      <option value=''>Exit system (reject)</option>
                      {queues.filter((_,idx)=>idx!==i).map(oq=>(
                        <option key={oq.id||oq.name} value={oq.name}>{oq.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{display:'flex',flexDirection:'column',gap:4,flex:1,minWidth:140}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>DESCRIPTION</span>
                  <input value={q.description||''} onChange={e=>upd(i,'description',e.target.value)}
                    placeholder="Description"
                    style={{...inpStyle(C.border+'40'),color:C.muted}}/>
                </div>
              </div>
            </>}
          </div>
        );
      })}
    </div>
  );
};

export { QueueEditor };
