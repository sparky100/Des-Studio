# Sprint 57 — Closure Report

**Sprint:** 57
**Branch:** sprint-57
**Closed:** 2026-05-17
**Status:** Complete ✓

---

## Delivered Scope

All F57.x items delivered as planned. No scope was deferred.

| ID | Deliverable | Result |
|----|-------------|--------|
| F57.1 | `AdapterRegistry` with `nullRegistry` | ✓ Delivered |
| F57.2 | `RestAdapter` | ✓ Delivered |
| F57.3 | `mockAdapter` | ✓ Delivered |
| F57.4 | Schema type definitions | ✓ Delivered |
| F57.5 | Engine `registry` param | ✓ Delivered |
| F57.6 | `registry.resolve()` at sample sites | ✓ Delivered |
| F57.7 | 23 Vitest tests | ✓ Delivered — all passing |

---

## Test Results

```
Test Files:  85 passed, 1 pre-existing failure (ai-model-apply-save — unrelated)
     Tests:  23 new passing; all 84 prior passing test files unchanged
```

The pre-existing failure in `tests/ui/editors/ai-model-apply-save.test.jsx` is a TDZ issue in `ModelDetail.jsx` unrelated to this sprint. It was present before Sprint 57 began.

---

## Architecture Delivered

```
src/engine/adapters/
  index.js          — AdapterRegistry + nullRegistry
  RestAdapter.js    — Poll-based REST, TTL cache, 3× retry, dot-notation field access
  mockAdapter.js    — Deterministic test stub
  types.js          — JSDoc: DataSource, ParamSource, SystemSnapshot
  __tests__/
    adapters.test.js — 23 Vitest tests
```

`src/engine/index.js` — `buildEngine()` gains optional 9th `registry` parameter; `nullRegistry` default preserves full backwards compatibility.

`src/engine/phases.js` — `registry.resolve()` inserted at both FEL scheduling sample sites (B-Event schedule, C-Event cSchedule). Two-line change per site; no structural engine changes.

---

## Backwards Compatibility

All existing callers of `buildEngine()` continue to work without modification:
- `src/ui/execute/index.jsx` — calls `buildEngine(model, seed, ...)` with 8 positional args; the new 9th defaults to `nullRegistry`
- `src/engine/replication-runner.js` — same
- `src/engine/sweep-runner.js` — same
- All Vitest engine tests — pass unchanged

---

## Decisions Log

| Decision | Rationale |
|---|---|
| `resolve()` is synchronous | Avoids async FEL loop changes until Sprint 59 (rolling mode). Sprint 58 (calibrated batch) pre-fetches before the run so sync resolution is sufficient. |
| `nullRegistry` as default | Zero-cost: returns the same `distParams` reference. No performance impact for existing static models. |
| `targetParam` optional | Covers 95% of use cases (single-param distributions) without requiring UI changes in Sprint 57. |
| `mockAdapter` ships with production code | Zero runtime overhead; provides test hooks that other test files can import. Kept minimal. |
| Dot-notation field access only (no JSONPath) | Avoids new dependency. Covers top-level and two-level nesting. Full JSONPath deferred if needed. |

---

## What Comes Next

| Sprint | Builds on Sprint 57 |
|---|---|
| 58 | Data Source Manager UI, parameter binding editor; `prefetchAll()` called before run; calibrated_batch mode end-to-end |
| 59 | `WebSocketAdapter`, async `runAllAsync()`, rolling mode, live run banner |
| 60 | `SnapshotAdapter`, `injectState()`, lookahead mode |
| 61 | Hardening, retry polish, live-data run metadata in export, two template models |
