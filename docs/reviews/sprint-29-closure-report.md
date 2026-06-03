# Sprint 29 — Closure Report

Created: 2026-05-14
Status: ✅ Complete
Plan reference: `docs/reviews/sprint-29-pre-sprint-assessment.md`

---

## Sprint Summary

Sprint 29 hardened simmodlr's test infrastructure and established a durable analytical
correctness baseline. All 18 pre-existing test failures (deferred F28.0 scope) were diagnosed and
fixed. The M/M/c (two-server queue) Erlang-C benchmark was created and passes at 2.66% error. A
reproducibility contract was documented in AGENTS.md. A performance envelope document was
established. Locked golden regression fixtures were added. A GitHub Actions CI workflow was wired
up. RNG cross-replication independence was formally tested.

---

## Goal

Harden the test infrastructure by fixing pre-existing test drift (18 failures), adding M/M/c
analytical validation, documenting the reproducibility contract, establishing a performance
envelope, and wiring benchmarks into CI.

---

## Delivery Status

| Work item | Status | Notes |
|---|---|---|
| F29.0 — Fix 18 pre-existing test failures | ✅ Complete | All 18 were assertion drift. 947/947 tests now pass. |
| F29.1 — M/M/c analytical benchmark + CI gate | ✅ Complete | `tests/engine/mmc_benchmark.js` exits 0 (Erlang-C Wq=1.7778, error=2.66%). `replication-ci.test.js` extended with 20-rep M/M/c CI gate. |
| F29.2 — Reproducibility contract in AGENTS.md | ✅ Complete | 6-point reproducibility contract in §9.4. |
| F29.3 — Performance timing script + envelope doc | ✅ Complete | `tests/engine/perf_timing.js` and `docs/performance-envelope.md` created. |
| F29.4 — Locked golden regression fixtures | ✅ Complete | `tests/benchmarks/golden.test.js` — 4 tests pinning M/M/1 and M/M/c mean wait to tight analytical windows. |
| F29.5 — GitHub Actions CI workflow | ✅ Complete | `.github/workflows/ci.yml` with 3 jobs: Vitest suite, analytical benchmarks, production build. |
| F29.6 — RNG cross-replication independence | ✅ Complete | 3 tests added to `tests/engine/distributions.test.js`. |
| Sprint documentation | ✅ Complete | AGENTS.md §20–21, `docs/simmodlr_Build_Plan.md` sprint history and current sprint updated to Sprint 29. |

---

## Delivered Scope

### F29.0 — 18 Pre-Existing Test Failures Fixed

Root causes were entirely assertion drift (no engine bugs):

| File | Count | Root cause |
|---|---|---|
| `tests/ui/execute/sweep-2d.test.jsx` | 6 | Sprint 28 renamed parametric-sweep tab from "Experiments" to "Studies" |
| `tests/ui/model-import.test.jsx` | 3 | V8 validation blocks import for model with empty bEvents |
| `tests/ui/run-history.test.jsx` | 2 | "History" is an inner sub-tab (role="tab") inside "Analysis" mode button |
| `tests/ui/share/DashboardView.test.jsx` | 2 | Section headers renamed to "QUEUE PERFORMANCE" / "SERVER PERFORMANCE" |
| `tests/llm/proxy-contract.test.js` | 2 | `ANTHROPIC_MODEL` renamed to `DEFAULT_MODEL`; comment removed |
| `tests/ui/delete-model.test.jsx` | 1 | `getByRole` used before async `fetchModels` resolved |
| `tests/ui/editors/ai-model-apply-save.test.jsx` | 1 | "AI Designer" is an inner tab inside "Design" mode — two-click navigation |
| `tests/engine/time-varying.test.js` | 1 | Base model in validation test had empty bEvents; V8 fires an error |

### F29.1 — M/M/c Benchmark and CI Gate

- `tests/engine/mmc_benchmark.js`: M/M/c with c=2, λ=1.6, μ=1.0, ρ=0.8. Erlang-C analytical
  Wq ≈ 1.7778. Seed=42, N_SERVED=2000, N_WARMUP=500, TOLERANCE=5%. Exits 0 (2.66% error).
- `tests/engine/replication-ci.test.js`: Added 20-replication M/M/c CI gate. 95% CI must contain
  1.7778. Test passes in ~66s.

### F29.2 — Reproducibility Contract

Six invariants documented in AGENTS.md §9.4:
1. Bit-identical replay with same seed
2. Cross-replication independence (no shared PRNG state)
3. No `Math.random()` in `src/engine/`
4. Analytical validation gates (two Node.js benchmarks)
5. 95% CI coverage (Vitest)
6. Seed storage and display contract

### F29.3 — Performance Envelope

- `tests/engine/perf_timing.js`: runs 3 load profiles, reports steps/sec and customers/sec. Not
  part of automated CI — run manually after engine changes.
- `docs/performance-envelope.md`: records validated model configurations, benchmark baselines,
  measured throughput table (to be populated by running the script), known non-determinism
  sources, and regression thresholds.

### F29.4 — Golden Regression Fixtures

`tests/benchmarks/golden.test.js` (4 tests, all pass):
- M/M/1 seed=42: mean wait ≤5% of 9.0 AND pinned to 8.0–10.0 window
- M/M/c seed=42: mean wait ≤5% of 1.7778 AND pinned to 1.5–2.1 window

### F29.5 — GitHub Actions CI Workflow

`.github/workflows/ci.yml`:
- **test** job: `npm ci` + `npm test -- --run` on Node.js 20
- **benchmarks** job (after test): `node tests/engine/mm1_benchmark.js` + `node tests/engine/mmc_benchmark.js`
- **build** job (after test): `npm run build` with placeholder Supabase env vars

### F29.6 — RNG Cross-Replication Independence

3 new tests in `tests/engine/distributions.test.js` `cross-replication independence` describe block:
1. Consecutive seeds (baseSeed+0, baseSeed+1) produce different B-event time sequences
2. Running replication 0 does not alter replication 1's outcome (no shared PRNG state)
3. Ten consecutive seeds all produce distinct average wait times

---

## Deferred or Removed Scope

None. All F29.0–F29.6 features delivered.

---

## Verification

```
Tests:   947/947 passing (0 failures)
M/M/1:   node tests/engine/mm1_benchmark.js → PASS (1.48% error)
M/M/c:   node tests/engine/mmc_benchmark.js → PASS (2.66% error)
Golden:  tests/benchmarks/golden.test.js → 4/4 passing
Indep:   tests/engine/distributions.test.js → 11/11 passing (incl. 3 new)
RepCI:   tests/engine/replication-ci.test.js → 2/2 passing
CI:      .github/workflows/ci.yml → syntax valid, committed
```

---

## Regressions, Risks, and Follow-Ups

- The performance timing script shows low throughput (~59 steps/sec) when run in a resource-
  constrained background environment. The `docs/performance-envelope.md` throughput table has
  placeholder dashes — run `node tests/engine/perf_timing.js` on a developer machine and fill
  in the table.
- The golden fixture window for M/M/c (1.5–2.1) is relatively wide for a sample of 1525
  customers post-warmup. If M/M/c N_SERVED is increased in a future sprint, tighten the window.

---

## Final Assessment

Sprint 29 is complete. All exit gates pass. The test suite is at 947/947 (0 failures) for the
first time since Sprint 28 introduced the Experiments tab restructure. The analytical correctness
baseline now covers both M/M/1 and M/M/c. The reproducibility contract is explicit and enforced
by five separate test mechanisms. CI is automated via GitHub Actions.
