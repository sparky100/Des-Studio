# Sprint 57 — Real-Time Data Integration: Adapter Layer Foundation

**Sprint:** 57
**Branch:** sprint-57
**Date planned:** 2026-05-17
**Status:** Complete
**Prerequisite:** Sprint 56 (ExecutePanel hook extraction)

---

## Context

Sprint 57 is the first of a five-sprint programme (57–61) delivering real-time data integration to simmodlr. The full specification and programme roadmap is documented in `docs/reviews/sprint-57-61-real-time-data-integration-plan.md`.

This sprint delivers only the **engine-layer foundation**: the adapter subsystem and the minimal engine wiring needed to resolve live parameter values. No UI changes are made. No network calls are made during testing. All existing callers of `buildEngine()` continue to work without modification.

---

## Scope

### Deliverables

| ID | Deliverable | File(s) | Status |
|----|-------------|---------|--------|
| F57.1 | `AdapterRegistry` with `nullRegistry` fallback | `src/engine/adapters/index.js` | ✓ |
| F57.2 | `RestAdapter` — fetch with TTL cache, retry (3×), dot-notation field extraction | `src/engine/adapters/RestAdapter.js` | ✓ |
| F57.3 | `mockAdapter` — deterministic stub with test helpers | `src/engine/adapters/mockAdapter.js` | ✓ |
| F57.4 | Schema type definitions (`DataSource`, `ParamSource`, `SystemSnapshot`) | `src/engine/adapters/types.js` | ✓ |
| F57.5 | Engine: optional `registry` param to `buildEngine()` with `nullRegistry` default | `src/engine/index.js` | ✓ |
| F57.6 | Engine: `registry.resolve()` at B-Event and C-Event sample sites in `phases.js` | `src/engine/phases.js` | ✓ |
| F57.7 | Vitest: 23 tests across `nullRegistry`, `makeMockAdapter`, `AdapterRegistry`, engine integration | `src/engine/adapters/__tests__/adapters.test.js` | ✓ |

### Out of scope

- WebSocket adapter (`WebSocketAdapter.js`) — Sprint 59
- UI changes (Data Source Manager, parameter binding editor) — Sprint 58
- Async engine variant (`runAllAsync`) — Sprint 59
- State injection (`injectState`) — Sprint 60
- Rolling and lookahead run modes — Sprints 59–60
- `SnapshotAdapter` — Sprint 60

---

## Design Decisions

### paramSource schema

Each B-Event `schedule` and C-Event `cSchedule` gains an optional `paramSource` sibling field:

```json
{
  "dist": "Exponential",
  "distParams": { "mean": "1.5" },
  "paramSource": {
    "sourceId": "ds_arrivals",
    "field": "mean_interarrival_mins",
    "targetParam": "mean",
    "fallback": "1.5"
  }
}
```

`paramSource` is optional everywhere. Models without it run identically to today. The `targetParam` key specifies which distParams key to replace with the live value; if omitted, the first key is used. `fallback` is used when the adapter has no cached value.

### nullRegistry

`buildEngine()` gains a ninth optional parameter `registry = nullRegistry`. `nullRegistry.resolve(distParams, _)` returns `distParams` unchanged. This means all existing callers (sweep runner, replication runner, UI execute panel, all tests) require zero changes.

### Synchronous resolve()

`registry.resolve()` is synchronous. In `calibrated_batch` mode (Sprint 58) the registry pre-fetches all values before the run starts via `prefetchAll()`, so the FEL loop remains synchronous and reproducible. Async resolution is deferred to Sprint 59 (rolling mode).

### RestAdapter retry

3 attempts with exponential back-off (2 s, 4 s). Uses `AbortSignal.timeout(10000)` for a 10-second per-request timeout. The adapter is environment-agnostic: it uses the standard `fetch()` API available in both modern browsers and Node ≥ 18.

### Credential security

`DataSource.authSecret` may contain `{{env.VAR}}` placeholders. `AdapterRegistry` resolves these from an `envSecrets` map passed at construction time. The resolved secret is never stored back into the model JSON. In Sprint 58 the UI will populate `envSecrets` from `sessionStorage`; in Sprint 57 this is wired at the type level only.

---

## Files Changed

| File | Change type | Description |
|------|------------|-------------|
| `src/engine/adapters/index.js` | New | `AdapterRegistry` class + `nullRegistry` export |
| `src/engine/adapters/RestAdapter.js` | New | Poll-based REST adapter with TTL cache and retry |
| `src/engine/adapters/mockAdapter.js` | New | Deterministic test stub with `wasFetched()`, `callLog()`, `setField()` helpers |
| `src/engine/adapters/types.js` | New | JSDoc type definitions for `DataSource`, `ParamSource`, `SystemSnapshot` |
| `src/engine/adapters/__tests__/adapters.test.js` | New | 23 Vitest tests |
| `src/engine/index.js` | Extended | `import { nullRegistry }` added; `registry = nullRegistry` 9th param added to `buildEngine()`; `registry` added to `makeCtx()` |
| `src/engine/phases.js` | Extended | `registry.resolve()` at B-Event schedule sample site; `registry.resolve()` at C-Event cSchedule sample site |

---

## Acceptance Criteria

- [x] All 23 new adapter tests pass
- [x] All pre-existing Vitest tests pass (84 test files, 1 pre-existing failure in `ai-model-apply-save.test.jsx` unrelated to this sprint)
- [x] `buildEngine(model, seed)` with no registry argument runs identically to before
- [x] `buildEngine(model, seed, ..., nullRegistry)` produces identical output to the default
- [x] A model with `paramSource` and a prefetched mock registry uses the live value instead of the static distParam
- [x] Fallback to static distParam when adapter has no cached value
- [x] No mutation of the original `distParams` object
- [x] `RestAdapter` constructed but `prefetch()` not yet called → `getLatest()` returns null

---

## Test Coverage

| Test group | Tests | Passing |
|---|---|---|
| `nullRegistry` | 2 | 2 |
| `makeMockAdapter` | 7 | 7 |
| `AdapterRegistry.resolve` | 7 | 7 |
| `AdapterRegistry.prefetchAll` | 1 | 1 |
| Credential resolution | 1 | 1 |
| Engine integration | 5 | 5 |
| **Total** | **23** | **23** |
