import { C, FONT } from "../shared/tokens.js";
import { SH, Btn, InfoBox, Empty } from "../shared/components.jsx";

const StateVarEditor=({vars,onChange})=>{
  const add=()=>onChange([...vars,{id:"sv"+Date.now(),name:"",initialValue:"0",description:"",resetOnWarmup:false}]);
  const upd=(i,f,v)=>{const n=[...vars];n[i]={...n[i],[f]:v};onChange(n);};
  const rem=(i)=>onChange(vars.filter((_,idx)=>idx!==i));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <SH label="Model Data" color={C.purple}><Btn small variant="ghost" onClick={add}>+ Add Data Item</Btn></SH>
      <InfoBox color={C.purple}>
        Use model data for counters, gates, and values that change during a run.{" "}
        <strong style={{color:C.purple}}>Available live measures:</strong>{" "}
        <code>queue(Type).length</code> · <code>idle(Type).count</code> · <code>busy(Type).count</code> ·{" "}
        <code>attr(Type,attrName)</code> · <code>served</code> · <code>reneged</code> · <code>clock</code>
      </InfoBox>
      {vars.length===0&&<Empty icon="Data" msg="No custom model data needed for most models."/>}
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
