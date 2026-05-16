# Sprint 55a — God Component Decomposition (Completion)
**Sprint:** 55a
**Branch:** sprint-47a
**Date:** 2026-05-16
**Status:** Planned

---

## Objective

Complete the god component decomposition started in Sprint 53. Sprint 53 delivered only 2 of 14 planned extractions (AuthShell, ModelHistoryTab). This sprint extracts the remaining high-value components from ModelDetail.jsx, App.jsx, and execute/index.jsx.

## Confirmed Gap (pre-sprint audit)

All 10 planned component files are absent; no partial work exists to reconcile:

| File | Current lines | Sprint 53 target |
|---|---|---|
| `ModelDetail.jsx` | 1,246 | ≤ 350 |
| `App.jsx` | 800 | ≤ 200 |
| `execute/index.jsx` | 2,474 | ≤ 300 |

---

## Scope

### ModelDetail.jsx — 4 extractions

| ID | Component | File | What moves |
|----|-----------|------|------------|
| S55a.1 | `ModelHealthPanel` | `src/ui/ModelHealthPanel.jsx` | Inline local function (lines 482–612) — model health badge, issue chips, action hints |
| S55a.2 | `ModelDetailHeader` | `src/ui/ModelDetailHeader.jsx` | Top header bar — back button, model name, visibility/version tags, undo/redo buttons, save/discard |
| S55a.3 | `ModelTabBar` | `src/ui/ModelTabBar.jsx` | Mode selector bar + contextual sub-tab bar (including "More ▾" compact dropdown) |
| S55a.4 | `SaveBanner` | `src/ui/SaveBanner.jsx` | Dirty-state yellow banner with Save Changes / Confirm Discard / Cancel actions |

### App.jsx — 2 extractions

| ID | Component | File | What moves |
|----|-----------|------|------------|
| S55a.5 | `AppNavBar` | `src/ui/AppNavBar.jsx` | Top navigation bar — logo, tagline, profile avatar, Settings, Admin, Sign Out |
| S55a.6 | `ModelLibrary` | `src/ui/ModelLibrary.jsx` | Full library view: tab bar (My/Templates/Public/Community), model grids, template browser, domain filter, patterns guide panel, paste-JSON modal, new-model modal trigger, import/error banners |

### execute/index.jsx — 1 extraction

| ID | Component | File | What moves |
|----|-----------|------|------------|
| S55a.7 | `ExperimentControls` | `src/ui/execute/ExperimentControls.jsx` | "Setup" section — scenario setup summary chips, warm-up input + Detect, replications, seed, run label, termination mode/duration/condition, time-series and animation toggles |

---

## Realistic Line-count Targets

The Sprint 53 targets (≤350 / ≤200 / ≤300) are not achievable in a single sprint for `execute/index.jsx` due to its 2,400+ line state machine. Honest targets:

| File | Before | After | Note |
|---|---|---|---|
| `ModelDetail.jsx` | 1,246 | ~850 | 4 components extracted |
| `App.jsx` | 800 | ~430 | 2 components extracted |
| `execute/index.jsx` | 2,474 | ~2,200 | ExperimentControls extracted; deeper decomposition deferred |

---

## Acceptance Criteria

| Criterion | How to verify |
|-----------|--------------|
| All 7 new component files exist | `ls src/ui/{ModelHealthPanel,ModelDetailHeader,ModelTabBar,SaveBanner,AppNavBar,ModelLibrary}.jsx src/ui/execute/ExperimentControls.jsx` |
| ModelDetail, App, execute all import extracted components | Read each file |
| Observable rendered output identical | Build passes; no new console errors |
| Build passes | `npx vite build --mode development` |
| Tests pass | `npm test -- --run` |

---

## Out of Scope

- `UndoRedoProvider` / `useUndoRedo` context — undo state is tightly coupled with `setField`, `setWholeModel`, `applyGeneratedModel`; a safe extraction requires a separate sprint
- Full decomposition of execute/index.jsx state machine — 100+ state variables; would require context or significant architectural change
- `ModelOverviewPane` — overview tab content is tightly coupled with setField and goalsEditor callbacks; deferred
- Any new features or bug fixes
