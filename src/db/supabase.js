// db/supabase.js — Supabase client singleton
import { createClient } from "@supabase/supabase-js";

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.");
}

export const supabase = createClient(url, anon);

/**
 * Touch last_active_at for the current session owner.
 * Called once per session load (not on every render).
 * Errors are swallowed — this is telemetry, not a critical path.
 * Fires trg_profiles_last_active, which sets last_active_at = now().
 *
 * @param {string} userId - The authenticated user's UUID
 */
export async function touchLastActive(userId) {
  if (!userId) return;
  try {
    await supabase
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (_) {
    // telemetry only — never throw
  }
}

// Identifies this app in the shared Supabase project (feedback table,
// signup metadata) also used by the sibling "lens" and "loop" apps.
export const APP_NAME = 'simmodlr';

/**
 * Submit user feedback to the Supabase feedback table.
 * Inserts one row; throws on error.
 *
 * @param {{ category: string, message: string, userId: string|null, appVersion: string|undefined, pageContext: string|undefined, replyEmail?: string }} params
 * @param {object} [client] - Supabase client to use (defaults to the module singleton; injectable for tests).
 */
export async function submitFeedback({ category, message, userId, appVersion, pageContext, replyEmail }, client = supabase) {
  let accountEmail = null;
  if (userId) {
    try {
      const { data } = await client.auth.getUser();
      if (data?.user?.id === userId) {
        accountEmail = data.user.email || null;
      }
    } catch (_) {
      // Best-effort enrichment only — feedback should still be saved.
    }
  }

  const { error } = await client.from('feedback').insert({
    category,
    message,
    user_id: userId ?? null,
    account_email: accountEmail,
    reply_email: replyEmail?.trim() || null,
    app_version: appVersion,
    page_context: pageContext,
    app_name: APP_NAME,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
  if (error) throw error;
}

