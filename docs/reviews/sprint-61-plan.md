# Sprint 61 Plan — Predictive Lookahead + State Injection

**Sprint:** 61
**Branch:** `sprint-61`
**Status:** Delivered
**Date:** 2026-05-17

---

## Goal

Add a `lookahead` live-data mode that fetches a real-time system snapshot from a REST endpoint, validates it, and injects the entity/queue state into the engine before the run starts. Enables short-horizon predictive simulation grounded in live operational data.

---

## Deliverables

| ID | Deliverable | File(s) | Status |
|---|---|---|---|
| F61.1 | `SnapshotAdapter` — fetch and parse a `SystemSnapshot` from a REST endpoint | `src/engine/adapters/SnapshotAdapter.js` | ✅ |
| F61.2 | `SystemSnapshot` schema validator — rejects snapshots missing required fields with a descriptive error | `src/engine/adapters/SnapshotAdapter.js` | ✅ |
| F61.3 | `engine.injectState(snapshot)` — populates entity store and FEL from snapshot; resets clock to 0; skips warm-up | `src/engine/index.js` | ✅ |
| F61.4 | `lookahead` mode in `prefetchForRun()` — fetches snapshot via SnapshotAdapter, calls `injectState()` | `src/engine/index.js` | ✅ |
| F61.5 | Warm-up source selector in ExperimentControls — visible when `liveDataMode === 'lookahead'`; selects a data source to use as the snapshot source | `src/ui/execute/ExperimentControls.jsx` | ✅ |
| F61.6 | Lookahead horizon input in ExperimentControls — replaces the max-sim-time label with "Lookahead horizon (minutes)" when in lookahead mode | `src/ui/execute/ExperimentControls.jsx` | ✅ |
| F61.7 | Vitest: `SnapshotAdapter` — fetch, validate, parse; invalid schema; valid schema | `src/engine/adapters/__tests__/snapshot.test.js` | ✅ |
| F61.8 | Vitest: `injectState()` — entity/queue state matches snapshot; warm-up not triggered; clock starts at 0 | `tests/engine/lookahead.test.js` | ✅ |

---

## SystemSnapshot Schema

```js
{
  clock: number,           // real-world time offset (minutes) — metadata only; sim clock resets to 0
  entities: [
    {
      type: string,        // must match an entityType.id or entityType.name in the model
      id: string,
      attrs: {},
      location: "queue" | "server",
      queueId?: string     // required when location === "queue"
    }
  ],
  queues: {
    [queueId: string]: { waiting: number, serving: number }
  }
}
```

---

## Acceptance Criteria

- [ ] `SnapshotAdapter.prefetch()` fetches URL, parses JSON, validates schema, stores snapshot
- [ ] `SnapshotValidationError` thrown for: missing `clock`, non-array `entities`, non-object `queues`, entity missing `type`/`id`/`location`, queue entity missing `queueId`
- [ ] Network errors re-thrown as-is (not wrapped in `SnapshotValidationError`)
- [ ] `engine.injectState(snapshot)` returns count of injected entities
- [ ] After `injectState()`, `getSnap().byQueue[queueName].waiting` matches snapshot
- [ ] After `injectState()`, clock is 0
- [ ] `runAll()` after `injectState()` completes without error
- [ ] `prefetchForRun(model, registry, engineRef)` with `liveDataMode === 'lookahead'` calls `engineRef.injectState()`
- [ ] ExperimentControls shows "Lookahead (state injection)" option in live data mode dropdown
- [ ] Snapshot source dropdown visible and populated when `liveDataMode === 'lookahead'`
- [ ] Run duration label reads "LOOKAHEAD HORIZON (MINUTES)" in lookahead mode
- [ ] Replications locked to 1 in lookahead mode
- [ ] All 32 new tests pass; no regressions in adapter or engine suites
