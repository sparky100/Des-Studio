// ui/shared/components.jsx — Reusable micro-components
import { useState, useRef } from "react";
import { C, FONT } from "./tokens.js";
import { DISTRIBUTIONS } from "../../engine/distributions.js";

const Tag=({label,color=C.muted})=>(
  <span style={{background:color+"18",border:`1px solid ${color}44`,color,borderRadius:3,padding:"2px 7px",fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",fontFamily:FONT}}>{label}</span>
);
const PhaseTag=({phase})=>{
  const cfg={A:{color:C.phaseA,label:"Phase A"},B:{color:C.phaseB,label:"Phase B"},
             C:{color:C.phaseC,label:"Phase C"},INIT:{color:C.muted,label:"Init"},END:{color:C.green,label:"Done"},
             WARMUP:{color:C.amber,label:"Warmup"}};
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

// ═══════════════════════════════════════════════════════════════════════════════
// DISTRIBUTION PICKER — reusable widget used by both B-event schedules and C-events
// ═══════════════════════════════════════════════════════════════════════════════
const DistPicker=({value,onChange,compact})=>{
  const fileRef=useRef(null);
  const [csvParse,setCsvParse]=useState(null); // { fileName, headers, rows, colIdx }

  const v=value||{dist:"Exponential",distParams:{}};
  const isImported=v.dist==="Empirical"&&Array.isArray(v.distParams?.values)&&v.distParams.values.length>0;
  const dd=DISTRIBUTIONS[v.dist||"Fixed"]||DISTRIBUTIONS.Fixed;

  const selSt={width:compact?160:200,background:C.bg,border:`1px solid ${C.cEvent}55`,
    borderRadius:4,color:C.cEvent,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"};

  const handleDistChange=(sel)=>{
    if(sel==="__csv__"){fileRef.current?.click();return;}
    onChange({...v,dist:sel,distParams:{}});
    setCsvParse(null);
  };

  const handleFileSelect=(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    e.target.value=""; // allow re-selecting same file
    const reader=new FileReader();
    reader.onload=(evt)=>{
      const lines=evt.target.result.split(/\r?\n/).filter(l=>l.trim());
      if(lines.length<2)return;
      const delim=lines[0].includes("\t")?"\t":lines[0].includes(";")?";":","
      const unq=s=>s.trim().replace(/^["']|["']$/g,"");
      const headers=lines[0].split(delim).map(unq);
      const rows=lines.slice(1).map(l=>l.split(delim).map(unq));
      setCsvParse({fileName:file.name,headers,rows,colIdx:0});
    };
    reader.readAsText(file);
  };

  const confirmImport=()=>{
    if(!csvParse)return;
    const {fileName,headers,rows,colIdx}=csvParse;
    const col=headers[colIdx];
    const accepted=[],skipped=[];
    for(const row of rows){
      const cell=row[colIdx];
      const n=parseFloat(cell);
      if(!cell||isNaN(n)||!isFinite(n)){skipped.push(cell);continue;}
      accepted.push(n);
    }
    const total=accepted.length+skipped.length;
    if(!total)return;
    const skipRate=skipped.length/total;
    if(skipRate>0.1&&!window.confirm(
      `${Math.round(skipRate*100)}% of rows skipped (${skipped.length}/${total} non-numeric). Import anyway?`
    ))return;
    if(!accepted.length){window.alert("No numeric values found in this column.");return;}
    const min=Math.min(...accepted),max=Math.max(...accepted);
    const mean=accepted.reduce((s,x)=>s+x,0)/accepted.length;
    onChange({dist:"Empirical",distParams:{values:accepted},
      sourceFile:fileName,column:col,
      _csvStats:{count:accepted.length,skipped:skipped.length,
        min:+min.toFixed(4),max:+max.toFixed(4),mean:+mean.toFixed(4)}});
    setCsvParse(null);
  };

  const btnSt=(col)=>({background:col+"18",border:`1px solid ${col}55`,borderRadius:4,
    color:col,fontFamily:FONT,fontSize:11,padding:"3px 10px",cursor:"pointer"});

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleFileSelect}/>

      {/* Distribution selector row */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <select value={v.dist||"Exponential"} onChange={e=>handleDistChange(e.target.value)} style={selSt}>
          {Object.keys(DISTRIBUTIONS).map(d=><option key={d} value={d}>{DISTRIBUTIONS[d].label}</option>)}
          <option disabled value="">──────────</option>
          <option value="__csv__">⬆ Import from CSV…</option>
        </select>
        {/* Param inputs — shown for non-CSV distributions */}
        {!isImported&&dd.params.map(param=>(
          <div key={param} style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>{param}:</span>
            <input type="number" value={(v.distParams||{})[param]||""}
              onChange={e=>onChange({...v,distParams:{...(v.distParams||{}),[param]:e.target.value}})}
              style={{width:60,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,
                color:C.amber,fontFamily:FONT,fontSize:11,padding:"3px 6px",outline:"none"}}/>
          </div>
        ))}
        {/* Re-import button shown when CSV is loaded */}
        {isImported&&<button onClick={()=>fileRef.current?.click()} style={btnSt(C.cEvent)}>Re-import CSV</button>}
      </div>

      {/* Column picker — appears after file is parsed */}
      {csvParse&&(
        <div style={{background:C.surface,border:`1px solid ${C.cEvent}44`,borderRadius:6,padding:"10px 12px",
          display:"flex",flexDirection:"column",gap:8}}>
          <span style={{fontSize:11,color:C.text,fontFamily:FONT,fontWeight:600}}>
            {csvParse.fileName} — select numeric column
          </span>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <select value={csvParse.colIdx}
              onChange={e=>setCsvParse(p=>({...p,colIdx:parseInt(e.target.value)}))}
              style={{...selSt,width:"auto"}}>
              {csvParse.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}
            </select>
            <button onClick={confirmImport} style={btnSt(C.green)}>Import</button>
            <button onClick={()=>setCsvParse(null)} style={btnSt(C.muted)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Summary for imported CSV */}
      {isImported&&v._csvStats&&(
        <div style={{fontSize:10,color:C.muted,fontFamily:FONT,background:C.surface,borderRadius:4,padding:"4px 10px"}}>
          {v.sourceFile} · col: <span style={{color:C.amber}}>{v.column}</span> ·{" "}
          {v._csvStats.count} values · min {v._csvStats.min} · max {v._csvStats.max} · mean {v._csvStats.mean}
          {v._csvStats.skipped>0&&<span style={{color:C.amber}}> · {v._csvStats.skipped} skipped</span>}
        </div>
      )}

      {/* Distribution hint for non-CSV modes */}
      {!isImported&&!csvParse&&(
        <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>{dd.hint}</span>
      )}
    </div>
  );
};

export { Tag, PhaseTag, Avatar, Btn, Field, SH, InfoBox, Empty, DistPicker };

