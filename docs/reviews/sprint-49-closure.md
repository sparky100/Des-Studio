# Sprint 49 — Closure Report
**Sprint:** 49 — UX Quick Wins & Interaction Polish
**Branch:** sprint-46
**Date:** 2026-05-16
**Status:** Delivered ✓

---

## Delivered Scope

| ID | Item | Status | Notes |
|----|------|--------|-------|
| S49.1 | Ctrl+S / Cmd+S save shortcut | ✓ Done | Added to existing keydown handler in ModelDetail.jsx using a ref to keep the handler current without re-registering; prevents browser save dialog |
| S49.2 | Two-step discard confirmation | ✓ Done | `discardConfirm` boolean state; first click shows "Confirm discard" + "Cancel" buttons; second click executes; clicking Cancel resets |
| S49.3 | Starter guide → dismissible inline card | ✓ Done | Modal removed; inline card in Overview tab; auto-hides when ≥1 entity type or ≥1 completed run; dismissed state persisted in localStorage keyed by modelId; "Show getting started guide" button re-opens |
| S49.4 | Tab badge tooltips | ✓ Done | `tabIssueTooltip(tabId)` computes first 2 error/warning messages; `title` attribute on badge spans |
| S49.5 | "Verifying…" progress indicator | ✓ Done | Shown when `running` is true in SuggestionCard; italic muted text in a bordered container matching the before/after table style |
| S49.6 | `Empty` component `action` prop | ✓ Done | `action: { label, onClick }` renders a ghost Btn below message; GoalsEditor empty state uses it |
| S49.7 | GoalsEditor metric dropdown | ✓ Done | `<select>` with human-readable labels; values are full `summary.X` keys matching `buildGoalGaps`; `METRIC_LEGACY` map handles existing saved models with short keys |

---

## Files Changed

| File | Change |
|------|--------|
| `src/ui/ModelDetail.jsx` | S49.1: Ctrl+S via `_ur` ref; S49.2: `discardConfirm` state + two-step banner; S49.3: localStorage-backed `starterGuideDismissed`, inline Overview card replaces modal; S49.4: `tabIssueTooltip` + badge `title` attrs |
| `src/ui/execute/AiAssistantPanel.jsx` | S49.5: "Verifying…" indicator during `running` state |
| `src/ui/shared/components.jsx` | S49.6: `action` prop added to `Empty` component |
| `src/ui/editors/GoalsEditor.jsx` | S49.7: Full rewrite — METRICS with `summary.X` keys, `METRIC_LEGACY` backward compat, `<select>` dropdown, `alpha()` from tokens |

---

## Acceptance Criteria Outcomes

| Criterion | Outcome |
|-----------|---------|
| Ctrl+S triggers save; browser dialog suppressed | ✓ |
| Discard requires two-click confirmation | ✓ |
| Starter guide is inline card, not modal; auto-hides; persists dismissal | ✓ |
| Tab badge hover shows first 2 error messages | ✓ |
| "Verifying…" shown while apply-and-rerun is in progress | ✓ |
| `Empty` renders CTA button when `action` prop supplied | ✓ |
| GoalsEditor uses dropdown; old short-key models load correctly | ✓ |

---

## Implementation Notes

**S49.1 (Ctrl+S):** The keyboard handler was already registered once using a ref pattern (`_ur.current`). Adding `save` to the same ref avoids the need to re-register the listener when the save callback changes.

**S49.3 (Starter guide):** The old modal blocked the entire UI on every new model open. The inline card sits above the Name field in the Overview tab and uses the accent colour at low opacity to catch attention without dominating. `starterGuideAutoHidden` is a derived boolean — no extra state needed. The localStorage key is `des_starter_${modelId}` so dismissal is per-model.

**S49.7 (GoalsEditor):** The mismatch between GoalsEditor's old short keys (`avgWait`) and `buildGoalGaps`'s expected full keys (`summary.avgWait`) would have silently broken AI goal gap analysis for any saved model. The `METRIC_LEGACY` map normalises on read so existing data is never mutated.

---

## Next Sprint

Sprint 50 — Notifications, Toast System & Skeleton Loading (see `docs/reviews/sprint-50-plan.md`)
