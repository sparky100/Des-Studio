# ADR-010: Visual Designer canvas and graph metadata

**Date:** 2026-05-05
**Status:** Accepted
**Sprint:** Sprint 9A

## Context

ADR-007 established three first-class authoring modes over one canonical `model_json`: Forms/Tabs, AI Generated Model, and Visual Designer. It also retired the temporary split-pane SVG hybrid designer.

Sprint 9A needed to resolve the remaining Visual Designer architecture questions before implementation:

- which canvas dependency to use
- whether graph metadata is persisted, derived, or omitted
- how visual editing round-trips with Forms/Tabs and AI Generated Model
- which existing editor components should be reused in the visual inspector

The repository currently has no graph/canvas dependency. The dependency list is intentionally minimal, so adding one requires an explicit architecture decision.

## Decision

DES Studio will build the final Visual Designer with `@xyflow/react`, the current React Flow package. The older `reactflow` package name must not be used for new work.

The Visual Designer may import the vendor stylesheet `@xyflow/react/dist/style.css`. This is a narrow vendor-CSS exception to the local "inline styles only" rule. All DES Studio-owned visual styling remains inline and token-driven.

`model_json.graph` will be optional, persisted layout metadata only. It is not a second model format and is not required for execution.

The canonical DES model remains the source of truth for logic:

- `entityTypes`
- `queues`
- `bEvents`
- `cEvents`
- `stateVariables`

Visual graph topology is derived from canonical model logic. If graph metadata is missing or stale, the Visual Designer regenerates it from the canonical model. If the modeller creates or changes a connection visually, the UI updates the canonical model first, then refreshes the derived visual graph.

## Graph Metadata Shape

`model_json.graph` may contain:

```json
{
  "graph": {
    "version": 1,
    "nodes": [
      { "id": "queue:triage", "type": "queue", "refId": "triage", "x": 320, "y": 180 }
    ],
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

Rules:

- `graph.nodes[].id` is a stable visual node ID.
- `graph.nodes[].refId` points to the canonical model element where one exists.
- `x` and `y` are layout coordinates only.
- `viewport` is optional view state.
- Persisted graph metadata must not contain simulation logic.
- Persisted graph edges are avoided by default because edges can drift from canonical routing. Edges are derived from the model.

## Node Mapping

Initial Sprint 9 mapping:

| Visual node | Canonical source of truth |
|---|---|
| Source | Arrival B-event with `ARRIVE(CustomerType, QueueName)` |
| Queue | `queues[]` |
| Activity | Service-start C-event plus scheduled completion B-event |
| Sink | Terminal completion/routing outcome, initially derived rather than a new engine schema element |

Source and Sink nodes are visual lifecycle concepts. They should not require new engine-level Source/Sink schema for Sprint 9.

## Inspector Strategy

The Visual Designer inspector should reuse existing small editor building blocks where practical:

- `DistPicker`
- `ConditionBuilder`
- `EntityFilterBuilder`
- queue/customer/resource option helpers

It should not embed the full `BEventEditor` or `CEventEditor` panels inside a node inspector. The inspector is a focused graph-node editor that updates the same canonical model fields.

## Round-Trip Contract

- Forms/Tabs edit canonical `model_json`.
- AI Generated Model proposes canonical `model_json`.
- Visual Designer edits canonical `model_json`.
- `model_json.graph` is optional layout metadata and can be regenerated.
- `validateModel()` remains the execution gate.
- No authoring mode may create data that the other modes cannot preserve.

## Consequences

### Positive

- Sprint 9 can use a mature graph canvas without building a throwaway SVG bridge.
- Graph layout can persist manual positioning without becoming model logic.
- Forms/Tabs, AI, and Visual Designer remain aligned around one model.
- The dependency decision is explicit before package changes.

### Negative

- `@xyflow/react` adds a new runtime dependency.
- A vendor CSS import is required.
- Deriving graph topology requires careful mapping tests, especially for multi-stage service flows.
- Some inspector UI must be newly composed from existing building blocks rather than reused wholesale.

## Implementation Notes

- Add `@xyflow/react` only when Sprint 9 implementation begins.
- Do not add React Flow UI/shadcn components; they would introduce unrelated styling and dependency patterns.
- Add graph derivation tests before or alongside the visual shell.
- Keep visual designer code out of `src/engine/`.
