# Sprint 60 -- Rolling Mode and WebSocket Adapter

**Sprint:** 60
**Branch:** sprint-60 (from sprint-59)
**Date planned:** 2026-05-17
**Status:** Complete
**Prerequisite:** Sprint 59 (Calibrated Batch Mode End-to-End)

---

## Context

Sprint 60 delivers **rolling mode** -- live data that refreshes at each FEL sample site. Sprint 57 built the synchronous adapter layer; Sprint 59 added calibrated_batch. Sprint 60 adds:

- `WebSocketAdapter`: connects, waits for first message, returns latest value synchronously
- `AsyncRegistry.resolveAsync()`: async variant for rolling mode
- `runAllAsync()`: async FEL loop that pre-resolves param values before each step
- `prefetchForRun()` extended to handle rolling mode
- ExperimentControls run mode selector (Static / Calibrated Batch / Rolling)
- LiveRunBanner component for rolling run status display

---

## Scope

### Deliverables

| ID | Deliverable | File(s) | Status |
|----|-------------|---------|--------|
| F60.1 | `WebSocketAdapter` -- connect, first-message wait, synchronous getLatest | `src/engine/adapters/WebSocketAdapter.js` | Done |
| F60.2 | `AsyncRegistry.resolveAsync()` -- async param resolution; wraps any adapter | `src/engine/adapters/index.js` | Done |
| F60.3 | `runAllAsync()` on engine object -- async FEL loop with pre-step resolveAsync | `src/engine/index.js` | Done |
| F60.4 | `prefetchForRun()` extended for rolling mode | `src/engine/index.js` | Done |
| F60.5 | ExperimentControls run mode selector | `src/ui/execute/ExperimentControls.jsx` | Done |
| F60.6 | `LiveRunBanner` component | `src/ui/execute/LiveRunBanner.jsx` | Done |
| F60.7 | Vitest: WebSocket adapter tests (8 tests) | `src/engine/adapters/__tests__/websocket.test.js` | Done |
| F60.8 | Vitest: rolling mode tests (7 tests) | `tests/engine/rolling-mode.test.js` | Done |

---

## Architecture decisions

### WebSocketAdapter

- `prefetch()` waits up to 10 s for the first message, then resolves regardless (so rolling mode can start even if no initial message).
- Connection stays open after `prefetch()` for continuous updates.
- `_wsFactory` option enables DI in tests (Node/jsdom environments).
- Node 22+ has a global `WebSocket`; the "not available" error path is tested by temporarily unsetting `globalThis.WebSocket`.

### runAllAsync

- Implemented as a method on the engine closure object returned by `buildEngine()`.
- Before each `step()` call, pre-resolves all paramSource fields via `registry.resolveAsync()` to populate the adapter cache.
- The synchronous `step()` then calls `registry.resolve()` which reads from the already-updated cache.
- `onStep(snap, cycleLog)` callback is called after each step for UI progress updates.

### ExperimentControls

- `hasLiveBindings` computed from `model.dataSources.length > 0` AND at least one B/C-event schedule with a `paramSource.sourceId`.
- Run mode selector only shown when `hasLiveBindings` is true.
- Replications input disabled (not hidden) when `liveDataMode === 'rolling'`.

---

## Test coverage

- 8 WebSocket adapter tests: null before message, value after message, update on second message, dot-notation, dispose, error on no WebSocket, getLastMessageTime
- 7 rolling mode tests: runAllAsync exists, uses resolveAsync, runAll regression, prefetchForRun calls prefetchAll, result structure matches runAll, onStep callback, no-op for non-rolling
- All existing adapter and calibrated-batch tests: 30 tests passing
