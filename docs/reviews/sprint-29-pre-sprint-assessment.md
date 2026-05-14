# Sprint 29 Pre-Sprint Assessment — Inventory Report

**Branch:** `claude/sprint-28-inventory-BDYGg`
**Date:** 2026-05-14
**Constraint:** Assessment only — no implementation code.

---

## Area 1 — Existing Benchmark and Correctness Tests

### 1a. M/M/1 Benchmark

**EXISTS** — `tests/engine/mm1_benchmark.js`

- Manual Node.js script (not Vitest), run with `node tests/engine/mm1_benchmark.js`
- Parameters: λ=0.9, μ=1.0, ρ=0.9, seed=42, run duration=50,000 time units
- Pass criterion: simulated mean queue wait within 5% of analytical value (9.0 time units)
- Last run result: **PASS — 1.48% error**
- Not integrated into CI (`npm test` does not run it)

**EXISTS** — `tests/engine/replication-ci.test.js`

- Vitest test; IS part of CI
- Runs 30 M/M/1 replications; asserts 95% CI contains analytical mean wait 9.0
- One test: `30 M/M/1 replications produce a 95% CI containing analytical mean wait`

### 1b. M/M/c Benchmark

**ABSENT** — No M/M/c (multi-server queue) analytical benchmark exists anywhere in the test suite.

`tests/engine/multi-server-pooling.test.js` covers multi-server structural behaviour (capacity > 1,
seize/release, pool mechanics) but contains no comparison against an M/M/c analytical formula
(Erlang-C).

### 1c. Other Correctness Tests

| File | Nature | Status |
|---|---|---|
| `tests/engine/sprint-24-correctness.test.js` | 6 locked regression tests: B-event scheduling after t=900, Phase C truncation surface, reneging timer binding, stale COMPLETE event, serviceStart=0 service duration, downshift capacity retain | EXISTS |
| `tests/engine/three-phase.test.js` | Three-Phase engine execution correctness | EXISTS |
| `tests/engine/termination.test.js` | Simulation termination conditions | EXISTS |
| `tests/engine/replication-runner.test.js` | Replication orchestration: seed assignment, bounded pool, ordered results, cancellation, error propagation | EXISTS |
| `tests/engine/distributions.test.js` | PRNG sampling correctness | EXISTS |
| `tests/engine/distribution-fitting.test.js` | Distribution parameter fitting | EXISTS |
| `tests/engine/statistics.test.js` | 60 tests across 11 `describe` blocks covering CI, warmup detection, batch means, Bonferroni, comparison, percentiles, outliers, precision helpers | EXISTS |

### 1d. Full Test File Inventory (79 files)

**Engine (29 files):**
`batch-unbatch`, `conditional-routing`, `conditions`, `distribution-fitting`, `distributions`,
`entities`, `finite-queue`, `mm1_benchmark` (manual), `multi-server-pooling`, `multi-stage-queue`,
`probabilistic-routing`, `queue-name-spaces`, `queue-refs`, `recirculation`, `replication-ci`,
`replication-runner`, `sprint-24-correctness`, `statistics`, `sweep-params`, `sweep-runner`,
`templates`, `termination`, `three-phase`, `time-series`, `time-varying`, `trace-determinism`,
`triage-test`, `validation`, `worker`

**UI (38 files):** Editors, execute panel, sweep-2d, results-export, model-detail, model-import,
delete-model, run-history, model-results-tab, DashboardView, share, ai-apply-save, and others

**LLM (6 files):** Prompt builders, proxy contract, model-builder prompts

**DB (4 files):** models.js CRUD, run history

**Contracts (2 files):** Engine contract specifications

---

## Area 2 — Reproducibility and RNG

### Seeded PRNG Location

**EXISTS** — `src/engine/distributions.js`, `mulberry32()` function, top of file (~line 1–20)

- 32-bit seedable PRNG; all engine randomness flows through it
- `sample(dist, rng)` uses the passed `rng` function exclusively
- Replication seeds assigned deterministically in `src/engine/replication-runner.js`

### `Math.random` Occurrences in `src/`

**4 occurrences — none in the engine layer:**

| Location | Context |
|---|---|
| `src/ui/…` | UI-layer only (animation, visual randomness) |
| `src/db/…` | DB-layer only (non-simulation) |

Zero occurrences in `src/engine/`. The engine is fully isolated from `Math.random`.

### Seed Determinism Test

**EXISTS** — `tests/engine/trace-determinism.test.js`

- Runs the same model twice with the same seed; asserts the full event trace is identical
- Is part of the Vitest suite (runs in CI)

**EXISTS** — `tests/engine/replication-runner.test.js`

- Test: `assigns deterministic independent seeds` — verifies each replication gets a unique,
  deterministic seed derived from the master seed

### Documented Non-Determinism

**ABSENT** — No `docs/` document or ADR records any known source of non-determinism. No
`KNOWN_NON_DETERMINISM.md` or equivalent.

---

## Area 3 — Existing Performance Measurement

### Performance Benchmark Scripts

**ABSENT** — No `scripts/` directory. No timing or throughput benchmark scripts outside of
`tests/engine/mm1_benchmark.js`, which measures correctness (mean wait error), not execution speed.

### `docs/performance-envelope.md`

**ABSENT** — No such file in `docs/`. No performance-envelope document anywhere in the project.

### Largest Validated Model

**ABSENT** — Not documented anywhere. The `mm1_benchmark.js` uses run duration 50,000 with λ=0.9
(≈45,000 arrivals) — this is the largest model configuration that has been run, but no explicit
"max validated size" is recorded. No test exercises a model with more than a handful of entity
types or queues simultaneously. Performance ceiling is undocumented.

---

## Area 4 — Golden Results and Regression Fixtures

### Locked Numerical Outputs

**PARTIAL** — Two tiers exist:

1. **Hard locks** (`tests/engine/sprint-24-correctness.test.js`): 6 tests assert exact
   boolean/structural outcomes (e.g., `maxCPasses` is truthy, reneging timer binds to correct
   context). These are structural correctness locks, not numerical magnitude locks.

2. **Soft gate** (`tests/engine/replication-ci.test.js`): 95% CI must *contain* 9.0. This is a
   range check, not a pinned value. Any result between roughly 8.0–10.5 would pass.

No test pins a specific mean wait value with tight tolerance (e.g., "must be 9.0 ± 0.3"). The M/M/1
manual benchmark does this but is not in CI.

### `tests/benchmarks/` Directory

**ABSENT** — No `tests/benchmarks/` directory exists.

### Programmatic Test Models

All test models are **inline JavaScript objects** constructed in test files. No JSON fixture files on
disk in `tests/`. Consequence: there is no canonical "reference model" file that could be versioned
separately as a golden fixture.

---

## Area 5 — Test Infrastructure Health

### Full Test Run (latest)

```
Test Files  8 failed | 71 passed (79)
     Tests  18 failed | 929 passed (947)
  Duration  67–71s
```

### 18 Failing Tests (all pre-existing — F28.0 deferred scope)

| File | Count | Root cause |
|---|---|---|
| `tests/ui/execute/sweep-2d.test.jsx` | 6 | Assertion drift — UI restructure |
| `tests/ui/model-import.test.jsx` | 3 | Assertion drift — saveModel signature |
| `tests/ui/run-history.test.jsx` | 2 | Assertion drift — UI restructure |
| `tests/ui/share/DashboardView.test.jsx` | 2 | Assertion drift — render path |
| `tests/llm/proxy-contract.test.js` | 2 | Assertion drift — payload shape |
| `tests/ui/delete-model.test.jsx` | 1 | Assertion drift |
| `tests/ui/editors/ai-model-apply-save.test.jsx` | 1 | Assertion drift |
| `tests/engine/time-varying.test.js` | 1 | Assertion drift — validation message |

All 18 are UI/assertion drift from production code evolution — no engine correctness bugs. All
pre-date Sprint 28.

### Execution Time

~67–71 seconds total (including 27s environment setup). Tests run in ~121s accumulated wall time
across parallel environments.

### CI Pipeline

No CI configuration file found (no `.github/workflows/`, no `.circleci/`, no `Makefile` with a
`test` target visible). Test gate is `npm test -- --run`. The M/M/1 manual benchmark
(`mm1_benchmark.js`) is **not** wired into any automated gate.

---

## Summary Table — F29.x Pre-Conditions

| Feature | Pre-condition | Met? | Action required |
|---|---|---|---|
| **F29.0 — Fix pre-existing failures** (deferred F28.0) | 18 failing tests identified and categorised | YES | Fix all 18 (assertion drift only); no engine changes expected |
| **F29.1 — M/M/1 + M/M/c benchmarks in CI** | M/M/1 manual benchmark EXISTS and passes; M/M/c benchmark ABSENT; Vitest CI gate for M/M/1 EXISTS | PARTIAL | Create `tests/engine/mmc_benchmark.js` with Erlang-C analytical formula; wire both benchmarks into a Vitest test or add to `replication-ci.test.js` |
| **F29.2 — Reproducibility hardening** | mulberry32 PRNG EXISTS; no `Math.random` in engine; determinism test EXISTS; no documented non-determinism | YES | Document reproducibility contract in AGENTS.md or ADR; consider adding a cross-environment bit-exact test |
| **F29.3 — Performance envelope** | No benchmark scripts; no performance-envelope.md; no documented model size ceiling | NO | Write a timing benchmark script; add `docs/performance-envelope.md`; define largest validated model |
| **F29.4 — Golden results / locked regression suite** | Structural locks in sprint-24 tests; M/M/1 soft CI gate; no pinned numerical fixtures; no `tests/benchmarks/` directory | PARTIAL | Create `tests/benchmarks/` directory; write M/M/1 locked fixture (mean=9.0 ± 0.3, seed=42) and M/M/c locked fixture once F29.1 complete |
| **F29.5 — Test infrastructure** | 947 tests; 18 pre-existing failures; no CI pipeline config; manual benchmark not gated | PARTIAL | Add GitHub Actions workflow (or equivalent); make `mm1_benchmark.js` a CI job; target 0 failing tests post F29.0 |
| **F29.6 — RNG cross-replication independence** | `replication-runner.test.js` covers seed assignment determinism structurally; no test verifies statistical independence of replication streams | PARTIAL | Add a test asserting that two replications with different seeds produce different traces and that their combined output passes a basic independence check |

---

**Assessment verdict:** Sprint 29 has a clear, bounded scope. F29.0 (18 failures) and F29.1 (M/M/c
benchmark) are the highest priority. F29.3 (performance envelope) is the only area with no
foundation at all. All other features have partial infrastructure to build on.
