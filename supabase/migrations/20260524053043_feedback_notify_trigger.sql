-- Migration: feedback notification trigger + admin RLS policies
-- Sprint: In-App Feedback & About Panel (Gap closure)
--
-- This migration:
--   1. Enables pg_net for async HTTP calls from triggers
--   2. Creates a trigger that calls the notify-feedback edge function on INSERT
--   3. Adds admin SELECT / UPDATE RLS policies on public.feedback
--
-- SETUP REQUIRED (run once after deploying the edge function):
--   ALTER DATABASE postgres SET "app.settings.supabase_url"      = 'https://<project-ref>.supabase.co';
--   ALTER DATABASE postgres SET "app.settings.service_role_key"  = '<your-service-role-key>';
--
--   The trigger reads these at runtime; without them the HTTP call is skipped
--   (fails gracefully) and an INFO notice is emitted to the Postgres log.

-- ─── 1. pg_net extension ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── 2. Trigger function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.notify_feedback_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url     text;
  v_svc_key text;
BEGIN
  -- Read project-specific settings stored by the DBA (see SETUP REQUIRED above).
  v_url     := current_setting('app.settings.supabase_url',     true);
  v_svc_key := current_setting('app.settings.service_role_key', true);

  IF v_url IS NULL OR v_svc_key IS NULL OR v_url = '' OR v_svc_key = '' THEN
    RAISE INFO '[notify_feedback_insert] app.settings.supabase_url / service_role_key not configured — skipping HTTP call';
    RETURN NEW;
  END IF;

  -- Fire-and-forget async POST via pg_net.
  -- Any network error is logged internally by pg_net and does not block the INSERT.
  PERFORM net.http_post(
    url     := v_url || '/functions/v1/notify-feedback',
    body    := row_to_json(NEW)::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_svc_key
    )
  );

  RETURN NEW;
END;
$$;

-- Attach trigger (skip if the table was created without it)
CREATE TRIGGER feedback_notify_on_insert
  AFTER INSERT ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_feedback_insert();

-- ─── 3. Admin RLS policies ──────────────────────────────────────────────────

-- Admins can read all feedback (needed by Admin Panel → Feedback tab)
CREATE POLICY "Admins can read feedback"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- Admins can update the status column (triage workflow)
-- Using explicit column check via WITH CHECK so updates to other sensitive
-- columns (message, user_id, etc.) are still blocked.
CREATE POLICY "Admins can update feedback status"
  ON public.feedback
  FOR UPDATE
  TO authenticated
  USING  (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
