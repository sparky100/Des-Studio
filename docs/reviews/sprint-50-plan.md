# Sprint 50 — Feedback, Loading States & Notifications
**Sprint:** 50 — Feedback, Loading States & Notifications
**Branch:** sprint-50
**Date:** 2026-05-16

## Objective
Introduce a proper system-state communication layer. Replace "Loading…" text with skeleton screens, replace inline save banners with toast notifications, add bulk operations to the run history table, add search and filter to the log viewer, and add a keyboard shortcuts overlay. Collectively these changes raise the perceived quality of the application to match its functional depth.

## Background
The UI/UX review identified a consistent pattern: the application is functionally capable but communicates its state poorly. Lazy-loaded components show bare "Loading…" text. Save success, export complete, and rate-limit events all produce inline banners that push page content and require manual dismissal. Long-running patch-and-rerun operations (Sprint 46) give no progress indication beyond a button state change.

The run history table — used heavily by teams running parametric sweeps — has no bulk operations. Archiving or exporting a dozen related runs requires twelve sequential button clicks. The log viewer, which can contain thousands of entries, has no search or filter at all; finding why a specific entity reneged requires manual scrolling. Neither issue requires engine changes — both are pure UI improvements on already-available data.

The keyboard shortcuts overlay completes the discoverability improvement begun in Sprint 49 (Ctrl+S) and is a direct companion to the existing but undiscovered shortcuts (Ctrl+Z, Shift+Z).

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S50.1 | Create `ToastContext.jsx`: lightweight React context + portal rendering toasts bottom-right; supports `info`, `success`, `error`, `warning` variants; auto-dismiss after 4 seconds; max 3 visible at once; accessible with `role="status"` and `aria-live="polite"` | `src/ui/shared/ToastContext.jsx` |
| S50.2 | Wire `useToast()` into App.jsx: provide `<ToastProvider>` at root level | `src/App.jsx` |
| S50.3 | Replace inline "Saved ✓" / "Saving…" / "Save failed" banner in ModelDetail.jsx with toast calls; remove the inline banner JSX and its `saveStatus` rendering logic | `src/ui/ModelDetail.jsx` |
| S50.4 | Wire toasts for: export complete (JSON/CSV exports in BottomPanel), AI rate limit reached (AiAssistantPanel error state), CSV import complete (CsvImportModal) | `src/ui/execute/BottomPanel.jsx`, `src/ui/execute/AiAssistantPanel.jsx`, `src/ui/CsvImportModal.jsx` |
| S50.5 | Create `SkeletonPanel.jsx`: renders 3–5 horizontal placeholder bars using `C.border` colour with a CSS `@keyframes` pulse animation; accepts `rows` and `height` props | `src/ui/shared/SkeletonPanel.jsx` |
| S50.6 | Replace `<Suspense fallback={<div>Loading…</div>}>` with `<Suspense fallback={<SkeletonPanel rows={4} />}>` for ExecutePanel and VisualDesignerPanel lazy imports in ModelDetail.jsx | `src/ui/ModelDetail.jsx` |
| S50.7 | Add checkbox column to run history table in ModelDetail.jsx; when ≥1 run is selected show a bulk-action bar above the table with "Archive selected (N)" and "Export selected as CSV" actions; use existing per-row archive and export logic looped over selected IDs | `src/ui/ModelDetail.jsx` |
| S50.8 | Add text search input to LogViewer.jsx that filters log entries by entity name, event type, or message substring (case-insensitive); filtering is client-side on the rendered log array | `src/ui/execute/LogViewer.jsx` |
| S50.9 | Add Phase filter toggle buttons to LogViewer.jsx: "All" / "A" / "B" / "C"; filter is combined with text search (AND logic) | `src/ui/execute/LogViewer.jsx` |
| S50.10 | Create `KeyboardShortcutsModal.jsx`: small modal listing all registered shortcuts (Ctrl+Z, Shift+Z, Ctrl+S, ?); register `?` as a global keydown listener in App.jsx to open the modal; Escape closes it; `role="dialog"` with `aria-labelledby` | `src/ui/shared/KeyboardShortcutsModal.jsx`, `src/App.jsx` |

## Acceptance Criteria
- Save success, save failure, export complete, AI rate limit, and CSV import complete events all produce a toast; no inline save banner exists in ModelDetail.jsx
- Toasts appear bottom-right, auto-dismiss after 4 seconds, stack vertically when multiple are present, and have correct colour per variant
- Lazy-loaded panels (Execute, Visual Designer) show animated skeleton bars instead of "Loading…" text
- Skeleton animation uses a fade/pulse effect and does not cause layout shift when the real component loads
- Run history table has a checkbox column; selecting runs shows a bulk action bar; "Archive selected" archives all selected; "Export selected as CSV" downloads a single CSV with all selected runs' KPIs
- LogViewer text search filters the rendered entries in real time; Phase toggle further filters; "All" toggle clears the phase filter
- Pressing `?` anywhere in the application opens the keyboard shortcuts overlay; Escape closes it; the overlay lists Ctrl+Z, Shift+Z, Ctrl+S, ?
- All existing tests pass; new tests cover: ToastContext renders and auto-dismisses, LogViewer filters by text and phase, bulk selection enables the action bar

## Dependencies
- Sprint 49 must be complete: Ctrl+S shortcut must exist before it can be listed in the keyboard shortcuts overlay
- Sprint 47 accessibility work must be complete: the new modal and toast components must have correct ARIA attributes from the start
- No engine changes required
