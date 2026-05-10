import { C, FONT } from "../shared/tokens.js";
import { Tag, Btn, SH, InfoBox, Empty } from "../shared/components.jsx";

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
        Configure named waiting lines and which arriving entity type each queue accepts. Arrival dropdowns use this binding, so only compatible
        entity-to-queue combinations are offered. Set <em>capacity</em> for bounded queues (blank = unlimited).{' '}
        <strong>Discipline:</strong> FIFO (default), LIFO, or Priority.
      </InfoBox>
      {queues.length===0&&<Empty icon="Queues" msg="No named queues yet. Add a queue before defining new arrivals."/>}
      {queues.map((q,i)=>(
        <div key={q.id} style={{background:C.bg,border:`1px solid ${C.cEvent}33`,
          borderLeft:`3px solid ${C.cEvent}`,borderRadius:6,padding:12,
          display:'flex',flexDirection:'column',gap:10}}>

          {/* Row 1: Queue Name — full width */}
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>QUEUE NAME</span>
            <input value={q.name||''} onChange={e=>upd(i,'name',e.target.value)}
              placeholder="e.g. Triage Queue"
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
              <Btn small variant="danger" ariaLabel={`Remove queue ${q.name || i + 1}`} onClick={()=>rem(i)}>✕</Btn>
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
        </div>
      ))}
    </div>
  );
};

export { QueueEditor };
