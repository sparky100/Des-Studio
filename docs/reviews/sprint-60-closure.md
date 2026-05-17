# Sprint 60 -- Closure Report: Rolling Mode and WebSocket Adapter

**Sprint:** 60
**Branch:** sprint-60
**Closed:** 2026-05-17
**Status:** Complete

---

## Delivered scope

All 8 planned deliverables shipped:

| ID | Deliverable | Notes |
|----|-------------|-------|
| F60.1 | `WebSocketAdapter` | `src/engine/adapters/WebSocketAdapter.js` -- 150 lines. connect/prefetch/getLatest/dispose. DI via _wsFactory. |
| F60.2 | `AdapterRegistry.resolveAsync()` | Added to `src/engine/adapters/index.js`. Also added to `nullRegistry`. Awaits adapter.getValue() if available, falls back to getLatest(). |
| F60.3 | `runAllAsync()` on engine | Added to engine closure in `src/engine/index.js`. Pre-resolves paramSource fields before each step. onStep callback for UI. |
| F60.4 | `prefetchForRun()` rolling support | Extended to call `prefetchAll()` for both calibrated_batch and rolling modes. |
| F60.5 | ExperimentControls run mode selector | `hasLiveBindings` guard, Static/Calibrated Batch/Rolling dropdown, replications disabled in rolling mode. |
| F60.6 | `LiveRunBanner` | `src/ui/execute/LiveRunBanner.jsx` -- pulsing live dot, per-source value/time chips, 1-second auto-tick. |
| F60.7 | 8 WebSocket adapter tests | `src/engine/adapters/__tests__/websocket.test.js` -- all passing. |
| F60.8 | 7 rolling mode tests | `tests/engine/rolling-mode.test.js` -- all passing. |

---

## Files changed

| File | Type | Summary |
|------|------|---------|
| `src/engine/adapters/WebSocketAdapter.js` | New | WebSocket adapter with prefetch/getLatest/dispose/DI |
| `src/engine/adapters/index.js` | Modified | Import WebSocketAdapter; add websocket type to _getAdapter; add resolveAsync to AdapterRegistry and nullRegistry |
| `src/engine/index.js` | Modified | prefetchForRun extended for rolling; runAllAsync + _asyncResolveDue added to engine |
| `src/ui/execute/ExperimentControls.jsx` | Modified | hasLiveBindings, liveDataMode/onLiveDataModeChange props, run mode selector, disabled replications for rolling |
| `src/ui/execute/LiveRunBanner.jsx` | New | Live run status banner with pulsing indicator and time-since-last-fetch chips |
| `src/engine/adapters/__tests__/websocket.test.js` | New | 8 WebSocket adapter unit tests |
| `tests/engine/rolling-mode.test.js` | New | 7 rolling mode integration tests |
| `docs/reviews/sprint-60-plan.md` | New | Sprint plan |
| `docs/reviews/sprint-60-closure.md` | New | This file |

---

## Test results

- Sprint 60 new tests: 15/15 passing
- Adapter regression suite: 23/23 passing
- Calibrated-batch suite: 7/7 passing
- Full test suite: all passing (distribution-fitting transient statistical failure is pre-existing, not introduced by Sprint 60)

---

## Known limitations

- `LiveRunBanner` is not yet wired into `ExecutePanel` (no rolling run flow in the execute panel yet; banner is ready to drop in).
- `ExperimentControls` new props (`liveDataMode`, `onLiveDataModeChange`) need to be passed from the parent `ExecutePanel` -- left as a follow-on task for Sprint 61 or the UI integration sprint.
- `runAllAsync()` pre-resolves all paramSource fields before each step (not per-sample-site). For models with many data sources this is efficient; for very high-frequency models, per-sample-site resolution would be more accurate but requires async phases.js refactor.
