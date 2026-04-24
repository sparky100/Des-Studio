// Shared.jsx — Design tokens and reusable micro-components

const C={
  bg:"#080c10",surface:"#0d1117",panel:"#111820",border:"#1e2d3d",
  accent:"#06b6d4",text:"#cdd9e5",muted:"#5c7a99",
  green:"#3fb950",amber:"#f0883e",red:"#f85149",purple:"#8b5cf6",
  bEvent:"#f59e0b",cEvent:"#06b6d4",server:"#a78bfa",
  phaseA:"#8b5cf6",phaseB:"#f59e0b",phaseC:"#06b6d4",
  waiting:"#f0883e",serving:"#06b6d4",served:"#3fb950",reneged:"#f85149",idle:"#3fb950",busy:"#f59e0b",
};
const FONT="'JetBrains Mono','Fira Code',monospace";

const Tag=({label,color=C.muted})=>(
  <span style={{background:color+"18",border:`1px solid ${color}44`,color,borderRadius:3,padding:"2px 7px",fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",fontFamily:FONT}}>{label}</span>
);
const PhaseTag=({phase})=>{
  const cfg={A:{color:C.phaseA,label:"Phase A"},B:{color:C.phaseB,label:"Phase B"},
             C:{color:C.phaseC,label:"Phase C"},INIT:{color:C.muted,label:"Init"},END:{color:C.green,label:"Done"}};
  const c=cfg[phase]||{color:C.muted,label:phase};
  return <Tag label={c.label} color={c.color}/>;
};
const Avatar=({u,size=28})=>(
  <div style={{width:size,height:size,borderRadius:"50%",background:u.color+"22",border:`1.5px solid ${u.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:u.color,fontFamily:FONT,flexShrink:0}}>{u.initials}</div>
);
const Btn=({children,onClick,variant="ghost",small,disabled,full,style={}})=>{
  const v={primary:{bg:C.accent,fg:"#080c10",br:C.accent},ghost:{bg:"#ffffff08",fg:C.text,br:C.border},
    danger:{bg:C.red+"18",fg:C.red,br:C.red+"44"},success:{bg:C.green+"18",fg:C.green,br:C.green+"44"},
    amber:{bg:C.amber+"18",fg:C.amber,br:C.amber+"44"}}[variant]||{bg:"#ffffff08",fg:C.text,br:C.border};
  return <button onClick={onClick} disabled={disabled} style={{background:v.bg,color:v.fg,border:`1px solid ${v.br}`,borderRadius:5,padding:small?"4px 10px":"7px 14px",fontSize:small?11:12,fontWeight:600,fontFamily:FONT,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.45:1,display:"inline-flex",alignItems:"center",gap:6,width:full?"100%":undefined,justifyContent:full?"center":undefined,transition:"opacity .15s",flexShrink:0,...style}}>{children}</button>;
};
const Field=({label,value,onChange,multiline,rows=2,placeholder=""})=>(
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label&&<label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase",fontFamily:FONT}}>{label}</label>}
    {multiline
      ?<textarea value={value||""} onChange={e=>onChange?.(e.target.value)} rows={rows} placeholder={placeholder} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:12,padding:"8px 10px",resize:"vertical",outline:"none",lineHeight:1.6}}/>
      :<input value={value||""} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:12,padding:"8px 10px",outline:"none",width:"100%",boxSizing:"border-box"}}/>}
  </div>
);
const SH=({label,color=C.muted,children})=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,paddingBottom:8,marginBottom:12}}>
    <span style={{fontSize:10,fontWeight:700,letterSpacing:1.8,textTransform:"uppercase",color,fontFamily:FONT}}>{label}</span>
    {children}
  </div>
);
const InfoBox=({color,children})=>(
  <div style={{background:color+"0f",border:`1px solid ${color}33`,borderRadius:6,padding:"10px 14px",fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.8}}>{children}</div>
);
const Empty=({icon,msg})=>(
  <div style={{textAlign:"center",padding:"24px 16px",color:C.muted,fontFamily:FONT,fontSize:12}}>
    <div style={{fontSize:24,marginBottom:8}}>{icon}</div>{msg}
  </div>
);

export { C, FONT, Tag, PhaseTag, Avatar, Btn, Field, SH, InfoBox, Empty };
