import { useState, useEffect, useCallback } from 'react'
import { supabase } from './Supabase.js'

// ── Engine (in-browser SimPy-equivalent, used until backend is wired) ────────
import { buildEngine } from './Engine.js'

// ── UI Components (extracted from v6) ────────────────────────────────────────
import {
  EntityTypeEditor, StateVarEditor, BEventEditor, CEventEditor,
  ModelDetail, ModelCard, NewModelModal,
} from './Components.jsx'

// ── Design tokens ────────────────────────────────────────────────────────────
import { C, FONT } from './Shared.jsx'

// ── API URL (set VITE_API_URL in .env.local once backend is deployed) ─────────
const API_URL = import.meta.env.VITE_API_URL || null

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE DATA LAYER
// Replaces the in-memory createDB() from v6 with real Supabase calls.
// The model shape is identical — JSONB columns match the JS object exactly.
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchModels(userId) {
  const { data, error } = await supabase
    .from('des_models')
    .select(`
      id, name, description, visibility, access,
      entity_types, state_variables, b_events, c_events,
      owner_id, created_at, updated_at
    `)
    .order('updated_at', { ascending: false })

  if (error) throw error

  // Supabase RLS handles access — but we also normalise the shape
  // to match what the UI expects (camelCase keys)
  return (data || []).map(normalise)
}

async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, initials, color, role')
  if (error) throw error
  return data || []
}

async function saveModel(model, userId) {
  // Supabase columns use snake_case; map from camelCase model shape
  const row = {
    name:             model.name,
    description:      model.description || '',
    visibility:       model.visibility  || 'private',
    access:           model.access      || {},
    entity_types:     model.entityTypes     || [],
    state_variables:  model.stateVariables  || [],
    b_events:         model.bEvents         || [],
    c_events:         model.cEvents         || [],
    owner_id:         userId,
  }

  if (model.id) {
    // Update existing
    const { data, error } = await supabase
      .from('des_models')
      .update(row)
      .eq('id', model.id)
      .select()
      .single()
    if (error) throw error
    return normalise(data)
  } else {
    // Create new
    const { data, error } = await supabase
      .from('des_models')
      .insert(row)
      .select()
      .single()
    if (error) throw error
    return normalise(data)
  }
}

async function deleteModel(modelId) {
  const { error } = await supabase
    .from('des_models')
    .delete()
    .eq('id', modelId)
  if (error) throw error
}

async function setModelAccess(modelId, access) {
  const { error } = await supabase
    .from('des_models')
    .update({ access })
    .eq('id', modelId)
  if (error) throw error
}

async function setModelVisibility(modelId, visibility) {
  const { error } = await supabase
    .from('des_models')
    .update({ visibility })
    .eq('id', modelId)
  if (error) throw error
}

// Run simulation — calls Python backend if VITE_API_URL is set,
// otherwise falls back to the in-browser engine (v6 behaviour)
async function runSimulation(model, session) {
  if (API_URL && session) {
    const res = await fetch(`${API_URL}/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        model,
        replications: 1,
        max_simulation_time: 500,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`API error ${res.status}: ${err}`)
    }
    const data = await res.json()
    // Return the first replication result in the same shape as buildEngine()
    return data.results[0]
  }

  // Fallback: in-browser engine
  return buildEngine(model)
}

// Normalise Supabase snake_case row → camelCase model object
function normalise(row) {
  return {
    id:               row.id,
    name:             row.name,
    description:      row.description,
    visibility:       row.visibility,
    access:           row.access      || {},
    entityTypes:      row.entity_types     || [],
    stateVariables:   row.state_variables  || [],
    bEvents:          row.b_events         || [],
    cEvents:          row.c_events         || [],
    owner_id:         row.owner_id,
    created_at:       row.created_at,
    updated_at:       row.updated_at,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

function AuthScreen() {
  const [mode, setMode]       = useState('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [info, setInfo]       = useState('')

  const submit = async () => {
    setError(''); setInfo(''); setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } },
        })
        if (error) throw error
        setInfo('Check your email to confirm your account, then sign in.')
        setMode('login')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
    color: C.text, fontFamily: FONT, fontSize: 13, padding: '10px 12px',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.accent, letterSpacing: 3 }}>
            DES STUDIO
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Three-Phase Discrete-Event Simulation
          </div>
        </div>

        {/* Card */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Tab toggle */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
            {['login','signup'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, background: 'none', border: 'none',
                borderBottom: mode === m ? `2px solid ${C.accent}` : '2px solid transparent',
                color: mode === m ? C.accent : C.muted,
                fontFamily: FONT, fontSize: 12, padding: '8px 0', cursor: 'pointer',
                fontWeight: mode === m ? 700 : 400, textTransform: 'uppercase', letterSpacing: 1,
              }}>{m === 'login' ? 'Sign In' : 'Sign Up'}</button>
            ))}
          </div>

          {mode === 'signup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
                color: C.muted, textTransform: 'uppercase' }}>Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name" style={inputStyle} />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
              color: C.muted, textTransform: 'uppercase' }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" type="email" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
              color: C.muted, textTransform: 'uppercase' }}>Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" type="password" style={inputStyle} />
          </div>

          {error && (
            <div style={{ background: C.red + '18', border: `1px solid ${C.red}44`,
              borderRadius: 5, padding: '8px 12px', fontSize: 12, color: C.red }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ background: C.green + '18', border: `1px solid ${C.green}44`,
              borderRadius: 5, padding: '8px 12px', fontSize: 12, color: C.green }}>
              {info}
            </div>
          )}

          <button onClick={submit} disabled={loading} style={{
            background: C.accent, color: '#080c10', border: 'none', borderRadius: 6,
            padding: '11px 0', fontFamily: FONT, fontSize: 13, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
            width: '100%', letterSpacing: 0.5,
          }}>
            {loading ? '⟳ Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [session,  setSession]  = useState(null)
  const [profile,  setProfile]  = useState(null)
  const [profiles, setProfiles] = useState([])
  const [models,   setModels]   = useState([])
  const [tab,      setTab]      = useState('my')
  const [openId,   setOpenId]   = useState(null)
  const [showNew,  setShowNew]  = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // ── Auth listener ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (!session) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session)
      if (!session) {
        setLoading(false)
        setModels([])
        setProfile(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Load data once session is available ─────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError('')
    try {
      const [mods, profs] = await Promise.all([
        fetchModels(session.user.id),
        fetchProfiles(),
      ])
      setModels(mods)
      setProfiles(profs)
      setProfile(profs.find(p => p.id === session.user.id) || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { loadData() }, [loadData])

  // ── Model actions (passed down to ModelDetail / ModelCard) ──────────────────
  const handleSave = async (model) => {
    const saved = await saveModel(model, session.user.id)
    await loadData()
    return saved
  }

  const handleDelete = async (modelId) => {
    await deleteModel(modelId)
    setOpenId(null)
    await loadData()
  }

  const handleSetAccess = async (modelId, access) => {
    await setModelAccess(modelId, access)
    await loadData()
  }

  const handleSetVisibility = async (modelId, visibility) => {
    await setModelVisibility(modelId, visibility)
    await loadData()
  }

  const handleRun = (model) => runSimulation(model, session)

  const handleCreate = async (name, description) => {
    const m = await saveModel(
      { name, description, entityTypes:[], stateVariables:[], bEvents:[], cEvents:[] },
      session.user.id
    )
    await loadData()
    setOpenId(m.id)
  }

  const signOut = () => supabase.auth.signOut()

  // ── Render guards ────────────────────────────────────────────────────────────
  if (!session) return <AuthScreen />

  if (loading) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center', color: C.muted,
      fontFamily: FONT, fontSize: 13 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>
      ⟳ Loading DES Studio…
    </div>
  )

  const userId    = session.user.id
  const myModels  = models.filter(m => m.owner_id === userId || m.access?.[userId])
  const pubModels = models.filter(m => m.visibility === 'public' && m.owner_id !== userId)

  // ── Open model detail ────────────────────────────────────────────────────────
  if (openId) {
    const model = models.find(m => m.id === openId)
    return (
      <div style={{ background: C.bg, minHeight: '100vh' }}>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <ModelDetail
          model={model}
          userId={userId}
          profiles={profiles}
          onBack={() => { setOpenId(null); loadData() }}
          onSave={handleSave}
          onDelete={handleDelete}
          onSetAccess={handleSetAccess}
          onSetVisibility={handleSetVisibility}
          onRun={handleRun}
        />
      </div>
    )
  }

  // ── Library view ─────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: FONT }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
      `}</style>

      {/* Nav */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16, height: 52 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.accent, letterSpacing: 2 }}>
          DES STUDIO
        </div>
        <div style={{ fontSize: 11, color: C.muted, borderLeft: `1px solid ${C.border}`,
          paddingLeft: 16 }}>
          Three-Phase · Entity Tracking · Stochastic Distributions
        </div>
        {API_URL && (
          <div style={{ fontSize: 10, background: C.green + '18',
            border: `1px solid ${C.green}44`, color: C.green,
            borderRadius: 3, padding: '2px 8px', letterSpacing: 1 }}>
            BACKEND CONNECTED
          </div>
        )}
        <div style={{ flex: 1 }} />
        {profile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%',
              background: (profile.color || C.accent) + '22',
              border: `1.5px solid ${(profile.color || C.accent)}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: profile.color || C.accent }}>
              {profile.initials || '?'}
            </div>
            <span style={{ fontSize: 12, color: C.muted }}>{profile.full_name}</span>
          </div>
        )}
        <button onClick={signOut} style={{
          background: '#ffffff08', border: `1px solid ${C.border}`, borderRadius: 5,
          color: C.muted, fontFamily: FONT, fontSize: 11, padding: '5px 12px',
          cursor: 'pointer', fontWeight: 600,
        }}>Sign Out</button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>

        {error && (
          <div style={{ background: C.red + '18', border: `1px solid ${C.red}44`,
            borderRadius: 6, padding: '10px 14px', fontSize: 12, color: C.red,
            fontFamily: FONT, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              Model Library
            </h1>
            <p style={{ fontSize: 12, color: C.muted }}>
              Build, execute and share discrete-event simulation models.
            </p>
          </div>
          <button onClick={() => setShowNew(true)} style={{
            background: C.accent, color: '#080c10', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontFamily: FONT, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', letterSpacing: 0.5,
          }}>+ New Model</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
          {[
            { id: 'my',     label: `My Models (${myModels.length})` },
            { id: 'public', label: `Public Library (${pubModels.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'none', border: 'none',
              borderBottom: tab === t.id ? `2px solid ${C.accent}` : '2px solid transparent',
              color: tab === t.id ? C.accent : C.muted,
              fontFamily: FONT, fontSize: 12, padding: '10px 18px',
              cursor: 'pointer', fontWeight: tab === t.id ? 700 : 400,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Grid */}
        {tab === 'my' && (
          myModels.length === 0
            ? <EmptyState icon="📐" msg="No models yet. Create your first DES model." />
            : <div style={{ display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
                {myModels.map(m => (
                  <ModelCard key={m.id} model={m} profiles={profiles}
                    userId={userId} onOpen={() => setOpenId(m.id)} />
                ))}
              </div>
        )}

        {tab === 'public' && (
          pubModels.length === 0
            ? <EmptyState icon="🌐" msg="No public models available." />
            : <div style={{ display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
                {pubModels.map(m => (
                  <ModelCard key={m.id} model={m} profiles={profiles}
                    userId={userId} onOpen={() => setOpenId(m.id)} />
                ))}
              </div>
        )}
      </div>

      {showNew && (
        <NewModelModal
          onClose={() => setShowNew(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}

// ── Local empty state component ───────────────────────────────────────────────
function EmptyState({ icon, msg }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px',
      color: '#5c7a99', fontFamily: FONT, fontSize: 13 }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
      {msg}
    </div>
  )
}
