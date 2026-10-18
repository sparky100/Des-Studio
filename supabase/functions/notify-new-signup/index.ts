/**
 * notify-new-signup — Supabase Edge Function
 *
 * Emails the operator (ADMIN_NOTIFY_EMAIL, default support@simmodlr.app)
 * when someone signs up to any simmodlr app on this project, and lets a
 * platform admin send a test email from an admin panel. See handler.ts for
 * how requests are checked.
 *
 * Called by the AFTER INSERT trigger on auth.users
 * (supabase/migrations/20261018090000_notify_new_signup_v2.sql).
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY      — required; the same key notify-feedback uses
 *   ADMIN_NOTIFY_EMAIL  — optional; defaults to support@simmodlr.app
 *   SLACK_WEBHOOK_URL   — optional; also posts to Slack
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 */
import { createHandler } from "./handler.ts";

Deno.serve(createHandler({ env: key => Deno.env.get(key), fetch }));
