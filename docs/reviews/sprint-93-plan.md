# Sprint 93 — UX Quick Wins

**Sprint:** 93
**Theme:** Six small, independent, no-design-needed polish items from the 2026-08 UX review (§3.2 of the remediation register): shortcuts discoverability, priority numeric entry, persistent CI detail, tab-label consistency, live regions, reduced motion.
**Status:** ✅ Complete
**Prerequisites:** PR #468 (Sprints 90–92 + ADR-020 Phase 1) — all items below build on that branch's state; file:line references are against it.

Every item was re-verified against the current branch on 2026-08-25 (post-Sprint-91/92 drift); line numbers below are current. Items are independent — any subset can ship.

---

## 93.1 — Keyboard-shortcuts modal: reachable, everywhere, and accurate (UX-1)

**Current state (verified):** `showKeyboardShortcuts` is dead state — `setShowKeyboardShortcuts(true)` is never called anywhere (`src/App.jsx:122`, `:776-778`), and the modal is rendered only in the library branch, so it would be unreachable from the model editor even if wired — which is where every shortcut it documents lives. The `?` key opens the Help Assistant (`App.jsx:274-283`), contradicting the modal's own claim that `?` opens it (`KeyboardShortcutsModal.jsx:15`). The modal's list is also stale: Ctrl+Y (redo alias), Backspace (canvas delete), and arrow-key nudge are bound but unlisted. The Help Assistant's knowledge base has zero entries about shortcuts.

**Change:**
1. Move modal ownership into `AppNavBar.jsx`, copying its existing `feedbackOpen`/`aboutOpen` pattern exactly (`AppNavBar.jsx:43-44`, `:109-118`): add `shortcutsOpen` state and render `KeyboardShortcutsModal` there. `AppNavBar` is rendered in every signed-in branch, which fixes the library-only problem for free.
2. Add a **Keyboard shortcuts** `role="menuitem"` to `HeaderAccountMenu`'s Support tier (after Help, `HeaderAccountMenu.jsx:209-211`) — that menu already has focus trap/restore, so the trigger inherits good a11y.
3. Delete the dead `showKeyboardShortcuts` state and render from `App.jsx`.
4. Correct the modal's content: remove the false `?` claim (replace with "**?** — open Help Assistant", keeping the deliberate Sprint-70 binding as-is); add Ctrl+Y, Delete/Backspace, and arrow-key nudge rows.
5. Add a short "Keyboard shortcuts" entry to `docs/help-knowledge-base.json` so asking the Help Assistant about shortcuts actually works.

**Files:** `src/ui/AppNavBar.jsx`, `src/ui/HeaderAccountMenu.jsx`, `src/App.jsx`, `src/ui/shared/KeyboardShortcutsModal.jsx`, `docs/help-knowledge-base.json`.
**Tests:** new `tests/ui/keyboard-shortcuts-modal.test.jsx` — menu item opens the modal, Esc closes it, and it opens from the model-detail context (render via AppNavBar), plus a content assertion that no listed shortcut contradicts an actual binding.

---

## 93.2 — C-event priority: numeric entry alongside drag (M-4)

**Current state (verified):** the only edit affordance is a `draggable` grip wrapping a non-interactive `P{n}` badge (`CEventEditor.jsx:182-196`) — no `tabIndex`, no input, and the grip is hidden entirely while a filter is active (`:183`), removing the only reordering path. **Key invariant:** array order is the source of truth and `priority` is densely renumbered 1..n on every add/delete/drag (`:34-35`, `:48-51`, `:57-66`). Meanwhile the Visual Designer inspector already offers numeric priority entry (`VisualNodeInspector.jsx:261-267`) — but it patches the field without reordering the array and writes a **string** (transform output), so the two paths disagree today.

**Change:**
1. Add a shared helper `reorderCEventByPriority(events, id, newPriority)` (in `src/ui/editors/helpers.jsx` or `src/model/`): clamp typed value to [1..n], splice the event to that index, renumber densely — identical semantics to drag, so the invariant holds.
2. In `CEventEditor`, replace the static `P{n}` badge with a small `CommitInput` (already imported in this file for the name field, `:198-202`) using a positive-int transform; on commit, call the helper. Keep the drag grip. Numeric entry works while filtered, fixing the `:183` gap as a side effect.
3. Fix `VisualNodeInspector.jsx:266` to route through the same helper (number, reordered) instead of patching a string priority in place.

**Files:** `src/ui/editors/CEventEditor.jsx`, `src/ui/visual-designer/VisualNodeInspector.jsx`, helper location per above.
**Tests:** extend `tests/ui/editors/c-event-editor.test.jsx` (existing priority describe-block at `:12`): typing a new priority reorders and renumbers; clamping; the aria-label assertions at `:97-99` will need updating since the badge becomes an input (accessible name changes — deliberate). Add an inspector test asserting numeric priority commit reorders.

---

## 93.3 — CI reliability detail persistent, not hover-only (M-5)

**Current state (verified):** `CiBadge` shows only `±N%`; the half-width and replication count live solely in a `title` attribute (`ResultsWorkspace.jsx:286`) — unreachable by keyboard and touch. The identical copy-pasted badge exists in `ModelHistoryTab.jsx:485-490`. The data needed (`n`, `halfWidth`, `lower`, `upper`) is already in `results.aggregateStats[metric]` — no plumbing needed — and the persistent-chip visual pattern to imitate is already on the same screen (`ResultsWorkspace.jsx:476-484`, "Batch run · N replications").

**Change:**
1. Extract a single shared `CiBadge` into `src/ui/shared/` that renders the detail persistently — visible `±{relHw}%` plus a small always-visible `±{halfWidth} · n={n}` line (or chip) — keeping the colour banding and adding the 95% interval bounds to the (now supplementary) tooltip.
2. Replace both copies (`ResultsWorkspace.jsx:280-297`+`:494`, `ModelHistoryTab.jsx:485-490`) with the shared component.

**Files:** new `src/ui/shared/CiBadge.jsx`, `src/ui/results/ResultsWorkspace.jsx`, `src/ui/ModelHistoryTab.jsx`.
**Tests:** new `tests/ui/shared/ci-badge.test.jsx` — CI rendering is currently entirely untested (verified); assert visible half-width and n text, banding thresholds, and the null-guard.

---

## 93.4 — One tab-label source of truth (CON-3, scoped)

**Current state (verified):** three independently hard-coded label maps disagree. The tab bar says Draw/Describe (`ModelDetail.jsx:944-945`) while `MODEL_HEALTH_TAB_LABELS` says Design/AI Designer (`ModelDetail.jsx:202-217`), and `ModelTabBar.jsx:126` patches `ai`'s accessible name a third way. The `state` id renders only `DataSourcesEditor` (label "Data Sources" is honest; the id is not), and the `containers` id ("Model Data") is a grab-bag of four unrelated editors: skills, containers, distances, **and state variables** (`ModelDetail.jsx:1425-1490`).

**Change (deliberately scoped to consistency, not IA restructuring):**
1. Extract one `TAB_LABELS` map (single source of truth) consumed by the tab definitions, `MODEL_HEALTH_TAB_LABELS`, and `ModelTabBar`'s aria-label override — eliminating the Draw/Design and Describe/AI-Designer disagreements users currently see between the tab bar and Model Health messages.
2. Do **not** rename tab ids (they flow through deep links and `initialTab` — `App.jsx:609`; breaking saved tab state is not worth a quick win).
3. Do **not** split the "Model Data" grab-bag this sprint — record it as a follow-on item (it is an IA decision: likely StateVarEditor moves out, which deserves its own small design note).

**Files:** `src/ui/ModelDetail.jsx`, `src/ui/ModelTabBar.jsx`.
**Tests:** extend an existing model-health/tab test to assert the tab bar and Model Health panel use the same label for the same tab id.

---

## 93.5 — Live regions for run progress and run-save status (A-3)

**Current state (verified):** the complete `aria-live`/`role="status"` inventory is seven sites; toasts and `SaveBanner` (both variants) are already correct, so the model-save path needs nothing. Missing: the single-run status header (`execute/index.jsx:2849-2852`), the batch progress line ("Running x/y", `:2879-2883` — highest value), the cancellation notice (`:2866-2870`), and the run-save status block (`:2822-2831`). The per-tick progress tiles (`:2853-2865`) and pool/pending line (`:2884-2888`) churn continuously and must be explicitly excluded. There are no progressbar elements anywhere — `role="status"` is the right minimal mechanism.

**Change:** add `role="status"` to the four missing elements (`role="alert"` for the save-error state); add explicit `aria-live="off"` on the high-churn tiles so screen readers aren't spammed. Leave `ModelDetailHeader`'s dirty indicator alone — `SaveBanner` already announces the same state and a second region would double-announce.

**Files:** `src/ui/execute/index.jsx`.
**Tests:** extend `tests/ui/accessibility.test.jsx` — assert the batch progress line and save-status block expose `role="status"`/`alert`, and the tick tiles do not.

---

## 93.6 — `prefers-reduced-motion` (A-5)

**Current state (verified):** zero uses of `prefers-reduced-motion` anywhere in `src/` or `index.html`. Motion surfaces: SMIL token animation (`AnimatedEdge.jsx:36-40` — **CSS media queries cannot affect SMIL**; must be gated in JS), the `NodeDetailSidebar` slide-in (`:367`), and five infinite spinner/pulse animations. The `animationEnabled` toggle defaults to hard-coded `true` (`execute/index.jsx:368`) with a user-settings override whose hydration seam (`:1239-1241`, `!== undefined` guard) is exactly where a system-preference default belongs — mirroring the theme system's existing `matchMedia` precedent (`ThemeContext.jsx:139`, `:169`). **Bypass found:** the new ADR-020 `LivePreviewPanel.jsx:72` hard-codes `animationEnabled`, ignoring both the user toggle and any motion preference.

**Change:**
1. Global CSS rule in `index.html` next to the existing focus-visible rule: under `@media (prefers-reduced-motion: reduce)`, force `animation-duration: 0.01ms; animation-iteration-count: 1; transition-duration: 0.01ms` — this silences all CSS spinners/pulses/slide-ins in one place (opacity fades degrade gracefully to static).
2. SMIL gating: default `animationEnabled` from `matchMedia("(prefers-reduced-motion: reduce)")` (reduce → `false`) at `execute/index.jsx:368`; an explicit user choice in `user_settings.execute.animateTokens` still overrides in either direction via the existing `:1239-1241` seam. Small shared helper (e.g. `prefersReducedMotion()` in `src/ui/shared/hooks.js`) with the same guarded-read shape as `ThemeContext.jsx:139`.
3. Fix the `LivePreviewPanel` bypass: pass `animationEnabled={!prefersReducedMotion()}` instead of hard-coded `true`.

**Files:** `index.html`, `src/ui/shared/hooks.js`, `src/ui/execute/index.jsx`, `src/ui/visual-designer/LivePreviewPanel.jsx`.
**Tests:** unit test for the helper (mock `matchMedia`); assert `ExecutePanel` initialises `animationEnabled` false under a mocked reduce preference and that a stored user setting overrides it.

---

## Out of scope (recorded, not forgotten)

- Splitting the "Model Data" grab-bag tab (IA change — follow-on design note).
- Renaming tab **ids** (deep-link risk).
- Rebinding `?` to the shortcuts modal (the Help Assistant binding is deliberate; the modal is reachable via the account menu instead).
- Modal focus-trap uniformity across the app (A-2) — separate item.

## Verification gate

- Full `npx vitest run` green (CI enforces, sharded); `npm run typecheck`, `npm run lint -- --quiet`, `npm run build` clean.
- New/updated tests listed per item all pass; the c-event-editor aria-label updates are deliberate accessible-name changes, not weakened assertions.
- Manual pass: shortcuts modal opens from the account menu inside a model; typing a priority reorders the C-event list; CI detail readable without a mouse; batch run announces progress with VoiceOver/NVDA-style tooling assumptions (role attributes present); OS reduced-motion setting stops token animation and spinners.
