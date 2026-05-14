# DES Studio — Engine Performance Envelope

**Last updated:** 2026-05-14
**Branch:** `claude/sprint-28-inventory-BDYGg`
**Sprint:** 29

---

## Purpose

This document records the validated performance ceiling of the Three-Phase DES engine. It is the
authoritative reference for CI thresholds, benchmark pass/fail criteria, and "largest validated
model" claims. Update this document whenever a benchmark configuration changes or a new load
profile is validated.

---

## Analytical Benchmarks (correctness gates)

Both benchmarks exit 0 after every engine change. Run with:

```bash
node tests/engine/mm1_benchmark.js
node tests/engine/mmc_benchmark.js
```

| Benchmark | Model | Analytical Wq | Simulated Wq (seed=42) | Error | Tolerance | Status |
|-----------|-------|--------------|----------------------|-------|-----------|--------|
| M/M/1     | λ=0.9, μ=1.0, ρ=0.9, c=1 | 9.0000 | 8.8667 | 1.48% | 5% | PASS |
| M/M/c     | λ=1.6, μ=1.0, ρ=0.8, c=2 | 1.7778 | 1.7305 | 2.66% | 5% | PASS |

Benchmark parameters: N_SERVED=500/2000, N_WARMUP=200/500, fixed seed 42.

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
| Replication run (M/M/1 × 30 reps) | 2 | 1 | implicit | ~900 per rep | ~1 800 per rep | Sprint 29 |
| Replication run (M/M/c × 20 reps) | 2 | 2 | implicit | ~1 600 per rep | ~3 200 per rep | Sprint 29 |
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
with the same seed and model always produces bit-identical results (verified by
`tests/engine/trace-determinism.test.js` and `tests/engine/distributions.test.js`).

---

## Regression Thresholds

| Gate | File | Threshold |
|------|------|-----------|
| M/M/1 mean wait | `tests/benchmarks/golden.test.js` | 8.0 – 10.0 (regression lock), ≤5% error (analytical gate) |
| M/M/c mean wait | `tests/benchmarks/golden.test.js` | 1.5 – 2.1 (regression lock), ≤5% error (analytical gate) |
| Full test suite | `npm test -- --run` | 0 failures |
| M/M/1 benchmark | `node tests/engine/mm1_benchmark.js` | exit 0 (≤5% error) |
| M/M/c benchmark | `node tests/engine/mmc_benchmark.js` | exit 0 (≤5% error) |
| Production build | `npm run build` | exit 0 |

---

## Update History

| Date | Sprint | Change |
|------|--------|--------|
| 2026-05-14 | 29 | Initial document created. M/M/1 and M/M/c baselines recorded. Performance timing script added. |
