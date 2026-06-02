# Sprint 81 — Codebase Deduplication

**Sprint:** 81  
**Theme:** Eliminate Fallow-identified clone groups across engine, UI, and tests  
**Status:** 🔄 In progress  
**Branch:** `claude/sprint-81-deduplication`  
**Owner:** parkinsonsj@gmail.com

> **Branch policy:** All changes are made on `claude/sprint-81-deduplication`. Each block is committed and pushed only after its test gate passes. Nothing merges to `main` until the full suite is green.

---

## Goal

Fallow's `dupes` analysis found **460 clone groups totalling 9,453 duplicated lines (11.7%)** across 163 files. This sprint works through them in five coherent blocks, each ending with a commit and push. The health score deduction for duplication is currently **−6.7 points**; target is to bring duplication below 7% (−4 points or better).

Production-code duplications are addressed first (highest bug-risk); test-helper extraction follows.

---

## Duplication Inventory

### Production code (highest priority)

| ID | Files | Lines | Notes |
|---|---|---|---|
| P1 | `src/engine/macros.js` (internal) | 83 | 9 clone groups — case/branch repetition |
| P2 | `src/engine/phases.js` (internal) | 50 | 3 clone groups |
| P3 | `src/engine/index.js` (internal) | 21 | 2 clone groups |
| P4 | `src/engine/entities.js` (internal) | 13 | 2 clone groups |
| P5 | `src/engine/statistics.js` (internal) | 27 | 3 clone groups |
| P6 | `src/engine/index.js` ↔ `src/engine/macros.js` | 22 | 2 groups of 11 lines each |
| P7 | `src/engine/index.js` ↔ `src/ui/execute/executeHelpers.js` | 17 | engine logic leaked into UI helpers |
| P8 | `src/ui/ModelDetail.jsx` ↔ `src/ui/ModelHistoryTab.jsx` | 119 | two separate clone blocks (71 + 48 lines) |
| P9 | `src/ui/execute/index.jsx` (internal, lines 2108–2169 and 2202–2263) | 62 | copy-paste branch inside ExecutePanel |

### Test helpers (lower risk, still worth fixing)

| ID | Files | Lines | Notes |
|---|---|---|---|
| T1 | `src/engine/__tests__/cschedule-when.test.js` | 60 | 5 groups — extract shared fixtures/helpers |
| T2 | `src/engine/__tests__/engine.test.js` | 25 | 2 groups — extract setup helpers |
| T3 | `src/engine/__tests__/macros.test.js` | 20 | 3 groups — extract builder helpers |
| T4 | `tests/ui/ModelHistoryTab.test.jsx` ↔ `tests/ui/ReproduceRun.test.jsx` | 125 | largest clone; extract shared test factory |
| T5 | `tests/engine/mmc_benchmark.js` ↔ `tests/engine/replication-ci.test.js` | 90 | extract shared benchmark bootstrap |
| T6 | `tests/engine/queue-name-spaces.test.js` ↔ `tests/ui/visual-designer/graph.test.js` | 90 | extract shared model fixture |
| T7 | `tests/ui/execute/results-export.test.jsx` ↔ `tests/ui/execute/sweep-2d.test.jsx` | 78 | extract shared execute fixture |
| T8 | `tests/benchmarks/golden.test.js` ↔ `tests/engine/benchmarks/benchmarks.test.js` | 64 | extract shared benchmark harness |
| T9 | `tests/engine/adaptive-batch.test.js` ↔ `tests/engine/replication-ci.test.js` | 60 | extract shared run-config helper |
| T10 | `tests/llm/prompts.test.js` (internal, lines 919–969 and 1054–1104) | 51 | extract shared prompt assertion helper |

---

## Blocks and Deliverables

### Block A — Engine internals  
**Scope:** P1 (macros.js), P2 (phases.js), P3 (index.js internal), P4 (entities.js), P5 (statistics.js)  
**Approach:** For each file, read the clone groups identified by Fallow, extract repeated logic into private helper functions in the same file. No API surface changes.  
**Tests:** Run `npx vitest run tests/engine` before and after; all must pass.  
**Commit message:** `refactor(engine): extract internal clone groups in macros, phases, index, entities, statistics`

| Task | Status |
|---|---|
| A1 — Read `macros.js`, extract 9 internal clone groups | ⬜ |
| A2 — Read `phases.js`, extract 3 internal clone groups | ⬜ |
| A3 — Read `engine/index.js`, extract 2 internal clone groups | ⬜ |
| A4 — Read `entities.js`, extract 2 internal clone groups | ⬜ |
| A5 — Read `statistics.js`, extract 3 internal clone groups | ⬜ |
| A6 — Run engine tests, verify green | ⬜ |
| A7 — Commit + push Block A | ⬜ |

---

### Block B — Engine cross-file duplications  
**Scope:** P6 (index.js ↔ macros.js), P7 (index.js ↔ executeHelpers.js)  
**Approach:** P6 — move shared logic to a new private `src/engine/_shared.js` (or into whichever file owns the concept) and import in both; P7 — move the leaked helper back into the engine and have `executeHelpers.js` import it.  
**Tests:** Run `npx vitest run tests/engine tests/ui/execute` before and after.  
**Commit message:** `refactor(engine): consolidate cross-file duplications between index, macros, and executeHelpers`

| Task | Status |
|---|---|
| B1 — Read clone groups across `index.js`/`macros.js`, identify canonical home | ⬜ |
| B2 — Extract shared function, update both callers | ⬜ |
| B3 — Read clone groups across `index.js`/`executeHelpers.js`, move to engine | ⬜ |
| B4 — Update `executeHelpers.js` import | ⬜ |
| B5 — Run engine + execute tests, verify green | ⬜ |
| B6 — Commit + push Block B | ⬜ |

---

### Block C — UI production duplications  
**Scope:** P8 (ModelDetail ↔ ModelHistoryTab), P9 (execute/index.jsx internal)  
**Approach:**  
- P8 — The two clone blocks between `ModelDetail` and `ModelHistoryTab` are strong candidates for a shared custom hook or utility (likely run-list/history rendering logic). Extract to `src/ui/shared/useRunHistory.js` or similar.  
- P9 — The 62-line internal clone in `execute/index.jsx` at lines 2108 and 2202 is a copy-paste branch; read both blocks to understand the variation, then collapse into a single parameterised function.  
**Tests:** Run `npx vitest run tests/ui` before and after; start dev server and smoke-test ModelDetail and Execute tabs.  
**Commit message:** `refactor(ui): deduplicate ModelDetail/ModelHistoryTab shared logic and ExecutePanel internal clone`

| Task | Status |
|---|---|
| C1 — Read `ModelDetail.jsx:168–260` and `ModelHistoryTab.jsx:24–90`, identify shared pattern | ⬜ |
| C2 — Extract shared logic to hook/utility | ⬜ |
| C3 — Update both components to use extraction | ⬜ |
| C4 — Read `execute/index.jsx:2108–2263`, identify parameter variation between copies | ⬜ |
| C5 — Collapse to single parameterised function | ⬜ |
| C6 — Run UI tests, smoke-test in browser | ⬜ |
| C7 — Commit + push Block C | ⬜ |

---

### Block D — Engine test helpers  
**Scope:** T1 (cschedule-when.test.js), T2 (engine.test.js), T3 (macros.test.js)  
**Approach:** Extract shared fixtures and builder helpers into `src/engine/__tests__/helpers/` — small files like `makeModel.js`, `makeEntityCtx.js`, etc. Import in each test file.  
**Tests:** Run `npx vitest run src/engine/__tests__` — all must still pass.  
**Commit message:** `test(engine): extract shared fixtures and helpers from __tests__ clone groups`

| Task | Status |
|---|---|
| D1 — Read cschedule-when.test.js clone groups, extract to helpers/ | ⬜ |
| D2 — Read engine.test.js clone groups, extract to helpers/ | ⬜ |
| D3 — Read macros.test.js clone groups, extract to helpers/ | ⬜ |
| D4 — Run engine __tests__, verify green | ⬜ |
| D5 — Commit + push Block D | ⬜ |

---

### Block E — UI and cross-domain test helpers  
**Scope:** T4–T10  
**Approach:**  
- T4 — Extract shared factory into `tests/ui/__helpers__/runHistoryFactory.js`  
- T5, T9 — Extract shared benchmark/replication bootstrap into `tests/engine/__helpers__/benchmarkHelpers.js`  
- T6 — Extract shared model fixture into `tests/fixtures/queueNameModel.js`  
- T7 — Extract shared execute fixture into `tests/ui/execute/__helpers__/executeFixture.js`  
- T8 — Extract shared benchmark harness into `tests/benchmarks/__helpers__/benchmarkHarness.js`  
- T10 — Extract shared prompt assertion helper into `tests/llm/__helpers__/promptAssertions.js`  
**Tests:** Run full `npx vitest run` — all must pass.  
**Commit message:** `test: extract shared test helpers for UI, engine, benchmark, and LLM clone groups`

| Task | Status |
|---|---|
| E1 — T4: ModelHistoryTab ↔ ReproduceRun factory extraction | ⬜ |
| E2 — T5 + T9: benchmark/replication bootstrap extraction | ⬜ |
| E3 — T6: shared model fixture extraction | ⬜ |
| E4 — T7: execute fixture extraction | ⬜ |
| E5 — T8: benchmark harness extraction | ⬜ |
| E6 — T10: prompt assertion helper extraction | ⬜ |
| E7 — Run full test suite, verify green | ⬜ |
| E8 — Commit + push Block E | ⬜ |

---

## Acceptance Criteria

- [ ] `npx fallow dupes` duplication rate drops below 7% (from 11.7%)
- [ ] All existing Vitest tests pass after each block
- [ ] No new ESLint errors introduced
- [ ] Each block has its own commit on `claude/sprint-81-deduplication` and is pushed before the next block begins
- [ ] `npx fallow health` score improves by at least 4 points (duplication deduction reduced from −6.7)

---

## Out of Scope

- `dist/` and `__generated__/` artefacts (Fallow tip: add to `health.ignore`)
- Complexity refactors (Sprint 82 candidate based on `fallow health` hotspots)
- Dead code removal (separate `fallow dead-code` sprint)
- Structural refactor of `ExecutePanel` (3100 lines) — deduplication of the 62-line internal clone is in scope; the full decomposition is not

---

## Notes

- Run `npx fallow dupes` again after each block to track progress and catch any regressions
- The `src/ui/share/qr.js` clone groups are not in the top Fallow output for `dupes` — they are a complexity problem (CRAP score 3391), not a duplication one; leave for the complexity sprint
- The 450 additional clone groups beyond the top 10 are mostly small (< 10 lines); the blocks above address the families Fallow explicitly recommends for extraction — re-run after Block E to assess residual
