# Sprint 34 — Computed Attribute Expressions

**Status:** ✅ Complete | **Started:** 2026-05-15 | **Completed:** 2026-05-15

## Goal

Partially close G02 (general-purpose scripting / custom process logic) by adding safe, declarative expression evaluation for the three most common scripting use cases in DES models: mutating entity attributes mid-process, updating state variables with computed expressions, and routing based on computed attribute values. Full general scripting (arbitrary Python / Java coroutines) remains out of scope for architectural and security reasons; this sprint delivers a targeted, safe-by-design partial implementation.

## Features

| Feature | Gap # | Priority | Status |
|---------|-------|----------|--------|
| `SET(varName, expr)` macro — state variable arithmetic | G02 (partial) | **High** | ✅ Complete |
| `SET_ATTR(attrName, expr)` macro — entity attribute mutation | G02 (partial) | **High** | ✅ Complete |
| Math functions in expressions: `min`, `max`, `abs`, `round`, `floor`, `ceil` | G02 (partial) | **High** | ✅ Complete |
| Routing based on computed (SET_ATTR) attributes | G02 (partial) | Med | ✅ Complete (emergent from SET_ATTR) |

## Implementation Details

### Expression Language

Both `SET` and `SET_ATTR` share a single safe expression evaluator (`evalEntityExpr`) that substitutes token references, then evaluates the resulting arithmetic expression using a recursive descent parser (`safeArithmetic`). No `eval`, no `new Function`.

**Token substitutions (order of application):**

| Token | Resolves to |
|-------|-------------|
| `Entity.<attrName>` | Current entity's attribute value (0 if absent) |
| `<stateVarName>` | Current scalar state variable value |
| `clock` | Current simulation time |

**Arithmetic operations:** `+`, `-`, `*`, `/`, parentheses `()`

**Math functions:** `min(a,b)`, `max(a,b)`, `abs(a)`, `round(a)`, `floor(a)`, `ceil(a)` — nested calls supported, e.g. `max(min(Entity.priority, 10), 1)`.

### `SET(varName, expr)` Macro

```
SET(totalCost, totalCost + Entity.qty * rate)
SET(lastServiceTime, clock)
SET(cap, min(demand, capacity))
```

- Pattern: `/^SET\((\w+)\s*,\s*(.+)\)$/i`
- Context entity (for `Entity.<attr>` refs) is resolved from the current `lastCustId` — set by the preceding `ASSIGN`, `ARRIVE`, or `COSEIZE` macro in the same effect string.
- Writes result to `state[varName]`. Logs `SET <varName> = <value>`.

### `SET_ATTR(attrName, expr)` Macro

```
SET_ATTR(cost, Entity.base * rate)
SET_ATTR(Entity.priority, Entity.priority + 1)
SET_ATTR(level, tier)
```

- Pattern: `/^SET_ATTR\((?:Entity\.)?(\w+)\s*,\s*(.+)\)$/i` — accepts both `SET_ATTR(attrName, ...)` and `SET_ATTR(Entity.attrName, ...)`.
- Requires a context entity; logs a warning and no-ops if called without one.
- Writes result to `entity.attrs[attrName]`. Updated attrs are immediately visible to subsequent condition evaluations and routing predicates.

### Routing based on computed attributes (emergent feature)

`SET_ATTR` updates are immediate. The existing `evaluatePredicate` routing system already supports `Entity.<attrName>` comparisons via the `currentEntity` state context. This means:

```
effect: ASSIGN(Intake, Worker); SET_ATTR(priority, Entity.base * 3)
```

After this effect fires, a subsequent RELEASE with conditional routing like `Entity.priority > 2 → VIP queue` will see the updated value with no additional engine changes.

### `safeEvalScalar` improvement

Removed the regex guard (`/^[\d\s+\-*/.()]+$/`) that prevented `min()`/`max()` from being evaluated through the legacy `VAR = expr` shorthand in `applyScalar`. The guard was redundant — `safeArithmetic` already returns `NaN` for any expression it cannot parse, so the guard only blocked valid arithmetic.

### Files Modified

| File | Changes |
|------|---------|
| `src/engine/macros.js` | Extended `parsePrimary` in `safeArithmetic` to handle `min`/`max`/`abs`/`round`/`floor`/`ceil`; removed regex guard from `safeEvalScalar`; added `evalEntityExpr` helper; added `SET` and `SET_ATTR` macros to MACROS registry |
| `tests/engine/sprint-34-set-macros.test.js` | 16 new tests across 5 describe blocks |

## Test Coverage

| Group | Tests | What is verified |
|-------|-------|------------------|
| S1 — SET state variable | 3 | Counter increment; clock reference; Entity.attr in expression |
| S2 — SET_ATTR mutation | 4 | Computed value assignment; `Entity.` prefix form; state var reference; graceful no-op when no entity |
| S3 — Math functions | 7 | `min`, `max`, `abs`, `round`, `floor`, `ceil`, nested calls, legacy shorthand |
| S4 — Computed routing | 1 | `SET_ATTR` → routing condition picks up updated value |
| S5 — Chained effects | 1 | `ASSIGN; SET_ATTR; SET` all apply in one effect string |

## Scope Boundary

This sprint covers the three tractable sub-cases of G02:
1. State variable arithmetic with entity attribute and clock references ✅
2. Entity attribute mutation mid-process ✅
3. Computed attribute routing (emergent) ✅

**Out of scope (architecturally impossible without full coroutine support):**
- Multi-step sequential waiting within a single entity's lifetime
- Branching / if-else within an effect string
- Loops within an effect
- Calling external APIs or running arbitrary code

G02 is now marked ⚠️ Partial. The remaining ❌ sub-cases require a coroutine model (SimPy/asyncio style) that is fundamentally incompatible with Pidd's Three-Phase declarative architecture.

## Exit Gate

- [x] 16 new tests passing
- [x] Full suite: 1090/1090 passing (no regressions)
- [x] No new dependencies
- [x] Capability assessment updated (G02 ❌ → ⚠️)
