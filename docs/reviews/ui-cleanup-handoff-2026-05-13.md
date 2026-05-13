# UI Cleanup Handoff — 2026-05-13

## Purpose

This note records the UI cleanup work completed so far, the issues still open, and the most sensible next slice so the work can be resumed cleanly.

## Completed

### Model editing and rename behaviour

- Name edits for queues, entities, and events no longer commit on every keystroke.
- Rename changes propagate through dependent model references instead of silently breaking conditions or routing.
- Unsaved-change noise was reduced around editor switching and routine rename flows.

### Navigation and information architecture

- The top-level workflow was simplified to:
  - `Overview`
  - `Design`
  - `Execute`
  - `Analysis`
  - `Access`
- AI authoring was moved under `Design`.
- `Validate` was renamed to `Model Health`.
- `Results` was renamed to `Analysis`.
- `Export Model` was moved out of the global header and into `Access`.

### New-model and getting-started flow

- The starter modal now presents clearer creation paths.
- Template-based starting is surfaced directly when creating a model.
- The prominent starter action now points to the design path instead of the old form-first framing.

### Design workspace cleanup

- The redundant right-hand guide rail was removed to give the canvas and editors more room.
- Repeated validation chrome was reduced.
- The main health summary is no longer repeated across every editor surface.
- Visual Designer no longer auto-fits on open; viewport position is preserved unless the user explicitly presses `Fit` or navigates from validation.

### AI Designer cleanup

- Technical phrasing was reduced.
- Proposal wording was tightened.
- Diff wording was softened from engine-style language to more user-facing copy.
- `State Variables` was softened to `Model Data` in proposal presentation.

### Execute workspace cleanup

- `Experiments` was renamed to `Studies`.
- `Run Setup` was renamed to `Scenario Setup`.
- The setup area was compacted modestly.
- Lower-panel collapse/maximise behaviour was added to make logs, entities, KPIs, and charts easier to inspect.

### Visual and copy polish

- Overview text boxes use a friendlier font treatment.
- Several labels were simplified to reduce unnecessary technical wording.

### Correctness fixes discovered during UI work

- Hidden stale routing placeholders from imported models no longer trigger impossible validation errors.
- Blank routing placeholder rows are ignored by validation and runtime execution, preventing unintended routing to exit.

## Remaining

### High-value UI follow-up

- Further compact the top of the `Execute` screen; it still uses more vertical space than necessary.
- Refine the readiness treatment so `Model Health` reads more like a simple traffic-light summary and less like a validation console.
- Finish the plain-English terminology pass across remaining labels, helper text, and warnings.
- Simplify the design sub-navigation further if testing confirms users do not need multiple parallel entry points.

### Interaction polish

- Review the Visual Designer for remaining resize/refresh distractions during editing and selection changes.
- Review bottom-panel presentation for KPI and chart views, especially horizontal dead space and resizing behaviour.
- Clarify undo/redo affordances and user expectations.

### Content and wording

- Rename any remaining technical labels such as engine-facing warning text where a modeller-facing phrase would be clearer.
- Revisit warning copy that sounds like validation when it is actually a runtime execution warning.

### Product decisions still open

- Whether `Model Structure` should be removed entirely from Overview.
- Whether additional create-model paths should be reduced further.
- Whether `Analysis` and run-history placement should be adjusted again after more user testing.

## Suggested next slice

1. Compact the `Execute` header and setup controls into a denser layout.
2. Finish the traffic-light `Model Health` summary and hide detailed validation panels unless issues exist.
3. Run one final terminology sweep across design, execute, and analysis surfaces.
4. Re-test Visual Designer editing stability after the auto-fit removal.

## Notes

- This handoff documents UI cleanup only. It does not replace the Sprint 26 simulation-engine plan and closure documents.
- There is unrelated Sprint 26 engine and documentation work in progress in the working tree; keep UI follow-up scoped so it does not trample those changes.
