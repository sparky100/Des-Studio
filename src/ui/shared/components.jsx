// ui/shared/components.jsx — Reusable micro-components
import React, { Component, useEffect, useId, useState, useRef } from "react";
import { C, FONT, SPACE, RADIUS, TYPO, alpha } from "./tokens.js";
import { DISTRIBUTIONS } from "../../engine/distributions.js";
import { DIST_GROUPS, DIST_HELP, getDistGroup, validateDistParams } from "./DistHelp.js";
import { DistSparkline } from "./DistSparkline.jsx";
import { parsePlanCsv } from "./planCsvParser.js";
import { parseXlsx } from "./xlsxParser.js";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const title = this.props.title || "Something went wrong";
    const message = this.props.message || "This panel could not render.";
    const errorMessage = this.state.error?.message || String(this.state.error);

    return (
      <div role="alert" style={{
        background: alpha(C.red, 0.07),
        border: `1px solid ${alpha(C.red, 0.27)}`,
        borderRadius: 8,
        padding: 14,
        color: C.text,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{title}</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{message}</div>
        <code style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 5,
          color: C.amber,
          fontSize: 11,
          padding: "7px 9px",
          whiteSpace: "pre-wrap",
        }}>
          {errorMessage}
        </code>
        {this.props.onReset && <Btn small variant="ghost" onClick={this.reset}>Try again</Btn>}
      </div>
    );
  }
}

const Tag=React.memo(({label,color=C.muted})=>(
  <span style={{background:color+"18",border:`1px solid ${color}44`,color,borderRadius:3,padding:"2px 7px",fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",fontFamily:FONT}}>{label}</span>
));
const PhaseTag=React.memo(({phase})=>{
  const cfg={A:{color:C.phaseA,label:"Phase A"},B:{color:C.phaseB,label:"Phase B"},
             C:{color:C.phaseC,label:"Phase C"},INIT:{color:C.muted,label:"Init"},END:{color:C.green,label:"Done"},
             WARMUP:{color:C.amber,label:"Warmup"}};
  const c=cfg[phase]||{color:C.muted,label:phase};
  return <Tag label={c.label} color={c.color}/>;
});
const Avatar=({u,size=28})=>(
  <div style={{width:size,height:size,borderRadius:"50%",background:u.color+"22",border:`1.5px solid ${u.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:u.color,fontFamily:FONT,flexShrink:0}}>{u.initials}</div>
);
/**
 * Btn — primary action button.
 * Variants: "primary" (accent fill), "ghost" (subtle surface), "danger" (red tint),
 *           "amber" (warning tint), "success" (green tint — use sparingly for confirmation states).
 */
const Btn=({children,onClick,variant="ghost",small,disabled,full,style={},ariaLabel,title,type="button"})=>{
  const v={
    primary:{bg:C.accent,            fg:"#080c10",br:C.accent},
    ghost:  {bg:C.surfaceHover,      fg:C.text,   br:C.border},
    danger: {bg:alpha(C.red,0.09),   fg:C.red,    br:alpha(C.red,0.27)},
    success:{bg:alpha(C.green,0.09), fg:C.green,  br:alpha(C.green,0.27)},
    amber:  {bg:alpha(C.amber,0.09), fg:C.amber,  br:alpha(C.amber,0.27)},
  }[variant]||{bg:C.surfaceHover,fg:C.text,br:C.border};
  return <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title}
    style={{background:v.bg,color:v.fg,border:`1px solid ${v.br}`,borderRadius:RADIUS.md,
      padding:small?`${SPACE.xs}px ${SPACE.sm+2}px`:`${SPACE.sm-1}px ${SPACE.md+2}px`,
      fontSize:small?11:12,fontWeight:600,fontFamily:FONT,cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.45:1,display:"inline-flex",alignItems:"center",gap:SPACE.sm-2,
      width:full?"100%":undefined,justifyContent:full?"center":undefined,
      transition:"opacity 120ms ease",flexShrink:0,...style}}>{children}</button>;
};
const Field=({label,value,onChange,multiline,rows=2,placeholder="",autoFocus=false,inputStyle={}})=>{
  const generatedId=useId();
  const id=`field-${generatedId}`;
  const inputBase={background:C.bg,border:`1px solid ${C.border}`,borderRadius:RADIUS.sm,color:C.text,
    fontFamily:FONT,fontSize:12,padding:`${SPACE.sm}px ${SPACE.sm+2}px`,outline:"none"};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:SPACE.xs+1}}>
      {label&&<label htmlFor={id} style={{...TYPO.label,color:C.muted,fontFamily:FONT,letterSpacing:"1.5px"}}>{label}</label>}
      {multiline
        ?<textarea id={id} value={value||""} onChange={e=>onChange?.(e.target.value)} rows={rows} placeholder={placeholder} autoFocus={autoFocus} style={{...inputBase,resize:"vertical",lineHeight:1.6,...inputStyle}}/>
        :<input id={id} value={value||""} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} style={{...inputBase,width:"100%",boxSizing:"border-box",...inputStyle}}/>}
    </div>
  );
};
const CommitInput=({
  value,
  onCommit,
  transform,
  placeholder="",
  autoFocus=false,
  ariaLabel,
  disabled=false,
  maxLength,
  style={},
})=>{
  const [draft,setDraft]=useState(value||"");
  useEffect(()=>{setDraft(value||"");},[value]);
  const commit=()=>{
    const nextRaw=draft ?? "";
    const next=transform ? transform(nextRaw) : nextRaw;
    if((value||"") !== next){
      onCommit?.(next);
    }else if(nextRaw !== next){
      setDraft(next);
    }
  };
  return (
    <input
      value={draft}
      onChange={e=>setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e=>{
        if(e.key==="Enter"){
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        }
        if(e.key==="Escape"){
          e.preventDefault();
          setDraft(value||"");
          e.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      maxLength={maxLength}
      style={style}
    />
  );
};
const SH=({label,color=C.muted,children})=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,paddingBottom:SPACE.sm,marginBottom:SPACE.md}}>
    <span style={{...TYPO.label,letterSpacing:"1.8px",color,fontFamily:FONT}}>{label}</span>
    {children}
  </div>
);
const InfoBox=({color,children})=>(
  <div style={{background:alpha(color,0.06),border:`1px solid ${alpha(color,0.2)}`,borderRadius:RADIUS.md,padding:`${SPACE.sm+2}px ${SPACE.md+2}px`,fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.8}}>{children}</div>
);
const Empty=({icon,msg,action})=>(
  <div style={{textAlign:"center",padding:"24px 16px",color:C.muted,fontFamily:FONT,fontSize:12,display:"flex",flexDirection:"column",alignItems:"center",gap:SPACE.sm}}>
    <div style={{fontSize:24}}>{icon}</div>
    <div>{msg}</div>
    {action&&<Btn small variant="ghost" onClick={action.onClick}>{action.label}</Btn>}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// DISTRIBUTION PICKER — reusable widget used by both B-event schedules and C-events
// ═══════════════════════════════════════════════════════════════════════════════
const PiecewiseEditor=({value,onChange,compact})=>{
  const periods=Array.isArray(value?.distParams?.periods)?value.distParams.periods:[];
  const upd=(i,patch)=>{
    const next=[...periods];
    next[i]={...next[i],...patch};
    onChange({...value,dist:"Piecewise",distParams:{...(value.distParams||{}),periods:next}});
  };
  const add=()=>{
    const last=periods[periods.length-1];
    const startTime=last?String((parseFloat(last.startTime||0)||0)+60):"0";
    onChange({...value,dist:"Piecewise",distParams:{...(value.distParams||{}),periods:[...periods,{startTime,distribution:{dist:"Exponential",distParams:{mean:"1"}}}]}});
  };
  const rem=(i)=>onChange({...value,dist:"Piecewise",distParams:{...(value.distParams||{}),periods:periods.filter((_,idx)=>idx!==i)}});
  const unsorted=periods.some((p,i)=>i>0&&(parseFloat(p.startTime)||0)<(parseFloat(periods[i-1].startTime)||0));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,background:C.surface,border:`1px solid ${C.cEvent}33`,borderRadius:6,padding:10}}>
      {periods.map((period,i)=>(
        <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>
          <label style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>from t:</span>
            <input type="number" value={period.startTime??""} disabled={i===0} onChange={e=>upd(i,{startTime:e.target.value})}
              style={{width:70,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:11,padding:"3px 6px",outline:"none",opacity:i===0?0.7:1}}/>
          </label>
          <DistPicker value={period.distribution||{dist:"Exponential",distParams:{mean:"1"}}}
            onChange={distribution=>upd(i,{distribution})} compact={compact} allowPiecewise={false}/>
          <Btn small variant="danger" ariaLabel={`Remove piecewise period ${i + 1}`} onClick={()=>rem(i)}>x</Btn>
        </div>
      ))}
      {periods.length===0&&<span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>No periods yet. Add a period starting at t=0.</span>}
      {unsorted&&<span style={{fontSize:10,color:C.red,fontFamily:FONT}}>Periods must be sorted by start time.</span>}
      {periods[0]&&parseFloat(periods[0].startTime)!==0&&<span style={{fontSize:10,color:C.red,fontFamily:FONT}}>First period must start at t=0.</span>}
      <Btn small variant="ghost" onClick={add} style={{alignSelf:"flex-start"}}>+ Add Period</Btn>
    </div>
  );
};

const ScheduleEditor=({value,onChange,attrDefs=[],epoch,timeUnit})=>{
  const dp=value?.distParams||{};
  const hasRows=Array.isArray(dp.rows);
  const times=hasRows?dp.rows.map(r=>r.time):(Array.isArray(dp.times)?dp.times:[]);
  const jitterDist=dp.jitterDist||"";
  const jitterParams=dp.jitterParams||{};
  const updDp=(patch)=>onChange({...value,distParams:{...dp,...patch}});
  const [rawText,setRawText]=React.useState(times.join(", "));
  const [rowsMode,setRowsMode]=React.useState(hasRows);
  const [importNotice,setImportNotice]=React.useState(null);
  const [csvPreview,setCsvPreview]=React.useState(null);
  const [previewExpanded,setPreviewExpanded]=React.useState(false);
  const fileRef=React.useRef(null);

  const commitText=(text)=>{
    const parsed=text.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean).map(Number).filter(n=>Number.isFinite(n));
    updDp({times:parsed,rows:undefined});
  };

  const onFileChange=(e)=>{
    const file=e.target.files?.[0];
    if(!file) return;
    e.target.value="";
    const isXlsx=/\.(xlsx|xls|ods)$/i.test(file.name);
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const opts={epoch:epoch||null,timeUnit:timeUnit||'minutes'};
      const result=isXlsx
        ? parseXlsx(ev.target.result,opts)
        : parsePlanCsv(ev.target.result,opts);
      setCsvPreview({fileName:file.name,...result});
      setPreviewExpanded(false);
    };
    if(isXlsx) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const confirmCsvImport=()=>{
    if(!csvPreview) return;
    const {rows,attrHeaders}=csvPreview;
    if(attrHeaders.length>0){
      updDp({rows,times:undefined});
      setRowsMode(true);
      setImportNotice(`✓ ${rows.length} arrival${rows.length!==1?"s":""} imported with ${attrHeaders.length} attribute${attrHeaders.length!==1?"s":""} — save the model to keep this data.`);
    } else {
      const flat=rows.map(r=>r.time);
      setRawText(flat.join(", "));
      updDp({times:flat,rows:undefined});
      setRowsMode(false);
      setImportNotice(`✓ ${flat.length} arrival time${flat.length!==1?"s":""} imported — save the model to keep this data.`);
    }
    setCsvPreview(null);
  };

  const toggleRowsMode=(on)=>{
    setRowsMode(on);
    if(on){
      const baseRows=times.map(t=>({time:t,attrs:{}}));
      updDp({rows:baseRows.length?baseRows:[{time:0,attrs:{}}],times:undefined});
    } else {
      const flatTimes=(dp.rows||[]).map(r=>Number(r.time)).filter(n=>Number.isFinite(n));
      setRawText(flatTimes.join(", "));
      updDp({times:flatTimes,rows:undefined});
    }
  };

  const updateRow=(idx,field,val)=>{
    const rows=(dp.rows||[]).map((r,i)=>i===idx?{...r,[field]:field==="time"?Number(val):val}:r);
    updDp({rows});
  };

  const updateRowAttr=(idx,attrName,val)=>{
    const rows=(dp.rows||[]).map((r,i)=>i===idx?{...r,attrs:{...r.attrs,[attrName]:val===""?undefined:val}}:r);
    updDp({rows});
  };

  const addRow=()=>{
    const rows=[...(dp.rows||[]),{time:0,attrs:{}}];
    updDp({rows});
  };

  const removeRow=(idx)=>{
    const rows=(dp.rows||[]).filter((_,i)=>i!==idx);
    updDp({rows});
  };

  const inpSt={background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.amber,
    fontFamily:FONT,fontSize:11,padding:"3px 6px",outline:"none"};
  const selSt={...inpSt,color:C.cEvent};
  const labelSt={fontSize:10,color:C.muted,fontFamily:FONT};
  const thSt={fontSize:10,color:C.muted,fontFamily:FONT,padding:"2px 6px",textAlign:"left",whiteSpace:"nowrap"};
  const tdSt={padding:"2px 4px"};

  const numAttrDefs=attrDefs.filter(a=>a.name);
  const inferredAttrNames=[...new Set((dp.rows||[]).flatMap(r=>Object.keys(r.attrs||{})))];
  const hasAttrData=numAttrDefs.length>0||inferredAttrNames.length>0;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,background:C.surface,border:`1px solid ${C.cEvent}33`,borderRadius:6,padding:10}}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" style={{display:"none"}} onChange={onFileChange}/>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        {hasAttrData&&<>
          <span style={labelSt}>Mode:</span>
          <button onClick={()=>toggleRowsMode(false)}
            style={{...inpSt,cursor:"pointer",color:rowsMode?C.muted:C.amber,background:rowsMode?"transparent":C.bg+"99"}}>
            Times list
          </button>
          <button onClick={()=>toggleRowsMode(true)}
            style={{...inpSt,cursor:"pointer",color:rowsMode?C.amber:C.muted,background:rowsMode?C.bg+"99":"transparent"}}>
            Arrival attributes
          </button>
        </>}
        <button onClick={()=>fileRef.current?.click()}
          style={{...inpSt,cursor:"pointer",color:C.cEvent,marginLeft:"auto"}}>
          ↑ Load plan
        </button>
      </div>
      {importNotice&&(
        <div style={{fontSize:10,color:C.green,fontFamily:FONT,background:`${C.green}11`,border:`1px solid ${C.green}44`,borderRadius:4,padding:"5px 8px"}}>
          {importNotice}
        </div>
      )}
      {csvPreview&&(
        <div style={{background:C.bg,border:`1px solid ${C.cEvent}55`,borderRadius:5,padding:"8px 10px",display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontFamily:FONT,fontSize:11,color:C.cEvent,fontWeight:700}}>{csvPreview.fileName}</span>
            <button onClick={()=>setCsvPreview(null)} aria-label="Dismiss CSV preview" style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:13,lineHeight:1}}>✕</button>
          </div>
          <div style={{fontSize:10,color:C.muted,fontFamily:FONT}}>
            {csvPreview.rows.length} arrival{csvPreview.rows.length!==1?"s":""} parsed
            {csvPreview.attrHeaders.length>0&&` · columns: time, ${csvPreview.attrHeaders.join(", ")}`}
            {csvPreview.skipped>0&&<span style={{color:C.amber}}> · {csvPreview.skipped} row{csvPreview.skipped!==1?"s":""} skipped (non-numeric time)</span>}
          </div>
          {csvPreview.error&&(
            <div role="alert" style={{fontSize:11,color:C.red,fontFamily:FONT,background:`${C.red}11`,border:`1px solid ${C.red}44`,borderRadius:4,padding:"5px 8px"}}>
              {csvPreview.error}
              {csvPreview.error.includes('epoch')&&!epoch&&(
                <span> Set a simulation start time in the <strong>Model Data</strong> tab first.</span>
              )}
            </div>
          )}
          {csvPreview.rows.length>0&&(
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",fontFamily:FONT,fontSize:10}}>
                <thead>
                  <tr>
                    <th style={{...thSt,color:C.cEvent}}>time</th>
                    {csvPreview.attrHeaders.map(h=><th key={h} style={{...thSt,color:C.cEvent}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(previewExpanded?csvPreview.rows:csvPreview.rows.slice(0,3)).map((row,i)=>(
                    <tr key={i}>
                      <td style={{...tdSt,color:C.amber,fontFamily:FONT,fontSize:10}}>{row.time}</td>
                      {csvPreview.attrHeaders.map(h=><td key={h} style={{...tdSt,color:C.text,fontFamily:FONT,fontSize:10}}>{row.attrs[h]??""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvPreview.rows.length>3&&(
                <button onClick={()=>setPreviewExpanded(!previewExpanded)}
                  style={{...inpSt,cursor:"pointer",color:C.cEvent,marginTop:2,fontSize:10,alignSelf:"flex-start"}}>
                  {previewExpanded?"▲ Show less":"▼ Show all "+csvPreview.rows.length+" rows"}
                </button>
              )}
            </div>
          )}
          {csvPreview.rows.length>0
            ? <button onClick={confirmCsvImport} style={{...inpSt,cursor:"pointer",color:C.green,alignSelf:"flex-start"}}>✓ Import {csvPreview.rows.length} arrival{csvPreview.rows.length!==1?"s":""}</button>
            : !csvPreview.error&&<div style={{fontSize:11,color:C.amber,fontFamily:FONT}}>No valid rows found — check the file has a numeric time column.</div>
          }
        </div>
      )}
      {!rowsMode&&(
        <div>
          <div style={{...labelSt,marginBottom:4}}>Planned arrival times (absolute, comma-separated):</div>
          <textarea rows={3} value={rawText}
            onChange={e=>setRawText(e.target.value)}
            onBlur={e=>commitText(e.target.value)}
            placeholder="e.g. 0, 30, 60, 90, 120"
            style={{...inpSt,width:"100%",resize:"vertical",boxSizing:"border-box",color:C.amber}}/>
          <div style={{...labelSt,marginTop:2}}>{times.length} planned arrival{times.length!==1?"s":""}</div>
        </div>
      )}
      {rowsMode&&(()=>{
        const attrNames=numAttrDefs.length>0?numAttrDefs.map(a=>a.name):inferredAttrNames;
        // Determine which attributes are numeric (all non-empty values parse as finite numbers)
        const numericAttrs = new Set();
        attrNames.forEach(n => {
          const vals = (dp.rows||[]).map(r => r.attrs?.[n]).filter(v => v !== undefined && v !== '');
          if (vals.length > 0 && vals.every(v => typeof v === 'number' || Number.isFinite(Number(v)))) {
            numericAttrs.add(n);
          }
        });
        return(
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",fontFamily:FONT}}>
            <thead>
              <tr>
                <th scope="col" style={thSt}>#</th>
                <th scope="col" style={thSt}>Time</th>
                {attrNames.map(n=><th key={n} scope="col" style={thSt}>{n}</th>)}
                <th scope="col" style={thSt}/>
              </tr>
            </thead>
            <tbody>
              {(dp.rows||[]).map((row,i)=>(
                <tr key={i}>
                  <td style={{...tdSt,color:C.muted,fontSize:10,fontFamily:FONT}}>{i+1}</td>
                  <td style={tdSt}>
                    <input type="number" value={row.time??""} style={{...inpSt,width:70}}
                      onChange={e=>updateRow(i,"time",e.target.value)}/>
                  </td>
                  {attrNames.map(n=>(
                    <td key={n} style={tdSt}>
                      <input type={numericAttrs.has(n)?"number":"text"} value={row.attrs?.[n]??""} style={{...inpSt,width:70}}
                        onChange={e=>updateRowAttr(i,n,e.target.value)}/>
                    </td>
                  ))}
                  <td style={tdSt}>
                    <button onClick={()=>removeRow(i)} aria-label={`Remove arrival row ${i+1}`} style={{background:"transparent",border:"none",
                      color:C.muted,cursor:"pointer",fontSize:12,padding:"0 4px"}}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addRow} style={{...inpSt,cursor:"pointer",marginTop:4,color:C.green}}>+ Add row</button>
          <div style={{...labelSt,marginTop:4}}>{(dp.rows||[]).length} planned arrival{(dp.rows||[]).length!==1?"s":""}</div>
        </div>
        );
      })()}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <span style={labelSt}>Jitter:</span>
        <select value={jitterDist} style={selSt}
          onChange={e=>updDp({jitterDist:e.target.value,jitterParams:{}})}>
          <option value="">None</option>
          <option value="Normal">Normal (symmetric ±)</option>
          <option value="Uniform">Uniform (min to max)</option>
        </select>
        {jitterDist==="Normal"&&(
          <label style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={labelSt}>stddev:</span>
            <input type="number" value={jitterParams.stddev||""} style={{...inpSt,width:60}}
              onChange={e=>updDp({jitterParams:{...jitterParams,stddev:e.target.value}})}/>
          </label>
        )}
        {jitterDist==="Uniform"&&(<>
          <label style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={labelSt}>min:</span>
            <input type="number" value={jitterParams.min||""} style={{...inpSt,width:60}}
              onChange={e=>updDp({jitterParams:{...jitterParams,min:e.target.value}})}/>
          </label>
          <label style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={labelSt}>max:</span>
            <input type="number" value={jitterParams.max||""} style={{...inpSt,width:60}}
              onChange={e=>updDp({jitterParams:{...jitterParams,max:e.target.value}})}/>
          </label>
        </>)}
      </div>
    </div>
  );
};

const DistPicker=({value,onChange,compact,allowPiecewise=true,attrDefs=[],epoch,timeUnit})=>{
  const fileRef=useRef(null);
  const [csvParse,setCsvParse]=useState(null);
  const [showHelp,setShowHelp]=useState(false);
  const [showPreview,setShowPreview]=useState(false);
  const [blurErrors,setBlurErrors]=useState({}); // { param: errorMsg }

  const v=value||{dist:"Exponential",distParams:{}};
  const isImported=v.dist==="Empirical"&&Array.isArray(v.distParams?.values)&&v.distParams.values.length>0;
  const dd=DISTRIBUTIONS[v.dist||"Fixed"]||DISTRIBUTIONS.Fixed;
  const isPiecewise=v.dist==="Piecewise";
  const isSchedule=v.dist==="Schedule";

  // Derive current family from distribution
  const currentGroup=getDistGroup(v.dist)||DIST_GROUPS[0];
  const [selectedFamily,setSelectedFamily]=useState(currentGroup.id);

  // Keep selectedFamily in sync when distribution changes externally
  const syncedFamily=getDistGroup(v.dist)?.id||selectedFamily;

  const selSt={width:compact?160:200,background:C.bg,border:`1px solid ${C.cEvent}55`,
    borderRadius:4,color:C.cEvent,fontFamily:FONT,fontSize:11,padding:"4px 8px",outline:"none"};

  const handleDistChange=(sel)=>{
    if(sel==="__csv__"){fileRef.current?.click();return;}
    const defaultParams=
      sel==="Piecewise" ? {periods:[{startTime:"0",distribution:{dist:"Exponential",distParams:{mean:"1"}}}]}
      :sel==="Schedule" ? {times:[]}
      :{};
    onChange({...v,dist:sel,distParams:defaultParams});
    setCsvParse(null);
    setBlurErrors({});
  };

  const handleFamilyChange=(fid)=>{
    setSelectedFamily(fid);
    const group=DIST_GROUPS.find(g=>g.id===fid);
    if(!group)return;
    // If current dist not in new family, switch to first of that family
    if(!group.dists.includes(v.dist)){
      const first=group.dists.find(d=>allowPiecewise||d!=="Piecewise")||group.dists[0];
      if(first) handleDistChange(first);
    }
  };

  const handleParamChange=(param,val)=>{
    onChange({...v,distParams:{...(v.distParams||{}),[param]:val}});
  };

  const handleParamBlur=(param)=>{
    const errors=validateDistParams(v.dist,v.distParams||{});
    const err=errors.find(e=>e.param===param);
    setBlurErrors(prev=>({...prev,[param]:err?err.message:null}));
  };

  const handleFileSelect=(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    e.target.value="";
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

  const distHelp=DIST_HELP[v.dist]||null;
  const activeFamilyId=syncedFamily;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleFileSelect}/>

      {/* Family segmented buttons */}
      <div role="group" aria-label="Distribution family" style={{display:"flex",gap:3,flexWrap:"wrap"}}>
        {DIST_GROUPS.map(g=>{
          const active=g.id===activeFamilyId;
          return (
            <button key={g.id} onClick={()=>handleFamilyChange(g.id)}
              aria-pressed={active}
              style={{background:active?C.cEvent+"22":"transparent",
                border:`1px solid ${active?C.cEvent:C.border}`,
                borderRadius:RADIUS.sm,color:active?C.cEvent:C.muted,
                fontFamily:FONT,fontSize:10,padding:"3px 8px",cursor:"pointer",
                fontWeight:active?700:400}}>
              {g.label}
            </button>
          );
        })}
      </div>

      {/* Distribution selector row */}
      <div style={{display:"flex",gap:6,alignItems:"flex-start",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",flex:1}}>
          <select value={v.dist||"Exponential"} onChange={e=>handleDistChange(e.target.value)} style={selSt}>
            {(DIST_GROUPS.find(g=>g.id===activeFamilyId)?.dists||[])
              .filter(d=>allowPiecewise||d!=="Piecewise")
              .filter(d=>DISTRIBUTIONS[d])
              .map(d=><option key={d} value={d}>{DISTRIBUTIONS[d].label}</option>)}
            {activeFamilyId==="fromdata"&&<option value="__csv__">⬆ Import from CSV…</option>}
          </select>

          {/* Param inputs with blur validation */}
          {!isImported&&!isPiecewise&&!isSchedule&&dd.params.map(param=>{
            const helpTxt=distHelp?.params?.[param];
            const errMsg=blurErrors[param];
            return (
              <div key={param} style={{display:"flex",flexDirection:"column",gap:2}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}} title={helpTxt||""}>{param}:</span>
                  <input type="number" value={(v.distParams||{})[param]||""}
                    aria-label={param}
                    aria-describedby={helpTxt?`dp-help-${param}`:undefined}
                    onChange={e=>handleParamChange(param,e.target.value)}
                    onBlur={()=>handleParamBlur(param)}
                    style={{width:60,background:"transparent",
                      border:`1px solid ${errMsg?C.red:C.border}`,
                      borderRadius:RADIUS.sm,color:C.amber,fontFamily:FONT,fontSize:11,
                      padding:"3px 6px",outline:"none"}}/>
                </div>
                {errMsg&&(
                  <span role="alert" style={{fontSize:10,color:C.red,fontFamily:FONT}}>{errMsg}</span>
                )}
              </div>
            );
          })}

          {isImported&&<button onClick={()=>fileRef.current?.click()} style={btnSt(C.cEvent)}>Re-import CSV</button>}
        </div>

        {/* Help toggle */}
        {distHelp&&(
          <button onClick={()=>setShowHelp(v=>!v)} aria-pressed={showHelp}
            aria-label={showHelp?"Hide distribution help":"Show distribution help"}
            style={{background:showHelp?C.accent+"22":"transparent",
              border:`1px solid ${showHelp?C.accent:C.border}`,
              borderRadius:RADIUS.sm,color:showHelp?C.accent:C.muted,
              fontFamily:FONT,fontSize:11,padding:"3px 7px",cursor:"pointer",flexShrink:0}}>
            ?
          </button>
        )}
      </div>

      {/* Inline help card */}
      {showHelp&&distHelp&&(
        <div style={{background:alpha(C.accent,0.05),border:`1px solid ${alpha(C.accent,0.2)}`,
          borderRadius:RADIUS.md,padding:`${SPACE.sm}px ${SPACE.md}px`,display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:11,color:C.text,fontFamily:FONT,lineHeight:1.6}}>{distHelp.summary}</div>
          {dd.params.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {dd.params.map(p=>distHelp.params?.[p]&&(
                <div key={p} style={{fontSize:10,fontFamily:FONT}}>
                  <span style={{color:C.accent,fontWeight:700}}>{p}</span>
                  <span style={{color:C.muted,marginLeft:4}}>{distHelp.params[p]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isPiecewise&&<PiecewiseEditor value={v} onChange={onChange} compact={compact}/>}
      {isSchedule&&<ScheduleEditor value={v} onChange={onChange} attrDefs={attrDefs} epoch={epoch} timeUnit={timeUnit}/>}

      {/* CSV column picker */}
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

      {/* Imported CSV summary */}
      {isImported&&v._csvStats&&(
        <div style={{fontSize:10,color:C.muted,fontFamily:FONT,background:C.surface,borderRadius:4,padding:"4px 10px"}}>
          {v.sourceFile} · col: <span style={{color:C.amber}}>{v.column}</span> ·{" "}
          {v._csvStats.count} values · min {v._csvStats.min} · max {v._csvStats.max} · mean {v._csvStats.mean}
          {v._csvStats.skipped>0&&<span style={{color:C.amber}}> · {v._csvStats.skipped} skipped</span>}
        </div>
      )}

      {/* Preview toggle + sparkline */}
      {!isImported&&!csvParse&&!isPiecewise&&!isSchedule&&(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:C.muted,fontFamily:FONT,fontStyle:"italic",flex:1}}>{dd.hint}</span>
            <button onClick={()=>setShowPreview(v=>!v)} aria-pressed={showPreview}
              aria-label={showPreview?"Hide distribution preview":"Show distribution preview"}
              style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:RADIUS.sm,
                color:C.muted,fontFamily:FONT,fontSize:10,padding:"2px 7px",cursor:"pointer"}}>
              {showPreview?"Hide preview":"Preview ▾"}
            </button>
          </div>
          {showPreview&&(
            <DistSparkline dist={v.dist} distParams={v.distParams||{}}/>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION PANEL — collapsible accordion section with status badge
// ═══════════════════════════════════════════════════════════════════════════════
const isActiveStatus = s => s && s !== "off" && s !== "0" && s !== "none";
const SectionPanel = ({label, status, color=C.muted, children, defaultOpen=false}) => {
  const [open, setOpen] = useState(() => defaultOpen || isActiveStatus(status));
  return (
    <div style={{background:C.surface,borderRadius:RADIUS.md,border:`1px solid ${C.border}`}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:`${SPACE.sm}px ${SPACE.md}px`,background:"transparent",border:"none",cursor:"pointer",borderRadius:RADIUS.md}}>
        <div style={{display:"flex",alignItems:"center",gap:SPACE.sm}}>
          <span style={{...TYPO.label,color,fontFamily:FONT}}>{label}</span>
          {status!=null&&(
            <span style={{...TYPO.caption,fontFamily:FONT,
              color:isActiveStatus(status)?color:C.muted,
              background:alpha(isActiveStatus(status)?color:C.muted,0.09),
              border:`1px solid ${alpha(isActiveStatus(status)?color:C.muted,0.27)}`,
              borderRadius:RADIUS.sm,padding:"1px 6px",whiteSpace:"nowrap"}}>
              {status}
            </span>
          )}
        </div>
        <span style={{fontSize:11,color:C.muted,fontFamily:FONT,marginLeft:SPACE.sm}}>{open?"▾":"▸"}</span>
      </button>
      {open&&(
        <div style={{padding:`0 ${SPACE.md}px ${SPACE.md}px`,display:"flex",flexDirection:"column",gap:SPACE.sm}}>
          {children}
        </div>
      )}
    </div>
  );
};

export { ErrorBoundary, Tag, PhaseTag, Avatar, Btn, Field, CommitInput, SH, InfoBox, Empty, DistPicker, SectionPanel };

