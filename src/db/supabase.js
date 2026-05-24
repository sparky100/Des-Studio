// db/supabase.js — Supabase client singleton
import { createClient } from "@supabase/supabase-js";

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.");
}

export const supabase = createClient(url, anon);

/**
 * Submit user feedback to the Supabase feedback table.
 * Inserts one row; throws on error.
 *
 * @param {{ category: string, message: string, userId: string|null, appVersion: string|undefined, pageContext: string|undefined }} params
 */
export async function submitFeedback({ category, message, userId, appVersion, pageContext }) {
  const { error } = await supabase.from('feedback').insert({
    category,
    message,
    user_id: userId ?? null,
    app_version: appVersion,
    page_context: pageContext,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
  if (error) throw error;
}

