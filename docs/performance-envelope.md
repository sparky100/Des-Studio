# DES Studio — Engine Performance Envelope

**Last updated:** 2026-05-19
**Branch:** `claude/add-run-results-immutability-6zSdu`
**Sprint:** PR-1

---

## Purpose

This document records the validated performance ceiling of the Three-Phase DES engine. It is the
authoritative reference for CI thresholds, benchmark pass/fail criteria, and "largest validated
model" claims. Update this document whenever a benchmark configuration changes or a new load
profile is validated.

---

## Benchmark Register (8 gates)

Run with: `npm run bench`  (vitest run tests/engine/benchmarks)

All 8 benchmarks exist in `tests/engine/benchmarks/benchmarks.test.js`.

| # | Name | Model | Expected | Tolerance | Actual result | Pass/Fail |
|---|------|-------|----------|-----------|---------------|-----------|
| 1 | M/M/1 mean queue wait | λ=0.9, μ=1.0, ρ=0.9, c=1 | Wq = 9.0000 | ±2% | 8.8667 (1.48% err) | **PASS** |
| 2 | M/M/c mean queue wait | λ=1.6, μ=1.0, ρ=0.8, c=2 | Wq = 1.7778 | ±5% | 1.7305 (2.66% err) | **PASS** |
| 3 | M/G/1 Pollaczek-Khinchine | λ=0.9, Uniform[0,2] svc, ρ=0.9 | Wq = 6.0000 | ±3% | 5.9761 (0.40% err, 30 reps) | **PASS** |
| 4 | M/M/1/K finite queue loss | λ=2.0, μ=1.0, K=5 (cap=4+srv) | P_loss = 0.5079 | ±3% | 0.5072 (0.15% err, 20 reps) | **PASS** |
| 5 | Priority queue ordering | HP(p=1) & LP(p=2), λ=0.8, μ=1.0 | HP.Wq < LP.Wq | directional | HP=1.34 < LP=6.51 | **PASS** |
| 6 | Priority-induced LP wait | HP(p=1) & LP(p=2), λ=0.9, μ=1.0 | LP.Wq > 9.0 (M/M/1 baseline) | directional | LP.Wq = 15.93 | **PASS** |
| 7 | Warmup removal correctness | M/M/1 λ=0.9, 20 reps each | \|B−9.0\| < \|A−9.0\| | directional | A=8.35 (err 0.65), B=8.66 (err 0.34) | **PASS** |
| 8 | Seeded reproducibility | M/M/1, seed=42, 5 reps | run1 ≡ run2 (exact) | exact | avgWait=7.0711 (identical) | **PASS** |

**Benchmark parameters:**

| # | Replications | warmupPeriod | maxSimTime | Base seed |
|---|-------------|-------------|-----------|-----------|
| 1 | 1 (single run) | N/A (slice-based, N=200) | until 500 served | 42 |
| 2 | 1 (single run) | N/A (slice-based, N=500) | until 2000 served | 42 |
| 3 | 30 | 10 000 | 50 000 | 200 |
| 4 | 20 | 0 (not needed — near capacity from t=0) | 30 000 | 400 |
| 5 | 20 | 0 | 10 000 | 600 |
| 6 | 15 | 0 | 20 000 | 700 |
| 7 | 20 + 20 | 0 (Run A) / 500 (Run B) | 10 000 | 800 |
| 8 | 1 + 1 | 1 000 | 5 000 | 42 |

---

## Performance Timing (automated gate)

Test file: `tests/engine/benchmarks/performance.test.js`

| Model | Entity types | Queues | B-events | C-events | maxSimTime | Threshold | Actual | Status |
|-------|-------------|--------|----------|----------|-----------|-----------|--------|--------|
| Complex multi-queue | 3 (TypeA, TypeB, Server×4) | 4 | 6 | 4 | 2 000 | < 3 000ms | ≈ 440ms | **PASS** |

The model uses 5 arrival streams at low rate (mean ≈ 15–25 t/arrival) producing ~550 events per run.
A regression that causes this to exceed 3 000ms indicates an accidental O(n²) loop in a hot path.

---

## Analytical Benchmarks Legacy Section

The original M/M/1 and M/M/c gates (Benchmarks 1–2) also run via:

```bash
npx vitest run tests/benchmarks/golden.test.js
```

| Benchmark | Analytical Wq | Simulated Wq (seed=42) | Error | Tolerance | Status |
|-----------|--------------|----------------------|-------|-----------|--------|
| M/M/1     | 9.0000 | 8.8667 | 1.48% | **2%** (tightened from 5%) | PASS |
| M/M/c     | 1.7778 | 1.7305 | 2.66% | 5% | PASS |

---

## Replication CI Gate

Vitest test: `tests/engine/replication-ci.test.js`

| Scenario | Replications | Config | CI result |
|----------|-------------|--------|-----------|
| M/M/1    | 30 reps, baseSeed=300 | warmup=200, maxSimTime=600 | 95% CI contains 9.0 ✓ |
| M/M/c    | 20 reps, baseSeed=500 | warmup=200, maxSimTime=1000 | 95% CI contains 1.7778 ✓ |

---

## Largest Validated Model Configurations

| Configuration | Entity types | Servers | Queues | Customers served | Steps | Validated |
|--------------|-------------|---------|--------|-----------------|-------|-----------|
| M/M/1 benchmark | 2 (customer + server) | 1 | implicit | 500 | 1 000 | Sprint 1 |
| M/M/c benchmark | 2 (customer + server) | 2 | implicit | 2 025 | 4 050 | Sprint 29 |
| M/G/1 benchmark (30 reps) | 2 | 1 | implicit | ~36 000 per rep | ~72 000 per rep | PR-1 |
| M/M/1/K benchmark (20 reps) | 2 | 1 | 1 (cap=4) | ~15 000 per rep | ~30 000 per rep | PR-1 |
| Priority queue (20 reps, 2 types) | 3 | 1 | 1 (PRIORITY) | ~8 000 per rep | ~16 000 per rep | PR-1 |
| Replication run (M/M/1 × 30 reps) | 2 | 1 | implicit | ~900 per rep | ~1 800 per rep | Sprint 29 |
| Multi-server pooling tests | 2 | up to 5 | 1 | varies | bounded by maxSimTime=50 | Sprint 26 |
| Multi-stage queue tests | 4 | 2 | 2 | varies | bounded | Sprint 26 |

No test has validated a model with more than 5 entity types, 5 servers, or 3 queues
simultaneously under full load. Larger configurations have not been stress-tested.

---

## Performance Timing Script

A manual timing script is available for measuring engine throughput:

```bash
node tests/engine/perf_timing.js
```

This script runs three load profiles and reports steps/sec and customers/sec. It is not part of
the automated test suite — run it manually after significant engine changes and update the
"Measured throughput" section below.

### Measured throughput baseline

> Update this table after running `node tests/engine/perf_timing.js` on a representative machine.

| Profile | λ | μ | c | Target customers | Steps/sec (approx) | Customers/sec (approx) |
|---------|---|---|---|-----------------|-------------------|------------------------|
| M/M/1 high-util | 0.9 | 1.0 | 1 | 5 000 | — | — |
| M/M/c | 1.6 | 1.0 | 2 | 5 000 | — | — |
| Heavy low-util | 0.5 | 1.0 | 1 | 20 000 | — | — |

*Run `node tests/engine/perf_timing.js` and paste the results here.*

---

## Known Non-Determinism

The following are the **only** known sources of non-determinism in the system:

| Location | Source | Scope |
|----------|--------|-------|
| `src/ui/` | `Math.random()` used for visual/animation effects | UI layer only — no simulation impact |
| `src/db/` | `Math.random()` used for share-link token generation | DB layer only — no simulation impact |
| `crypto.randomUUID()` | Share link token generation | DB layer only |

**Zero** occurrences of `Math.random()` or `crypto.getRandomValues()` exist in `src/engine/`.
Verify: `grep -r "Math.random" src/engine/` — must return no output.

All engine randomness uses `mulberry32(seed)` passed to `buildEngine(model, seed, ...)`. A run
with the same seed and model always produces bit-identical results (verified by Benchmark 8,
`tests/engine/trace-determinism.test.js`, and `tests/engine/distributions.test.js`).

---

## Regression Thresholds

| Gate | File | Threshold |
|------|------|-----------|
| M/M/1 mean wait | `tests/benchmarks/golden.test.js` | 8.0 – 10.0 (regression lock), **≤2%** error |
| M/M/c mean wait | `tests/benchmarks/golden.test.js` | 1.5 – 2.1 (regression lock), ≤5% error |
| All 8 benchmarks | `tests/engine/benchmarks/benchmarks.test.js` | `npm run bench` exits 0 |
| Full test suite | `npm test` | 0 failures in engine/db/llm tests |
| Production build | `npm run build` | exit 0 |

---

## Update History

| Date | Sprint | Change |
|------|--------|--------|
| 2026-05-14 | 29 | Initial document created. M/M/1 and M/M/c baselines recorded. Performance timing script added. |
| 2026-05-19 | PR-1 | Added Benchmarks 3–8 (M/G/1, M/M/1/K, priority ordering, LP wait, warmup, reproducibility). Tightened M/M/1 tolerance from 5% to 2%. Added `npm run bench` script. |
