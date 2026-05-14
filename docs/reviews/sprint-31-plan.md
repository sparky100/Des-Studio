# Sprint 31 — Expressiveness & Observability

**Status:** ✅ Complete | **Started:** 2026-05-14 | **Completed:** 2026-05-14

## Goal

Close the highest-frequency gaps that limit real model expressiveness and add live observability during execution. All changes are additive — no existing engine contracts are modified.

## Features

| Feature | Gap # | Priority | Approach | Effort |
|---------|-------|----------|----------|--------|
| **Clock token in Condition Builder UI** | G05 | Low | Add `clock` to `buildConditionTokens()` output in `src/engine/conditions.js`. Engine already supports `clock` at runtime (`evalCondition` line 189) — one-line UI fix. | Trivial |
| **WIP time-average metric** | G11 | Med | Track cumulative `∫ WIP dt` in engine step loop; expose `avgWIP` in `getSummary()`. Little's Law statistic: time-average number of entities in system. | Low |
| **Live queue-depth time-plot** | G15 | Med | New chart panel in Execute bottom panel using existing `_timeSeries[]` data. Line chart per queue showing depth vs simulation time. Reuses chart infrastructure from ResultsWorkspace. | Medium |

## Implementation Details

### G05 — Clock Token in Condition Builder UI

**File:** `src/engine/conditions.js` — `buildConditionTokens()`

Add a `clock` token to the returned array:

```javascript
tokens.push({ label: "clock  — current simulation time", value: "clock", valueType: "number" });
```

The engine already substitutes `clock` at runtime (`evalCondition` line 189). No engine changes needed.

**Tests:** 1 UI test confirming `clock` appears in token list.

### G11 — WIP Time-Average Metric

**File:** `src/engine/index.js`

- Add `_wipIntegral = 0` and `_lastWipSnapTime = 0` to engine state.
- In `step()`, after Phase C stabilises, compute current WIP count (non-server entities with status !== "done" and !== "reneged"), multiply by `clock - _lastWipSnapTime`, add to `_wipIntegral`, update `_lastWipSnapTime`.
- In `getSummary()`, compute `avgWIP = _wipIntegral / clock` (guard for `clock === 0`).
- Expose in summary object.

**Tests:**
- M/M/1 model: verify `avgWIP` ≈ `avgWait * arrivalRate` (Little's Law) within 5%.
- Empty model: `avgWIP` = 0.
- Warm-up: WIP integral resets at warm-up boundary.

### G15 — Live Queue-Depth Time-Plot

**Files:** `src/ui/execute/BottomPanel.jsx` (new chart tab or panel)

- Reuse existing `_timeSeries[]` data collected when `collectTimeSeries = true`.
- Render a line chart: x-axis = simulation time, y-axis = queue depth.
- One line per queue, colour-coded.
- Toggle in bottom panel alongside existing charts.

**Tests:**
- Chart renders without crashing on a completed run with time-series data.
- Chart shows correct number of lines matching queue count.
- Empty model: chart shows empty state.

## Exit Gate

- All 3 features tested with fixed seeds.
- No regressions in existing 1000+ test suite.
- `npm test -- --run` passes.
- `npm run build` passes.

## Sprint History Update

Add to AGENTS.md §20:

| Sprint | Status | Completed | Description |
|--------|--------|-----------|-------------|
| Sprint 31 | ✅ Complete | 2026-05-14 | Expressiveness & Observability: clock token in UI, WIP time-average metric, live queue-depth time-plot |
