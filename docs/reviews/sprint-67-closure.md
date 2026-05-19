# Sprint 67 Closure Report — Plain-English UX & Results Clarity

**Sprint:** 67
**Theme:** Plain-English presentation, clearer decision-making, and Results workspace layout refinement
**Date closed:** 2026-05-19
**Status:** Closed — plain-English UX and Results clarity changes implemented; verification partially blocked by a pre-existing `xlsx` module-resolution issue outside Sprint 67 scope

---

## Delivered scope

| # | Item | Status | Notes |
|---|------|--------|-------|
| 67-0 | Sprint 67 documentation package and tracking updates | ✅ Complete | Plan, closure template, capability guide, AGENTS tracking, build-plan entry, and product-spec updates completed. |
| 67-0a | Commit and push Sprint 67 documentation updates | ✅ Complete | Verified on `main` at `57b85c0`, matching `origin/main`. |
| 67-1 | Standardize navigation terminology: `Run`, `Results`, `Run History` | ✅ Complete | Applied across `ModelDetail`, `ModelHealthPanel`, `ExecutePanel`, `BottomPanel`, and related navigation surfaces. |
| 67-2 | Rewrite Model Health status copy and issue chips | ✅ Complete | Status badges, consequence text, action buttons, and issue-chip wording now lead in plain English. |
| 67-3 | Rewrite Run setup labels and helper text | ✅ Complete | `ExperimentControls` now uses plain-English labels, clearer summary chips, and helper text for the main decisions. |
| 67-4 | Reorganize Results workspace layout by user question | ✅ Complete | Results now lead with a summary band, then bottleneck charts, then reliability guidance. |
| 67-5 | Rewrite Results reliability / provenance language | ✅ Complete | Reliability, provenance, chart-data affordances, and repeated-run guidance now use plainer wording. |
| 67-6 | Simplify Model Data / Data Sources wording | ✅ Complete | Data-source and simulation-date wording now explains intent before technical format. |
| 67-7 | Rewrite Run History labels and summaries | ✅ Complete | Run history labels now emphasize outcomes and clearer next actions. |
| 67-8 | Refresh editor empty states and help text | ✅ Complete | Targeted editor empty states and help text now explain purpose in plainer language. |
| 67-9 | Add focused UI regression coverage | ⚠️ Blocked | Focused build/test verification reached a pre-existing `xlsx` import-resolution issue in `src/ui/shared/xlsxParser.js`. |

---

## Key design decisions

- Plain-English-first wording was adopted as a formal UI rule in `AGENTS.md`, with technical terminology moved to helper text, tooltips, captions, or advanced sections rather than leading labels.
- The Results workspace now presents summary and confidence before method detail so the page answers “what happened?” and “can I trust it?” before exposing analytical internals.
- Technical terms were retained only as supporting detail where they still help advanced modellers, rather than being removed entirely.
- Verification notes now distinguish between Sprint 67 implementation status and the unrelated `xlsx` dependency issue currently blocking clean build/test confirmation.

---

## Files changed

| File | Change |
|------|--------|
| `src/ui/ModelDetail.jsx` | Standardized `Run` / `Results` / `Run History` naming, simplified Model Data copy, simplified validation issue wording, and refreshed the Results workspace shell text. |
| `src/ui/ModelHealthPanel.jsx` | Rewrote status badges, consequence text, action buttons, and issue chips in plain English. |
| `src/ui/ModelHistoryTab.jsx` | Reworded summary cards, search/export actions, and empty-state guidance. |
| `src/ui/ModelTabBar.jsx` | Updated validation tooltips and compact overflow wording. |
| `src/ui/execute/ExperimentControls.jsx` | Rewrote run-setup labels, helper text, warm-up controls, and option wording. |
| `src/ui/execute/index.jsx` | Updated run summary chips and Results-view label. |
| `src/ui/execute/BottomPanel.jsx` | Renamed action to `Open Results`. |
| `src/ui/results/ResultsWorkspace.jsx` | Added a results summary band, reframed reliability content, rewrote data-preview wording, and reordered the page around user questions. |
| `src/ui/results/resultsViewModel.js` | Reworded chart titles, questions, methods, and source descriptions. |
| `src/ui/editors/BEventEditor.jsx` | Improved empty-state and helper text wording. |
| `src/ui/editors/GoalsEditor.jsx` | Improved empty-state wording. |
| `src/ui/editors/EntityTypeEditor.jsx` | Reframed help text in plain English with technical detail secondary. |
| `src/ui/editors/StateVarEditor.jsx` | Simplified reset-after-warm-up wording. |
| `AGENTS.md` | Updated sprint tracking; added the Plain-English Presentation Rule and the plain-English-first UI requirement. |
| `docs/DES_Studio_Build_Plan.md` | Added Sprint 67 as a planned sprint; added checkpoint note recording the documentation package and baseline regression pass. |
| `docs/DES_Studio_Product_Spec.md` | Added product-level plain-English-first UI requirement and Results presentation ordering requirements. |
| `docs/reviews/sprint-67-plan.md` | Created full Sprint 67 plan with tasks, scope, acceptance criteria, and exit gate. |
| `docs/reviews/sprint-67-closure.md` | Created and then finalized this documentation-pass closure record. |
| `docs/sprint-67-plain-language-ux-guide.md` | Added planned capability guide describing the intended wording and Results-layout changes. |

---

## Test summary

- Full regression baseline before implementation: passed
- Focused build verification after implementation: blocked by unresolved `xlsx` import resolution in `src/ui/shared/xlsxParser.js`
- Focused UI tests after implementation: blocked by the same unresolved `xlsx` import resolution issue
- Browser smoke checks for Sprint 67 implementation: not run in this pass
- Repository state for Sprint 67 implementation: local changes present at time of this closure update

---

## Acceptance criteria review

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| AC-1 | Top-level navigation uses `Run`, `Results`, and `Run History` consistently | ✅ Complete | Applied across model navigation and cross-links. |
| AC-2 | Model Health leads with plain-English consequence text before technical codes | ✅ Complete | Consequence-first copy now leads every health state. |
| AC-3 | Run setup labels and helper text are understandable without specialist terminology | ✅ Complete | Primary labels now describe the user decision in plain English. |
| AC-4 | Results page shows summary before reliability/method detail | ✅ Complete | Summary cards now appear before charts and reliability detail. |
| AC-5 | Reliability section heading is plain-English and includes a clear next-step message | ✅ Complete | Reliability verdict and next-step note now appear ahead of technical detail. |
| AC-6 | Data-source labels explain intent before raw technical format | ✅ Complete | Labels now describe purpose, with format examples demoted to supporting text. |
| AC-7 | Run History labels emphasize outcomes rather than internal terminology | ✅ Complete | Summary and controls now use clearer outcome-based language. |
| AC-8 | Empty states in targeted editors teach the next user action | ✅ Complete | Targeted editors now explain what to add and why. |
| AC-9 | Advanced users can still access underlying technical terms and formats | ✅ Complete | Technical detail remains available in supporting text and examples. |
| AC-10 | Focused UI tests pass for renamed labels and revised layout structure | ⚠️ Blocked | Test collection is currently blocked by the unrelated `xlsx` module-resolution issue. |

---

## Out of scope (deferred)

- New analysis algorithms or statistical methods
- New engine/model-schema capabilities
- Major visual redesign beyond wording, grouping, and progressive disclosure
- New onboarding workflows outside the target surfaces

---

## Follow-on items

- Resolve the unrelated `xlsx` dependency/import issue so build and UI tests can run cleanly again.
- Run focused UI tests and browser smoke checks once the `xlsx` blocker is cleared.
- Update `docs/DES_Studio_User_Guide.md` after the implemented Sprint 67 wording/layout changes are released.
