# Sprint 62 Plan — Hardening, Templates, and Docs

**Branch:** `sprint-62`
**Base:** `sprint-61`
**Date:** 2026-05-17
**Programme:** Real-Time Data Integration (Sprints 57/59–62) — final sprint

---

## Goal

Harden the adapter layer with robust error handling and exponential backoff retry, surface live data status in the UI via LIVE badges, record resolved parameter values in run exports, and add two new live-data templates that demonstrate the `calibrated_batch` and `lookahead` patterns.

---

## Deliverables

| ID | Deliverable | File(s) | Priority |
|---|---|---|---|
| F62.1 | Exponential backoff retry on RestAdapter — 3× retry, 2s/4s/8s delays | `RestAdapter.js` | P1 |
| F62.2 | Typed error handling: `AdapterFetchError` for 4xx/5xx/timeout/malformed JSON; WS errors wrapped too | `RestAdapter.js`, `WebSocketAdapter.js`, `SnapshotAdapter.js`, `index.js` | P1 |
| F62.3 | LIVE badge on ModelDetailHeader | `ModelDetailHeader.jsx` | P2 |
| F62.4 | LIVE badge on ModelCard in library | `ModelDetail.jsx` | P2 |
| F62.5 | Resolved param values in run export metadata (`liveParamValues`) | `execute/index.jsx`, `adapters/index.js` | P2 |
| F62.6 | Template: M/M/1 with Live Arrivals (calibrated_batch) | `templates.js` | P3 |
| F62.7 | Template: A&E Triage — Predictive Lookahead (lookahead) | `templates.js` | P3 |
| F62.8 | Vitest: adapter error paths (14 tests) | `__tests__/error-handling.test.js` | P1 |

---

## Design Notes

### Error handling contract
- `AdapterFetchError` exported from `src/engine/adapters/index.js`
- 4xx: throw immediately (client error — no point retrying)
- 5xx/network timeout: retry up to 3 times with 2s, 4s, 8s delays
- Malformed JSON: throw immediately
- WebSocket unavailable / connection error: throw `AdapterFetchError`

### Live data badge rule
```js
function hasLiveDataBindings(model) {
  if (!model?.dataSources?.length) return false;
  const hasBinding = (events, schedKey) =>
    (events || []).some(ev => (ev[schedKey] || []).some(s => s.paramSource?.sourceId));
  return hasBinding(model.bEvents, 'schedules') || hasBinding(model.cEvents, 'cSchedules');
}
```
Badge rendered only when both conditions are true: model has dataSources AND at least one event schedule has a paramSource binding.

### Resolved values tracking
`AdapterRegistry.getResolvedValues()` returns `{ [sourceId.field]: resolvedValue }` — populated on every `resolve()` call. The execute panel creates a registry for live-mode runs, calls `prefetchForRun()`, then retrieves resolved values after `runAll()` and stores them in the run config as `liveParamValues`.

---

## Acceptance Criteria

- [ ] `npx vitest run src/engine/adapters/__tests__/error-handling.test.js` → 14 tests pass
- [ ] Full adapter suite: 61 tests pass (no regressions)
- [ ] `AdapterFetchError` importable from `src/engine/adapters/index.js`
- [ ] RestAdapter: 4xx throws immediately, 5xx retries 3 times
- [ ] SnapshotAdapter: same retry/error contract as RestAdapter
- [ ] WebSocketAdapter: connection failure throws `AdapterFetchError`
- [ ] LIVE badge visible in ModelDetailHeader for live-bound models
- [ ] LIVE badge visible in ModelCard for live-bound models
- [ ] Run export config includes `liveParamValues` when a live-mode run resolves values
- [ ] Two new templates in TEMPLATES array: `mm1-live-arrivals`, `ae-triage-lookahead`
- [ ] New templates have `experimentDefaults.liveDataMode` set
