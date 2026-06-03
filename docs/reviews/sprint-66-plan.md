# Sprint 66 Plan — Visual Designer Badges + Execute Panel UX

**Sprint:** 66
**Theme:** Visual Designer discoverability badges (Option B) + Execute Panel UX streamlining
**Date planned:** 2026-05-18
**Branch:** `claude/review-sprints-31-33-0R5Mx`

---

## Objectives

1. Make advanced model configuration visible in the Visual Designer without cluttering the canvas (Option B — node badges)
2. Reduce Execute Panel menu clutter by moving run-configuration controls to Setup and consolidating export/share options
3. Improve Analysis page chart readability through consistent formatting

---

## Scope

| # | Item | Area | Files |
|---|------|------|-------|
| 66-1 | Node badge system — ACTIVITY nodes badge when any cSchedule has a `when` condition; SOURCE nodes badge when a scheduleFeed data source targets the B-event | Visual Designer | `graph.js`, `FlowDiagramReactFlow.jsx` |
| 66-2 | Move Animate, Collect time-series, and Speed slider from Execute menu to Setup tab | Execute Panel | `execute/index.jsx`, `execute/ExperimentControls.jsx` |
| 66-3 | Consolidate Export JSON / Export CSV / Export HTML → single **Export…** button with format-selection popover | Execute Panel | `execute/index.jsx` |
| 66-4 | Remove Share Model button and its associated state | Execute Panel | `execute/index.jsx` |
| 66-5 | Disable Log menu button during active run (grayed out, tooltip "Available after run completes"); re-enable post-run | Execute Panel | `execute/index.jsx` |
| 66-6 | Rename "Entities" tab → "Entity Details" throughout Execute Panel | Execute Panel | `execute/index.jsx` |
| 66-7 | Analysis page graph formatting — axis labels with model time units, chart titles, grid lines, consistent accent colour, 12 px chart padding | Execute Panel | analysis chart components |

---

## Detailed design

### 66-1: Node badge system (Option B)

**Philosophy:** The Visual Designer remains a topology tool. Badges are read-only indicators — they signal that additional configuration exists without exposing editing UI on the canvas. Clicking a badge selects the node, opening the node inspector; the inspector already shows the full element config including `when` conditions.

**Badge types:**

| Badge | Trigger condition | Colour | Label |
|-------|-----------------|--------|-------|
| `conditional` | ACTIVITY node whose c-event has at least one cSchedule with a `when` field | Amber (`C.amber`) | `when` |
| `feed` | SOURCE node whose B-event is targeted by a `scheduleFeed` data source (`source.targetBEventId === bEvent.id`) | Cyan (`C.accent`) | `feed` |

**Implementation:**

`deriveGraphFromModel(model)` in `graph.js` — populate a `badges: string[]` field on each node. For ACTIVITY nodes: check `cEvent.cSchedules.some(cs => cs.when)`. For SOURCE nodes: check `(model.dataSources || []).some(ds => ds.type === 'scheduleFeed' && ds.targetBEventId === bEvent.id)`.

`DesNode` in `FlowDiagramReactFlow.jsx` — render badge chips from `data.badges` beneath the node sublabel. Each chip is a small pill with the badge label. Clicking a chip calls `onNodeSelect(node.id)` (same as clicking the node).

No new props, no parent callbacks — the inspector already provides the full config on node selection.

### 66-2: Animate / Collect / Speed → Setup

The Animate toggle, Collect time-series checkbox, and Speed slider control *how* a run executes, not *what happens during* it. Moving them to the Setup tab (`ExperimentControls.jsx`) removes three controls from the run-time menu.

The Setup tab already contains warm-up period, replications, seed, and termination condition. These three controls are a natural fit.

State (`animateRun`, `collectTimeSeries`, `executionSpeed`) remains in `execute/index.jsx`; the values are passed down as props to `ExperimentControls` with `onChange` callbacks.

### 66-3: Export consolidation

Replace three separate Export JSON / Export CSV / Export HTML buttons with:
- A single **Export…** button in the Execute menu
- On click: opens a small inline popover with three checkboxes (JSON selected by default) and a **Download** button
- The popover closes on Download or on click-outside

### 66-4: Remove Share Model

Delete the Share button, `shareUrl` state, `showShareModal` state, and the share modal render. The share URL generation utility can be kept if used elsewhere; only the UI entry point and modal are removed.

### 66-5: Log button disabled during run

`isRunning` is already tracked in state. Guard the Log button:
```jsx
disabled={isRunning}
title={isRunning ? "Log is available after the run completes" : undefined}
style={{ opacity: isRunning ? 0.4 : 1, cursor: isRunning ? 'not-allowed' : 'pointer' }}
```

### 66-6: Entities → Entity Details

All occurrences of the string `"Entities"` used as a tab label in the Execute panel are renamed to `"Entity Details"`. The underlying component (`EntitySummaryTable`) and view state key are unchanged.

### 66-7: Analysis graph formatting

Apply consistent formatting across all chart components in the Analysis view:

- **Axis labels:** x-axis label = model time unit (from `model.timeUnit`, e.g. "Time (minutes)"); y-axis label = metric name
- **Chart titles:** each chart renders a small heading above the chart area
- **Grid lines:** light horizontal grid lines (10% opacity)
- **Colour:** all charts use `C.accent` as the primary bar/line colour (currently inconsistent)
- **Padding:** 12 px padding on all chart container `<div>` elements

---

## Acceptance criteria

| # | Criterion |
|---|-----------|
| AC-1 | An ACTIVITY node with a `when` cSchedule shows an amber "when" badge chip in the canvas card |
| AC-2 | An ACTIVITY node with no `when` cSchedules shows no badge |
| AC-3 | A SOURCE node whose B-event is targeted by a scheduleFeed shows a cyan "feed" badge |
| AC-4 | Clicking a badge chip selects the node (inspector opens) |
| AC-5 | Setup tab shows Animate toggle, Collect time-series checkbox, and Speed slider |
| AC-6 | Execute menu no longer shows Animate, Collect time-series, or Speed controls |
| AC-7 | A single Export… button replaces the three separate export buttons |
| AC-8 | Export… popover shows format checkboxes and a Download button |
| AC-9 | Share Model button is absent from the Execute menu |
| AC-10 | Log button is visually grayed out and non-interactive while a run is in progress |
| AC-11 | Log button becomes active again once the run completes |
| AC-12 | Execute panel tab is labelled "Entity Details" (not "Entities") |
| AC-13 | Analysis charts show axis labels, titles, and grid lines with consistent colour |
| AC-14 | All existing tests pass |

---

## Files to change

| File | Change |
|------|--------|
| `src/ui/visual-designer/graph.js` | Add `badges` field to SOURCE and ACTIVITY nodes in `deriveGraphFromModel` |
| `src/ui/visual-designer/FlowDiagramReactFlow.jsx` | Render badge chips in `DesNode`; badge click calls `onNodeSelect` |
| `src/ui/execute/ExperimentControls.jsx` | Add Animate, Collect time-series, Speed props and renders |
| `src/ui/execute/index.jsx` | Remove Animate/Collect/Speed from menu; add Export… popover; remove Share; disable Log during run; rename Entities tab |
| Analysis chart components | Axis labels, titles, grid lines, colour, padding |
| `docs/simmodlr_Engineering_Spec.md` | v1.9.0 — update §7.3, §7.4, add §2.11 |
| `docs/simmodlr_User_Guide.md` | v1.7.0 — update §8, §7.4 |
| `docs/simmodlr_Build_Plan.md` | Add Sprint 66 |

---

## Out of scope

- Live histogram updates during execution (deferred — requires step-count hook)
- AI Insights during run (deferred — requires partial summary plumbing)
- Inline `when` condition editing in the node inspector (deferred — Option C, later sprint)
- Additional badge types (state variable usage, balking config, etc.)
