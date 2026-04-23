import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://znkknldzdfajcrpabtmg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpua2tubGR6ZGZhamNycGFidG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTIyMzMsImV4cCI6MjA4OTMyODIzM30.2puQY_UNe3bOBT88Uyo2rtFU3AIUp3wgCNxcAVtw2ng'
)

const C = {
  bg:'#080c10', surface:'#0d1117', panel:'#111820', border:'#1e2d3d',
  accent:'#06b6d4', text:'#cdd9e5', muted:'#5c7a99',
  green:'#3fb950', amber:'#f0883e', red:'#f85149',
}
const FONT = "'JetBrains Mono',monospace"

const norm = (r) => ({
  id:r.id, name:r.name, description:r.description||'',
  visibility:r.visibility, access:r.access||{},
  entityTypes:r.entity_types||[], stateVariables:r.state_variables||[],
  bEvents:r.b_events||[], cEvents:r.c_events||[],
  owner_id:r.owner_id, owner:r.owner_id,
  createdAt:r.created_at, updatedAt:r.updated_at,
})

async function dbModels() {
  const { data, error } = await sb.from('des_models').select('*').order('updated_at', { ascending:false })
  if (error) throw error
  return (data||[]).map(norm)
}
async function dbProfiles() {
  const { data, error } = await sb.from('profiles').select('id,full_name,initials,color,role')
  if (error) throw error
  return data||[]
}
async function dbSave(model, uid) {
  const row = {
    name:model.name, description:model.description||'',
    visibility:model.visibility||'private', access:model.access||{},
    entity_types:model.entityTypes||[], state_variables:model.stateVariables||[],
    b_events:model.bEvents||[], c_events:model.cEvents||[], owner_id:uid,
  }
  if (model.id) {
    const { data, error } = await sb.from('des_models').update(row).eq('id',model.id).select().single()
    if (error) throw error
    return norm(data)
  } else {
    const { data, error } = await sb.from('des_models').insert(row).select().single()
    if (error) throw error
    return norm(data)
  }
}

function AuthScreen({ onSession }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const signIn = async () => {
    setError(''); setLoading(true)
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const inp = { background:C.bg, border:`1px solid ${C.border}`, borderRadius:5,
    color:C.text, fontFamily:FONT, fontSize:13, padding:'10px 12px',
    outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div style={{ background:C.bg, minHeight:'100vh', display:'flex',
      alignItems:'center', justifyContent:'center', fontFamily:FONT }}>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; }`}</style>
      <div style={{ width:340, display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ textAlign:'center', fontSize:24, fontWeight:700, color:C.accent, letterSpacing:3 }}>
          DES STUDIO
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10,
          background:C.panel, border:`1px solid ${C.border}`, borderRadius:10, padding:20 }}>
          <input style={inp} placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input style={inp} placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          {error && <div style={{ color:C.red, fontSize:12 }}>{error}</div>}
          <button onClick={signIn} disabled={loading} style={{ background:C.accent, color:'#080c10',
            border:'none', borderRadius:6, padding:'10px', fontFamily:FONT,
            fontSize:13, fontWeight:700, cursor:'pointer' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [session,  setSession]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [models,   setModels]   = useState([])
  const [profiles, setProfiles] = useState([])
  const [profile,  setProfile]  = useState(null)
  const [error,    setError]    = useState('')

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (!session) setLoading(false)
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      setSession(session)
      if (!session) { setLoading(false); setModels([]); setProfile(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadData = useCallback(async () => {
    if (!session) return
    setLoading(true); setError('')
    try {
      const [mods, profs] = await Promise.all([dbModels(), dbProfiles()])
      setModels(mods)
      setProfiles(profs)
      setProfile(profs.find(p => p.id === session.user.id) || null)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [session])

  useEffect(() => { loadData() }, [loadData])

  if (!session) return <AuthScreen />
  if (loading)  return (
    <div style={{ background:C.bg, minHeight:'100vh', display:'flex',
      alignItems:'center', justifyContent:'center', color:C.muted, fontFamily:FONT }}>
      Loading...
    </div>
  )
  if (error) return (
    <div style={{ background:C.bg, minHeight:'100vh', display:'flex',
      alignItems:'center', justifyContent:'center', color:C.red,
      fontFamily:FONT, fontSize:13, padding:24, textAlign:'center' }}>
      ERROR: {error}
    </div>
  )

  const uid = session.user.id
  const myModels = models.filter(m => m.owner_id===uid || m.access?.[uid])

  return (
    <div style={{ background:C.bg, minHeight:'100vh', color:C.text, fontFamily:FONT }}>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; }`}</style>

      {/* Nav */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`,
        padding:'0 24px', display:'flex', alignItems:'center', height:52, gap:16 }}>
        <div style={{ fontWeight:700, fontSize:14, color:C.accent, letterSpacing:2 }}>DES STUDIO</div>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:12, color:C.muted }}>{profile?.full_name || session.user.email}</span>
        <button onClick={() => sb.auth.signOut()} style={{ background:'#ffffff08',
          border:`1px solid ${C.border}`, borderRadius:5, color:C.muted,
          fontFamily:FONT, fontSize:11, padding:'5px 12px', cursor:'pointer' }}>
          Sign Out
        </button>
      </div>

      {/* Model list */}
      <div style={{ maxWidth:900, margin:'0 auto', padding:'28px 24px' }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:8 }}>
          Model Library
        </h1>
        <p style={{ fontSize:12, color:C.muted, marginBottom:24 }}>
          {myModels.length} model{myModels.length !== 1 ? 's' : ''} — full editor coming next
        </p>
        {myModels.length === 0 ? (
          <div style={{ color:C.muted, fontSize:13, textAlign:'center', padding:48 }}>
            No models yet.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {myModels.map(m => (
              <div key={m.id} style={{ background:C.panel, border:`1px solid ${C.border}`,
                borderRadius:8, padding:16 }}>
                <div style={{ fontWeight:700, color:C.text, marginBottom:4 }}>{m.name}</div>
                <div style={{ fontSize:12, color:C.muted }}>{m.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
