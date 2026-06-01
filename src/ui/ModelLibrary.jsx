// ui/ModelLibrary.jsx — Model library: My Models / Templates / Public / Community tabs
import { useState, useRef, useMemo } from "react";
import { C, FONT, SHADOW, RADIUS, Z } from "./shared/tokens.js";
import { Tag, Avatar, Btn, Field, Empty } from "./shared/components.jsx";
import { TEMPLATES } from "../engine/templates.js";
import { validateModel } from "../engine/validation.js";

export const ModelCard=({model,onOpen,onDelete,onCopy,profiles=[],currentUserId,currentVersion})=>{
  const owner=(profiles||[]).find(p=>p.id===model.owner_id)||null;
  const fmtDate=iso=>{ try{ return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }catch(e){return '';} };
  const runCount=model.stats?.runs;
  const isOwner=model.owner_id===currentUserId;
  const validation = useMemo(() => validateModel(model), [model]);
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;
  const healthLabel = hasErrors ? "Validation Errors" : hasWarnings ? "Validation Warnings" : "Ready";
  const healthColor = hasErrors ? C.red : hasWarnings ? C.amber : C.green;
  const openFromKeyboard=e=>{
    if(e.key==="Enter"||e.key===" "){
      e.preventDefault();
      onOpen?.();
    }
  };
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={openFromKeyboard} aria-label={`Open model ${model.name}`} style={{background:C.panel,border:`1px solid ${C.border}`,borderLeft:`3px solid ${model.visibility==="public"?C.green:C.accent}`,borderRadius:8,padding:16,cursor:"pointer",display:"flex",flexDirection:"column",gap:10,textAlign:"left",color:"inherit",width:"100%"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{fontWeight:700,fontSize:14,color:C.text,fontFamily:FONT,lineHeight:1.3}}>
          {model.name}
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap"}}>
          {isOwner&&onCopy&&<Btn small variant="ghost" onClick={e=>{e.stopPropagation();onCopy(model);}}>Copy</Btn>}
          {isOwner&&onDelete&&<Btn small variant="danger" onClick={e=>{e.stopPropagation();onDelete(model);}}>Delete</Btn>}
          <Tag label={model.visibility} color={model.visibility==="public"?C.green:C.accent}/>
          {currentVersion > 0 && <Tag label={`V${currentVersion}`} color={C.purple}/>}
        </div>
      </div>
      <div style={{fontSize:12,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>{model.description}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <Tag label={healthLabel} color={healthColor}/>
        {model.statsLoading&&<Tag label="— runs" color={C.muted}/>}
        {!model.statsLoading&&model.statsError&&<Tag label="runs —" color={C.muted}/>}
        {!model.statsLoading&&!model.statsError&&Number.isFinite(runCount)&&runCount>0&&<Tag label={`${runCount} runs`} color={C.green}/>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {owner&&<Avatar u={owner} size={22}/>}
          <span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>{owner?.full_name}</span>
        </div>
        <span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>{fmtDate(model.updatedAt)}</span>
      </div>
    </div>
  );
};

export const NewModelModal=({onClose,onStartDesign,onUseTemplate,onImportFile,onPasteJson,onUseAi})=>{
  const [name,setName]=useState(""); const [desc,setDesc]=useState("");
  const [saving,setSaving]=useState(false);
  const [mode,setMode]=useState("choose");
  const [pasteText,setPasteText]=useState("");
  const [pasteStatus,setPasteStatus]=useState(null);
  const fileInputRef=useRef(null);
  const startDesign=async()=>{if(!name.trim())return;setSaving(true);try{await onStartDesign?.(name.trim(),desc.trim());}finally{setSaving(false);}onClose();};
  const triggerImport=()=>{if(!name.trim())return;fileInputRef.current?.click();};
  const handleFileSelect=(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      onImportFile?.(reader.result,name.trim(),desc.trim());
      onClose();
    };
    reader.readAsText(file);
  };
  const handlePasteSubmit=()=>{
    if(!pasteText.trim()||!name.trim())return;
    setPasteStatus({state:"loading",message:"Validating JSON..."});
    onPasteJson?.(pasteText,name.trim(),desc.trim(),
      ()=>{onClose();},
      (msg)=>{setPasteStatus({state:"error",message:msg});}
    );
  };
  const useTemplate=()=>{
    onUseTemplate?.(name.trim(),desc.trim());
    onClose();
  };
  const useAi=()=>{onUseAi?.(name.trim(),desc.trim());onClose();};
  const inputStyle={width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:12,padding:"8px 10px",outline:"none",boxSizing:"border-box"};
  const optionBtn={background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16",cursor:"pointer",display:"flex",flexDirection:"column",gap:4,textAlign:"left",color:"inherit",fontFamily:FONT};
  if(mode==="paste"){
    return (
      <div style={{position:"fixed",inset:0,background:C.overlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:Z.modal}}>
        <div role="dialog" aria-modal="true" aria-labelledby="paste-model-title" style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:28,width:520,maxWidth:"95vw",fontFamily:FONT,display:"flex",flexDirection:"column",gap:16}}>
          <div id="paste-model-title" style={{fontSize:16,fontWeight:700,color:C.text}}>Paste Model JSON</div>
          {name && <div style={{fontSize:11,color:C.muted,fontFamily:FONT}}>Model: <strong style={{color:C.text}}>{name}</strong></div>}
          <textarea aria-label="Model JSON" value={pasteText} onChange={e=>setPasteText(e.target.value)} placeholder={'{\n  "name": "My Model",\n  "entityTypes": [...],\n  ...\n}'} spellCheck={false} style={{...inputStyle,height:200,resize:"vertical",fontFamily:"'JetBrains Mono',monospace"}}/>
          {pasteStatus && pasteStatus.state!=="loading" && (
            <div style={{background:pasteStatus.state==="error"?C.red+"18":C.green+"18",border:`1px solid ${pasteStatus.state==="error"?C.red+"44":C.green+"44"}`,borderRadius:5,color:pasteStatus.state==="error"?C.red:C.green,fontSize:12,fontFamily:FONT,padding:"8px 10px"}}>
              {pasteStatus.message}
            </div>
          )}
          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <Btn variant="ghost" onClick={()=>setMode("choose")}>Back</Btn>
            <Btn variant="primary" disabled={!pasteText.trim()||!name.trim()||pasteStatus?.state==="loading"} onClick={handlePasteSubmit}>
              {pasteStatus?.state==="loading"?"Importing…":"Import Model"}
            </Btn>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{position:"fixed",inset:0,background:C.overlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:Z.modal}}>
      <div role="dialog" aria-modal="true" aria-labelledby="new-model-title" style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:28,width:520,maxWidth:"95vw",fontFamily:FONT,display:"flex",flexDirection:"column",gap:18,maxHeight:"90vh",overflowY:"auto"}}>
        <div id="new-model-title" style={{fontSize:16,fontWeight:700,color:C.text}}>New Model</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1,fontWeight:700}}>NAME *</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Queue with Reneging" autoFocus style={inputStyle}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1,fontWeight:700}}>DESCRIPTION</label>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional — helps AI tailor suggestions" rows={2} style={{...inputStyle,resize:"vertical"}}/>
          </div>
        </div>
        <div style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1,fontWeight:700}}>START WITH</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <button type="button" onClick={startDesign} disabled={!name.trim()||saving} style={optionBtn}>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>Draw</div>
            <div style={{fontSize:10,color:C.muted}}>Draw your model</div>
          </button>
          <button type="button" onClick={useTemplate} style={optionBtn}>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>Use a template</div>
            <div style={{fontSize:10,color:C.muted}}>Pick a pre-built scenario</div>
          </button>
          <button type="button" onClick={triggerImport} style={optionBtn}>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>Import a file</div>
            <div style={{fontSize:10,color:C.muted}}>Upload a .json model</div>
          </button>
          <button type="button" onClick={()=>setMode("paste")} style={optionBtn}>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>Paste model</div>
            <div style={{fontSize:10,color:C.muted}}>Paste JSON from clipboard</div>
          </button>
          <button type="button" onClick={useAi} style={{...optionBtn,gridColumn:"1 / -1"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>Describe</div>
            <div style={{fontSize:10,color:C.muted}}>Use AI to describe your model</div>
          </button>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
        <input ref={fileInputRef} type="file" accept=".json,application/json" style={{display:"none"}} onChange={handleFileSelect}/>
      </div>
    </div>
  );
};

const PATTERNS_GUIDE = [
  { id: "p1", title: "Single-Queue Service (M/M/c)", macros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    summary: "A pool of identical servers draws from one shared queue. Covers call centres, tellers, compute hosts.",
    snippet: "ARRIVE(Customer, Queue)\nASSIGN(Queue, Server)\nCOMPLETE()",
    templates: ["mm1", "call-center", "bank-branch", "data-center", "port-berth"] },
  { id: "p2", title: "Multi-Stage Sequential Routing", macros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    summary: "Customers move through two or more stages in sequence.",
    snippet: "ARRIVE(Customer, StageA)\nASSIGN(StageA, ServerA)\nRELEASE(ServerA, StageB)\nASSIGN(StageB, ServerB)\nCOMPLETE()",
    templates: ["er-triage", "outpatient-clinic", "fast-food", "construction", "ward-admission", "airport"] },
  { id: "p3", title: "Batching and Assembly", macros: ["ARRIVE", "BATCH", "ASSIGN", "COMPLETE"],
    summary: "Individual items accumulate until N are present, then merge into one batch entity.",
    snippet: "ARRIVE(Item, Items)\nBATCH(Items, N)\nASSIGN(Items, Worker)\nCOMPLETE()",
    templates: ["factory", "warehouse"] },
  { id: "p4", title: "Reneging and Abandonment", macros: ["ARRIVE", "RENEGE", "ASSIGN", "COMPLETE"],
    summary: "Customers waiting beyond their patience time self-remove.",
    snippet: "ARRIVE(Customer, Queue)\n  ↳ schedule RENEGE timer  isRenege:true\nRENEGE(ctx)\nASSIGN(Queue, Server)\nCOMPLETE()",
    templates: ["call-center"] },
  { id: "p5", title: "Finite Capacity and Balking", macros: ["ARRIVE"],
    summary: "Set a capacity on the queue. ARRIVE silently discards customers when the queue is full.",
    snippet: "Queue: WaitingArea  capacity=20\nARRIVE(Customer, WaitingArea)  ← balks if full",
    templates: ["airport", "ward-admission", "retail-checkout"] },
  { id: "p6", title: "Priority Queue", macros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    summary: "Set discipline=PRIORITY on the queue and add a numeric priority attribute. Lower number = higher urgency.",
    snippet: "EntityType: Customer  attrDefs: [priority dist=Uniform(1,5)]\nQueue: Queue  discipline=PRIORITY\nASSIGN(Queue, Server)",
    templates: ["er-triage", "bank-branch", "priority-ed-balking"] },
  { id: "p7", title: "Server Failures and Repair", macros: ["FAIL", "REPAIR"],
    summary: "Set mtbfDist and mttrDist on a server entity type.",
    snippet: "EntityType: Machine  mtbfDist=Exponential{mean:120}  mttrDist=Exponential{mean:20}",
    templates: ["machine-shop-failures"] },
  { id: "p8", title: "Cost Tracking", macros: ["COST"],
    summary: "Add COST(amount) to any B-event effect. Costs accumulate in totalCost.",
    snippet: 'B-event: Call Handled  effect: ["COMPLETE()", "COST(5)"]\nGoal: totalCost < 500',
    templates: ["cost-call-centre"] },
];

const PatternsGuidePanel = ({ onClose }) => (
  <div role="dialog" aria-modal="true" aria-labelledby="patterns-guide-title" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 480, maxWidth: "95vw", background: C.surface, borderLeft: `1px solid ${C.border}`, zIndex: Z.modal, display: "flex", flexDirection: "column", boxShadow: SHADOW.panel }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <div>
        <div id="patterns-guide-title" style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Modelling Patterns</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>6 reusable patterns for DES Studio models</div>
      </div>
      <button type="button" aria-label="Close patterns guide" onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
    </div>
    <div style={{ overflowY: "auto", flex: 1, padding: "12px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
      {PATTERNS_GUIDE.map((p, i) => (
        <div key={p.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, background: C.accent + "22", borderRadius: 10, padding: "2px 7px", flexShrink: 0 }}>P{i + 1}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{p.title}</div>
          </div>
          <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>{p.summary}</div>
          <pre style={{ fontSize: 9, color: C.green, background: C.bg, borderRadius: 4, padding: "8px 10px", overflowX: "auto", margin: "0 0 8px", lineHeight: 1.6, fontFamily: "'JetBrains Mono',monospace" }}>{p.snippet}</pre>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: C.muted, marginRight: 2 }}>macros:</span>
            {p.macros.map(m => <span key={m} style={{ fontSize: 9, color: C.accent, background: C.accent + "18", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace" }}>{m}</span>)}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
            <span style={{ fontSize: 9, color: C.muted, marginRight: 2 }}>templates:</span>
            {p.templates.map(t => <span key={t} style={{ fontSize: 9, color: C.muted, background: C.border + "66", borderRadius: 3, padding: "1px 5px" }}>{t}</span>)}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const FirstRunPanel = ({ onCreateBlank, onBrowseTemplates }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Start your first model</div>
      <div style={{ fontSize: 12, color: C.muted }}>Create a model from scratch or start from one of the built-in templates.</div>
    </div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <Btn variant="ghost" onClick={onBrowseTemplates}>Use a Template</Btn>
      <Btn variant="primary" onClick={onCreateBlank}>Create a Model</Btn>
    </div>
  </div>
);

export function ModelLibrary({
  myModels, pubModels, communityModels,
  profiles, currentUserId,
  onOpenModel, onDeleteModel, onCopyModel, onStartTemplate,
  onCreateNewModel,
  onImportFile,
  onPasteJsonImport,
  tab, onTabChange,
}) {
  const setTab = onTabChange;
  const [showNew, setShowNew] = useState(false);
  const [tmplSearch, setTmplSearch] = useState("");
  const [tmplDomain, setTmplDomain] = useState("All");
  const [showPatternsGuide, setShowPatternsGuide] = useState(false);
  const pendingTemplateDraftRef = useRef(null);

  const DOMAIN_COLORS = { Academic: "#7c6fcd", Healthcare: "#3b9e78", "Service Systems": "#c0813a", Manufacturing: "#3a82c0", Logistics: "#9e3b7a", Technology: "#3a9ec0", Transport: "#6a8fa0" };
  const allDomains = ["All", ...Array.from(new Set(TEMPLATES.map(t => t.domain)))];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Model Library</h1>
          <p style={{ fontSize: 12, color: C.muted }}>Build and share discrete-event simulation models.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn variant="primary" onClick={() => { pendingTemplateDraftRef.current = null; setShowNew(true); }}>+ New Model</Btn>
        </div>
      </div>

      <div role="tablist" aria-label="Model library sections" style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
        {[
          { id: "my", label: `My Models (${myModels.length})` },
          { id: "templates", label: `Templates (${TEMPLATES.length})` },
          { id: "public", label: `Public Library (${pubModels.length})` },
          { id: "community", label: `Community (${communityModels.length})` },
        ].map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{ background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", color: tab === t.id ? C.accent : C.muted, fontFamily: FONT, fontSize: 12, padding: "10px 18px", cursor: "pointer", fontWeight: tab === t.id ? 700 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "templates" && (() => {
        const q = tmplSearch.trim().toLowerCase();
        const visible = TEMPLATES.filter(t => {
          if (tmplDomain !== "All" && t.domain !== tmplDomain) return false;
          if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q) && !(t.templateMeta?.scenarioType || "").toLowerCase().includes(q)) return false;
          return true;
        });
        return (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input type="search" placeholder="Search templates…" value={tmplSearch} onChange={e => setTmplSearch(e.target.value)} style={{ flex: "1 1 160px", minWidth: 120, padding: "5px 10px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, outline: "none" }} />
              <button type="button" onClick={() => setShowPatternsGuide(true)} style={{ padding: "5px 12px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: FONT, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }} onMouseEnter={e => e.currentTarget.style.color = C.accent} onMouseLeave={e => e.currentTarget.style.color = C.muted}>Patterns Guide</button>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {allDomains.map(d => (
                  <button key={d} type="button" onClick={() => setTmplDomain(d)} style={{ padding: "4px 10px", borderRadius: 12, border: `1px solid ${tmplDomain === d ? (DOMAIN_COLORS[d] || C.accent) : C.border}`, background: tmplDomain === d ? (DOMAIN_COLORS[d] || C.accent) + "22" : "transparent", color: tmplDomain === d ? (DOMAIN_COLORS[d] || C.accent) : C.muted, fontFamily: FONT, fontSize: 11, cursor: "pointer", fontWeight: tmplDomain === d ? 700 : 400 }}>{d}</button>
                ))}
              </div>
            </div>
            {visible.length === 0
              ? <div style={{ color: C.muted, fontSize: 12, padding: "24px 0", textAlign: "center" }}>No templates match your search.</div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
                {visible.map(t => {
                  const dc = DOMAIN_COLORS[t.domain] || C.accent;
                  const startTemplate = () => {
                    const pendingTemplateDraft = pendingTemplateDraftRef.current;
                    const draftedTemplate = pendingTemplateDraft
                      ? {
                          ...t,
                          name: pendingTemplateDraft.name || t.name,
                          description: pendingTemplateDraft.desc || t.description,
                        }
                      : t;
                    onStartTemplate(draftedTemplate);
                    pendingTemplateDraftRef.current = null;
                  };
                  return (
                    <div key={t.id} role="button" tabIndex={0} aria-label={`Try ${t.name}`}
                      onClick={startTemplate} onKeyDown={e => { if (e.key === "Enter") startTemplate(); }}
                      style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = dc + "88"} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{t.name}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: dc, background: dc + "22", borderRadius: 8, padding: "2px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>{t.domain}</div>
                      </div>
                      {t.templateMeta?.scenarioType && <div style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>{t.templateMeta.scenarioType}</div>}
                      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.description}</div>
                      {t.templateMeta?.keyMacros?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {t.templateMeta.keyMacros.map(m => <span key={m} style={{ fontSize: 9, color: C.muted, background: C.border + "66", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace" }}>{m}</span>)}
                        </div>
                      )}
                      <div style={{ fontSize: 9, color: dc, fontWeight: 600, marginTop: "auto" }}>▶ Start from template</div>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        );
      })()}

      {tab === "my" && (myModels.length === 0
        ? <FirstRunPanel onCreateBlank={() => setShowNew(true)} onBrowseTemplates={() => setTab("templates")} />
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
          {myModels.map(m => <ModelCard key={m.id} model={m} onOpen={() => onOpenModel(m)} onDelete={onDeleteModel} onCopy={onCopyModel} currentUserId={currentUserId} profiles={profiles} currentVersion={m.latestVersion} />)}
        </div>)}
      {tab === "public" && (pubModels.length === 0
        ? <Empty icon="🌐" msg="No public models available." />
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
          {pubModels.map(m => <ModelCard key={m.id} model={m} onOpen={() => onOpenModel(m)} onDelete={onDeleteModel} onCopy={onCopyModel} currentUserId={currentUserId} profiles={profiles} currentVersion={m.latestVersion} />)}
        </div>)}
      {tab === "community" && (communityModels.length === 0
        ? <Empty icon="🌐" msg="No community models shared yet." />
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
          {communityModels.map(m => <ModelCard key={m.id} model={m} onOpen={() => onOpenModel(m)} onDelete={onDeleteModel} onCopy={onCopyModel} currentUserId={currentUserId} profiles={profiles} currentVersion={m.latestVersion} />)}
        </div>)}

      {showNew && (
        <NewModelModal
          onClose={() => setShowNew(false)}
          onStartDesign={async (name, desc) => { await onCreateNewModel(name, desc, null, { initialTab: "visual", showStarterGuide: false }); }}
          onUseTemplate={(name, desc) => {
            pendingTemplateDraftRef.current = {
              name: name.trim(),
              desc: desc.trim(),
            };
            setTab("templates");
          }}
          onImportFile={(jsonText, name, desc) => {
            setShowNew(false);
            onImportFile(jsonText, name, desc);
          }}
          onPasteJson={(pasteText, name, desc, onSuccess, onError) => {
            onPasteJsonImport(pasteText, name, desc, onSuccess, onError);
          }}
          onUseAi={(name, desc) => {
            onCreateNewModel(name, desc, null, { initialTab: "ai", showStarterGuide: false }).then(() => {
              setShowNew(false);
            });
          }}
        />
      )}
      {showPatternsGuide && <PatternsGuidePanel onClose={() => setShowPatternsGuide(false)} />}
    </div>
  );
}
