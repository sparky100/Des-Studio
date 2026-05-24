/**
 * notify-new-signup — Supabase Edge Function
 *
 * Triggered by a Supabase database webhook on INSERT to auth.users.
 * Sends an email notification via Resend API and optionally a Slack message.
 *
 * Required environment variables (configure in Supabase Dashboard → Edge Functions → Secrets):
 *   WEBHOOK_SECRET      — Shared secret; webhook Authorization header must equal "Bearer <secret>"
 *   ADMIN_NOTIFY_EMAIL  — Destination email for signup notifications
 *   RESEND_API_KEY      — Resend API key (https://resend.com)
 *
 * Optional environment variables:
 *   SLACK_WEBHOOK_URL   — If set, also sends a Slack message to this incoming webhook URL
 *
 * Database webhook setup (manual step — cannot be automated via migration):
 *   In Supabase Dashboard → Database → Webhooks → Create new webhook:
 *     Table:  auth.users
 *     Events: INSERT
 *     URL:    https://<project-ref>.supabase.co/functions/v1/notify-new-signup
 *     Headers:
 *       Authorization: Bearer <WEBHOOK_SECRET>
 *
 * Always returns HTTP 200 to prevent webhook retries on transient failures.
 * Errors are logged but never re-thrown.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WebhookPayload = {
  type: string;
  table: string;
  schema: string;
  record: {
    id: string;
    email: string;
    created_at: string;
    [key: string]: unknown;
  };
  old_record: null | Record<string, unknown>;
};

async function sendEmail(
  apiKey: string,
  toEmail: string,
  userEmail: string,
  userId: string,
  signupAt: string,
): Promise<void> {
  const signupDate = new Date(signupAt).toUTCString();
  const body = {
    from: "DES Studio <noreply@updates.simmodlr.app>",
    to: [toEmail],
    subject: `New signup: ${userEmail}`,
    text: [
      "New user signup on DES Studio",
      "",
      `Email:     ${userEmail}`,
      `User ID:   ${userId}`,
      `Signed up: ${signupDate}`,
      "",
      "— DES Studio Operator Notification",
    ].join("\n"),
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
}

async function sendSlack(webhookUrl: string, userEmail: string, signupAt: string): Promise<void> {
  const signupDate = new Date(signupAt).toUTCString();
  const payload = {
    text: `🎉 New DES Studio signup: *${userEmail}* at ${signupDate}`,
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Slack webhook error ${res.status}: ${text}`);
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  // ── Verify webhook secret ────────────────────────────────────────────────────
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  const authHeader = request.headers.get("authorization") || "";
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    console.error("notify-new-signup: unauthorized — invalid or missing WEBHOOK_SECRET");
    // Return 200 to avoid webhook retries for auth failures (would always fail)
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── Parse webhook payload ────────────────────────────────────────────────────
  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    console.error("notify-new-signup: invalid JSON payload");
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Only process INSERT events on auth.users
  if (payload.type !== "INSERT" || payload.table !== "users" || payload.schema !== "auth") {
    console.log(`notify-new-signup: skipping event type=${payload.type} table=${payload.schema}.${payload.table}`);
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { id: userId, email: userEmail, created_at: createdAt } = payload.record;

  if (!userEmail) {
    console.warn("notify-new-signup: no email in webhook record — skipping notification");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_email" }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── Send notifications ───────────────────────────────────────────────────────
  const resendApiKey   = Deno.env.get("RESEND_API_KEY");
  const adminEmail     = Deno.env.get("ADMIN_NOTIFY_EMAIL");
  const slackWebhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");

  const results: { email?: string; slack?: string } = {};

  // Email (primary)
  if (resendApiKey && adminEmail) {
    try {
      await sendEmail(resendApiKey, adminEmail, userEmail, userId, createdAt);
      results.email = "sent";
      console.log(`notify-new-signup: email sent to ${adminEmail} for new user ${userEmail}`);
    } catch (err) {
      results.email = `error: ${err instanceof Error ? err.message : String(err)}`;
      console.error("notify-new-signup: email send failed:", err);
    }
  } else {
    results.email = "skipped: RESEND_API_KEY or ADMIN_NOTIFY_EMAIL not configured";
    console.warn("notify-new-signup: email notification skipped — RESEND_API_KEY or ADMIN_NOTIFY_EMAIL not set");
  }

  // Slack (optional, secondary)
  if (slackWebhookUrl) {
    try {
      await sendSlack(slackWebhookUrl, userEmail, createdAt);
      results.slack = "sent";
      console.log(`notify-new-signup: Slack message sent for new user ${userEmail}`);
    } catch (err) {
      results.slack = `error: ${err instanceof Error ? err.message : String(err)}`;
      console.error("notify-new-signup: Slack send failed:", err);
    }
  }

  // Always return 200 to prevent webhook retries on transient failures
  return new Response(JSON.stringify({ ok: true, userId, userEmail, results }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
