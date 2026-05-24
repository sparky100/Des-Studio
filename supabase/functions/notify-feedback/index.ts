// supabase/functions/notify-feedback/index.ts
// Edge Function: receives a POST whenever a new feedback row is inserted and
// sends an email notification to the support address via the Resend API.
//
// Trigger: called from the feedback_notify_on_insert PostgreSQL trigger
// (via pg_net), or from a Supabase Database Webhook configured in the dashboard.
//
// Required secret (set in Supabase dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY — your Resend API key (https://resend.com)

const RESEND_API_URL = "https://api.resend.com/emails";
const TO_EMAIL       = "support@simmodlr.app";
const FROM_EMAIL     = "noreply@simmodlr.app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORY_LABELS: Record<string, string> = {
  bug:     "🐛 Bug Report",
  feature: "✨ Feature Request",
  question:"❓ Question",
  other:   "💬 Other",
};

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "—";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(record: Record<string, unknown>): string {
  const {
    id, category, message, user_id,
    app_version, page_context, created_at,
  } = record as {
    id?: string; category?: string; message?: string; user_id?: string;
    app_version?: string; page_context?: string; created_at?: string;
  };

  const categoryLabel = CATEGORY_LABELS[category ?? ""] ?? escapeHtml(category);
  const ts = created_at
    ? new Date(created_at).toUTCString()
    : new Date().toUTCString();

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>New feedback</title></head>
<body style="font-family:system-ui,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:24px">
  <h2 style="margin:0 0 16px;font-size:16px;color:#4f46e5">New feedback — DES Studio</h2>
  <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px">
    <tr style="background:#f5f5f5">
      <th align="left" width="140" style="border:1px solid #ddd;font-weight:600">Category</th>
      <td style="border:1px solid #ddd">${categoryLabel}</td>
    </tr>
    <tr>
      <th align="left" style="border:1px solid #ddd;font-weight:600">Submitted</th>
      <td style="border:1px solid #ddd">${escapeHtml(ts)}</td>
    </tr>
    <tr style="background:#f5f5f5">
      <th align="left" style="border:1px solid #ddd;font-weight:600">User ID</th>
      <td style="border:1px solid #ddd;font-size:11px;color:#555">${escapeHtml(user_id) === "—" ? "(anonymous)" : escapeHtml(user_id)}</td>
    </tr>
    <tr>
      <th align="left" style="border:1px solid #ddd;font-weight:600">App version</th>
      <td style="border:1px solid #ddd">${escapeHtml(app_version)}</td>
    </tr>
    <tr style="background:#f5f5f5">
      <th align="left" style="border:1px solid #ddd;font-weight:600">Page</th>
      <td style="border:1px solid #ddd">${escapeHtml(page_context)}</td>
    </tr>
    <tr>
      <th align="left" style="border:1px solid #ddd;font-weight:600;vertical-align:top">Message</th>
      <td style="border:1px solid #ddd;white-space:pre-wrap;line-height:1.5">${escapeHtml(message as string)}</td>
    </tr>
    <tr style="background:#f5f5f5">
      <th align="left" style="border:1px solid #ddd;font-weight:600">Row ID</th>
      <td style="border:1px solid #ddd;font-size:11px;color:#555">${escapeHtml(id)}</td>
    </tr>
  </table>
  <p style="margin-top:16px;font-size:11px;color:#888">
    Triage this submission in <strong>Admin Panel → Feedback</strong> tab.
  </p>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      // Configured secret is missing — log and return 200 so trigger doesn't
      // retry endlessly. Admins should add the secret in the dashboard.
      console.error("[notify-feedback] RESEND_API_KEY is not set — notification skipped");
      return new Response("skipped: no api key", { status: 200, headers: CORS_HEADERS });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response("invalid json", { status: 400, headers: CORS_HEADERS });
    }

    // Accept both pg_net direct-row payload and Supabase Database Webhook format
    // pg_net: { id, category, message, ... }
    // DB webhook: { type, table, record: { id, category, ... }, old_record }
    const record: Record<string, unknown> =
      (body?.record && typeof body.record === "object")
        ? (body.record as Record<string, unknown>)
        : body;

    const { category } = record as { category?: string };
    const subject = `[DES Studio Feedback] ${CATEGORY_LABELS[category ?? ""] ?? category ?? "new submission"}`;

    const emailRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to:   [TO_EMAIL],
        subject,
        html: buildEmailHtml(record),
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error(`[notify-feedback] Resend API error ${emailRes.status}:`, errBody);
      return new Response("email send failed", { status: 502, headers: CORS_HEADERS });
    }

    console.log("[notify-feedback] Email sent for record:", record.id);
    return new Response("ok", { status: 200, headers: CORS_HEADERS });

  } catch (err) {
    console.error("[notify-feedback] Unhandled error:", err);
    return new Response("internal error", { status: 500, headers: CORS_HEADERS });
  }
});
