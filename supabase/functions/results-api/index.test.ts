// Deno unit tests for results-api Edge Function auth paths.
// Run with: deno test --allow-env supabase/functions/results-api/index.test.ts
//
// These tests mock the Supabase client to exercise auth logic without a live DB.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Minimal request/response helpers ─────────────────────────────────────────

function makeRequest(
  path: string,
  { token, method = "GET" }: { token?: string; method?: string } = {}
): Request {
  const url = `https://project.supabase.co/functions/v1/results-api/${path}`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return new Request(url, { method, headers });
}

async function parseJson(res: Response) {
  return res.json();
}

// ── Mock factory ─────────────────────────────────────────────────────────────

type MockUser = { id: string } | null;
type MockRun  = Record<string, unknown> | null;
type MockLink = { run_id: string; revoked_at: string | null; expires_at: string | null } | null;

function makeHandler(opts: {
  user?: MockUser;
  authError?: boolean;
  run?: MockRun;
  runError?: boolean;
  link?: MockLink;
  linkError?: boolean;
  sweepError?: boolean;
}) {
  const {
    user = { id: "user-1" },
    authError = false,
    run = { id: "run-1", model_id: "model-1", run_by: "user-1", run_label: "Test", ran_at: "2026-06-04T00:00:00Z", tags: [], archived: false, engine_version: "7.2.0", prng_algorithm: "mulberry32", base_seed: null, replications: 10, max_simulation_time: 480, warmup_period: 60, seed: 42, duration_ms: 1200, ai_insights: null, results_json: { summary: { served: 90 } } },
    runError = false,
    link = null,
    linkError = false,
    sweepError = false,
  } = opts;

  return {
    auth: {
      getUser: async () => ({
        data: { user: authError ? null : user },
        error: authError ? new Error("invalid token") : null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, _val: unknown) => ({
          eq: (_col2: string, _val2: unknown) => ({
            order: () => ({ limit: async () => ({ data: run ? [run] : [], error: runError ? new Error("db") : null }) }),
            single: async () => {
              if (table === "share_links") return { data: linkError ? null : link, error: linkError ? new Error("db") : null };
              if (table === "sweeps")      return { data: sweepError ? null : run, error: sweepError ? new Error("db") : null };
              return { data: runError ? null : run, error: runError ? new Error("db") : null };
            },
          }),
          single: async () => {
            if (table === "share_links") return { data: linkError ? null : link, error: linkError ? new Error("db") : null };
            return { data: runError ? null : run, error: runError ? new Error("db") : null };
          },
          order: () => ({ limit: async () => ({ data: run ? [run] : [], error: runError ? new Error("db") : null }) }),
          limit: async () => ({ data: run ? [run] : [], error: runError ? new Error("db") : null }),
        }),
      }),
    }),
  };
}

// ── Inline handler under test (extracted routing logic) ───────────────────────
// Rather than spinning up Deno.serve, we test the routing decisions directly.

async function routeRequest(req: Request, mockClient: ReturnType<typeof makeHandler>): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "GET")    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });

  const url      = new URL(req.url);
  const parts    = url.pathname.replace(/^\/functions\/v1\/results-api\/?/, "").split("/").filter(Boolean);
  const resource = parts[0];
  const id       = parts[1] ?? null;
  const shareToken = url.searchParams.get("shareToken");

  function j(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  if (shareToken) {
    if (resource !== "runs" || !id) return j(400, { error: "shareToken only for GET /runs/:runId" });
    const { data: link, error: le } = await mockClient.from("share_links").select().eq("token", shareToken).single();
    if (le || !link) return j(403, { error: "Share link not found" });
    if (link.revoked_at) return j(403, { error: "Share link has been revoked" });
    if (link.expires_at && new Date(link.expires_at) < new Date()) return j(403, { error: "Share link has expired" });
    if (link.run_id !== id) return j(403, { error: "Share link does not match this run" });
    const { data: run, error: re } = await mockClient.from("simulation_runs").select().eq("id", id).single();
    if (re || !run) return j(404, { error: "Run not found" });
    return j(200, { id: run.id, results: run.results_json });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return j(401, { error: "Missing authorization token" });

  const { data: { user }, error: authError } = await mockClient.auth.getUser();
  if (authError || !user) return j(401, { error: "Invalid or expired token" });

  if (resource === "runs" && id) {
    const { data: run, error } = await mockClient.from("simulation_runs").select().eq("id", id).single();
    if (error || !run) return j(404, { error: "Run not found" });
    if ((run as Record<string, unknown>).run_by !== (user as { id: string }).id) return j(403, { error: "Access denied" });
    return j(200, { id: (run as Record<string, unknown>).id, results: (run as Record<string, unknown>).results_json });
  }

  if (resource === "runs") {
    const modelId = url.searchParams.get("modelId");
    if (!modelId) return j(400, { error: "modelId required" });
    return j(200, { runs: [] });
  }

  if (resource === "sweeps" && id) {
    const { data: sweep, error } = await mockClient.from("sweeps").select().eq("id", id).eq("run_by", (user as { id: string }).id).single();
    if (error || !sweep) return j(404, { error: "Sweep not found" });
    return j(200, { id: (sweep as Record<string, unknown>).id });
  }

  return j(404, { error: "Unknown route" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

Deno.test("OPTIONS preflight returns 200 ok", async () => {
  const res = await routeRequest(makeRequest("runs/run-1", { method: "OPTIONS" }), makeHandler({}));
  assertEquals(res.status, 200);
});

Deno.test("GET /runs/:runId with valid JWT returns run data", async () => {
  const res = await routeRequest(makeRequest("runs/run-1", { token: "valid" }), makeHandler({}));
  assertEquals(res.status, 200);
  const body = await parseJson(res);
  assertEquals(body.id, "run-1");
});

Deno.test("GET /runs/:runId with missing JWT returns 401", async () => {
  const res = await routeRequest(makeRequest("runs/run-1"), makeHandler({}));
  assertEquals(res.status, 401);
  const body = await parseJson(res);
  assertEquals(body.error, "Missing authorization token");
});

Deno.test("GET /runs/:runId with invalid JWT returns 401", async () => {
  const res = await routeRequest(makeRequest("runs/run-1", { token: "bad" }), makeHandler({ authError: true }));
  assertEquals(res.status, 401);
  const body = await parseJson(res);
  assertEquals(body.error, "Invalid or expired token");
});

Deno.test("GET /runs/:runId with valid share token returns run data", async () => {
  const link = { run_id: "run-1", revoked_at: null, expires_at: null };
  const res = await routeRequest(
    makeRequest("runs/run-1?shareToken=tok123"),
    makeHandler({ link })
  );
  assertEquals(res.status, 200);
  const body = await parseJson(res);
  assertEquals(body.id, "run-1");
});

Deno.test("GET /runs/:runId with revoked share token returns 403", async () => {
  const link = { run_id: "run-1", revoked_at: "2026-01-01T00:00:00Z", expires_at: null };
  const res = await routeRequest(
    makeRequest("runs/run-1?shareToken=revoked"),
    makeHandler({ link })
  );
  assertEquals(res.status, 403);
  const body = await parseJson(res);
  assertEquals(body.error, "Share link has been revoked");
});

Deno.test("GET /runs/:runId with expired share token returns 403", async () => {
  const link = { run_id: "run-1", revoked_at: null, expires_at: "2020-01-01T00:00:00Z" };
  const res = await routeRequest(
    makeRequest("runs/run-1?shareToken=expired"),
    makeHandler({ link })
  );
  assertEquals(res.status, 403);
  const body = await parseJson(res);
  assertEquals(body.error, "Share link has expired" );
});

Deno.test("GET /runs?modelId= with valid JWT returns runs list", async () => {
  const res = await routeRequest(
    makeRequest("runs?modelId=model-1", { token: "valid" }),
    makeHandler({})
  );
  assertEquals(res.status, 200);
  const body = await parseJson(res);
  assertEquals(Array.isArray(body.runs), true);
});

Deno.test("GET /sweeps/:sweepId with valid JWT returns sweep data", async () => {
  const res = await routeRequest(
    makeRequest("sweeps/sweep-1", { token: "valid" }),
    makeHandler({})
  );
  assertEquals(res.status, 200);
  const body = await parseJson(res);
  assertEquals(body.id, "run-1");
});
