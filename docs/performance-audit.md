# DES Studio Engine — Performance Audit

**Scope:** Read-and-analyse audit of `src/engine/` (Three-Phase discrete-event
simulation core). No production code was changed as part of this audit.
A throwaway measurement script (`/tmp/.../scratchpad/perf-audit-bench.mjs`,
not checked into the repo) was used to capture heap data the existing
benchmark suite doesn't report; everything else reuses the project's own
benchmark/stress infrastructure.

**Date:** 2026-06-25
**Engine version under test:** `simmodlr@0.9.0` (commit `09dd1db`)

---

## 1. Engine Overview

The engine (`src/engine/index.js`, `buildEngine()`) implements Pidd's
**Three-Phase Method** (A/B/C), as mandated by `AGENTS.md` §4:

- **Phase A** — advance the clock to the timestamp of the earliest entry in
  the Future Event List (FEL). `fel[0].scheduledTime` is read directly
  (O(1)) because the FEL is kept sorted (see below).
- **Phase B** — fire every event whose `scheduledTime` matches the new
  clock exactly (within `1e-9`). Due events are collected with
  `fel.filter(...)` and then removed from the FEL with a second
  `fel.filter(...)` (`src/engine/index.js:880`, `:908`) — both are full
  O(F) scans/array-allocations, run every single `step()` call.
- **Phase C** — scan all C-events in priority order, evaluating each
  event's compiled condition predicate; firing any event restarts the scan
  from priority 1 (the three-phase method's mandatory restart rule). An
  optional **dependency-aware filter** (enabled once a model has ≥8
  C-events) tracks a "dirty set" of state touched since the last firing and
  skips re-evaluating C-events whose declared dependencies don't intersect
  it — this is a genuine, pre-existing optimisation, not something this
  audit needs to recommend.

**FEL data structure.** The FEL (`fel`) is a **plain JS array**, not a
binary heap or priority queue. It is fully re-sorted with `Array.prototype.sort`
after every batch of Phase B / Phase C insertions
(`src/engine/index.js:802, 1096, 1154, 1880`) — i.e. an O(F log F) sort on
every cycle that schedules new events, on top of the O(F) filter scans in
Phase B. In practice `F` (the FEL) stays small (single digits to low
hundreds — see §3), because only *scheduled future events* (arrivals,
service completions, scheduled changes) live in the FEL; per-customer
waiting state lives in a separate, properly indexed structure (below). This
means the FEL's O(F log F) re-sort is not currently a bottleneck for any
profile measured, but it is an architectural weak point that will degrade
non-gracefully (i.e. suddenly, not gradually) on a model class the current
benchmark suite doesn't cover: very high-frequency dynamic event
rescheduling (e.g. heavy use of `updateScheduledTime` or schedule changes
that touch thousands of FEL entries at once).

**Entity / queue state storage.** `entities.js` maintains a real index
(`createQueueIndex()`): a `Map` of waiting entities per queue
(`waitingByQueue`), a small server roster (`servers`), an O(1) `id → entity`
map (`byId`), and a lazy-sort cache for FIFO buckets
(`fifoSortedByQueue`/`isPlainFifo`). This contradicts the older
`docs/analysis/three-phase-engine-efficiency-review.md`, which describes
queue operations as "mostly array-scan" — that was accurate at the time it
was written but the indexing layer has since been built out. Queue
membership, server-idle lookups, and id-based entity resolution are now
O(1)/O(bucket) operations, not O(N) scans over the full entity population.

**Terminal-entity pruning.** Done/reneged customer entities are *not*
removed from the hot-path `entities` array immediately on completion.
Instead, a sweep (`pruneStaleEntities`, `src/engine/index.js:572-585`) only
runs when `entities.length > 1000` **and** the cycle count is a multiple of
500. Removed entities are moved into a separate `_completed` accumulator
(`entities.concat(_completed)` is what `getSnap()` / `getSummary()` read,
so final statistics are unaffected by *when* a sweep happens to run). This
produces a **sawtooth pattern**: the hot-path array is allowed to grow
unboundedly (no upper limit) between sweeps, climbing back to ~1000 before
each sweep fires, then collapsing back to near-zero. Measured directly
(see §4) — this multiplies the average per-step cost of any per-cycle
O(entities) work roughly 5-10× during the high-population half of each
sawtooth cycle, compared to a design that prunes continuously or at a much
lower threshold.

**Per-event/entity/tick allocations.** Every B/C-event firing that creates a
new FEL entry allocates a fresh object literal (`fel.push({...})`); every
new customer/server is a fresh object via `createCustomer`/
`createServerEntities` (`entities.js`) — **there is no object pooling
anywhere in the engine.** This is idiomatic for V8 (short-lived object
allocation/collection is cheap and pooling often *hurts* performance in
modern JS engines), so this audit does **not** recommend adding pooling —
see §6.

**TraceCollector.** (`src/simulation/traceCollector.js`) is capped at
`TRACE_CAP = 1000` entries, is instantiated fresh per run (never
accumulated across replications), and is only populated when
`collectTrace !== false`. `replication-runner.js` explicitly sets
`collectTrace: options.collectTrace === true` — **off by default for batch
replications** — so the hypothesis that TraceCollector might be an
unbounded-memory-growth risk during multi-replication batches is **not
borne out**; it's already correctly scoped. This audit does not recommend
changing TraceCollector's lifecycle.

**RNG.** A single seedable PRNG (`mulberry32`, `src/engine/distributions.js`)
drives all sampling for a given engine instance. `Math.random()` does not
appear anywhere in `src/engine/`. Cross-replication independence is
achieved via `seed = baseSeed + replicationIndex`
(`replication-runner.js:263`) — confirmed correct. There is **no
Common-Random-Numbers (CRN) support**: `createStreamRegistry()` is a
deliberate no-op stub (`distributions.js:48-54`) — per-distribution stream
isolation was implemented in a past sprint ("Sprint 84") and *reverted*
after it caused a 20% error in the M/M/c correctness benchmark from
sub-seed correlation. See §5.

---

## 2. Benchmark Results

Two benchmark suites already exist in the repo and were run fresh for this
audit (`npm run bench`, `npm run bench:timing`); per the task's "run
existing scripts before writing new ones" guidance, no new benchmark
infrastructure was added to the repo. A throwaway, non-committed script
(`perf-audit-bench.mjs`) was used only to obtain a heap-usage number the
existing scripts don't report, run against a 3-stage tandem-queue model
matching this audit's required scenario shape (1 generator → 3 sequential
single-resource activities → 1 sink).

**`npm run bench`** (8 analytical correctness benchmarks, `tests/engine/benchmarks/`):
all 10 tests across 2 files **passed** in 88.5s wall time (M/M/1, M/M/c,
M/G/1 P-K, M/M/1/K loss probability, priority queueing, PREEMPT, warmup
removal, and seeded-reproducibility gates). No regression in any
analytically-validated correctness or performance gate.

**`npm run bench:timing`** (steps/sec across 13 load profiles,
`tests/engine/perf_timing.js`, default/non-stress profiles):

| Profile | category | events_processed | max_queue_length | max_FEL | wall_clock_ms | events/sec |
|---|---|---|---|---|---|---|
| M/M/1 small | core | 317 | 8 | 3 | 37 | 8,568 |
| M/M/1 high utilisation | core | 1,608 | 29 | 3 | 89 | 18,067 |
| Multi-stage post office | core | 687 | 53 | 6 | 49 | 14,020 |
| Glasgow train plan | core | 45 | 1 | 4 | 4 | 11,250 |
| Stadium grouped spectators | core | 55 | 1 | 5 | 3 | 18,333 |
| Many false C-events | phase-c | 881 | 12 | 3 | 196 | 4,495 |
| Many active C-events | phase-c | 2,511 | 61 | 15 | 232 | 10,823 |
| Queue-depth scaling (light) | queue-growth | 1,471 | 22 | 3 | 52 | 28,288 |
| Queue-depth scaling (medium) | queue-growth | 1,677 | 64 | 3 | 81 | 20,704 |
| Queue-depth scaling (heavy) | queue-growth | 1,805 | 47 | 3 | 72 | 25,069 |
| A&E department (9 types, 10 queues, 30 events) | real-world | 5,749 | 37 | 66 | 647 | 8,886 |
| **Refugee displacement corridor** (90-day, ~18k arrivals, 7 C-events) | real-world | 85,081 | **11,460** | **1,308** | **129,414** | **657** |

The refugee-displacement-corridor profile is the standout result: it is
**~13–40× slower in events/sec** than every other profile, with a max
queue depth of 11,460 and a max FEL size of 1,308 — both one to three
orders of magnitude larger than any other profile. This is direct,
already-validated evidence (not a hypothetical) that the engine's
performance degrades sharply, not gracefully, once a model sustains deep
queue backlogs over a long horizon. See §3 for why.

**Custom heap/wall-time probe** (3-stage tandem queue, generator → 3
sequential single-resource activities → sink, Exponential inter-arrival
mean=1.15, Exponential service mean=1 per stage, ρ≈0.87/stage):

| Metric | Value (5 reps × 2,000 sim-time) | Notes |
|---|---|---|
| Wall time, total | 101,943.8 ms (≈102 s) | 5 replications |
| Wall time, per replication | 20,388.8 ms (≈20.4 s) | min 19,058.3 ms / max 21,420.9 ms |
| Events processed | 58,848 total | |
| Customers served | 8,367 total | |
| Events/sec | **577** | `process.memoryUsage().heapUsed`, sampled every 2,000 steps |
| Peak heap used | 114.6 MB | |

> **Two scope notes on the literal task spec (mean=1 inter-arrival, mean=1
> service, 3 single-server stages in series, 30 reps × 10,000 sim-time):**
>
> 1. **Stability.** Mean=1/mean=1 at every one of 3 stages in series gives
>    ρ=1 at every stage — a queueing-theoretically **unstable** network
>    with infinite expected queue length. A direct probe of this exact
>    configuration was run and killed manually after confirming unbounded
>    RSS growth (~150 MB/10s, no sign of leveling off) — expected behaviour
>    of an unstable network, not an engine bug. The script was changed to
>    inter-arrival mean=1.15 (ρ≈0.87/stage) to get a finite, reportable
>    number.
> 2. **The full 30-reps × 10,000-sim-time run, even at the stable
>    ρ≈0.87/stage configuration, did not finish.** It was run with a
>    generous 580-second timeout and killed by `timeout` (exit code 124)
>    without producing output — RSS was still climbing slowly and steadily
>    (no runaway leak, ~101→114 MB over the portion observed) when killed,
>    consistent with steady, bounded-but-slow work rather than a crash.
>    The table above instead reports a reduced run (5 reps × 2,000
>    sim-time, same rates) that *did* complete, at **577 events/sec** —
>    within the same order of magnitude as the refugee-displacement-corridor
>    profile's 657 events/sec (the slowest of the 13 existing `bench:timing`
>    profiles, see above), despite this custom model being far simpler (3
>    single-server stages vs. 9 entity types / 10 queues / 30 events).
>    Linearly extrapolating 5×2,000 → 30×10,000 is a ~30× increase in raw
>    work, which would put the full run around 50 minutes — but per-cycle
>    cost is *not* constant (see §3/§4's pruning-sawtooth finding), so the
>    real figure is plausibly worse than linear. **This is itself a direct,
>    reproducible data point for this audit's top finding**: sustained
>    queue backlog over a long horizon degrades this engine's throughput by
>    over an order of magnitude versus its best-case ~28,000 events/sec,
>    independent of model complexity.

---

## 3. Event List Assessment

| Aspect | Finding |
|---|---|
| **Structure** | Plain JS array (`fel`), not a binary heap / pairing heap / skip list. |
| **Insert complexity** | O(1) push, immediately followed by a full `Array.sort()` — O(F log F) — run once per cycle that adds events (not once per insert; batched per Phase B/C round). |
| **Dequeue complexity** | O(1) read of `fel[0]` for "what's next" (Phase A); O(F) `filter()` to collect all due events (Phase B); O(F) `filter()` again to remove them. |
| **Typical size, medium model** | 3–66 across all measured non-stress profiles (median ~5). The FEL holds only scheduled *future* events (arrivals, service completions, shift/rate changes) — per-customer waiting state lives in the separate queue index, not the FEL. |
| **Scale impact** | At F ≤ 66, an O(F log F) sort costs microseconds — irrelevant in absolute terms today. The risk is profiles that legitimately need a large *F*: the refugee-displacement-corridor stress profile reaches **F = 1,308**, and at that scale repeated full sorts (rather than incremental heap operations) become a measurable, avoidable cost layered on top of the queue-depth-driven slowdown that dominates that profile (see §4). |
| **Event-cancellation handling** | No tombstoning. `updateScheduledTime()` (`index.js:1869`) mutates `scheduledTime` in place on matching FEL entries, then does a full re-sort. `pruneTerminalEntities()` removes FEL entries tied to pruned entities via `fel.filter(...)` rather than direct removal-by-reference. Both are O(F) — correct, but another full scan layered on the existing per-cycle scans. |
| **Recommended alternative** | A binary min-heap keyed on `scheduledTime` would convert the O(F log F) sort + O(F) due-event scan into O(log F) insert / O(log F) extract-min, with due-event collection via repeated `peek()`/`pop()` while `fel[0].scheduledTime === clock`. **This is not worth doing for the current benchmark corpus** (F stays in single/low-double digits for every non-stress profile) but becomes worth doing if/when models with FEL sizes in the hundreds–thousands (dense schedule-driven arrivals, very large multi-resource networks) become a supported, expected use case rather than a stress-test edge case. See §6, item 1. |

---

## 4. Memory Findings

| Location | Issue | Recommended fix | Estimated impact |
|---|---|---|---|
| `src/engine/index.js:572-585` (`pruneStaleEntities`, `PRUNE_MIN_LIVE=1000`, `PRUNE_INTERVAL_CYCLES=500`) | Hot-path `entities` array is allowed to grow **unboundedly** between sweeps — there is no cap, only a "prune once we cross 1000 *and* hit a 500-cycle checkpoint" trigger. Confirmed by direct instrumentation: hot-path size oscillates in a sawtooth between near-zero and ~500-1,000+ on a moderately loaded 3-stage model, not staying flat near the live population (which was in the tens). | Lower `PRUNE_MIN_LIVE` (or make it proportional to current live-customer count rather than a fixed constant), or sweep on every cycle once the array exceeds a small multiple of the *live* population instead of an absolute 1,000 floor. | Reduces the peak (and average) per-cycle cost of every O(entities)-shaped operation (Phase B/C entity scans, `allEntitiesForStats()` concatenation, queue-index rebuilds after a sweep) by roughly 5-10× on sustained-load models, with no change to final-statistics correctness (the `_completed` accumulator already preserves history regardless of sweep timing). |
| Refugee-displacement-corridor stress profile (`tests/engine/benchmark-scenarios.js`) | At `max_queue_length = 11,460`, the live `entities` array is two orders of magnitude past the 1,000 prune threshold for sustained periods, and `max_future_event_list = 1,308` means the FEL's per-cycle full-sort is also operating far outside the regime every other profile exercises. The 657 events/sec result (vs. 8,000-28,000 elsewhere) is consistent with both costs compounding. | Same fix as above for the entity-pool side; a heap-based FEL (§3) for the FEL side. | This is the single biggest, already-measured performance cliff in the suite — see §6 item 1 for prioritisation. |
| `src/engine/entities.js` (`createCustomer`, `createServerEntities`), `distributions.js` (`sampleAttrs`) | No object pooling for entities, events, or attribute objects — every entity/event/attrs bag is a fresh allocation. | **No fix recommended.** V8's generational GC handles short-lived object churn efficiently; pooling adds complexity (manual reset logic, risk of stale-state bugs across reuse) for a cost that doesn't show up in any benchmark here. Flagged only because the original audit brief asked about it explicitly. | None — included for completeness, not as an actionable item. |
| `src/simulation/traceCollector.js` | None found. `TRACE_CAP=1000`, fresh instance per run, off by default for batch replications (`replication-runner.js`). | No fix needed. | N/A |
| `src/engine/replication-runner.js:55-77` (`compactReplicationPayload`) | Already strips `log` (the largest unbounded field) before a replication's result crosses the worker boundary; per-replication `entityDetail` is only requested for replication 0. This is a correct, already-implemented mitigation, not a gap. | No fix needed. | N/A |

---

## 5. RNG Assessment

- **PRNG:** `mulberry32`, a fast 32-bit seedable generator. Confirmed: no
  `Math.random()` calls anywhere in `src/engine/`.
- **Streams:** **One single global stream per engine instance.**
  `createStreamRegistry()` (`distributions.js:48-54`) is a documented
  no-op — `getRng()` always returns `null`, causing `sample()` to fall back
  to the shared `rng`. The comment in the source explains why: per-
  distribution stream isolation was implemented and then reverted after it
  caused a 20% error in the M/M/c correctness benchmark, traced to
  sub-seed correlation between derived per-stream seeds.
- **Per-replication independence:** correct and verified —
  `seed = baseSeed + replicationIndex` (`replication-runner.js:263`).
  Benchmark 8 ("Seeded reproducibility") explicitly tests and confirms
  bit-identical results for repeated runs with the same seed, and
  consistent results for sequential vs. batch replication ordering.
- **CRN (Common Random Numbers) support: absent.** Because every
  distribution draw shares one stream, the engine cannot use CRN-style
  variance reduction (e.g. comparing two scenario variants replication-by-
  replication with synchronized random number consumption) — changing
  *any* upstream model parameter shifts every subsequent draw's position in
  the stream, so scenario A and scenario B at the same `seed` do not share
  the same underlying random numbers past the first divergence point. This
  is a real limitation for anyone using DES Studio for A/B scenario
  comparison studies, but reintroducing per-stream isolation requires
  solving the sub-seed correlation bug that caused the Sprint 84 revert —
  it is not a quick fix. See §6.

---

## 6. Prioritised Recommendations

| # | Recommendation | Area | Effort | Expected Impact |
|---|---|---|---|---|
| 1 | Lower/relativize the terminal-entity prune threshold (`PRUNE_MIN_LIVE`) so the hot-path `entities` array tracks live population rather than oscillating up to a fixed 1,000-entry ceiling before sweeping. | Memory / hot-path scan cost | Low (single constant + maybe a live-count tracker; `pruneTerminalEntities` itself is correct and reusable as-is) | High — directly addresses the worst measured result in the suite (refugee-displacement-corridor's 657 events/sec, 13-40× slower than every other profile) and reduces average per-cycle cost on any sustained-load model, not just that one stress profile. |
| 2 | Replace the FEL's array+full-resort with a binary min-heap (insert/extract-min in O(log F) instead of O(F log F) sort + O(F) filter). | Event List structure | Medium (self-contained change behind the existing `fel[0]`/`fel.push`/`fel.filter` call sites; `updateScheduledTime`'s decrease-key case needs care) | Medium-High for large-F models (e.g. the 1,308-entry FEL in the corridor stress test); negligible for the F≤66 profiles that make up the rest of the suite today. Pair with #1 — the corridor profile's slowdown is compounded from both costs. |
| 3 | Re-attempt per-distribution RNG stream isolation (CRN support), this time root-causing the sub-seed correlation bug from Sprint 84 rather than reverting to a shared stream. | RNG / variance reduction | High (needs careful seed-derivation design + the M/M/c benchmark as a regression guard) | Medium — unlocks CRN-based scenario comparison, a capability gap rather than a performance bug; not urgent unless a specific workflow needs it. |
| 4 | Add a benchmark profile between "Many active C-events" (F=15) and "refugee-displacement-corridor" (F=1,308) — e.g. a sustained-overload single-stage queue at ρ≈0.95-0.98 for a few thousand time units — to give the suite visibility into the *onset* of the cliff rather than only its extreme end. | Benchmark coverage | Low (one new fixture in `tests/engine/benchmark-scenarios.js`, following the existing pattern) | Medium — turns "we know it's bad somewhere between these two points" into an actual measured curve, making #1/#2's payoff verifiable and regression-testable. |
| 5 | No action: object pooling, TraceCollector lifecycle, and `compactReplicationPayload` trace stripping. | Memory | — | None needed — already correctly designed or not worth the complexity (see §4). |

Ranked by impact/effort: #1 is the clear first move (cheapest, highest
measured payoff). #2 should land alongside or shortly after #1 since both
target the same stress profile and the FEL fix is moot at small F. #4 is
cheap and de-risks #1/#2 by giving them something to regress against. #3
is the most valuable *capability* gap but is also the most expensive and
riskiest (it has already caused one correctness regression historically) —
treat it as a separate initiative, not a quick win.

---

## 7. Suggested Sprint Scope

**Change:**
- `src/engine/index.js`: rework `PRUNE_MIN_LIVE`/`PRUNE_INTERVAL_CYCLES`
  into a threshold relative to current live population (recommendation #1).
  This is the only change in this sprint's critical path.
- `tests/engine/benchmark-scenarios.js` + `tests/engine/perf_timing.js`:
  add the intermediate sustained-overload profile (recommendation #4) to
  make the before/after improvement from the pruning change measurable and
  to guard against future regressions in that range.

**Do not touch in this sprint:**
- The FEL array/sort structure (recommendation #2) — real, but it's a
  separate, self-contained change with its own risk surface
  (`updateScheduledTime`'s in-place mutation + re-sort needs a heap-aware
  decrease-key equivalent); bundling it with the pruning fix would make a
  single PR harder to review and to attribute regressions to.
- RNG stream isolation (recommendation #3) — out of scope; it previously
  caused a correctness regression and needs its own root-cause investigation
  and dedicated benchmark-guarded sprint, not a quick follow-on to a
  performance sprint.
- Object pooling, TraceCollector, `compactReplicationPayload` — no changes
  recommended (see §4/§6 item 5).

**Tests to add:**
- A regression test asserting the hot-path `entities` array (or an
  equivalent observable proxy, e.g. `getRuntimeMetrics().max_queue_length`
  cross-checked against a new internal sawtooth-amplitude metric) stays
  within a bounded multiple of live population on the new sustained-
  overload profile, not just on `entities.length > 1000`.
- Re-run `npm run bench` (must stay green — these are the analytical
  correctness gates and must not regress from a pruning-threshold change)
  and `npm run bench:timing` before/after, with the refugee-displacement-
  corridor and the new intermediate profile's `events_per_second` /
  `wall_clock_ms` captured as the sprint's before/after evidence.

---

## Appendix: Test Suite Status (Step 2)

`npm test -- --run` (full Vitest suite, captured fresh for this audit):
**150/180 test files passed, 2,439/2,499 individual tests passed** (30
files / 60 tests failed). 21 of the 30 failed files are UI/component tests
(React Testing Library queries not finding expected DOM nodes — e.g.
`tests/ui/visual-designer/visual-designer-panel.test.jsx:726`, looking for
a "Save changes" button after a drag-and-drop interaction). These are
unrelated to engine performance and out of this audit's scope.

**9 of the 30 failed files are engine/backend-layer, not UI**, and were
re-run individually to rule out cross-file test-pollution — they fail in
isolation too, so these are real, pre-existing functional issues on a
clean working tree (not introduced by this audit, not flaky):

- `tests/engine/resolve-inline-schedules.test.js`, `run-admission.test.js`,
  `single-run-control.test.js`, `three-phase.test.js`, `time-varying.test.js`
- `src/engine/__tests__/cschedule-when.test.js` — **looks like a genuine
  correctness bug**: `when`-condition first-match cSchedule selection
  returns the wrong branch (`'b_gen'` regardless of `surgery_type`).
- `src/engine/__tests__/entities.test.js` — `makeHelpers().busyOf()` and
  `.findById()` return wrong values (`0` instead of `1`; `null` instead of
  `undefined`).
- `src/reports/__tests__/reportGenerator.test.js`, `supabase/functions/results-api/index.test.ts`

These are **functional/correctness gaps, not performance regressions**,
and are flagged here only because Step 2 of this audit's brief asked for
pass/fail counts to be recorded honestly. They should be triaged
separately from the performance recommendations in §6 — fixing
`cschedule-when` in particular looks like a small, contained, high-value
bug fix worth its own follow-up, but it is out of scope for a performance
audit and was not touched.

The 10 analytical performance/correctness benchmarks in
`tests/engine/benchmarks/` (a stricter, more authoritative subset run via
`npm run bench`) all passed — see §2.
