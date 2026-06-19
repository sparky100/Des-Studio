# ADR-011: Conditional Routing Schema — Option A (Routing Table on B-Event)

**Date:** 2026-05-08
**Status:** Accepted
**Sprint:** Sprint 10

## Context

Sprint 10 adds conditional entity routing: after service completion, an entity should
be routed to different queues based on its runtime attribute values (e.g. `outcome == "ICU"`
or `priority == "urgent"`). Two schemas were evaluated for expressing routing decisions in
the canonical `model_json`.

The engine already had `evaluatePredicate()` which handles `Entity.attributeName` predicates.
The question was where to hang the routing configuration in the B-event definition.

## Decision

**Option A — Routing table on the RELEASE B-Event** is adopted.

The RELEASE B-event gains two optional fields:

```json
{
  "id": "be-triage-complete",
  "name": "Triage Complete",
  "effect": "RELEASE(Triage Nurse)",
  "routing": [
    {
      "condition": { "variable": "Entity.outcome", "operator": "==", "value": "ICU" },
      "queueName": "ICU Queue"
    },
    {
      "condition": { "variable": "Entity.outcome", "operator": "==", "value": "ward" },
      "queueName": "Ward Queue"
    }
  ],
  "defaultQueueName": "Ward Queue",
  "schedules": []
}
```

**Evaluation rules:**
1. `routing` array is tested in order — first condition that evaluates true wins.
2. If no condition matches, `defaultQueueName` is used.
3. If no condition matches and `defaultQueueName` is absent, a runtime warning is emitted and the entity's queue is unchanged.
4. `routing`, `probabilisticRouting`, and a RELEASE literal queue arg are mutually exclusive on the same B-event (V17 validation).

**Exit-system routing:** Setting `queueName: null` in any routing row (or `defaultQueueName: null`) causes the entity to leave the system immediately — equivalent to reaching a Sink node. The UI surfaces this as the explicit option `"Exit system (leave)"` in the queue dropdown rather than leaving an empty selection ambiguous.

```json
{
  "id": "be-triage-complete",
  "name": "Triage Complete",
  "effect": "RELEASE(Triage Nurse)",
  "routing": [
    {
      "condition": { "variable": "Entity.outcome", "operator": "==", "value": "ICU" },
      "queueName": "ICU Queue"
    }
  ],
  "defaultQueueName": null
}
```

In this example entities whose `outcome` is not `"ICU"` leave the system via the default route (`null`).

**Probabilistic routing** is a parallel optional field using the same B-event slot:

```json
{
  "id": "be-discharge",
  "effect": "RELEASE(Doctor)",
  "probabilisticRouting": [
    { "probability": 0.7, "queueName": "Ward Queue" },
    { "probability": 0.3, "queueName": null }
  ]
}
```

`queueName: null` is a valid branch in probabilistic routing (entity exits). Probabilities must sum to 1.0 (±0.001). Sampled using the replication's seeded RNG.

## Alternatives Considered

**Option B — ROUTE node type in the Visual Designer graph**

A dedicated ROUTE canvas node would sit between the Activity and destination queues,
holding the branching logic as node data. Edges from the ROUTE node to queues would carry
the condition predicates.

Reasons deferred for Sprint 10:
- Requires a new element in `model_json` and `deriveGraphFromModel`: the ROUTE node has no
  corresponding DES concept (it is a rendering artifact, not a simulation entity).
- The authoring-mode canvas would need new inspector UI, new canvas handles, new validation,
  and new `deleteVisualNode`/`connectVisualNodes` logic for the ROUTE type.
- The routing table on the B-event achieves identical runtime semantics with no new node
  type, no schema migration, and no Visual Designer changes beyond edge label display.
- ROUTE node would be better described as syntactic sugar over the routing table — it can
  be added in a future sprint once modellers have validated the table-based workflow.

## Consequences

### Positive
- **Zero migration** — existing models without routing are entirely unaffected. The routing
  fields are optional; the engine ignores their absence.
- **Reuses existing evaluator** — `evaluatePredicate()` already handles `Entity.*` lookups;
  no new condition evaluation logic was written.
- **Visual Designer auto-derives edges** — `deriveGraphFromModel()` in `graph.js` produces
  one labelled edge per routing branch from the Activity node. Condition text appears on the
  edge; the fallback edge is rendered dashed amber. This required only the edge-label fix in
  `FlowDiagramReactFlow.jsx`.
- **Testable in isolation** — routing behaviour is verifiable by calling `fireBEvent`
  directly without the full canvas stack.

### Negative
- The routing logic lives on the B-event, not on a dedicated visual node. Modellers must
  navigate to the B-Event editor to configure routing rather than clicking a canvas edge.
- For models with many routing branches, the B-event editor table can become long.
- Option B (ROUTE node) would provide clearer visual affordance and discoverability.

### Rules added to CLAUDE.md
- `RELEASE` routing table (`routing` or `probabilisticRouting`) is the canonical multi-route
  pattern. Never implement conditional routing by adding post-service C-events.
- `collectTimeSeries: false` is the default. Tests must bound simulation runs when enabling it.

## Open Questions

- If user research shows modellers struggle to find routing configuration in the B-Event
  editor, ADR-012 should revisit Option B (ROUTE node) as a canvas-first authoring surface
  that writes to the same underlying routing table.
