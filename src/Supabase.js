import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = 'https://YOUR-PROJECT.supabase.co'
const supabaseAnon = 'your-anon-key-here'

export const supabase = createClient(supabaseUrl, supabaseAnon)
