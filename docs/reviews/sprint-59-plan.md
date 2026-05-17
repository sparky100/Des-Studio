# Sprint 59 — Calibrated Batch Mode: End to End

**Sprint:** 59
**Branch:** sprint-59 (from sprint-57)
**Date planned:** 2026-05-17
**Status:** Complete
**Prerequisite:** Sprint 57 (Real-Time Adapter Layer Foundation)

---

## Context

Sprint 59 delivers the complete **calibrated_batch** run mode. Sprint 57 built the engine-layer adapter subsystem. Sprint 59 adds the caller-side orchestration (`prefetchForRun`), the Data Source Manager UI, parameter binding toggles in the event editors, and comprehensive integration tests.

The five-sprint real-time data integration programme (57–61) continues; Sprint 60 will add rolling-window and WebSocket adapter support.

---

## Scope

### Deliverables

| ID | Deliverable | File(s) | Status |
|----|-------------|---------|--------|
| F59.1 | `AdapterRegistry.prefetchAll()` — verified complete from Sprint 57 | `src/engine/adapters/index.js` | ✓ |
| F59.2 | `prefetchForRun(model, registry)` — async helper exported from engine | `src/engine/index.js` | ✓ |
| F59.3 | Data Source Manager UI — add/edit/delete `dataSources[]`, test connection | `src/ui/editors/DataSourceManager.jsx` | ✓ |
| F59.4 | Credential slot — `{{env.VAR}}` placeholder; value stored in sessionStorage only | `src/ui/editors/DataSourceManager.jsx` | ✓ |
| F59.5 | Parameter binding in BEventEditor — Static/Live toggle per schedule distParam | `src/ui/editors/BEventEditor.jsx` | ✓ |
| F59.6 | Parameter binding in CEventEditor — same pattern for cSchedule distParams | `src/ui/editors/CEventEditor.jsx` | ✓ |
| F59.7 | Live preview chip — "Live: N" badge when source has value | BEventEditor / CEventEditor | ✓ |
| F59.8 | Vitest tests — 7 integration tests for calibrated_batch behaviour | `tests/engine/calibrated-batch.test.js` | ✓ |

### Model schema additions

**`dataSources[]`** — new top-level array stored in existing `model_json` JSONB column. No Supabase schema migration required.

**`experimentDefaults.liveDataMode`** — `'calibrated_batch' | null`.

### UI additions

- New **Data Sources** tab in the Design mode tab bar.
- `MODEL_JSON_KEYS` in `ModelDetail.jsx` extended to include `dataSources`.
- `BEventEditor` and `CEventEditor` accept a new `dataSources` prop.

### Out of scope

- WebSocket adapter — Sprint 60
- Rolling and lookahead run modes — Sprint 60
- `SnapshotAdapter` — Sprint 60
- `injectState` — Sprint 60
- `buildEngineAsync` — Sprint 60

---

## Architecture decisions

### Why `prefetchForRun` is a separate export

`buildEngine()` is synchronous and relied upon by many test fixtures, replication workers, and UI callers. Making it async would break all of them. The cleaner design is:

1. Caller (execute panel or test) calls `await prefetchForRun(model, registry)` — async, completes before engine creation.
2. Caller then calls `buildEngine(model, seed, ..., registry)` — synchronous as before.

The execute panel will wire this up in Sprint 60 when the UI mode selector exposes `calibrated_batch` as a run option. In Sprint 59 the calibrated batch path is available via the engine API and tested programmatically.

### Why credentials stay in sessionStorage

Supabase stores the `model_json` JSONB field. If credentials were stored there, they would be persisted to the database and visible to any user with read access. `sessionStorage` is cleared when the tab closes, never sent to any server, and only accessible within the same tab's origin. The `{{env.VAR}}` placeholder in the model JSON is opaque — it documents the expected credential slot name without exposing the value.

---

## Test summary

`tests/engine/calibrated-batch.test.js` — 7 tests:

1. `wasFetched()` true after `prefetchForRun`; live value used in run (more arrivals than static)
2. Fallback used when adapter has no value for the requested field
3. Static regression — model without `liveDataMode` unchanged
4. `prefetchForRun` no-op when `liveDataMode` absent
5. Multiple replications all use the same pre-fetched value
6. `prefetchForRun` only calls `prefetchAll` when `liveDataMode === 'calibrated_batch'`
7. Safe to call with `nullRegistry`

Total tests passing after Sprint 59: all 7 new + 23 Sprint 57 adapter tests = 30 live-data tests.
