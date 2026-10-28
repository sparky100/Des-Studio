# ADR-021: Evidence and assumptions

## Status

Accepted (2026-10-28). Implemented in stages; see the evidence and assumptions plan.

## Context

A model records what its parameters are, not why. Published models showed "0% backed" because the registers were never saved. The engine (`src/engine/backing-links.js`) already defines the registers, which follow Loop's approach (sparky100/sd-studio).

## Decision

Three top-level `model_json` arrays, each defaulting to `[]`:

- `evidence`: `{ id, name, type, description, source, strength, dateCaptured, lastVerified?, dataPoints? }`. `type` is `data`, `literature`, `expert_judgment` or `anecdote`. `strength` is 0 to 1.
- `assumptions`: `{ id, name, text, contested, confidence }`. `confidence` is 0 to 1. Limitations are recorded as assumptions; a disputed one is `contested`.
- `backingLinks`: `{ id, recordType, recordId, targetType, targetId, targetPath? }`. A link is only a connector, so one record can back many elements.

`name` is on both record types. Display falls back to the name, then the start of the description or text, then the id (`recordDisplayName`).

A link without `targetPath` backs the whole element. A link with `targetPath` backs one parameter, such as `schedules[0].distParams.mean`. Paths are positional; a path that stops resolving is reported, never silently re-pointed.

Strength and confidence are stored as numbers and shown as Low, Medium and High.

## Consequences

- Nothing in the engine, runners or workers reads these fields. A model runs identically with or without them.
- They round-trip through every model-rebuilding path via `MODEL_JSON_ARRAY_FIELDS`, and the import-model edge function carries the same keys.
- Deleting a record removes its backing links. Deleting a model element does not cascade into links yet; links whose target is gone are reported as broken and can be removed.
- The published release snapshot already copies these keys into the public `registers`.
