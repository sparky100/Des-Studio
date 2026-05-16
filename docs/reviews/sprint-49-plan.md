# Sprint 49 — UX Quick Wins & Interaction Polish
**Sprint:** 49 — UX Quick Wins & Interaction Polish
**Branch:** sprint-49
**Date:** 2026-05-16

## Objective
Implement all high-impact, low-effort UX improvements from the review. No new components are introduced — these are targeted fixes to existing interactions that reduce friction, prevent data loss, and improve discoverability for everyday modelling workflows.

## Background
The UI/UX review identified ten UX findings. Seven of them require minimal code change but deliver disproportionate user benefit. The most critical: there is no Ctrl+S shortcut despite the application having undo/redo (Ctrl+Z/Shift+Z). Every power user will attempt Ctrl+S and be confused when nothing happens.

The "Discard changes" button sits at equal visual weight to the "Save" button in the unsaved-changes banner — a single misclick wipes work. The starter guide fires as a blocking modal with no way to reopen it after dismissal. Tab error badges show counts ("B-Events ×2") but no detail on hover. The AI apply-and-rerun flow has no loading feedback. The GoalsEditor requires users to type internal metric key paths (`summary.avgWait`) from memory.

All seven items in this sprint can be delivered independently with no shared state or new infrastructure.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S49.1 | Add `Ctrl+S` / `Cmd+S` keyboard shortcut for save to ModelDetail.jsx existing `keydown` handler; call `onSave(model)` and prevent default browser save dialog | `src/ui/ModelDetail.jsx` |
| S49.2 | Add two-step confirmation to "Discard changes" button: first click transitions button to danger state ("Are you sure?"); second click executes discard; clicking away resets to original state | `src/ui/ModelDetail.jsx` |
| S49.3 | Convert starter guide from blocking modal to a dismissible inline card in the Overview tab; card auto-hides once model has ≥1 entity type OR has been run at least once; add "Show getting started guide" link to re-open; persist dismissed state in localStorage | `src/ui/ModelDetail.jsx` |
| S49.4 | Add `title` attribute to tab validation error badges listing the first 2 error messages; format: "Error: [msg1] | Error: [msg2]"; source from the existing `issues` array | `src/ui/ModelDetail.jsx` |
| S49.5 | Show a "Verifying…" progress indicator in the BeforeAfterTable area of AiAssistantPanel during `verifyStatus === "running"`; use a pulsing row with muted text rather than a spinner | `src/ui/execute/AiAssistantPanel.jsx` |
| S49.6 | Add optional `action` prop to the `Empty` component: `{ label: string, onClick: fn }`; renders a ghost Btn below the message when provided; update model library empty state and History tab empty state to pass appropriate CTAs | `src/ui/shared/components.jsx`, `src/ui/ModelDetail.jsx`, `src/App.jsx` |
| S49.7 | Replace GoalsEditor free-text metric input with a `<select>` dropdown; options derived from `GOAL_STAT_KEY` with human-readable labels: "Average wait time", "Average service time", "Average sojourn time", "Customers served", "Customers reneged", "Total cost"; value is still the internal key (e.g. `summary.avgWait`) | `src/ui/editors/GoalsEditor.jsx` |

## Acceptance Criteria
- Pressing Ctrl+S (or Cmd+S on Mac) in the model editor triggers a save; the browser save dialog does not appear
- Clicking "Discard changes" once changes the button label and style to a danger confirmation state; a second click within the same interaction discards; clicking elsewhere cancels and resets the button
- Empty models show an inline getting-started card (not modal) in the Overview tab; card is not shown once the model has entity types or a run history; a link allows the card to be re-shown; dismissed state survives page reload
- Hovering a tab error badge (e.g. "B-Events ×2") shows a tooltip with the first two error messages
- Clicking "Apply & Re-run" in AiAssistantPanel immediately shows a "Verifying…" state in the results area; the area updates to the before/after table once the run completes
- The `Empty` component accepts an `action` prop and renders a CTA button; model library empty state and History empty state both use it
- GoalsEditor metric field is a `<select>` with human-readable options; existing saved models with previously typed metric values load and display correctly (backward compatibility via value matching)
- All existing tests pass; new tests cover: Ctrl+S invokes save callback, discard confirmation two-step, GoalsEditor renders dropdown with correct options

## Dependencies
- Sprint 47 should be complete (accessibility fixes) before shipping this sprint, as the new inline card and CTA button must have correct focus behaviour
- Sprint 48 token system is recommended but not strictly required — this sprint can proceed in parallel if needed
- GOAL_STAT_KEY must be importable from `src/llm/prompts.js` or extracted to a shared constants file accessible by GoalsEditor
