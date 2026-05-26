# Cloudflare DES Runtime Review

Date: 2026-05-26

## Existing Benchmark Baseline

- Existing benchmark scripts found:
  - `tests/engine/mm1_benchmark.js`
  - `tests/engine/mmc_benchmark.js`
  - `tests/engine/perf_timing.js`
  - `package.json` script `npm run bench`
- Existing benchmark fixtures/models found:
  - `src/engine/templates.js`
  - sample CSV schedule files at repo root
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/analysis/des-runtime-execution-map.md`
  - `docs/analysis/des-supabase-compute-and-storage-review.md` was not found, but related Supabase review exists at `docs/analysis/supabase-des-compute-and-storage-review.md`
- Existing runtime metrics found:
  - engine/runtime metrics in `src/engine/index.js`
  - compact saved runtime metrics in run persistence paths
- Existing test coverage related to performance:
  - benchmark/timing coverage under `tests/engine/benchmarks`
  - worker orchestration tests under `tests/engine/worker.test.js` and `tests/engine/replication-runner.test.js`
- Gaps compared with the requested benchmark/sizing goal:
  - no Cloudflare-specific deployment config was found
  - no Worker-specific runtime boundaries are documented in code
  - no explicit request/response-size guardrails are defined for import links or any edge-hosted path

## Executive Summary

I found no Cloudflare Worker runtime for DES execution in this codebase.

Current likely Cloudflare scope, if Cloudflare is used at all, is static frontend hosting only. The DES engine runs in the browser, not in Workers. Supabase Edge Functions handle import, LLM proxying, and notifications, but those are Supabase-hosted rather than Cloudflare-hosted in this repo.

That means the main Cloudflare concerns are:

- static hosting behavior
- cache strategy for built assets
- request/response size at the hosting layer
- avoiding any future attempt to move simulation execution into Workers

## Current Cloudflare Responsibilities

### What I found

- Vite frontend build only:
  - [package.json](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/package.json)
  - [vite.config.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/vite.config.js)
- no `wrangler.toml`
- no `functions/` directory for Cloudflare Pages Functions
- no Cloudflare Worker source files
- no Cloudflare-specific API proxy code
- no `_headers` or `_redirects` files
- no service worker or Cache API usage

### Practical conclusion

If DES Studio is deployed on Cloudflare, Cloudflare is most likely serving:

- `index.html`
- built JS/CSS/image assets from `dist/`
- client-side routes through the SPA shell

Everything simulation-related still happens in the browser after the app is loaded.

## Does Any Simulation Execution Happen In Workers?

### Cloudflare Workers

No.

I found no Cloudflare Worker code path that imports or calls:

- `buildEngine(...)`
- `runAll()`
- `runReplications(...)`

### Browser Web Workers

Yes, but these are standard browser workers, not Cloudflare Workers.

Evidence:

- `src/engine/replication-runner.js`
- `src/engine/worker.js`

These are used only for client-side replication batches.

## CPU-Heavy Or Long-Running Risks

### Current Cloudflare risk

Low, because Cloudflare is not running DES compute in this repo.

### Current browser risk

High for large single runs, but that is outside Cloudflare’s compute model.

Evidence:

- single-run execution still happens on the browser main thread in `src/ui/execute/index.jsx`
- replication batches use browser Web Workers, not server-side workers

### If DES compute were moved into Cloudflare Workers

That would be a poor fit for this architecture as it exists today.

Reasons:

- DES runs can be CPU-heavy and bursty
- long runs have uncertain duration
- replication batches multiply compute time
- result payloads can include large logs, traces, entity summaries, and time series
- current engine APIs assume in-memory execution with rich JS object outputs rather than streaming edge-safe partial responses

Recommendation:

- do not run `buildEngine(...).runAll()` or replication batches in Cloudflare Workers

## Request-Size Risks

## 1. Magic-link model import

Model import links are encoded as:

- `/#import?m=<base64url-json>`

Source:

- [importLink.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/utils/importLink.js)

Important nuance:

- the payload lives in the URL fragment after `#`
- URL fragments are not sent in the HTTP request to the server or CDN

Implication:

- Cloudflare does not receive the encoded model JSON for these links
- Cloudflare request-size limits are not the primary risk here

Actual risks are:

- browser URL length limits
- copy/share reliability across apps
- very large models becoming impractical to encode as a fragment
- client-side decode/parse cost

Recommendation:

- keep hash-fragment import links for small and medium models
- do not rely on fragment-based import for very large models
- prefer file import or server-side import endpoint for large models

## 2. Shared dashboard links

Shared results routes are also hash-based:

- `#share/<token>`

Implication:

- Cloudflare only serves the SPA shell
- the token fragment is not part of the HTTP request
- no special Worker routing is needed for the share-link client route itself

## 3. Model import via API

Server-side model import goes to:

- Supabase Edge Function `supabase/functions/import-model/index.ts`

That request path is not implemented as a Cloudflare Worker here.

Risk:

- large posted model JSON can still be expensive
- but the risk belongs to Supabase function/request sizing, not Cloudflare Worker sizing in this repo

## 4. Export flows

Model export, result export, CSV export, and report export are browser-local downloads:

- `Blob`
- `URL.createObjectURL(...)`
- browser-triggered download

Implication:

- Cloudflare is not carrying the exported payload after page load
- export payload size is a browser memory/download UX issue, not a Cloudflare response-size issue

## Response-Size Risks

Current Cloudflare response-size risk is mainly about the SPA bundle, not simulation outputs.

Potential concerns:

- large initial JS bundles over time
- static asset cache invalidation
- `index.html` not being cached appropriately

I found no evidence that run results, logs, or traces are served through a Cloudflare Worker response path in this repo.

## Caching Opportunities

### Good candidates for aggressive caching

- hashed Vite build assets from `dist/`
  - JS chunks
  - CSS
  - static media

Recommendation:

- cache built assets aggressively with long TTL and immutable semantics
- rely on hashed filenames for invalidation

### Candidates for light or no caching

- `index.html`
  - should revalidate more frequently so new builds are picked up quickly

- LLM proxy responses
  - currently explicitly marked `Cache-Control: no-cache` in Supabase Edge Function
  - should not be cached at Cloudflare

- authenticated Supabase API responses
  - generally should not be edge-cached unless a very deliberate public/cache-safe path is added

### Existing caching already in the app

The codebase does have client-side caching, but not Cloudflare edge caching:

- REST live-data adapter TTL cache in [RestAdapter.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/engine/adapters/RestAdapter.js)
- session-scoped secret storage via `sessionStorage`
- local anonymous persistence via `localStorage`

These reduce repeated browser fetch work, but they do not change Cloudflare behavior directly.

## API Routes / Proxies

I found no Cloudflare-hosted API route or proxy in this repository.

The main proxy-like path is:

- Supabase `llm-proxy`

Recommendation:

- keep LLM proxying out of Cloudflare Workers unless there is a specific operational reason
- if Cloudflare is added as a proxy later, use it only for:
  - simple auth-safe request forwarding
  - rate limiting
  - header normalization
  - request-size rejection

Not for:

- simulation execution
- large result transformation
- document/report generation

## What Should And Should Not Run In Workers

### Good fit for Cloudflare Workers

- tiny edge rewrites or redirects
- cache/header control
- very small request validation
- static token or route normalization
- optional public metadata endpoints with compact payloads

### Bad fit for Cloudflare Workers

- DES engine execution
- replication orchestration
- long-running scenario analysis
- full run-result assembly
- report generation from large result payloads
- anything that needs the full `results_json` with logs, traces, entity summaries, and time series

### Gray area

- model-import preflight validation

This could run in a Worker in principle, but only if:

- request sizes are capped
- validation stays lightweight
- large imports are redirected to a more suitable backend path

Even then, Supabase already provides an import endpoint, so duplicating that logic in Cloudflare would add operational surface area without obvious gain.

## Recommended Architecture Changes

### No immediate Cloudflare runtime change needed

Given the current codebase, the safest architecture is:

- Cloudflare Pages or equivalent static hosting for the SPA
- browser executes DES logic
- Supabase handles persistence and edge functions

### Recommended improvements if Cloudflare is the host

1. Add explicit static caching policy for built assets.
2. Add explicit `index.html` cache/revalidation policy.
3. Document that hash-routed import/share links do not hit the host edge with the fragment payload.
4. Add client-side guardrails for oversized magic-link imports, since host-level limits do not see the fragment.

### Recommended non-Cloudflare architecture change

If the product eventually needs server-side DES execution, do not use Cloudflare Workers as the primary compute target. Use a runtime better suited for:

- CPU-heavy jobs
- longer-lived execution
- larger in-memory result construction
- asynchronous job orchestration

That could be:

- a dedicated backend worker service
- queue-backed job runners
- a container/server environment

### If a Cloudflare Worker is introduced later

Keep its scope narrow:

- route mediation
- admission checks
- payload-size rejection
- static/public cache handling

Do not turn it into the DES execution engine.

## Concrete Risks

### Risk 1: Oversized magic-link imports feel like a hosting problem, but are really a browser-fragment problem

Because `#import?m=` is not sent to the server, edge logs and edge limits will not protect against very large links.

### Risk 2: Future contributors may misread “worker” usage

The repo already uses browser Web Workers for replications. That can be confused with Cloudflare Workers unless documented explicitly.

### Risk 3: If static caching is left implicit, deployment behavior may be inconsistent

Without explicit Pages/header policy, the SPA shell and asset freshness rules may depend on platform defaults rather than project intent.

### Risk 4: Long-running compute could be pushed into the wrong edge runtime later

The current browser-local engine makes it tempting to “just move it to a Worker.” That would be a risky architectural shortcut for heavy DES workloads.

## Recommendations

1. Treat Cloudflare as a static delivery layer, not a simulation runtime.
2. Keep DES execution in the browser for light runs and move heavy future server execution to a more suitable compute platform, not Workers.
3. Add client-side size checks for `#import?m=` magic links.
4. Prefer file import or server-side import endpoint for large models.
5. Add explicit asset/header caching policy if Cloudflare Pages is the deployment target.
6. Document the distinction between browser Web Workers and Cloudflare Workers in runtime docs.

## Follow-Up Tasks

1. Add a max-size guard for magic-link import payloads before decoding JSON.
2. Add a warning in the UI when a generated import link is likely to be too large to share reliably.
3. Add deployment docs for Cloudflare Pages cache behavior if Cloudflare is the actual host.
4. Add a short ADR or deployment note that DES compute must not be moved into Cloudflare Workers without a separate architecture review.
