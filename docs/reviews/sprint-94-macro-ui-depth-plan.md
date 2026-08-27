# Sprint 94 — Macro Composer Depth: Close the UI ↔ Engine Gaps

**Sprint:** 94
**Theme:** Make every engine-supported macro variant authorable from the structured effect pickers, eliminating the "the macro exists but the UI only writes its most basic form" cliffs found in the macro coverage audit
**Status:** ✅ Complete
**Owner:** parkinsonsj@gmail.com
**Source:** `docs/reviews/macro-library-ui-coverage-audit.md` (2026-08-27) — Group A gaps 1–8

---

## Shipped

All five workstreams (W1–W5) landed as planned, each emitting exactly the forms this doc
specifies. Implementation note: W1–W5 all touch the same `EffectPicker` component in
`src/ui/editors/helpers.jsx` with logic that's interleaved by macro (shared state, shared
`addExpr()` switch, shared Add-button disable expression), so they shipped as one commit rather
than five — splitting them would have meant risky manual hunk surgery on a single file rather
than a cleaner history. The plumbing (engine export + expressionContext fields) and the two
retirements shipped as their own separate, independently-revertable commits, per the Acceptance
Criteria below:

1. `engine+editors: export safeArithmetic; plumb composer context fields`
2. `editors: close macro composer depth gaps (Sprint 94)` — W1–W5 + the engine round-trip test
   guard + the BEventEditor C-event-only guard test + the 3-type COSEIZE validation fixture
3. `editors: retire the enumerated ASSIGN container:1 family`
4. `editors: retire the enumerated COSEIZE one-sided-skill variants`

Full suite verified green after each commit: 215 test files / 3254 tests passing
(`npx vitest run --project unit --project ui`), plus a clean `npx eslint` pass (only
pre-existing warnings, no new ones).

---

## Goal

The audit confirmed all 24 macros are reachable from the UI, but eight engine capabilities are not:
the pickers hard-code amounts, forbid valid parameter combinations, or drop whole families above
enumeration caps. Because the editors are structured-only (no free-text effect field, audit C1 —
a decision this sprint preserves), these are hard walls, not inconveniences. This sprint upgrades
the composers so the structured path can express everything the engine parses.

Engine-level limits (Group B of the audit: FINISH/PREEMPT victim selection, partial FAIL, COSEIZE
quantities, k-way MATCH, JOIN) are **explicitly out of scope** — they need engine + schema design
and belong in their own sprint.

---

## Scope Guardrails

- No Supabase migrations, no new dependencies, no engine changes — every workstream emits effect
  strings the engine **already parses today** (verified against `src/engine/macros.js` regexes)
- No new `model_json` fields → the CLAUDE.md schema-contract round-trip rule is not triggered
- The C1 rule stands: no free-text macro name or operand; only value/expression fields are typed
- Enumerated dropdown families stay for discoverability; composers become the superset path
- Visual Designer untouched: `classifyActivityEffect` already routes every form this sprint can
  produce (skill/container ASSIGN, COSEIZE, …) to the C-Events editor as "advanced"

---

## Workstreams

### W1 — Expression-capable amount fields (audit gaps 1, 4, 5)

**Files:** `src/ui/editors/helpers.jsx` (EffectPicker `addExpr` + inputs)

Replace the `<input type="number">` fields with the validated expression pattern COST/SET already
use, per macro:

- **BATCH**: quantity field accepts a literal integer ≥ 2 **or** an `Entity.<attr>` reference,
  offered via a small "literal / entity attribute" toggle whose attribute dropdown lists the
  target queue's customer-type integer attrs. Emits `BATCH(Q, 5)` or `BATCH(Q, Entity.batchSize)`.
  Guard: literal path keeps the `Math.max(2, …)` clamp; attribute path emits verbatim (engine
  validates ≥ 1 at run time and logs).
- **FILL / DRAIN**: amount field becomes a text input accepting a positive number **or** an
  expression (`Entity.attr`, state vars, `clock`, `+ - * /`, `min/max/abs/round/floor/ceil`).
  Client-side check: accept if it parses as a positive number, or matches the safe-expression
  token grammar (letters/digits/underscore/`Entity.`/operators/parens) — mirror of what
  `evalEntityExpr` consumes; never `eval`.
- Chip rendering: unchanged (chips already display the raw call).

### W2 — ASSIGN composer (audit gaps 1, 2, 3)

**Files:** `src/ui/editors/helpers.jsx` (new `ASSIGN` case in the expression-macro row),
`src/ui/editors/CEventEditor.jsx` (already passes `serverTypes` + `containerTypes` — verify
`skills` reach the picker via `expressionContext`)

A structured row with four pickers, emitting the full 4-argument engine form
`ASSIGN(source, server, skillClause?, Container:amount?)`:

1. **Source**: queue dropdown (falls back to customer types when no queues exist)
2. **Server**: server-type dropdown **plus an `ANY` entry** (fixes gap 3 — plain
   `ASSIGN(Q, ANY)` with no skill)
3. **Skill** (optional): `— none —` / each model skill (emits `"Skill"`) / each string attr of the
   source's customer type (emits `Entity.attr`)
4. **Container gate** (optional): `— none —` / each container, with an amount field using the W1
   expression input (fixes gap 1's hard-coded `:1`)

Skill and container are independently optional, so the previously unreachable combined form
`ASSIGN(Q, Nurse, "Triage", Blood:2)` (gap 2) becomes authorable. The enumerated ASSIGN families
in `assignOptions` stay as quick picks; the "consuming 1 ⟨container⟩" family may be retired once
the composer ships (decide at review — it duplicates the composer at fixed amount 1).

### W3 — COSEIZE composer v2 (audit gap 6)

**Files:** `src/ui/editors/helpers.jsx`

Replace the fixed two-dropdown composer with a dynamic row list:

- "＋ add server type" appends a row: server-type dropdown + optional per-type skill dropdown
  (populated from that type's `skills`, mirroring `serverSkills` in `assignOptions`)
- Minimum 2 rows; duplicate types blocked in the Add-button disable logic (the engine rejects
  duplicates with a log message — catch it at authoring time instead)
- Emits `COSEIZE(Q, TypeA[Skill], TypeB, TypeC[Skill])` — N types, per-type skills, both
  previously unreachable
- The enumerated COSEIZE family (and its 50-option cap heuristics) can then be simplified: keep
  the plain 2-type entries under the cap, drop the one-sided-skill variants the composer now
  supersedes (their `coseizeCombosPerQueue` cost dominates the cap)

`validation.js` V38c/V38d already parse arbitrary-arity COSEIZE type lists — no change needed
(verify with a 3-type fixture in tests).

### W4 — Optional MATCH predicate (audit gap 7)

**Files:** `src/ui/editors/helpers.jsx`

One-line behavior change plus affordance: an empty predicate field emits the plain 5-arg
`MATCH(TypeA, QA, TypeB, QB, Target)`; a non-empty one keeps the current quoted 6-arg form.
Update the Add-button disable logic (predicate no longer required) and the placeholder text
("optional — e.g. Entity.bloodType == Other.bloodType"). This restores plain MATCH on models
above the 50-option enumeration cap.

### W5 — SPLIT clone-type picker (audit gap 8)

**Files:** `src/ui/editors/helpers.jsx`

Add an entity-type dropdown to the SPLIT composer, defaulting to the target queue's
`customerType` (current behavior), emitting `SPLIT(ChosenType, N, Q)`. Also apply W1's
literal-only→expression treatment **only if** trivial; the engine's SPLIT N is `(\d+)` — a
literal — so the quantity field stays numeric (document this in the composer tooltip rather than
over-promising).

---

## Tests

All in `tests/ui/editors/effect-picker.test.jsx` (extend existing suite) unless noted:

1. W1: BATCH emits `BATCH(Q, Entity.batchSize)` via attribute mode; FILL/DRAIN accept
   `Entity.amount * 2` and reject `-1` / empty / `; DROP`ish garbage (grammar check)
2. W2: composer emits each of — plain, `ANY` no-skill, skill-literal, `Entity.attr` skill,
   container with expression amount, and the combined skill+container form; every emitted string
   is asserted to match the engine's `ASSIGN` regex (import `MACROS` from `src/engine/macros.js`
   and test `pattern.test(value)` — this pins UI output to engine grammar, the audit's core issue)
3. W3: 3-type COSEIZE with two skills emits correctly and matches the engine pattern; duplicate
   type disables Add; V38c/V38d still fire on a 3-type fixture (`tests/engine/validation.test.js`)
4. W4: empty predicate → 5-arg MATCH; non-empty → quoted 6-arg
5. W5: type picker overrides the queue-derived type
6. Regression: every pre-existing enumerated option still emits a string matching its engine
   pattern (cheap loop over `bEffectOptions`/`assignOptions` output — locks the whole surface)

Run via `.opencode/skills/run-tests` (Vitest `ui` project).

---

## Acceptance Criteria

- Every Group A gap (1–8) in the coverage audit is authorable end-to-end from the Forms editors
- No free-text macro/operand field introduced (C1 preserved)
- All emitted effect strings validated against the engine's own `MACROS[].pattern` in tests
- No engine, schema, or canvas changes; existing enumerated options unchanged except the two
  documented retirements (ASSIGN container:1 family, superseded COSEIZE skill variants) — each
  retirement is its own commit so it can be reverted independently

---

## Out of Scope / Backlog (needs its own design)

- Engine Group B items: `JOIN` (fork/join for SPLIT lineage), `FAIL(Type, N)` partial failure,
  PREEMPT/FINISH victim-selection, COSEIZE quantities, k-way MATCH — each adds engine semantics
  and likely schema fields (round-trip tests required per CLAUDE.md)
- Surfacing SimPy-export TODO macros at authoring time (a "won't export cleanly" badge in the
  picker) — nice-to-have, pairs naturally with the Sprint 88 export consolidation follow-up
- `RENEGE(id)` numeric variant — debug-only, intentionally unexposed
