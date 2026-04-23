import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://znkknldzdfajcrpabtmg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpua2tubGR6ZGZhamNycGFidG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTIyMzMsImV4cCI6MjA4OTMyODIzM30.2puQY_UNe3bOBT88Uyo2rtFU3AIUp3wgCNxcAVtw2ng'
)

export default function App() {
  const [session, setSession]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus]     = useState('')

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      setSession(session)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async () => {
    setStatus('Signing in...')
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) setStatus('ERROR: ' + error.message)
    else setStatus('SIGNED IN: ' + data.user?.email)
  }

  const signOut = async () => {
    await sb.auth.signOut()
    setStatus('')
  }

  const s = {
    background: '#080c10', minHeight: '100vh', display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: '#cdd9e5', fontFamily: 'monospace', gap: 12, padding: 24,
  }
  const inp = {
    background: '#111', border: '1px solid #1e2d3d', borderRadius: 6,
    color: '#cdd9e5', fontFamily: 'monospace', fontSize: 14,
    padding: '10px 14px', width: 300, outline: 'none',
  }
  const btn = (bg) => ({
    background: bg, border: 'none', borderRadius: 6, color: '#080c10',
    fontFamily: 'monospace', fontSize: 14, fontWeight: 700,
    padding: '10px 24px', cursor: 'pointer', width: 300,
  })

  if (loading) return (
    <div style={s}>
      <div style={{ color: '#06b6d4' }}>Loading...</div>
    </div>
  )

  if (session) return (
    <div style={s}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#3fb950' }}>
        Logged in!
      </div>
      <div style={{ color: '#06b6d4' }}>{session.user.email}</div>
      <div style={{ color: '#5c7a99', fontSize: 12 }}>
        User ID: {session.user.id}
      </div>
      <button style={btn('#f85149')} onClick={signOut}>Sign Out</button>
    </div>
  )

  return (
    <div style={s}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#06b6d4' }}>
        DES STUDIO — Session Test
      </div>
      <input style={inp} placeholder="email" value={email}
        onChange={e => setEmail(e.target.value)} />
      <input style={inp} placeholder="password" type="password" value={password}
        onChange={e => setPassword(e.target.value)} />
      <button style={btn('#06b6d4')} onClick={signIn}>Sign In</button>
      <div style={{ color: '#f0883e', fontSize: 14 }}>{status}</div>
    </div>
  )
}
