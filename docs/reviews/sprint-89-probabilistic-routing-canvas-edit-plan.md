# Sprint 89 — Visual Designer: Inline Probabilistic-Branch Editing

**Sprint:** 89
**Theme:** Close the last canvas-only routing gap by letting probabilistic-routing branch probabilities be edited directly on the Visual Designer edge, without round-tripping to the B-Events editor
**Status:** ✅ Complete
**Owner:** parkinsonsj@gmail.com

---

## Goal

Probabilistic routing (`bEvent.probabilisticRouting[]`) was already **displayed** on the canvas as a `%`-suffixed edge label (Finding 3 of the Visual Designer Inspector review, `docs/reviews/visual-designer-inspector-review.md`), but it was read-only — changing a split required leaving the canvas for the Forms/Tabs B-Events editor. This sprint makes the label itself editable: selecting a probabilistic-routing edge swaps its label for an inline number input that writes the change straight back into canonical `model_json`.

This sprint also formalizes node duplication and clipboard copy/paste, which had already been implemented on this branch ahead of this plan being written (see `Out of Scope` note below on why it's documented here rather than in a separate sprint).

---

## Problem

The Visual Designer derives one labeled edge per probabilistic branch (`graph.js`, `deriveGraphFromModel`), but the edge carried only a precomputed display string:

```text
edges.push({ ..., label: "70%" })
```

There was no way to recover which `bEvent`/branch index/raw probability produced that label, so there was nothing to bind an editor to. A model author who wanted to rebalance a 70/30 split between two destination queues had to switch off the canvas entirely.

Separately, the canvas had no duplication or clipboard support — every repeated structure had to be built by hand or via the fixed `VISUAL_PATTERNS` library (Finding 4 of the same review).

---

## Scope Guardrails

- No Supabase migrations
- No new dependencies
- No model execution / engine changes
- No change to `probabilisticRouting`'s on-disk shape (`{ probability, queueName }`) — only how it's reached from the canvas
- The canvas does not enforce branches summing to 1, matching `BEventEditor`'s own non-blocking total display
- Connections are never duplicated when cloning nodes — duplicates land disconnected, same as a freshly added node

---

## Architecture

### Edge derivation (`graph.js`)

Each probabilistic-routing edge now also carries the fields needed to write back to the exact branch it represents, without re-parsing the `"NN%"` label:

```text
edges.push({
  ..., label: "70%",
  bEventId: bEvent.id,
  branchIndex: branchIdx,
  probability: branch.probability ?? 0,
})
```

This applies to all four derivation sites for probabilistic routing: RELEASE-driven branches and default/dispatch-policy branches, each for both the "next queue" and "exit to sink" cases.

### Canonical update (`graph-operations.js`)

```text
updateProbabilisticBranchProbability(model, edge, probability)
  -> clamps probability to [0, 1]
  -> finds bEvents[bEventId].probabilisticRouting[branchIndex]
  -> replaces only that branch's `probability` field
  -> updateGraphLayout(next, deriveGraphFromModel(next))
```

If the edge has no `bEventId`/`branchIndex` (i.e. it isn't a probabilistic-routing edge), the model is returned unchanged.

### Canvas editor (`FlowDiagramReactFlow.jsx`)

`DesEdge` already renders a `%`-suffixed label via `EdgeLabelRenderer`. When the edge is `selected` and `data.onEditProbability` is present, the label is replaced with a small bordered `<input type="number">` + `%` suffix in the same position:

- Draft value initializes from `data.probability` and re-syncs whenever the edge becomes selected or its underlying probability changes (covers undo/redo and external edits).
- `Enter` or blur commits; `Escape` reverts the draft and blurs without committing.
- Non-probabilistic edges, or edges when `canEdit` is false, keep the existing read-only label.

`VisualDesignerPanel.jsx` wires an `editProbability(edge, probability)` handler through to `onEditProbability`, calling `updateProbabilisticBranchProbability` and applying the result through the normal `applyModel` commit path (so it participates in undo/redo like any other canvas edit).

### Duplication and clipboard

```text
duplicateVisualNodes(model, nodes, offset)   // graph-operations.js
copySelectedNodes / pasteFromClipboard / duplicateSelectedNodes   // VisualDesignerPanel.jsx
```

Cloning a Source or Activity node also clones its referenced bEvent/cEvent independently — the copy gets its own schedule / own completion event, not a shared reference to the original's. Synthetic route-exit sink nodes are skipped (they have no canonical backing element to clone). Keyboard shortcuts: `Ctrl+D` duplicates in place with a fixed offset; `Ctrl+C`/`Ctrl+V` copy to an in-memory clipboard and paste at a cursor-relative position.

---

## Feature Scope

| ID | Feature | Deliverable |
|---|---|---|
| F89.1 | Probabilistic edge metadata | `deriveGraphFromModel` attaches `bEventId`/`branchIndex`/`probability` to every probabilistic-routing edge |
| F89.2 | Canonical branch update | `updateProbabilisticBranchProbability(model, edge, probability)` in `graph-operations.js`, clamped to `[0, 1]` |
| F89.3 | Inline canvas editor | Selecting a probabilistic edge shows an editable `%` input in place of the static label; commits on blur/Enter, cancels on Escape |
| F89.4 | Wiring | `VisualDesignerPanel` → `FlowDiagramReactFlow` `onEditProbability` prop, gated on `canEdit` |
| F89.5 | Node duplication | `duplicateVisualNodes(model, nodes, offset)`; independent bEvent/cEvent clones for Source/Activity |
| F89.6 | Clipboard copy/paste | `Ctrl+C`/`Ctrl+V`/`Ctrl+D` shortcuts scoped to the Visual Designer canvas |
| F89.7 | Tests | Unit tests for edge derivation and `updateProbabilisticBranchProbability`; UI tests for the inline `%` editor's selected/unselected/read-only states |

---

## Acceptance Criteria

- [x] A probabilistic-routing branch's edge shows its probability as a static `%` label when unselected
- [x] Selecting that edge shows an editable number input pre-filled with the current percentage
- [x] Typing a new value and blurring (or pressing Enter) commits the change to `model_json` via the normal undo-tracked commit path
- [x] Pressing Escape reverts the draft without committing
- [x] The input is clamped to `[0, 100]`% (stored as `[0, 1]`) and never shown when `canEdit` is false
- [x] Editing one branch does not affect sibling branches or the routing target
- [x] `Ctrl+D` duplicates the current selection in place; `Ctrl+C`/`Ctrl+V` copy and paste elsewhere on the canvas
- [x] Duplicated Source/Activity nodes get independent schedule/completion events, not shared references
- [x] Existing Visual Designer tests remain green
- [x] New tests for both features pass

---

## Test Plan

### Unit tests

`src/ui/visual-designer/__tests__/graph-operations.test.js`

- Each probabilistic branch edge carries `bEventId`/`branchIndex`/`probability` and the correct `NN%` label
- A branch with `queueName: null` (exit) derives an edge to a synthetic sink with the right label
- `updateProbabilisticBranchProbability` updates only the targeted branch, leaving siblings untouched
- `updateProbabilisticBranchProbability` clamps probability to `[0, 1]`
- `updateProbabilisticBranchProbability` returns the model unchanged for a non-probabilistic edge

### UI tests

`tests/ui/visual-designer/flow-diagram-react-flow.test.jsx`

- Unselected probabilistic edge shows the static `%` text, not an input
- Selected probabilistic edge shows a number input pre-filled with the percentage
- Blurring the input after a change calls `onEditProbability` with the edge and the probability as a `0–1` fraction
- The input never renders when `canEdit` is false, even if the edge is selected

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Branch probabilities don't sum to 1 after editing | Low | Matches existing `BEventEditor` behaviour — non-blocking, not enforced anywhere in the engine either |
| Edge `bEventId`/`branchIndex` go stale after a structural model edit | Low | Edge metadata is re-derived from canonical `model_json` on every `deriveGraphFromModel` call, never cached independently |
| Inline input conflicts with edge delete button at the same screen position | Low | Delete button renders below the label/input with a fixed `yOffset`; verified visually during implementation |

---

## Out of Scope

- Editing conditional-routing (`bEvent.routing[]`) conditions from the canvas — conditions are free-form predicates, not a single scalar like probability
- Auto-normalizing sibling branch probabilities to sum to 1
- Adding or removing probabilistic branches from the canvas (still requires the B-Events editor)
- Align/distribute tools, error-badge detail beyond the tooltip already shipped in the prior sprint
- The 12-macro long tail (`UNBATCH`, `MATCH`, `FAIL`, etc.) that has no visual representation — documented as a known gap in `docs/reviews/visual-designer-inspector-review.md`, Finding 3

---

## Future Follow-On

- Allow adding/removing probabilistic branches directly from the canvas (would need an edge-adjacent "+ branch" affordance)
- Visual indicator (e.g. a colored ring) when a bEvent's branches don't sum to 1, surfaced on the canvas instead of only in the B-Events editor
- Align/distribute helpers for multi-selected nodes (tracked separately, not part of this sprint)
