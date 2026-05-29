# Sprint 77 — Dagre Layout Engine for Visual Designer

**Sprint:** 77
**Theme:** Replace the hand-rolled BFS grid layout in the Visual Designer with a Sugiyama-framework dagre layout
**Status:** ✅ Complete | **Completed:** 2026-05-29
**Branch:** `claude/des-onboarding-message-Tj9va`
**Owner:** parkinsonsj@gmail.com

---

## Goal

The Visual Designer canvas previously used a simple breadth-first grid: each node was assigned a depth (BFS distance from a source) and stacked vertically within that column using fixed 200 × 112 px spacing. Vertical order within a column was arbitrary — the order BFS discovered the nodes — so edges crossed unnecessarily on any model with parallel branches or merging paths.

Sprint 77 replaces `withLayout()` in `graph.js` with `@dagrejs/dagre`, implementing the full Sugiyama hierarchical layout framework. The result is a compact, crossing-minimised left-to-right layout that scales correctly with graph density.

---

## Scope Guardrails

- Change is confined to `src/ui/visual-designer/graph.js` and its test file
- Persisted manual node positions must continue to be respected (no regression)
- Loop (back) edges excluded from dagre traversal — they are already detected and styled separately
- No changes to the renderer (`FlowDiagramReactFlow.jsx`), model schema, or Supabase tables
- One new npm dependency: `@dagrejs/dagre` — flagged and approved per AGENTS.md §2

---

## Feature Scope

| ID | Feature | Status | Deliverable |
|---|---|---|---|
| F77.1 | Install `@dagrejs/dagre` | ✅ | `package.json` / `package-lock.json` updated |
| F77.2 | Replace `withLayout()` with dagre | ✅ | `src/ui/visual-designer/graph.js` — ~45 lines replaced |
| F77.3 | Exclude loop edges from dagre traversal | ✅ | `edge.loop` guard in dagre edge registration |
| F77.4 | Update compact-layout test | ✅ | Assertion reflects dagre coordinates, intent preserved |
| F77.5 | Focused dagre layout test suite | ✅ | 5 new tests in `graph.test.js` — parallel nodes, LR flow, loop safety, mixed persisted/auto |

---

## Design Decisions

### Why dagre?

`@dagrejs/dagre` implements the Sugiyama framework: layer assignment → crossing minimisation (barycenter) → coordinate assignment (network-simplex). It is the standard choice for ReactFlow projects and has been maintained under the `@dagrejs` organisation since 2023.

Alternatives considered:

| Option | Reason rejected |
|---|---|
| Barycenter column sort (hand-rolled) | Reduces crossings within a rank but does not fix layer assignment or adapt spacing |
| ELK (Eclipse Layout Kernel) | Far more powerful but adds ~800 KB and requires a separate worker thread |
| Force-directed (d3-force) | Non-deterministic; poor fit for acyclic flow diagrams |

### Loop edge handling

Back-edges (rework/recirculation arcs) are already detected in `deriveGraphFromModel` and marked `edge.loop = true`. Feeding them into dagre would trigger its cycle-breaking pass, which reverses their direction and distorts the layout. They are excluded from dagre's edge set; dagre still places both endpoint nodes correctly via their forward-path connectivity.

### Coordinate conversion

Dagre returns node centre coordinates. ReactFlow expects top-left. Conversion:

```js
x = Math.round(pos.x - NODE_WIDTH / 2)
y = Math.round(pos.y - NODE_HEIGHT / 2)
```

### Spacing constants

| Constant | Value | Rationale |
|---|---|---|
| `NODE_WIDTH` | 142 px | Matches the visual node component width |
| `NODE_HEIGHT` | 68 px | Matches the visual node component min-height |
| `DAGRE_RANK_SEP` | 50 px | Gap between right edge of rank N and left edge of rank N+1 |
| `DAGRE_NODE_SEP` | 36 px | Vertical gap between nodes within the same rank |
| `DAGRE_MARGIN_X` | 40 px | Left canvas margin |
| `DAGRE_MARGIN_Y` | 80 px | Top canvas margin |

`RANK_SEP = 50` keeps a four-node linear chain (source → queue → activity → sink) within ~616 px, fitting comfortably in an unzoomed 1280 px viewport.

---

## Files Modified

| File | Change |
|---|---|
| `src/ui/visual-designer/graph.js` | `withLayout()` replaced with dagre; old BFS constants removed; `import dagre` added |
| `tests/ui/visual-designer/graph.test.js` | Compact-layout test updated; 5 new dagre-specific tests added |
| `package.json` | `@dagrejs/dagre` added to dependencies |
| `package-lock.json` | Lockfile updated |

---

## Verification

| Check | Result |
|---|---|
| `npx vitest run tests/ui/visual-designer/graph.test.js` | 12/12 ✅ |
| All nodes receive finite x, y | ✅ |
| Source nodes left of sink nodes | ✅ |
| Parallel source nodes get distinct y | ✅ |
| Rework-loop model does not throw | ✅ |
| Persisted positions honoured alongside dagre-computed positions | ✅ |

---

## Exit Gate

- [x] `@dagrejs/dagre` installed, no other new dependencies
- [x] `withLayout()` uses dagre with LR rankdir, network-simplex ranker, greedy acyclicer
- [x] Loop edges excluded from dagre edge set
- [x] Dagre centre → ReactFlow top-left coordinate conversion applied
- [x] All 12 graph tests pass
- [x] Sprint plan and closure committed to `docs/reviews/`
- [x] `AGENTS.md` and `DES_Studio_Build_Plan.md` updated
