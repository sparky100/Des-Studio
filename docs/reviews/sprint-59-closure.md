# Sprint 59 — Closure Report: Calibrated Batch Mode

**Sprint:** 59
**Branch:** sprint-59
**Closed:** 2026-05-17
**Status:** ✅ Complete

---

## Delivered scope

All 8 planned deliverables shipped:

| ID | Deliverable | Notes |
|----|-------------|-------|
| F59.1 | `AdapterRegistry.prefetchAll()` | Fully implemented in Sprint 57; no changes required in Sprint 59 |
| F59.2 | `prefetchForRun(model, registry)` export | Added to `src/engine/index.js`. No-op when `liveDataMode` absent. |
| F59.3 | `DataSourceManager` UI | `src/ui/editors/DataSourceManager.jsx` — full CRUD, test connection button |
| F59.4 | Credential slot (sessionStorage) | `{{env.VAR}}` placeholder in model, actual value in sessionStorage only |
| F59.5 | BEventEditor parameter binding | `LiveParamRow` component with Static/Live toggle per schedule |
| F59.6 | CEventEditor parameter binding | `LiveParamRowC` component with same UI pattern |
| F59.7 | Live preview chip | "Live: N" green badge on LiveParamRow when value present |
| F59.8 | 7 Vitest tests | `tests/engine/calibrated-batch.test.js` — all passing |

---

## Files changed

| File | Type | Summary |
|------|------|---------|
| `src/engine/index.js` | Modified | Added `prefetchForRun()` export |
| `src/ui/editors/DataSourceManager.jsx` | New | Data Source Manager component |
| `src/ui/editors/BEventEditor.jsx` | Modified | `LiveParamRow` component; `dataSources` prop |
| `src/ui/editors/CEventEditor.jsx` | Modified | `LiveParamRowC` component; `dataSources` prop |
| `src/ui/ModelDetail.jsx` | Modified | `dataSources` in `MODEL_JSON_KEYS`, model state init, `mergeGeneratedModel`, tab bar; imported `DataSourceManager` |
| `tests/engine/calibrated-batch.test.js` | New | 7 integration tests |
| `tests/ui/model-export.test.jsx` | Modified | Added `dataSources: []` to expected model_json (test update for new key) |
| `docs/reviews/sprint-59-plan.md` | New | Sprint plan |
| `docs/reviews/sprint-59-closure.md` | New | This document |
| `docs/DES_Studio_Engineering_Spec.md` | Modified | §2.5 extended with calibrated_batch details; bumped to v1.4 |
| `docs/DES_Studio_User_Guide.md` | Modified | New §13 "Connecting live data sources"; bumped to v1.9 |
| `docs/DES_Studio_Build_Plan.md` | Modified | Sprint 57 and Sprint 59 entries added |
| `AGENTS.md` | Modified | Sprint tracking updated to Sprint 59 |

---

## Test results

```
Test Files: all passing
Tests:
  - tests/engine/calibrated-batch.test.js: 7 passed
  - src/engine/adapters/__tests__/adapters.test.js: 23 passed (Sprint 57 regression)
  - tests/ui/model-export.test.jsx: 8 passed (test updated for dataSources key)
```

Pre-existing failures on sprint-57 base branch (not introduced by this sprint):
- `tests/ui/model-import.test.jsx`: 2 failures (containerTypes/goals fields unrelated to live data)
- `tests/ui/model-health.test.jsx`: 1 failure (mobile workflow aria label)
- `tests/ui/shared/dist-picker.test.jsx`: 1 failure (pre-existing)
- `tests/ui/editors/unsaved-warning.test.jsx`: 1 failure (pre-existing)

---

## Acceptance criteria verification

| Criterion | Status |
|-----------|--------|
| `prefetchForRun()` calls `prefetchAll()` only when `liveDataMode === 'calibrated_batch'` | ✅ Test 5/6 |
| `mockAdapter.wasFetched()` returns true after `prefetchForRun` | ✅ Test 1 |
| Live value from adapter used in run (more arrivals than static) | ✅ Test 1 |
| Fallback used when adapter field missing | ✅ Test 2 |
| Model without `liveDataMode` runs identically with `nullRegistry` | ✅ Test 3 |
| Multiple replications use same pre-fetched value | ✅ Test 4 |
| Credentials never stored in model JSON | ✅ sessionStorage-only design |
| No new npm dependencies | ✅ |
| Inline styles only, design tokens from tokens.js | ✅ |

---

## Deferred to Sprint 60

- Execute panel: wire `prefetchForRun()` call from the run button when `liveDataMode === 'calibrated_batch'` is selected via the UI
- `liveDataMode` selector in `ExperimentControls`
- WebSocket adapter (`WebSocketAdapter.js`)
- Rolling and lookahead run modes
- `SnapshotAdapter`
