-- Migration: version-control the auth.users -> notify-new-signup Database Webhook
--
-- This reproduces the native Supabase "Database Webhook" trigger that was
-- previously created ad-hoc via Dashboard -> Database -> Webhooks (undocumented
-- in git, only visible live via information_schema.triggers). Uses
-- supabase_functions.http_request, matching the confirmed live trigger
-- definition, so the trigger can be reproduced in any environment.
--
-- IMPORTANT — placeholder secret:
-- The Authorization header below contains a PLACEHOLDER value
-- (__PLACEHOLDER_WEBHOOK_SECRET__). It must be swapped for the real
-- WEBHOOK_SECRET (same value configured as the notify-new-signup Edge
-- Function secret) immediately after this migration is applied, via a
-- one-off manual statement run directly against the project (NOT committed
-- to git, since the trigger definition embeds the secret as a literal):
--
--   DROP TRIGGER "notify-new-signup" ON auth.users;
--   CREATE TRIGGER "notify-new-signup"
--     AFTER INSERT ON auth.users
--     FOR EACH ROW
--     EXECUTE FUNCTION supabase_functions.http_request(
--       'https://<project-ref>.supabase.co/functions/v1/notify-new-signup',
--       'POST',
--       '{"Content-type":"application/json","Authorization":"Bearer <REAL_WEBHOOK_SECRET>"}',
--       '{}',
--       '5000'
--     );
--
-- Until that manual step runs, the trigger fires with a bad secret. The edge
-- function still returns HTTP 200 on auth failure (by design, to avoid
-- webhook retry storms), so this failure mode is SILENT — apply this
-- migration and run the patch statement above back-to-back.

DROP TRIGGER IF EXISTS "notify-new-signup" ON auth.users;

CREATE TRIGGER "notify-new-signup"
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://<project-ref>.supabase.co/functions/v1/notify-new-signup',
    'POST',
    '{"Content-type":"application/json","Authorization":"Bearer __PLACEHOLDER_WEBHOOK_SECRET__"}',
    '{}',
    '5000'
  );
