# DES Studio — Build Plan
*Living document. Update after each sprint completion.*
*Version: 1.0 | Created: 2026-04-30 | Grounded in: Full Codebase Audit 2026-04-30*
*Branch audited: `claude/audit-part-1-orientation-lhK9K`*

---

## Important: What This Plan Is

This plan **builds on the existing application**. It does not rebuild from scratch.
Every feature is classified against its actual audit status before a prompt is written.
Claude Code must read the relevant existing files before touching anything.

### Audit Status Key Used Throughout

| Symbol | Meaning | Action |
|---|---|---|
| ✓ | Exists and works correctly | Preserve — do not rewrite |
| ~ | Exists but incomplete or incorrect | Extend or fix the existing code |
| ✗ | Absent entirely | Build new |

### Sprint Status Key

| Symbol | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |
| ⏭ | Deferred |
| ❌ | Cancelled |

---

## Document History

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-30 | Initial plan from audit findings |
| 1.1 | 2026-05-01 | Post-Sprint 1 update — sprint status recorded; Sprint 1 completion gate results noted |
| 1.2 | 2026-05-03 | Added Sprint 6 (LLM Integration & Results Analysis), Sprint 7 (Dynamic Distributions & Time-Varying Resources), and Sprint 8 (LLM Chat Model Builder). Features derived from design sessions in chats "LLM model integration and results analysis", "dynamic sampling distributions and time varying resources", and "Building models through LLM chat interface". Absent-feature register updated. |
| 1.3 | 2026-05-03 | Sprint 2 complete — 215 tests passing (14 files), build 3.29s. Sprint 3 started. |
| 1.4 | 2026-05-03 | Added F5.9 — model delete UI with owner-only guard. Identified gap: no UI surface for model deletion existed in any prior sprint. |
| 1.5 | 2026-05-04 | Sprint 3 complete — Experiment Controls. Includes warm-up period, termination conditions, unified experiment panel, DB layer tests, engine test completion, and ADR-002 resolution (fork model). Noted persistent 'JS heap out of memory' error during full/engine test runs. |
| 1.6 | 2026-05-04 | Resolved Vitest heap issue. Root cause was unbounded seeded engine tests running open-ended `runAll()` simulations with full snapshot logs. Full suite now passes: 17 files, 272 tests. |

---

## Sprint History

| Sprint | Status | Completed | Description | Tests Passed (Total) | M/M/1 Error | Build | Notes |
|---|---|---|---|---|---|---|---|
| Pre-Sprint | ✅ Complete | 2026-04-30 | Project setup, initial audit & plan. | ~120 (120) | N/A | Success | Initial setup of CLAUDE.md, .env.example, etc. |
| Sprint 1 | ✅ Complete | 2026-05-03 | Engine safety and correctness hardening. | 182 (182) | 1.48% | Success | Fixes for XSS, C-scan restart, queue discipline, seeded RNG, validation, DistPicker. |
| Sprint 2 | ✅ Complete | 2026-05-03 | UI Editor Completeness. | 215 (215) | N/A | Success | Configured JSDOM, enhanced ConditionBuilder, etc. |
| Sprint 3 | ✅ Complete | 2026-05-04 | Experiment Controls (Warm-up, Termination, Fork Model). | 272 (272) | 1.48% | Success | ADR-002 implemented. Vitest heap issue resolved; full suite passes. |

---

## What Already Exists — Audit Summary

Before reading the sprint plan, understand what the existing app provides.
Claude Code must never rewrite a working component — only extend or fix it.

### Working and Must Be Preserved (✓)

| Component | File(s) | Notes |
|---|---|---|
| Three-Phase engine — Phase A, B, C | `src/engine/index.js` | Structurally correct |
| All five macros | `src/engine/macros.js` | ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE correct |
| ~120 engine unit tests | `tests/` | Node environment, Vitest |
| FIFO queue discipline | `src/engine/entities.js:86–88` | Works correctly |
| IDLE/BUSY resource tracking | `src/engine/macros.js` | idleOf/busyOf helpers correct |
| EntityTypeEditor + AttrEditor | `src/ui/editors/index.jsx` | Create, patch, delete working |
| StateVarEditor | `src/ui/editors/index.jsx` | Working |
| BEventEditor with schedule rows | `src/ui/editors/index.jsx` | Working |
| CEventEditor + ConditionBuilder | `src/ui/editors/index.jsx` | Working structure |
| QueueEditor | `src/ui/editors/index.jsx` | Working (discipline bug in engine, not here) |
| Node CRUD (add/update/delete) | All editors | Working across all five types |
| Run history table | `src/ui/execute/index.jsx` | Last 20 runs displayed |
| VisualView | `src/ui/execute/index.jsx` | Server bays, queue lanes, entity tokens |
| StepLog | `src/ui/execute/index.jsx` | Phase-tagged event log |
| EntityTable | `src/ui/execute/index.jsx` | Entity status table |
| saveStatus banner | `src/ui/execute/index.jsx` | saving/saved/error states |
| Supabase auth + session | `src/App.jsx`, `src/db/supabase.js` | Auth listener working |
| Model CRUD wrappers | `src/db/models.js` | Working |
| user_id on models | `src/db/models.js` | Multi-user isolation in place |

### Partial — Needs Extending or Fixing (~)

| Component | File(s) | Problem | Sprint |
|---|---|---|---|
| C-scan restart rule | `engine/index.js:121–142` | Pass-granularity, not event-granularity | S1 |
| ConditionBuilder AND/OR | `editors/index.jsx` | Flat chains only, no nesting | S2 |
| Operator filtering | `editors/index.jsx` | All operators shown regardless of valueType | S2 |
| DropField Custom... | `editors/index.jsx:144–149` | Exists but feeds new Function() — must be removed | S1 |
| Stats panel | `execute/index.jsx` | Runs count always 0, queues count omitted | S2 |
| M/D/1 benchmark | `tests/` | Exists but uses Fixed dist, not Exponential | S1 |

### Absent — Build New (✗)

| Feature | Sprint |
|---|---|
| Seeded RNG | S1 |
| LIFO and Priority queue discipline in engine | S1 |
| Pre-run model validation | S1 |
| Phase C truncation warning | S1 |
| DistPicker (latent crash — import missing) | S1 |
| UI test environment (jsdom) | S2 |
| valueType operator filtering in ConditionBuilder | S2 |
| Per-C-event explicit priority field | S2 |
| Drag-to-reorder C-events | S2 |
| Attribute-based entity filter | S2 |
| Undo/redo | S2 |
| Unsaved-change warning | S2 |
| CSV import for distributions | S2 |
| Warm-up period (UI and engine) | S3 |
| Time-based termination (engine reads max_simulation_time) | S3 |
| Condition-based termination | S3 |
| Experiment configuration panel | S3 |
| DB layer tests | S3 |
| Engine test completion | S3 |
| Web Workers for engine | S4 |
| Multi-replication runner | S4 |
| Supabase real-time subscription | S4 |
| Running mean + 95% CI | S4 |
| React error boundaries | S5 |
| Model export (JSON) | S5 |
| Model import (JSON) | S5 |
| Results export | S5 |
| Keyboard navigation / ARIA | S5 |
| First-run onboarding | S5 |
| LLM-powered results analysis (natural language KPI interpretation) | S6 |
| LLM results comparison (scenario A vs B narrative) | S6 |
| LLM-generated sensitivity commentary | S6 |
| AI assistant panel (inline, collapsible) | S6 |
| Piecewise inter-arrival distribution (time-of-day rates) | S7 |
| NHPP (Non-Homogeneous Poisson Process) arrival scheduler | S7 |
| Resource shift schedule (capacity change B-Events) | S7 |
| Time-varying distribution picker UI | S7 |
| Shift schedule editor (capacity steps by time band) | S7 |
| LLM chat model builder — intent parsing to model JSON | S8 |
| LLM model builder — entity class suggestion from description | S8 |
| LLM model builder — iterative clarification loop | S8 |
| LLM model builder — diff-preview before apply | S8 |
| LLM model builder — validation integration | S8 |

---

## Pre-Sprint: Project Setup

Complete once before Sprint 1. These are prerequisites.

| Task | Status | Notes |
|---|---|---|
| Place `CLAUDE.md` in project root | ⬜ | Replaces missing/generic CLAUDE_WORKFLOW.md |
| Place `docs/addition1_entity_model.md` | ⬜ | Entity schema and action vocabulary |
| Place `docs/decisions/ADR-001-auth-model.md` | ⬜ | Auth rules |
| Place `docs/decisions/ADR-002-public-model-runs.md` | ⬜ | Deferred decision |
| Create `.env.example` | ⬜ | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Confirm `npm run dev` starts | ⬜ | — |
| Confirm `npm test` passes all ~120 engine tests | ⬜ | Node environment |

### Pre-Sprint Orientation Prompt

```
Read CLAUDE.md and docs/addition1_entity_model.md in full.
Do not write any code.

This project has an existing working application. Before Sprint 1:
  1. Confirm you have read CLAUDE.md in full
  2. Confirm you have read docs/addition1_entity_model.md in full
  3. Run: npm test — report how many tests pass and how many fail
  4. Run: npm run dev — confirm it starts without errors
  5. Confirm you understand which files must NOT be rewritten:
     - src/engine/index.js (Three-Phase loop — correct structure)
     - src/engine/macros.js (five macros — correct)
     - src/ui/editors/index.jsx (existing editors — extend, don't replace)
     - src/ui/execute/index.jsx (run panel — extend, don't replace)
     - src/db/models.js (CRUD wrappers — extend, don't replace)

Report the result of each check. Flag anything that blocks Sprint 1.
```

---

## Sprint 1 — Engine Safety & Correctness

**Goal:** Fix every issue that causes incorrect or misleading results.
All fixes operate on existing files — no new architecture.
**Exit gate:** M/M/1 benchmark exits 0. All ~120 existing tests still pass.

**Status:** ⬜ Not started | **Started:** — | **Completed:** —

> **Rule for this sprint:** Read the target file before proposing any change.
> Every task modifies existing code. None creates new files except test files.

---

### Sprint 1 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 1 of DES Studio.

The existing app has a working Three-Phase engine, five correct macros,
and form-based editors for all five model element types.
Sprint 1 fixes correctness and security issues in the existing code.
It does NOT build new features.

Audit findings to fix:
  C1 — new Function() eval in conditions.js / macros.js (XSS on public models)
  C3 — C-scan restart rule is pass-granularity (engine/index.js:121–142)
  C2 — LIFO/Priority ignored by engine (entities.js:84–88)
  C7 — Math.random() used throughout (distributions.js:84, phases.js:93,136)
  C5 — No pre-run validation (execute/index.jsx:141–147)
  C6 — Stale B-Event refs after deletion (phases.js:91,125)
  C4 — Phase C truncation silent (engine/index.js:121)
  C10 — Distribution inputs missing type="number" (editors/index.jsx:171,241,731)
  C11 — DistPicker ReferenceError in components.jsx (missing import)

Each fix modifies existing files. No file is deleted or replaced.
The ~120 existing engine tests must still pass after every task.

Task order (strict):
  F1.1 — Remove new Function() from conditions.js, macros.js, editors/index.jsx
  F1.2 — Fix C-scan restart rule in engine/index.js
  F1.3 — Implement LIFO/Priority in entities.js waitingOf()
  F1.4 — Add seeded RNG to distributions.js, thread through buildEngine()
  F1.5 — Add validateModel() before buildEngine(); fix C6, C10
  F1.6 — Surface Phase C truncation; fix DistPicker import (C11)
  F1.7 — Fix M/M/1 benchmark (currently M/D/1); confirm exits 0

Flag risks and dependencies before we start.
```

---

### F1.1 — Remove new Function() Eval

**Audit status:** ~ (exists — must be removed and replaced)
**Existing code:** `conditions.js:76`, `macros.js:220`, `editors/index.jsx:144–149`
**Action:** Fix existing files — do not create new files except test file
**Status:** ⬜ | **Completed:** —

```
Re-read CLAUDE.md. Task F1.1 of Sprint 1.

Read these existing files before writing a single line:
  - src/engine/conditions.js  (find the new Function() call at line 76)
  - src/engine/macros.js      (find the new Function() call at line 220)
  - src/ui/editors/index.jsx  (find Custom... and DropField at lines 144–149)

Show me the exact current code at each location.
Explain what the code does today and what the safe replacement must do.

The replacement evaluator goes into conditions.js (the existing file).
It must handle the predicate JSON structure from docs/addition1_entity_model.md Section 4:
  - Resolve Entity.attr, Resource.id.status, Queue.id.length from state object
  - Apply operators: == != < > <= >= (number); == != (string/boolean)
  - Handle AND/OR compound predicates

In editors/index.jsx:
  - Remove the Custom... option from DropField entirely
  - Fix DropField:131 so unknown stored values do not auto-activate free-text

Write tests/engine/conditions.test.js (new file) BEFORE implementing:
  - Include a security test: predicate with variable 'process.exit' must not execute
  - Run the test — confirm it fails on current code
  Then implement the fix in the existing files.
  Run the test — confirm it passes.
```

**Completion checklist:**
- [ ] `grep -r "new Function" src/` returns nothing
- [ ] `grep -r "eval(" src/` returns nothing
- [ ] `Custom...` option absent from `DropField`
- [ ] `DropField:131` auto-activate fixed
- [ ] `tests/engine/conditions.test.js` passes including security test
- [ ] All ~120 existing engine tests still pass

---

### F1.2 — Fix C-Scan Restart Rule

**Audit status:** ~ (Phase C exists — restart rule is wrong granularity)
**Existing code:** `engine/index.js:121–142` — outer while loop correct, inner for-loop missing break
**Action:** Add `break` to existing for-loop — one line change, one new test
**Status:** ⬜ | **Completed:** —

```
Re-read CLAUDE.md Section 4. Task F1.2 of Sprint 1.

Read src/engine/index.js lines 115–150.
Show me the exact current Phase C loop code.

The audit confirmed: the outer while(cFired) loop is correct.
The problem is inside the for-loop — when a C-Event fires, the
scan continues to the next C-Event in the same pass rather than
restarting from Priority 1.

The fix is a single break statement inside the for-loop
after fireCEvent() is called.

Write the test in tests/engine/three-phase.test.js first:
  test('C-scan restarts from Priority 1 on any C-Event fire')
  Setup: two C-Events
    Priority 1: condition false initially, becomes true after Priority 2 fires
    Priority 2: condition true initially
  Expected: Priority 1 fires on the restart pass after Priority 2 fires
  Current (wrong): Priority 1 is skipped in the same cycle

Confirm the test FAILS on current code.
Add the break statement.
Confirm the test PASSES.
Confirm all ~120 existing tests still pass.
```

**Completion checklist:**
- [ ] `break` added inside for-loop after `fireCEvent()`
- [ ] New test fails on pre-fix code (document the output)
- [ ] New test passes after fix
- [ ] All existing tests still pass

---

### F1.3 — Implement Queue Discipline in Engine

**Audit status:** ✗ (LIFO/Priority exist in UI — engine ignores q.discipline entirely)
**Existing code:** `entities.js:84–88` — `waitingOf()` sorts by arrivalTime only
**Action:** Extend `waitingOf()` in existing `entities.js`
**Status:** ⬜ | **Completed:** —

```
Re-read CLAUDE.md Section 6. Task F1.3 of Sprint 1.

Read src/engine/entities.js — show me the current waitingOf() function.

Confirm: the audit found q.discipline is never read here.
The UI already stores FIFO/LIFO/PRIORITY correctly in the model.
The engine just never reads it.

Extend waitingOf() to read q.discipline and sort accordingly:
  FIFO:     sort ascending by arrivalTime (already done — keep it)
  LIFO:     sort descending by arrivalTime
  PRIORITY: sort ascending by Entity.priority attribute value;
            FIFO (arrivalTime ascending) as tiebreaker

Add tests to tests/engine/entities.test.js:
  - FIFO: entity with smallest arrivalTime selected
  - LIFO: entity with largest arrivalTime selected
  - PRIORITY: entity with smallest priority value selected
  - PRIORITY tiebreaker: equal priority → smallest arrivalTime
  - Entity filter: non-matching entities excluded before queue rule

The QueueEditor already shows LIFO and PRIORITY options correctly.
No UI changes needed — this is an engine-only fix.
Confirm all existing tests still pass.
```

**Completion checklist:**
- [ ] `waitingOf()` reads `q.discipline`
- [ ] LIFO and PRIORITY sort logic implemented
- [ ] FIFO tiebreaker on equal PRIORITY values
- [ ] Five new tests pass
- [ ] All existing tests still pass

---

### F1.4 — Add Seeded RNG

**Audit status:** ✗ (acknowledged gap — test.todo exists in engine tests)
**Existing code:** `distributions.js:84`, `phases.js:93,136` — Math.random() throughout
**Action:** Add mulberry32 to `distributions.js`; thread seed through `buildEngine()`
**Status:** ⬜ | **Completed:** —

```
Re-read CLAUDE.md Section 9.2. Task F1.4 of Sprint 1.

Run: grep -rn "Math.random" src/engine/
List every file and line returned. These all need replacing.

Read the current buildEngine() signature in src/engine/index.js.

Changes to make in existing files:
  1. Add mulberry32() function to distributions.js (do not replace the file)
  2. Update buildEngine() signature: buildEngine(model, seed, maxCycles = 500)
  3. Create seeded rng inside buildEngine and pass to all samplers
  4. Replace every Math.random() call in engine files with the seeded rng

The mulberry32 implementation:
  function mulberry32(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

Add to tests/engine/distributions.test.js:
  - Same seed produces identical sample sequence of 100 values
  - Different seeds produce different sequences

In the existing Execute panel (execute/index.jsx):
  - Add seed input field (integer, generates random default if empty)
  - Pass seed into buildEngine() call
  - Persist seed to runs table (column already exists in schema)

Confirm: grep -rn "Math.random" src/engine/ returns nothing after fix.
Confirm all existing tests still pass.
```

**Completion checklist:**
- [ ] `mulberry32` added to `distributions.js`
- [ ] `buildEngine(model, seed, maxCycles)` signature updated
- [ ] `grep -rn "Math.random" src/engine/` returns nothing
- [ ] Two reproducibility tests pass
- [ ] Seed field in Execute panel (extends existing panel)
- [ ] Seed persisted to `runs` table

---

### F1.5 — Pre-Run Model Validation

**Audit status:** ✗ (no validation exists — buildEngine called directly)
**Existing code:** `execute/index.jsx:141–147` — Run button calls buildEngine() directly
**Action:** Add `validateModel()` before `buildEngine()` call in existing execute panel
**Status:** ⬜ | **Completed:** —

```
Re-read CLAUDE.md Section 8 and docs/addition1_entity_model.md Section 7.
Task F1.5 of Sprint 1.

Read src/ui/execute/index.jsx lines 135–155.
Show me the exact current Run button handler and buildEngine() call.

Read src/ui/editors/index.jsx lines 171, 241, 731.
Show me the distribution parameter inputs at these lines.
Confirm they are missing type="number".

Build validateModel(model) — new function, can live in a new
src/engine/validation.js file or added to existing index.js.
Implement V1–V10 from docs/addition1_entity_model.md Section 7.

Integration in execute/index.jsx (extend existing file):
  - Call validateModel(model) before buildEngine()
  - If blocking errors: disable Run, surface errors inline
  - Errors must appear in the relevant editor tab, not only in execute panel
  - Use the existing saveStatus banner pattern for error display

Also fix in existing editors/index.jsx:
  - Add type="number" to distribution parameter inputs at lines 171, 241, 731
  - Add deletion reference guard for B-Events (C6):
    when a B-Event is deleted, check if any C-Event schedule references it
    and warn the modeller before completing the deletion

Confirm all existing tests still pass after these changes.
```

**Completion checklist:**
- [ ] `validateModel()` implements V1–V10
- [ ] V11 warning implemented
- [ ] Run button disabled on validation failure
- [ ] Errors shown in editor tabs (not execute panel only)
- [ ] `type="number"` added at lines 171, 241, 731
- [ ] B-Event deletion guard warns on dangling references

---

### F1.6 — Surface Phase C Truncation + Fix DistPicker

**Audit status:** ✗ (C4) + ✗ (C11)
**Existing code:** `engine/index.js:121` (cap exists, silent), `shared/components.jsx` (DistPicker crashes)
**Action:** Extend existing engine and fix existing component
**Status:** ⬜ | **Completed:** —

```
Task F1.6 of Sprint 1. Two fixes in existing files.

FIX 1 — Phase C truncation (C4):
Read src/engine/index.js around line 121 — find the existing 100-pass cap.
Show me the current code.
  - Raise cap from 100 to 500
  - When cap is hit, add a log entry AND add a warning to the
    results object returned by buildEngine()
  - In the existing Execute panel (execute/index.jsx), display an
    amber banner when the results object contains this warning

FIX 2 — DistPicker crash (C11):
Read src/ui/shared/components.jsx — find DistPicker.
Show me the current import section and the reference to DISTRIBUTIONS.
  - Add the missing import so DistPicker renders without crashing
  - Confirm the distribution type list is sourced from the registry
    (CLAUDE.md Section 9.2) not a hardcoded array

After both fixes:
  npm run dev — confirm no console errors on load
  Open a model — open the distribution picker — confirm no crash
  Confirm all existing tests still pass.
```

**Completion checklist:**
- [ ] Phase C cap raised to 500 in existing `engine/index.js`
- [ ] Warning returned in results object when cap hit
- [ ] Amber banner shown in existing Execute panel
- [ ] DistPicker missing import fixed in `components.jsx`
- [ ] DistPicker renders without crashing
- [ ] All existing tests still pass

---

### F1.7 — Fix M/M/1 Benchmark

**Audit status:** ~ (benchmark exists — labelled M/M/1 but uses Fixed service dist — is actually M/D/1)
**Existing code:** benchmark file in `tests/` — find and fix
**Action:** Fix the existing benchmark — change service distribution to Exponential
**Status:** ⬜ | **Completed:** —

```
Task F1.7 of Sprint 1 — Sprint exit gate.

Read the existing benchmark file in tests/.
Show me the current service distribution configuration.

The audit confirmed the service distribution is Fixed (deterministic),
making this an M/D/1 model, not M/M/1.

Fix the existing benchmark:
  - Change service distribution from Fixed to Exponential(rate=μ)
  - Parameters: λ=0.9, μ=1.0, ρ=0.9
  - Analytical mean wait = ρ / (μ × (1 − ρ)) = 9.0 time units
  - Tolerance: 5%
  - N = 10,000 arrivals
  - Use a fixed seed so the result is reproducible
  - Exit 0 if within 5% tolerance, exit 1 if not

Run: node tests/[benchmark-filename]
Report: simulated value, analytical value, % error, exit code.

Sprint 1 is not complete until this exits 0.
Record the % error here: _____
```

**Completion checklist:**
- [ ] Benchmark uses Exponential service distribution
- [ ] Benchmark exits 0
- [ ] % error within 5% of 9.0 time units
- [ ] All ~120 existing engine tests still pass
- [ ] `npm run build` succeeds

---

### Sprint 1 Completion Gate

```bash
npm test                              # All ~120 existing tests + new tests pass
npm test -- three-phase               # Restart rule test passes
npm test -- distributions             # Seeded RNG reproducibility passes
npm test -- conditions                # Safe evaluator + security test passes
npm test -- entities                  # Queue discipline tests pass
node tests/[benchmark-filename]       # Exits 0 — record % error
grep -r "new Function" src/           # Must return nothing
grep -rn "Math.random" src/engine/    # Must return nothing
npm run build                         # Succeeds
```

**Sprint 1 Retrospective Prompt** *(run in claude.ai)*

```
Sprint 1 of DES Studio is complete.

What was fixed: [paste completed feature list with file locations]
M/M/1 benchmark result: [paste output — simulated value, analytical, % error]
Existing tests: [confirm count still ~120+new]
Any issues encountered: [paste drift corrections, unexpected findings]
Current CLAUDE.md: [paste]

Questions:
  1. Were any decisions made about the existing code that need an ADR?
  2. Did any existing tests break and need updating (legitimate change)?
  3. What gaps in the existing code did Sprint 1 uncover beyond the audit?
  4. What should Sprint 2 prioritise?
```

---

## Sprint 2 — UI Editor Completeness

**Goal:** Extend the existing editor components to be fully correct and complete.
All existing editors (EntityTypeEditor, BEventEditor, CEventEditor, QueueEditor, ConditionBuilder)
remain in place — this sprint extends them.

**Status:** ✅ Complete | **Started:** 2026-05-03 | **Completed:** 2026-05-03
**Prerequisite:** Sprint 1 exit gate passed.

---

### Sprint 2 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 2 of DES Studio.

The existing app has working editors for all five model element types.
Sprint 2 extends these existing components — it does not replace them.

Completed in Sprint 1: [paste]

Features (all extend existing files unless stated):
  F2.1 — Configure jsdom test environment (new: vite.config.js + tests/setup.js)
  F2.2 — Extend ConditionBuilder: operator filtering by valueType
  F2.3 — Extend ConditionBuilder: compound AND/OR with explicit precedence
  F2.4 — Extend CEventEditor + engine: attribute-based entity filter
  F2.5 — Extend CEventEditor: explicit priority field + drag-to-reorder
  F2.6 — Fix ConditionBuilder token list stale after prop change (C8)
  F2.7 — Add undo/redo history to model editor
  F2.8 — Add unsaved-change warning to navigation
  F2.9 — Extend DistPicker: CSV import flow
  F2.10 — Fix ModelCard owner (null) and version tag (hardcoded v6)

Definition of done:
  - npm test -- ui runs (new environment) with no failures
  - Predicate Builder type-safety confirmed by test
  - npm run build succeeds
```

---

### F2.1 — Configure jsdom UI Test Environment

**Audit status:** ✗ (vite.config.js set to node only — UI tests would fail)
**Existing code:** `vite.config.js` — `environment: 'node'` — needs `environmentMatchGlobs`
**Status:** ⬜ | **Completed:** —

```
Re-read CLAUDE.md Section 12.3. Task F2.1 of Sprint 2.

Read the current vite.config.js. Show me the test configuration.

The audit confirmed: environment is 'node' only.
UI tests cannot run in this environment.

Extend vite.config.js (do not replace):
  Add environmentMatchGlobs:
    ['tests/ui/**', 'jsdom']   ← UI tests get jsdom
  Keep existing 'node' as default for engine tests.

Install required packages:
  npm install -D @testing-library/react @testing-library/user-event
                 @testing-library/jest-dom jsdom

Create tests/setup.js (new file):
  - Import @testing-library/jest-dom
  - afterEach(cleanup) from @testing-library/react
  - Mock the Supabase client (CLAUDE.md Section 12.3 mock structure)
    Tests must NEVER hit the real database.

Create tests/ui/smoke.test.jsx (new file):
  - Render a simple React element, assert it appears in document
  - Confirms jsdom environment is working

Run: npm test -- ui
Confirm smoke test passes.
Confirm existing engine tests still pass (node env unchanged).
```

**Completion checklist:**
- [ ] `vite.config.js` has `environmentMatchGlobs` (not replaced)
- [ ] Packages installed in `devDependencies`
- [ ] `tests/setup.js` with Supabase mock created
- [ ] Smoke test passes
- [ ] Existing engine tests unaffected

---

### F2.2 — Extend ConditionBuilder: Operator Filtering by valueType

**Audit status:** ~ (operators shown but not filtered — all tokens treated as numeric)
**Existing code:** `editors/index.jsx` (ConditionBuilder) — extend the existing component
**Status:** ⬜ | **Completed:** —

```
Re-read CLAUDE.md Section 7.5 and docs/addition1_entity_model.md Section 2.3.
Task F2.2 of Sprint 2.

Read src/ui/editors/index.jsx — find ConditionBuilder.
Show me the current operator dropdown code.
Show me where valueType is defined on tokens but not consumed (audit note).

Extend the existing ConditionBuilder (do not replace it):
  - When a variable is selected, read its valueType
  - Filter the operator dropdown based on valueType:
      number  → == != < > <= >=
      string  → == !=
      boolean → == !=
  - Change the value input widget based on valueType:
      number  → input type="number"
      string with allowedValues → select dropdown
      string without → input type="text"
      boolean → select with true/false options

Write tests/ui/shared/predicate-builder.test.jsx (new file):
  - Selecting a number variable shows 6 operators only
  - Selecting a string variable shows 2 operators only
  - Selecting a boolean variable shows 2 operators only
  - Value input is type="number" for number variables
  - Value input is dropdown when allowedValues is set
  - Type-mismatched predicate cannot be constructed via the UI

Use @testing-library/react. Query by role — never by CSS class.
```

**Completion checklist:**
- [ ] Operator dropdown filtered by `valueType` in existing ConditionBuilder
- [ ] Value input widget changes by `valueType`
- [ ] Type-mismatched predicate impossible to construct
- [ ] Six tests pass

---

### F2.3 — Extend ConditionBuilder: Compound AND/OR

**Audit status:** ~ (flat AND/OR chains exist — no nesting, precedence undefined to user)
**Existing code:** `editors/index.jsx` (ConditionBuilder) — extend
**Status:** ⬜ | **Completed:** —

```
Task F2.3 of Sprint 2.

Read the existing ConditionBuilder AND/OR implementation.
Show me the current flat chain code.

Extend (do not replace) to support compound predicates matching
docs/addition1_entity_model.md Section 4.2:
  {
    "operator": "AND",
    "clauses": [
      { "variable": "...", "operator": "==", "value": "..." },
      { "variable": "...", "operator": ">=", "value": 1 }
    ]
  }

UI requirements:
  - Modeller can add AND or OR connector between predicates
  - When AND and OR are mixed at the same level, display the
    evaluation order explicitly (label each connector)
  - Serialised output must match the JSON structure above

Extend tests/ui/shared/predicate-builder.test.jsx:
  - AND compound serialises to correct nested JSON
  - OR compound serialises to correct nested JSON
  - Mixed AND/OR shows explicit evaluation order label in UI
```

**Completion checklist:**
- [ ] AND/OR compound predicates serialise to nested JSON
- [ ] Mixed AND/OR displays evaluation order explicitly
- [ ] Three new tests pass

---

### F2.4 — Entity Filter in C-Event (Engine + UI)

**Audit status:** ✗ (type-level selection only — no attribute-level filter)
**Existing code:** `editors/index.jsx` (CEventEditor), `engine/entities.js` (waitingOf)
**Status:** ⬜ | **Completed:** —

```
Task F2.4 of Sprint 2.

Read src/ui/editors/index.jsx — find CEventEditor and the SEIZE action config.
Read src/engine/entities.js — find waitingOf() (extended in F1.3).

Add an optional Entity Filter section to the existing CEventEditor:
  - Uses the Predicate Builder but restricted to Entity.* variables only
  - Resource.* and Queue.* variables must not appear here
  - Serialises to: { "entityFilter": {...}, "queueRule": "FIFO" }

Extend waitingOf() in entities.js to apply entityFilter before sorting:
  1. Filter candidates to those where entityFilter is true
  2. If zero candidates pass filter, SEIZE does not fire this pass
  3. Apply queue discipline (FIFO/LIFO/PRIORITY) to filtered set

Engine unit test (add to existing entities.test.js):
  - Entity filter excludes non-matching entities before queue rule

UI test (add to predicate-builder.test.jsx):
  - Entity filter picker only shows Entity.* variables
```

**Completion checklist:**
- [ ] Entity filter section in existing CEventEditor
- [ ] Only `Entity.*` variables available in entity filter
- [ ] `waitingOf()` applies filter before discipline sort
- [ ] SEIZE does not fire when no entities pass filter
- [ ] Engine unit test passes
- [ ] UI test passes

---

### F2.5 — C-Event Priority Field and Drag-to-Reorder

**Audit status:** ✗ (implicit array order — undiscoverable, no drag-to-reorder)
**Existing code:** `editors/index.jsx` (CEventEditor) — extend
**Status:** ⬜ | **Completed:** —

```
Task F2.5 of Sprint 2.

Read the existing CEventEditor — show me how C-Events are currently
listed and how their order is determined.

Extend CEventEditor (do not replace):
  - Display an explicit integer priority badge on each C-Event row
    (Priority 1 = highest, shown as a numbered badge)
  - Add drag-to-reorder using HTML5 drag-and-drop
    (do not add a new library without flagging first)
  - When order changes, update the priority integer on each C-Event
  - Store priority integers in model_json per C-Event

Write a UI test (add to tests/ui/editors/c-event-editor.test.jsx):
  - Priority badge visible on each C-Event row
  - Priority is shown as an integer (not hidden in array order)
```

**Completion checklist:**
- [ ] Priority badge on each row in existing CEventEditor
- [ ] Drag-to-reorder works and updates priority numbers
- [ ] Priority stored in `model_json`
- [ ] UI test passes

---

### F2.6 — Fix ConditionBuilder Token List Staleness

**Audit status:** ✗ — `editors/index.jsx:495` — missing dependency in hook
**Existing code:** `editors/index.jsx` around line 495
**Status:** ⬜ | **Completed:** —

```
Task F2.6 of Sprint 2.

Read editors/index.jsx around line 495.
Show me the current token list construction code.

The audit found: token list goes stale after prop change.
This is likely a missing dependency in a useEffect or useMemo.

Fix the dependency array so the token list updates when:
  - A new entity class is added
  - An attribute is added or removed from an entity class
  - An entity class is deleted

Write a UI test (add to tests/ui/editors/c-event-editor.test.jsx):
  - Render CEventEditor with one entity class
  - Simulate adding a new entity class via the model state
  - Confirm new entity's attributes appear in variable picker
    without page reload
```

**Completion checklist:**
- [ ] Token list updates on entity class change
- [ ] Token list updates on attribute change
- [ ] UI test passes

---

### F2.7 — Undo/Redo History Stack

**Audit status:** ✗ (no history stack anywhere)
**Existing code:** `editors/index.jsx` — add history tracking to existing model state
**Status:** ⬜ | **Completed:** —

```
Task F2.7 of Sprint 2.

Read src/ui/editors/index.jsx — show me how model state is currently managed.
Read src/db/models.js — show me the current save flow.

Before writing code, recommend one approach:
  Option A: In-memory history stack (undo reverts local state; user saves to persist)
  Option B: Supabase version history (store model_json snapshots per change)

Explain the tradeoff for this specific codebase and recommend one.
I will confirm before you implement.

The history must track:
  - Add/delete/rename entity class or attribute
  - Add/delete/rename B-Event or C-Event or Queue
  - At least 20 undo steps

Keyboard shortcuts: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo)
Visible undo/redo buttons in existing editor toolbar.
```

**Completion checklist:**
- [ ] Approach confirmed before implementation
- [ ] Undo/redo tracks minimum 20 steps
- [ ] Keyboard shortcuts working
- [ ] Toolbar buttons present in existing UI

---

### F2.8 — Unsaved-Change Warning

**Audit status:** ✗ (Back button discards silently — known defect)
**Existing code:** `App.jsx`, existing editor navigation
**Status:** ⬜ | **Completed:** —

```
Task F2.8 of Sprint 2.

Read src/App.jsx — find the navigation / back button handler.
Show me the current code.

Extend the existing navigation (do not replace App.jsx structure):
  - Track whether current model has unsaved changes
  - When user navigates away (Back, browser navigation):
    show dialog: "You have unsaved changes. Leave without saving?"
  - If confirmed: navigate, discard changes
  - If cancelled: stay on page
  - Register beforeunload handler for browser tab close / refresh

Write a UI test (add to tests/ui/editors/ or execute):
  - Make a change to model
  - Simulate clicking Back
  - Confirm warning dialog appears
  - Confirm navigation is blocked until resolved
```

**Completion checklist:**
- [ ] Warning dialog on navigation away
- [ ] `beforeunload` handler registered
- [ ] UI test passes

---

### F2.9 — DistPicker CSV Import

**Audit status:** ✗ (DistPicker fixed in F1.6 — CSV import not yet present)
**Existing code:** `shared/components.jsx` (DistPicker — now working after F1.6)
**Status:** ⬜ | **Completed:** —

```
Task F2.9 of Sprint 2.

Read src/ui/shared/components.jsx — find the DistPicker component
(now working after F1.6 fix).

Extend DistPicker to add CSV import:
  1. Add "Import from CSV" to the distribution type dropdown
  2. On select: open file picker (accept .csv)
  3. Parse CSV in browser — no server upload
  4. Let user select which column contains the values
  5. Show summary: filename, column, rows accepted, skipped, min, max, mean
  6. If > 10% rows skipped (non-numeric): show warning before confirming
  7. On confirm: store values array in model JSON as:
     { "type": "empirical", "values": [...], "sourceFile": "...", "column": "..." }

The CSV file is NEVER stored in Supabase. Values array only.
The engine has no knowledge of CSV files at runtime.

Write a UI test using a mock File object (add to tests/ui/shared/dist-picker.test.jsx).
```

**Completion checklist:**
- [ ] CSV option in existing DistPicker dropdown
- [ ] Column selection shown after parse
- [ ] 10% skip threshold warning shown
- [ ] Values array stored (no CSV file stored)
- [ ] UI test passes

---

### F2.10 — Fix ModelCard Owner and Version Tag

**Audit status:** ✗ — `const owner = null` hardcoded; version tag hardcoded "v6"
**Existing code:** `App.jsx` (ModelCard), `ui/execute/index.jsx` (version tag)
**Status:** ⬜ | **Completed:** —

```
Task F2.10 of Sprint 2. Two small fixes in existing files.

FIX 1 — ModelCard owner (App.jsx):
  Read App.jsx — find: const owner = null
  Fix to fetch the owner profile from the profiles table using model.user_id.
  Display username and avatar_url from the profiles table.

FIX 2 — Version tag (execute/index.jsx or ModelDetail):
  Find the hardcoded "v6" string.
  Replace with: import pkg from '../../package.json'; then use pkg.version.

Both are cosmetic. No engine or logic changes. No new files.
```

**Completion checklist:**
- [ ] Owner avatar and username displayed in ModelCard
- [ ] Version tag reads from `package.json` dynamically

---

### Sprint 2 Completion Gate

```bash
✅ npm test -- --run              # 215 tests passing, 14 files
✅ npm test -- ui                 # 30 tests passing, 5 files
✅ npm test -- predicate-builder  # 11 tests passing
✅ npm test -- c-event-editor     # 7 tests passing — duplicate empty-string key warning, non-blocking
✅ npm test -- dist-picker        # 7 tests passing
✅ npm run build                  # 3.29s
```

---

## Sprint 3 — Experiment Controls

**Goal:** Implement warm-up period, termination conditions, and unified
experiment panel. All changes extend existing engine and UI files.

**Status:** ✅ Complete | **Started:** 2026-05-03 | **Completed:** 2026-05-04
**Prerequisite:** Sprint 2 exit gate passed.

> **Key audit finding:** `max_simulation_time` column already exists in the DB schema.
> The engine never reads it. Time-based termination is therefore a two-part fix:
> read the existing column in the engine, and add UI controls.

---

### Sprint 3 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 3 of DES Studio.

The existing app has a working single-run engine.
Sprint 3 adds experiment controls to the existing engine and UI.

Completed in Sprints 1–2: [paste]

Features:
  F3.1 — Warm-up period: new parameter; statistics reset in ENGINE at T_warmup
  F3.2 — Time-based termination: engine reads existing max_simulation_time column
  F3.3 — Condition-based termination: new predicate expression evaluated per Phase A
  F3.4 — Unified experiment configuration panel (extends existing Execute panel)
  F3.5 — Warm-up audit trail in StepLog
  F3.6 — DB layer tests: confirm user_id isolation in existing CRUD wrappers
  F3.7 — Engine test completion: fill gaps in existing test suite
  F3.8 — ADR-002 resolution: public model run permissions decision

CRITICAL: Warm-up reset must be enforced IN THE ENGINE.
The audit found: neither UI nor engine currently implements warm-up.
A UI label that hides warm-up results while the engine aggregates them
is a correctness bug.

Definition of done:
  - Warm-up exclusion confirmed by unit test that fails before and passes after
  - Condition termination halts simulation correctly
  - DB isolation tests confirm user_id filter on all list queries
  - npm test -- --run passes with zero failures
```

---

### F3.1 — Warm-Up Period (Engine + UI)

**Audit status:** ✗ (absent from both engine and UI)
**Existing code:** `engine/index.js` (extend loop), `execute/index.jsx` (extend panel)
**Status:** ⬜ | **Completed:** —

```
Task F3.1 of Sprint 3.

Read src/engine/index.js — show me the full simulation loop.
Read src/ui/execute/index.jsx — show me the Run button handler and
how buildEngine() is called.

Extend buildEngine() to accept warmupPeriod parameter.
In the engine loop, at T_now >= warmupPeriod:
  - Reset all statistics collectors (running sum, count, entity sojourn times)
  - Reset user-defined state variables where resetOnWarmup: true
  - This reset happens once only (use a flag to prevent double-reset)

Write the unit test BEFORE implementing:
  - Run with warmup period; use high service times during warmup
  - Assert mean wait time reflects only post-warmup observations
  - Confirm test FAILS on current code
  Implement the fix.
  - Confirm test PASSES

In the existing Execute panel:
  - Add warm-up period field (number input, time units)
  - Pass to buildEngine()
  - Persist to runs table (add warmup_period column — update schema.sql and models.js)
```

**Completion checklist:**
- [ ] `buildEngine()` accepts `warmupPeriod`
- [ ] Stats reset in engine at `T_warmup` (not in UI)
- [ ] Unit test fails before implementation, passes after
- [ ] Warm-up field in existing Execute panel
- [ ] `schema.sql` and `models.js` updated with `warmup_period` column

---

### F3.2 — Time-Based Termination

**Audit status:** ✗ (max_simulation_time column exists in DB — engine never reads it)
**Existing code:** `engine/index.js`, `db/models.js` (column exists), `execute/index.jsx`
**Status:** ⬜ | **Completed:** —

```
Task F3.2 of Sprint 3.

Read src/db/models.js — confirm max_simulation_time column exists in the runs table.
Read src/engine/index.js — confirm it never reads max_simulation_time.
Read src/ui/execute/index.jsx — show me how the run is submitted.

The column already exists. The engine just never reads it.

Extend engine/index.js loop:
  - Accept maxSimTime parameter in buildEngine()
  - After Phase A clock advance: if T_now >= maxSimTime, terminate

Extend execute/index.jsx (existing Run handler):
  - Add Run Duration field (number input) to experiment panel
  - Validate: run duration must be > warmup period
  - Pass maxSimTime into buildEngine() call
  - The DB write already has the column — just populate it (currently always null)

Unit test: engine halts at exactly T_end.
```

**Completion checklist:**
- [ ] Engine reads `maxSimTime` parameter
- [ ] Engine terminates at `T_now >= maxSimTime`
- [ ] Run Duration field in existing Execute panel
- [ ] Validation: run duration > warm-up period
- [ ] `max_simulation_time` column now populated in runs table
- [ ] Unit test passes

---

### F3.3 — Condition-Based Termination

**Audit status:** ✗ (not implemented)
**Existing code:** `engine/index.js`, `execute/index.jsx`, `ConditionBuilder` (reuse)
**Status:** ⬜ | **Completed:** —

```
Task F3.3 of Sprint 3.

Extend engine/index.js to support a termination predicate:
  - Accept terminationCondition (predicate JSON object) in buildEngine()
  - After every Phase A clock advance, evaluate the predicate
  - If true, terminate
  - If both maxSimTime and terminationCondition are set,
    whichever fires first wins

In execute/index.jsx:
  - Add Termination Condition section to experiment panel
  - Reuse the existing ConditionBuilder component
  - Same variable namespace as C-Event conditions
  - Serialise as predicate JSON and pass into buildEngine()

Unit test: engine halts when predicate becomes true (not at a fixed time).
```

**Completion checklist:**
- [ ] `terminationCondition` parameter in `buildEngine()`
- [ ] Engine evaluates predicate each Phase A
- [ ] Terminates correctly when predicate true
- [ ] UI reuses existing `ConditionBuilder` component
- [ ] Unit test passes

---

### F3.4 — Unified Experiment Configuration Panel

**Audit status:** ✗ (controls scattered or absent — Execute panel exists but needs extension)
**Existing code:** `execute/index.jsx` — extend existing panel
**Status:** ⬜ | **Completed:** —

```
Task F3.4 of Sprint 3.

Read src/ui/execute/index.jsx — show me the current panel layout.

Extend the existing Execute panel to group all experiment parameters:
  - Warm-up period (from F3.1)
  - Termination mode: radio buttons — Time-based OR Condition-based
    Time-based: shows Run Duration field
    Condition-based: shows ConditionBuilder
  - Replication count (integer, minimum 1)
    Note: multi-worker engine is Sprint 4 — this field stores the value
    but currently runs only 1 replication
  - Seed field (from F1.4)

Validation before Run:
  - Warm-up < run duration (time-based termination)
  - Replication count is a positive integer
  - Show errors inline, disable Run until resolved
```

**Completion checklist:**
- [ ] All experiment parameters in one panel section
- [ ] Termination mode radio buttons working
- [ ] Replication count field present (engine still single-run — Sprint 4)
- [ ] Validation errors shown inline before Run
- [ ] Run blocked until validation passes

---

### F3.5 — Warm-Up Audit Trail in StepLog

**Audit status:** ✗ (StepLog exists and works — add warm-up boundary marker)
**Existing code:** `execute/index.jsx` (StepLog — working component)
**Status:** ⬜ | **Completed:** —

```
Task F3.5 of Sprint 3.

Read the existing StepLog in execute/index.jsx.
Show me how log entries are currently rendered.

Extend (do not replace) to add a warm-up boundary marker:
  - When the engine returns results, include the T_warmup clock time
  - Insert a visual separator in the step log at that point:
    "──── Warm-up ended at T=X.XX ────"
  - In the stats panel, add: warm-up duration used, observations excluded,
    observations included

If a replication's warm-up exceeds its run duration, show an error banner.
```

**Completion checklist:**
- [ ] Warm-up boundary marker in existing StepLog
- [ ] Stats panel shows warm-up statistics
- [ ] Error banner if warm-up > run duration

---

### F3.6 — DB Layer Tests

**Audit status:** ✗ (zero DB tests — CRUD wrappers work but are untested)
**Existing code:** `src/db/models.js` — tested via mocked Supabase client
**Status:** ⬜ | **Completed:** —

```
Task F3.6 of Sprint 3.

Read src/db/models.js in full — list all CRUD functions.

Write tests/db/models.test.js (new file) using the mocked Supabase
client from tests/setup.js. Never hit the real database.

Required test cases (all from CLAUDE.md Section 12.6):
  - getModels() always calls .eq('user_id', userId)
  - getPublicModels() calls .eq('is_public', true) — no user_id filter
  - saveModel() INSERT always includes user_id in payload
  - updateModel() PATCH does not overwrite is_public silently
  - deleteModel() requires a model id — no id means no execution
  - saveRun() INSERT always includes model_id

Assert on mock call arguments — not just that a result was returned.
```

**Completion checklist:**
- [ ] `tests/db/models.test.js` created
- [ ] All six critical isolation tests pass
- [ ] `user_id` filter confirmed on all list queries

---

### F3.7 — Engine Test Completion

**Audit status:** ~ (5 test files, ~120 tests — gaps in required coverage)
**Existing code:** `tests/engine/` — extend existing files
**Status:** ⬜ | **Completed:** —

```
Task F3.7 of Sprint 3.

Read all existing engine test files and list what they cover.
Cross-reference against CLAUDE.md Section 12.4 required cases.
Identify missing tests only — do not rewrite passing tests.

Priority gaps to fill (add to existing test files):
  - Phase B fires ALL events at T_now (not just first)
  - FEL remains sorted after new B-Event is inserted
  - Engine terminates correctly when FEL is empty
  - All seven distribution types produce correct theoretical means
    over 10,000 samples (within 2%)
  - ARRIVE macro creates entity with correct default attribute values
  - COMPLETE macro records sojourn time correctly
  - RENEGE B-Event is a no-op if entity already seized
  - AND compound predicate evaluates both clauses
  - OR compound predicate short-circuits correctly

Do not modify existing passing tests.
```

**Completion checklist:**
- [ ] All required engine test cases exist
- [ ] All tests pass
- [ ] No existing tests broken

---

### F3.8 — ADR-002 Resolution

**Audit status:** ✗ (deferred decision — must be made before Sprint 4 builds run history)
**Status:** ⬜ | **Completed:** —

```
Task F3.8 of Sprint 3.

Read docs/decisions/ADR-002-public-model-runs.md.

Present the two options clearly:
  Option A: Public models are view-only for non-owners. No run permissions.
  Option B: Non-owners can run public models. Results stored under runner's user_id.

Key tradeoff: Option B requires the runs table to reference a model
the runner does not own, which may conflict with existing RLS policies
in Supabase.

I will decide. Once decided:
  1. Update ADR-002-public-model-runs.md with the decision and rationale
  2. Update CLAUDE.md Section 17.5 ADR Register
  3. If Option B: update models.js and schema.sql accordingly

Do not implement any run permissions until I confirm the decision.
```

**Completion checklist:**
- [ ] ADR-002 updated with decision
- [ ] CLAUDE.md ADR Register updated
- [ ] Code changes implemented (if Option B)

---

### Sprint 3 Completion Gate

```bash
npm test -- --run                      # Zero failures
npm test -- db                         # DB isolation tests pass
npm test -- engine                     # All engine test cases pass
npm test -- ui                         # All UI tests pass
node tests/[benchmark-filename]        # Still exits 0
npm run build                          # Succeeds
```

---

## Sprint 4 — Replication & Results

**Goal:** Enable N parallel replications using Web Workers with independent seeds.
Stream results in real time via Supabase. Display live confidence intervals.

**Status:** ⬜ Not started | **Started:** — | **Completed:** —
**Prerequisite:** Sprint 3 exit gate passed. ADR-002 accepted.

| Feature | Audit Status | Action |
|---|---|---|
| F4.1 — Web Worker engine wrapper | ✗ (engine blocks main thread) | New: `src/engine/worker.js` |
| F4.2 — Multi-replication runner | ✗ (replications always 1) | New: `src/engine/replication-runner.js` |
| F4.3 — Supabase real-time subscription | ✗ (no channel subscriptions) | Extend: `execute/index.jsx` |
| F4.4 — Running mean + 95% CI | ✗ (point estimates only) | New: `src/engine/statistics.js` |
| F4.5 — Live CI dashboard | ✗ (static results table only) | Extend: `execute/index.jsx` |

### Sprint 4 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 4 of DES Studio.

The existing app runs a single replication synchronously on the main thread.
Sprint 4 adds parallel replication and live results streaming.

Completed in Sprints 1–3: [paste]

Features:
  F4.1 — Web Worker wrapper for buildEngine() (non-blocking main thread)
  F4.2 — Multi-replication runner: N workers with independent seeds
  F4.3 — Supabase real-time subscription for live results
  F4.4 — Running mean and 95% CI (t-distribution for N<30)
  F4.5 — Live CI dashboard in existing execute panel

CRITICAL:
  - Seeds must be independent per worker
  - The existing runs table has replications column (always 1) — fix this
  - Real-time subscription requires a batch_id on runs rows (new column)
  - The existing single-run Execute flow must still work if N=1

Definition of done:
  - 30 M/M/1 replications run concurrently — UI stays responsive
  - 95% CI contains analytical mean wait (9.0) after 30 reps
  - CI narrows visibly on dashboard as replications complete
  - npm test -- --run passes
```

*(Full per-feature prompts follow the same structure as Sprints 1–3.
See DES_Studio_Build_Plan.md for complete prompt text.)*

---

## Sprint 5 — Polish, Export & Production

**Goal:** Production-ready release. Error handling, import/export, accessibility, onboarding.

**Status:** ⬜ Not started | **Started:** — | **Completed:** —
**Prerequisite:** Sprint 4 exit gate passed.

| Feature | Audit Status | Action |
|---|---|---|
| F5.1 — React error boundaries | ✗ (no ErrorBoundary anywhere) | New: extend `shared/components.jsx` |
| F5.2 — Model export to JSON | ✗ (Supabase-only) | New: download button in ModelDetail |
| F5.3 — Model import from JSON | ✗ (no upload) | New: import button in model library |
| F5.4 — Results export | ✗ (absent) | New: download from Execute panel |
| F5.5 — Fix stats panel runs count | ~ (always 0 — model.stats never populated) | Fix: `db/models.js:127` area |
| F5.6 — Fix avg_service_time column (C9) | ~ (mismatch) | Fix: `db/models.js:127` |
| F5.7 — Keyboard navigation + ARIA | ✗ (not implemented) | Extend: all UI components |
| F5.8 — First-run onboarding | ✗ (not implemented) | New: welcome panel + sample model |
| F5.9 — Model delete | ✗ (deleteModel() exists in db/models.js — no UI surface anywhere) | New: owner-only Delete button on ModelCard + user_id ownership guard |

### Sprint 5 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 5 (final sprint) of DES Studio.

Sprint 5 goal: Production-ready — error handling, export/import,
accessibility, and guided onboarding.

Completed in Sprints 1–4: [paste]

Features:
  F5.1 — React error boundaries (new — extends shared/components.jsx)
  F5.2 — Model export to JSON (new — adds button to existing ModelDetail)
  F5.3 — Model import from JSON (new — adds button to existing model library)
  F5.4 — Results export CSV/PDF (new — adds button to existing Execute panel)
  F5.5 — Stats panel fix: model.stats never populated
  F5.6 — avg_service_time column fix (C9)
  F5.7 — Keyboard navigation and ARIA labels (extend all existing components)
  F5.8 — First-run onboarding (new — welcome panel + pre-built M/M/1 model)
  F5.9 — Model delete: owner-only Delete button on ModelCard,
          confirmation dialog, deleteModel() user_id guard,
          cascade behaviour documented

Definition of done:
  - Zero console errors in any workflow path
  - Keyboard-only user can complete a full simulation run
  - Exported JSON re-imports without validation errors
  - Lighthouse accessibility score >= 85
  - npm test -- --run passes with zero failures
  - npm run build succeeds
```

*(Full per-feature prompts follow the same structure as earlier sprints.)*

---

### F5.9 — Model Delete (Owner Only)

**Audit status:** ✗ (deleteModel() exists in db/models.js — no UI surface anywhere)
**Existing code:** `App.jsx` (ModelCard), `src/db/models.js`
**Action:** New UI affordance + ownership guard
**Status:** ⬜ | **Completed:** —
Task F5.9 of Sprint 5.
Read src/App.jsx — find ModelCard and how models are listed.
Read src/db/models.js — find the existing deleteModel() function.
Add a Delete button to ModelCard:

Visible only when model.user_id === currentUser.id
Not rendered on public models owned by other users
On click: show confirmation dialog
"Delete '[model name]'? This cannot be undone."
On confirm: call deleteModel(model.id, userId)
On success: remove model from local state without page reload
On error: display error banner

Extend deleteModel() in db/models.js:

Add .eq('user_id', userId) to the delete query
Ensures ownership is enforced at the application layer
in addition to Supabase RLS policy
If no row deleted (id + user_id mismatch): return structured error

Document cascade behaviour:

Read schema.sql — confirm whether simulation_runs has
ON DELETE CASCADE from models table
If yes: note this in a code comment in deleteModel()
If no: raise as a finding — orphaned run records are a data integrity risk

Write a UI test (add to tests/ui/):

Owner sees Delete button on their own model
Non-owner does not see Delete button on a public model
Confirmation dialog appears before delete executes
deleteModel() is NOT called if user cancels

Write a DB layer test (add to tests/db/models.test.js):

deleteModel() query includes .eq('user_id', userId)
deleteModel() called without userId does not execute


**Completion checklist:**
- [ ] Delete button visible to owner only
- [ ] Confirmation dialog shown before delete
- [ ] `deleteModel()` includes `user_id` ownership guard
- [ ] Cascade behaviour confirmed and documented
- [ ] UI test passes (owner/non-owner visibility + cancel guard)
- [ ] DB layer test passes (user_id filter asserted)

---

---

## Sprint 6 — LLM Integration & Results Analysis

**Goal:** Embed an AI assistant panel into the Execute view that interprets simulation results in natural language, compares scenarios, and provides sensitivity commentary. All LLM calls use the Anthropic API (claude-sonnet model) from within the browser — no backend changes required.

**Status:** ⬜ Not started | **Started:** — | **Completed:** —
**Prerequisite:** Sprint 5 exit gate passed. Results export (F5.4) must produce structured JSON that can be passed to the LLM prompt.

| Feature | Audit Status | Action |
|---|---|---|
| F6.1 — AI assistant panel | ✗ | New: collapsible right-hand panel in Execute view |
| F6.2 — KPI narrative generation | ✗ | New: prompt builder + Anthropic API call from browser |
| F6.3 — Scenario comparison (A vs B) | ✗ | New: multi-run selector + comparative prompt |
| F6.4 — Sensitivity commentary | ✗ | New: replication variance summary fed to LLM |
| F6.5 — Streaming response display | ✗ | New: streamed token display in assistant panel |

### Design Principles for Sprint 6

The LLM integration must never modify the model or engine. It is read-only and advisory. All calls are made client-side using the Anthropic `/v1/messages` endpoint with `claude-sonnet-4-20250514`. The results JSON passed to the LLM is the same structured object produced by `buildEngine()` — no intermediate transformation layer is required.

Context injected into every prompt:
- Model name and description
- Experiment configuration (warm-up, run duration, replications, seed)
- KPI summary: mean wait times per queue, resource utilisation, throughput, renege rates
- Confidence intervals (if N > 1 replications)
- (For comparison prompts) side-by-side KPIs for two named runs

### Sprint 6 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 6 of DES Studio.

Sprint 6 adds an LLM-powered AI assistant panel to the Execute view.
The assistant interprets simulation results, compares scenarios, and
provides sensitivity commentary using the Anthropic API (claude-sonnet).

Completed in Sprints 1–5: [paste]

Features:
  F6.1 — Collapsible AI assistant panel (right of Execute view)
  F6.2 — KPI narrative: LLM reads results JSON, returns plain-English interpretation
  F6.3 — Scenario comparison: user selects two runs; LLM produces A-vs-B narrative
  F6.4 — Sensitivity commentary: replication CI data fed to LLM for variance analysis
  F6.5 — Streaming response display using Anthropic streaming API

CRITICAL:
  - LLM never modifies model or engine state — read-only, advisory
  - API key must NOT be embedded in client code — use Supabase Edge Function as proxy
  - Prompt templates must be versioned in src/llm/prompts.js (new file)
  - All LLM calls are cancellable — user can interrupt streaming response
  - If Anthropic API is unavailable, panel shows graceful fallback (no crash)

Definition of done:
  - User runs a model, opens AI panel, clicks "Explain results" — receives narrative
  - User selects two saved runs, clicks "Compare" — receives A-vs-B analysis
  - Streaming tokens appear progressively (not batch-loaded at end)
  - npm test -- --run passes (new unit tests for prompt builder)
  - npm run build succeeds
```

---

### F6.1 — AI Assistant Panel

**Audit status:** ✗ (not implemented)
**Action:** New collapsible panel — extends `execute/index.jsx`
**Status:** ⬜ | **Completed:** —

```
Task F6.1 of Sprint 6.

Read src/ui/execute/index.jsx — understand the current panel layout.

Add a collapsible AI assistant panel to the right side of the Execute view:
  - Toggle button: "AI Insights" (shows/hides panel)
  - Panel width: 320px, full height of Execute view
  - Initial state: collapsed (does not affect existing layout)
  - When expanded: existing Execute content shrinks to fill remaining width
  - Panel header: "AI Assistant" with a close (×) button
  - Panel body: three sections
      1. "Explain results" button (active only after a run completes)
      2. "Compare runs" — dropdown to select a second run from run history
      3. Response area: scrollable text with streaming token display

No LLM calls in this task. This task builds the UI shell only.
The response area shows a placeholder: "Run the model to generate insights."

Write a UI test: panel toggles correctly; buttons disabled before run.
```

**Completion checklist:**
- [ ] AI panel renders and toggles without affecting existing Execute layout
- [ ] Buttons disabled before first run completes
- [ ] Placeholder text shown in response area
- [ ] UI test passes

---

### F6.2 — KPI Narrative Generation

**Audit status:** ✗ (not implemented)
**Action:** New `src/llm/` directory — `prompts.js` + `apiClient.js`
**Status:** ⬜ | **Completed:** —

```
Task F6.2 of Sprint 6.

Create src/llm/prompts.js (new file):
  Export buildNarrativePrompt(model, experimentConfig, results):
    - System prompt: "You are an expert simulation analyst. Interpret
      the following discrete-event simulation results for a non-specialist
      audience. Be concise — 150–200 words. Use plain English."
    - User message: structured JSON block containing:
        model.name, model.description
        experiment: { warmup, runDuration, replications, seed }
        kpis: { queues: [{name, meanWait, maxWait, renegeRate}],
                resources: [{name, utilisation, busyCount}],
                throughput, totalEntities }
    - Instruction: "Highlight the most significant findings. Flag any
      queues where mean wait exceeds 2 × service time (possible overload)."

Create src/llm/apiClient.js (new file):
  Export streamNarrative(prompt, onToken, onComplete, onError):
    - POST to /functions/v1/llm-proxy (Supabase Edge Function — see below)
    - Handle SSE streaming: call onToken(text) for each chunk
    - Call onComplete() when stream ends
    - Call onError(err) on failure

Create supabase/functions/llm-proxy/index.ts (new Supabase Edge Function):
  - Receives { messages, model, max_tokens } from client
  - Forwards to Anthropic API using ANTHROPIC_API_KEY secret (server-side)
  - Streams response back to client
  - Validates that model is claude-sonnet-4-20250514 only (no other models)
  - Rate-limits: max 10 requests per user per hour (uses Supabase user JWT)

In the AI panel (F6.1): wire "Explain results" button to streamNarrative().
Display streaming tokens in the response area as they arrive.

Unit tests (tests/llm/prompts.test.js):
  - buildNarrativePrompt returns valid JSON in user message
  - Overloaded queue (meanWait > 2× serviceTime) is flagged in prompt
  - Prompt does not exceed 2000 tokens (count words × 1.3 heuristic)
```

**Completion checklist:**
- [ ] `src/llm/prompts.js` with `buildNarrativePrompt()` exported
- [ ] `src/llm/apiClient.js` with `streamNarrative()` exported
- [ ] Supabase Edge Function `llm-proxy` deployed
- [ ] API key never appears in client-side code
- [ ] Streaming tokens display progressively in panel
- [ ] Unit tests pass

---

### F6.3 — Scenario Comparison (A vs B)

**Audit status:** ✗ (not implemented)
**Action:** Extend `src/llm/prompts.js`; extend AI panel
**Status:** ⬜ | **Completed:** —

```
Task F6.3 of Sprint 6.

Read src/llm/prompts.js (from F6.2).

Add buildComparisonPrompt(modelName, runA, runB) to prompts.js:
  runA and runB are results objects from two different simulation runs.
  Each has: experimentConfig, kpis, run label (user-assigned or timestamp).

  System prompt: "You are an expert simulation analyst. Compare the two
  simulation runs below and explain the key differences to a non-specialist.
  Be concise — 200–250 words. Use a Before/After or Option A/Option B frame."

  User message: structured JSON with runA and runB side by side.

In the AI panel:
  - "Compare runs" section: primary run is the most recent completed run
  - Dropdown: select a second run from run history (last 20 runs)
  - "Compare" button: builds comparison prompt and calls streamNarrative()
  - Response replaces the narrative area content

Unit tests (add to tests/llm/prompts.test.js):
  - buildComparisonPrompt includes both run labels in output
  - Produces valid JSON structure
```

**Completion checklist:**
- [ ] `buildComparisonPrompt()` exported from `prompts.js`
- [ ] Comparison prompt includes both run KPIs side by side
- [ ] AI panel dropdown populated from run history
- [ ] Streaming narrative displayed for comparison
- [ ] Unit tests pass

---

### F6.4 — Sensitivity Commentary

**Audit status:** ✗ (not implemented)
**Action:** Extend `src/llm/prompts.js`; extend AI panel
**Status:** ⬜ | **Completed:** —

```
Task F6.4 of Sprint 6.

This feature is only available when N >= 5 replications have been run
(confidence intervals are meaningful only with sufficient sample size).

Add buildSensitivityPrompt(modelName, experimentConfig, ciResults) to prompts.js:
  ciResults: array of KPIs with { name, mean, ci95Lower, ci95Upper, stdDev }

  System prompt: "You are an expert simulation analyst. Explain the
  statistical uncertainty in the following simulation results. Identify
  which KPIs have wide confidence intervals and what this implies for
  decision-making. Be concise — 150–200 words."

In the AI panel:
  - "Sensitivity" button: shown only when N >= 5 replications exist
  - Calls buildSensitivityPrompt and streamNarrative()

Unit test: sensitivity button disabled when replications < 5.
```

**Completion checklist:**
- [ ] `buildSensitivityPrompt()` exported from `prompts.js`
- [ ] Sensitivity button disabled when N < 5
- [ ] CI data correctly structured in prompt
- [ ] Unit test passes

---

### F6.5 — Streaming Response Display

**Audit status:** ✗ (not implemented)
**Action:** Extend AI panel component; extend `apiClient.js`
**Status:** ⬜ | **Completed:** —

```
Task F6.5 of Sprint 6.

Ensure the streaming response in the AI panel meets production quality:
  - Tokens appear character-by-character (or chunk-by-chunk per SSE event)
  - A "Stop" button cancels the in-flight request using AbortController
  - A loading spinner appears while waiting for first token
  - If the stream errors: display "Analysis unavailable — try again" (amber banner)
  - Copy-to-clipboard button appears after stream completes
  - Response is formatted: markdown bold/italic rendered (use a lightweight
    markdown renderer — dangerouslySetInnerHTML is NOT permitted;
    use a safe renderer like marked with sanitisation)

Unit test: onError callback triggered when fetch rejects; panel shows error banner.
```

**Completion checklist:**
- [ ] Streaming tokens display progressively
- [ ] Stop button cancels stream via `AbortController`
- [ ] Loading spinner shown before first token
- [ ] Error banner shown on failure (no crash)
- [ ] Copy button present after completion
- [ ] Markdown rendered safely (no `dangerouslySetInnerHTML`)
- [ ] Unit test passes

---

### Sprint 6 Completion Gate

```bash
npm test -- --run                      # Zero failures
npm test -- llm                        # LLM prompt builder tests pass
npm test -- ui                         # AI panel toggle test passes
npm run build                          # Succeeds
# Manual: open Execute panel, run model, click "AI Insights", verify narrative appears
# Manual: select two runs, click Compare, verify comparison narrative appears
```

---

## Sprint 7 — Dynamic Distributions & Time-Varying Resources

**Goal:** Enable modellers to represent systems where arrival rates and resource capacity change over simulated time. This is essential for realistic models of emergency departments, call centres, and any system with diurnal or shift-based patterns.

**Status:** ⬜ Not started | **Started:** — | **Completed:** —
**Prerequisite:** Sprint 5 exit gate passed. Sprint 7 does not depend on Sprint 6 and can proceed in parallel.

**Architectural constraint:** All time-varying logic is scheduled as B-Events. No new Phase types are introduced. The Three-Phase engine (`engine/index.js`) is not restructured — it is extended via the existing B-Event mechanism.

| Feature | Audit Status | Action |
|---|---|---|
| F7.1 — Piecewise inter-arrival distribution schema | ✗ | New: extend `distributions.js` registry |
| F7.2 — NHPP arrival B-Event scheduler | ✗ | New: extend `phases.js` ARRIVE logic |
| F7.3 — Resource shift schedule schema | ✗ | New: extend entity model (new node property) |
| F7.4 — Shift change B-Event handler | ✗ | New: extend `phases.js` |
| F7.5 — Time-varying distribution picker UI | ✗ | New: extend `DistPicker` in `shared/components.jsx` |
| F7.6 — Shift schedule editor UI | ✗ | New: extend Resource configuration in editors |
| F7.7 — Engine validation for time-varying params | ✗ | New: extend `validateModel()` in `validation.js` |

### Design Principles for Sprint 7

**Piecewise inter-arrival rates.** The modeller defines an ordered list of `{ startTime, distribution }` pairs. At each transition time, the engine schedules a `RATE_CHANGE` B-Event that replaces the active inter-arrival distribution for the relevant Source. The engine then schedules the next arrival using the new distribution. This mechanism requires no changes to Phase B or Phase C — only the ARRIVE B-Event scheduling logic.

```
PIECEWISE DISTRIBUTION SCHEMA
{ "type": "piecewise",
  "periods": [
    { "startTime": 0,   "distribution": { "type": "exponential", "rate": 0.5 } },
    { "startTime": 480, "distribution": { "type": "exponential", "rate": 1.5 } },
    { "startTime": 960, "distribution": { "type": "exponential", "rate": 0.8 } }
  ]
}
```

**Resource shift schedules.** The modeller defines capacity steps on a Resource node: `{ time, capacity }` pairs. Each step is pre-scheduled as a `SHIFT_CHANGE` B-Event at model initialisation. When it fires, `Resource.<id>.capacity` is updated. C-Event conditions referencing `Resource.<id>.busyCount` automatically reflect the new capacity on the next scan.

```
SHIFT SCHEDULE SCHEMA (on Resource node)
{ "shiftSchedule": [
    { "time": 0,    "capacity": 3 },
    { "time": 480,  "capacity": 6 },
    { "time": 960,  "capacity": 2 }
  ]
}
```

### Sprint 7 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 7 of DES Studio.

Sprint 7 adds time-varying arrival rates and resource shift schedules.
Both features are implemented as pre-scheduled B-Events — no new Phase
types or engine restructuring.

Completed in Sprints 1–5: [paste]

Features:
  F7.1 — Piecewise distribution type: new registry entry in distributions.js
  F7.2 — NHPP arrival scheduler: RATE_CHANGE B-Events scheduled at model init
  F7.3 — Shift schedule schema: new shiftSchedule[] property on Resource nodes
  F7.4 — Shift change B-Event handler: updates Resource.capacity at scheduled time
  F7.5 — Time-varying distribution picker UI: extends existing DistPicker
  F7.6 — Shift schedule editor: extends existing Resource configuration panel
  F7.7 — Validation: piecewise periods must be time-ordered; shift times must be
          within run duration; capacity values must be positive integers

CRITICAL:
  - The Three-Phase engine loop is NOT restructured
  - RATE_CHANGE and SHIFT_CHANGE B-Events are scheduled at buildEngine() init
  - Resource.capacity changes take effect on the next Phase C scan (correct behaviour)
  - Seeded RNG must be used for all sampling in piecewise distributions
  - A piecewise distribution with a single period is equivalent to a static distribution
    (no special-casing needed)
  - Warm-up reset does NOT reset piecewise period or shift schedule position
    (the schedule is time-indexed, not statistics-indexed)

Definition of done:
  - M/M/1 with time-varying arrival passes: high-rate period produces longer queues
  - Shift schedule test: capacity drops from 3 to 1 at T=500, queue grows correctly
  - All existing engine tests still pass
  - npm test -- --run passes
```

---

### F7.1 — Piecewise Distribution Schema

**Audit status:** ✗ (distributions.js supports 7 types — piecewise is absent)
**Action:** Extend `distributions.js` registry — no other engine files change
**Status:** ⬜ | **Completed:** —

```
Task F7.1 of Sprint 7.

Read src/engine/distributions.js — show me the registerDistribution() pattern
and the full list of currently registered types.

Register a new 'piecewise' distribution type:
  Schema: { "type": "piecewise", "periods": [{ "startTime": number, "distribution": Distribution }] }

  Validation function (runs at validateModel() time):
    - periods must be a non-empty array
    - periods must be sorted ascending by startTime
    - periods[0].startTime must be 0 (simulation must have a rate from T=0)
    - each period.distribution must be a valid registered distribution
    - periods must not overlap (guaranteed by sort + uniqueness check on startTime)

  Sample function (accepts T_now from engine context):
    - Identify the active period: largest startTime <= T_now
    - Delegate to the active period's distribution sampler
    - The 'piecewise' sampler does NOT itself schedule RATE_CHANGE events —
      that is the NHPP scheduler's responsibility (F7.2)

Add to tests/engine/distributions.test.js:
  - Piecewise with two periods returns correct distribution for each time range
  - Piecewise with period[0].startTime != 0 fails validation
  - Piecewise with unsorted periods fails validation
  - Sample at T_now in period 1 uses period 1 distribution
```

**Completion checklist:**
- [ ] `piecewise` registered in `distributions.js`
- [ ] Validation: startTime=0, sorted, non-overlapping
- [ ] Sampler delegates to active period by T_now
- [ ] All new distribution tests pass
- [ ] Existing distribution tests unchanged

---

### F7.2 — NHPP Arrival B-Event Scheduler

**Audit status:** ✗ (ARRIVE always uses a static distribution)
**Action:** Extend `phases.js` ARRIVE handler and `engine/index.js` init
**Status:** ⬜ | **Completed:** —

```
Task F7.2 of Sprint 7.

Read src/engine/phases.js — show me the ARRIVE handler in full.
Read src/engine/index.js — show me the engine initialisation block.

The ARRIVE handler currently samples from a static distribution.
For piecewise distributions, the handler must additionally schedule
RATE_CHANGE B-Events at period transition times.

Extend engine initialisation in buildEngine():
  For each Source node with a piecewise interArrivalDist:
    For each period transition (periods[i].startTime where i > 0):
      Schedule a RATE_CHANGE B-Event at startTime
      Payload: { sourceId, newDistribution: periods[i].distribution }

Add RATE_CHANGE B-Event handler to phases.js:
  When fired: update the active distribution reference on the source node
  No other state changes — the next ARRIVE B-Event will use the new distribution

Write a unit test:
  - Model: single source, piecewise dist with period at T=0 (rate=0.5) and T=100 (rate=2.0)
  - Run to T=200
  - Assert: mean inter-arrival in [0,100) is close to 1/0.5 = 2.0
  - Assert: mean inter-arrival in [100,200) is close to 1/2.0 = 0.5
  - Tolerance: 10% (stochastic — use large N)
```

**Completion checklist:**
- [ ] RATE_CHANGE B-Events scheduled at `buildEngine()` init for piecewise sources
- [ ] RATE_CHANGE handler updates active distribution on source node
- [ ] ARRIVE handler uses the currently-active distribution at time of sampling
- [ ] Unit test demonstrates rate change effect
- [ ] All existing engine tests pass

---

### F7.3 — Resource Shift Schedule Schema

**Audit status:** ✗ (Resource nodes have no shiftSchedule property)
**Action:** Extend entity model schema; extend `docs/addition1_entity_model.md`
**Status:** ⬜ | **Completed:** —

```
Task F7.3 of Sprint 7.

Read docs/addition1_entity_model.md Section 3.1 (Resource State Variables).

Add shiftSchedule as an optional property on Resource nodes:
  Schema: { "shiftSchedule": [{ "time": number, "capacity": number }] }
  Default: absent (no shift schedule = static capacity throughout run)

Update addition1_entity_model.md Section 3.1 to document shiftSchedule.

Update the model JSON schema (if a formal schema file exists — check docs/).

Validation rules to add to validateModel() (F7.7):
  V12 — If shiftSchedule is present:
    - periods must be sorted ascending by time
    - periods[0].time must be 0
    - all capacity values must be positive integers
    - all times must be within run duration (if run duration is set)
    - the first period sets the initial Resource.capacity (overrides the static
      capacity field if shiftSchedule[0] is present)

No engine or UI changes in this task — schema and validation spec only.
```

**Completion checklist:**
- [ ] `shiftSchedule` schema documented in `addition1_entity_model.md`
- [ ] Validation rules V12 added to `validateModel()` spec in `addition1_entity_model.md`
- [ ] Model JSON schema updated (if applicable)

---

### F7.4 — Shift Change B-Event Handler

**Audit status:** ✗ (no SHIFT_CHANGE B-Event exists)
**Action:** Extend `phases.js` and `engine/index.js` init
**Status:** ⬜ | **Completed:** —

```
Task F7.4 of Sprint 7.

Read src/engine/phases.js and src/engine/index.js.

Extend buildEngine() initialisation:
  For each Resource node with a shiftSchedule:
    For each period in shiftSchedule:
      Schedule a SHIFT_CHANGE B-Event at period.time
      Payload: { resourceId, newCapacity: period.capacity }

Add SHIFT_CHANGE B-Event handler to phases.js:
  When fired:
    1. Update Resource.<resourceId>.capacity to newCapacity
    2. If new capacity < current busyCount (impossible — capacity cannot drop below
       in-service entities): add a warning to the results object (do not halt)
    3. Write a StepLog entry: "SHIFT_CHANGE: Resource <id> capacity → <newCapacity>"

Write unit tests:
  - Single server, shift at T=500: capacity 3 → 1
  - Assert: Resource.capacity == 3 before T=500
  - Assert: Resource.capacity == 1 after T=500
  - Assert: StepLog contains SHIFT_CHANGE entry at T=500
  - Capacity-below-busyCount edge case: warning in results, run continues
```

**Completion checklist:**
- [ ] SHIFT_CHANGE B-Events scheduled at `buildEngine()` init
- [ ] SHIFT_CHANGE handler updates `Resource.<id>.capacity`
- [ ] StepLog entry written on each capacity change
- [ ] Warning (not halt) if new capacity < current busyCount
- [ ] Unit tests pass

---

### F7.5 — Time-Varying Distribution Picker UI

**Audit status:** ✗ (DistPicker does not support piecewise type)
**Action:** Extend `src/ui/shared/components.jsx` (DistPicker)
**Status:** ⬜ | **Completed:** —

```
Task F7.5 of Sprint 7.

Read src/ui/shared/components.jsx — find the DistPicker component.
Confirm the list of distribution types currently shown.

Extend DistPicker (do not replace) to support the piecewise type:
  - Add "Time-varying (piecewise)" to the distribution type dropdown
  - On select: show a period table editor:
      Columns: Start Time | Distribution Type | Parameters | [Delete]
      Add Period button: appends a new row with defaults
      Period 0 start time is always locked to 0 (cannot be changed by user)
      Periods are auto-sorted ascending by startTime on save
  - Each period row uses a nested DistPicker (excluding piecewise — no recursion)
  - Validates inline: unsorted times highlighted in red; warns if last period
    ends before run duration

Write a UI test (add to tests/ui/shared/dist-picker.test.jsx):
  - Selecting piecewise shows period table
  - Adding a period inserts a new row
  - Period 0 start time field is disabled
  - Unsorted start times show validation error
```

**Completion checklist:**
- [ ] Piecewise type in existing `DistPicker` dropdown
- [ ] Period table editor: add, edit, delete rows
- [ ] Period 0 start time locked to 0
- [ ] Nested `DistPicker` per period (no recursion)
- [ ] Inline sort validation
- [ ] UI test passes

---

### F7.6 — Shift Schedule Editor

**Audit status:** ✗ (Resource configuration has no shift schedule panel)
**Action:** Extend Resource configuration in `editors/index.jsx`
**Status:** ⬜ | **Completed:** —

```
Task F7.6 of Sprint 7.

Read src/ui/editors/index.jsx — find the Resource (or entity type) configuration
section. Show me the current fields rendered for a Resource node.

Extend the Resource configuration panel (do not replace):
  Add a "Shift Schedule" section (collapsed by default):
    - Toggle: "Use shift schedule" (checkbox)
    - When enabled: show a schedule table
        Columns: Start Time | Capacity | [Delete]
        Add Shift button: appends a new row
        Row 0 time locked to 0 (defines initial capacity)
    - When disabled: show the existing static Capacity field only
    - Inline validation: times must be sorted; capacity must be a positive integer

  On save: if shift schedule enabled, write shiftSchedule[] to model_json.
           Static capacity field is ignored when shiftSchedule[0] is present.

Write a UI test:
  - Enabling shift schedule shows the table; disabling restores static capacity field
  - Adding a row increments table row count
  - Non-integer capacity value shows validation error
```

**Completion checklist:**
- [ ] Shift schedule section in existing Resource editor
- [ ] Toggle enables/disables shift table vs static capacity field
- [ ] Row 0 time locked to 0
- [ ] Inline validation: sorted times, positive integer capacity
- [ ] `shiftSchedule[]` written to model_json when enabled
- [ ] UI test passes

---

### F7.7 — Validation for Time-Varying Parameters

**Audit status:** ✗ (validateModel() does not cover piecewise or shiftSchedule)
**Action:** Extend `src/engine/validation.js`
**Status:** ⬜ | **Completed:** —

```
Task F7.7 of Sprint 7.

Read src/engine/validation.js — show me the full validateModel() function
and the existing V1–V11 rule set.

Add validation rules V12–V15 to the existing validateModel():

  V12 — Piecewise distribution: periods[0].startTime must be 0. (Blocking)
  V13 — Piecewise distribution: periods must be sorted ascending by startTime. (Blocking)
  V14 — Shift schedule: shiftSchedule[0].time must be 0. (Blocking)
  V15 — Shift schedule: all shift times must be within run duration if run
          duration is configured. (Warning — run proceeds with amber banner)

Error message patterns:
  V12: "Source '{name}' piecewise distribution must start at time 0."
  V13: "Source '{name}' piecewise periods are not sorted by start time."
  V14: "Resource '{name}' shift schedule must begin at time 0."
  V15: "Resource '{name}' has shift times beyond run duration — later shifts will not fire."

Add to tests/engine/validation.test.js (extend existing file):
  - V12: model with piecewise period[0].startTime != 0 returns blocking error
  - V13: unsorted piecewise periods return blocking error
  - V14: shift schedule without time=0 period returns blocking error
  - V15: shift time beyond run duration returns warning (not blocking)
  - Valid piecewise + shift model passes validation
```

**Completion checklist:**
- [ ] V12–V15 added to existing `validateModel()`
- [ ] V12, V13, V14 are blocking — run prevented
- [ ] V15 is a warning — run proceeds with banner
- [ ] Error messages identify the specific node by name
- [ ] Five new validation tests pass
- [ ] Existing V1–V11 tests unaffected

---

### Sprint 7 Completion Gate

```bash
npm test -- --run                      # Zero failures
npm test -- distributions              # Piecewise distribution tests pass
npm test -- engine                     # NHPP + shift change tests pass
npm test -- validation                 # V12–V15 tests pass
npm test -- ui                         # Shift editor + DistPicker UI tests pass
node tests/[benchmark-filename]        # M/M/1 benchmark still exits 0
npm run build                          # Succeeds
```

---

## Sprint 8 — LLM Chat Model Builder

**Goal:** Allow a modeller to describe a system in natural language and receive a partially- or fully-configured DES model. The LLM acts as a model-construction assistant: it parses the description, asks clarifying questions, proposes entity classes, queues, B-Events, C-Events, and distributions, and writes the result directly into the model editor. The modeller reviews a diff-preview before any changes are applied.

**Status:** ⬜ Not started | **Started:** — | **Completed:** —
**Prerequisite:** Sprint 6 (LLM API proxy infrastructure) must be complete. Sprint 8 depends on the Supabase Edge Function `llm-proxy` deployed in F6.2.

**Architectural constraint:** The LLM produces a model JSON object conforming to the existing `addition1_entity_model.md` schema. It is validated by `validateModel()` before being applied. The engine, macros, and database schema are not modified. The LLM cannot bypass validation.

| Feature | Audit Status | Action |
|---|---|---|
| F8.1 — Chat model builder panel | ✗ | New: panel in model editor (alongside existing tab editors) |
| F8.2 — Intent parser prompt + LLM schema | ✗ | New: `src/llm/model-builder-prompts.js` |
| F8.3 — Iterative clarification loop | ✗ | New: multi-turn conversation in builder panel |
| F8.4 — Diff-preview before apply | ✗ | New: structured diff view between current and proposed model |
| F8.5 — Validation integration | ✗ | Reuse: `validateModel()` called on proposed model before apply |
| F8.6 — Partial model apply | ✗ | New: allow applying only selected sections of proposed model |

### Design Principles for Sprint 8

The LLM is constrained to produce only valid model JSON. The system prompt is extensive and encodes the full entity model schema (addition1_entity_model.md Section 2–7) as constraints on LLM output. The LLM must not invent macros, distribution types, or field names outside the documented schema.

The builder operates in three modes:

**Describe → Build:** User writes a free-text description of the system (e.g., "An emergency department with triage, nurse assessment, and doctor consultation. Patients arrive at exponential rate 0.3, triage takes 5–10 minutes uniformly..."). The LLM returns a complete model JSON proposal.

**Refine:** User types a refinement request against the current model (e.g., "Add a second doctor and a priority queue for critical patients"). The LLM produces a diff — only the changed elements.

**Explain:** User asks "What does this C-Event do?" — the LLM returns a plain-English explanation of the selected model element.

All three modes route through the same `llm-proxy` Edge Function. The mode is encoded in the system prompt.

### Sprint 8 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 8 of DES Studio.

Sprint 8 adds an LLM-powered chat interface for building simulation models
from natural language descriptions.

Completed in Sprints 1–6: [paste — note: Sprint 6 must be complete]

Features:
  F8.1 — Chat model builder panel: new panel in model editor view
  F8.2 — Intent parser prompt: system prompt encoding full entity model schema
  F8.3 — Iterative clarification loop: multi-turn conversation state
  F8.4 — Diff-preview: structured diff between current and proposed model
  F8.5 — Validation integration: validateModel() on proposed model before apply
  F8.6 — Partial apply: user selects which sections of proposed model to accept

CRITICAL:
  - LLM output is ALWAYS validated before being applied — no exceptions
  - LLM cannot produce macros, fields, or distribution types outside the schema
  - The existing model (if any) is included in the LLM context — the builder
    refines, not replaces, unless the user explicitly requests a full rebuild
  - Conversation history is stored in React state only — not persisted to Supabase
  - The builder panel is additive — existing tab editors remain fully functional
  - Maximum conversation turns before auto-summary: 10 (prevents context overflow)

Definition of done:
  - User types "a post office with 2 clerks, FIFO queue, exponential arrivals at rate 0.5"
  - LLM proposes model JSON, user sees diff-preview, clicks Apply
  - Model loads into existing editors correctly and passes validateModel()
  - User types "add a priority queue for express customers"
  - LLM proposes diff, user applies only that section
  - npm test -- --run passes
```

---

### F8.1 — Chat Model Builder Panel

**Audit status:** ✗ (model editor has no chat interface)
**Action:** New panel alongside existing `editors/index.jsx` tab structure
**Status:** ⬜ | **Completed:** —

```
Task F8.1 of Sprint 8.

Read src/ui/editors/index.jsx — understand the existing tab structure.

Add a new "Build with AI" tab to the existing model editor tab bar:
  - Position: first tab (leftmost) — it is the entry point for new models
  - Tab label: "✦ Build with AI"
  - Panel structure:
      Top: conversation history (scrollable, message bubbles)
      Bottom: text input + Send button
      Right: model proposal panel (hidden until first LLM response)
  - Message bubble types: user (right-aligned), assistant (left-aligned),
    system notices (centred, muted — e.g., "Applying proposal...")
  - Conversation history is React state — not persisted

The tab must not affect any existing tab (entity types, state vars, etc.).
Write a UI test: "Build with AI" tab renders; other tabs unaffected.
```

**Completion checklist:**
- [ ] "Build with AI" tab added as first tab in existing editor
- [ ] Existing tabs unaffected
- [ ] Conversation history renders as message bubbles
- [ ] Text input + Send button present
- [ ] UI test passes

---

### F8.2 — Intent Parser Prompt & LLM Schema

**Audit status:** ✗ (not implemented)
**Action:** New `src/llm/model-builder-prompts.js`
**Status:** ⬜ | **Completed:** —

```
Task F8.2 of Sprint 8.

Create src/llm/model-builder-prompts.js (new file).

Export buildModelBuilderSystemPrompt():
  Returns a system prompt that:
    1. Identifies the LLM as a DES Studio model construction assistant
    2. Encodes the complete entity model schema as constraints:
         - Entity classes: name (string), attributes (name, valueType, defaultValue, mutable)
         - B-Events: name, scheduleRows (macro: ARRIVE, parameters)
         - C-Events: priority (1..N), condition (predicate JSON), actions (macro rows)
         - Queues: name, discipline (FIFO|LIFO|PRIORITY)
         - State variables: name, valueType: number, initialValue, resetOnWarmup
         - Macros: ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE (exact signatures)
         - Distributions: exponential, uniform, normal, triangular, fixed, lognormal, empirical
    3. Instructs the LLM to respond ONLY in JSON:
         {
           "intent": "build" | "refine" | "clarify",
           "questions": ["..."] | null,  // if intent is clarify
           "proposedModel": { ...model_json... } | null,  // if intent is build/refine
           "explanation": "..."  // always present — plain-English summary
         }
    4. Instructs the LLM to ask at most 2 clarifying questions before proposing a model
    5. Forbids the LLM from inventing fields, macros, or distribution types
       outside the documented schema

Export buildModelBuilderUserMessage(description, currentModel, conversationHistory):
  Returns the user message for the current turn, including:
    - Current model JSON (if any — the LLM refines, not replaces)
    - Conversation history (last 10 turns)
    - Current user description or refinement request

Unit tests (tests/llm/model-builder-prompts.test.js):
  - System prompt contains all five macro names
  - System prompt contains all seven distribution types
  - buildModelBuilderUserMessage includes currentModel in output when model is non-empty
  - Response JSON schema: intent + proposedModel + explanation keys present
```

**Completion checklist:**
- [ ] `buildModelBuilderSystemPrompt()` exported
- [ ] `buildModelBuilderUserMessage()` exported
- [ ] System prompt encodes complete schema (macros, distributions, field types)
- [ ] Response format constrained to intent/questions/proposedModel/explanation JSON
- [ ] Unit tests pass

---

### F8.3 — Iterative Clarification Loop

**Audit status:** ✗ (not implemented)
**Action:** Extend chat panel (F8.1); extend `src/llm/apiClient.js`
**Status:** ⬜ | **Completed:** —

```
Task F8.3 of Sprint 8.

Read src/llm/apiClient.js (from F6.2).

Extend apiClient.js to support multi-turn model builder calls:
  Export callModelBuilder(systemPrompt, messages, onComplete, onError):
    - Non-streaming (model builder requires full JSON, not streaming tokens)
    - POST to llm-proxy Edge Function with full conversation history
    - On success: parse response JSON (intent + proposedModel + explanation)
    - On error: call onError with user-friendly message

In the chat panel (F8.1):
  State: conversationHistory (array of {role, content} turns)
  On Send:
    1. Append user message to conversationHistory
    2. Call callModelBuilder with full history
    3. Parse response:
       - If intent == "clarify": display assistant bubble with questions;
         wait for user response (next Send)
       - If intent == "build" or "refine": display explanation bubble;
         show model proposal panel (F8.4)
    4. Append assistant response to conversationHistory
    5. If conversationHistory.length >= 20 turns: show notice
       "Conversation is long — consider starting a new session"

Cap: after 10 assistant turns without a proposal, auto-inject a system message:
  "Please now produce a model proposal based on the discussion so far."
```

**Completion checklist:**
- [ ] `callModelBuilder()` exported from `apiClient.js`
- [ ] Multi-turn conversation state managed in React state
- [ ] Clarification questions render as assistant bubbles
- [ ] Proposal displayed when intent is build/refine
- [ ] 20-turn length warning shown
- [ ] 10-turn auto-proposal injection

---

### F8.4 — Diff-Preview Before Apply

**Audit status:** ✗ (not implemented)
**Action:** New `src/ui/editors/ModelDiffPreview.jsx`
**Status:** ⬜ | **Completed:** —

```
Task F8.4 of Sprint 8.

When the LLM returns a proposedModel (intent: build or refine), display
a structured diff view before the user can apply it.

Create src/ui/editors/ModelDiffPreview.jsx (new file):
  Receives: currentModel (model_json), proposedModel (model_json)
  Renders a diff panel with sections:
    Entity Classes: [Added] [Modified] [Removed] [Unchanged]
    B-Events: [Added] [Modified] [Removed] [Unchanged]
    C-Events: [Added] [Modified] [Removed] [Unchanged]
    Queues: [Added] [Modified] [Removed] [Unchanged]
    State Variables: [Added] [Modified] [Removed] [Unchanged]

  Each changed element shows the old and new value side by side.
  Unchanged elements are collapsed (expandable on click).

  Buttons:
    "Apply All" — replaces currentModel with proposedModel in app state
    "Apply Selected" — opens section-level checkboxes; applies only checked sections
    "Discard" — closes the proposal panel without applying

  Applying triggers validateModel(proposedModel):
    If blocking errors: show error list; do not apply; keep diff panel open
    If warnings only: apply with amber banner listing warnings

Write a unit test: ModelDiffPreview correctly identifies one added entity class
and one removed queue in a known diff.
```

**Completion checklist:**
- [ ] `ModelDiffPreview.jsx` created
- [ ] Diff correctly identifies added/modified/removed/unchanged elements
- [ ] Apply All replaces model in app state
- [ ] Apply Selected applies only checked sections
- [ ] Discard closes panel without changes
- [ ] `validateModel()` called before apply — blocking errors prevent apply
- [ ] Unit test passes

---

### F8.5 — Validation Integration

**Audit status:** ~ (validateModel() exists — must be called on proposed model)
**Action:** Reuse existing `validation.js` — no new code
**Status:** ⬜ | **Completed:** —

```
Task F8.5 of Sprint 8.

This task has no new implementation — it is a verification task.

Confirm that ModelDiffPreview (F8.4) correctly calls validateModel()
on the proposedModel before applying.

Also confirm:
  - Blocking errors (V1–V14) prevent apply and show error list in diff panel
  - Warning (V11, V15) allow apply with amber banner
  - Error messages identify specific nodes by name (existing behaviour)

Write an integration test:
  - Proposed model with a missing entity class name (V1 violation)
  - Assert: Apply All is disabled; error list shown; diff panel stays open
  - Proposed model with valid content
  - Assert: Apply All proceeds; model updated in app state
```

**Completion checklist:**
- [ ] `validateModel()` called on proposed model before apply
- [ ] Blocking errors disable Apply; show list
- [ ] Warnings allow Apply with banner
- [ ] Integration test passes

---

### F8.6 — Partial Model Apply

**Audit status:** ✗ (not implemented)
**Action:** Extend `ModelDiffPreview.jsx`
**Status:** ⬜ | **Completed:** —

```
Task F8.6 of Sprint 8.

Extend ModelDiffPreview (F8.4) to support section-level partial apply:

When user clicks "Apply Selected":
  Show checkboxes at section level (Entity Classes, B-Events, etc.)
  Each section checkbox controls all elements in that section
  "Apply Selected" button applies only checked sections

Merge logic:
  For each checked section: replace that section in currentModel with
  the corresponding section from proposedModel.
  Unchecked sections retain their currentModel values.

After merge: run validateModel() on the merged model.
  If blocking errors: show errors; do not apply.
  If valid: apply and close diff panel.

Unit test:
  - Apply only "Queues" section from proposedModel
  - Assert: entity classes unchanged; queues updated; no other sections changed
```

**Completion checklist:**
- [ ] Section-level checkboxes in `ModelDiffPreview`
- [ ] Apply Selected merges only checked sections
- [ ] `validateModel()` called on merged model
- [ ] Unit test passes

---

### Sprint 8 Completion Gate

```bash
npm test -- --run                      # Zero failures
npm test -- llm                        # Model builder prompt tests pass
npm test -- ui                         # Chat panel + diff preview UI tests pass
npm run build                          # Succeeds
# Manual: type "a bank with 3 tellers, FIFO queue, arrivals at rate 0.4"
# Verify: LLM proposes model; diff-preview shows new elements; Apply creates valid model
# Manual: "add a second queue for priority customers"
# Verify: LLM proposes diff; partial apply works; validate passes
```

---

## Deferred Features Register

| Feature | Original sprint | Deferred to | Reason | Status |
|---|---|---|---|---|
| *(add rows as deferrals occur)* | | | | |

---

## Open Architectural Decisions

| ADR | Question | Needed by | Status |
|---|---|---|---|
| ADR-002 | Public model run permissions | Sprint 3 F3.8 | ⬜ Open |
| ADR-003 | LLM API key handling — client-side vs Edge Function proxy | Sprint 6 F6.2 | ⬜ Open — recommend Supabase Edge Function proxy; no API key in client bundle |
| ADR-004 | LLM conversation persistence — session only vs Supabase | Sprint 8 F8.3 | ⬜ Open — initial design: session only (React state) |
| ADR-005 | Piecewise distribution: warm-up interaction — does warm-up reset the period position? | Sprint 7 F7.2 | ⬜ Open — initial decision: no reset; schedule is time-indexed |
| *(add rows as new questions arise)* | | | |

---

## Known Issues Tracker

| # | Severity | Finding | File | Sprint | Status |
|---|---|---|---|---|---|
| C1 | Critical | `new Function()` eval — XSS | `conditions.js:76`, `macros.js:220` | S1 F1.1 | ⬜ |
| C2 | Critical | LIFO/Priority ignored by engine | `entities.js:84–88` | S1 F1.3 | ⬜ |
| C3 | High | C-scan restart pass-granularity | `engine/index.js:121–142` | S1 F1.2 | ⬜ |
| C4 | High | Phase C truncation silent | `engine/index.js:121` | S1 F1.6 | ⬜ |
| C5 | High | No pre-run validation | `execute/index.jsx:141–147` | S1 F1.5 | ⬜ |
| C6 | Medium | Stale B-Event refs after delete | `phases.js:91,125` | S1 F1.5 | ⬜ |
| C7 | Medium | No seeded RNG | `distributions.js:84` | S1 F1.4 | ⬜ |
| C8 | Low | ConditionBuilder tokens stale | `editors/index.jsx:495` | S2 F2.6 | ⬜ |
| C9 | Low | avg_service_time column mismatch | `db/models.js:127` | S5 F5.6 | ⬜ |
| C10 | Low | Distribution inputs missing type=number | `editors/index.jsx:171,241,731` | S1 F1.5 | ⬜ |
| C11 | Low | DistPicker ReferenceError | `components.jsx` | S1 F1.6 | ⬜ |

---

*End of build plan. Update after each sprint.*
*The most important rule: read the existing file before changing it.*
