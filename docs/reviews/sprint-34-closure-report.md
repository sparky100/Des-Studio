# Sprint 34 — Closure Report

**Sprint:** 34 — Computed Attribute Expressions
**Completed:** 2026-05-15
**Branch:** `claude/review-sprints-31-33-0R5Mx`

## Delivered Scope

| Item | Description | Result |
|------|-------------|--------|
| `SET(varName, expr)` macro | State variable arithmetic with entity attr, state var, and clock refs | ✅ Delivered |
| `SET_ATTR(attrName, expr)` macro | Entity attribute mutation mid-process | ✅ Delivered |
| Math functions in expressions | `min`, `max`, `abs`, `round`, `floor`, `ceil`, nested calls | ✅ Delivered |
| Computed routing (emergent) | `SET_ATTR` updates visible to routing predicates in same step | ✅ Delivered |
| 16 new engine tests | S1–S5 covering all macro combinations | ✅ Delivered |
| Capability gap analysis v1.5 | G02 updated ❌→⚠️, F matrix row 2 updated | ✅ Delivered |

## Files Changed

| File | Change |
|------|--------|
| `src/engine/macros.js` | Extended `safeArithmetic` with math function calls; removed redundant regex guard from `safeEvalScalar`; added `evalEntityExpr` helper; added `SET` and `SET_ATTR` macros to registry |
| `tests/engine/sprint-34-set-macros.test.js` | 16 new tests (NEW) |
| `docs/reviews/sprint-34-plan.md` | Sprint plan (NEW) |
| `docs/capability-gap-analysis.md` | Updated to v1.5 |

## Test Results

```
tests/engine/sprint-34-set-macros.test.js  16/16 pass
Full suite: 1101/1101 pass (at time of sprint completion)
```

## Gap Status After Sprint 34

| Gap | Before | After |
|-----|--------|-------|
| G02 — Custom process logic / scripting | ❌ | ⚠️ Partial |

Remaining G02 sub-cases (branching, loops, coroutine-style multi-step waiting) are architecturally incompatible with Pidd's Three-Phase declarative model and are not planned.

## Key Design Notes

- Both macros share a single `evalEntityExpr` helper that substitutes entity attribute refs (`Entity.<attr>`), state variable names, and `clock` before passing the resolved string to `safeArithmetic`.
- No `eval` or `new Function` — the evaluator is a recursive descent parser that returns `NaN` for any expression it cannot parse.
- `SET_ATTR` updates are immediate and visible to the same event's subsequent routing predicates, enabling computed routing without additional engine changes.
- The SET macro pattern `/^SET\((\w+)\s*,\s*(.+)\)$/i` uses greedy `(.+)` with backtracking to correctly capture nested function calls like `min(Entity.base, 100)` where the last `)` closes SET.
