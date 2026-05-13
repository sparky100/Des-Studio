# Sprint 27 — Closure Report

Created: 2026-05-13  
Status: ✅ Complete  
Plan reference: `docs/reviews/sprint-27-simulation-debugging-and-explainability-plan.md`

## Sprint Summary

Sprint 27 added first-class simulation debugging and explainability support to DES Studio. Modellers can now trace why events fired, why entities are waiting, why queue/server selections occurred, and navigate between the canvas, logs, and entity inspection surfaces without losing run context.

## Goal

Make DES Studio easier to trust by adding first-class simulation debugging and explainability support around the existing engine and execute surfaces.

## Delivery Status

| Work item | Status | Notes |
|---|---|---|
| F27.1 — Define the Sprint 27 explainability contract | ✅ Complete | TraceEntry schema defined, documented in plan doc |
| F27.2 — Add event provenance and causal trace records | ✅ Complete | Structured trace in engine via `_trace()`; all phase entries now carry structured payloads |
| F27.3 — Add entity lifecycle and waiting inspection | ✅ Complete | EntityInspector component with status, waiting, stages, attrs; Inspector tab in BottomPanel |
| F27.4 — Explain queue/resource arbitration and C-event evaluation | ✅ Complete | Arbitration reasoning in ASSIGN macro; cEval detail in LogTab expand/collapse |
| F27.5 — Link visual canvas, logs, entities, and trace panels | ✅ Complete | Entity ID links in log detail open Inspector; node names in logs are clickable to filter; selectedEntityId state lifted to ExecutePanel |
| F27.6 — Add explainability regression coverage and performance guardrails | ✅ Complete | 12 engine trace tests + 14 UI explainability tests; trace determinism verified; trace data confirmed non-mutating |
| F27.7 — Update modeller-facing guidance and debugging workflow docs | ✅ Complete | Capability guide updated with debugging workflows |
| F27.8 — Produce a capability guide with sample debug scenarios | ✅ Complete | This closure report + capability guide document the delivered surfaces |

## Delivered Scope

### Engine-level trace emission
- `_trace()` emitter in `engine/index.js:114` produces structured `TraceEntry` objects with `phase`, `time`, `seq` and phase-specific payloads
- Phase A: `clock{from, to, dueEvents[]}`
- Phase B: `event{type, id, name, fired, entityIds[], newEvents[]}`
- Phase C: `cEval{eventId, eventName, priority, pass, conditionTrue, failureReason, skippedBecause}` + `event{}` + `arbitration{}`
- Warnings: `phase="WARNING"` with `warning{code, message, detail}`

### UI surfaces
- **Inspector tab** in BottomPanel — click any entity row or entity ID link in log to inspect
- **EntityInspector** shows: arrival time, status, waiting age, waiting reason, queue, server, loop count, sojourn, attributes, multi-stage service history
- **LogTab** expandable detail (`▶`/`▲`) shows cEval, event, and arbitration trace data
- **Clickable node names** in log messages filter the log to that node
- **Entity ID links** (`#1`, `#10`) in expanded log entries navigate to Inspector tab

### Cross-surface navigation
- Canvas node click → filters log to that node
- Log node name click → filters log to that node
- Log entity ID click → opens Inspector tab for that entity
- Entity row click → opens Inspector tab
- Inspector close button → deselects entity

## Deferred or Removed Scope

None — all planned Sprint 27 items delivered.

## Architectural Decisions and Issues

| Issue | Outcome | ADR / reference | Notes |
|---|---|---|---|
| A27.1 — Explainability data model | Closed | Plan doc §TraceEntry schema | One structured `TraceEntry` schema — all engine trace work builds against it |
| A27.2 — Trace volume and retention | Closed | In-memory only | Full trace kept in-memory for single runs; not persisted for replication batches |
| A27.3 — Cross-surface linking | Closed | `entityId` as primary join key | Canvas node IDs derived from model graph node IDs; entity IDs are numbers |
| A27.4 — Condition eval variable capture | Deferred | Sprint 28 candidate | `evalCondition` returns only boolean; per-clause variable capture requires restructure |

## Verification

### Focused test runs

| Test suite | Result |
|---|---|
| `npm test -- trace-determinism` | ✅ 12 passed |
| `npm test -- bottom-panel-explainability` | ✅ 14 passed |
| `npm test -- triage-test` | ✅ 1 passed |
| `npm test -- bottom-panel` | ✅ 13 passed |
| `npm test -- execute-panel` | ✅ 22 passed |
| **Total Sprint 27 tests** | **✅ 62 passed** |

### Build / runtime checks

- `npm run build` — passes
- Triage model regression — passes (300 steps, 37 served, servers cycle busy/idle correctly)

## Scenario Impact Assessment

### Improved workflow classes

- **Waiting entity diagnosis**: Click entity → Inspector shows waiting age, queue, waiting reason
- **Event provenance**: Expand log entry → see why B/C event fired, what it changed, what it scheduled
- **Arbitration explanation**: Expand log entry → see candidates, winner, losers, idle servers
- **C-event evaluation**: Expand log entry → see condition true/false, pass number, priority, skip reason
- **Cross-surface navigation**: Move between canvas, log, entities, and inspector without losing context

### Still limited or unsupported after Sprint 27

- Per-entity timeline replay (Sprint 28 candidate)
- Condition variable value capture at eval time (Sprint 28 candidate)
- FEL composition at every clock tick (deferred — expensive)
- Trace persistence across replication batches (policy: in-memory only)

## Regressions, Risks, and Follow-Ups

- **Trace volume**: Long runs generate significant trace data. Policy: in-memory only, not persisted. Monitor for memory pressure on very long runs.
- **Pre-existing test failures**: 24 failures in 11 test files unrelated to Sprint 27 (sweep-2d button label change, DashboardView async rendering). These are Sprint 28 cleanup items.

## Final Assessment

Sprint 27 is **complete**. All eight work items (F27.1–F27.8) delivered. The engine emits structured trace data for every phase, the UI provides entity inspection and trace detail surfaces, cross-surface navigation is coherent, and 26 new tests confirm determinism and correctness. The triage model regression gate passes.
