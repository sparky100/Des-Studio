# Sprint 50 — Closure Report
**Sprint:** 50 — Feedback, Loading States & Notifications
**Branch:** sprint-47a
**Date:** 2026-05-16
**Status:** Delivered ✓

---

## Delivered Scope

| ID | Item | Status | Notes |
|----|------|--------|-------|
| S50.1 | `ToastContext.jsx` — toast system | ✓ Done | React context + portal; 4 variants; auto-dismiss 4 s; max 3 visible; `role="status"` + `aria-live="polite"` |
| S50.2 | `<ToastProvider>` in App.jsx | ✓ Done | Wraps full application at root level |
| S50.3 | Save banner → toasts | ✓ Done | `saveStatus` state and toolbar JSX removed; `save()` and `saveGeneratedModel()` call `toast.success/error()` |
| S50.4 | Export/rate-limit/CSV import toasts | ✓ Done | JSON and CSV history exports fire `toast.success`; AI rate-limit detection fires `toast.warning`; CSV import success fires `toast.success` |
| S50.5 | `SkeletonPanel.jsx` | ✓ Done | Animated placeholder bars; `@keyframes des-pulse`; `rows` and `height` props; staggered delay per bar |
| S50.6 | `Loading Visual Designer…` → SkeletonPanel | ✓ Done | `<Suspense fallback={<SkeletonPanel rows={5} />}>` |
| S50.7 | Bulk run selection in history table | ✓ Done | `historySelected` Set state; select-all checkbox in header; per-row checkbox; bulk action bar with Archive + Export CSV; selected rows highlighted |
| S50.8 | LogViewer text search | ✓ Done | Already implemented from prior sprint — verified present |
| S50.9 | LogViewer phase filter | ✓ Done | Already implemented from prior sprint — verified present |
| S50.10 | `KeyboardShortcutsModal.jsx` + `?` shortcut | ✓ Done | Modal lists 5 shortcuts; `?` keydown registered in App.jsx (ignores input/textarea/select focus); Escape closes |

---

## Files Changed

| File | Change |
|------|--------|
| `src/ui/shared/ToastContext.jsx` | New — toast context, provider, `useToast()` hook, portal rendering |
| `src/ui/shared/SkeletonPanel.jsx` | New — animated skeleton placeholder component |
| `src/ui/shared/KeyboardShortcutsModal.jsx` | New — keyboard shortcuts overlay with `?` trigger |
| `src/App.jsx` | Import ToastProvider/KeyboardShortcutsModal; `showKeyboardShortcuts` state; `?` keydown listener; `<ToastProvider>` wraps return; `KeyboardShortcutsModal` render |
| `src/ui/ModelDetail.jsx` | `useToast` import; `SkeletonPanel` import; removed `saveStatus` state; save functions use toast; export functions fire success toast; Suspense → SkeletonPanel; bulk history selection (checkbox column, bulk action bar) |
| `src/ui/CsvImportModal.jsx` | `useToast` import; CSV apply fires `toast.success` |
| `src/ui/execute/AiAssistantPanel.jsx` | `useToast` import; rate-limit detection in both `onError` handlers fires `toast.warning` |

---

## Acceptance Criteria Outcomes

| Criterion | Outcome |
|-----------|---------|
| Save events produce toast; no inline save banner in ModelDetail | ✓ |
| Toasts appear bottom-right, auto-dismiss, stack, correct colour | ✓ |
| Lazy-loaded panels show animated skeleton bars | ✓ (Visual Designer) |
| Skeleton animation uses pulse effect | ✓ — `@keyframes des-pulse` with staggered delay |
| History table has checkbox column; bulk bar appears on selection | ✓ |
| LogViewer text search works | ✓ — pre-existing |
| LogViewer phase filter works | ✓ — pre-existing |
| `?` opens keyboard shortcuts modal; Escape closes | ✓ |

---

## Implementation Notes

**Toast without Provider:** `useToast()` returns a no-op object when called outside `<ToastProvider>` so tests that render individual components in isolation won't throw.

**Rate limit detection:** The regex `/rate.?limit|429/i` catches "rate limit", "rate-limit", and raw HTTP "429" in error messages from the API client.

**Bulk archive:** Uses `Promise.all` over selected IDs, then updates local state to avoid a full reload. If `historyShowArchived` is off, archived rows are filtered from the list; if on, they are marked but kept visible.

**`?` shortcut:** The listener in App.jsx skips INPUT/TEXTAREA/SELECT targets to avoid interfering when the user is typing. The shortcut toggles the modal (second `?` press closes it).

---

## Next Sprint

Sprint 51 — Distribution Picker Redesign (see `docs/reviews/sprint-51-plan.md`)
