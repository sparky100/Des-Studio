import { SH, Btn, InfoBox, Empty } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

const StateVarEditor=({vars,onChange})=>{
  const { C, FONT } = useTheme();
  const add=()=>onChange([...vars,{id:"sv"+Date.now(),name:"",initialValue:"0",description:"",resetOnWarmup:false}]);
  const upd=(i,f,v)=>{const n=[...vars];n[i]={...n[i],[f]:v};onChange(n);};
  const rem=(i)=>onChange(vars.filter((_,idx)=>idx!==i));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS}}>Model Data</div>
          <div style={{fontSize:12,color:C.muted,fontFamily:SANS,marginTop:2}}>State variables for counters, gates, and tracked values</div>
        </div>
        <Btn variant="primary" onClick={add}>+ Add Data Item</Btn>
      </div>
      <InfoBox color={C.purple}>
        Use model data for counters, gates, and values that change during a run.{" "}
        <strong style={{color:C.purple}}>Available live measures:</strong>{" "}
        <code>queue(Type).length</code> · <code>idle(Type).count</code> · <code>busy(Type).count</code> ·{" "}
        <code>attr(Type,attrName)</code> · <code>served</code> · <code>reneged</code> · <code>clock</code>
      </InfoBox>
      {vars.length===0&&(
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px 24px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{fontSize:32,lineHeight:1}}>📊</div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:SANS}}>No state variables</div>
          <div style={{fontSize:13,color:C.muted,fontFamily:SANS,lineHeight:1.6,maxWidth:380}}>Most models don't need this. Add a variable to track a custom counter, gate, or value that changes during a run.</div>
          <Btn variant="primary" onClick={add}>+ Add Data Item</Btn>
        </div>
      )}
      {vars.map((sv,i)=>(
        <div key={sv.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:10,display:"flex",flexDirection:'column',gap:8}}>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input value={sv.name} onChange={e=>upd(i,"name",e.target.value)} placeholder="varName"
              style={{width:140,background:"transparent",border:`1px solid ${C.purple}44`,borderRadius:4,color:C.purple,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
            <span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>=</span>
            <input value={sv.initialValue} onChange={e=>upd(i,"initialValue",e.target.value)} placeholder="0"
              style={{width:80,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,padding:"5px 8px",outline:"none"}}/>
            <input value={sv.description} onChange={e=>upd(i,"description",e.target.value)} placeholder="Description"
              style={{flex:1,background:"transparent",border:`1px solid ${C.border}40`,borderRadius:4,color:C.muted,fontFamily:FONT,fontSize:11,padding:"5px 8px",outline:"none"}}/>
            <Btn small variant="danger" ariaLabel={`Remove state variable ${sv.name || i + 1}`} onClick={()=>rem(i)}>✕</Btn>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",color:sv.resetOnWarmup?C.amber:C.muted,fontFamily:FONT,fontSize:11,fontWeight:600}}>
            <input type="checkbox" checked={!!sv.resetOnWarmup} onChange={e=>upd(i,'resetOnWarmup',e.target.checked)} style={{accentColor:C.amber}}/>
            Reset after the start-up period
          </label>
        </div>
      ))}
    </div>
  );
};

export { StateVarEditor };
