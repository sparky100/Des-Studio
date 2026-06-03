# Sprint 53 — Closure Report
**Sprint:** 53 — God Component Decomposition
**Branch:** sprint-47a
**Date:** 2026-05-16
**Status:** Delivered ✓

---

## Delivered Scope

| ID | Item | Status | Notes |
|----|------|--------|-------|
| S53.1 | Extract `AuthShell` from App.jsx | ✓ Done | All auth state (email, password, mode, errors, showAuth, showResetSent, newPassword, newPasswordConfirm) moved to `AuthShell.jsx`; App.jsx retains only `isRecoverySession` |
| S53.2 | Extract `ModelHistoryTab` from ModelDetail.jsx | ✓ Done | ~220 lines of history tab JSX extracted; tab-local state (historySearch, historySelected, historyEditLabelId, historyEditLabelVal) moved inside component; export/archive functions moved in |
| S53.3 | Remove history-specific callbacks from ModelDetail | ✓ Done | `exportRunHistoryJson`, `exportRunHistoryCsv`, `exportSelectedCsv`, `archiveSelected` removed from ModelDetail; now defined inside `ModelHistoryTab` |
| S53.4 | Remove stale `setSaveStatus` calls from ModelDetail | ✓ Done | 4 orphaned `setSaveStatus(null)` calls removed (state was removed in Sprint 50 but calls remained) |
| S53.5 | Clean db import in ModelDetail | ✓ Done | `updateRunLabel`, `updateRunTags`, `archiveRun`, `unarchiveRun`, `deleteSimulationRun` removed from ModelDetail's db import; only `fetchRunHistory`, `listShareLinks` remain |

---

## Files Changed

| File | Change |
|------|--------|
| `src/ui/AuthShell.jsx` | New — self-contained auth forms; owns all auth state and supabase calls |
| `src/ui/ModelHistoryTab.jsx` | New — run history tab extracted from ModelDetail; owns historySearch, historySelected, label-edit state, export/archive functions |
| `src/ui/ModelDetail.jsx` | Removed 220-line history tab JSX; removed 5 functions; removed 4 state vars; replaced with `<ModelHistoryTab>` render; cleaned orphaned `setSaveStatus` calls |
| `src/App.jsx` | Removed 8 auth state vars, 3 auth callbacks, inline auth JSX; replaced with `<AuthShell>` |

---

## Acceptance Criteria Outcomes

| Criterion | Outcome |
|-----------|---------|
| App.jsx no longer contains auth form state or JSX | ✓ |
| ModelDetail.jsx history tab rendered via dedicated component | ✓ |
| History tab UI behaviour identical (search, bulk select, archive, export, label edit, tags, reshare) | ✓ |
| Build passes with no new errors | ✓ — `npx vite build --mode development` clean |
| Auth recovery flow still functional via `isRecoverySession` prop | ✓ |

---

## Architecture Notes

**AuthShell boundary**: `AuthShell` is fully self-contained — it imports `supabase` directly and manages all auth state. App.jsx only passes `isRecoverySession` (a boolean derived from the `PASSWORD_RECOVERY` auth event) and an `onRecoveryComplete` callback to clear it.

**ModelHistoryTab state split**: Shared fetch-level state (`historyRows`, `historyLoading`, `historyError`, `historyShowArchived`, `shareLinksMap`) stays in ModelDetail because `handleRunSaved` and the results-tab fetch effect both depend on it. Tab-local UI state (search text, row selection, label editing) moved fully into `ModelHistoryTab`.

**Duplicate utilities**: `buildRunHistoryCsv` and `buildRunHistoryExportPayload` remain in ModelDetail for their named exports (used in tests); ModelHistoryTab has its own copies. A future refactor could extract these to `src/ui/shared/runHistoryUtils.js` but that was out of scope here.

---

## Next Sprint

Sprint 54 — (see `docs/simmodlr_Build_Plan.md` for upcoming sprints)
