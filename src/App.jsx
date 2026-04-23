import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://znkknldzdfajcrpabtmg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpua2tubGR6ZGZhamNycGFidG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTIyMzMsImV4cCI6MjA4OTMyODIzM30.2puQY_UNe3bOBT88Uyo2rtFU3AIUp3wgCNxcAVtw2ng'
)

export default function App() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus]     = useState('')

  const signUp = async () => {
    setStatus('Signing up...')
    const { data, error } = await sb.auth.signUp({ email, password })
    if (error) setStatus('ERROR: ' + error.message)
    else setStatus('SUCCESS: ' + JSON.stringify(data.user?.email))
  }

  const signIn = async () => {
    setStatus('Signing in...')
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) setStatus('ERROR: ' + error.message)
    else setStatus('SIGNED IN: ' + data.user?.email)
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

  return (
    <div style={s}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#06b6d4' }}>DES STUDIO — Auth Test</div>
      <input style={inp} placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input style={inp} placeholder="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button style={btn('#06b6d4')} onClick={signIn}>Sign In</button>
      <button style={btn('#3fb950')} onClick={signUp}>Sign Up</button>
      <div style={{ marginTop: 12, fontSize: 14, color: '#f0883e', maxWidth: 400, textAlign: 'center' }}>{status}</div>
    </div>
  )
}
