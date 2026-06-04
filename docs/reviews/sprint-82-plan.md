# Sprint 82 — Results API & LLM-Ready Export Bundle

**Sprint:** 82
**Theme:** Programmatic access to saved results via a read-only REST API, and a self-contained LLM context document for paste-into-chat analysis
**Status:** ⬜ Not started
**Branch:** `claude/results-api-llm-export-assessment-1KH6J`
**Owner:** parkinsonsj@gmail.com

---

## Goal

Two parallel, independent deliverables that extend results accessibility beyond the app:

**Option 2 — Results API:** A new read-only Supabase Edge Function that exposes saved run results as a JSON endpoint. Enables Python, R, and BI tools to pull results programmatically without manual file download. Authenticated by JWT Bearer (same pattern as `import-model`); share-link tokens also accepted for public runs.

**Option 3 — LLM Export Bundle:** A new `buildLLMBundle()` serialiser and an "LLM Bundle (.md)" option in the existing Export… popover. Produces a structured Markdown document combining model definition and full results — sized for a context window and formatted so any LLM can reason about it without additional context from the user.

Both deliverables are independent: Option 2 is backend-only; Option 3 is client-side only. They can be developed in parallel and have no runtime dependency on each other.

---

## Pre-Sprint Assessment

Full assessment: `docs/reviews/sprint-82-pre-sprint-assessment.md` (the report produced before this plan was written).

Key findings that drove scope decisions:

- `results_json` in `simulation_runs` stores a complete persisted payload (summary, snap, runtimeMetrics, waitDist percentiles, aggregateStats/CI, replications array) — sufficient for a useful API with no schema changes.
- The event log (`result.log`) is not persisted at the default `"minimal"` detail level. The API will surface `logSummary` (entry count, final phase/message) and document the limitation via `_trimmed_fields`.
- `buildKpis()`, `goalsToPrompt()`, and `buildGoalGaps()` in `src/llm/prompts.js` are the canonical field-selection layer for results. `buildLLMBundle` will call these rather than re-implementing extraction.
- The existing `MAX_PROMPT_WORDS = 2000` cap in `prompts.js` must **not** be applied to the export bundle. It is an API cost optimisation for the hosted LLM proxy, not appropriate for an export targeting the user's own LLM session.
- Sweep results are stored in the separate `sweeps` table, not linked to `simulation_runs`. A third endpoint `GET /sweeps/:sweepId` is included to avoid a gap.

---

## Scope Guardrails

- No new Supabase migrations or `model_json` schema changes
- The Edge Function is **read-only** — no writes to any table, ever
- `buildLLMBundle` is pure JS — zero React, zero DOM imports
- All DB access in the Edge Function uses the service-role client for reads (same as `import-model`)
- No new npm or Deno dependencies beyond what `import-model` already uses (`@supabase/supabase-js@2`)
- Styling via `tokens.js` exclusively for any UI additions — no hardcoded colours
- `truncateWords()` must not be called inside `buildLLMBundle` — the bundle is uncapped by design

---

## Architecture

### Option 3 — LLM Export Bundle (client-side)

```
src/llm/prompts.js
  └── export buildKpis, goalsToPrompt, buildGoalGaps  ← make these public

src/llm/bundleExport.js  (new)
  └── buildLLMBundle(model, results, config) → Markdown string
        ├── preamble()             — DES Studio + Three-Phase domain context
        ├── modelSection()         — entity types, queues, events, goals (from model_json)
        ├── experimentSection()    — seed, replications, warmup, sim time, engine version
        ├── resultsSection()       — buildKpis() output + CI table + outcomes + journeys
        ├── replicationsSection()  — per-rep summary table (when replications > 1)
        └── goalsSection()         — buildGoalGaps() pass/fail table

src/ui/execute/index.jsx  (modify)
  └── Export… popover → add "LLM Bundle (.md)" option
        └── buildLLMBundle(model, results, config) + downloadTextFile()
```

### Option 2 — Results API (Edge Function)

```
supabase/functions/results-api/index.ts  (new)
  ├── OPTIONS  → CORS preflight
  ├── GET /runs/:runId
  │     ├── Auth: JWT Bearer via authClient.auth.getUser()
  │     │         OR ?shareToken= token lookup in share_links
  │     ├── Query: simulation_runs WHERE id = :runId
  │     └── Response: {id, modelId, runLabel, ranAt, tags, archived,
  │                     engineVersion, prngAlgorithm, baseSeed,
  │                     replications, maxSimulationTime, warmupPeriod,
  │                     seed, durationMs, aiInsights, results: results_json}
  │
  ├── GET /runs?modelId=:modelId[&limit=N][&offset=N][&archived=false]
  │     ├── Auth: JWT Bearer only (share tokens scoped to run, not model)
  │     ├── Query: simulation_runs WHERE model_id = :modelId AND run_by = uid
  │     │          ORDER BY ran_at DESC LIMIT 100
  │     └── Response: [{id, runLabel, ranAt, replications, tags, archived,
  │                      totalArrived, totalServed, avgWaitTime,
  │                      avgServiceTime, renegeRate, durationMs}]
  │
  └── GET /sweeps/:sweepId
        ├── Auth: JWT Bearer only
        ├── Query: sweeps WHERE id = :sweepId AND run_by = uid
        └── Response: {id, modelId, createdAt, config, results}
```

---

## Feature Scope

| ID | Feature | Status | Files |
|---|---|---|---|
| F82.1 | Export `buildKpis`, `goalsToPrompt`, `buildGoalGaps` from `prompts.js` | ⬜ | `src/llm/prompts.js` |
| F82.2 | `buildLLMBundle()` serialiser | ⬜ | `src/llm/bundleExport.js` (new) |
| F82.3 | "LLM Bundle (.md)" option in Export… popover | ⬜ | `src/ui/execute/index.jsx` |
| F82.4 | `results-api` Edge Function (3 routes) | ⬜ | `supabase/functions/results-api/index.ts` (new) |
| F82.5 | Unit tests for `buildLLMBundle` | ⬜ | `tests/llm/bundle-export.test.js` (new) |
| F82.6 | Edge Function smoke tests | ⬜ | `supabase/functions/results-api/index.test.ts` (new) |
| F82.7 | Architecture design spec | ⬜ | `docs/architecture/results-api-design.md` (new) |
| F82.8 | Build plan + AGENTS.md update | ⬜ | `docs/DES_Studio_Build_Plan.md`, `AGENTS.md` |

---

## LLM Bundle — Output Format

`buildLLMBundle(model, results, config)` returns a UTF-8 Markdown string with the following sections. None of this output is sent to the `llm-proxy` — it is written to a file or the clipboard.

```markdown
# DES Studio — Simulation Analysis Bundle
*Generated: <ISO date> | Model: <name> | Run: <label>*

## About This Document
[~150-word preamble: what DES Studio is, what the Three-Phase method produces,
 what the three phases mean, what replications and CIs represent.
 Gives the receiving LLM domain context it would not otherwise have.]

## Model Definition
### Entity Types
| Name | Role | Count | Arrival Distribution |
...
### Queues
| Name | Discipline | Capacity | Customer Type |
...
### Events (abbreviated — name and key parameters only)
...
### Goals
| Label | Metric | Target | Pass/Fail |
...

## Experiment Configuration
- Run label: ...
- Date: ...
- Seed: ... | Replications: ... | Warmup: ... | Simulation time: ...
- Engine version: ... | PRNG: mulberry32

## Results
### Headline KPIs
| Metric | Value |
...
### Per-Queue Wait Statistics
| Queue | Discipline | Mean Wait | p50 | p90 | p95 | p99 | Served | Renege Rate |
...
### Resource Utilisation
| Resource | Count | Utilisation | Busy | Idle |
...
### Confidence Intervals  [omitted for single-replication runs]
| Metric | n | Mean | 95% CI Lower | 95% CI Upper | Half-Width |
...
### Outcomes
| Route | Count | Avg Wait | Avg Sojourn |
...
### Goals — Pass/Fail
| Goal | Current | Target | Status | Gap |
...
### Warnings  [omitted if empty]
...

## Replication Summary  [omitted for single-replication runs]
| Replication | Seed | Served | Reneged | Avg Wait | Avg Sojourn | Final Time |
...
```

**Token estimate:** 1,500–2,500 words (2,000–3,300 tokens) for a fully populated model with 4 queues, 3 resources, 10 replications, and 5 goals. Fits well within any current LLM context limit.

---

## Results API — Response Shapes

### `GET /runs/:runId`

```json
{
  "id": "uuid",
  "modelId": "uuid",
  "runLabel": "string | null",
  "ranAt": "2026-06-04T10:23:00Z",
  "tags": ["string"],
  "archived": false,
  "replications": 10,
  "maxSimulationTime": 1000,
  "warmupPeriod": 100,
  "seed": 42,
  "durationMs": 1234,
  "engineVersion": "55a",
  "prngAlgorithm": "mulberry32",
  "baseSeed": 42,
  "aiInsights": { "summary": "..." } ,
  "results": {
    "summary": { ... },
    "snap": { ... },
    "runtimeMetrics": { ... },
    "waitDist": { "QueueA": { "n": 500, "mean": 3.2, "p50": 2.1, "p90": 7.4, "p95": 9.1, "p99": 14.3 } },
    "aggregateStats": { "summary.avgWait": { "n": 10, "mean": 3.2, "lower": 2.8, "upper": 3.6, "halfWidth": 0.4 } },
    "replications": [ { "replicationIndex": 0, "seed": 42, "summary": { ... }, "finalTime": 1000 } ],
    "_result_detail_level": "minimal",
    "_trimmed_fields": ["log", "trace", "entitySummary", "timeSeries", "waitDist.values"],
    "_engine_version": "55a",
    "_experiment_config": { ... }
  }
}
```

### `GET /runs?modelId=:modelId`

```json
[
  {
    "id": "uuid",
    "runLabel": "Option A — 3 clerks",
    "ranAt": "2026-06-04T10:23:00Z",
    "replications": 10,
    "tags": ["baseline"],
    "archived": false,
    "totalArrived": 1200,
    "totalServed": 1183,
    "avgWaitTime": 3.2,
    "avgServiceTime": 1.5,
    "renegeRate": 0.014,
    "durationMs": 1234
  }
]
```

### `GET /sweeps/:sweepId`

```json
{
  "id": "uuid",
  "modelId": "uuid",
  "createdAt": "2026-06-04T10:30:00Z",
  "config": { "paramConfig": { ... }, "min": 1, "max": 5, "step": 1, "replications": 5, ... },
  "results": [
    {
      "value": 1,
      "seed": 42,
      "aggregateStats": { "summary.avgWait": { "n": 5, "mean": 9.2, "lower": 7.1, "upper": 11.3, "halfWidth": 2.1 } },
      "replications": [ { "replicationIndex": 0, "seed": 42, "result": { "summary": { ... } } } ]
    }
  ]
}
```

---

## Authentication Detail

The Edge Function handles two authentication paths:

**Path 1 — JWT Bearer (all routes):**
```typescript
const authHeader = req.headers.get("authorization") ?? "";
const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
if (!token) return response(401, { error: "Missing authorization token" });
const { data: { user }, error } = await authClient.auth.getUser(token);
if (error || !user) return response(401, { error: "Invalid or expired token" });
// Use user.id for RLS-compliant data access
```

**Path 2 — Share token (`?shareToken=<token>`, `GET /runs/:runId` only):**
```typescript
const shareToken = url.searchParams.get("shareToken");
if (shareToken) {
  const { data: link } = await serviceClient
    .from("share_links")
    .select("run_id, revoked_at, expires_at")
    .eq("token", shareToken)
    .single();
  if (!link || link.revoked_at || (link.expires_at && new Date(link.expires_at) < new Date()))
    return response(403, { error: "Share link invalid or expired" });
  // fetch run by link.run_id using service role client
}
```

No new Supabase functions, RLS policies, or schema changes are required — the existing `run_has_active_share()` function logic is replicated inline in the Edge Function for the share-token path.

---

## Test Coverage

### `tests/llm/bundle-export.test.js` (new, 6 tests)

```
✓ buildLLMBundle includes model name in output
✓ buildLLMBundle includes queue names and mean wait values from buildKpis
✓ buildLLMBundle includes goal pass/fail from buildGoalGaps when goals defined
✓ buildLLMBundle does not truncate output at 2000 words (uncapped)
✓ buildLLMBundle includes Phase C truncation warning when phaseCTruncated = true
✓ buildLLMBundle omits confidence intervals section for single-replication runs
```

All tests use fixture model and results objects. No LLM calls. No Supabase calls.

### `supabase/functions/results-api/index.test.ts` (new, auth-path tests)

```
✓ GET /runs/:runId returns 401 when no Authorization header
✓ GET /runs/:runId returns 401 when JWT is invalid
✓ GET /runs/:runId returns 404 when run does not exist
✓ GET /runs?modelId= returns 401 when no Authorization header
✓ GET /sweeps/:sweepId returns 401 when no Authorization header
✓ GET /runs/:runId with valid shareToken returns run data
✓ GET /runs/:runId with expired shareToken returns 403
✓ OPTIONS preflight returns CORS headers
```

Note: Full integration tests require a running Supabase instance (`supabase start`). The above tests mock the Supabase client.

---

## UI Change — Export Popover

The existing Export… popover in `src/ui/execute/index.jsx` gains one new option:

```
Export…
├── JSON (Full)
├── JSON (Metrics only)
├── CSV
├── HTML Report
└── LLM Bundle (.md)   ← new
```

Clicking "LLM Bundle (.md)" calls `buildLLMBundle(model, results, config)` and pipes the result through the existing `downloadTextFile()` utility with a `.md` extension. No new utilities needed.

The option is disabled (greyed out) when `results` is null (no run has completed yet) — same gating as the existing JSON/CSV options.

---

## Deferred Scope

The following were evaluated in the pre-sprint assessment and explicitly excluded from Sprint 82:

| Item | Reason deferred |
|---|---|
| `?format=flat` response (BI-ready flattened JSON) | Requires knowing model's queue names to produce stable column names; non-trivial design question |
| API key pattern (stable secret, not JWT) | Pragmatic: JWT auth covers the initial use case; add when abuse/friction is observed |
| Rate limiting in the Edge Function | Supabase RLS provides per-user isolation; add in-function rate limiting if programmatic access creates load issues |
| Pagination for run list | First sprint returns up to 100 runs ordered by `ran_at DESC` |
| Multi-run comparison bundle | Out of scope; single-run bundle is the primary use case |
| Sweep bundle (sweep results in LLM format) | Out of scope; single-run bundle addresses the primary use case |
| Clipboard-only mode (no file download) | Can be added as a secondary action with trivial effort; deferred to avoid scope creep |

---

## Acceptance Criteria

### Option 3 — LLM Export Bundle

- [ ] "LLM Bundle (.md)" appears in the Export… popover when a run has completed
- [ ] Download produces a valid UTF-8 `.md` file with the correct filename `<model-name>-llm-bundle.md`
- [ ] The bundle contains a preamble explaining DES Studio and the Three-Phase method
- [ ] The bundle contains per-queue wait percentile table (p50/p90/p95/p99)
- [ ] The bundle contains resource utilisation table
- [ ] The bundle contains confidence interval table when replications > 1
- [ ] The bundle contains goals pass/fail table when goals are defined
- [ ] The bundle contains Phase C truncation warning when `phaseCTruncated = true`
- [ ] Pasting the bundle into Claude.ai allows the LLM to answer "which queue has the longest mean wait?" without additional context
- [ ] `buildLLMBundle` output does not contain `truncateWords` truncation artefacts (`" ..."`)
- [ ] 6 unit tests pass: `npm test -- bundle-export`
- [ ] Production build passes: `npm run build`

### Option 2 — Results API

- [ ] `GET /functions/v1/results-api/runs/:runId` returns 200 with full `results_json` + metadata for a valid JWT
- [ ] `GET /functions/v1/results-api/runs/:runId` returns 401 for missing/invalid JWT
- [ ] `GET /functions/v1/results-api/runs/:runId?shareToken=<token>` returns the run when share link is active
- [ ] `GET /functions/v1/results-api/runs/:runId?shareToken=<token>` returns 403 when share link is revoked or expired
- [ ] `GET /functions/v1/results-api/runs?modelId=:modelId` returns metadata list for a valid JWT
- [ ] `GET /functions/v1/results-api/sweeps/:sweepId` returns sweep result for a valid JWT
- [ ] All routes return `Access-Control-Allow-Origin: *` CORS header
- [ ] `curl` with a valid JWT returns parseable JSON (manual smoke test)
- [ ] Python snippet `pd.json_normalize(r.json()['results']['replications'])` produces a flat dataframe (manual smoke test)
- [ ] 8 unit tests pass in Edge Function test file
- [ ] TypeScript compiles without errors

---

## Implementation Notes

### F82.1 — Exporting helpers from `prompts.js`

`buildKpis`, `goalsToPrompt`, and `buildGoalGaps` are currently not exported (module-private). Before writing `bundleExport.js`, add `export` to their function declarations. Verify no existing test relies on them being private. These are pure functions — exporting them carries no risk.

### F82.2 — `buildLLMBundle` implementation

The function signature:
```javascript
export function buildLLMBundle(model = {}, results = {}, config = {}) {
  // config: { runLabel, ranAt, engineVersion, prngAlgorithm, baseSeed,
  //           replications, maxSimTime, warmupPeriod, seed }
  // Returns: Markdown string (uncapped, UTF-8)
}
```

Call `buildKpis(model, results)` for the results section. Call `buildGoalGaps(model, results?.aggregateStats || {})` for the goals section. Format tables as GitHub-Flavored Markdown pipe tables. Do not call `truncateWords()` anywhere in this module.

### F82.4 — Edge Function implementation

Follow the `import-model` function structure exactly:
1. CORS headers constant (copy verbatim)
2. `authClient` using anon key for JWT verification
3. `serviceClient` using service role key for DB reads
4. URL path parsing for route dispatch
5. `OPTIONS` handler for CORS preflight
6. Route handlers returning `Response` with `JSON.stringify` body

The function must handle the case where `results_json` is null (old runs before the column existed) — return the run record without the `results` field rather than a 500 error.

---

## Files Created / Modified Summary

| File | Action | Notes |
|---|---|---|
| `src/llm/prompts.js` | Modify | Export `buildKpis`, `goalsToPrompt`, `buildGoalGaps` |
| `src/llm/bundleExport.js` | Create | `buildLLMBundle()` — pure JS, uncapped Markdown serialiser |
| `src/ui/execute/index.jsx` | Modify | Add "LLM Bundle (.md)" to Export… popover |
| `supabase/functions/results-api/index.ts` | Create | Read-only Edge Function with 3 routes |
| `tests/llm/bundle-export.test.js` | Create | 6 unit tests for `buildLLMBundle` |
| `supabase/functions/results-api/index.test.ts` | Create | 8 auth-path tests for Edge Function |
| `docs/architecture/results-api-design.md` | Create | API design spec with response schemas |
| `docs/reviews/sprint-82-plan.md` | Create | This document |
| `docs/DES_Studio_Build_Plan.md` | Modify | Sprint 82 entry |
| `AGENTS.md` | Modify | Sprint tracking pointers updated |
