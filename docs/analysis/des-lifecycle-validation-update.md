# DES Lifecycle Validation Update

Date: 2026-05-26

## Files Changed

- [src/engine/validation.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/engine/validation.js)
- [tests/engine/validation.test.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/tests/engine/validation.test.js)

## Validation Messages Added

### Tightened existing rules

- `V25`
  - old behavior: warning for non-`ctx` `RENEGE(...)`
  - new behavior: blocking error
  - message pattern:
    - `B-Event '{name}' uses RENEGE('{arg}') which is invalid. Use exactly RENEGE(ctx) to reference the current entity.`
    - equivalent C-event message

- `V30`
  - old behavior: accepted any `RENEGE(...)` when `probabilisticRouting` exited to `null`
  - new behavior: requires `COMPLETE()` or exact `RENEGE(ctx)`
  - updated message:
    - `... has no COMPLETE() or RENEGE(ctx) effect ...`

### New rules

- `V31`
  - blocks conditional `routing` branches that exit to `null` without an explicit lifecycle terminator
  - message:
    - `B-Event '{name}' routes entities to exit (null queue) but does not explicitly end the lifecycle with COMPLETE() or RENEGE(ctx).`

- `V32`
  - blocks terminal B-events that define more than one lifecycle sink
  - current implementation treats `COMPLETE()` plus `RENEGE(ctx)` on the same event as ambiguous
  - message:
    - `B-Event '{name}' has multiple terminal lifecycle sinks. Choose one clear terminal action: COMPLETE() or RENEGE(ctx).`

- `V33`
  - warning only
  - fires when `probabilisticRouting` is used as a single `100% -> null` branch together with `COMPLETE()`
  - nudges the model toward a simpler explicit terminal completion
  - message:
    - `B-Event '{name}' uses probabilisticRouting with a single 100% null exit. Prefer explicit COMPLETE() without routing for a simple terminal completion.`

## Tests Added

Added or updated coverage in [tests/engine/validation.test.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/tests/engine/validation.test.js) for:

- non-`ctx` `RENEGE(...)` is now an error for B-events
- non-`ctx` `RENEGE(...)` is now an error for C-events
- `probabilisticRouting -> null` still passes with `COMPLETE()`
- `probabilisticRouting -> null` still passes with exact `RENEGE(ctx)`
- `probabilisticRouting -> null` now fails when paired with invalid `RENEGE(Customer)`
- `V33` warning for a single `probability: 1`, `queueName: null` branch used as a simple terminal completion
- `V31` error for conditional `routing` to `null` without `COMPLETE()` or `RENEGE(ctx)`
- `V32` error when a terminal B-event includes both `COMPLETE()` and `RENEGE(ctx)`
- explicit regression that `routing` plus `RELEASE(Server, Queue)` is rejected

## Interpretation

The lifecycle validator is still intentionally lightweight and string-based, but it now draws a clearer line between:

- explicit terminal completion
- explicit reneging
- implicit “disappear through null routing” patterns

That keeps the current validator small while preventing the most misleading terminal-event shapes.

## Migration / Backward Compatibility Concerns

### 1. `RENEGE(TypeName)` is now blocking

This is the biggest behavior change. Older saved models that used `RENEGE(Customer)` or similar forms will now fail validation until they are updated to `RENEGE(ctx)`.

### 2. Null-exit routing is now stricter

Models that used:

- `probabilisticRouting: [{ probability: 1, queueName: null }]`
- or conditional `routing` branches with `queueName: null`

without an explicit lifecycle terminator will now fail validation instead of relying on implicit disappearance.

### 3. Single-branch probabilistic exit still runs, but now warns

This is advisory only. Existing models using a single `100% -> null` probabilistic branch plus `COMPLETE()` are still valid, but the validator now suggests the simpler direct `COMPLETE()` pattern.

## Tests Run

- `npm test -- validation`

Result: passed (`tests/engine/validation.test.js`, 41 tests)

## Limitations

- The lifecycle check is still event-local. It does not perform full path analysis across multiple B-events and C-events.
- `V32` currently targets the clearest ambiguous sink case: simultaneous `COMPLETE()` and `RENEGE(ctx)` on the same terminal event.
- This patch does not yet convert legacy string routing conditions into structured predicate-object enforcement.
