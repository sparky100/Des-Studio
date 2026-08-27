# Sprint 95 — COSEIZE Quantities: "2 Nurses + 1 Doctor" in One Atomic Seize

**Sprint:** 95
**Theme:** Add a quantity to each COSEIZE server-type entry — the highest-priority Group B
engine-level gap from the macro coverage audit (`docs/reviews/macro-library-ui-coverage-audit.md`)
**Status:** ✅ Complete
**Owner:** parkinsonsj@gmail.com
**Source:** Group B, "COSEIZE quantities" — user-selected priority after Sprint 94

---

## Goal

Sprint 94 closed all eight UI-composer depth gaps (Group A) from the macro coverage audit. Group B
logged five engine-level limits as backlog; the user picked **COSEIZE quantities** first. Before
this sprint, `COSEIZE(Queue, Type1[Skill1], Type2[Skill2], ...)` seized exactly one server per
listed type and explicitly rejected a repeated type — "seize 2 Nurses and 1 Doctor for this
patient atomically" was unreachable at any layer (engine, validation, UI, or SimPy export).

## Syntax

`Type[Skill]:N` — one arg per type, skill bracket unchanged, `:N` quantity suffix appended, default
`N=1` when omitted so every pre-existing COSEIZE call parses and behaves identically. A type still
appears as only one arg — request more via `Type:N`, never by repeating the arg. Directly
consistent with `ASSIGN`'s existing `Container:amount` colon convention.

`RELEASE_COSEIZED` releases **all** currently-claimed servers of each listed type, permanently —
no partial-release syntax now or planned (confirmed with the user). The new authoring-time
validation rule (V38f, duplicate COSEIZE type) is a warning, consistent with V38c/d/e.

## Shipped

Five commits on `claude/macro-library-ui-coverage-bydeiz`:

1. **`engine: COSEIZE Type:N quantity syntax + RELEASE_COSEIZED release-all fix`** —
   `src/engine/macros.js`. Check-all-before-claim-any extended to "at least N idle" per type;
   `RELEASE_COSEIZED` changed from `entities.find` to `entities.filter` (fixes a one-of-N leak).
   New `tests/engine/sprint-95-coseize-quantities.test.js`.
2. **`engine: validation V38c/d :N-strip, new V38f rule, V-SKILL-2 bracket fix`** —
   `src/engine/validation.js`. Also fixed a pre-existing bug found during design review: V-SKILL-2
   had its own, third independent COSEIZE bracket-parser that silently failed to match (and so
   silently skipped skill validation) on any quantified skilled arg.
3. **`ui/execute: strip :N in activityLiveData's extractServerTypes`** —
   `src/ui/execute/activityLiveData.js`. Verified during design that live busy/idle/capacity stats
   already compute against the real server-entity fleet per type, not per-call declared quantity —
   so this was the only change needed for the Execute view; no new grouping/counting UI.
4. **`editors: COSEIZE composer per-row quantity field`** — `src/ui/editors/helpers.jsx`. Extends
   the Sprint 94 COSEIZE composer with a numeric quantity input per row; default qty=1 emits
   byte-identical strings to before.
5. **`engine: simpy-export COSEIZE quantity — N requests per type, shared resource, scaled
   busy-accounting`** — `src/engine/simpy-export.js`. Also fixed a pre-existing bug found during
   design review: `resource_busy` accounting didn't scale by quantity (would under-report
   utilization for any quantity-seized type), and the export had no bracket-stripping anywhere
   (a skilled COSEIZE arg previously generated a resource variable name matching nothing declared).

Docs updated: `docs/help-reference.md`, `docs/model-schema-for-llm.md`,
`docs/help-knowledge-base.json`, `docs/user/simpy-export.md`, `docs/engine-api-reference.md`.

Full suite verified green after each commit: 216 test files / 3277 tests passing
(`npx vitest run --project unit --project ui`), plus the RELEASE_COSEIZED-sensitive
`phase-c-dirty-filter.test.js` soak test, and a clean `npx eslint` pass (only pre-existing
warnings, no new ones).

## Out of Scope / Backlog (Group B, remaining)

- `JOIN` (fork/join for SPLIT lineage)
- `FAIL(Type, N)` partial failure
- `PREEMPT`/`FINISH` victim-selection criteria
- k-way `MATCH`
- Partial release for `RELEASE_COSEIZED` — explicitly decided as a **permanent** limitation, not
  backlog, during this sprint's design review.
