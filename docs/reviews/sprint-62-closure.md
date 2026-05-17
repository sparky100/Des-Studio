# Sprint 62 Closure Report — Hardening, Templates, and Docs

**Branch:** `sprint-62`
**Base:** `sprint-61`
**Closed:** 2026-05-17
**Programme:** Real-Time Data Integration (Sprints 57/59–62) — COMPLETE

---

## Summary

Sprint 62 completes the real-time data integration programme by hardening the adapter layer with typed error handling and exponential backoff retry, surfacing live data status in the UI, recording resolved parameter values in run export metadata, and adding two new live-data templates.

---

## Delivered Scope

| ID | Deliverable | Status | Notes |
|---|---|---|---|
| F62.1 | Exponential backoff retry on RestAdapter | ✅ | 3× retry with 2s, 4s, 8s delays; 4xx throws immediately |
| F62.2 | `AdapterFetchError` error class + wrapping in all adapters | ✅ | Exported from `src/engine/adapters/index.js`; RestAdapter, WebSocketAdapter, SnapshotAdapter all throw typed errors |
| F62.3 | LIVE badge on ModelDetailHeader | ✅ | Green pill, shown when `hasLiveDataBindings(model)` is true |
| F62.4 | LIVE badge on ModelCard in library | ✅ | Same helper + pill in `ModelDetail.jsx` ModelCard component |
| F62.5 | Resolved param values in run export metadata | ✅ | `AdapterRegistry.getResolvedValues()` + `liveParamValues` in run config |
| F62.6 | Template: M/M/1 with Live Arrivals | ✅ | `id: 'mm1-live-arrivals'`, calibrated_batch, REST source placeholder |
| F62.7 | Template: A&E Triage — Predictive Lookahead | ✅ | `id: 'ae-triage-lookahead'`, lookahead mode, snapshot source placeholder |
| F62.8 | Vitest: adapter error paths | ✅ | 14 tests in `error-handling.test.js` — all passing |

---

## Test Results

| Suite | Tests | Status |
|---|---|---|
| `error-handling.test.js` (new) | 14 | ✅ All pass |
| `adapters.test.js` | 23 | ✅ All pass (no regressions) |
| `snapshot.test.js` | 16 | ✅ All pass (updated for AdapterFetchError) |
| `websocket.test.js` | 8 | ✅ All pass |
| **Adapter suite total** | **61** | ✅ |

---

## Key Technical Decisions

### Error handling contract
- 4xx HTTP responses: throw `AdapterFetchError` immediately — client error, no retry benefit
- 5xx HTTP responses and network errors: retry up to 3 times with exponential backoff (2s, 4s, 8s)
- Malformed JSON: throw `AdapterFetchError('Malformed JSON response')` immediately
- WebSocket connection errors: throw `AdapterFetchError` (was plain `Error` before)
- `AdapterFetchError.status` is `null` for network/WS errors, HTTP status code for HTTP errors

### Unhandled rejection suppression
The `RestAdapter._pending` promise gets a no-op `.catch(() => {})` immediately after creation. This prevents Node.js/Vitest unhandled-rejection warnings during tests while the retry loop fires intermediate rejections; the `await this._pending` in `prefetch()` still propagates the final error to callers.

### Live badge rule
The `hasLiveDataBindings()` helper checks both conditions: model has at least one `dataSource` entry AND at least one B/C event schedule has a `paramSource.sourceId` binding. A model with data sources but no bindings does not show the badge.

### Execute panel registry wiring
`doRunAll()` now creates an `AdapterRegistry` and calls `prefetchForRun()` when `model.experimentDefaults.liveDataMode` is set and the model has dataSources. After `runAll()`, `registry.getResolvedValues()` is called and stored as `liveParamValues` in the run config if non-empty.

---

## Programme Completion: Real-Time Data Integration

This sprint completes the five-sprint real-time data integration programme:

| Sprint | Deliverable |
|---|---|
| Sprint 57 | Adapter layer foundation: RestAdapter, AdapterRegistry, `paramSource` schema, `resolve()` at FEL sample sites |
| Sprint 59 | Calibrated batch mode end-to-end: DataSourceManager UI, binding toggles, `prefetchForRun()` |
| Sprint 60 | Rolling mode + WebSocketAdapter: async FEL loop, `runAllAsync()`, LiveRunBanner |
| Sprint 61 | Predictive lookahead + state injection: SnapshotAdapter, `injectState()`, snapshot source selector |
| Sprint 62 | Hardening: typed errors, exponential backoff, LIVE badges, export metadata, live-data templates |

---

## Files Changed

| File | Change |
|---|---|
| `src/engine/adapters/RestAdapter.js` | Added `AdapterFetchError`, exponential backoff retry with 4xx short-circuit, malformed JSON handling, no-op catch on `_pending` |
| `src/engine/adapters/WebSocketAdapter.js` | Import `AdapterFetchError`; throw it on WS unavailable / connection error |
| `src/engine/adapters/SnapshotAdapter.js` | Added `fetchSnapshotWithRetry()` with same retry/error contract as RestAdapter |
| `src/engine/adapters/index.js` | Export `AdapterFetchError`; add `_resolvedValues` map to `AdapterRegistry`; add `getResolvedValues()`; clear on `dispose()` |
| `src/ui/ModelDetailHeader.jsx` | Add `hasLiveDataBindings()` helper; render LIVE pill when true |
| `src/ui/ModelDetail.jsx` | Add `hasLiveDataBindings()` helper; render LIVE pill in `ModelCard` |
| `src/ui/execute/index.jsx` | Import `AdapterRegistry`, `prefetchForRun`; create registry for live-mode runs; pass to `buildEngine`; record `liveParamValues` in run config |
| `src/engine/templates.js` | Add `MM1_LIVE_ARRIVALS` and `AE_TRIAGE_LOOKAHEAD` templates |
| `src/engine/adapters/__tests__/error-handling.test.js` | New — 14 error path tests |
| `src/engine/adapters/__tests__/snapshot.test.js` | Update network error test to expect `AdapterFetchError` (not `TypeError`); use fake timers |
| `docs/reviews/sprint-62-plan.md` | Sprint plan |
| `docs/reviews/sprint-62-closure.md` | This file |
