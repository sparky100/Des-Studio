# Sprint 53 — Component Architecture: God Component Decomposition
**Sprint:** 53 — Component Architecture: God Component Decomposition
**Branch:** sprint-53
**Date:** 2026-05-16

## Objective
Decompose the three "god components" (App.jsx 863 lines, ModelDetail.jsx 1,410 lines, ExecutePanel/index.jsx ~1,200 lines) into focused sub-components with clear responsibilities. Each extracted component receives props for exactly what it needs, has testable behaviour in isolation, and reduces the line count of its parent to an orchestration shell.

## Background
Three files carry a disproportionate share of the application's UI logic. `ModelDetail.jsx` simultaneously manages undo/redo state, tab routing, save/dirty state tracking, inline validation, keyboard shortcuts, responsive layout detection, multiple modal visibility flags, run history display, and access control — all in a single 1,410-line component. New features have been added to it in every sprint from 38 to 46, and the regression risk grows with each addition.

`App.jsx` manages authentication state, model library rendering, template browsing, fork workflows, admin access, and the top navbar. `ExecutePanel/index.jsx` manages experiment configuration controls, sweep parameter selection, run orchestration, batch coordination, and AI assistant panel integration.

The decomposition targets observable-behaviour parity: every extracted component must produce identical rendered output to the current implementation. This is not a visual redesign sprint — it is a structural refactoring sprint. The primary deliverable is reduced cognitive load, faster test cycles, and a foundation from which future features can be added to focused files rather than accumulating in god components.

This sprint must be executed last in the UI improvement series, after Sprint 48 (tokens) and Sprint 52 (useViewport hook) are available as stable shared infrastructure.

## Scope

### ModelDetail.jsx decomposition
| ID | Item | File(s) |
|----|------|---------|
| S53.1 | Extract `<UndoRedoProvider>`: React context exposing `{ canUndo, canRedo, pushState, undo, redo }`; moves the 20-slot undo stack, Ctrl+Z/Shift+Z handler, and all undo-related state out of ModelDetail | `src/ui/UndoRedoProvider.jsx` |
| S53.2 | Extract `<ModelDetailHeader>`: model name display, save state indicator (idle/saving/saved/error), dirty badge, share button, delete button; receives props: `model`, `saveStatus`, `isDirty`, `onSave`, `onDelete`, `onShare` | `src/ui/ModelDetailHeader.jsx` |
| S53.3 | Extract `<ModelTabBar>`: tab navigation with error/warning badge rendering and "More ▾" dropdown (from Sprint 52); receives props: `tabs`, `activeTab`, `issues`, `onTabChange`, `isCompact` | `src/ui/ModelTabBar.jsx` |
| S53.4 | Extract `<ModelSaveManager>`: save/discard banner, unsaved-changes detection, Ctrl+S handler (from Sprint 49), auto-save logic if applicable; renders the banner UI and manages save lifecycle; communicates via onSave/onDiscard callbacks | `src/ui/ModelSaveManager.jsx` |
| S53.5 | Extract `<ModelOverviewPane>`: model description textarea, goals editor, model health summary panel; receives props: `model`, `onChange`, `issues` | `src/ui/ModelOverviewPane.jsx` |
| S53.6 | ModelDetail.jsx becomes an orchestration shell: imports and composes the extracted components; manages routing between tabs; line count target ≤ 350 lines | `src/ui/ModelDetail.jsx` |

### App.jsx decomposition
| ID | Item | File(s) |
|----|------|---------|
| S53.7 | Extract `<AuthShell>`: sign-in form, password recovery form, suspended-account state, error/success messaging; receives props: `authState`, `onSignIn`, `onRecovery`; line count target ~180 lines | `src/ui/AuthShell.jsx` |
| S53.8 | Extract `<AppShell>`: top navigation bar, user avatar, sign-out button, admin link, settings link; receives props: `user`, `onSignOut`, `onAdmin`, `onSettings` | `src/ui/AppShell.jsx` |
| S53.9 | Extract `<ModelLibrary>`: model card grid, tab bar (My Models/Templates/Public/Community), search input, new model modal trigger, fork modal trigger, template browser; receives props: `models`, `templates`, `onSelect`, `onNew`, `onFork`; line count target ~300 lines | `src/ui/ModelLibrary.jsx` |
| S53.10 | App.jsx becomes a state container and router: manages session, auth state, active model selection; composes AuthShell, AppShell, ModelLibrary, ModelDetail; line count target ≤ 200 lines | `src/App.jsx` |

### ExecutePanel/index.jsx decomposition
| ID | Item | File(s) |
|----|------|---------|
| S53.11 | Extract `<ExperimentControls>`: seed input, replications slider/input, warmup period input, max sim time input, termination condition input; receives props: `config`, `onChange` | `src/ui/execute/ExperimentControls.jsx` |
| S53.12 | Extract `<SweepConfig>`: sweep mode toggle (1D/2D), parameter axis selectors, range/step inputs; receives props: `sweepConfig`, `model`, `onChange` | `src/ui/execute/SweepConfig.jsx` |
| S53.13 | Extract `<RunController>`: run/stop/reset button logic, batch replication coordination, progress tracking, run completion callbacks; exposes a clean API to the parent: `{ isRunning, progress, onRun, onStop, onReset }` | `src/ui/execute/RunController.jsx` |
| S53.14 | ExecutePanel/index.jsx becomes an orchestrator: composes ExperimentControls, SweepConfig, RunController, VisualView, BottomPanel, AiAssistantPanel, SweepViews; line count target ≤ 300 lines | `src/ui/execute/index.jsx` |

## Acceptance Criteria
- ModelDetail.jsx is ≤ 350 lines after decomposition
- App.jsx is ≤ 200 lines after decomposition
- ExecutePanel/index.jsx is ≤ 300 lines after decomposition
- Each extracted component has its own file and a corresponding test file
- `<UndoRedoProvider>` exposes a React context; `useUndoRedo()` hook is usable from any child component
- Observable rendered output is identical before and after decomposition on all major flows: model editing, save, undo/redo, run simulation, view results, switch tabs
- All existing tests pass with zero modifications to test logic (import paths may change)
- Each new component file has at least one smoke test confirming it renders without error given valid props

## Dependencies
- Sprint 48 (design tokens): extracted components import SPACE, RADIUS, TYPO from tokens.js
- Sprint 49 (UX quick wins): Ctrl+S and discard confirmation are already in ModelDetail.jsx and must be preserved in ModelSaveManager.jsx extraction
- Sprint 50 (toast notifications): ToastContext must be available at App.jsx level before AppShell or ModelSaveManager can call `useToast()`
- Sprint 52 (responsive hooks): useViewport() and BP constants must exist before ModelTabBar and ExecutePanel are extracted, as both consume them
- This sprint carries the highest regression risk of the series — thorough manual testing of all major flows is required before merge
