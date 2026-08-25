// @ts-check
// db/auth.js — All Supabase auth operations, so UI and LLM-client code never
// call supabase.auth.* directly (15 direct call sites, pre-Sprint-94).
//
// Follows models.js's convention: plain exported async functions, throw the
// raw Supabase error on failure (no wrapping/normalizing).
import { supabase } from "./supabase.js";

/** @param {string} email @param {string} password */
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** @param {string} email @param {string} password */
export async function signUp(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** @param {string} email @param {string} redirectTo */
export async function resetPassword(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/** @param {string} password */
export async function updateUserPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Named to avoid colliding with the many `const [session, setSession] = useState(...)`
// call sites — this applies tokens handed off from elsewhere (e.g. a magic-link
// redirect), it doesn't set component state.
/** @param {string} accessToken @param {string} refreshToken */
export async function applySessionTokens(accessToken, refreshToken) {
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
}

/** @param {(event: import('@supabase/supabase-js').AuthChangeEvent, session: import('@supabase/supabase-js').Session|null) => void} callback */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return subscription;
}

// Collapses the "getSession() → pull access_token → build Authorization header"
// pattern duplicated identically across 5 call sites pre-Sprint-94.
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}
