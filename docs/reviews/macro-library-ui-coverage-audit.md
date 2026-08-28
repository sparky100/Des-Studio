# Macro Library ↔ UI Coverage Audit

**Date:** 2026-08-27
**Scope:** Every macro in `src/engine/macros.js` (24 macros + scalar effects), audited against the
only UI paths that can author them: `bEffectOptions` / `assignOptions` / `EffectPicker` in
`src/ui/editors/helpers.jsx`, the C-Event delay-mode UI in `CEventEditor.jsx`, and the Visual
Designer (`graph-operations.js`, `VisualNodeInspector.jsx`). The editors are deliberately
structured-only (audit C1: no free-text effect field), so anything the pickers cannot compose is
genuinely unreachable from the UI (short of the AI generator or JSON import).

**Update (Sprint 94):** all eight Group A gaps below are now closed — see
`docs/reviews/sprint-94-macro-ui-depth-plan.md`. Group B (engine-level limits) remains open
backlog.

## Step 1 — Accessibility: is every macro reachable from the UI?

**Yes — all 24 macros are reachable.** No macro is engine-only. Documentation also covers all 24
(each appears in `docs/help-reference.md`; all but DELAY/FINISH/CANCEL/ROUND_ROBIN/RELEASE_COSEIZED
also have knowledge-base entries).

| Macro | UI path | Reachable |
|---|---|---|
| ARRIVE | B-event picker (enumerated, per queue incl. legacy default-queue form) | ✅ full |
| ASSIGN | C-event picker (enumerated) + canvas activity nodes | ✅ (depth gaps below) |
| DELAY | C-event dedicated delay-mode toggle (queue + optional slot capacity) + canvas | ✅ full |
| COMPLETE | B-event picker | ✅ full |
| FINISH | C-event picker (per server type) | ✅ full |
| RELEASE | B-event picker (bare + route-to-queue forms) | ✅ full |
| RELEASE_COSEIZED | B-event picker, auto-offered when the scheduling C-event COSEIZEs | ✅ full |
| RENEGE(ctx) | B-event picker | ✅ (numeric-id debug variant not exposed — fine) |
| RENEGE_OLDEST | B-event picker (per customer type) | ✅ full |
| BATCH | EffectPicker composer (queue + quantity) | ✅ (depth gap below) |
| UNBATCH | B-event picker (per queue) | ✅ full |
| FILL / DRAIN | EffectPicker composer (container + amount) | ✅ (depth gap below) |
| PREEMPT / FAIL / REPAIR | B-event picker (per server type) | ✅ full |
| SPLIT | EffectPicker composer (queue + N) | ✅ (depth gap below) |
| COSEIZE | C-event enumerated list (capped) + composer | ⚠️ partial (below) |
| MATCH | Enumerated list (capped) + composer (predicate form) | ⚠️ partial (below) |
| SET / SET_ATTR / COST | Enumerated exemplars + free-expression composer | ✅ full |
| CANCEL | Composer (event-name dropdown) | ✅ full |
| ROUND_ROBIN | Composer (state var + N) | ✅ full |
| Scalar (`v++`, `v--`, `+=`, `=`) | Enumerated; arbitrary forms via SET composer | ✅ full |

Related non-macro surfaces are also complete: queue-level balking (probability or condition),
renege distributions, capacity + overflow destination, and FIFO/LIFO/PRIORITY(attr) disciplines are
all editable in `QueueEditor`; containers in `ContainerEditor`; the canvas correctly hands any
"advanced" activity effect (COSEIZE, gated ASSIGN, multi-macro) to the C-Events editor with an
explanatory note rather than mangling it (`classifyActivityEffect`).

## Step 2 — Depth: where the UI (or engine) stops short of the macro's real capability

These are the "ah, it can't do that" cliffs. Group A is UI-only shallowness — the engine already
supports the feature but no picker can write it. Group B is genuine engine limits.

### Group A — engine supports it, UI cannot author it (✅ closed by Sprint 94)

1. **ASSIGN container gate is hard-coded to `:1`.** The engine regex accepts any positive
   expression — `ASSIGN(Q, Nurse, Blood:2)`, `Blood:Entity.unitsNeeded` — and evaluates it with
   `evalEntityExpr`. The UI only enumerates "consuming 1 ⟨container⟩".
2. **ASSIGN skill + container cannot be combined.** The engine pattern allows
   `ASSIGN(Q, Nurse, "Triage", Blood:1)` (both optional groups). The UI offers skill *or*
   container, never both; same for `ANY` + container.
3. **ASSIGN(Q, ANY) without a skill** (pool every idle server of any type) is valid in the engine
   but the UI only offers `ANY` under the "any type with skill" family.
4. **BATCH dynamic size.** Engine: `BATCH(Q, Entity.batchSize)`. Composer coerces the quantity to a
   number ≥ 2, so attribute-driven batch sizes are unreachable.
5. **FILL / DRAIN expression amounts.** Engine evaluates `Entity.attr`, state vars, `clock`, and
   arithmetic; the composer's `<input type="number">` rejects anything non-numeric.
6. **COSEIZE beyond "2 types, maybe 1 skill".** Engine: any number of server types, each with an
   optional `Type[Skill]` bracket. UI: the enumerated list covers 2 types with a skill on at most
   one side, and disappears entirely once queues×type-pairs×skills exceeds the 50-option cap (F-8);
   the fallback composer is fixed at exactly 2 types with **no** skills. So 3-resource seizes and
   both-sides-skilled seizes are never authorable, and on larger models skilled COSEIZE is lost
   altogether.
7. **Plain MATCH on larger models.** The enumerated no-predicate list is capped at 50 combinations
   (~5 queues); above that, the only path is the composer, which *requires* a compatibility
   predicate. A plain front-of-both-queues MATCH then can't be written without inventing a
   tautological predicate.
8. **SPLIT clone type.** Engine: `SPLIT(AnyType, N, Q)`. Composer derives the type from the target
   queue's `customerType`, so splitting into a differently-typed clone set is unreachable.

### Group B — engine-level limits (UI faithfully reflects them)

- ~~**FINISH / PREEMPT take the first busy server** of the type — no victim-selection criterion
  (e.g. "preempt the lowest-priority in-service entity").~~ **Closed by Sprint 97** — see
  `docs/reviews/sprint-97-preempt-finish-victim-selection-plan.md`. `PREEMPT(Type, Criterion)` /
  `FINISH(Type, Criterion)` accept `PRIORITY(attrName)` (lowest value targeted), `LONGEST`, or
  `SHORTEST` (by elapsed service time). Omitted or unrecognized criterion keeps today's
  first-busy-server behavior.
- ~~**FAIL / REPAIR are all-or-nothing per server type** — no partial `FAIL(Type, N)` for modelling a
  single machine of a bank breaking down.~~ **Closed by Sprint 96** — see
  `docs/reviews/sprint-96-fail-repair-quantities-plan.md`. `FAIL(Type, N)` fails up to N servers
  (idle-preferred, busy only once idle runs out); `REPAIR(Type, N)` repairs up to N failed servers
  (oldest-failure-first). Omitted N keeps today's "all" behavior.
- ~~**COSEIZE seizes exactly one server per type** — quantities like "2 Nurses + 1 Doctor" require
  duplicate server types, which the macro explicitly rejects.~~ **Closed by Sprint 95** — see
  `docs/reviews/sprint-95-coseize-quantities-plan.md`. `COSEIZE(Q, Nurse:2, Doctor)` now seizes N
  servers of a type via an optional `:N` quantity suffix, threaded through the engine, validation,
  the UI composer, and SimPy export. `RELEASE_COSEIZED` releases all N (quantity-agnostic,
  permanently — no partial release).
- **MATCH is strictly pairwise** — no k-way assembly; merged attrs let B silently overwrite A.
- ~~**SPLIT has no JOIN counterpart.** `_splitFrom`/`_splitChildren` lineage is recorded but nothing
  consumes it — a fork/join pattern (wait for all N clones, then proceed) cannot be modelled.~~
  **Closed by Sprint 98** — see `docs/reviews/sprint-98-join-plan.md`. `JOIN(Queue, TargetQueue)`
  (C-event, both args required) holds split-family members arriving in a rendezvous queue until the
  family is complete, then merges them into one survivor (the original parent when present) routed
  to TargetQueue. Lenient completeness: lost members (terminal or vanished) degrade the join
  instead of deadlocking it.
- **SimPy export**: RENEGE, BATCH, RENEGE_OLDEST, MATCH, FAIL, REPAIR, PREEMPT, RELEASE_COSEIZED
  (plus FINISH since Sprint 97 and JOIN since Sprint 98)
  export as `# NOT SUPPORTED` TODO blocks (category 2) — documented, but worth surfacing in the UI
  before a user builds a model around them expecting portable export.

## Recommendations (prioritised)

1. **Composer amount fields accept expressions** (BATCH size, FILL/DRAIN amount, ASSIGN container
   amount): swap the numeric inputs for the same validated expression input COST/SET already use,
   plus an "← Entity.attr" dropdown shortcut. Removes gaps 1, 4, 5 in one pattern.
2. **COSEIZE composer v2**: dynamic list of N server-type rows, each with an optional skill
   dropdown (skills already known per type via `serverSkills`). Removes gap 6 and de-risks the F-8
   cap entirely — the enumerated COSEIZE family could then be retired.
3. **Make the MATCH composer's predicate optional** (empty predicate ⇒ plain 5-arg MATCH).
   Removes gap 7.
4. **ASSIGN combined-options row**: a small composer (queue, server/ANY, optional skill source,
   optional container + amount) instead of enumerating only pairwise combinations. Removes gaps
   2, 3 and shrinks the enumerated dropdown.
5. **Engine backlog candidates** (Group B): JOIN(Q, splitFamily) fork-join; FAIL(Type, N) partial
   failure; PREEMPT victim selection by discipline. Each needs schema-contract round-trip tests per
   CLAUDE.md if fields are added.

No code changes were made in this audit; it is a findings register for sprint planning.
