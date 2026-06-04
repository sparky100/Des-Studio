# Results API — Design Specification

**Sprint:** 82
**Status:** Planned
**Edge Function:** `supabase/functions/results-api/index.ts`
**Base path:** `GET /functions/v1/results-api/`

---

## Purpose

A read-only REST API over saved simulation run results. Enables Python, R, and BI tools to pull results programmatically without manual file download through the app UI.

This function is **strictly read-only**. It makes no writes to any table. All authentication delegates to Supabase Auth. Data isolation is enforced by comparing `run_by` / `run_id` against the authenticated user identity.

---

## Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/runs/:runId` | JWT Bearer or `?shareToken=` | Full run record including `results_json` |
| `GET` | `/runs?modelId=:modelId` | JWT Bearer | Paginated metadata list for a model |
| `GET` | `/sweeps/:sweepId` | JWT Bearer | Full sweep record |
| `OPTIONS` | `*` | None | CORS preflight |

---

## Authentication

### JWT Bearer (all routes)

Identical pattern to `supabase/functions/import-model/index.ts`:

```typescript
const authHeader = req.headers.get("authorization") ?? "";
const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
if (!token) return jsonResponse(401, { error: "Missing authorization token" });

const { data: { user }, error: authError } = await authClient.auth.getUser(token);
if (authError || !user) return jsonResponse(401, { error: "Invalid or expired token" });
```

The authenticated `user.id` is then used in all data queries — the Edge Function never returns data that the database RLS would deny.

### Share Token (`GET /runs/:runId` only)

When `?shareToken=<token>` is provided instead of a JWT:

```typescript
const shareToken = url.searchParams.get("shareToken");
if (shareToken) {
  const { data: link, error } = await serviceClient
    .from("share_links")
    .select("run_id, revoked_at, expires_at")
    .eq("token", shareToken)
    .single();

  if (error || !link) return jsonResponse(403, { error: "Share link not found" });
  if (link.revoked_at)  return jsonResponse(403, { error: "Share link has been revoked" });
  if (link.expires_at && new Date(link.expires_at) < new Date())
    return jsonResponse(403, { error: "Share link has expired" });

  // fetch run using link.run_id — no user_id filter needed (share makes it public)
}
```

This mirrors what the existing `run_has_active_share()` database function checks, implemented inline in the Edge Function to avoid a database round-trip for the token lookup.

---

## Response Schemas

### `GET /runs/:runId` — 200 OK

```json
{
  "id": "3f7e2a1b-...",
  "modelId": "9a4c1d2e-...",
  "runLabel": "Option A — 3 clerks",
  "ranAt": "2026-06-04T10:23:00.000Z",
  "tags": ["baseline", "Q2"],
  "archived": false,
  "replications": 10,
  "maxSimulationTime": 1000,
  "warmupPeriod": 100,
  "seed": 42,
  "durationMs": 1234,
  "engineVersion": "55a",
  "prngAlgorithm": "mulberry32",
  "baseSeed": 42,
  "aiInsights": {
    "summary": "The queue is operating close to capacity...",
    "recommendation": "Consider adding one server during the 09:00–12:00 peak."
  },
  "results": {
    "summary": {
      "total": 1200,
      "served": 1183,
      "reneged": 17,
      "avgWait": 3.2,
      "avgSvc": 1.5,
      "avgSojourn": 4.7,
      "avgWIP": 4.1,
      "renegeRate": 0.014,
      "perResource": {
        "Clerk": { "total": 3, "utilisation": 0.82 }
      },
      "outcomes": {
        "route_complete": { "routeId": "route_complete", "routeLabel": "Completed", "status": "complete", "count": 1183, "avgWait": 3.1, "avgSojourn": 4.6 }
      }
    },
    "snap": { "clock": 1000, "byType": { ... }, "byQueue": { ... } },
    "runtimeMetrics": { "wall_clock_ms": 1234, "events_processed": 48200, "c_event_scans": 6100 },
    "waitDist": {
      "ServiceQueue": { "n": 1183, "mean": 3.2, "p50": 2.1, "p90": 7.4, "p95": 9.1, "p99": 14.3 }
    },
    "aggregateStats": {
      "summary.avgWait": { "n": 10, "mean": 3.2, "lower": 2.8, "upper": 3.6, "halfWidth": 0.4 },
      "summary.served":  { "n": 10, "mean": 1183, "lower": 1160, "upper": 1206, "halfWidth": 23 }
    },
    "replications": [
      { "replicationIndex": 0, "seed": 42, "summary": { "served": 1195, "avgWait": 3.0 }, "finalTime": 1000 }
    ],
    "_result_detail_level": "minimal",
    "_trimmed_fields": ["log", "trace", "entitySummary", "timeSeries", "waitDist.values"],
    "_engine_version": "55a",
    "_experiment_config": {
      "maxSimTime": 1000, "warmupPeriod": 100, "replications": 10, "seed": 42,
      "terminationMode": "time", "terminationCondition": null
    }
  }
}
```

**Note on `_trimmed_fields`:** Consumers must check this array. At the default `"minimal"` detail level, `log` (the event trace), `timeSeries`, full `entitySummary`, and raw `waitDist.values` are absent. Percentile summaries (p50/p90/p95/p99) are always present. Confidence intervals (`aggregateStats`) are present whenever replications > 1.

### `GET /runs?modelId=:modelId` — 200 OK

```json
[
  {
    "id": "3f7e2a1b-...",
    "runLabel": "Option A — 3 clerks",
    "ranAt": "2026-06-04T10:23:00.000Z",
    "replications": 10,
    "tags": ["baseline"],
    "archived": false,
    "totalArrived": 1200,
    "totalServed": 1183,
    "totalReneged": 17,
    "avgWaitTime": 3.2,
    "avgServiceTime": 1.5,
    "renegeRate": 0.014,
    "durationMs": 1234
  }
]
```

Default: up to 100 results, ordered by `ran_at DESC`. Archived runs are excluded by default unless `?archived=true` is passed.

### `GET /sweeps/:sweepId` — 200 OK

```json
{
  "id": "a1b2c3d4-...",
  "modelId": "9a4c1d2e-...",
  "createdAt": "2026-06-04T10:30:00.000Z",
  "config": {
    "paramConfig": { "path": "entityTypes[0].count", "label": "Clerk count" },
    "min": 1, "max": 5, "step": 1,
    "replications": 5, "seed": 42, "maxSimTime": 1000, "warmupPeriod": 100
  },
  "results": [
    {
      "value": 1,
      "seed": 42,
      "aggregateStats": {
        "summary.avgWait": { "n": 5, "mean": 9.2, "lower": 7.1, "upper": 11.3, "halfWidth": 2.1 }
      },
      "replications": [
        { "replicationIndex": 0, "seed": 42, "result": { "summary": { "served": 1100, "avgWait": 8.9 }, "finalTime": 1000 } }
      ]
    },
    {
      "value": 2,
      "seed": 42,
      "aggregateStats": { "summary.avgWait": { "n": 5, "mean": 3.2, "lower": 2.8, "upper": 3.6, "halfWidth": 0.4 } },
      "replications": [ ... ]
    }
  ]
}
```

---

## Error Responses

All errors return a JSON body `{ "error": "message" }`:

| Status | Condition |
|---|---|
| 400 | Missing required query parameter (e.g. `modelId` absent) |
| 401 | Missing or invalid JWT; no `shareToken` provided |
| 403 | Share token not found, revoked, or expired |
| 404 | Run/sweep not found, or found but owned by a different user |
| 405 | Method not allowed (non-GET request other than OPTIONS) |
| 500 | Unexpected internal error |

---

## Consumer Guidance

### Python / pandas

```python
import requests
import pandas as pd

headers = {"Authorization": f"Bearer {jwt_token}"}
base = "https://<project-ref>.supabase.co/functions/v1/results-api"

# Fetch a single run
run = requests.get(f"{base}/runs/{run_id}", headers=headers).json()

# Flat replication table
reps = pd.json_normalize(run["results"]["replications"])
# reps columns: replicationIndex, seed, summary.served, summary.avgWait, ...

# Per-queue wait stats
wait_dist = pd.DataFrame(run["results"]["waitDist"]).T
# wait_dist index: queue names; columns: n, mean, p50, p90, p95, p99

# Confidence intervals
ci = pd.json_normalize(
    [{"metric": k, **v} for k, v in run["results"]["aggregateStats"].items()]
)
```

### R

```r
library(httr)
library(jsonlite)

base <- "https://<project-ref>.supabase.co/functions/v1/results-api"
headers <- add_headers(Authorization = paste("Bearer", jwt_token))

run <- GET(paste0(base, "/runs/", run_id), headers) |> content("text") |> fromJSON()

# Replications dataframe (automatic with simplifyDataFrame = TRUE)
reps <- run$results$replications

# Wait dist as named list of data frames
wait_dist <- run$results$waitDist

# Confidence intervals
ci_df <- do.call(rbind, lapply(names(run$results$aggregateStats), function(m) {
  s <- run$results$aggregateStats[[m]]
  data.frame(metric = m, n = s$n, mean = s$mean, lower = s$lower, upper = s$upper)
}))
```

### Known Limitations

| Limitation | Impact | Workaround |
|---|---|---|
| Event log not available at `"minimal"` detail level | Cannot reconstruct event-by-event trace from API | Use the in-app LogViewer CSV export immediately after a run |
| `timeSeries` absent at `"minimal"` | Cannot reproduce time-series charts from API | Use in-app Results → Charts view |
| Raw `waitDist.values` absent at `"minimal"` | Cannot compute custom percentiles | The p50/p90/p95/p99 summary is always present |
| Sweep results not linked to `simulation_runs` | No join between sweep and individual run records | Use separate `/sweeps/:sweepId` endpoint |
| Max 100 runs per list request | Full history requires multiple requests | Use `?offset=N` pagination parameter |

---

## CORS Policy

All responses include:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
Access-Control-Allow-Methods: GET, OPTIONS
```

---

## Deployment

```bash
supabase functions deploy results-api
```

Required environment variables (same as all Edge Functions):
- `SUPABASE_URL` — automatically available in Edge Functions
- `SUPABASE_ANON_KEY` — automatically available
- `SUPABASE_SERVICE_ROLE_KEY` — automatically available
