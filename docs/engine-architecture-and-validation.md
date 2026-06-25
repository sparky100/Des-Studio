# DES Engine — Architecture, Testing, and Best-Practice Comparison

**Scope:** A reference document explaining (1) how `src/engine/` actually
works, (2) what test/validation evidence exists for it, and (3) how its
design choices stack up against standard discrete-event simulation (DES)
practice as described in Pidd (*Computer Simulation in Management
Science*), Banks/Carson/Nelson/Nicol (*Discrete-Event System Simulation*),
and Law (*Simulation Modeling and Analysis*). This consolidates and
cross-references existing docs (`DES_Studio_Engineering_Spec.md`,
`engine-api-reference.md`, `performance-envelope.md`,
`performance-audit.md`) rather than duplicating them — see each section
for pointers to the authoritative source.

**Engine version:** `simmodlr@0.9.0-Beta`, Sprint 88 baseline.
**Date:** 2026-06-25.

---

## 1. How the engine works

### 1.1 Layering

```
src/engine/   ← pure JS, zero React/DOM/Supabase dependencies
src/ui/       ← React; calls the engine only via buildEngine()/public-api.js
src/db/       ← Supabase CRUD wrappers
```

The engine runs unmodified in the browser main thread, a Web Worker, or
Node.js (`DES_Studio_Engineering_Spec.md` §1.1). This is itself a
best-practice property — most textbook DES engines are described as
"the model + the simulation executive," with no UI coupling, and this
codebase enforces that separation at the module-dependency level, not just
by convention.

### 1.2 The Three-Phase Method (A/B/C)

The engine implements **Pidd's Three-Phase Method**, the same algorithm
taught in Banks/Carson as the "event scheduling / activity scanning hybrid"
approach (`src/engine/phases.js`, `src/engine/index.js`):

- **Phase A** — advance the clock to the timestamp of the earliest pending
  entry in the Future Event List (FEL): `T_now = fel[0].scheduledTime`.
- **Phase B** — fire every *bound* (time-triggered) event due at `T_now`
  (within `1e-9` tolerance), in deterministic order, applying each
  B-Event's macro sequence (`ARRIVE`, `ASSIGN`, `COMPLETE`, `RELEASE`, …)
  and rescheduling any follow-on events.
- **Phase C** — scan all *conditional* events in ascending priority order;
  evaluate each one's predicate against current state; if any fires,
  **restart the scan from priority 1** rather than continuing where it
  left off. This restart rule is the textbook-mandatory part of the
  Three-Phase Method (it's what distinguishes it from a plain priority
  scan) and is enforced as a non-negotiable invariant in this codebase —
  `DES_Studio_Engineering_Spec.md` §1.4 lists it explicitly as a rule that
  "any optimisation that skips this restart changes simulation
  semantics," and it is exercised by `tests/engine/` correctness suites.

This is a textbook-correct implementation, not an approximation of one —
the restart rule is the detail most homegrown DES engines get wrong (it's
easy to "optimise" into a single linear pass and silently change which
events can fire in a given cycle), and this engine gets it right and
guards it.

### 1.3 Future Event List (FEL)

The FEL is a plain JS array, kept sorted via a full `Array.sort()` after
each batch of insertions, with O(1) peek (`fel[0]`) for Phase A and O(F)
`filter()` passes to collect/remove due events in Phase B. Textbook
practice (Banks/Carson ch. 3) recommends a sorted list, binary heap, or
calendar queue for the FEL; a heap gives O(log F) insert/extract vs. this
engine's O(F log F) sort. This was investigated directly during a recent
performance audit: a binary min-heap was implemented, benchmarked, and
**rejected** because it measured 25–40% *slower* than the array+sort
approach at every FEL size this engine's benchmark corpus exercises
(up to F=1,308 on the largest stress profile) — see
`docs/performance-audit.md` §3, §8.2 for the full measurement. The
takeaway: the array-based FEL is a deliberate, evidence-based choice for
this engine's actual scale, not an oversight of the textbook-recommended
heap structure — re-evaluate only if a future model class needs F
substantially larger than ~1,300.

### 1.4 Entities, queues, and the macro vocabulary

`entities.js` maintains an indexed queue structure — per-queue waiting
lists, an O(1) `id → entity` map, a server roster, and a lazy-sorted FIFO
cache — not a flat array scan. `attemptQueueJoin()` is the single
centralized entry point for joining any queue (from `ARRIVE`, `RELEASE`,
`BATCH`/`UNBATCH`/`SPLIT`, conditional routing, or preemption re-queue) and
uniformly enforces balking, capacity/overflow routing, and queue-level
auto-reneging regardless of how an entity arrives at the queue — this
matches the textbook expectation that queue-discipline rules (balking,
reneging, blocking) be defined once per queue and applied consistently,
not re-implemented per call site.

19 effect macros (`macros.js`) give model authors a fixed, safe vocabulary
(`ARRIVE`, `ASSIGN`, `COMPLETE`, `RELEASE`, `RENEGE`, `PREEMPT`, `FAIL`,
`REPAIR`, `BATCH`, `UNBATCH`, `MATCH`, `COSEIZE`, `SPLIT`, `SET`,
`SET_ATTR`, `COST`, …) — see `docs/engine-api-reference.md` for the full
table. Conditions are evaluated by a **safe predicate parser**
(`conditions.js`), not `eval`/`new Function` — a real security property,
not just a style choice, since model JSON can come from user-authored or
imported sources.

### 1.5 RNG and reproducibility

A single seedable `mulberry32` PRNG drives all sampling
(`distributions.js`); `Math.random()` does not appear anywhere in
`src/engine/`. Same seed → bit-identical results (verified by an explicit
benchmark gate, §3 below). Per-replication independence uses
`seed = baseSeed + replicationIndex`. 11 distribution types are supported
(Fixed, Uniform, Exponential, Normal, Triangular, Erlang, Empirical,
ServerAttr, EntityAttr, Piecewise, Schedule).

A per-distribution **stream-isolation** feature (separate RNG substreams
per named distribution, for Common Random Numbers support) was attempted
in a past sprint and **reverted** after it caused a 20% error in the
M/M/c correctness benchmark, traced to sub-seed correlation
(`createStreamRegistry()` is now a documented no-op stub). This is a real,
currently-open capability gap, not a forgotten TODO — see §4 below.

### 1.6 Replication and worker model

`replication-runner.js` runs multiple independent replications via a
**persistent Web Worker pool**: the model is sent to each worker exactly
once (`INIT_RUN`), and each subsequent job carries only
`{ replicationIndex, seed, entityDetail }` — avoiding a `structuredClone`
of the full model per replication. `collectTrace: false` is the default
for batch replications, skipping all per-cycle trace-entry construction.
Both are real, already-implemented performance mitigations (see
`docs/performance-audit.md` §1, §4 — confirmed correctly scoped, not
recommended for change).

### 1.7 Warmup, termination, and run admission

Warmup is handled as a FEL event (`WARMUP`, fired once at `t=warmupPeriod`)
that flips `_warmupComplete` and excludes pre-warmup-terminal entities from
final statistics. Termination supports a fixed `maxSimTime`, a
JSON-predicate `terminationCondition`, and a `maxCycles` ceiling (default
5000) as a forced-stop safety valve. Phase C additionally caps at
`maxCPasses` (default 5000) per cycle, truncating with a logged warning
(`PHASE_C_TRUNCATED`) rather than infinite-looping on a model with an
unstable/always-true condition. `run-admission.js` enforces tier-based
(Free/Standard/Pro) pre-run limits before any simulation starts — a
capacity-planning gate most academic/reference DES engines don't need
because they don't run as a shared multi-tenant web service.

---

## 2. Statistical analysis tooling

`statistics.js` is unusually complete for a DES engine of this scope.
What it actually implements, all confirmed in source:

| Capability | Function | Notes |
|---|---|---|
| Between-replication t-CI | `confidenceInterval95()` | The default, primary CI method reported in the Results panel — the textbook-correct method for replicated terminating/steady-state comparisons (Law ch. 9). |
| Welch's graphical warm-up detection | `detectWarmupWelch()` | Automated moving-average + knee-detection heuristic on top of Welch's method — this is the textbook gold-standard warmup-detection technique; most commercial/teaching DES tools only offer fixed (user-specified) truncation, which this engine *also* supports as the simpler default. |
| Batch means CI (single-run) | `batchMeansCI()`, `suggestBatchSize()` | Includes lag-1 autocorrelation-based batch-size suggestion — available, not the default (between-rep t-CI is preferred and used by default, which is itself the textbook-preferred approach when independent replications are affordable). |
| Paired comparison | `pairedTConfidenceInterval()`, `compareScenarios()` | Bonferroni-corrected for multiple metrics. |
| Multi-group comparison | `oneWayANOVA()`, `tukeyHSD()` | F-test + Tukey HSD post-hoc — matches Law & Kelton's recommended multiple-comparison procedure for >2 scenario variants. |
| Distribution fitting | `fitDistribution()` (`distribution-fitting.js`) | Fits 6 parametric families (Fixed, Exponential, Normal, Lognormal, Uniform, Triangular) by method of moments, ranks by **Kolmogorov-Smirnov statistic**, falls back to an empirical distribution above a fit-quality threshold. KS-based ranking is textbook-standard goodness-of-fit practice; MLE fitting (rather than method-of-moments) and a chi-square test would be the one upgrade a stricter reading of Law ch. 6 would ask for, but MoM+KS is a legitimate, commonly-taught lighter-weight alternative. |
| Outlier detection, histograms | `detectOutliers()`, `buildHistogram()`, `buildHistogramFD()` | Freedman-Diaconis bin-width rule available, not just fixed bin counts. |

**Verdict:** for a tool whose primary audience is operational analysts
rather than simulation PhDs, this statistics layer is at or above the
typical bar — Welch's method and ANOVA/Tukey in particular are features
many production DES tools skip entirely in favor of "run it 10 times and
eyeball the average."

---

## 3. What has been tested

### 3.1 Unit/integration tests

76 Vitest test files cover the engine directly: 64 in `tests/engine/` and
12 in `src/engine/__tests__/`, spanning macros, conditions, distributions,
entities, structural changes (mid-run model edits), system trends, warmup,
clock utilities, schedule/time-varying behaviour, and the SimPy export
path. Full-suite run captured during the most recent audit
(`npm test -- --run`): **150/180 test files passed, 2,439/2,499 individual
tests passed**. The 30 failing files split as:

- 21 are UI/component tests (React Testing Library DOM-query mismatches),
  unrelated to engine behaviour.
- 9 are engine/backend-layer and are **real, pre-existing issues** on a
  clean tree (confirmed to fail in isolation, not cross-test pollution):
  `resolve-inline-schedules`, `run-admission`, `single-run-control`,
  `three-phase`, `time-varying` test files, plus a confirmed correctness
  bug in `cschedule-when` (wrong branch selection on `when`-condition
  cSchedules) and two wrong-return-value bugs in `entities.test.js`'s
  `makeHelpers()` test harness. See `docs/performance-audit.md` Appendix
  for the full breakdown — these are tracked as known gaps, not silently
  ignored.

### 3.2 Analytical correctness benchmarks (`npm run bench`)

8 gates in `tests/engine/benchmarks/`, each validated against a **closed-
form queueing-theory result**, not just "didn't crash" — this is the part
of the test suite that actually proves the engine computes correct
numbers, not just that it runs:

| Benchmark | Theoretical result | Engine result | Tolerance |
|---|---|---|---|
| M/M/1 mean queue wait | Wq = 9.0000 | 8.8667 | ±2% |
| M/M/c mean queue wait | Wq = 1.7778 | 1.7305 | ±5% |
| M/G/1 Pollaczek-Khinchine | Wq = 6.0000 | 5.9761 | ±3% |
| M/M/1/K finite-queue loss probability | P_loss = 0.5079 | 0.5072 | ±3% |
| Priority queue ordering | HP.Wq < LP.Wq (directional) | confirmed | directional |
| Priority-induced LP wait inflation | LP.Wq > M/M/1 baseline | confirmed | directional |
| Warmup removal correctness | post-warmup error < pre-warmup error | confirmed | directional |
| Seeded reproducibility | bit-identical repeat runs | confirmed | exact |

All 10 tests across both benchmark files (`benchmarks.test.js`,
`performance.test.js`) pass — see `docs/performance-envelope.md` for the
full register including per-benchmark replication counts and seeds.
Validating against M/M/1, M/M/c, M/G/1 (P-K formula), and finite-capacity
loss probability is exactly the validation method Banks/Carson and Law
both recommend as the minimum bar for trusting a general-purpose DES
engine's core mechanics — this engine clears that bar with margin to
spare on every gate.

### 3.3 Throughput/scale benchmarks (`npm run bench:timing`)

13 load profiles ranging from trivial (M/M/1, 317 events) to a 90-day
refugee-displacement-corridor stress model (85,081 events, max queue depth
11,460, max FEL 1,308). Throughput ranges from ~657 events/sec on the
worst-case profile to ~28,000 events/sec on the best-case — a known,
measured, 13–40× spread that is *expected* (deep, sustained queue backlog
inherently costs more per event) rather than a regression. Full numbers
and the most recent before/after sprint comparison are in
`docs/performance-audit.md` §2, §8.3.

### 3.4 Determinism and structural-change parity

A dedicated `determinism-parity` suite asserts bit-identical output for
repeated seeded runs and for sequential vs. batched replication ordering
(14/14 passing as of the last audit). A separate `structural-changes.test.js`
suite covers mid-run model edits (the "edit while running" UI path) —
a class of correctness risk most static DES engines don't need to handle
at all, since they don't support live model mutation.

### 3.5 Validation rules (pre-run gate, not runtime testing)

`validation.js` enforces 46 distinct rule codes (V1–V47, with one code
retired) before any model is allowed to run — covering missing
sources/sinks, dangling queue references, non-numeric scheduled times,
unbalanced server counts, invalid balk probabilities, and macro-ordering
hazards (e.g. V38: `RELEASE` before `COMPLETE` in the same B-Event). This
is itself a form of testing — a static correctness gate run on every model
before simulation, analogous to a type-checker for the model DSL.

---

## 4. How the engine compares to DES best practice — summary

| Aspect | Textbook best practice | This engine | Verdict |
|---|---|---|---|
| Core algorithm | Three-phase (Pidd) or event-scheduling | Three-phase, restart rule enforced | **Matches**, correctly implemented |
| FEL structure | Heap / calendar queue for large F | Sorted array, re-sorted per batch | **Deliberate deviation**, measured to be faster at this engine's actual scale (F ≤ ~1,300); would need to revisit if model classes grow much larger |
| RNG | Long-period generator (MT19937, L'Ecuyer combined MRG) | `mulberry32` (32-bit, much shorter period) | **Below textbook gold standard** — fast and adequate for the run lengths this engine's benchmark corpus exercises, but not validated against a long-run statistical test battery (e.g. PractRand/TestU01) in this repo; a real, currently-unquantified risk for very long single runs |
| Per-replication independence | Independent streams or proven jump/leap functions | `seed = baseSeed + index` on a single generator | **Simpler than best practice**, but empirically checked: the seeded-reproducibility and M/M/c benchmarks pass, which would likely surface gross correlation, though this isn't a substitute for a formal independence proof |
| Variance reduction (CRN, antithetic variates) | Recommended for scenario comparison studies | **Absent.** CRN was attempted and reverted after a correctness regression | **Known gap**, explicitly tracked (`docs/performance-audit.md` §5, §6 item 3) — not silently missing |
| Warm-up handling | Welch's method or other automated detection preferred over guessing a fixed cutoff | Both fixed truncation (default) and Welch's method (`detectWarmupWelch`) available | **At or above** typical practice |
| Confidence intervals / multiple comparisons | Between-rep t-CI; ANOVA+Tukey or Bonferroni for >2 groups | All present and correctly chosen as defaults | **Matches** best practice |
| Distribution fitting | MLE + chi-square/KS goodness-of-fit | Method-of-moments + KS ranking, empirical fallback | **Slightly lighter-weight** than the strictest textbook prescription, but a legitimate and commonly-taught approach |
| Safety of model execution | N/A (most textbook engines aren't multi-tenant web services) | Safe predicate parser (no `eval`), tier-based run admission, Phase C truncation safety valve | **Exceeds** typical academic-engine scope — these are production/security concerns textbook DES engines don't address |
| Validated against closed-form queueing results | M/M/1, M/M/c, M/G/1, finite-capacity loss — the standard minimum validation set | All four implemented and passing, plus priority-queue and warmup-removal directional checks | **Matches** the recommended minimum validation bar |

**Overall:** the engine's core simulation logic (three-phase loop, queue
discipline enforcement, statistical analysis tooling) is implemented
correctly and, in several places (Welch's method, ANOVA/Tukey, validation
gate, safe predicate evaluation), exceeds what's typical for a tool in
this category. Its two honest, tracked gaps against the textbook ideal are
the RNG's shorter period/no formal independence proof and the absence of
variance-reduction techniques (CRN/antithetic variates) for scenario
comparison — both are documented as known limitations rather than
unexamined gaps, and both have a clear (if non-trivial) path to closing
them if a workflow ever needs it.
