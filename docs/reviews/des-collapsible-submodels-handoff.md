# DES collapsible sub-models: review handoff

Branch: `codex/des-collapsible-submodels`. Parent review and verification are recorded below. Broad CI remains an acceptance gate until it completes.

## Behavior

- Existing section panels keep focus/dimming and gain Collapse. No second grouping system or model schema is introduced.
- Compact overview collapses populated sections and reuses the existing Dagre layout helper on display objects. Ungrouped nodes remain visible.
- Directed cross-boundary graph links aggregate by ordered endpoint pair and show connection counts. Internal links disappear. Counts are topology, not throughput or probabilities.
- Expand to edit and Expand all restore canonical detailed coordinates exactly. Search/validation focus expands the relevant section before centering it.
- Collapse state is local to the canvas. Hidden member search matches and validation messages remain visible on summary cards.
- Virtual cards and aggregate links are excluded from selection, editing, deletion, connection creation and persisted measurements. Drag/drop layout, reset and viewport saves are suppressed while projected. The layout writer additionally refuses a display projection.

## Changed paths

- `src/ui/visual-designer/graph.js`: pure projection and existing-layout reuse.
- `src/ui/visual-designer/FlowDiagramReactFlow.jsx`: temporary view state, cards, controls and interaction guards.
- `src/ui/visual-designer/SectionPanelNode.jsx`: accessible Collapse action alongside existing focus.
- `src/ui/visual-designer/VisualDesignerPanel.jsx`: center search/validation targets after section expansion has rendered.
- `src/ui/visual-designer/graph-operations.js`: reject projection layout persistence.
- `tests/model/submodel-projection.test.js`: five tests, including real-engine fixed-seed comparisons.
- `tests/ui/visual-designer/flow-diagram-react-flow.test.jsx`: three new UI workflows, 33 tests total.
- `tests/fixtures/uk_electricity_supplier_des_phase1.json`: supplied acceptance fixture, unchanged.
- `docs/DES_Studio_User_Guide.md`, `docs/DES_Studio_Product_Spec.md`, `docs/DES_Studio_Engineering_Spec.md`: focused capability and architecture updates.

## Acceptance and limits

The supplied fixture was inspected in full: illustrative assumptions and generic model definitions, no credentials, private contacts, customer records or external data sources (`dataSources: []`). It matches the downloaded source verbatim. All four expected section names and all ordered cross-boundary counts are checked against its real derived topology. The current validator returns no errors or warnings, including for its Categorical distributions and legacy condition strings. Visual graph validation also reports no disconnected-node warnings. Supplier engine parity explicitly requires customer arrivals and processed B-events, so an empty run cannot pass.

Real-engine parity uses seed 42. A canonical queueing fixture runs for 50 simulation units with deliberately irregular saved coordinates; the supplied electricity fixture runs for 60 days with zero warm-up as a bounded acceptance test. All returned deterministic fields are compared, including entities, trace, log, time series, summaries and runtime counts; only `runtimeMetrics.wall_clock_ms` is excluded. These are not full ten-replication, 3,650-day business-model validations.

Separate existing engine limitation discovered during test development: deeply freezing the entire electricity model causes `compilePredicate` in `src/engine/conditions.js` to throw while attaching its non-enumerable `Symbol(compiledPredicate)` cache to a `when` predicate. Engine code and fixture semantics were left untouched. Projection nonmutation is tested with frozen inputs; the electricity engine parity test uses the normal mutable model and a frozen display graph.

## Focused verification

All commands run from this worktree, using the requested junction to `../des-studio/node_modules`; no dependency installation.

Completed focused checks: 150 distinct tests have passed across five files (5 projection/parity, 33 canvas, 36 designer panel, 51 graph, 25 graph operations), across separate runs. The first combined run passed 149 and exposed the frozen-engine limitation above; after correcting the test boundary the projection/canvas rerun passed all 38. The subsequent projection/canvas/designer-panel rerun passed 69/74: all 5 projection/parity and all 33 canvas checks passed; five existing designer-panel tests hit their 15-second timeout. That file had passed 36/36 earlier. The timeout run overlapped parent work; contention is a possible cause, not proven. No source/test timeout settings were changed. A narrow final run covers the five projection checks and three collapsed-submodel UI workflows after the requested card styling changes.

Final narrow result: **8 passed, 30 intentionally skipped, 0 failed**, two files. New inline code comments removed; cards use flex layout, token spacing, explicit paragraph margins and wrapped/clamped names with full-name tooltips.

Commands:

```text
npm.cmd test -- --maxWorkers=1 --minWorkers=1 tests/model/submodel-projection.test.js tests/ui/visual-designer/flow-diagram-react-flow.test.jsx tests/ui/visual-designer/visual-designer-panel.test.jsx tests/ui/visual-designer/graph.test.js tests/ui/visual-designer/graph-operations.test.js
npm.cmd test -- --maxWorkers=1 --minWorkers=1 tests/model/submodel-projection.test.js tests/ui/visual-designer/flow-diagram-react-flow.test.jsx
npm.cmd test -- --maxWorkers=1 --minWorkers=1 tests/model/submodel-projection.test.js tests/ui/visual-designer/flow-diagram-react-flow.test.jsx tests/ui/visual-designer/visual-designer-panel.test.jsx
npm.cmd test -- --maxWorkers=1 --minWorkers=1 tests/model/submodel-projection.test.js tests/ui/visual-designer/flow-diagram-react-flow.test.jsx -t collapsed
```

Changed-file ESLint passed with zero errors. The newly included `VisualDesignerPanel.jsx` reports six existing unused-variable warnings; the other changed code/test files are clean. `git diff --check` passed. Existing React test-mock warnings about an HTML `path` element and asynchronous `act` wrapping remain in the pre-existing canvas/designer tests. No full suite or build was launched here.

## Parent verification

After the final toolbar wrapping and viewport-restoration guard, the complete
projection/canvas pair passed again: 38 tests, zero failures or skipped tests.
Production build and type checking pass. Scoped lint and whitespace checks pass.
The broad Windows suite on the sibling branch hit existing designer timeouts;
the corresponding published-model and Run-layout commits passed Linux CI.

An isolated browser preview loaded the actual supplier fixture through the real
canvas component. Its 33 detailed nodes collapsed to four named cards with four
directed aggregate links (5, 4, 5 and 5 connections). Repeated expansion restored
the detailed graph unchanged; instrumentation recorded zero node-move callbacks
and zero viewport-save callbacks. Restoring the canonical viewport suppresses its
programmatic save event. The toolbar wraps on narrow screens; the canvas includes
its border within its width. No live model was edited during this check.
