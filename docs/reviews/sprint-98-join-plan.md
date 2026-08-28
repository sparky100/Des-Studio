# Sprint 98 — JOIN: Fork/Join for SPLIT Lineage

**Sprint:** 98
**Theme:** `JOIN(Queue, TargetQueue)` — the consumer of SPLIT's `_splitFrom`/`_splitChildren`
lineage, closing the last correctness-level Group B gap from the macro coverage audit
(`docs/reviews/macro-library-ui-coverage-audit.md`), following Sprint 95 (COSEIZE quantities),
Sprint 96 (FAIL/REPAIR quantities) and Sprint 97 (PREEMPT/FINISH victim selection)
**Status:** ✅ Complete
**Owner:** parkinsonsj@gmail.com
**Source:** Group B, "SPLIT has no JOIN counterpart" — user-selected priority after Sprint 97

---

## Goal

Before this sprint, `SPLIT(Type, N, Queue)` recorded fork lineage that nothing consumed (three
write sites, zero read sites across `src/`), so parallel-then-converge processes — a patient sent
for parallel diagnostics with consultant review only after all return; components machined in
parallel then reassembled — could not be modelled. `JOIN(QueueName, TargetQueue)` is a C-event
macro that holds split-family members arriving in a rendezvous queue until the family is complete,
then merges them into one surviving entity routed onward.

## Semantics (confirmed with the user)

- **Lenient completeness** ("Join the survivors"): a family is complete once every member that can
  still arrive is waiting in the rendezvous queue. Members that went terminal (done/reneged) or
  vanished from the system entirely (balk/overflow splice) count as "never coming" — one lost
  branch degrades the join instead of deadlocking it, with the loss logged and recorded in
  `survivor.joined.lostMemberIds`.
- **Parent-as-survivor**: the original split entity continues, keeping its `arrivalTime`, `attrs`,
  and accumulated `stages` — sojourn/turnaround KPIs span the whole fork-join. If the parent was
  lost en route, the earliest-arrived waiting member survives.
- **Required TargetQueue** (refined during design): the survivor is routed onward rather than left
  in the rendezvous queue, which would (a) race a plain downstream `ASSIGN` that could seize
  individual clones before the merge, and (b) hold the JOIN's own condition true forever.
- Merged clones are terminated MATCH-style (`status: "done"`, `endedBy: "JOIN"`, `_joinedInto`)
  and deep-copied into `survivor.joined.children`, so branch histories stay inspectable in
  results. Non-split entities in the rendezvous queue are never touched. Single-level families
  only — no re-SPLIT of a clone.

## Shipped

Six commits on `claude/macro-library-ui-coverage-bydeiz`:

1. **`engine: JOIN(Queue, TargetQueue) — fork/join rendezvous for SPLIT families`** —
   `src/engine/macros.js` (the macro), `src/engine/index.js`
   (`compileEffectImpactTemplate`: precise `queueOnly` impact for JOIN; also fixed COSEIZE
   resource names not stripping `[Skill]`/`:N`, and restored the PREEMPT/FAIL/REPAIR impact
   precision lost when Sprints 96–97 extended their syntax), `src/engine/queue-refs.js` (rename
   registry rewrites both JOIN args; fixed a pre-existing bug where renaming a queue coerced
   array-shaped C-event effects to a joined string). **Design finding:** because JOIN's condition
   (`queue(Q).length > 0`) stays true while a family assembles, a do-nothing firing would restart
   Phase C until the 5000-pass cap on every such cycle — so this commit adds an opt-in **effect
   no-op protocol** (`ctx.markNoOp()` in `applyEffect`/`fireCEvent`/the Phase C loop): when every
   part of an effect declares itself a no-op, the firing skips its restart, cSchedules, dirty-set
   merge, and fired metrics. No other macro calls it; existing models are bit-for-bit unchanged.
   New `tests/engine/sprint-98-join.test.js` — 21 scenarios, **every one driving the full
   SPLIT → parallel branches → JOIN round trip through the real engine** (user requirement):
   ledger agreement between fork and join, KPI/sojourn spanning, a conservation invariant
   (every clone accounted for exactly once across five model variants), N=2/N=5, balk-at-fork,
   lost-via-renege, lost-via-vanish, parent-lost, incomplete family, non-split bystanders,
   concurrent families, one-pass multi-family merges, a repeating pipeline, the no-op protocol
   boundary (a mixed JOIN+scalar effect still fires), and no-Phase-C-truncation guards. Plus a
   SPLIT→JOIN differential in `phase-c-dirty-filter.test.js` and JOIN rename coverage in
   `queue-refs.test.js`.
2. **`engine: validation + model checker know JOIN`** — CHK-013 counts JOIN's arg 0 as a consumed
   queue; V45 counts arg 1 as a routing destination; V68 traces rendezvous → target edges; V44
   accepts `SET_ATTR` after JOIN (the survivor is the context entity). Also moved
   `modelChecker.test.js` from `src/simulation/` to `tests/simulation/` — no vitest include
   pattern matched its old location, so the whole suite had been silently not running.
3. **`editors: JOIN in the C-event effect picker`** — a two-dropdown composer
   ("rendezvous:" → "then route to:"), composer-only (no O(|Q|²) enumeration), distinct-target
   guard, categorized under the Queue chip.
   **3b. `tests: UI-composer → engine integration suite`** — new
   `tests/ui/editors/composer-to-engine.test.jsx` (user requirement, retroactive to Sprints
   94–97): drive each composer with `fireEvent`, splice the emitted string verbatim into a
   complete multi-stage model, run `buildEngine`, assert behavior. Covers JOIN, COSEIZE `Type:N`,
   FAIL/REPAIR quantities, PREEMPT `PRIORITY(attr)`, FINISH `LONGEST`, combined skill+container
   ASSIGN, `BATCH(Q, Entity.attr)`, FILL expression amounts, and plain 5-arg MATCH. The shared
   `composeEffect` helper makes this the standing home for future macro sprints' integration rows.
4. **`engine: simpy-export — JOIN TODO stub`** — JOIN in `TODO_MACRO_SET` (category 2) with a
   `simpy.AllOf`-based stub sketch, instead of being silently dropped (the gap FINISH had before
   Sprint 97).
5. **`docs: Sprint 98 JOIN`** — `help-reference.md` (macro row, SPLIT pairing note, category-2
   list, picker note), `model-schema-for-llm.md` (C-event macro row, fork/join worked pattern in
   §12.1, V44/V45/V68 mirrors, SPLIT rows), `help-knowledge-base.json` (C-event list +
   cheat-sheet), `engine-api-reference.md`, `DES_Studio_User_Guide.md` (24 → 25 macros),
   `addition1_entity_model.md` (macro list + table; SPLIT's refire note now names JOIN as the
   lineage consumer), audit strike-through, this closure doc.

Full suite green after each commit (`npx vitest run --project unit --project ui`), clean eslint
(pre-existing warnings only), golden benchmark soak re-run for the shared dirty-filter change.

## Out of Scope / Backlog

- Nested splits (re-SPLIT of a clone with a second-level JOIN) — documented as unsupported.
- Canvas output-queue edges for JOIN's TargetQueue — BATCH/MATCH/SPLIT have none either; JOIN
  renders as an ACTIVITY node with its inbound queue edge from the condition, same as they do.
- Queue-deletion cleanup for a JOIN's *target* argument (deleting the rendezvous queue removes
  the whole C-event via its condition reference, but a deleted target leaves a dangling name) —
  identical exposure to SPLIT/MATCH/BATCH targets today; V45 flags it post-hoc.
- k-way `MATCH` — now the single remaining Group B engine-level item.
