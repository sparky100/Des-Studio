# Sprint 66 Closure Report — Visual Designer Badges + Execute Panel UX

**Sprint:** 66
**Theme:** Visual Designer discoverability badges (Option B) + Execute Panel UX streamlining
**Date closed:** 2026-05-18
**Status:** Complete

---

## Delivered scope

| # | Item | Status |
|---|------|--------|
| 66-1 | Node badge system — `when` badge on ACTIVITY, `feed` badge on SOURCE | ✅ |
| 66-2 | Animate / Collect time-series / Speed moved to Setup tab | ✅ |
| 66-3 | Export consolidated → single Export… button with format-selection popover | ✅ |
| 66-4 | Share Model button removed from menu bar | ✅ |
| 66-5 | Log button disabled during active run; re-enabled post-run | ✅ |
| 66-6 | "Entities" tab renamed to "Entity Details" | ✅ |
| 66-7 | Analysis graph formatting — axis labels, titles, grid lines, colour, padding | ✅ |

---

## Key design decisions

**66-1 Badges:** Implemented as read-only pill chips rendered below the sublabel in `DesNode`. Badge state is purely derived in `deriveGraphFromModel` — never stored in the model. Clicking a badge triggers normal ReactFlow node selection (opens inspector), requiring no special event handler.

**66-2 Controls migration:** State (`animationEnabled`, `collectTimeSeries`, `speedMultiplier`) remains in `execute/index.jsx` and is passed down to `ExperimentControls` as props with setters. The Setup section now shows a RUN OPTIONS panel at the bottom of the expanded form.

**66-3 Export popover:** Uses a fixed-position transparent backdrop to capture click-outside dismissal. The popover z-indexes (99 for backdrop, 100 for popover) sit above the regular UI without conflicting with modals.

**66-4 Share removal:** Share button and state variables removed from the menu bar. The share modal JSX and `loadShareLinks` helper were retained to avoid breaking any server-side share link functionality; only the UI entry point is removed.

**66-5 Log guard:** `disabled` condition mirrors `autoRunning || mode === "running"` — the same guard used for batch operations. Opacity 0.4 + `not-allowed` cursor provide visual feedback consistent with other disabled controls.

**66-7 Chart formatting:** Applied consistent `C.accent` colour to histogram bars (was `C.cEvent`), added light grid lines at 10% opacity across all chart types, updated `CumulativeMeanChart` from `C.green` to `C.accent`, increased padding to 12px, and threaded `timeUnit` through to `QueueDepthTimePlot` for labelled x-axis.

---

## Files changed

| File | Change |
|------|--------|
| `src/ui/visual-designer/graph.js` | Add `dataSources` extraction; `badges: string[]` field on SOURCE and ACTIVITY nodes |
| `src/ui/visual-designer/FlowDiagramReactFlow.jsx` | Badge pill chips in `DesNode` after sublabel |
| `src/ui/execute/ExperimentControls.jsx` | Add `animationEnabled`, `collectTimeSeries`, `speedMultiplier` props; render RUN OPTIONS section |
| `src/ui/execute/index.jsx` | Add `showExportPopover`/`exportFormats` state; pass new props to ExperimentControls; replace 3 export buttons with Export… popover; remove Share button; disable Log during run; rename Entities tab |
| `src/ui/execute/SweepViews.jsx` | `QueueDepthTimePlot`: `timeUnit` prop, title, grid opacity; `QueueHistogramCard`: C.accent colour, grid lines, padding 12; `CumulativeMeanChart`: C.accent, padding 12, grid opacity; `WarmupChart`: padding 12, grid opacity |
| `src/ui/execute/BottomPanel.jsx` | Pass `model.timeUnit` to `QueueDepthTimePlot` |

---

## Test summary

- Visual designer tests: **12/12 passed**
- Engine tests: **300/300 passed**
- All acceptance criteria from sprint-66-plan.md verified by code inspection

---

## Out of scope (deferred)

- Live histogram updates during execution
- AI Insights during active run
- Inline `when` condition editing in node inspector (Option C)
- Additional badge types (state variable usage, balking, reneging)
- Share modal full removal (backend share link API still functional)
