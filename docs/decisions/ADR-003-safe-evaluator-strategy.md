# ADR-003: Safe expression evaluator strategy for C1 fix

**Date:** 2026-05-03
**Status:** Accepted
**Sprint:** Sprint 1

## Context

`conditions.js` and `macros.js` both used `new Function(str)()` to evaluate condition strings and scalar arithmetic expressions provided by the modeller. This is an XSS vector on public models: a crafted model marked `is_public = true` could execute arbitrary JavaScript in any viewer's browser. The fix was required before any other Sprint 1 work (C1, Critical severity).

The replacement had to handle two distinct expression types:
- **Condition strings** — chains of comparison atoms joined by `AND`/`OR`, e.g. `queue(Customer).length > 0 AND idle(Server).count > 0`
- **Scalar arithmetic** — numeric expressions with `+ - * / ( )`, e.g. `serviceTime * 1.5`

## Decision

Replace `new Function()` with two hand-written pure-JS parsers, both in the existing engine files with no new dependencies:

1. `safeEvalExpr()` in `conditions.js` — tokenises `&&`/`||` chains of comparison atoms (`==`, `!=`, `<`, `>`, `<=`, `>=`) after variable substitution. Atoms are evaluated by `evalAtom()`. No dynamic code execution.
2. `safeArithmetic()` in `macros.js` — a recursive descent parser for `+ - * / ( )` on number literals. Returns `NaN` on malformed input rather than throwing.

The `evaluatePredicate()` function was also added to `conditions.js` to evaluate the Addition 1 §4 JSON predicate format directly against simulation state, without any string evaluation at all.

## Alternatives Considered

**Sandboxed third-party library (e.g., `expr-eval`, `filtrex`):** Would have provided richer expression support (function calls, exponentiation) with less custom code. Rejected because CLAUDE.md prohibits new dependencies without an ADR, and the expression grammar required by the engine is small and closed. Zero-dependency is a strong security property for code that evaluates user-submitted inputs.

**Restricted `new Function()` with input sanitisation:** Whitelisting allowed characters before passing to `new Function()` is fragile — sanitisation bypasses are well-documented. Rejected as providing no meaningful security improvement over the current state.

## Consequences

### Positive
- No dynamic code execution path exists in the engine. A crafted public model cannot execute arbitrary JavaScript in a viewer's browser.
- The expression grammar is explicit and auditable — it is impossible to accidentally extend it.
- Zero new dependencies introduced.

### Negative
- The parsers handle only the grammar they were written for. Adding new operators or function calls requires modifying `safeEvalExpr` or `safeArithmetic`.
- `safeArithmetic` supports only literal numbers (no variable references) — variables must be substituted before calling it.

### Rules added to CLAUDE.md
- `new Function(str)()`, `eval(str)`, and any variant are listed in §18 Prohibited Patterns.
- The `Custom...` escape hatch in `DropField` is removed; the rule "no free-text condition field" is enforced in §7.10.

## Open Questions

None. The expression grammar for DES conditions is fully defined in `docs/addition1_entity_model.md` §4.
