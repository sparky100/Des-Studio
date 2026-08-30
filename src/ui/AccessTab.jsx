// Access tab (owner-only), extracted verbatim from ModelDetail.jsx (expert
// review C-11 tranche): Sharing/visibility + copy-link, Export, Collaborators,
// and the Business-view exposedParams curation. Owns its three pieces of local
// UI state (collabQuery, pendingRoles, exposedPickerOpen); everything that
// writes the model or persists goes back up through semantic callbacks —
// onChangeVisibility (optimistic set + persist + toasts, in the parent),
// onPersistAccess (ModelDetail's optimistic/revert/refresh persistAccess),
// setField (Business-view curation joins the normal dirty/Save flow), and the
// two export actions.
import { useState } from "react";
import { Avatar, Btn } from "./shared/components.jsx";
import { ParamBrowserPanel } from "./shared/ParamBrowserPanel.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";
import { useToast } from "./shared/ToastContext.jsx";
import { resolveExposedParams } from "../engine/exposed-params.js";
import { enumerateSweepableParams } from "../engine/sweep-params.js";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

export function AccessTab({
  model, modelId, profiles, userId,
  onChangeVisibility, onPersistAccess,
  onExportJson, onExportSimPy,
  setField, dirty,
}) {
  const { C, FONT } = useTheme();
  const toast = useToast();
  const [collabQuery, setCollabQuery] = useState("");
  const [pendingRoles, setPendingRoles] = useState({});
  const [exposedPickerOpen, setExposedPickerOpen] = useState(false);

  return (
          <div style={{maxWidth:700,margin:"0 auto",display:"flex",flexDirection:"column",gap:18}}>
            <section aria-label="Sharing settings" style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS,borderBottom:`1px solid ${C.border}`,paddingBottom:4}}>Sharing</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Btn variant={model.visibility==="private"?"primary":"ghost"} onClick={()=>onChangeVisibility("private")} small>🔒 Private</Btn>
                <Btn variant={model.visibility==="public"?"success":"ghost"} onClick={()=>onChangeVisibility("public")} small>🌐 Public</Btn>
                <Btn variant="ghost" small onClick={()=>{
                  const url=`${window.location.origin}${window.location.pathname}#model/${modelId}`;
                  const onCopied=()=>toast.success("Link copied — share it with anyone who has access");
                  const onCopyFailed=()=>toast.error("Could not copy link");
                  if(navigator.clipboard?.writeText){
                    navigator.clipboard.writeText(url).then(onCopied).catch(onCopyFailed);
                  }else{
                    // Clipboard API unavailable (e.g. non-HTTPS context) — fall back to a
                    // legacy textarea-select-and-copy so the action still gives feedback.
                    try{
                      const ta=document.createElement("textarea");
                      ta.value=url;
                      ta.style.position="fixed";
                      ta.style.opacity="0";
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand("copy");
                      document.body.removeChild(ta);
                      onCopied();
                    }catch{
                      onCopyFailed();
                    }
                  }
                }}>🔗 Copy link</Btn>
              </div>
              {model.visibility==="private"&&!Object.values(model.access||{}).some(r=>r==="viewer"||r==="editor")&&(
                <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>
                  This model is private with no one else granted access — a link won't open it for anyone else yet. Make it public or add a collaborator below.
                </div>
              )}
            </section>
            <section aria-label="Export model" style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS,borderBottom:`1px solid ${C.border}`,paddingBottom:4}}>Export</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
                <div>
                  <div style={{fontSize:12,color:C.text,fontFamily:FONT,fontWeight:700,marginBottom:4}}>Model JSON</div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>Download a portable copy of this model definition.</div>
                </div>
                <Btn small variant="ghost" onClick={onExportJson}>Export Model</Btn>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
                <div>
                  <div style={{fontSize:12,color:C.text,fontFamily:FONT,fontWeight:700,marginBottom:4}}>SimPy Python</div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>Download a portable starting-point Python script (caveats apply — see export dialog).</div>
                </div>
                <Btn small variant="ghost" onClick={onExportSimPy}>Export SimPy</Btn>
              </div>
            </section>
            <section aria-label="Collaborator access" style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <div>
                  <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS}}>Collaborators</div>
                  <div style={{fontSize:12,color:C.muted,fontFamily:SANS,marginTop:2}}>Manage who can view or edit this model</div>
                </div>
              </div>

              {/* People who already have access */}
              {(()=>{
                const withAccess=(profiles||[]).filter(u=>u.id!==model.owner_id&&(model.access?.[u.id]==="viewer"||model.access?.[u.id]==="editor"));
                if(withAccess.length===0) return (
                  <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px 14px",fontSize:12,color:C.muted,fontFamily:SANS,textAlign:"center"}}>
                    No one else has access yet
                  </div>
                );
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:0}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.muted,fontFamily:SANS,letterSpacing:1.2,marginBottom:6}}>WITH ACCESS</div>
                    {withAccess.map(u=>(
                      <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                        <Avatar u={u} size={28}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:SANS}}>{u.full_name||"Unknown"}</div>
                          {u.initials&&<div style={{fontSize:11,color:C.muted,fontFamily:SANS}}>{u.initials}</div>}
                        </div>
                        <select value={model.access?.[u.id]||"viewer"}
                          onChange={e=>{const prev=model.access||{};const a={...prev,[u.id]:e.target.value};onPersistAccess(a,prev);}}
                          style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px"}}>
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <Btn small variant="ghost" onClick={()=>{const prev=model.access||{};const a={...prev};delete a[u.id];onPersistAccess(a,prev);}}>Remove</Btn>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Search to add people */}
              {(()=>{
                const noAccess=(profiles||[]).filter(u=>u.id!==model.owner_id&&u.id!==userId&&model.access?.[u.id]!=="viewer"&&model.access?.[u.id]!=="editor");
                const q=collabQuery.trim().toLowerCase();
                const filtered=q.length<2?[]:noAccess.filter(u=>(u.full_name||"").toLowerCase().includes(q)||(u.initials||"").toLowerCase().includes(q));
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.muted,fontFamily:SANS,letterSpacing:1.2}}>ADD PEOPLE</div>
                    <input
                      type="search"
                      placeholder="Search by name…"
                      value={collabQuery}
                      onChange={e=>setCollabQuery(e.target.value)}
                      style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:13,background:C.surface||C.bg,color:C.text,fontFamily:FONT,boxSizing:"border-box"}}
                    />
                    {q.length>=2&&filtered.length===0&&(
                      <div style={{fontSize:12,color:C.muted,fontFamily:SANS,padding:"4px 0"}}>No users found matching "{collabQuery.trim()}"</div>
                    )}
                    {filtered.map(u=>(
                      <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:6}}>
                        <Avatar u={u} size={28}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:SANS}}>{u.full_name||"Unknown"}</div>
                        </div>
                        <select
                          value={pendingRoles[u.id]||"viewer"}
                          onChange={e=>setPendingRoles(prev=>({...prev,[u.id]:e.target.value}))}
                          style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:11,padding:"4px 8px"}}>
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <Btn small variant="primary" onClick={()=>{
                          const role=pendingRoles[u.id]||"viewer";
                          const prev=model.access||{};
                          const a={...prev,[u.id]:role};
                          setCollabQuery("");
                          onPersistAccess(a,prev);
                        }}>Add</Btn>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>
            <section aria-label="Business view settings" style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS,borderBottom:`1px solid ${C.border}`,paddingBottom:4}}>Business view</div>
              <div style={{fontSize:11,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>
                People you add above as viewers see a simplified page instead of the editor: the model description, the settings you choose here, a Run button, and results. Leave this list empty to let them run the model exactly as-is.
              </div>
              {(()=>{
                const exposed=model.exposedParams||[];
                const {resolved,orphans}=resolveExposedParams(model);
                const resolvedByPath=new Map(resolved.map(r=>[r.path,r]));
                const exposedPaths=new Set(exposed.map(e=>e.path));
                const allParams=enumerateSweepableParams(model);
                const updateEntry=(path,patch)=>setField("exposedParams",exposed.map(e=>e.path===path?{...e,...patch}:e));
                const removeEntry=(path)=>setField("exposedParams",exposed.filter(e=>e.path!==path));
                const numOrUndef=(v)=>v===""?undefined:Number(v);
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {exposed.map(entry=>{
                      const live=resolvedByPath.get(entry.path);
                      if(!live){
                        return (
                          <div key={entry.path} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,background:`${C.red}0f`,border:`1px solid ${C.red}44`,borderRadius:8,padding:"8px 12px"}}>
                            <div style={{fontSize:12,color:C.red,fontFamily:FONT}}>
                              {entry.businessLabel||entry.path} — this setting no longer exists in the model
                            </div>
                            <Btn small variant="danger" ariaLabel={`Remove missing setting ${entry.businessLabel||entry.path}`} onClick={()=>removeEntry(entry.path)}>✕</Btn>
                          </div>
                        );
                      }
                      return (
                        <div key={entry.path} style={{display:"flex",flexDirection:"column",gap:6,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px"}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                            <div style={{fontSize:11,color:C.muted,fontFamily:FONT}}>
                              {live.label}{live.subLabel?` (${live.subLabel})`:""} — currently {live.currentValue===Infinity?"unlimited":live.currentValue}
                            </div>
                            <Btn small variant="danger" ariaLabel={`Stop exposing ${live.label}`} onClick={()=>removeEntry(entry.path)}>✕</Btn>
                          </div>
                          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                            <input
                              value={entry.businessLabel||""}
                              onChange={e=>updateEntry(entry.path,{businessLabel:e.target.value||undefined})}
                              placeholder={live.label}
                              aria-label={`Business-friendly name for ${live.label}`}
                              style={{flex:1,minWidth:160,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:SANS,fontSize:12,padding:"6px 8px"}}
                            />
                            <label style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Min</label>
                            <input type="number" value={entry.min??""} onChange={e=>updateEntry(entry.path,{min:numOrUndef(e.target.value)})}
                              aria-label={`Minimum for ${live.label}`}
                              style={{width:70,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,padding:"6px 8px"}}/>
                            <label style={{fontSize:10,color:C.muted,fontFamily:FONT}}>Max</label>
                            <input type="number" value={entry.max??""} onChange={e=>updateEntry(entry.path,{max:numOrUndef(e.target.value)})}
                              aria-label={`Maximum for ${live.label}`}
                              style={{width:70,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,padding:"6px 8px"}}/>
                          </div>
                        </div>
                      );
                    })}
                    {orphans.length===0&&exposed.length===0&&(
                      <div style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:"italic"}}>No adjustable settings yet.</div>
                    )}
                    {!exposedPickerOpen&&(
                      <div>
                        <Btn small variant="ghost" ariaLabel="Add an adjustable setting" onClick={()=>setExposedPickerOpen(true)}>+ Add adjustable setting</Btn>
                      </div>
                    )}
                    {exposedPickerOpen&&(
                      <ParamBrowserPanel
                        params={allParams}
                        alreadyAdded={exposedPaths}
                        onSelect={path=>{
                          setField("exposedParams",[...exposed,{path}]);
                          setExposedPickerOpen(false);
                        }}
                        onClose={()=>setExposedPickerOpen(false)}
                      />
                    )}
                    {resolved.some(r=>(r.type==="queueCapacity"||r.type==="containerCapacity")&&r.min==null)&&(
                      <div style={{fontSize:10,color:C.muted,fontFamily:FONT,lineHeight:1.5}}>
                        Tip: for queue-size or container-capacity settings, viewers' entries are kept at 1 or above (0 would mean unlimited).
                      </div>
                    )}
                    {dirty&&exposed.length>0&&(
                      <div style={{fontSize:10,color:C.amber,fontFamily:FONT}}>Changes here are saved with the model — use Save when you're done.</div>
                    )}
                  </div>
                );
              })()}
            </section>
          </div>
  );
}
