// App.jsx — Thin shell: auth listener + routing only
// All simulation logic is in engine/
// All UI components are in ui/
// All DB operations are in db/

import { useState, useEffect, useCallback } from "react";
import { supabase }                         from "./db/supabase.js";
import { fetchModels, fetchProfiles,
         saveModel, deleteModel,
         setVisibility, setAccess }         from "./db/models.js";
import { C, FONT, GOOGLE_FONT_URL }         from "./ui/shared/tokens.js";
import { Btn, Empty }                       from "./ui/shared/components.jsx";
import { ModelCard, ModelDetail,
         NewModelModal }                    from "./ui/ModelDetail.jsx";

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen(){
  const [mode,setMode]=useState('login')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [name,setName]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [info,setInfo]=useState('')
  const submit=async()=>{
    setError('');setInfo('');setLoading(true)
    try{
      if(mode==='login'){
        const {error}=await supabase.auth.signInWithPassword({email,password})
        if(error)throw error
      }else{
        const {error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name}}})
        if(error)throw error
        setInfo('Account created! Sign in directly.')
        setMode('login')
      }
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  }
  const inp={background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontFamily:FONT,fontSize:13,padding:'10px 12px',outline:'none',width:'100%',boxSizing:'border-box'}
  return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');`}</style>
      <div style={{width:380,display:'flex',flexDirection:'column',gap:20}}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:28,fontWeight:700,color:C.accent,letterSpacing:3}}>DES STUDIO</div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>Three-Phase Discrete-Event Simulation</div>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:24,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
            {['login','signup'].map(m=>(
              <button key={m} onClick={()=>setMode(m)} style={{flex:1,background:'none',border:'none',borderBottom:mode===m?`2px solid ${C.accent}`:'2px solid transparent',color:mode===m?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:'8px 0',cursor:'pointer',fontWeight:mode===m?700:400,textTransform:'uppercase',letterSpacing:1}}>
                {m==='login'?'Sign In':'Sign Up'}
              </button>
            ))}
          </div>
          {mode==='signup'&&<div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:'uppercase'}}>Full Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" style={inp}/></div>}
          <div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:'uppercase'}}>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email" style={inp}/></div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}><label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:'uppercase'}}>Password</label><input value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" type="password" style={inp}/></div>
          {error&&<div style={{background:C.red+'18',border:`1px solid ${C.red}44`,borderRadius:5,padding:'8px 12px',fontSize:12,color:C.red}}>{error}</div>}
          {info&&<div style={{background:C.green+'18',border:`1px solid ${C.green}44`,borderRadius:5,padding:'8px 12px',fontSize:12,color:C.green}}>{info}</div>}
          <button onClick={submit} disabled={loading} style={{background:C.accent,color:'#080c10',border:'none',borderRadius:6,padding:'11px 0',fontFamily:FONT,fontSize:13,fontWeight:700,cursor:loading?'not-allowed':'pointer',opacity:loading?0.6:1,width:'100%'}}>
            {loading?'Please wait...':mode==='login'?'Sign In':'Create Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
    setLoading(true);setError('')
    try{
      const [mods,profs]=await Promise.all([fetchModels(),fetchProfiles()])
      setModels(mods);setProfiles(profs)
      setProfile(profs.find(p=>p.id===session.user.id)||null)
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[session])

  useEffect(()=>{loadData()},[loadData])

  const uid=session?.user?.id
  const signOut=()=>supabase.auth.signOut()

  if(!session)return <AuthScreen/>

  if(loading)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted,fontFamily:FONT,fontSize:13}}>
      <style>{`@import url('${GOOGLE_FONT_URL}');`}</style>
      Loading...
    </div>
  )

  if(error)return(
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.red,fontFamily:FONT,fontSize:13,padding:24,textAlign:'center'}}>
      ERROR: {error}
    </div>
  )

  const myModels=models.filter(m=>m.owner_id===uid||m.access?.[uid])
  const pubModels=models.filter(m=>m.visibility==='public'&&m.owner_id!==uid)

  if(openId){
    const model=models.find(m=>m.id===openId)
    const isOwner=model?.owner_id===uid
    const canEdit=isOwner||model?.access?.[uid]==='editor'
    return(
      <div style={{background:C.bg,minHeight:'100vh'}}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <ModelDetail modelId={openId}
          modelData={models.find(m=>m.id===openId)||null}
          onBack={()=>{setOpenId(null);loadData()}}
          onRefresh={loadData}
          overrides={{
            isOwner,canEdit,profiles,userId:uid,
            onSave:async(m)=>{await saveModel(m,uid);await loadData()},
            onDelete:async(id)=>{await deleteModel(id)},
            onSetVisibility:setVisibility,
            onSetAccess:setAccess,
          }}
        />
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
        <button onClick={signOut} style={{background:'#ffffff08',border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,fontFamily:FONT,fontSize:11,padding:'5px 12px',cursor:'pointer',fontWeight:600}}>Sign Out</button>
      </div>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:700,color:C.text,marginBottom:4}}>Model Library</h1>
            <p style={{fontSize:12,color:C.muted}}>Build and share discrete-event simulation models.</p>
          </div>
          <Btn variant="primary" onClick={()=>setShowNew(true)}>+ New Model</Btn>
        </div>
        <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:24}}>
          {[{id:'my',label:`My Models (${myModels.length})`},{id:'public',label:`Public Library (${pubModels.length})`}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${C.accent}`:'2px solid transparent',color:tab===t.id?C.accent:C.muted,fontFamily:FONT,fontSize:12,padding:'10px 18px',cursor:'pointer',fontWeight:tab===t.id?700:400}}>{t.label}</button>
          ))}
        </div>
        {tab==='my'&&(myModels.length===0
          ?<Empty icon="📐" msg="No models yet. Create your first DES model."/>
          :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
            {myModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>setOpenId(m.id)} profiles={profiles}/>)}
          </div>)}
        {tab==='public'&&(pubModels.length===0
          ?<Empty icon="🌐" msg="No public models available."/>
          :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
            {pubModels.map(m=><ModelCard key={m.id} model={m} onOpen={()=>setOpenId(m.id)} profiles={profiles}/>)}
          </div>)}
      </div>
      {showNew&&(
        <NewModelModal onClose={()=>setShowNew(false)} onCreate={async(name,desc)=>{
          const m=await saveModel({name,description:desc,entityTypes:[],stateVariables:[],bEvents:[],cEvents:[]},uid)
          await loadData()
          setOpenId(m.id)
        }}/>
      )}
    </div>
  )
}
