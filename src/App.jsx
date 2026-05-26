// App.jsx — Thin shell: auth listener + routing only
// All simulation logic is in engine/
// All UI components are in ui/
// All DB operations are in db/

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, touchLastActive }         from "./db/supabase.js";
import { fetchModels, fetchProfiles,
         saveModel, deleteModel,
         setVisibility, setAccess, forkModel,
         fetchRunStatsForModels,
         validateDbSchema }               from "./db/models.js";
import { saveLocalModel, deleteLocalModel } from "./db/local.js";
import { C, FONT, GOOGLE_FONT_URL, Z } from "./ui/shared/tokens.js";
import { ErrorBoundary, Btn }              from "./ui/shared/components.jsx";
import { ToastProvider }                    from "./ui/shared/ToastContext.jsx";
import { KeyboardShortcutsModal }           from "./ui/shared/KeyboardShortcutsModal.jsx";
import { HelpAssistant }                    from "./ui/HelpAssistant.jsx";
import { AuthShell }                        from "./ui/AuthShell.jsx";
import { AppNavBar }                        from "./ui/AppNavBar.jsx";
import { ModelLibrary }                     from "./ui/ModelLibrary.jsx";
import { extractImportedModelPayload }      from "./ui/shared/utils.js";
import { ModelDetail }                      from "./ui/ModelDetail.jsx";
import { validateModel }                    from "./engine/validation.js";
import { decodeModelFromUrl, validateLinkModel } from "./utils/importLink.js";
import { ImportPreview }                    from "./ui/ImportPreview.jsx";
import DashboardView                        from "./ui/share/DashboardView.jsx";
import { AdminPanel }                       from "./ui/AdminPanel.jsx";
import { UserSettingsPanel }               from "./ui/UserSettingsPanel.jsx";


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
        effect: ["ARRIVE(Customer)"],
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
        effect: ["COMPLETE()"],
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: "c_seize",
        name: "Seize",
        condition: "queue(Customer).length > 0 AND idle(Server).count > 0",
        effect: ["ASSIGN(Customer, Server)"],
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

export { createSampleMm1Model, extractImportedModelPayload };

// ── App ───────────────────────────────────────────────────────────────────────
export default function App(){
  const lastActiveTouched=useRef(false)
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [profiles,setProfiles]=useState([])
  const [models,setModels]=useState([])
  const [libraryTab,setLibraryTab]=useState('my')
  const [openId,setOpenId]=useState(null)
  const [showAdmin,setShowAdmin]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [showForkConfirm,setShowForkConfirm]=useState(false)
  const [modelToFork,setModelToFork]=useState(null)
  const [openModelOptions,setOpenModelOptions]=useState({ initialTab: undefined, autoRun: false, showStarterGuide: true })
  const [importStatus,setImportStatus]=useState(null)
  const [runStatsError,setRunStatsError]=useState('')
  const [actionError,setActionError]=useState('')
  const [localModel,setLocalModel]=useState(null)
  const [isRecoverySession,setIsRecoverySession]=useState(false)
  const [showSettings,setShowSettings]=useState(false)
  const [shareToken,setShareToken]=useState(null)
  const [showKeyboardShortcuts,setShowKeyboardShortcuts]=useState(false)
  const [pendingImport,setPendingImport]=useState(null)
  const [helpOpen,setHelpOpen]=useState(false)

  // Dev-only: probe des_models schema on mount to catch drift early.
  useEffect(()=>{
    if(process.env.NODE_ENV==='development'){validateDbSchema()}
  },[])

  useEffect(()=>{
    const hash=window.location.hash
    if(hash.startsWith('#import')){
      try{
        const model=decodeModelFromUrl(hash)
        const {errors,warnings}=validateLinkModel(model)
        setPendingImport({model,errors,warnings})
      }catch(_){}
    }
  },[])

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSession(session)
      if(!session)setLoading(false)
    })
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY'){setIsRecoverySession(true)}
      setSession(session)
      if(!session){setLoading(false);setModels([]);setProfile(null);setIsRecoverySession(false)}
      if(session && (event==='SIGNED_IN'||event==='SIGNED_UP')){
        const stored=sessionStorage.getItem('des.pendingImport')
        if(stored){
          try{
            const model=JSON.parse(stored)
            const {errors,warnings}=validateLinkModel(model)
            setPendingImport({model,errors,warnings})
            sessionStorage.removeItem('des.pendingImport')
          }catch(_){}
        }
      }
    })
    return ()=>subscription.unsubscribe()
  },[])

  useEffect(()=>{
    const check=()=>{
      const m=window.location.hash.match(/^#share\/(.+)$/)
      setShareToken(m?m[1]:null)
    }
    check()
    window.addEventListener('hashchange',check)
    return ()=>window.removeEventListener('hashchange',check)
  },[])

  const loadData=useCallback(async()=>{
    if(!session)return
    setLoading(true);setError('');setRunStatsError('');setActionError('')
    // Touch last_active_at once per session load (telemetry — errors swallowed inside touchLastActive)
    if(!lastActiveTouched.current){
      lastActiveTouched.current=true
      touchLastActive(session.user.id)
    }
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

  useEffect(()=>{
    const onKey=e=>{
      if(e.key==='?' && !e.ctrlKey && !e.metaKey && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
        e.preventDefault();
        setHelpOpen(v=>!v);
      }
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[])

  const uid=session?.user?.id
  const isAdmin=profile?.isAdmin===true
  const signOut=()=>supabase.auth.signOut()

  const handleOpenModel = useCallback((model) => {
    setOpenModelOptions({ initialTab: undefined, autoRun: false, showStarterGuide: true });
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
      setOpenModelOptions({ initialTab: undefined, autoRun: false, showStarterGuide: true });
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

  const handleImportFile = useCallback((jsonText, name, desc) => {
    if (!uid) return;

    setImportStatus({ state: "loading", message: `Importing ${name || "model"}...` });
    try {
      const payload = JSON.parse(jsonText);
      const importedModel = extractImportedModelPayload(payload);
      const importedValidation = validateModel(importedModel);

      importedModel.name = name || importedModel.name;
      importedModel.description = desc || importedModel.description;

      saveModel(importedModel, uid)
        .then(async saved => {
          await loadData();
          if (importedValidation.errors.length > 0) {
            setImportStatus({
              state: "warning",
              message: "Imported with validation errors — fix them in the editor before running.",
              items: importedValidation.errors.map(e => `[${e.code}] ${e.message}`),
            });
          } else {
            setImportStatus({
              state: importedValidation.warnings.length ? "warning" : "success",
              message: importedValidation.warnings.length
                ? "Imported with validation warnings."
                : "Model imported successfully.",
              items: importedValidation.warnings.map(w => `[${w.code}] ${w.message}`),
            });
          }
          setOpenModelOptions({ initialTab: undefined, autoRun: false, showStarterGuide: true });
          setOpenId(saved.id);
        })
        .catch(e => {
          setImportStatus({
            state: "error",
            message: `Import failed: ${e.message}`,
          });
        });
    } catch (e) {
      setImportStatus({
        state: "error",
        message: `Import failed: ${e.message}`,
      });
    }
  }, [uid, loadData]);

  const handlePasteJsonImport = useCallback(async (text, name, desc, onSuccess, onError) => {
    if (!uid) return;
    setImportStatus({ state: "loading", message: "Validating JSON..." });
    try {
      const payload = JSON.parse(text);
      const importedModel = extractImportedModelPayload(payload);
      const importedValidation = validateModel(importedModel);
      importedModel.name = name || importedModel.name;
      importedModel.description = desc || importedModel.description;
      const saved = await saveModel(importedModel, uid);
      await loadData();
      if (importedValidation.errors.length > 0) {
        setImportStatus({
          state: "warning",
          message: "Imported with validation errors — fix them in the editor before running.",
          items: importedValidation.errors.map(e => `[${e.code}] ${e.message}`),
        });
      } else {
        setImportStatus({
          state: importedValidation.warnings.length ? "warning" : "success",
          message: importedValidation.warnings.length
            ? "Imported with validation warnings."
            : "Model imported successfully.",
          items: importedValidation.warnings.map(w => `[${w.code}] ${w.message}`),
        });
      }
      onSuccess?.();
      setOpenModelOptions({ initialTab: undefined, autoRun: false, showStarterGuide: true });
      setOpenId(saved.id);
    } catch (e) {
      const errorMsg = e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : `Import failed: ${e.message}`;
      setImportStatus({ state: "error", message: errorMsg });
      onError?.(errorMsg);
    }
  }, [uid, loadData]);

  const handleStartTemplate = useCallback(async (template) => {
    if(!uid)return;
    setLoading(true);setError('');
    try{
      const payload={
        name: template.name,
        description: template.description,
        visibility: "private",
        access: {},
        entityTypes: template.entityTypes || [],
        stateVariables: template.stateVariables || [],
        bEvents: template.bEvents || [],
        cEvents: template.cEvents || [],
        queues: template.queues || [],
        goals: template.goals || [],
        containerTypes: template.containerTypes || [],
      };
      // Preserve optional top-level fields that templates may carry
      if(template.graph!=null)          payload.graph          = template.graph;
      if(template.experimentDefaults)   payload.experimentDefaults = template.experimentDefaults;
      if(template.dataSources?.length)  payload.dataSources    = template.dataSources;
      if(template.timeUnit)             payload.timeUnit       = template.timeUnit;
      if(template.epoch)                payload.epoch          = template.epoch;
      const saved=await saveModel(payload, uid);
      await loadData();
      setOpenModelOptions({ initialTab: "execute", autoRun: true, showStarterGuide: false });
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

  const handleCopyModel = useCallback(async (model) => {
    if(!model||!uid)return;
    setLoading(true);setActionError('');
    try{
      const copy=await forkModel(model.id,uid,`Copy of ${model.name}`);
      await loadData();
      setOpenModelOptions({ initialTab: undefined, autoRun: false, showStarterGuide: true });
      setOpenId(copy.id);
    }catch(e){
      setActionError(e.message);
    }finally{
      setLoading(false);
    }
  },[uid,loadData]);

  const handleSaveAsBaseline = useCallback(async (sourceModelId, newName, parentModelId) => {
    if(!uid)return;
    setLoading(true);setActionError('');
    try{
      const baseline=await forkModel(sourceModelId,uid,newName,{parentModelId});
      await loadData();
      setOpenModelOptions({ initialTab: undefined, autoRun: false, showStarterGuide: true });
      setOpenId(baseline.id);
    }catch(e){
      setActionError(e.message);
    }finally{
      setLoading(false);
    }
  },[uid,loadData]);

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
  const communityModels=models.filter(m=>m.visibility==='public')

  if(shareToken){
    return <DashboardView token={shareToken} onBack={()=>{setShareToken(null);window.location.hash=''}} />
  }

  if(pendingImport){
    return (
      <ImportPreview
        model={pendingImport.model}
        errors={pendingImport.errors}
        warnings={pendingImport.warnings}
        user={session?.user||null}
        onSave={async()=>{
          const saved=await saveModel({
            ...pendingImport.model,
            name:pendingImport.model.name||'Imported Model',
          },uid)
          await loadData()
          setPendingImport(null)
          if(window.location.hash.startsWith('#import'))window.location.hash=''
          setOpenId(saved.id)
        }}
        onDismiss={()=>{
          setPendingImport(null)
          if(window.location.hash.startsWith('#import'))window.location.hash=''
        }}
      />
    )
  }

  if(showAdmin){
    return (
      <div style={{background:C.bg,minHeight:'100vh'}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');`}</style>
        <AppNavBar
          profile={profile} isAdmin={isAdmin} isAdminActive={true}
          onHelpOpen={() => setHelpOpen(true)}
          onSettings={() => { setShowAdmin(false); setShowSettings(true); }}
          onAdmin={() => setShowAdmin(false)}
          onSignOut={signOut}
          userId={uid ?? null} currentPage="admin"
        />
        <AdminPanel userId={uid} isAdmin={true} onClose={()=>setShowAdmin(false)} />
        {helpOpen && <HelpAssistant isOpen={helpOpen} onClose={() => setHelpOpen(false)} currentModel={null} currentTab={null} currentView="admin" validation={null} />}
      </div>
    );
  }

  if(showSettings){
    return (
      <div style={{background:C.bg,minHeight:'100vh'}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');`}</style>
        <AppNavBar
          profile={profile} isAdmin={isAdmin} isAdminActive={false}
          onHelpOpen={() => setHelpOpen(true)}
          onSettings={() => setShowSettings(false)}
          onAdmin={() => { setShowSettings(false); setShowAdmin(true); }}
          onSignOut={signOut}
          userId={uid ?? null} currentPage="settings"
        />
        <UserSettingsPanel userId={uid} plan={profile?.plan} onClose={()=>setShowSettings(false)} />
        {helpOpen && <HelpAssistant isOpen={helpOpen} onClose={() => setHelpOpen(false)} currentModel={null} currentTab={null} currentView="settings" validation={null} />}
      </div>
    );
  }

  if(openId){
    const model = models.find(m => m.id === openId) || localModel;
    const isOwner = model?.owner_id === uid;
    const canEdit = isOwner || model?.access?.[uid] === 'editor';
    const isLocal = !session && model?.id?.startsWith('local_');
    const parentModel = model?.parentModelId ? models.find(m => m.id === model.parentModelId) : null;
    return(
      <div style={{background:C.bg,minHeight:'100vh'}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <AppNavBar
          profile={profile} isAdmin={isAdmin} isAdminActive={false}
          onHelpOpen={() => setHelpOpen(true)}
          onSettings={() => { setOpenId(null); setLocalModel(null); setShowSettings(true); }}
          onAdmin={() => { setOpenId(null); setLocalModel(null); setShowAdmin(true); }}
          onSignOut={signOut}
          userId={uid ?? null} currentPage={`model/${openId}`}
        />
        <ErrorBoundary
          title="Model view crashed"
          message="This model could not render. Return to the library and reopen it."
          onReset={()=>{
            setOpenId(null);
            setLocalModel(null);
            setOpenModelOptions({ initialTab: undefined, autoRun: false, showStarterGuide: true });
          }}
        >
          <ModelDetail modelId={openId}
            modelData={model}
            initialTab={openModelOptions.initialTab}
            onBack={()=>{
              setOpenId(null);
              setLocalModel(null);
              setOpenModelOptions({ initialTab: undefined, autoRun: false, showStarterGuide: true });
            }}
            onRefresh={loadData}
            onLatestVersionChange={(ver) => setModels(prev => prev.map(m => m.id === openId ? { ...m, latestVersion: ver ?? 0 } : m))}
            overrides={{
              autoRun: openModelOptions.autoRun,
              showStarterGuide: openModelOptions.showStarterGuide,
              isOwner: true, canEdit: true, profiles, userId: isLocal ? null : uid, isAdmin, plan: profile?.plan || 'free',
              onHelpOpen: () => setHelpOpen(true),
              onSave: isLocal
                ? async (m) => saveLocalModel(m)
                : async (m) => { const saved = await saveModel(m, uid); await loadData(); return saved; },
              onDelete: isLocal
                ? async (id) => { deleteLocalModel(id); setOpenId(null); setLocalModel(null); }
                : async (id) => { await deleteModel(id, uid); },
              onSetVisibility: (id, vis) => setVisibility(id, vis, uid),
              onSetAccess: (id, acc) => setAccess(id, acc, uid),
              onFork: session ? confirmFork : undefined,
              onSaveAsBaseline: session && isOwner ? handleSaveAsBaseline : undefined,
              parentModelName: parentModel?.name || null,
              onExitToTemplates: () => {
                setOpenId(null);
                setLocalModel(null);
                setOpenModelOptions({ initialTab: undefined, autoRun: false, showStarterGuide: true });
                setLibraryTab('templates');
              },
            }}
          />
        </ErrorBoundary>
        {helpOpen && (
          <HelpAssistant
            isOpen={helpOpen}
            onClose={() => setHelpOpen(false)}
            currentModel={model}
            currentTab={null}
            currentView="model-detail"
            validation={null}
          />
        )}
      </div>
    )
  }

  if(session && isRecoverySession){
    return <AuthShell isRecoverySession onRecoveryComplete={()=>setIsRecoverySession(false)} signOut={signOut}/>;
  }

  if(session && profile?.suspended){
    return(
      <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:FONT}}>
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 24px',display:'flex',alignItems:'center',height:52}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:C.accent,letterSpacing:2,fontFamily:FONT,lineHeight:1.1}}>DES STUDIO</div>
            <div style={{fontSize:9,color:C.muted,letterSpacing:0.5,fontFamily:FONT,lineHeight:1.1}}>a simmodlr.app</div>
          </div>
        </div>
        <div style={{maxWidth:480,margin:'0 auto',padding:'60px 24px',textAlign:'center'}}>
          <div style={{fontSize:18,fontWeight:700,color:C.red,marginBottom:12}}>Account Suspended</div>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.7,marginBottom:24}}>
            Your account has been suspended. Please contact support if you believe this is an error.
          </div>
          <button type="button" onClick={signOut}
            style={{background:'#ffffff08',border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,fontFamily:FONT,fontSize:12,padding:'8px 20px',cursor:'pointer',fontWeight:600}}>
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  if(!session){
    return <AuthShell isRecoverySession={false} signOut={signOut}/>;
  }

  return(
    <ToastProvider>
    <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}@import url('${GOOGLE_FONT_URL}');`}</style>
      <AppNavBar
        profile={profile}
        isAdmin={isAdmin}
        isAdminActive={showAdmin}
        onHelpOpen={() => setHelpOpen(true)}
        onSettings={() => setShowSettings(true)}
        onAdmin={() => { setShowAdmin(true); setOpenId(null); }}
        onSignOut={signOut}
        userId={uid ?? null}
        currentPage={openId ? `model/${openId}` : shareToken ? `share/${shareToken}` : 'library'}
      />
      <ModelLibrary
        myModels={myModels}
        pubModels={pubModels}
        communityModels={communityModels}
        profiles={profiles}
        currentUserId={uid}
        onOpenModel={handleOpenModel}
        onDeleteModel={handleDeleteModel}
        onCopyModel={handleCopyModel}
        onStartTemplate={handleStartTemplate}
        onCreateNewModel={async (name, desc, modelData, options = {}) => {
          const nextOptions = {
            initialTab: options.initialTab,
            autoRun: options.autoRun === true,
            showStarterGuide: options.showStarterGuide !== false,
          };
          if (modelData && typeof modelData === 'object') {
            modelData.name = name || modelData.name;
            modelData.description = desc || modelData.description;
            const saved = await saveModel(modelData, uid);
            await loadData();
            setOpenModelOptions(nextOptions);
            setOpenId(saved.id);
            return saved;
          } else {
            const m = await saveModel({name, description: desc, entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: []}, uid);
            await loadData();
            setOpenModelOptions(nextOptions);
            setOpenId(m.id);
            return m;
          }
        }}
        onImportFile={handleImportFile}
        onPasteJsonImport={handlePasteJsonImport}
        tab={libraryTab}
        onTabChange={setLibraryTab}
      />
      {showForkConfirm && modelToFork && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#000000aa',display:'flex',alignItems:'center',justifyContent:'center',zIndex:Z.modal}}>
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
      {showKeyboardShortcuts && (
        <KeyboardShortcutsModal onClose={()=>setShowKeyboardShortcuts(false)}/>
      )}
      {helpOpen && (
        <HelpAssistant
          isOpen={helpOpen}
          onClose={() => setHelpOpen(false)}
          currentModel={openId ? (models.find(m => m.id === openId) || localModel) : null}
          currentTab={libraryTab}
          currentView={openId ? 'model-detail' : 'library'}
          validation={null}
        />
      )}
    </div>
    </ToastProvider>
  )
}
