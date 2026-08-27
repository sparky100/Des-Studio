# Sprint 96 — FAIL/REPAIR Quantities: "1 of 5 CT Scanners Breaks"

**Sprint:** 96
**Theme:** Add a quantity to FAIL and REPAIR — the second Group B engine-level gap from the macro
coverage audit (`docs/reviews/macro-library-ui-coverage-audit.md`), following Sprint 95's COSEIZE
quantities
**Status:** ✅ Complete
**Owner:** parkinsonsj@gmail.com
**Source:** Group B, "FAIL / REPAIR are all-or-nothing per server type" — user-selected priority
after Sprint 95

---

## Goal

Before this sprint, `FAIL(ServerType)` and `REPAIR(ServerType)` always acted on **every** server of
that type at once — modelling "one of five CT scanners breaks down" (equipment reliability with
partial fleet impact) was unreachable. This sprint adds an optional quantity `N` to each macro.

## Syntax and semantics

`FAIL(ServerType[, N])` / `REPAIR(ServerType[, N])` — mirrors `DELAY`'s existing optional trailing
integer precedent (`/(?:\s*,\s*(\d+))?/`), no new syntax idiom. Unlike COSEIZE's `Type:N` (where
omitting N meant 1, since COSEIZE's default is a single seize), here omitting N means **"all"** —
FAIL/REPAIR's existing behavior before this sprint — so every pre-existing call is 100% unchanged.

**Confirmed with the user before implementation:**
- `FAIL(Type, N)` prefers **idle servers first**, only touching busy/serving ones once idle
  capacity is exhausted — least disruptive by default.
- `REPAIR(Type, N)` prefers the **longest-failed servers first** (by `_failedAt`) — like a
  maintenance queue clearing its oldest tickets.
- Requesting more than are available/failed fails or repairs all available and notes the shortfall
  in the log message, rather than erroring.

## Shipped

Three commits on `claude/macro-library-ui-coverage-bydeiz`:

1. **`engine: FAIL/REPAIR quantities — FAIL(Type, N) / REPAIR(Type, N)`** — `src/engine/macros.js`.
   `repairServers`/`preemptCustomer` (`src/engine/entities.js`) needed no changes — their per-server
   bookkeeping loops already operate on whatever array is handed to them; only the *selection* step
   in the macros themselves needed to change (idle-then-busy concat for FAIL, sort-by-`_failedAt`
   for REPAIR). New `tests/engine/sprint-96-fail-repair-quantities.test.js`.
2. **`editors: FAIL/REPAIR partial-quantity composer`** — `src/ui/editors/helpers.jsx`,
   `src/ui/editors/BEventEditor.jsx`. New composer entry (server-type select + validated quantity,
   min 1), following the BATCH/SPLIT pattern; the existing enumerated "FAIL all N servers" quick
   picks are unchanged. New `expressionContext.failRepairServerTypes` field is deliberately
   distinct from `serverTypes` (which gates the C-event-only ASSIGN/COSEIZE composers), so it only
   unlocks the FAIL/REPAIR composer without leaking those seize-side composers into B-events.
3. **`engine: simpy-export FAIL/REPAIR stub comments mention quantity N`** — `src/engine/simpy-export.js`.
   FAIL/REPAIR remain TODO stubs (no runtime code generated); the stub comment now explains the
   quantity semantics for anyone completing the stub by hand.

Docs updated: `docs/help-reference.md`, `docs/model-schema-for-llm.md`,
`docs/engine-api-reference.md`, `docs/user/simpy-export.md`, `docs/Template Models Guide.md`,
`docs/addition1_entity_model.md`, `docs/help-knowledge-base.json`.

Full suite verified green after each commit: 217 test files / 3289 tests passing
(`npx vitest run --project unit --project ui`), plus a clean `npx eslint` pass (only pre-existing
warnings, no new ones).

## Out of Scope / Backlog (Group B, remaining)

- `JOIN` (fork/join for SPLIT lineage)
- `PREEMPT`/`FINISH` victim-selection criteria
- k-way `MATCH`
