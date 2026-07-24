-- Migration: wire up the notify-new-signup Edge Function via a database trigger
--
-- notify-new-signup (supabase/functions/notify-new-signup/index.ts) already
-- existed in the repo but was never deployed or wired up. Rather than the
-- "manual Dashboard webhook" step its docstring used to describe, this
-- creates an equivalent trigger directly — mirroring the existing
-- dashboard-created "notify-feedback" trigger on public.feedback, which
-- already proves supabase_functions.http_request(...) triggers work in this
-- project (including on auth.users, which already has the on_auth_user_created
-- and on_auth_user_sync triggers).
--
-- SECURITY NOTE: the Authorization bearer value below must exactly match the
-- WEBHOOK_SECRET secret configured for this function in
-- Supabase Dashboard → Edge Functions → Secrets. Because Postgres triggers
-- can't reference Edge Function secrets at runtime, the value is embedded
-- literally here (same approach already used by the dashboard-created
-- notify-feedback trigger, which embeds a literal service-role JWT). This
-- means the secret is now part of this repo's git history — rotate it if
-- that's a concern for this project's access model.

CREATE TRIGGER "notify-new-signup"
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://znkknldzdfajcrpabtmg.supabase.co/functions/v1/notify-new-signup',
  'POST',
  '{"Content-type":"application/json","Authorization":"Bearer 18d0be8c578d26c4ee670eb6f82449dd084e43baef14e9bdaae026bb40219130"}',
  '{}',
  '5000'
);
