import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "GET") return json(405, { error: "Method not allowed" });

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")              ?? "";
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey      = Deno.env.get("SUPABASE_ANON_KEY")         ?? "";

  const url         = new URL(req.url);
  const pathParts   = url.pathname.replace(/^\/functions\/v1\/results-api\/?/, "").split("/").filter(Boolean);
  // pathParts[0] === "runs" | "sweeps"
  // pathParts[1] === id (optional)

  const resource = pathParts[0];  // "runs" or "sweeps"
  const resourceId = pathParts[1] ?? null;

  // ── SHARE TOKEN PATH (GET /runs/:runId?shareToken=…) ─────────────────────
  const shareToken = url.searchParams.get("shareToken");

  if (shareToken) {
    // Share-token path: validate token, then fetch via service client (bypasses RLS).
    if (resource !== "runs" || !resourceId) {
      return json(400, { error: "shareToken is only supported for GET /runs/:runId" });
    }
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { data: link, error: linkError } = await serviceClient
      .from("share_links")
      .select("run_id, revoked_at, expires_at")
      .eq("token", shareToken)
      .single();

    if (linkError || !link) return json(403, { error: "Share link not found" });
    if (link.revoked_at)    return json(403, { error: "Share link has been revoked" });
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return json(403, { error: "Share link has expired" });
    }
    if (link.run_id !== resourceId) return json(403, { error: "Share link does not match this run" });

    const { data: run, error: runError } = await serviceClient
      .from("simulation_runs")
      .select("id, model_id, run_by, run_label, ran_at, tags, archived, engine_version, prng_algorithm, base_seed, replications, max_simulation_time, warmup_period, seed, duration_ms, ai_insights, results_json")
      .eq("id", resourceId)
      .single();

    if (runError || !run) return json(404, { error: "Run not found" });

    return json(200, shapeRun(run));
  }

  // ── JWT BEARER PATH ────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return json(401, { error: "Missing authorization token" });

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json(401, { error: "Invalid or expired token" });

  const serviceClient = createClient(supabaseUrl, serviceKey);

  // ── GET /runs/:runId ───────────────────────────────────────────────────────
  if (resource === "runs" && resourceId) {
    const { data: run, error } = await serviceClient
      .from("simulation_runs")
      .select("id, model_id, run_by, run_label, ran_at, tags, archived, engine_version, prng_algorithm, base_seed, replications, max_simulation_time, warmup_period, seed, duration_ms, ai_insights, results_json")
      .eq("id", resourceId)
      .single();

    if (error || !run) return json(404, { error: "Run not found" });
    if (run.run_by !== user.id) return json(403, { error: "Access denied" });

    return json(200, shapeRun(run));
  }

  // ── GET /runs?modelId= ────────────────────────────────────────────────────
  if (resource === "runs") {
    const modelId = url.searchParams.get("modelId");
    if (!modelId) return json(400, { error: "modelId query parameter is required" });

    const { data: runs, error } = await serviceClient
      .from("simulation_runs")
      .select("id, model_id, run_label, ran_at, replications, tags, archived, total_arrived, total_served, total_reneged, avg_wait_time, avg_service_time, renege_rate, duration_ms")
      .eq("model_id", modelId)
      .eq("run_by", user.id)
      .order("ran_at", { ascending: false })
      .limit(100);

    if (error) return json(500, { error: "Database error", detail: error.message });

    return json(200, { runs: (runs ?? []).map(shapeRunSummary) });
  }

  // ── GET /sweeps/:sweepId ──────────────────────────────────────────────────
  if (resource === "sweeps" && resourceId) {
    const { data: sweep, error } = await serviceClient
      .from("sweeps")
      .select("id, model_id, run_by, config, results, created_at")
      .eq("id", resourceId)
      .single();

    if (error || !sweep) return json(404, { error: "Sweep not found" });
    if (sweep.run_by !== user.id) return json(403, { error: "Access denied" });

    return json(200, {
      id: sweep.id,
      modelId: sweep.model_id,
      createdAt: sweep.created_at,
      config: sweep.config,
      results: sweep.results,
    });
  }

  return json(404, { error: "Unknown route" });
});

// ── Response shape helpers ────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function shapeRun(run: Row) {
  return {
    id: run.id,
    modelId: run.model_id,
    runLabel: run.run_label,
    ranAt: run.ran_at,
    tags: run.tags ?? [],
    archived: run.archived ?? false,
    engineVersion: run.engine_version,
    prngAlgorithm: run.prng_algorithm,
    baseSeed: run.base_seed,
    replications: run.replications,
    maxSimulationTime: run.max_simulation_time,
    warmupPeriod: run.warmup_period,
    seed: run.seed,
    durationMs: run.duration_ms,
    aiInsights: run.ai_insights,
    results: run.results_json,
  };
}

function shapeRunSummary(run: Row) {
  return {
    id: run.id,
    modelId: run.model_id,
    runLabel: run.run_label,
    ranAt: run.ran_at,
    replications: run.replications,
    tags: run.tags ?? [],
    archived: run.archived ?? false,
    totalArrived: run.total_arrived,
    totalServed: run.total_served,
    totalReneged: run.total_reneged,
    avgWaitTime: run.avg_wait_time,
    avgServiceTime: run.avg_service_time,
    renegeRate: run.renege_rate,
    durationMs: run.duration_ms,
  };
}
