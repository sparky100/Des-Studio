# Sprint 66 Closure Report — Visual Designer Badges + Execute Panel UX

**Sprint:** 66
**Theme:** Visual Designer discoverability badges (Option B) + Execute Panel UX streamlining
**Date closed:** TBD
**Status:** In progress

---

## Delivered scope

| # | Item | Status |
|---|------|--------|
| 66-1 | Node badge system — `when` badge on ACTIVITY, `feed` badge on SOURCE | ⬜ |
| 66-2 | Animate / Collect time-series / Speed moved to Setup tab | ⬜ |
| 66-3 | Export consolidated → single Export… button with format-selection popover | ⬜ |
| 66-4 | Share Model button removed | ⬜ |
| 66-5 | Log button disabled during active run; re-enabled post-run | ⬜ |
| 66-6 | "Entities" tab renamed to "Entity Details" | ⬜ |
| 66-7 | Analysis graph formatting — axis labels, titles, grid lines, colour, padding | ⬜ |

---

## Key design decisions

*(to be completed at closure)*

---

## Files changed

| File | Change |
|------|--------|
| `src/ui/visual-designer/graph.js` | Add `badges` field to SOURCE and ACTIVITY nodes |
| `src/ui/visual-designer/FlowDiagramReactFlow.jsx` | Badge chip rendering in `DesNode` |
| `src/ui/execute/ExperimentControls.jsx` | Animate, Collect, Speed controls added |
| `src/ui/execute/index.jsx` | Menu restructure, Export popover, Share removal, Log guard, tab rename |
| Analysis chart components | Formatting pass |
| `docs/DES_Studio_Engineering_Spec.md` | v1.9.0 |
| `docs/DES_Studio_User_Guide.md` | v1.7.0 |
| `docs/DES_Studio_Build_Plan.md` | Sprint 66 added |

---

## Test summary

*(to be completed at closure)*

---

## Out of scope (deferred)

- Live histogram updates during execution
- AI Insights during active run
- Inline `when` condition editing in node inspector (Option C)
- Additional badge types (state variable usage, balking, reneging)
