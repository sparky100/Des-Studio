# ADR-019: CANCEL Macro, Skill-Based Server Preference, and Cross-Type Pooling

**Date:** 2026-07-02
**Status:** Accepted
**Decided by:** Architecture review

---

## Context

### The problem

A capability-gap review (`docs/des-modeling-capability-gap-analysis.md`) identified several
gaps where standard DES modeling patterns required either a workaround or
were entirely unsupported:

1. **Skill-based server preference** — `ASSIGN`'s skill filter picked the
   first idle server matching a skill purely by idle-since time (FIFO).
   Mixed-skill pools (e.g. specialist vs. generalist) had no way to prefer
   one tier over another; users had to hand-roll separate C-events per
   tier.
2. **Cross-type skill pooling** — `ASSIGN(Queue, ServerType, "Skill")`
   required a single, named server type. Modeling "seize any resource with
   skill X" across multiple server types required duplicate C-events, one
   per type, racing each other.
3. **B-event cancellation** — the FEL already supported removing a
   specific pending entry internally (`FAIL`/`PREEMPT` use this to yank a
   customer's pending completion event on preemption), but this was never
   exposed as a general macro. Users could not cancel a competing
   scheduled event (e.g. a timeout race against normal completion).
4. **Round-robin routing** — achievable today by hand-rolling a state
   variable + `SET` + literal-comparison routing branches, but with no
   first-class ergonomic support and no modulo operator in the expression
   evaluator.

### Why this matters

Mixed-resource models (the majority of non-trivial healthcare, IT-service,
and staffing models) hit (1) and (2) immediately — "prefer the surgeon,
fall back to the GP" and "any available agent with skill X" are standard
requirements, not edge cases.

## Decision

### 1. `SkillProfile.priority` (optional, default 0)

Added an optional `priority?: number` field to `SkillProfile`
(`src/contracts/model.ts`). It is propagated onto each server instance as
`server._skillPriority` in `createServerEntities` (`src/engine/entities.js`).
`ASSIGN`'s skill-filtered candidate list is stable-sorted descending by
`_skillPriority` before picking a winner — ties preserve the existing
FIFO-by-idle-time order. This field nests inside the already-whitelisted
`entityTypes` array in `model_json`, so no `db/models.js` schema code
change was needed (only a round-trip test, per this repo's schema
contract).

### 2. `ASSIGN(Queue, ANY, "Skill")` — reserved `ANY` sentinel

Rather than a new macro, `ASSIGN` accepts the case-insensitive token `ANY`
in the server-type position. When present, candidates are sourced from a
new `helpers.idleOfAnySkill(skill)` (mirrors `idleOf`, but scans every
idle server regardless of type) instead of a single named type's idle
pool. The same priority-sort from (1) applies on top, so cross-type
pooling also respects tiering. Reusing `ASSIGN`'s existing syntax avoids
adding a second resource-seizing macro with divergent semantics, and keeps
the change localized to `ASSIGN`'s candidate-selection step rather than
touching the routing/queue contract.

A validation rule (extending V-SKILL-2) warns if `ANY` is paired with a
skill that no registered server type actually has — that combination
would silently never match at runtime. A server type literally named
`ANY` is flagged as a reserved-word collision.

### 3. `CANCEL(EventName)`

New macro, entity-scoped: removes the pending FEL entry named `EventName`
belonging to the *current context entity* (`entry._contextCustId ===
resolveContextEntity(ctx).id`), mirroring the existing FAIL/PREEMPT
cancellation precedent. This required plumbing the live `fel` array
reference (previously local to `index.js`) through to `macroCtx`
(`src/engine/phases.js`) so `CANCEL` can `splice()` it in place. Splicing
in place (rather than a copy-and-reassign) keeps it consistent with
`index.js`'s own `fel = fel.filter(...)` reassignments, since both
operate on the same array instance within a single event-processing tick.

`CANCEL` is deliberately scoped to the calling entity's own pending event,
not a global "cancel all instances of event X" — the primary use case is
racing a timeout against normal completion, where global cancellation
would risk canceling unrelated entities' timers.

### 4. `ROUND_ROBIN(StateVar, N)`

New macro, pure sugar over `SET`: advances `StateVar` through a `0..N-1`
rotation using native JS modulo (the expression evaluator has no `%`
operator). Existing `routing[]` branches already compare a state variable
to a literal, so no changes were needed to `conditions.js` or the routing
contract — a model just adds routing branches keyed on `StateVar == 0`,
`== 1`, etc.

## Consequences

- Mixed-skill and cross-type resource models no longer require duplicate
  C-events per server type.
- `CANCEL` closes part of the "timed-wait-with-condition-break" gap
  (racing a timeout against normal completion); it does not add
  condition-triggered B-events in general.
- `ROUND_ROBIN` and `ANY`-pooling read naturally in the effect-builder UI
  (new macro-button modes in `EffectPicker`, new "(Any Type)" ASSIGN
  options) without introducing new UI concepts beyond what `SET`/`ASSIGN`
  already have.
- See `docs/patterns/08-skill-priority-and-round-robin.md` for worked
  examples.
