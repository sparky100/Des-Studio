# Sprint 77 — Dagre Layout Engine: Closure Report

**Sprint:** 77
**Theme:** Dagre layout engine for Visual Designer canvas
**Status:** ✅ Complete | **Completed:** 2026-05-29
**Branch:** `claude/des-onboarding-message-Tj9va`

---

## Delivered

All five features from the sprint plan delivered in a single session.

### F77.1 — `@dagrejs/dagre` installed

Added to `package.json` dependencies. No other dependency changes. Lockfile updated.

### F77.2 — `withLayout()` replaced with dagre

`src/ui/visual-designer/graph.js`:

- Removed: `NODE_SPACING_X`, `NODE_SPACING_Y`, `ORIGIN_X`, `ORIGIN_Y` constants and the 45-line BFS grid loop
- Added: `import dagre`, five layout constants (`NODE_WIDTH`, `NODE_HEIGHT`, `DAGRE_RANK_SEP`, `DAGRE_NODE_SEP`, `DAGRE_MARGIN_X`, `DAGRE_MARGIN_Y`), and a 30-line dagre-based `withLayout()` using `rankdir:"LR"`, `ranker:"network-simplex"`, `acyclicer:"greedy"`

Dagre returns centre coordinates; the implementation converts to ReactFlow top-left with `Math.round(pos.x - NODE_WIDTH/2)`.

### F77.3 — Loop edges excluded from dagre traversal

Edges with `edge.loop === true` are not registered with dagre. Their endpoint nodes are still positioned correctly via forward-path connectivity.

### F77.4 — Compact-layout test updated

The test that asserted `Math.min(xValues) === 40` (exact BFS origin) was updated to check intent: origin ≥ 0 and span ≤ 900 px. The viewport assertion is unchanged.

### F77.5 — Focused dagre test suite

Five new tests in `describe("dagre layout")`:

| Test | Verifies |
|---|---|
| Finite positions | Every node has a finite x and y after layout |
| LR flow | Source node x < sink node x |
| Parallel nodes | Two source nodes at the same rank get distinct y values |
| Rework loop safety | Cyclic model does not throw; all nodes get valid positions |
| Mixed persisted/auto | Saved node respects stored position; others get dagre positions |

---

## Test Results

```
tests/ui/visual-designer/graph.test.js  (12 tests) ✅
  deriveGraphFromModel (7 tests) ✅
  dagre layout (5 tests) ✅
```

---

## Schema / Contract Changes

None. Layout is presentation-only. `model.graph.nodes[].x` and `.y` continue to store top-left coordinates in the same format as before.

---

## Exit Gate

- [x] 12/12 tests pass
- [x] `@dagrejs/dagre` is the only new dependency
- [x] No changes to model schema, Supabase tables, or renderer
- [x] Sprint plan, closure, and build plan docs updated
- [x] `AGENTS.md` current sprint pointer updated
- [x] Changes committed and pushed to branch
