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
import { saveLocalModel, deleteLocalModel } from "./db/local.js";
import { C, FONT, GOOGLE_FONT_URL, SHADOW, RADIUS, Z } from "./ui/shared/tokens.js";
import { Btn, Empty, ErrorBoundary }        from "./ui/shared/components.jsx";
import { extractImportedModelPayload }      from "./ui/shared/utils.js";
import { ModelCard, ModelDetail,
         NewModelModal }                    from "./ui/ModelDetail.jsx";
import { validateModel }                    from "./engine/validation.js";
import { TEMPLATES }                        from "./engine/templates.js";
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

export { createSampleMm1Model, extractImportedModelPayload };

const PATTERNS_GUIDE = [
  { id:'p1', title:'Single-Queue Service (M/M/c)', macros:['ARRIVE','ASSIGN','COMPLETE'],
    summary:'A pool of identical servers draws from one shared queue. Covers call centres, tellers, compute hosts.',
    snippet:'ARRIVE(Customer, Queue)\nASSIGN(Queue, Server)\nCOMPLETE()',
    templates:['mm1','call-center','bank-branch','data-center','port-berth'] },
  { id:'p2', title:'Multi-Stage Sequential Routing', macros:['ARRIVE','ASSIGN','RELEASE','COMPLETE'],
    summary:'Customers move through two or more stages in sequence. RELEASE frees the stage-A server and moves the customer into the stage-B queue.',
    snippet:'ARRIVE(Customer, StageA)\nASSIGN(StageA, ServerA)\nRELEASE(ServerA, StageB)\nASSIGN(StageB, ServerB)\nCOMPLETE()',
    templates:['er-triage','outpatient-clinic','fast-food','construction','ward-admission','airport'] },
  { id:'p3', title:'Batching and Assembly', macros:['ARRIVE','BATCH','ASSIGN','COMPLETE'],
    summary:'Individual items accumulate in a queue until N are present, then merge into one batch entity for processing.',
    snippet:'ARRIVE(Item, Items)\nBATCH(Items, N)          ← C-event priority 1\nASSIGN(Items, Worker)   ← C-event priority 2\nCOMPLETE()',
    templates:['factory','warehouse'] },
  { id:'p4', title:'Reneging and Abandonment', macros:['ARRIVE','RENEGE','ASSIGN','COMPLETE'],
    summary:'Customers waiting beyond their patience time self-remove. Wire the patience timer as a second schedule on the ARRIVE B-event with isRenege:true.',
    snippet:'ARRIVE(Customer, Queue)\n  ↳ reschedule self\n  ↳ schedule RENEGE timer  isRenege:true\nRENEGE(ctx)\nASSIGN(Queue, Server)\nCOMPLETE()',
    templates:['call-center'] },
  { id:'p5', title:'Finite Capacity and Balking', macros:['ARRIVE'],
    summary:'Set a capacity on the queue. ARRIVE silently discards customers that arrive when the queue is full — no extra macros needed.',
    snippet:'Queue: WaitingArea  capacity=20\nARRIVE(Customer, WaitingArea)  ← balks if full',
    templates:['airport','ward-admission','retail-checkout'] },
  { id:'p6', title:'Priority Queue', macros:['ARRIVE','ASSIGN','COMPLETE'],
    summary:'Set discipline=PRIORITY on the queue and add a numeric "priority" attribute to the entity type. Lower number = higher urgency.',
    snippet:'EntityType: Customer  attrDefs: [priority dist=Uniform(1,5)]\nQueue: Queue  discipline=PRIORITY\nASSIGN(Queue, Server)  ← picks lowest priority number first',
    templates:['er-triage','bank-branch','priority-ed-balking'] },
  { id:'p7', title:'Server Failures and Repair', macros:['FAIL','REPAIR'],
    summary:'Set mtbfDist and mttrDist on a server entity type. The engine automatically schedules FAIL and REPAIR events. Effective capacity = count × availability.',
    snippet:'EntityType: Machine  mtbfDist=Exponential{mean:120}  mttrDist=Exponential{mean:20}\n→ availability ≈ 120/(120+20) = 85.7%',
    templates:['machine-shop-failures'] },
  { id:'p8', title:'Cost Tracking', macros:['COST'],
    summary:'Add COST(amount) to any B-event effect. Costs accumulate in totalCost. Set a totalCost goal and use the parametric sweep to find the cheapest feasible configuration.',
    snippet:'B-event: Call Handled  effect: ["COMPLETE()", "COST(5)"]\nGoal: totalCost < 500',
    templates:['cost-call-centre'] },
];

const PatternsGuidePanel=({onClose})=>(
  <div role="dialog" aria-modal="true" aria-labelledby="patterns-guide-title" style={{position:'fixed',top:0,right:0,bottom:0,width:480,maxWidth:'95vw',background:C.surface,borderLeft:`1px solid ${C.border}`,zIndex:Z.modal,display:'flex',flexDirection:'column',boxShadow:SHADOW.panel}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
      <div>
        <div id="patterns-guide-title" style={{fontSize:13,fontWeight:700,color:C.text}}>Modelling Patterns</div>
        <div style={{fontSize:11,color:C.muted,marginTop:2}}>6 reusable patterns for DES Studio models</div>
      </div>
      <button type="button" aria-label="Close patterns guide" onClick={onClose} style={{background:'none',border:'none',color:C.muted,fontSize:18,cursor:'pointer',lineHeight:1}}>✕</button>
    </div>
    <div style={{overflowY:'auto',flex:1,padding:'12px 18px',display:'flex',flexDirection:'column',gap:14}}>
      {PATTERNS_GUIDE.map((p,i)=>(
        <div key={p.id} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,padding:14}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:6}}>
            <div style={{fontSize:10,fontWeight:700,color:C.accent,background:C.accent+'22',borderRadius:10,padding:'2px 7px',flexShrink:0}}>P{i+1}</div>
            <div style={{fontSize:12,fontWeight:700,color:C.text,lineHeight:1.3}}>{p.title}</div>
          </div>
          <div style={{fontSize:10,color:C.muted,lineHeight:1.5,marginBottom:8}}>{p.summary}</div>
          <pre style={{fontSize:9,color:C.green,background:C.bg,borderRadius:4,padding:'8px 10px',overflowX:'auto',margin:'0 0 8px',lineHeight:1.6,fontFamily:"'JetBrains Mono',monospace"}}>{p.snippet}</pre>
          <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:9,color:C.muted,marginRight:2}}>macros:</span>
            {p.macros.map(m=><span key={m} style={{fontSize:9,color:C.accent,background:C.accent+'18',borderRadius:3,padding:'1px 5px',fontFamily:'monospace'}}>{m}</span>)}
          </div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center',marginTop:5}}>
            <span style={{fontSize:9,color:C.muted,marginRight:2}}>templates:</span>
            {p.templates.map(t=><span key={t} style={{fontSize:9,color:C.muted,background:C.border+'66',borderRadius:3,padding:'1px 5px'}}>{t}</span>)}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const FirstRunPanel=({onCreateBlank,onBrowseTemplates})=>(
  <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:18,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
    <div>
      <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>Start your first model</div>
      <div style={{fontSize:12,color:C.muted}}>Create a model from scratch or start from one of the built-in templates.</div>
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <Btn variant="ghost" onClick={onBrowseTemplates}>Use a Template</Btn>
      <Btn variant="primary" onClick={onCreateBlank}>Create a Model</Btn>
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
  const [showAdmin,setShowAdmin]=useState(false)
  const [showNew,setShowNew]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [showForkConfirm,setShowForkConfirm]=useState(false)
  const [modelToFork,setModelToFork]=useState(null)
  const [showStarterGuideForId,setShowStarterGuideForId]=useState(null)
  const [importStatus,setImportStatus]=useState(null)
  const [showPasteJson,setShowPasteJson]=useState(false)
  const [pasteJsonText,setPasteJsonText]=useState('')
  const [runStatsError,setRunStatsError]=useState('')
  const [actionError,setActionError]=useState('')
  const importFileRef=useRef(null)
  const [localModel,setLocalModel]=useState(null) // anonymous mode: opened model
  const [isTemplate,setIsTemplate]=useState(false) // template quick-start flag
  const [showAuth,setShowAuth]=useState(false)
  const [authMode,setAuthMode]=useState('signin')
  const [authEmail,setAuthEmail]=useState('')
  const [authPassword,setAuthPassword]=useState('')
  const [authError,setAuthError]=useState('')
  const [showResetSent,setShowResetSent]=useState(false)
  const [isRecoverySession,setIsRecoverySession]=useState(false)
  const [newPassword,setNewPassword]=useState('')
  const [newPasswordConfirm,setNewPasswordConfirm]=useState('')
  const [showSettings,setShowSettings]=useState(false)
  const [shareToken,setShareToken]=useState(null)
  const [tmplSearch,setTmplSearch]=useState('')
  const [tmplDomain,setTmplDomain]=useState('All')
  const [showPatternsGuide,setShowPatternsGuide]=useState(false)

  const handleAuth=useCallback(async()=>{
    setAuthError('')
    try{
      if(authMode==='signin'){
        const{error}=await supabase.auth.signInWithPassword({email:authEmail,password:authPassword})
        if(error)throw error
      }else{
        const{error}=await supabase.auth.signUp({email:authEmail,password:authPassword})
        if(error)throw error
      }
    }catch(e){setAuthError(e.message)}
  },[authMode,authEmail,authPassword])

  const handleForgotPassword=useCallback(async()=>{
    setAuthError('')
    if(!authEmail){setAuthError('Enter your email address first.');return}
    try{
      const redirectTo=window.location.origin+window.location.pathname
      const{error}=await supabase.auth.resetPasswordForEmail(authEmail,{redirectTo})
      if(error)throw error
      setShowResetSent(true)
    }catch(e){setAuthError(e.message)}
  },[authEmail])

  const handlePasswordReset=useCallback(async()=>{
    setAuthError('')
    if(newPassword.length<8){setAuthError('Password must be at least 8 characters.');return}
    if(newPassword!==newPasswordConfirm){setAuthError('Passwords do not match.');return}
    try{
      const{error}=await supabase.auth.updateUser({password:newPassword})
      if(error)throw error
      setIsRecoverySession(false)
      setNewPassword('');setNewPasswordConfirm('')
    }catch(e){setAuthError(e.message)}
  },[newPassword,newPasswordConfirm])

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSession(session)
      if(!session)setLoading(false)
    })
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY'){setIsRecoverySession(true)}
      setSession(session)
      if(!session){setLoading(false);setModels([]);setProfile(null);setIsRecoverySession(false)}
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
    setShowStarterGuideForId(null);
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

  const handlePasteJsonImport = useCallback(async () => {
    if (!uid) return;
    setImportStatus({ state: "loading", message: "Validating JSON..." });
    try {
      const payload = JSON.parse(pasteJsonText);
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
      setShowPasteJson(false);
      setPasteJsonText('');
      setOpenId(saved.id);
    } catch (e) {
      setImportStatus({
        state: "error",
        message: e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : `Import failed: ${e.message}`,
      });
    }
  }, [uid, pasteJsonText, loadData]);

  const handleStartTemplate = useCallback(async (template) => {
    if(!uid)return;
    setLoading(true);setError('');
    try{
      const saved=await saveModel({
        name: template.name,
        description: template.description,
        visibility: "private",
        access: {},
        entityTypes: template.entityTypes || [],
        stateVariables: template.stateVariables || [],
        bEvents: template.bEvents || [],
        cEvents: template.cEvents || [],
        queues: template.queues || [],
      }, uid);
      await loadData();
      setIsTemplate(true);
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
  const communityModels=models.filter(m=>m.visibility==='public')

  if(shareToken){
    return <DashboardView token={shareToken} onBack={()=>{setShareToken(null);window.location.hash=''}} />
  }

  if(showAdmin){
    return (
      <div style={{background:C.bg,minHeight:'100vh'}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');`}</style>
        <AdminPanel userId={uid} isAdmin={true} onClose={()=>setShowAdmin(false)} />
      </div>
    );
  }

  if(showSettings){
    return (
      <div style={{background:C.bg,minHeight:'100vh'}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');`}</style>
        <UserSettingsPanel userId={uid} onClose={()=>setShowSettings(false)} />
      </div>
    );
  }

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
          onReset={()=>{setOpenId(null);setLocalModel(null);setShowStarterGuideForId(null)}}
        >
          <ModelDetail modelId={openId}
            modelData={model}
            initialTab={isTemplate?"execute":undefined}
            onBack={()=>{setOpenId(null);setLocalModel(null);setIsTemplate(false);setShowStarterGuideForId(null)}}
            onRefresh={loadData}
            overrides={{
              autoRun: isTemplate,
              showStarterGuide: showStarterGuideForId === openId,
              isOwner: true, canEdit: true, profiles, userId: isLocal ? null : uid, isAdmin,
              onSave: isLocal
                ? async (m) => saveLocalModel(m)
                : async (m) => { const saved = await saveModel(m, uid); await loadData(); return saved; },
              onDelete: isLocal
                ? async (id) => { deleteLocalModel(id); setOpenId(null); setLocalModel(null); }
                : async (id) => { await deleteModel(id, uid); },
              onSetVisibility: (id, vis) => setVisibility(id, vis, uid),
              onSetAccess: (id, acc) => setAccess(id, acc, uid),
              onFork: session ? confirmFork : undefined,
              onExitToTemplates: () => {
                setOpenId(null);
                setLocalModel(null);
                setIsTemplate(false);
                setShowStarterGuideForId(null);
                setTab('templates');
              },
            }}
          />
        </ErrorBoundary>
      </div>
    )
  }

  if(session && isRecoverySession){
    return(
      <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:FONT}}>
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 24px',display:'flex',alignItems:'center',height:52}}>
          <div style={{fontWeight:700,fontSize:14,color:C.accent,letterSpacing:2}}>DES STUDIO</div>
        </div>
        <div style={{maxWidth:400,margin:'0 auto',padding:'60px 24px'}}>
          <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:20}}>Set new password</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <input type="password" placeholder="New password (min 8 chars)" value={newPassword}
              onChange={e=>setNewPassword(e.target.value)}
              style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:13,padding:'8px 10px',outline:'none'}}/>
            <input type="password" placeholder="Confirm new password" value={newPasswordConfirm}
              onChange={e=>setNewPasswordConfirm(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')handlePasswordReset()}}
              style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:13,padding:'8px 10px',outline:'none'}}/>
            {authError&&<div style={{fontSize:11,color:C.red}}>{authError}</div>}
            <button type="button" onClick={handlePasswordReset}
              style={{background:C.accent,color:'#fff',border:'none',borderRadius:4,fontFamily:FONT,fontSize:13,padding:'8px 16px',cursor:'pointer',fontWeight:600}}>
              Update Password
            </button>
          </div>
        </div>
      </div>
    )
  }

  if(session && profile?.suspended){
    return(
      <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:FONT}}>
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 24px',display:'flex',alignItems:'center',height:52}}>
          <div style={{fontWeight:700,fontSize:14,color:C.accent,letterSpacing:2}}>DES STUDIO</div>
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
    return(
      <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:FONT}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}@import url('${GOOGLE_FONT_URL}');`}</style>
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 24px',display:'flex',alignItems:'center',gap:16,height:52}}>
          <div style={{fontWeight:700,fontSize:14,color:C.accent,letterSpacing:2}}>DES STUDIO</div>
          <div style={{fontSize:11,color:C.muted,borderLeft:`1px solid ${C.border}`,paddingLeft:16}}>Three-Phase · Entities · Servers</div>
          <div style={{flex:1}}/>
        </div>
        <div style={{maxWidth:400,margin:'0 auto',padding:'60px 24px',textAlign:'center'}}>
          <div style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:12}}>DES Studio</div>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:24}}>
            Discrete-event simulation modelling tool. Sign in to build, run, and share models.
          </div>
          {!showAuth ? (
            <button type="button" onClick={()=>setShowAuth(true)}
              style={{background:C.accent,color:'#fff',border:'none',borderRadius:6,fontFamily:FONT,fontSize:14,padding:'10px 28px',cursor:'pointer',fontWeight:700}}>
              Sign In / Sign Up
            </button>
          ) : (
            <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:20,textAlign:'left'}}>
              <div style={{display:'flex',gap:8,marginBottom:16}}>
                <button type="button" onClick={()=>{setAuthMode('signin');setAuthError('')}}
                  style={{flex:1,background:authMode==='signin'?C.accent+'18':'none',border:authMode==='signin'?`1px solid ${C.accent}44`:`1px solid ${C.border}`,borderRadius:4,color:authMode==='signin'?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:'6px 12px',cursor:'pointer',fontWeight:600}}>Sign In</button>
                <button type="button" onClick={()=>{setAuthMode('signup');setAuthError('')}}
                  style={{flex:1,background:authMode==='signup'?C.accent+'18':'none',border:authMode==='signup'?`1px solid ${C.accent}44`:`1px solid ${C.border}`,borderRadius:4,color:authMode==='signup'?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:'6px 12px',cursor:'pointer',fontWeight:600}}>Sign Up</button>
              </div>
              {showResetSent ? (
                <div style={{fontSize:12,color:C.green,lineHeight:1.6}}>
                  Password reset email sent. Check your inbox and click the link to set a new password.
                </div>
              ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <input type="email" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:13,padding:'8px 10px',outline:'none'}}/>
                <input type="password" placeholder="Password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleAuth()}}
                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:13,padding:'8px 10px',outline:'none'}}/>
                {authError&&<div style={{fontSize:11,color:C.red}}>{authError}</div>}
                <button type="button" onClick={handleAuth}
                  style={{background:C.accent,color:'#fff',border:'none',borderRadius:4,fontFamily:FONT,fontSize:13,padding:'8px 16px',cursor:'pointer',fontWeight:600}}>
                  {authMode==='signin'?'Sign In':'Sign Up'}
                </button>
                {authMode==='signin'&&(
                  <button type="button" onClick={handleForgotPassword}
                    style={{background:'none',border:'none',color:C.muted,fontFamily:FONT,fontSize:11,cursor:'pointer',textAlign:'left',padding:0}}>
                    Forgot password?
                  </button>
                )}
              </div>
              )}
            </div>
          )}
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
        {session && (
          <button type="button" onClick={()=>setShowSettings(true)}
            style={{background:'#ffffff08',border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,fontFamily:FONT,fontSize:11,padding:'5px 12px',cursor:'pointer',fontWeight:600}}>
            Settings
          </button>
        )}
        {session && isAdmin && (
          <button type="button" onClick={()=>{setShowAdmin(true);setOpenId(null)}}
            style={{background:showAdmin?C.accent+'33':'#ffffff08',border:`1px solid ${showAdmin?C.accent:C.border}`,borderRadius:5,color:showAdmin?C.accent:C.muted,fontFamily:FONT,fontSize:11,padding:'5px 12px',cursor:'pointer',fontWeight:600}}>
            Admin
          </button>
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
            <Btn variant="ghost" onClick={()=>importFileRef.current?.click()}>Import File</Btn>
            <Btn variant="ghost" onClick={()=>{ setPasteJsonText(''); setImportStatus(null); setShowPasteJson(true); }}>Paste JSON</Btn>
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
        {error&&(
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
            {error}
          </div>
        )}
        <div role="tablist" aria-label="Model library sections" style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:24}}>
          {[{id:'my',label:`My Models (${myModels.length})`},{id:'templates',label:`Templates (${TEMPLATES.length})`},{id:'public',label:`Public Library (${pubModels.length})`},{id:'community',label:`Community (${communityModels.length})`}].map(t=>(
            <button key={t.id} type="button" role="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)} style={{background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${C.accent}`:'2px solid transparent',color:tab===t.id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:'10px 18px',cursor:'pointer',fontWeight:tab===t.id?700:400}}>{t.label}</button>
          ))}
        </div>
        <ErrorBoundary
          title="Model library crashed"
          message="The model list could not render."
          onReset={loadData}
        >
          {tab==='templates'&&(()=>{
            const DOMAIN_COLORS = {'Academic':'#7c6fcd','Healthcare':'#3b9e78','Service Systems':'#c0813a','Manufacturing':'#3a82c0','Logistics':'#9e3b7a','Technology':'#3a9ec0'};
            const allDomains = ['All',...Array.from(new Set(TEMPLATES.map(t=>t.domain)))];
            const q = tmplSearch.trim().toLowerCase();
            const visible = TEMPLATES.filter(t => {
              if (tmplDomain !== 'All' && t.domain !== tmplDomain) return false;
              if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q) && !(t.templateMeta?.scenarioType||'').toLowerCase().includes(q)) return false;
              return true;
            });
            return (
              <div>
                <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
                  <input
                    type="search" placeholder="Search templates…" value={tmplSearch}
                    onChange={e=>setTmplSearch(e.target.value)}
                    style={{flex:'1 1 160px',minWidth:120,padding:'5px 10px',background:C.panel,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontFamily:FONT,fontSize:12,outline:'none'}}
                  />
                  <button type="button" onClick={()=>setShowPatternsGuide(true)}
                    style={{padding:'5px 12px',borderRadius:4,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,fontFamily:FONT,fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}
                    onMouseEnter={e=>e.currentTarget.style.color=C.accent}
                    onMouseLeave={e=>e.currentTarget.style.color=C.muted}
                  >Patterns Guide</button>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {allDomains.map(d=>(
                      <button key={d} type="button" onClick={()=>setTmplDomain(d)}
                        style={{padding:'4px 10px',borderRadius:12,border:`1px solid ${tmplDomain===d?(DOMAIN_COLORS[d]||C.accent):C.border}`,background:tmplDomain===d?(DOMAIN_COLORS[d]||C.accent)+'22':'transparent',color:tmplDomain===d?(DOMAIN_COLORS[d]||C.accent):C.muted,fontFamily:FONT,fontSize:11,cursor:'pointer',fontWeight:tmplDomain===d?700:400}}
                      >{d}</button>
                    ))}
                  </div>
                </div>
                {visible.length===0
                  ? <div style={{color:C.muted,fontSize:12,padding:'24px 0',textAlign:'center'}}>No templates match your search.</div>
                  : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))',gap:10}}>
                    {visible.map(t => {
                      const dc = DOMAIN_COLORS[t.domain]||C.accent;
                      return (
                        <div key={t.id} role="button" tabIndex={0} aria-label={`Try ${t.name}`}
                          onClick={() => handleStartTemplate(t)}
                          onKeyDown={e => { if (e.key === 'Enter') handleStartTemplate(t); }}
                          style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,padding:12,cursor:'pointer',display:'flex',flexDirection:'column',gap:6}}
                          onMouseEnter={e => e.currentTarget.style.borderColor = dc+'88'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                        >
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:4}}>
                            <div style={{fontSize:12,fontWeight:700,color:C.text,lineHeight:1.3}}>{t.name}</div>
                            <div style={{fontSize:9,fontWeight:700,color:dc,background:dc+'22',borderRadius:8,padding:'2px 6px',whiteSpace:'nowrap',flexShrink:0}}>{t.domain}</div>
                          </div>
                          {t.templateMeta?.scenarioType&&<div style={{fontSize:10,color:C.accent,fontWeight:600}}>{t.templateMeta.scenarioType}</div>}
                          <div style={{fontSize:10,color:C.muted,lineHeight:1.4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{t.description}</div>
                          {t.templateMeta?.keyMacros?.length>0&&(
                            <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                              {t.templateMeta.keyMacros.map(m=>(
                                <span key={m} style={{fontSize:9,color:C.muted,background:C.border+'66',borderRadius:3,padding:'1px 5px',fontFamily:'monospace'}}>{m}</span>
                              ))}
                            </div>
                          )}
                          <div style={{fontSize:9,color:dc,fontWeight:600,marginTop:'auto'}}>▶ Start from template</div>
                        </div>
                      );
                    })}
                  </div>
                }
              </div>
            );
          })()}
          {tab==='my'&&(myModels.length===0
            ?<FirstRunPanel
              onCreateBlank={()=>setShowNew(true)}
              onBrowseTemplates={()=>setTab('templates')}
            />
            :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
              {myModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>handleOpenModel(m)} onDelete={handleDeleteModel} currentUserId={uid} profiles={profiles}/>)}
            </div>)}
          {tab==='public'&&(pubModels.length===0
            ?<Empty icon="🌐" msg="No public models available."/>
            :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
              {pubModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>handleOpenModel(m)} onDelete={handleDeleteModel} currentUserId={uid} profiles={profiles}/>)}
            </div>)}
          {tab==='community'&&(communityModels.length===0
            ?<Empty icon="🌐" msg="No community models shared yet."/>
            :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
              {communityModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>handleOpenModel(m)} onDelete={handleDeleteModel} currentUserId={uid} profiles={profiles}/>)}
            </div>)}
        </ErrorBoundary>
      </div>
      {showNew&&(
        <NewModelModal onClose={()=>setShowNew(false)} onUseTemplate={()=>setTab('templates')} onCreate={async(name,desc)=>{
          const m=await saveModel({name,description:desc,entityTypes:[],stateVariables:[],bEvents:[],cEvents:[],queues:[]},uid)
          await loadData()
          setShowStarterGuideForId(m.id)
          setOpenId(m.id)
        }}/>
      )}
      {showPatternsGuide&&<PatternsGuidePanel onClose={()=>setShowPatternsGuide(false)}/>}
      {showPasteJson && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:C.overlay,display:'flex',alignItems:'center',justifyContent:'center',zIndex:Z.modal}}>
          <div role="dialog" aria-modal="true" aria-labelledby="paste-json-title" style={{background:C.panel,padding:24,borderRadius:10,width:560,maxWidth:'95vw',display:'flex',flexDirection:'column',gap:16}}>
            <h2 id="paste-json-title" style={{fontSize:16,fontWeight:700,color:C.text,margin:0}}>Import Model from JSON</h2>
            <p style={{fontSize:12,color:C.muted,margin:0}}>Paste a DES Studio model JSON object below. The model will be validated before saving.</p>
            <textarea
              aria-label="Model JSON"
              value={pasteJsonText}
              onChange={e=>setPasteJsonText(e.target.value)}
              placeholder={'{\n  "name": "My Model",\n  "entityTypes": [...],\n  ...\n}'}
              spellCheck={false}
              style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:12,height:260,outline:'none',padding:'8px 10px',resize:'vertical',width:'100%',boxSizing:'border-box'}}
            />
            {importStatus && importStatus.state !== 'loading' && (
              <div style={{background:importStatus.state==='error'?C.red+'18':importStatus.state==='warning'?C.amber+'18':C.green+'18',border:`1px solid ${importStatus.state==='error'?C.red+'44':importStatus.state==='warning'?C.amber+'44':C.green+'44'}`,borderRadius:5,color:importStatus.state==='error'?C.red:importStatus.state==='warning'?C.amber:C.green,fontSize:12,fontFamily:FONT,padding:'8px 10px',display:'flex',flexDirection:'column',gap:4}}>
                <div>{importStatus.message}</div>
                {(importStatus.items||[]).map((item,i)=><div key={i} style={{color:C.muted}}>{item}</div>)}
              </div>
            )}
            <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
              <Btn variant="ghost" onClick={()=>{setShowPasteJson(false);setPasteJsonText('');setImportStatus(null);}}>Cancel</Btn>
              <Btn variant="primary" disabled={!pasteJsonText.trim()} onClick={handlePasteJsonImport}>
                {importStatus?.state==='loading'?'Importing…':'Import Model'}
              </Btn>
            </div>
          </div>
        </div>
      )}
      {showForkConfirm && modelToFork && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:C.overlay,display:'flex',alignItems:'center',justifyContent:'center',zIndex:Z.modal}}>
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
