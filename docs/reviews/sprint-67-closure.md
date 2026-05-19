# Sprint 67 Closure Report — Plain-English UX & Results Clarity

**Sprint:** 67
**Theme:** Plain-English presentation, clearer decision-making, and Results workspace layout refinement
**Date closed:** TBD
**Status:** Planned

---

## Delivered scope

| # | Item | Status | Notes |
|---|------|--------|-------|
| 67-1 | Standardize navigation terminology: `Run`, `Results`, `Run History` | ⬜ Pending | |
| 67-2 | Rewrite Model Health status copy and issue chips | ⬜ Pending | |
| 67-3 | Rewrite Run setup labels and helper text | ⬜ Pending | |
| 67-4 | Reorganize Results workspace layout by user question | ⬜ Pending | |
| 67-5 | Rewrite Results reliability / provenance language | ⬜ Pending | |
| 67-6 | Simplify Model Data / Data Sources wording | ⬜ Pending | |
| 67-7 | Rewrite Run History labels and summaries | ⬜ Pending | |
| 67-8 | Refresh editor empty states and help text | ⬜ Pending | |
| 67-9 | Add focused UI regression coverage | ⬜ Pending | |

---

## Key design decisions

To be completed at sprint close.

Suggested topics:
- Plain-English-first wording pattern and where technical terms remain visible
- Results section ordering and why
- How advanced configuration formats are disclosed without dominating the primary UI
- Any naming tradeoffs between simulation accuracy and user comprehension

---

## Files changed

To be completed at sprint close.

| File | Change |
|------|--------|
| `src/ui/ModelDetail.jsx` | |
| `src/ui/ModelTabBar.jsx` | |
| `src/ui/ModelHealthPanel.jsx` | |
| `src/ui/execute/ExperimentControls.jsx` | |
| `src/ui/execute/index.jsx` | |
| `src/ui/results/ResultsWorkspace.jsx` | |
| `src/ui/results/resultsViewModel.js` | |
| `src/ui/ModelHistoryTab.jsx` | |
| `src/ui/editors/*.jsx` | |
| `tests/ui/**/*` | |

---

## Test summary

To be completed at sprint close.

- Focused UI tests: TBD
- Browser smoke checks: TBD
- Build status: TBD

---

## Acceptance criteria review

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| AC-1 | Top-level navigation uses `Run`, `Results`, and `Run History` consistently | ⬜ Pending | |
| AC-2 | Model Health leads with plain-English consequence text before technical codes | ⬜ Pending | |
| AC-3 | Run setup labels and helper text are understandable without specialist terminology | ⬜ Pending | |
| AC-4 | Results page shows summary before reliability/method detail | ⬜ Pending | |
| AC-5 | Reliability section heading is plain-English and includes a clear next-step message | ⬜ Pending | |
| AC-6 | Data-source labels explain intent before raw technical format | ⬜ Pending | |
| AC-7 | Run History labels emphasize outcomes rather than internal terminology | ⬜ Pending | |
| AC-8 | Empty states in targeted editors teach the next user action | ⬜ Pending | |
| AC-9 | Advanced users can still access underlying technical terms and formats | ⬜ Pending | |
| AC-10 | Focused UI tests pass for renamed labels and revised layout structure | ⬜ Pending | |

---

## Out of scope (deferred)

- New analysis algorithms or statistical methods
- New engine/model-schema capabilities
- Major visual redesign beyond wording, grouping, and progressive disclosure
- New onboarding workflows outside the target surfaces

---

## Follow-on items

To be completed at sprint close.
