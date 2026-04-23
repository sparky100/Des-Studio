import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnon) {
  console.error(
    'Missing Supabase environment variables.\n' +
    'Copy .env.example to .env.local and fill in your values.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnon)
