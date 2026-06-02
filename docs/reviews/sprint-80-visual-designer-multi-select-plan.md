# Sprint 80 — Visual Designer Multi-Select, Bulk Move, and Bulk Delete

**Sprint:** 80
**Theme:** Make Visual Designer editing faster by supporting multi-node selection with mouse and touch
**Status:** Planned
**Owner:** parkinsonsj@gmail.com

---

## Goal

Enable modellers to select multiple Visual Designer nodes, move them as a group, and delete them safely. The feature must work for both mouse and touch users without relying on keyboard-only modifier keys.

This sprint extends the existing Visual Designer interaction model. It does not change simulation semantics: all edits still mutate canonical `model_json` elements and then re-derive the visual graph.

---

## Problem

The Visual Designer currently supports a single selected node:

```text
selectedNodeId
onNodeClick -> set selected node
onNodeDragStop -> persist one node position
Delete key -> delete one canonical node
```

This makes larger diagrams tedious to rearrange or clean up. Mouse users expect shift/control multi-select and box selection. Touch users need a mode that does not depend on keyboard modifiers.

---

## Scope Guardrails

- No Supabase migrations
- No new dependencies
- No model execution changes
- No direct mutation of derived `model.graph.edges`
- Bulk delete must delete canonical model elements, not only visual nodes
- Touch support must be first-class, not an afterthought
- Existing single-node inspector behaviour must remain usable
- Existing drag-to-connect and palette drag/drop must remain functional

---

## Architecture

### Current

```text
VisualDesignerPanel
  selectedNodeId: string | null
  deleteVisualNode(model, node)
  updateGraphLayout(model, graph, { nodes: [{ id, x, y }] })

FlowDiagramReactFlow
  receives selectedNodeId
  marks one flow node selected
  emits onNodeSelect(id)
  emits onNodeMove(id, position)
```

### Target

```text
VisualDesignerPanel
  selectedNodeIds: Set<string>
  primarySelectedNodeId: string | null
  selectionMode: "pan" | "select"

FlowDiagramReactFlow
  receives selectedNodeIds
  emits onNodeSelectionChange(ids)
  emits onNodeToggleSelect(id)
  emits onNodesMove([{ id, x, y }])

graph-operations.js
  deleteVisualNodes(model, nodes)
  updateGraphLayout(model, graph, { nodes: [...] })
```

The primary selected node drives the inspector. When more than one node is selected, the selection toolbar shows the summary and bulk actions; the inspector remains single-node only.

---

## Feature Scope

| ID | Feature | Deliverable |
|---|---|---|
| F80.1 | Selection state model | Replace single-only state with `selectedNodeIds` plus `primarySelectedNodeId` compatibility helpers |
| F80.2 | Mouse multi-select | Shift/Ctrl click toggles nodes; React Flow box selection feeds selected IDs |
| F80.3 | Touch select mode | Add `Pan / Select` segmented control; in Select mode, tap toggles node selection |
| F80.4 | Selection toolbar | Show `N selected`, `Delete`, and `Clear selection` above the canvas |
| F80.5 | Group move persistence | Moving a selected group persists all moved node positions in one `updateGraphLayout` call |
| F80.6 | Bulk delete helper | Add `deleteVisualNodes(model, nodes)` with canonical cascade behaviour |
| F80.7 | Bulk delete confirmation | Reuse dependency-dialog pattern, summarising all affected B-events, C-events, queues, and routing references |
| F80.8 | Tests | Unit and UI tests for mouse selection, touch mode, group move, and bulk delete |

---

## Interaction Design

### Mouse

- Click a node: select one node and open inspector
- Shift/Ctrl-click a node: toggle it in the selection
- Drag a selection box: select all nodes inside the box
- Drag one selected node: move the selected group together
- Press Delete: delete selected node(s), with dependency confirmation when needed

### Touch

Touch users need an explicit mode because pan and selection gestures conflict.

```text
Canvas mode: [ Pan ] [ Select ]
```

- Pan mode: current navigation behaviour
- Select mode: tap nodes to toggle selection
- Select mode: drag selected node to move selected group
- Toolbar buttons handle delete and clear selection

### Inspector

| Selection | Inspector behaviour |
|---|---|
| 0 nodes | Hidden |
| 1 node | Existing inspector |
| 2+ nodes | Multi-selection summary: type counts, Delete, Clear selection |

---

## Canonical Delete Rules

Bulk delete must compose existing single-node deletion semantics safely.

Implementation approach:

1. Convert selected visual node IDs to derived graph nodes
2. Collect dependents for all selected nodes with `findNodeDependents`
3. Show one confirmation dialog if any dependent exists or if more than one node is selected
4. Apply deletion against canonical model elements
5. Re-derive graph with `deriveGraphFromModel`
6. Clear selection

Important: deleting several nodes cannot rely on stale node references after the first delete. The helper should repeatedly re-derive the graph and resolve remaining selected IDs, or compute a canonical delete set first.

---

## Acceptance Criteria

- [ ] Mouse users can select multiple nodes with Shift/Ctrl-click
- [ ] Mouse users can box-select multiple nodes where supported by React Flow
- [ ] Touch users can toggle Select mode and tap multiple nodes into selection
- [ ] Selected nodes have a clear visual selected state
- [ ] A toolbar displays the selected count
- [ ] Dragging a selected node moves the selected group and persists all positions
- [ ] Delete key deletes all selected nodes after confirmation
- [ ] Delete toolbar button works without keyboard
- [ ] Bulk delete shows dependent C-events/B-events/routing references before destructive changes
- [ ] Single-node selection and inspector behaviour still work
- [ ] Palette drag/drop and node connection handles still work
- [ ] Existing Visual Designer tests remain green
- [ ] New bulk-selection tests pass

---

## Test Plan

### Unit tests

`tests/ui/visual-designer/graph-operations.test.js`

- `deleteVisualNodes` deletes multiple canonical nodes
- Deleting queue + activity removes owned C-events and B-events correctly
- Deleting selected nodes does not leave stale queue references
- Bulk deletion is stable when selected nodes are already removed by a prior cascade

### UI tests

`tests/ui/visual-designer/visual-designer-panel.test.jsx`

- Shift/Ctrl-click toggles multiple selected nodes
- Select mode tap toggles selection without keyboard modifiers
- Selection toolbar displays `2 selected`
- Clear selection hides toolbar
- Group move persists all selected node coordinates
- Bulk delete button calls canonical delete and clears selection

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| React Flow selection APIs vary by version | Medium | Use version-supported callbacks; keep app-level tap-toggle fallback |
| Touch gestures conflict with pan/zoom | High | Add explicit Pan/Select mode |
| Bulk delete cascades remove nodes in unexpected order | High | Implement canonical delete helper with re-derived graph resolution |
| Inspector becomes confusing for multi-selection | Medium | Show summary only for 2+ nodes; keep detailed inspector for one node |
| Selection state drifts after model changes | Medium | Filter selected IDs against the latest derived graph on every graph update |

---

## Out of Scope

- Lasso-select custom geometry beyond React Flow defaults
- Grouping nodes into reusable compound components
- Copy/paste selected nodes
- Pattern application to multiple selected nodes
- Collaborative multi-user selection
- Persisting selection across sessions

---

## Future Follow-On

Once multi-select is stable, the Visual Designer can support:

- Apply a pattern to selected nodes
- Copy/paste a selected sub-flow
- Save selected sub-flow as a reusable pattern
- Align/distribute selected nodes
- Auto-layout selected region only
