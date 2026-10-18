// notify-new-signup — request handling, kept free of Deno APIs so the test
// suite can run it directly (tests/notify-signup.test.js). index.ts wires it
// to Deno.serve with the real environment and fetch.
//
// Two kinds of request:
//
// 1. From the database. The AFTER INSERT trigger on auth.users
//    (migration 20261018090000_notify_new_signup_v2.sql) posts
//    { user_id }. There is no shared secret: the handler looks the user up
//    itself with the service role key and only emails when the account was
//    created in the last few minutes and hasn't been announced yet
//    (public.signup_notifications). A forged call can at most announce a
//    real, brand-new sign-up once, so there is nothing to protect with a
//    secret, and no secret to keep in step between the database and here.
//
// 2. A test from an admin panel: { test: true } with the caller's own access
//    token. Only a platform admin (profiles.role = 'admin') may send one; it
//    emails the notification address so the admin can see delivery works.

export const RECENT_SIGNUP_MS = 10 * 60 * 1000;
export const DEFAULT_NOTIFY_EMAIL = "support@simmodlr.app";
// Same sender as notify-feedback, whose domain is set up in Resend.
export const FROM_EMAIL = "simmodlr <noreply@simmodlr.app>";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_LABELS: Record<string, string> = { simmodlr: "simmodlr", flow: "Flow", lens: "Lens", loop: "Loop", compass: "Compass" };

export function appLabel(appName: unknown): string | null {
  if (typeof appName !== "string" || !appName) return null;
  return APP_LABELS[appName] ?? appName.charAt(0).toUpperCase() + appName.slice(1);
}

export type SignupUser = {
  id: string;
  email?: string | null;
  created_at: string;
  user_metadata?: Record<string, unknown> | null;
};

export function isRecentSignup(user: Pick<SignupUser, "created_at">, now: number, windowMs = RECENT_SIGNUP_MS): boolean {
  const created = Date.parse(user.created_at);
  return Number.isFinite(created) && now - created >= -60_000 && now - created <= windowMs;
}

export function signupEmail(user: SignupUser, toEmail: string, totalUsers: number | null) {
  const app = appLabel(user.user_metadata?.app_name);
  const when = new Date(user.created_at).toUTCString();
  const lines = [
    `${user.email} has signed up to simmodlr${app ? ` (${app})` : ""}.`,
    "",
    `Email:     ${user.email}`,
    ...(app ? [`App:       ${app}`] : []),
    `Signed up: ${when}`,
    `User ID:   ${user.id}`,
    ...(totalUsers != null ? [`Users now: ${totalUsers}`] : []),
    "",
    "See them in any app's Admin panel → Users.",
  ];
  return {
    from: FROM_EMAIL,
    to: [toEmail],
    subject: `New sign-up: ${user.email}`,
    text: lines.join("\n"),
  };
}

export function testEmail(toEmail: string, adminEmail: string) {
  return {
    from: FROM_EMAIL,
    to: [toEmail],
    subject: "Test: simmodlr sign-up notifications are working",
    text: [
      `This is a test sent by ${adminEmail} from an admin panel.`,
      "",
      `Each new sign-up to simmodlr (Flow, Loop, Lens or Compass) sends an email like this to ${toEmail}.`,
    ].join("\n"),
  };
}

export type Deps = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  now?: () => number;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

export function createHandler(deps: Deps) {
  const now = deps.now ?? (() => Date.now());

  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const supabaseUrl = deps.env("SUPABASE_URL");
    const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = deps.env("RESEND_API_KEY");
    const toEmail = deps.env("ADMIN_NOTIFY_EMAIL") || DEFAULT_NOTIFY_EMAIL;
    if (!supabaseUrl || !serviceKey) {
      console.error("notify-new-signup: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
      return json({ ok: false, error: "not_configured" }, 500);
    }
    const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    async function rest(path: string, init: RequestInit = {}) {
      return deps.fetch(`${supabaseUrl}${path}`, { ...init, headers: { ...admin, "Content-Type": "application/json", ...(init.headers || {}) } });
    }

    async function sendEmail(email: Record<string, unknown>): Promise<string | null> {
      if (!resendKey) return "RESEND_API_KEY is not set";
      const res = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(email),
      });
      if (res.ok) return null;
      return `Resend error ${res.status}: ${await res.text().catch(() => "")}`;
    }

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

    // ── Test email from an admin panel ──────────────────────────────────────
    if (body?.test === true) {
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const who = token ? await deps.fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } }) : null;
      const caller = who?.ok ? await who.json() : null;
      if (!caller?.id) return json({ ok: false, error: "sign_in_required" }, 401);
      const prof = await rest(`/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}&select=role`);
      const rows = prof.ok ? await prof.json() : [];
      if (rows?.[0]?.role !== "admin") return json({ ok: false, error: "admin_only" }, 403);
      const err = await sendEmail(testEmail(toEmail, caller.email || caller.id));
      if (err) return json({ ok: false, error: err, to: toEmail }, 502);
      return json({ ok: true, sent: true, to: toEmail });
    }

    // ── A new sign-up, from the database trigger ────────────────────────────
    // Also accepts the older Database Webhook shape ({ record: { id } }).
    const userId = (typeof body?.user_id === "string" && body.user_id)
      || (typeof (body?.record as Record<string, unknown>)?.id === "string" && (body.record as Record<string, string>).id);
    if (!userId) return json({ ok: true, skipped: "no_user_id" });

    const userRes = await deps.fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: admin });
    if (!userRes.ok) return json({ ok: true, skipped: "unknown_user" });
    const user = (await userRes.json()) as SignupUser;
    if (!user?.email) return json({ ok: true, skipped: "no_email" });
    if (!isRecentSignup(user, now())) return json({ ok: true, skipped: "not_recent" });

    // Claim the announcement; a second call for the same user gets no row back.
    const claim = await rest("/rest/v1/signup_notifications?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ user_id: userId }),
    });
    const claimed = claim.ok ? await claim.json() : [];
    if (!Array.isArray(claimed) || claimed.length === 0) return json({ ok: true, skipped: "already_notified" });

    const countRes = await rest("/rest/v1/profiles?select=id", { method: "HEAD", headers: { Prefer: "count=exact" } });
    const total = Number((countRes.headers.get("content-range") || "").split("/")[1]);

    const err = await sendEmail(signupEmail(user, toEmail, Number.isFinite(total) ? total : null));
    if (err) {
      console.error(`notify-new-signup: ${err}`);
      // Let a retry try again rather than leaving the sign-up unannounced.
      await rest(`/rest/v1/signup_notifications?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
      return json({ ok: false, error: err });
    }

    const slack = deps.env("SLACK_WEBHOOK_URL");
    if (slack) {
      await deps.fetch(slack, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `New simmodlr sign-up: *${user.email}*` }) })
        .catch(e => console.error("notify-new-signup: Slack failed", e));
    }
    console.log(`notify-new-signup: notified ${toEmail} of ${user.email}`);
    return json({ ok: true, sent: true });
  };
}
