# DES Studio — Visual Designer: Confirmed Design
*Entity Lifecycle Designer — Authoring Modes and Visual Designer Plan*
*Current version: 3.0 | Last updated: 2026-05-04*

---

## Version History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-04-30 | — | Initial design document — three options presented for review |
| 2.0 | 2026-04-30 | — | Decision confirmed: phased approach. Tab editors (Phase 1) → Split-pane hybrid (Phase 2) → React Flow canvas (Phase 3). Coexistence of both modes documented. |
| 3.0 | 2026-05-04 | — | ADR-007 accepted: DES Studio has three authoring modes over one canonical `model_json`. The split-pane SVG hybrid phase is retired; the visual designer should be planned as the final graph-first authoring surface. |
| | | | *(add a row each time this document is updated)* |

> **How to update this document:** When a design decision changes, a phase completes, or a new constraint is discovered — add a row to the version history above, increment the version number in the title, and update the relevant section. Do not delete previous content — mark superseded sections as `[Superseded in v X.X — see Section Y]`.

---

## Decision Record

**Confirmed approach:** DES Studio supports three first-class authoring modes over one canonical `model_json`:

1. Forms/Tabs
2. AI Generated Model
3. Visual Designer

This decision is recorded in `docs/decisions/ADR-007-three-authoring-modes.md`.

The previous v2.0 plan to build a split-pane SVG hybrid designer before the final visual designer is superseded. The SVG hybrid is no longer a required bridge phase. When visual graph authoring is scheduled, it should be planned as the final graph-first designer rather than a temporary renderer.

This is directly aligned with the audit's recommendation:

> *"A full rebuild would discard working, tested engine code in exchange for nothing. A selective rebuild... combined with adding the absent features in prioritised sprints — is the correct path."*

The same principle applies to the UI: the existing tab editors are working and remain first-class. AI generation and the visual designer are additive authoring surfaces over the same model data, not replacement formats.

---

## Contents

1. [The Authoring Strategy](#1-the-authoring-strategy)
2. [What Coexistence Means](#2-what-coexistence-means)
3. [The Four Node Types](#3-the-four-node-types)
4. [DAG Rules and Validation](#4-dag-rules-and-validation)
5. [Phase 1 — Complete the Tab Editors (Sprints 1 and 2)](#5-phase-1--complete-the-tab-editors-sprints-1-and-2)
6. [Phase 2 — Split-Pane Hybrid Designer (Sprint 3)](#6-phase-2--split-pane-hybrid-designer-sprint-3)
7. [Phase 3 — Full React Flow Canvas (Sprint 4+)](#7-phase-3--full-react-flow-canvas-sprint-4)
8. [The Inspector Panel — Built Once, Reused Twice](#8-the-inspector-panel--built-once-reused-twice)
9. [model_json Schema — Fixed in Phase 1, Never Changes](#9-model_json-schema--fixed-in-phase-1-never-changes)
10. [Phase 2 — Detailed Design](#10-phase-2--detailed-design)
11. [Phase 3 — Detailed Design](#11-phase-3--detailed-design)
12. [Claude Code Prompts by Phase](#12-claude-code-prompts-by-phase)

---

## 1. The Authoring Strategy

[Supersedes v2.0 phased SVG hybrid strategy — see ADR-007.]

DES Studio has one canonical model format and three authoring modes.

| Authoring mode | Purpose | Canonical data |
|---|---|---|
| Forms/Tabs | Precise manual construction and editing | Reads and writes `model_json` directly |
| AI Generated Model | Natural-language model creation and refinement | Proposes validated `model_json` before apply |
| Visual Designer | Graph-first lifecycle modelling | Reads and writes the same `model_json`, with optional graph layout metadata |

The authoring modes are not separate products and do not create separate schemas. Validation, persistence, import/export, run history, execution, and results analysis all operate on the same model object.

### Retired v2.0 phased strategy

The original v2.0 phased strategy is preserved below for history, but it is no longer current implementation guidance.

![Phased Implementation Roadmap](vd_08_phased_roadmap.png)
*Figure 1: Three-phase implementation strategy. Each phase builds on the previous. The inspector panel is built once in Phase 2 and reused unchanged in Phase 3.*

The strategy has three phases with a clear dependency chain.

### Phase 1 — Complete the Tab Editors (Sprints 1 and 2)

Fix all engine correctness issues and complete every missing feature in the existing tab-based editors. At the end of Phase 1 the tab editors are production-quality. This is the foundation everything else builds on.

**Why first:** The Predicate Builder, DistPicker, entity filter, and resource picker that the visual designer's inspector panel will use are built and tested here. Building the inspector panel before the components it contains are correct would mean rebuilding it.

**Status:** ✅ Complete in the main build plan. The tab editor is the current stable manual authoring mode.

### Phase 2 — Split-Pane Hybrid Designer (Sprint 3)

[Superseded in v3.0 by ADR-007 — do not implement this as a required bridge phase.]

Add a lightweight SVG flow diagram alongside the existing tab editors. The modeller can see the model as a connected graph and click any node to edit it in an inspector panel on the right. The tab editors remain fully functional. Both modes read and write the same `model_json`.

**Why second:** This delivers the spatial overview the specification requires without discarding the existing editors. The SVG diagram is simple enough to build in one sprint. The inspector panel reuses the components built in Phase 1 — no duplication.

**Status:** Superseded by ADR-007 — do not implement as a required bridge phase

### Phase 3 — Full React Flow Canvas (Sprint 4+)

[Superseded in v3.0 as a phase number. The React Flow/canvas visual designer remains the preferred direction for the final Visual Designer authoring mode.]

Replace the SVG diagram with a full React Flow canvas — drag-and-drop node placement, manual edge routing, minimap, zoom/pan. The inspector panel from Phase 2 is reused **unchanged**. The `model_json` schema is identical. The tab editors remain as a fallback.

**Why third:** React Flow integration is a significant dependency addition. By the time Phase 3 begins, the inspector panel is already complete and tested — only the diagram renderer changes.

**Status:** Future authoring mode — no longer dependent on Phase 2 SVG completion

---

## 2. What Coexistence Means

![Both modes coexist](vd_09_coexistence.png)
*Figure 2: Both modes use identical model_json. Switching between them at any time preserves all model data.*

Coexistence means four concrete things.

**The model data is the same.** Whether a modeller uses the tab editor or the visual designer, they are reading and writing the same `model_json` object in Supabase. There is no conversion, no export/import, no format difference.

**AI proposals are model proposals, not a separate format.** The AI Generated Model mode returns a proposed canonical model JSON object. It must pass validation before the user can apply it.

**Authoring modes are always available once implemented.** A modeller can create or edit using forms/tabs, ask AI to generate or refine a model, or use the visual designer. The data remains consistent throughout.

**No authoring mode deprecates another.** Some modellers prefer spatial graph modelling. Others prefer the precision of tab editors, particularly for complex C-Event conditions with many AND/OR clauses. AI generation is an assistant, not an authority; users review before applying.

---

## 3. The Four Node Types

Every node in the visual designer corresponds to a model element with a defined engine mapping.

![The Four Node Types](vd_01_node_types.png)
*Figure 3: Visual anatomy of the four node types — each with its properties panel and engine mapping.*

| Node | Visual Identity | Engine Phase | Ports |
|---|---|---|---|
| **Source** | Green · rounded rectangle | B-Event: ARRIVE | Output only |
| **Queue** | Blue · rounded rectangle | Passive | Input + Output |
| **Activity** | Purple · rounded rectangle | C-Event: SEIZE + B-Event: COMPLETE | Input + Output |
| **Sink** | Red · rounded rectangle | Records KPIs · disposes entity | Input only |

### Port rules

- **Source:** one output port only — nothing connects to a Source input
- **Sink:** one input port only — nothing connects from a Sink output
- **Queue and Activity:** one input port + one output port each
- A single output port connects to exactly one input port
- Multiple Activities may route to the same Sink (fan-in to Sink is permitted)
- Activity to Activity direct connection is blocked — a Queue must sit between activities

---

## 4. DAG Rules and Validation

The model must be a Directed Acyclic Graph. These rules are enforced in real time in the visual designer and at validation time in the tab editor.

![DAG Connection Rules](vd_05_connection_rules.png)
*Figure 4: Valid and invalid DAG connection patterns. Invalid connections are blocked before they are drawn.*

### Blocking rules — connection is prevented

| Rule | Reason |
|---|---|
| No back-edges (Activity → Source, Queue → Source) | Creates a cycle — engine loop |
| No Sink output connections | Sink is terminal |
| No Activity → Activity direct connection | Entities have nowhere to wait |
| No Source → Sink direct connection | Entity bypasses all processing |
| No disconnected nodes | Every node must be reachable from Source and reach Sink |

### Warning rules — flagged but run is not blocked

| Rule | Reason |
|---|---|
| Activity with no condition set | C-Event will never fire |
| Queue with no Activity connected downstream | Entities fill queue with no service |

---

## 5. Phase 1 — Complete the Tab Editors (Sprints 1 and 2)

**Status:** ✅ Complete in the main build plan
**Started:** 2026-05-03
**Completed:** 2026-05-03
**Notes:** Forms/tabs are the stable manual authoring mode. Keep this section as historical traceability for the original visual-designer dependency plan.

Phase 1 is entirely covered by the existing sprint plan. Follow the build plan prompts for Sprints 1 and 2 from `docs/DES_Studio_Build_Plan.md`.

### What Phase 1 delivers

**Sprint 1 — Engine safety (fixes to existing files):**

| Fix | File | Audit ref | Status |
|---|---|---|---|
| Replace `new Function()` with safe evaluator | `conditions.js`, `macros.js` | C1 | ✅ |
| Fix C-scan restart rule | `engine/index.js:121` | C3 | ✅ |
| Implement LIFO and Priority queue discipline | `entities.js:84` | C2 | ✅ |
| Add seeded RNG (`mulberry32`) | `distributions.js` | C7 | ✅ |
| Pre-run model validation (V1–V11) | `execute/index.jsx` | C5 | ✅ |
| Surface Phase C truncation warning | `engine/index.js` | C4 | ✅ |
| Fix M/M/1 benchmark (Fixed → Exponential) | `tests/` | — | ✅ |

**Sprint 2 — Editor completeness (extensions to existing files):**

| Feature | File | Status |
|---|---|---|
| Predicate Builder operator filtering by `valueType` | `editors/index.jsx` | ✅ |
| Compound AND/OR conditions | `editors/index.jsx` | ✅ |
| Attribute-based entity filter | `editors/index.jsx` + `entities.js` | ✅ |
| Explicit C-Event priority field + drag-to-reorder | `editors/index.jsx` | ✅ |
| Undo/redo history stack | `editors/index.jsx` | ✅ |
| Unsaved-change warning on navigation | `App.jsx` | ✅ |
| DistPicker CSV import | `shared/components.jsx` | ✅ |

### Phase 1 exit gate

Phase 2 must not begin until all of the following pass:

```bash
npm test -- --run                       # zero failures
node tests/[benchmark-file]             # M/M/1 exits 0
npm run build                           # production build succeeds
```

### Why Phase 1 must be complete before Phase 2

The Predicate Builder built in Sprint 2 is the central component of the visual designer's inspector panel. If it is not type-safe and fully functional before Phase 2 begins, the inspector panel will be built on a broken foundation. Complete Phase 1 fully, confirm its tests pass, then start Phase 2.

---

## 6. Phase 2 — Split-Pane Hybrid Designer (Sprint 3)

**Status:** Superseded by ADR-007
**Started:** —
**Completed:** —
**Notes:** Do not implement this as a required bridge phase. Preserve this section only as historical design context.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  HEADER BAR                                                              │
│  ← Back  ·  [Model Name]  ·  ● Saving  ·  [Tab ⊞] [Visual ⧉]  ·  ▶ Run │
├─────────────────────────────────────┬────────────────────────────────────┤
│                                     │                                    │
│   FLOW DIAGRAM  (left · 40%)        │   INSPECTOR PANEL  (right · 60%)  │
│                                     │                                    │
│   SVG graph — auto-layout           │   Context-sensitive editor         │
│                                     │   for the selected node            │
│   [SOURCE] → [QUEUE] → [ACTIVITY]  │                                    │
│                         ↑ selected  │   ACTIVITY — machine_alpha         │
│                         (dashed     │   ─────────────────────────────    │
│                          border)    │   ○ Logic  ○ Distribution          │
│                                     │   ○ Resource                       │
│   [+ Source] [+ Queue]              │   ─────────────────────────────    │
│   [+ Activity] [+ Sink]             │   Priority:    [ 1 ]               │
│                                     │   Condition:   [Predicate Builder] │
│   Validation:                       │   Service:     [DistPicker]        │
│   ✓ Acyclic · ✓ Connected           │   Entity filter: [optional pred.]  │
│   ⚠ Activity "Beta" no condition    │   Resource:    [machine_alpha ▼]   │
│                                     │                                    │
│                                     │   [Save]   [▶ Run]                 │
└─────────────────────────────────────┴────────────────────────────────────┘
```

### Features

| Feature | File | Status |
|---|---|---|
| F3.1 — graph section in model_json + migration | `db/models.js`, `editors/index.jsx` | ⬜ |
| F3.2 — SVG FlowDiagramSVG component | `editors/FlowDiagramSVG.jsx` (new) | ⬜ |
| F3.3 — Port click-to-connect with DAG validation | `FlowDiagramSVG.jsx` | ⬜ |
| F3.4 — InspectorPanel component | `editors/InspectorPanel.jsx` (new) | ⬜ |
| F3.5 — Mode toggle (Tab / Visual) in ModelDetail | `editors/index.jsx` | ⬜ |
| F3.6 — Validation panel below flow diagram | `FlowDiagramSVG.jsx` | ⬜ |

### What is new in Phase 2

Only three things are genuinely new. Everything else reuses Phase 1 work.

| New in Phase 2 | Reused from Phase 1 |
|---|---|
| SVG flow diagram component | Predicate Builder (complete, type-safe) |
| Auto-layout algorithm | DistPicker (complete, with CSV import) |
| Mode toggle (Tab / Visual) | Entity filter picker |
| | Validation logic (V1–V11) |
| | ConditionBuilder (compound AND/OR) |
| | All existing editor tab components |

### The FlowDiagram props interface — designed for Phase 3 from the start

The SVG diagram component uses a props interface that is **identical to what the React Flow implementation will receive in Phase 3**. This means Phase 3 is a renderer substitution — the rest of the application does not change.

```javascript
// This interface is fixed in Phase 2 and never changes
<FlowDiagram
  nodes={model.graph.nodes}           // { id, type, x, y, label, sublabel }[]
  edges={model.graph.edges}           // { id, from, to }[]
  selectedNodeId={selectedNodeId}     // string | null
  onNodeSelect={handleNodeSelect}     // (nodeId) => void
  onNodeAdd={handleNodeAdd}           // (type) => void
  onNodeDelete={handleNodeDelete}     // (nodeId) => void
  onEdgeAdd={handleEdgeAdd}           // ({ from, to }) => void
  onEdgeDelete={handleEdgeDelete}     // (edgeId) => void
  validationErrors={validationErrors} // { nodeId, message, severity }[]
/>
```

### Auto-layout algorithm

```
1. Find Source node (no incoming edges)
2. BFS traversal from Source
3. Assign column = BFS depth, row = order within column
4. Multiply by spacing constants (220px horizontal, 120px vertical)
5. Store x, y in model.graph.nodes
```

Manual node positioning is not supported in Phase 2. This is a deliberate scope limit — added in Phase 3 via React Flow's `onNodeDragStop`.

### Mode toggle

```javascript
// In ModelDetail — component state only, not persisted
const [mode, setMode] = useState('tabs'); // default to existing behaviour
```

Switching modes never causes model data changes. Both modes read the same `model_json` record.

### Phase 2 exit gate

```bash
npm test -- --run                       # zero failures including new Phase 2 tests
npm run build                           # succeeds
# Manual: switch between Tab and Visual modes — confirm identical model data
# Manual: create a cycle — confirm it is blocked
# Manual: Activity inspector shows full Predicate Builder from Phase 1
```

---

## 7. Phase 3 — Full React Flow Canvas (Sprint 4+)

**Status:** Superseded as a phase number; visual designer still planned as a future authoring mode
**Started:** —
**Completed:** —
**Notes:** The phase number is superseded by ADR-007. The React Flow/canvas direction remains valid for the final Visual Designer authoring mode, but it is no longer dependent on an SVG hybrid predecessor.

The final Visual Designer should use a graph-first canvas. The old v2.0 text below assumes it replaces an SVG `FlowDiagram`; under ADR-007, it should instead be planned directly against the canonical `model_json` and any required graph layout metadata.

### What changes and what does not

| Changes in Phase 3 | Unchanged in Phase 3 |
|---|---|
| `FlowDiagramSVG.jsx` → `FlowDiagramReactFlow.jsx` | FlowDiagram props interface |
| `reactflow` added to `package.json` | Inspector panel — identical |
| Drag-and-drop node placement | model_json schema |
| Manual edge routing | Predicate Builder |
| Node palette sidebar | DistPicker |
| MiniMap + zoom/pan | Validation logic |
| Manual node repositioning | Tab editors (remain as fallback) |
| | All engine code |
| | All DB layer code |

### One line changes in the application

```javascript
// Phase 2 import (in ModelDetail):
import { FlowDiagramSVG as FlowDiagram } from './FlowDiagramSVG';

// Phase 3 (replace the above line with):
import { FlowDiagramReactFlow as FlowDiagram } from './FlowDiagramReactFlow';
```

Everything else in `ModelDetail` is identical.

### Custom node components

```javascript
const SourceNode = ({ data, selected }) => (
  <div style={{ background: '#E8F5E9', border: `${selected ? 3 : 2}px ${selected ? 'dashed' : 'solid'} #2E7D32`,
                borderRadius: 8, padding: '8px 16px' }}>
    <strong style={{ color: '#2E7D32' }}>{data.label}</strong>
    <div style={{ fontSize: 11, color: '#2E7D32' }}>{data.sublabel}</div>
    <Handle type="source" position={Position.Right} />
  </div>
);
```

All styling uses inline objects consistent with the codebase (no CSS classes, tokens from `tokens.js`).

### Phase 3 exit gate

```bash
npm test -- --run                       # zero failures
npm run build                           # succeeds
# Manual: drag-and-drop node from palette — confirm positions saved to model_json
# Manual: Tab editors still function correctly after Phase 3
# Manual: Inspector panel identical to Phase 2
```

---

## 8. The Inspector Panel — Built Once, Reused Twice

The inspector panel is built in Phase 2 using existing Phase 1 components and survives Phase 3 completely unchanged.

### What the inspector panel shows by node type

| Selected node | Components shown |
|---|---|
| None | "Click a node in the diagram to edit its properties." |
| Source | Entity class picker + DistPicker (inter-arrival) + optional DistPicker (patience) |
| Queue | Name field + discipline dropdown (FIFO / LIFO / PRIORITY) |
| Activity | Priority integer + ConditionBuilder + entity filter + queue rule + DistPicker + resource picker |
| Sink | Name field (read-only stats display) |

### Why it survives Phase 3 unchanged

The inspector panel receives `selectedNodeId` (a string) and `model_json`. It has no dependency on how the diagram works — SVG or React Flow. Whether `selectedNodeId` is set by a click on an SVG rect or by React Flow's `onSelectionChange` is irrelevant. The interface contract is the same.

---

## 9. model_json Schema — Fixed in Phase 1, Never Changes

The `graph` section is added to `model_json` in Phase 2. It does not change in Phase 3.

```json
{
  "entityClasses": [...],
  "stateVariables": [...],
  "bEvents": [...],
  "cEvents": [...],
  "queues": [...],

  "graph": {
    "nodes": [
      { "id": "src_01",      "type": "source",   "label": "Customer Arrivals", "x": 80,  "y": 240 },
      { "id": "q_main",      "type": "queue",    "label": "Main Queue",        "x": 320, "y": 240 },
      { "id": "act_machine", "type": "activity", "label": "Machine Alpha",     "x": 560, "y": 240 },
      { "id": "sink_01",     "type": "sink",     "label": "Exit",              "x": 800, "y": 240 }
    ],
    "edges": [
      { "id": "e1", "from": "src_01",      "to": "q_main"      },
      { "id": "e2", "from": "q_main",      "to": "act_machine" },
      { "id": "e3", "from": "act_machine", "to": "sink_01"     }
    ]
  }
}
```

`node.id` matches the corresponding element's `id` in `cEvents`, `queues`, etc. The graph section stores visual layout only — no model logic.

### Migration for existing models

Models created before Phase 2 have no `graph` section. When the visual designer opens such a model, `generateGraphFromModel(modelJson)` auto-generates the layout and saves it. This is transparent to the modeller.

---

## 10. Phase 2 — Detailed Design

### Node visual specification

```
┌──────────────────────────────┐
│ ●                            │  ← input port (filled circle, node colour)
│   [Node Name]                │  ← bold, 10px, node colour
│   [Sublabel]                 │  ← 8px, node colour
│                            ● │  ← output port (filled circle, node colour)
└──────────────────────────────┘

Selected:  3px dashed border in node colour
Hover:     2px solid border, pointer cursor
Error:     red dashed border, ✗ icon top-right
```

| Node type | Border | Fill |
|---|---|---|
| Source | `#2E7D32` | `#E8F5E9` |
| Queue | `#1565C0` | `#E3F2FD` |
| Activity | `#6A1B9A` | `#F3E5F5` |
| Sink | `#B71C1C` | `#FFEBEE` |

### Edge visual specification

- SVG cubic bezier paths from output port to input port
- Edge colour matches source node type
- 2px width, 8px arrowhead
- Selected edge: 3px, delete button on hover

### Validation panel specification

| State | Display |
|---|---|
| All valid | Green background · "Model is valid — N nodes, N edges" |
| Warning | Amber background · "[node name]: [message]" · clicking highlights node |
| Error | Red background · "[node name]: [message]" · Run button disabled |

---

## 11. Phase 3 — Detailed Design

### New file: `FlowDiagramReactFlow.jsx`

```javascript
import ReactFlow, { MiniMap, Controls, Background, Handle, Position } from 'reactflow';

export const FlowDiagramReactFlow = ({
  nodes, edges, selectedNodeId,
  onNodeSelect, onNodeAdd, onNodeDelete,
  onEdgeAdd, onEdgeDelete, validationErrors
}) => {
  const rfNodes = nodes.map(n => ({
    id: n.id, type: n.type, position: { x: n.x, y: n.y },
    data: { label: n.label, sublabel: n.sublabel,
            error: validationErrors.find(e => e.nodeId === n.id) }
  }));

  const rfEdges = edges.map(e => ({ id: e.id, source: e.from, target: e.to }));

  return (
    <ReactFlow
      nodes={rfNodes} edges={rfEdges}
      onSelectionChange={({ nodes }) => onNodeSelect(nodes[0]?.id ?? null)}
      onConnect={({ source, target }) => onEdgeAdd({ from: source, to: target })}
      onEdgesDelete={deleted => deleted.forEach(e => onEdgeDelete(e.id))}
      onNodeDragStop={(_, node) => { /* update x,y in model.graph.nodes */ }}
      nodeTypes={nodeTypes}
    >
      <MiniMap /> <Controls /> <Background />
    </ReactFlow>
  );
};
```

### Node palette (new in Phase 3)

```
LEFT SIDEBAR
┌──────────┐
│  Nodes   │
├──────────┤
│ [SOURCE] │  ← draggable
│ [QUEUE ] │  ← draggable
│ [ACTIV.] │  ← draggable
│ [SINK  ] │  ← draggable
└──────────┘
```

---

## 12. Claude Code Prompts by Phase

### Phase 1 — Sprints 1 and 2

No new prompts needed. Follow the existing Sprint 1 and Sprint 2 prompts in `docs/DES_Studio_Build_Plan.md` exactly.

---

### Phase 2 — Sprint 3 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 3 of DES Studio.

Completed in Sprints 1–2: [paste completed feature list]

Sprint 3 goal: Add the split-pane visual designer alongside the
existing tab editors. Both modes must coexist — the same model_json
is read and written by both.

CONFIRMED DECISIONS:
  1. Tab editors are NOT removed — they remain fully functional
  2. A mode toggle switches between Tab and Visual views
  3. Visual designer uses SVG — NOT React Flow (that is Phase 3)
  4. Inspector panel reuses Phase 1 components — not rewritten
  5. Auto-layout only — no manual drag repositioning in Phase 2
  6. FlowDiagram props interface is renderer-agnostic (fixed for Phase 3)
  7. model_json graph section added in this sprint

Features:
  F3.1 — graph section in model_json + migration for existing models
  F3.2 — SVG FlowDiagramSVG component with auto-layout
  F3.3 — Port click-to-connect with DAG validation
  F3.4 — InspectorPanel component (reuses Phase 1 components)
  F3.5 — Mode toggle in ModelDetail header
  F3.6 — Validation panel below flow diagram

Definition of done:
  - Both modes show identical model data
  - Switching between modes preserves all edits
  - DAG cycles cannot be created
  - Activity inspector shows full Predicate Builder from Phase 1
  - Tab editors remain fully functional and unchanged
  - npm test -- --run passes
  - npm run build succeeds
```

---

### Phase 2 — F3.1: graph section in model_json

```
Re-read CLAUDE.md. Task F3.1 of Sprint 3.

Read src/db/models.js — show me the current model_json structure.

Add a graph section to model_json:
  { "graph": {
      "nodes": [{ "id": "string", "type": "source|queue|activity|sink",
                  "label": "string", "x": number, "y": number }],
      "edges": [{ "id": "string", "from": "nodeId", "to": "nodeId" }]
  }}

Also implement generateGraphFromModel(modelJson) → graph:
  - Called when model_json has no graph section
  - BFS auto-layout: column = BFS depth, row = position in column
  - 220px horizontal · 120px vertical spacing
  - Creates edges from logical connections in existing model_json
  - Saves graph section to Supabase immediately

Data layer only — do not write FlowDiagram component yet.
Show me the schema and function before implementing.
```

---

### Phase 2 — F3.2: SVG FlowDiagramSVG component

```
Task F3.2 of Sprint 3.

Build src/ui/editors/FlowDiagramSVG.jsx with this EXACT props interface
(Phase 3 React Flow will implement the same interface — do not deviate):

  FlowDiagramSVG({ nodes, edges, selectedNodeId, onNodeSelect,
                   onNodeAdd, onNodeDelete, onEdgeAdd, onEdgeDelete,
                   validationErrors })

SVG implementation:
  - Nodes: rect with rounded corners, port circles left/right
  - Node colours: green/blue/purple/red per type (see Section 10)
  - Selected: 3px dashed border in node colour
  - Edges: cubic bezier SVG paths, arrowhead, coloured by source node
  - Port click-to-connect: output port → input port calls onEdgeAdd
    (pending connection in component state, dashed preview line)
  - DAG validation before calling onEdgeAdd — block cycles
  - [+ Source] [+ Queue] [+ Activity] [+ Sink] buttons below diagram

Before writing code, explain:
  1. How you will track pending edge connection state
  2. How you will validate DAG rules before calling onEdgeAdd

Do NOT use React Flow. SVG only.
```

---

### Phase 2 — F3.4: InspectorPanel component

```
Task F3.4 of Sprint 3.

Read src/ui/editors/index.jsx — identify:
  1. Predicate Builder and its current props
  2. DistPicker and its current props
  3. Entity filter section
  4. Resource dropdown and priority field

Build src/ui/editors/InspectorPanel.jsx:
  Props: { selectedNodeId, model, onChange }

Renders by selected node type:
  null     → "Click a node to edit its properties."
  source   → entity class picker + DistPicker (inter-arrival) + optional patience
  queue    → name field + discipline dropdown
  activity → priority integer + ConditionBuilder + entity filter
             + queue rule + DistPicker (service) + resource picker
  sink     → name field (read-only)

CRITICAL: Reuse existing Phase 1 components. Do NOT rewrite them.
Show me component tree and which existing components you will reuse
before writing any code.
```

---

### Phase 2 — F3.5: Mode Toggle

```
Task F3.5 of Sprint 3.

Read src/ui/editors/index.jsx — show me ModelDetail's tab structure.

Add mode toggle to ModelDetail header: [Tab Editor ⊞]  [Visual Designer ⧉]
  const [mode, setMode] = useState('tabs');  // default tabs

'tabs' mode: render existing tab structure UNCHANGED
'visual' mode: split-pane — FlowDiagramSVG (40%) + InspectorPanel (60%)

Toggle must NOT modify model_json.
Switching must NOT lose unsaved changes.
Tab editor must be pixel-identical in 'tabs' mode.
```

---

### Phase 3 — Sprint Planning Prompt *(run in claude.ai)*

```
We are planning Phase 3 of the DES Studio visual designer.

Phase 2 delivered:
  - SVG FlowDiagramSVG with agreed props interface
  - InspectorPanel reusing Phase 1 components
  - Mode toggle (Tab / Visual) in ModelDetail
  - Both modes coexist with identical model_json

Phase 3 replaces the SVG renderer with React Flow.
The inspector panel, model_json, and tab editors do NOT change.
This is a renderer substitution — not a redesign.

New in Phase 3 only:
  - reactflow added to package.json
  - FlowDiagramReactFlow.jsx (same props interface as FlowDiagramSVG)
  - Custom node components (SourceNode, QueueNode, ActivityNode, SinkNode)
  - Node palette sidebar (drag-and-drop)
  - MiniMap, zoom/pan, manual node repositioning
  - One import line change in ModelDetail

Define sprint scope, risks, and React Flow version.
Flag any cases where the existing props interface needs extending.
```

---

### Phase 3 — Start Prompt for Claude Code

```
Re-read CLAUDE.md. Phase 3 of the visual designer.

Phase 3 replaces FlowDiagramSVG with React Flow.
Inspector panel, tab editors, model_json, and engine do NOT change.

Before writing any code:
  1. Read src/ui/editors/FlowDiagramSVG.jsx — show the full props interface
  2. Read src/ui/editors/InspectorPanel.jsx — confirm no SVG dependency
  3. Read package.json — confirm reactflow is not yet installed

Then explain:
  1. How FlowDiagramReactFlow.jsx implements the same props interface
  2. How model.graph.nodes maps to React Flow node format
  3. How model.graph.edges maps to React Flow edge format
  4. How callbacks map to React Flow events
  5. How onNodeDragStop updates model.graph.nodes[i].x and y

Show component signature and data mapping before implementing.
The one-line import change in ModelDetail is the last thing you do.
```

---

*End of document. Update version history when any section changes.*
