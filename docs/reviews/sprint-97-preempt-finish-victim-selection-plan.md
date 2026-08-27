# Sprint 97 — PREEMPT/FINISH Victim Selection

**Sprint:** 97
**Theme:** Add a victim-selection criterion to PREEMPT and FINISH — the third and final Group B
engine-level gap from the macro coverage audit (`docs/reviews/macro-library-ui-coverage-audit.md`),
following Sprint 95 (COSEIZE quantities) and Sprint 96 (FAIL/REPAIR quantities)
**Status:** ✅ Complete
**Owner:** parkinsonsj@gmail.com
**Source:** Group B, "FINISH/PREEMPT take the first busy server" — user-selected priority after
Sprint 96

---

## Goal

Before this sprint, `PREEMPT(ServerType)` and `FINISH(ServerType)` always acted on whichever busy
server of a type happened to be first in the engine's internal entity array — there was no way to
say "preempt the lowest-priority in-service entity" or "finish whichever service has run longest."
`preemptCustomer`/`finishServiceForPair` were already fully parameterized on whatever `(cust, srv)`
pair is handed to them, so this was purely a **selection** change.

## Syntax and semantics

`PREEMPT(ServerType[, Criterion])` / `FINISH(ServerType[, Criterion])` where `Criterion` is
`PRIORITY(attrName)`, `LONGEST`, or `SHORTEST`.

**Confirmed with the user before implementation:**
- All three criteria supported (not attribute-only), since FINISH's "activity of unknown duration"
  scenarios often have no meaningful priority attribute to rank by.
- `PRIORITY(attrName)` targets the **lowest**-valued entity — matches the existing queue-discipline
  `PRIORITY(attrName)` comparator's ascending direction exactly, so the same attribute means the
  same thing whether it's driving a queue or a preemption/finish criterion.
- Omitting the criterion, or giving an unrecognized one, keeps today's first-busy-server behavior
  — every existing call parses and behaves identically; an unrecognized criterion logs a warning
  rather than erroring.

## Shipped

Four commits on `claude/macro-library-ui-coverage-bydeiz`:

1. **`engine: PREEMPT/FINISH victim-selection criterion`** — `src/engine/entities.js` (new shared
   `selectVictimServer()` helper, mirroring `queueDisciplineComparator`'s `PRIORITY(attrName)`
   idiom exactly), `src/engine/macros.js` (both handlers). Ranks by elapsed service time
   (`clock - serviceStart`) rather than remaining time, since `srv._scheduledDuration` isn't
   reliably set for every busy server. New
   `tests/engine/sprint-97-preempt-finish-victim-selection.test.js`.
2. **`editors: PREEMPT/FINISH criterion composer`** — `src/ui/editors/helpers.jsx`,
   `src/ui/editors/BEventEditor.jsx`. Renamed the Sprint 96 `failRepairServerTypes`
   expressionContext field to `bEventServerTypes` (same value, now shared with PREEMPT's
   composer). Caught and fixed a bug before shipping: the priority-attribute select displayed a
   default via a `||` fallback without committing it to state, which would have left Add wrongly
   disabled.
3. **`engine: simpy-export — FINISH TODO stub, PREEMPT stub mentions criterion`** —
   `src/engine/simpy-export.js`. Found and fixed a pre-existing gap during design review: FINISH
   was silently dropped by SimPy export (absent from `TODO_MACRO_SET`, unhandled everywhere else),
   so a model using it exported as "fully supported" while the script contained no FINISH logic at
   all — now it's honestly flagged as a category-2 TODO stub.
4. **`docs: Sprint 97 PREEMPT/FINISH victim selection`** — updated `help-reference.md`,
   `model-schema-for-llm.md` (the row that explicitly documented "first busy server" semantics),
   `engine-api-reference.md`, `addition1_entity_model.md`, `DES_Studio_User_Guide.md`, plus two
   opportunistic pre-existing-gap fixes: `Template Models Guide.md` mislabeled PREEMPT as a
   C-Event in two places (it's a B-event macro everywhere else), and `help-knowledge-base.json`'s
   C-event macro list omitted `FINISH` entirely.

Full suite verified green after each commit: 218 test files / 3309 tests passing
(`npx vitest run --project unit --project ui`), plus a clean `npx eslint` pass (only pre-existing
warnings, no new ones).

## Out of Scope / Backlog

- `_arbitration`/trace-viewer fidelity for PREEMPT: currently dead for PREEMPT (B-event firing
  never captures `_arbitration` into a trace entry, and `BottomPanel.jsx`'s renderer is hard-coded
  to ASSIGN's winner/losers shape) — wiring it up needs new B-event trace capture *and* a new
  BottomPanel rendering branch, a UI feature in its own right, not attempted here.
- `JOIN` (fork/join for SPLIT lineage) and k-way `MATCH` remain the last two Group B backlog items.
