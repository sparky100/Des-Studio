# Sprint 51 — DistPicker Redesign
**Sprint:** 51 — DistPicker Redesign
**Branch:** sprint-51
**Date:** 2026-05-16

## Objective
Redesign the `DistPicker` component from a flat single-select dropdown into a guided two-step selector with inline help text, inline parameter validation, and an optional distribution curve preview. Distribution selection is one of the most consequential decisions a modeller makes — a wrong choice invalidates simulation results — and the current component provides no guidance whatsoever.

## Background
`DistPicker` in `src/ui/shared/components.jsx` (approximately lines 140–280) is the most-touched form control in the application. It appears on every attribute in every entity type editor, on every B-event schedule, and on every C-event service time. It currently presents a flat `<select>` with 8+ distribution types, each of which reveals a different sub-form with different parameter fields. There is no help text, no inline validation, no indication of when each distribution is appropriate, and no visual preview.

A user who doesn't know the difference between Exponential and Lognormal cannot learn from the UI. A user configuring a Triangular distribution must know that min ≤ mode ≤ max from memory. Errors in these parameters are only surfaced at model validation time — often after the user has moved to a different editor section.

The redesign introduces three improvements: (1) family grouping to help users navigate to the right distribution type, (2) contextual help text per distribution and per parameter, and (3) an optional SVG sparkline preview of the distribution shape. The underlying data format is unchanged — this is purely a UX improvement on the picker UI.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S51.1 | Create `src/ui/shared/DistHelp.js`: export `DIST_GROUPS` (three groups: Parametric, Time-varying, From data) and `DIST_HELP` (a map from distribution name to `{ summary, params: { paramName: helpText } }`) | `src/ui/shared/DistHelp.js` |
| S51.2 | Write help text in `DIST_HELP` for all distributions: Fixed ("Constant value. Use when the duration is always the same."), Exponential ("Memoryless inter-arrival or service time. Rate = 1/mean. Use when events occur randomly with no pattern."), Uniform ("Equal probability across a range. Use when any value between min and max is equally likely."), Normal ("Bell-shaped. Use when values cluster around a mean with symmetric variation. Warn: stddev should be < mean/2 to avoid negative samples."), Triangular ("Three-point estimate: most pessimistic, most likely, most optimistic. Use for expert estimates when data is scarce."), Erlang ("Sum of k exponential stages. More regular than Exponential. Use for multi-phase service times."), Lognormal ("Right-skewed. Use when values are always positive and occasionally very large."), Piecewise ("Time-varying rate — different distributions in different time windows."), Schedule ("Planned arrival times from a timetable."), Empirical ("Draw from your own data. Import a CSV column.") | `src/ui/shared/DistHelp.js` |
| S51.3 | Create `src/ui/shared/DistSparkline.jsx`: renders a small SVG (120×40px) showing the approximate PDF shape for each distribution given its current parameters; shapes: Fixed (vertical line at value), Exponential (decay curve), Uniform (rectangle), Normal (bell curve), Triangular (triangle), Erlang (skewed bell), Lognormal (right-skewed bell); Piecewise/Schedule/Empirical show an icon instead of a curve | `src/ui/shared/DistSparkline.jsx` |
| S51.4 | Redesign `DistPicker` in components.jsx: Step 1 is a segmented family button (Parametric / Time-varying / From data); Step 2 is the existing distribution sub-select filtered to the chosen family; add a "?" toggle button that expands an inline help card showing the distribution summary and parameter help text | `src/ui/shared/components.jsx` |
| S51.5 | Add inline parameter validation within DistPicker: on blur of each parameter input, check the constraint for that distribution (e.g. Uniform: max > min; Triangular: min ≤ mode ≤ max; Exponential: mean > 0); show a red inline error message below the invalid field immediately — do not wait for full model validation | `src/ui/shared/components.jsx` |
| S51.6 | Add "Preview" expand button below the parameter form that shows `DistSparkline` for the current distribution and parameters; the sparkline updates reactively as parameters change | `src/ui/shared/components.jsx` |
| S51.7 | Ensure full backward compatibility: the `dist` string and `distParams` object passed up to the parent via `onChange` are identical to the current format; no parent component changes required | `src/ui/shared/components.jsx` |

## Acceptance Criteria
- DistPicker shows three family buttons (Parametric / Time-varying / From data) as a first step; selecting a family filters the distribution sub-select to relevant options only
- A "?" toggle button reveals an inline card with: one-sentence summary of the selected distribution, and help text for each parameter field (e.g. for Exponential mean field: "Mean inter-arrival time. Rate = 1/mean.")
- Entering an invalid parameter combination (e.g. Uniform min > max) shows a red inline error message on blur without needing to trigger full model validation
- A "Preview" button reveals a DistSparkline SVG that updates reactively as parameters change; sparkline renders correctly for Fixed, Exponential, Uniform, Normal, Triangular, Erlang, Lognormal
- All existing dist/distParams data shapes are unchanged — parent components require no updates
- All existing tests pass; new tests cover: family filter narrows options correctly, inline validation fires on blur, DistSparkline renders an SVG element for each distribution type

## Dependencies
- Sprint 48 (design tokens) should be complete so SPACE, RADIUS, and TYPO tokens can be used in the redesigned picker layout
- Sprint 47 (accessibility) must be complete: the help card and preview area must have correct ARIA roles and focus management from the start
- No engine changes required — only the picker UI is changing, not the model data format
