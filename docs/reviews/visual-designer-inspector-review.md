# Visual Designer ("Draw UI") Review — Weaknesses, Gaps & Improvement Areas

## Context

The user asked for a review of the Visual Designer ("draw UI") canvas in simmodlr, with a specific follow-up to check whether **data entry in the node Inspector panel works effectively**. This is an analysis task — the output is a prioritized findings report. Findings below are based on direct reading of the source (not guesswork), with file:line references so each can be turned into a fix independently.

Scope reviewed: `src/ui/visual-designer/{FlowDiagramReactFlow,VisualDesignerPanel,VisualNodeInspector,SectionPanelNode,graph,graph-operations}.{jsx,js}`, the shared `Field`/`CommitInput` primitives in `src/ui/shared/components.jsx`, the undo/redo stack in `src/ui/ModelDetail.jsx`, and the parallel manual editors (`QueueEditor.jsx` etc.) used as the "ground truth" for engine capability parity.

---

## Finding 1 (Critical) — Inspector data entry does not use the app's commit pattern, and silently breaks undo + numeric validation

This is the answer to "does data entry in the inspector work effectively?" — **no, it has three compounding bugs**, all traced to one root cause:

- Every other editor in the app (`QueueEditor.jsx`, `BEventEditor.jsx`, `CEventEditor.jsx`, `EntityTypeEditor.jsx`, `AttrEditor.jsx`, `SectionEditor.jsx`, and even `VisualDesignerPanel.jsx` itself for entity-type renaming) uses **`CommitInput`** (`src/ui/shared/components.jsx:152`) — a draft-state input that only commits on blur/Enter, with Escape-to-cancel.
- `VisualNodeInspector.jsx` is the one outlier: it imports the raw, uncommitted `Field`/`SelectField` (`src/ui/visual-designer/VisualNodeInspector.jsx:3`), which fire `onChange` on **every keystroke** straight into `onPatchNode` → `updateVisualNode` → `applyModel` → `setWholeModel` (`VisualDesignerPanel.jsx:525-531`, `ModelDetail.jsx:578-580`).

Consequences, each independently verified:

1. **Undo history gets consumed character-by-character.** `setWholeModel` pushes the prior model onto a 20-entry undo stack on every call (`ModelDetail.jsx:579`: `setPast(p=>[...p.slice(-19),model])`). Typing a 10-character name in the inspector creates 10 undo-stack entries. The documented `Ctrl+Z` shortcut (`KeyboardShortcutsModal.jsx:8`) becomes useless for anything beyond the last keystroke or two — a single rename can evict the entire undo history of prior canvas edits (node adds/deletes/moves).
2. **The "Max queue length" field silently drops its numeric type.** `VisualNodeInspector.jsx:141-146` passes `type="number"` to `Field`, but `Field`'s signature (`components.jsx:137`) doesn't destructure or forward a `type` prop at all — it always renders a plain text `<input>`. Users can type non-numeric garbage into queue capacity with zero client-side feedback; it free-trips into `model_json` and only fails later at validation/run time.
3. **Full graph re-derivation runs on every keystroke.** `updateVisualNode` always ends in `updateGraphLayout(next, deriveGraphFromModel(next))` — so typing a name re-derives the entire DAG from canonical model on each character. Fine for small models, a real responsiveness risk as model size grows (this mirrors the `execute/index.jsx` perf concerns already flagged in `docs/archived/code-quality-plan.md`).

**Fix:** switch `VisualNodeInspector.jsx`'s text/number fields (`name`, `priority`, `capacity`) to `CommitInput`, matching the pattern already used everywhere else. This is a contained, low-risk change to one file and directly removes all three symptoms at once. `SelectField` (dropdowns) is fine as-is — discrete selection doesn't have a "typing" problem.

---

## Finding 2 (High) — Visual inspector exposes fewer queue-discipline options than the manual editor (capability-parity violation)

AGENTS.md states a "UI-Capability Parity Rule: every engine feature must be exposed in all relevant editors." The engine implements 5 queue disciplines (`docs/addition1_entity_model.md`): `FIFO, LIFO, PRIORITY, SPT, EDD, PRIORITY(attrName)`. `QueueEditor.jsx:174-179` exposes all of them, including a custom-attribute priority picker (`disciplineBase`/`disciplineAttr` helpers, `QueueEditor.jsx:8-15`).

`VisualNodeInspector.jsx:136-140` only offers `FIFO / LIFO / Priority` — no `SPT`, no `EDD`, no custom priority attribute. A model author who only ever uses the Visual Designer cannot reach 2 of 5 engine-supported disciplines, and will silently lose a custom priority attribute if they touch the discipline dropdown while editing a node visually (it isn't represented at all, so there's nothing forcing them to notice it's missing — but it also isn't destroyed unless they explicitly change discipline).

**Fix:** reuse `disciplineBase`/`disciplineAttr` from `QueueEditor.jsx` (or extract them to a shared helper) and mirror the same 5-option `<select>` + conditional attribute input in `VisualNodeInspector.jsx`.

**Scope note (per user feedback):** the Inspector is intentionally a *common-fields* quick-edit surface, not a goal to reach full parity with every manual editor. Queue discipline qualifies for inclusion because it's a core, frequently-touched field on every queue node — but this is not a license to keep expanding the Inspector toward exhaustive parity. Finding 3 (the long tail of 12 rarely-visual macros) stays an explicitly out-of-scope, documented gap rather than something to chase into the Inspector.

---

## Finding 3 (Medium) — Action vocabulary is only partially representable on the canvas

The graph model (`graph.js`/`graph-operations.js`) only natively understands 4 node types (Source/Queue/Activity/Sink) and a handful of macros: `ARRIVE, COMPLETE, RELEASE, RENEGE, ASSIGN, DELAY, BATCH, COST`. Of the engine's 19 macros (`docs/addition1_entity_model.md`), the following have **no visual representation or editing path** and must be authored in the Forms/Tabs editors instead: `UNBATCH, RENEGE_OLDEST, COSEIZE, MATCH, PREEMPT, FILL, DRAIN, SET, SET_ATTR, FAIL, REPAIR, SPLIT`. The Inspector even says so explicitly for shift schedules: *"Manage shift periods in the Forms/Tabs Entity Types editor"* (`VisualNodeInspector.jsx:221`).

This isn't necessarily wrong (some of these are inherently multi-resource/tabular and don't map to a single DAG node), but it means the Visual Designer is a **partial** authoring surface — any model using these macros will show as a node with a generic/empty inspector and the user has to leave the canvas. Probabilistic branch routing (`probabilisticRouting`, referenced in `graph-operations.js:698`, and rendered as `%`-suffixed edge labels in `FlowDiagramReactFlow.jsx:260`) is **displayed** on edges but has **no inspector control to create or edit the probability split** from the canvas at all — it's read-only on the diagram.

**Fix (lower priority / larger effort):** out of scope for a quick pass; worth a dedicated sprint if multi-branch/probabilistic routing editing is wanted in the canvas. Flagging as a known gap.

---

## Finding 4 (Medium) — No copy/paste, duplicate, or align/distribute tools; error badges are detail-free

- No node duplication or clipboard — every repeated structure (e.g. two similar service stages) must be built by hand or via the fixed `VISUAL_PATTERNS` library (`graph-operations.js:25-35`), which only covers 9 canned shapes.
- No align/distribute helpers despite `snapToGrid` being on (`FlowDiagramReactFlow.jsx:565-566`) — multi-select exists (shift/ctrl/box-drag) but there's nothing to do with a multi-selection besides bulk-delete.
- The error badge on a node (`FlowDiagramReactFlow.jsx:63-83`) is just a red "!" circle with no `title`/tooltip text — the actual validation message (from `validateVisualGraph`, `graph-operations.js:723-760`) is only visible by switching to the separate Validate tab. A hover tooltip showing `issue.message` would be a small, high-value fix.

---

## Finding 5 (Low/Architectural) — Canvas rendering is duplicated between design-time and run-time, and has zero component tests

- `FlowDiagramReactFlow.jsx` (Visual Designer) and the Execute tab's live canvas (`ExecuteCanvas.jsx`, separate Source/Queue/Activity/Sink components) are two independent implementations of "draw a DES node," confirmed by the Build Plan (Sprint 9C entry). They've already diverged once (Sprint 77 gave the designer Dagre layout; nothing indicates Execute got the same). Any future visual change (new node type, new badge) has to be made twice and kept in sync by hand.
- Per AGENTS.md, UI tests should exist in jsdom + `@testing-library/react`, but `src/ui/visual-designer/__tests__/` only covers `graph.js` / `graph-operations.js` (pure data functions) — there is no rendering/interaction test for `FlowDiagramReactFlow` or `VisualNodeInspector`. The Finding-1 bug (dropped `type="number"`) is exactly the class of regression a basic RTL render test would have caught.
- Consistent with `docs/archived/code-quality-plan.md`: ~110 hardcoded hex colours app-wide, some of which are in `visual-designer/` (e.g. the inline `#fef3c710` / `#d9770640` warning box in `VisualNodeInspector.jsx:193`), instead of `tokens.js`.

---

## Recommended Remediation (if the user wants fixes now, not just the report)

Ordered by value/effort:

1. **`VisualNodeInspector.jsx`: swap `Field` → `CommitInput` for `name`, `priority`, `capacity`.** Fixes the undo-stack flooding and the dropped numeric type in one pass. Add a real numeric/integer guard on capacity via `CommitInput`'s `transform` prop.
2. **Expand the queue discipline `SelectField`** to the same 5 options as `QueueEditor.jsx`, reusing/extracting `disciplineBase`/`disciplineAttr`.
3. **Add `title={issue.message}` to the error badge** in `FlowDiagramReactFlow.jsx` so hovering a node's "!" shows the validation reason without leaving the canvas.

Each is a small, isolated diff confined to `src/ui/visual-designer/` and (for #2) `src/ui/editors/QueueEditor.jsx` if helpers are extracted — no schema or engine changes, so the CLAUDE.md schema-contract test requirement doesn't apply.

## Verification

- `npm run test` (Vitest) for existing `graph-operations.test.js` / `graph.test.js` regressions.
- Manually open a model's Visual Designer tab, select a Queue node, type a multi-character rename, then press Ctrl+Z repeatedly — confirm undo restores to before the rename in one or two steps instead of replaying keystrokes.
- Type a non-numeric value into "Max queue length" before/after the fix to confirm input is now constrained.
- Confirm the 5-discipline dropdown matches `QueueEditor.jsx` for the same queue (round-trip: set via canvas, switch to Queues tab, verify same value shown).
