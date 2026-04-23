import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://znkknldzdfajcrpabtmg.supabase.co',
  'YOUR_ANON_KEY'
)

export default function App() {
  const [status, setStatus] = useState('Testing Supabase connection...')

  useEffect(() => {
    async function test() {
      try {
        const { data, error } = await sb.from('profiles').select('id').limit(1)
        if (error) {
          setStatus('SUPABASE ERROR: ' + error.message)
        } else {
          setStatus('SUPABASE CONNECTED! Rows: ' + (data?.length ?? 0))
        }
      } catch (e) {
        setStatus('EXCEPTION: ' + e.message)
      }
    }
    test()
  }, [])

  return (
    <div style={{
      background: '#080c10', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#cdd9e5', fontFamily: 'monospace', fontSize: 18,
      padding: 24, textAlign: 'center',
    }}>
      {status}
    </div>
  )
}
