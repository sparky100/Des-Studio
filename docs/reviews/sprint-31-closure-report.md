# Sprint 31 — Closure Report

Created: 2026-05-14  
Status: ✅ Complete  
Plan reference: `docs/reviews/sprint-31-plan.md`

## Sprint Summary

Sprint 31 added three quick-win features to improve model expressiveness and live observability during execution. All changes are additive — no existing engine contracts were modified.

## Goal

Close the highest-frequency gaps that limit real model expressiveness and add live observability during execution. All changes are additive — no existing engine contracts are modified.

## Delivery Status

| Work item | Status | Notes |
|---|---|---|
| G05 — Clock token in Condition Builder UI | ✅ Complete | Added `clock` token to `buildConditionTokens()` in `conditions.js:241` |
| G11 — WIP time-average metric | ✅ Complete | `_wipIntegral` tracking in engine step loop; `avgWIP` exposed in `getSummary()` |
| G15 — Live queue-depth time-plot | ✅ Complete | `QueueDepthTimePlot` component in `SweepViews.jsx`; "Charts" tab added to BottomPanel |

## Delivered Scope

### G05 — Clock token in Condition Builder UI
- **File:** `src/engine/conditions.js:241`
- Added `clock` token to `buildConditionTokens()` output
- Engine already supports `clock` at runtime (`evalCondition` line 189) — no engine changes needed
- Modellers can now write conditions like `clock > 100` to trigger time-based logic

### G11 — WIP time-average metric
- **File:** `src/engine/index.js`
- Added `_wipIntegral` and `_lastWipSnapTime` tracking variables (line 214-215)
- WIP integral computed in `step()` after Phase C stabilises (line 461-466)
- `avgWIP = _wipIntegral / clock` exposed in `getSummary()` (line 630)
- Warm-up reset: `_wipIntegral` and `_lastWipSnapTime` reset at warm-up boundary (line 315-316)
- Little's Law validation: `avgWIP ≈ λ × avgSojourn` within 15% for M/M/1 models

### G15 — Live queue-depth time-plot
- **Files:** `src/ui/execute/SweepViews.jsx`, `src/ui/execute/BottomPanel.jsx`, `src/ui/execute/index.jsx`
- `QueueDepthTimePlot` SVG chart component in `SweepViews.jsx`
- "Charts" tab added to BottomPanel (between Entities and Live Metrics)
- Chart shows one line per queue, colour-coded, with legend
- Reuses existing `_timeSeries[]` data collected when `collectTimeSeries = true`
- Empty state shown when no time-series data or fewer than 2 points

## Deferred or Removed Scope

None — all planned Sprint 31 items delivered.

## Architectural Decisions and Issues

| Issue | Outcome | Notes |
|---|---|---|
| WIP integral computation timing | Computed after Phase C stabilises in `step()` | Consistent with time-series snapshot timing |
| Charts tab placement | Added as 3rd tab in BottomPanel | Between Entities and Live Metrics for logical flow |
| Queue colour coding | Uses existing token colours with fallback palette | Supports up to 8 queues with distinct colours |

## Verification

### Focused test runs

| Test suite | Result |
|---|---|
| `npm test -- conditions` | ✅ 30 passed (includes 2 new clock token tests) |
| `npm test -- sprint-31-wip` | ✅ 5 passed (WIP metric tests) |
| `npm test -- bottom-panel` | ✅ 59 passed (includes 3 new Charts tab tests) |
| **Total Sprint 31 tests** | **✅ 94 passed** |

### Build / runtime checks

- `npm run build` — passes
- Full test suite: 1007/1010 passing (3 pre-existing failures unrelated to Sprint 31)

## Scenario Impact Assessment

### Improved workflow classes

- **Time-based conditions**: Modellers can now use `clock` in C-event conditions (e.g., `clock > 100 AND queue(Queue).length > 0`)
- **Little's Law validation**: `avgWIP` metric enables modellers to verify model consistency against Little's Law
- **Live queue monitoring**: Charts tab provides real-time queue depth visualization during execution

### Still limited or unsupported after Sprint 31

- Per-entity timeline replay (Sprint 32+ candidate)
- Condition variable value capture at eval time (Sprint 32+ candidate)
- Resource preemption / breakdowns (Sprint 32 planned)
- Entity splitting / co-seize (Sprint 32 planned)

## Regressions, Risks, and Follow-Ups

- **Pre-existing test failures**: 3 failures in `execute-panel.test.jsx` and `visual-designer-panel.test.jsx` — unrelated to Sprint 31 changes
- **Trace volume**: WIP integral adds minimal overhead (single counter per step)
- **Chart memory**: Queue-depth chart reuses existing `_timeSeries[]` data — no additional memory cost

## Final Assessment

Sprint 31 is **complete**. All three work items (G05, G11, G15) delivered. The clock token is now available in the Condition Builder UI, the WIP time-average metric is exposed in engine summaries, and a live queue-depth time-plot chart is available in the Execute panel's new Charts tab. 94 tests confirm correctness with no regressions.
