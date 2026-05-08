// App.jsx — Thin shell: auth listener + routing only
// All simulation logic is in engine/
// All UI components are in ui/
// All DB operations are in db/

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase }                         from "./db/supabase.js";
import { fetchModels, fetchProfiles,
         saveModel, deleteModel,
         setVisibility, setAccess, forkModel,
         fetchRunStatsForModels }         from "./db/models.js";
import { saveLocalModel, deleteLocalModel,
         saveLocalRun, fetchLocalRunHistory } from "./db/local.js";
import { C, FONT, GOOGLE_FONT_URL }         from "./ui/shared/tokens.js";
import { Btn, Empty, ErrorBoundary }        from "./ui/shared/components.jsx";
import { ModelCard, ModelDetail,
         NewModelModal }                    from "./ui/ModelDetail.jsx";
import { validateModel }                    from "./engine/validation.js";
import { TEMPLATES }                        from "./engine/templates.js";

const MODEL_JSON_KEYS = ["entityTypes", "stateVariables", "bEvents", "cEvents", "queues"];

function createSampleMm1Model() {
  return {
    name: "Sample M/M/1 Queue",
    description: "Single-server queue with exponential arrivals and service.",
    visibility: "private",
    access: {},
    entityTypes: [
      { id: "et_cust", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      { id: "et_srv", name: "Server", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    bEvents: [
      {
        id: "b_arrive",
        name: "Arrival",
        scheduledTime: "0",
        effect: "ARRIVE(Customer)",
        schedules: [
          {
            eventId: "b_arrive",
            dist: "Exponential",
            distParams: { mean: String(1 / 0.9) },
          },
        ],
      },
      {
        id: "b_complete",
        name: "Complete",
        scheduledTime: "9999",
        effect: "COMPLETE()",
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: "c_seize",
        name: "Seize",
        condition: "queue(Customer).length > 0 AND idle(Server).count > 0",
        effect: "ASSIGN(Customer, Server)",
        cSchedules: [
          {
            eventId: "b_complete",
            dist: "Exponential",
            distParams: { mean: "1" },
            useEntityCtx: true,
          },
        ],
      },
    ],
    queues: [
      {
        id: "q_customer",
        name: "Customer",
        customerType: "Customer",
        capacity: "",
        discipline: "FIFO",
        description: "Default customer waiting line.",
      },
    ],
  };
}

function extractImportedModelPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Import file must contain a DES Studio model JSON object.");
  }

  const source = payload.model_json && typeof payload.model_json === "object"
    ? payload.model_json
    : payload;
  const sourceName = (payload.name || source.name || "Imported model").trim?.() || "Imported model";
  const model = {
    name: `${sourceName} (Imported)`,
    description: payload.description || source.description || "",
    visibility: "private",
    access: {},
  };

  for (const key of MODEL_JSON_KEYS) {
    model[key] = Array.isArray(source[key]) ? source[key] : [];
  }

  return model;
}

export { createSampleMm1Model, extractImportedModelPayload };

const TemplateCard = ({ template, onTry }) => (
  <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:16,display:'flex',flexDirection:'column',gap:8,cursor:'pointer',transition:'border-color .15s'}}
    onClick={() => onTry(template)}
    onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + '66'}
    onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
    role="button" tabIndex={0}
    onKeyDown={e => { if (e.key === 'Enter') onTry(template); }}
    aria-label={`Try ${template.name}`}
  >
    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{template.name}</div>
    <div style={{fontSize:11,color:C.muted,lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{template.description}</div>
    <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
      <span style={{fontSize:9,background:C.accent+'18',color:C.accent,borderRadius:3,padding:'2px 6px',fontWeight:600,letterSpacing:0.5}}>{'▶ Run'}</span>
      {template.entityTypes?.filter(e => e.role === 'server').map(e =>
        <span key={e.id} style={{fontSize:9,background:C.bg,border:`1px solid ${C.border}`,borderRadius:3,padding:'2px 6px',color:C.muted}}>{e.count}× {e.name}</span>
      )}
    </div>
  </div>
);

const FirstRunPanel=({onCreateBlank,onCreateSample,onImport})=>(
  <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:18,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
    <div>
      <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>Start your first model</div>
      <div style={{fontSize:12,color:C.muted}}>Create a blank model, load the M/M/1 sample, or import an existing DES Studio model file.</div>
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <Btn variant="ghost" onClick={onImport}>Import Model</Btn>
      <Btn variant="ghost" onClick={onCreateSample}>Create sample M/M/1 model</Btn>
      <Btn variant="primary" onClick={onCreateBlank}>Create blank model</Btn>
    </div>
  </div>
);

// ── App ───────────────────────────────────────────────────────────────────────
export default function App(){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [profiles,setProfiles]=useState([])
  const [models,setModels]=useState([])
  const [tab,setTab]=useState('my')
  const [openId,setOpenId]=useState(null)
  const [showNew,setShowNew]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [showForkConfirm,setShowForkConfirm]=useState(false)
  const [modelToFork,setModelToFork]=useState(null)
  const [importStatus,setImportStatus]=useState(null)
  const [runStatsError,setRunStatsError]=useState('')
  const [actionError,setActionError]=useState('')
  const importFileRef=useRef(null)
  const [localModel,setLocalModel]=useState(null) // anonymous mode: opened model
  const [isTemplate,setIsTemplate]=useState(false) // template quick-start flag

  const handleTryTemplate = useCallback((template) => {
    const localId = "local_" + Date.now();
    const saved = saveLocalModel({
      id: localId,
      name: template.name,
      description: template.description,
      visibility: "private",
      ...template,
    });
    setLocalModel(saved);
    setOpenId(localId);
    setIsTemplate(true);
  }, []);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSession(session)
      if(!session)setLoading(false)
    })
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      setSession(session)
      if(!session){setLoading(false);setModels([]);setProfile(null)}
    })
    return ()=>subscription.unsubscribe()
  },[])

  const loadData=useCallback(async()=>{
    if(!session)return
    setLoading(true);setError('');setRunStatsError('');setActionError('')
    try{
      const [mods,profs]=await Promise.all([fetchModels(session.user.id),fetchProfiles()])
      const withLoadingStats = mods.map(model => ({ ...model, statsLoading: true }));
      setModels(withLoadingStats);setProfiles(profs)
      setProfile(profs.find(p=>p.id===session.user.id)||null)
      setLoading(false)

      if(!mods.length){
        return
      }

      try{
        const statsByModel=await fetchRunStatsForModels(mods.map(m=>m.id),session.user.id)
        setModels(mods.map(model=>({
          ...model,
          stats:{...(model.stats||{}),runs:statsByModel[model.id]?.runs??0},
          statsLoading:false,
          statsError:false,
        })))
      }catch(e){
        setRunStatsError(e.message)
        setModels(mods.map(model=>({
          ...model,
          stats:{...(model.stats||{}),runs:null},
          statsLoading:false,
          statsError:true,
        })))
      }
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[session])

  useEffect(()=>{loadData()},[loadData])

  const uid=session?.user?.id
  const isAdmin=profile?.isAdmin===true
  const signOut=()=>supabase.auth.signOut()

  const handleOpenModel = useCallback((model) => {
    if (model.owner_id !== uid && model.visibility === 'public') {
      setModelToFork(model);
      setShowForkConfirm(true);
    } else {
      setOpenId(model.id);
    }
  }, [uid]);

  const confirmFork = useCallback(async () => {
    if (!modelToFork || !uid) return;
    setLoading(true);setError('');setShowForkConfirm(false);
    try {
      const newModel = await forkModel(modelToFork.id, uid, `Fork of ${modelToFork.name}`);
      await loadData();
      setOpenId(newModel.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setModelToFork(null);
    }
  }, [modelToFork, uid, loadData]);

  const cancelFork = useCallback(() => {
    setShowForkConfirm(false);
    setModelToFork(null);
  }, []);

  const handleImportFile = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !uid) return;

    setImportStatus({ state: "loading", message: `Importing ${file.name}...` });
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const payload = JSON.parse(loadEvent.target.result);
        const importedModel = extractImportedModelPayload(payload);
        const importedValidation = validateModel(importedModel);

        if (importedValidation.errors.length > 0) {
          setImportStatus({
            state: "error",
            message: "Import blocked by validation errors.",
            items: importedValidation.errors.map(e => `[${e.code}] ${e.message}`),
          });
          return;
        }

        const saved = await saveModel(importedModel, uid);
        await loadData();
        setImportStatus({
          state: importedValidation.warnings.length ? "warning" : "success",
          message: importedValidation.warnings.length
            ? "Imported with validation warnings."
            : "Model imported successfully.",
          items: importedValidation.warnings.map(w => `[${w.code}] ${w.message}`),
        });
        setOpenId(saved.id);
      } catch (e) {
        setImportStatus({
          state: "error",
          message: `Import failed: ${e.message}`,
        });
      }
    };
    reader.onerror = () => {
      setImportStatus({ state: "error", message: "Import failed: could not read the selected file." });
    };
    reader.readAsText(file);
  }, [uid, loadData]);

  const createSampleModel = useCallback(async () => {
    if(!uid)return;
    setLoading(true);setError('');
    try{
      const saved=await saveModel(createSampleMm1Model(),uid);
      await loadData();
      setOpenId(saved.id);
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  },[uid,loadData]);

  const handleDeleteModel = useCallback(async (model) => {
    if(!model||!uid)return;
    if(!window.confirm(`Delete '${model.name}'? This cannot be undone.`))return;
    setActionError('');
    const result=await deleteModel(model.id,uid);
    if(!result.ok){
      setActionError(result.error||"Delete failed.");
      return;
    }
    setModels(current=>current.filter(m=>m.id!==model.id));
  },[uid]);

  if(loading && !session)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted,fontFamily:FONT,fontSize:13}}>
      <style>{`@import url('${GOOGLE_FONT_URL}');`}</style>
      Loading...
    </div>
  )

  if(error && !session)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.red,fontFamily:FONT,fontSize:13,padding:24,textAlign:'center'}}>
      ERROR: {error}
    </div>
  )

  const myModels=models.filter(m=>m.owner_id===uid||m.access?.[uid])
  const pubModels=models.filter(m=>m.visibility==='public'&&m.owner_id!==uid)

  if(openId){
    const model = models.find(m => m.id === openId) || localModel;
    const isOwner = model?.owner_id === uid;
    const canEdit = isOwner || model?.access?.[uid] === 'editor';
    const isLocal = !session && model?.id?.startsWith('local_');
    return(
      <div style={{background:C.bg,minHeight:'100vh'}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <ErrorBoundary
          title="Model view crashed"
          message="This model could not render. Return to the library and reopen it."
          onReset={()=>{setOpenId(null);setLocalModel(null)}}
        >
          <ModelDetail modelId={openId}
            modelData={model}
            initialTab={isTemplate?"execute":undefined}
            onBack={()=>{setOpenId(null);setLocalModel(null);setIsTemplate(false)}}
            onRefresh={loadData}
            overrides={{
              autoRun: isTemplate,
              isOwner: true, canEdit: true, profiles, userId: isLocal ? null : uid, isAdmin,
              onSave: isLocal
                ? async (m) => saveLocalModel(m)
                : async (m) => { const saved = await saveModel(m, uid); await loadData(); return saved; },
              onDelete: isLocal
                ? async (id) => { deleteLocalModel(id); setOpenId(null); setLocalModel(null); }
                : async (id) => { await deleteModel(id, uid); },
              onSetVisibility: setVisibility,
              onSetAccess: setAccess,
              onFork: session ? confirmFork : undefined,
            }}
          />
        </ErrorBoundary>
      </div>
    )
  }

  if(!session){
    return(
      <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:FONT}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}@import url('${GOOGLE_FONT_URL}');`}</style>
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 24px',display:'flex',alignItems:'center',gap:16,height:52}}>
          <div style={{fontWeight:700,fontSize:14,color:C.accent,letterSpacing:2}}>DES STUDIO</div>
          <div style={{fontSize:11,color:C.muted,borderLeft:`1px solid ${C.border}`,paddingLeft:16}}>Three-Phase · Entities · Servers</div>
          <div style={{flex:1}}/>
        </div>
        <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 24px'}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <div style={{fontSize:22,fontWeight:700,color:C.text,marginBottom:8}}>Try DES Studio Instantly</div>
            <div style={{fontSize:13,color:C.muted,maxWidth:600,margin:'0 auto',lineHeight:1.6}}>
              Pick a template to run a simulation immediately — no sign-up needed.
              <span style={{display:'block',marginTop:6}}>Sign in to save models and access the full editor.</span>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
            {TEMPLATES.map(t => <TemplateCard key={t.id} template={t} onTry={handleTryTemplate} />)}
          </div>
        </div>
      </div>
    )
  }

  return(
    <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}@import url('${GOOGLE_FONT_URL}');`}</style>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 24px',display:'flex',alignItems:'center',gap:16,height:52}}>
        <div style={{fontWeight:700,fontSize:14,color:C.accent,letterSpacing:2}}>DES STUDIO</div>
        <div style={{fontSize:11,color:C.muted,borderLeft:`1px solid ${C.border}`,paddingLeft:16}}>Three-Phase · Entities · Servers</div>
        <div style={{flex:1}}/>
        {profile&&(
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:(profile.color||C.accent)+'22',border:`1.5px solid ${profile.color||C.accent}55`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:profile.color||C.accent}}>
              {profile.initials||'?'}
            </div>
            <span style={{fontSize:12,color:C.muted}}>{profile.full_name}</span>
          </div>
        )}
        <button type="button" onClick={signOut} style={{background:'#ffffff08',border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,fontFamily:FONT,fontSize:11,padding:'5px 12px',cursor:'pointer',fontWeight:600}}>Sign Out</button>
      </div>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:700,color:C.text,marginBottom:4}}>Model Library</h1>
            <p style={{fontSize:12,color:C.muted}}>Build and share discrete-event simulation models.</p>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <input
              ref={importFileRef}
              aria-label="Import model file"
              type="file"
              accept=".json,application/json"
              style={{display:"none"}}
              onChange={handleImportFile}
            />
            <Btn variant="ghost" onClick={()=>importFileRef.current?.click()}>Import Model</Btn>
            <Btn variant="primary" onClick={()=>setShowNew(true)}>+ New Model</Btn>
          </div>
        </div>
        {importStatus&&(
          <div style={{
            background: importStatus.state==="error" ? C.red+"18" : importStatus.state==="warning" ? C.amber+"18" : importStatus.state==="success" ? C.green+"18" : C.surface,
            border: `1px solid ${importStatus.state==="error" ? C.red+"44" : importStatus.state==="warning" ? C.amber+"44" : importStatus.state==="success" ? C.green+"44" : C.border}`,
            borderRadius: 6,
            color: importStatus.state==="error" ? C.red : importStatus.state==="warning" ? C.amber : importStatus.state==="success" ? C.green : C.muted,
            fontSize: 12,
            fontFamily: FONT,
            marginBottom: 16,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}>
            <div>{importStatus.message}</div>
            {(importStatus.items||[]).map((item,i)=>(
              <div key={i} style={{color:C.muted}}>{item}</div>
            ))}
          </div>
        )}
        {runStatsError&&(
          <div style={{
            background: C.amber+"18",
            border: `1px solid ${C.amber}44`,
            borderRadius: 6,
            color: C.amber,
            fontSize: 12,
            fontFamily: FONT,
            marginBottom: 16,
            padding: "10px 12px",
          }}>
            Run counts unavailable: {runStatsError}
          </div>
        )}
        {actionError&&(
          <div role="alert" style={{
            background: C.red+"18",
            border: `1px solid ${C.red}44`,
            borderRadius: 6,
            color: C.red,
            fontSize: 12,
            fontFamily: FONT,
            marginBottom: 16,
            padding: "10px 12px",
          }}>
            {actionError}
          </div>
        )}
        <div role="tablist" aria-label="Model library sections" style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:24}}>
          {[{id:'my',label:`My Models (${myModels.length})`},{id:'public',label:`Public Library (${pubModels.length})`}].map(t=>(
            <button key={t.id} type="button" role="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)} style={{background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${C.accent}`:'2px solid transparent',color:tab===t.id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:'10px 18px',cursor:'pointer',fontWeight:tab===t.id?700:400}}>{t.label}</button>
          ))}
        </div>
        <ErrorBoundary
          title="Model library crashed"
          message="The model list could not render."
          onReset={loadData}
        >
          {tab==='my'&&(myModels.length===0
            ?<FirstRunPanel
              onCreateBlank={()=>setShowNew(true)}
              onCreateSample={createSampleModel}
              onImport={()=>importFileRef.current?.click()}
            />
            :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
              {myModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>handleOpenModel(m)} onDelete={handleDeleteModel} currentUserId={uid} profiles={profiles}/>)}
            </div>)}
          {tab==='public'&&(pubModels.length===0
            ?<Empty icon="🌐" msg="No public models available."/>
            :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
              {pubModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>handleOpenModel(m)} onDelete={handleDeleteModel} currentUserId={uid} profiles={profiles}/>)}
            </div>)}
        </ErrorBoundary>
      </div>
      {showNew&&(
        <NewModelModal onClose={()=>setShowNew(false)} onCreate={async(name,desc)=>{
          const m=await saveModel({name,description:desc,entityTypes:[],stateVariables:[],bEvents:[],cEvents:[]},uid)
          await loadData()
          setOpenId(m.id)
        }}/>
      )}
      {showForkConfirm && modelToFork && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#000000aa',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div role="dialog" aria-modal="true" aria-labelledby="fork-public-model-title" style={{background:C.panel,padding:24,borderRadius:10,width:400,maxWidth:'90vw',display:'flex',flexDirection:'column',gap:20}}>
            <h2 id="fork-public-model-title" style={{fontSize:18,fontWeight:700,color:C.text}}>Run Public Model</h2>
            <p style={{fontSize:13,color:C.muted}}>To run "{modelToFork.name}", a private copy will be created in your library. You will own this copy and its run history.</p>
            <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
              <Btn variant="ghost" onClick={cancelFork}>Cancel</Btn>
              <Btn variant="primary" onClick={confirmFork}>Fork & Run</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
