# Three-Phase Engine Efficiency Review

## Existing Benchmark Baseline

- Existing benchmark scripts found:
  - `tests/engine/mm1_benchmark.js`
  - `tests/engine/mmc_benchmark.js`
  - `tests/engine/perf_timing.js`
  - `tests/engine/benchmarks/benchmarks.test.js`
  - `tests/engine/benchmarks/performance.test.js`
  - `tests/benchmarks/golden.test.js`
- Existing benchmark fixtures/models found:
  - M/M/1 and M/M/c analytical queueing fixtures in `tests/engine/mm1_benchmark.js`, `tests/engine/mmc_benchmark.js`, and `tests/benchmarks/golden.test.js`
  - multi-profile timing fixtures in `tests/engine/perf_timing.js`, including:
    - `many-c-events-mostly-false`
    - `many-c-events-high-churn`
  - complex multi-queue throughput fixture in `tests/engine/benchmarks/performance.test.js`
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/reviews/sprint-72-performance-optimisation-plan.md`
  - `docs/reviews/sprint-72-performance-optimisation-closure.md`
- Existing runtime metrics found:
  - engine runtime counters in `src/engine/index.js:363-370`
  - saved runtime metrics in `src/db/models.js:387-388`
  - runtime metric aggregation in `src/ui/execute/executeHelpers.js:29-45`
- Existing test coverage related to performance:
  - analytical and qualitative correctness gates in `tests/engine/benchmarks/benchmarks.test.js`
  - wall-clock throughput gate in `tests/engine/benchmarks/performance.test.js:92-104`
  - manual throughput and Phase C evaluation counters in `tests/engine/perf_timing.js:156-233`
  - runtime metrics assertions in `tests/engine/three-phase.test.js`
- Gaps compared with the requested benchmark/sizing goal:
  - no micro-benchmark isolates queue helper cost, FEL sorting cost, or macro dispatch cost independently
  - no benchmark varies queue depth to prove asymptotic queue-selection behaviour
  - no benchmark isolates conditional-routing predicate cost separately from core B/C event cost
  - no benchmark directly compares JSON-predicate models against legacy string-condition models

## Sufficiency Of Current Benchmarks

The current benchmark baseline is good enough to support broad conclusions about where the engine slows down, especially for C-heavy models.

What the repo already proves:

- `tests/engine/perf_timing.js:4-13` explicitly targets Phase C stress
- `docs/performance-envelope.md:126-164` records that the `many-c-events-mostly-false` and `many-c-events-high-churn` scenarios are the dominant hot-path references
- `docs/performance-envelope.md:134` explicitly states that the hot path is Phase C scan cost rather than basic B-event throughput

What the repo does not yet prove directly:

- exact cost split between queue helper scans, predicate evaluation, and FEL maintenance
- exact cost of `ASSIGN`/`RELEASE` on large queues
- exact crossover point where filtering overhead outweighs scan savings

So the conclusions below are a mix of:

- measured behaviour from the existing benchmark baseline
- code-level complexity analysis from the current implementation

I call out inferred points as such.

## Executive Read

The current engine is still fundamentally scan-based over shared arrays:

- the future-event list is an array kept sorted with repeated full sorts
- customers and servers live in one `entities` array
- queue selection is built from repeated `filter(...)`, `find(...)`, and `sort(...)` operations over that array
- Phase C still restarts from the top after every firing, as required by three-phase semantics

The strongest current optimisation is dependency-aware Phase C filtering:

- C-event conditions are compiled once and annotated with dependencies in `src/engine/index.js:453-460`
- selective C-event evaluation is enabled for larger C-event sets in `src/engine/index.js:461-464`
- `shouldEvaluateCEvent()` in `src/engine/index.js:85-107` skips obviously unaffected C-events

That is consistent with the measured benchmark envelope:

- `docs/performance-envelope.md:131-132` shows the C-heavy profiles are the pressure points
- `docs/performance-envelope.md:161-162` shows those profiles improved once dependency-aware filtering was in place

## How B-Events Are Processed

### Current implementation

- due B-events are collected with `fel.filter(...)` in `src/engine/index.js:655-656`
- all due B-events are removed with another `fel.filter(...)` in `src/engine/index.js:686-687`
- each B-event calls `fireBEvent()` in `src/engine/index.js:781-783`
- any generated FEL entries are appended and then the full FEL array is sorted in `src/engine/index.js:795-797`

### Complexity

Let:

- `F` = current FEL length
- `D` = number of due B-events at the current clock
- `K` = number of new FEL entries created by a B-event

Then one Phase B cycle is approximately:

- due collection: `O(F)`
- due removal: `O(F)`
- per B-event FEL reinsertion by append + full sort: `O((F + K) log(F + K))` each time sorting occurs

So the B-event path is not constant-time queue/FEL maintenance. It repeatedly rescans and resorts arrays.

### Likely impact

This is acceptable for small and medium models, but it scales poorly when:

- many B-events share the same timestamp
- a B-event emits multiple future events
- the FEL grows large

## How C-Events Are Scanned

### Current implementation

- C-events are sorted once by priority at engine build time in `src/engine/index.js:453-460`
- after every Phase B, the engine enters a restart-loop in `src/engine/index.js:814-904`
- on each pass it rebuilds helpers and predicate state:
  - `makeHelpers(...)` at `src/engine/index.js:818`
  - `usePredicateState(...)` at `src/engine/index.js:819`
- then it scans `sortedCEvents` from top to bottom:
  - scan count increment at `src/engine/index.js:826`
  - predicate execution at `src/engine/index.js:827`
- once one C-event fires, the loop `break`s and restarts from priority 1 at `src/engine/index.js:897`

### Whether every B-event triggers a full C-event scan

Not always now, but often enough that it remains the primary hot path.

- every Phase B does enter Phase C
- without filtering, every pass would consider every C-event
- with filtering enabled, `shouldEvaluateCEvent()` can skip many C-events before predicate execution: `src/engine/index.js:823-824`

So the accurate answer is:

- every Phase B still triggers a Phase C cycle
- but not every C-event necessarily gets its predicate evaluated on every pass anymore

### Whether C-event scans repeat unnecessarily

Yes, some repetition is structurally unavoidable and some is implementation-driven.

Unavoidable repetition:

- the three-phase restart rule requires restarting from highest priority after every C-event firing

Implementation-driven repetition:

- `makeHelpers(...)` is recreated every pass: `src/engine/index.js:818`
- queue presence checks still call helper methods that rebuild filtered/sorted waiting lists
- skipped lower-priority C-events are logged after every firing: `src/engine/index.js:881-896`

The benchmark evidence in `docs/performance-envelope.md:131-162` strongly supports that repeated Phase C work is still the dominant cost center.

## Queue Length Check Efficiency

### Current implementation

Queue length and waiting selection are mostly array-scan operations:

- `resolveQueueValue()` in `src/engine/conditions.js:105-131`
- `queueHasWaiting()` in `src/engine/index.js:75-83`
- `waitingOf()` / `waitingInQueue()` in `src/engine/entities.js:294-312`
- `noteQueueDepth()` recomputes current queue depth with `entities.filter(...)` in `src/engine/index.js:388-395`

### Complexity

Let `N` be total entity count and `Qn` waiting entities in a target queue/type.

- queue-length lookup by filter is `O(N)`
- waiting list construction is `O(N)`
- queue discipline sorting is `O(Qn log Qn)`

So a condition like `queue(X).length > 0` is not a cheap indexed lookup. It can degrade toward `O(N)` or `O(N + Qn log Qn)` depending on the helper path used.

## ASSIGN / RELEASE Efficiency

### `ASSIGN`

`ASSIGN` is implemented in `src/engine/macros.js:324-388`.

Key costs:

- queue configuration lookup: `helpers.findQueueConfig(...)`
- candidate waiting list build: `listWaiting(...)` at `src/engine/macros.js:341`
- idle server list build: `helpers.idleOf(...)` at `src/engine/macros.js:342`

Under the hood:

- `listWaiting()` filters the full entity array and sorts the result: `src/engine/entities.js:131-142`
- `idleOf()` filters the full entity array and sorts resources: `src/engine/entities.js:314-321`

Approximate complexity:

- candidate customer selection: `O(N + Qn log Qn)`
- idle server selection: `O(N + Sn log Sn)`

where `Sn` is the number of idle servers of the requested type.

### `RELEASE`

`RELEASE` is implemented in `src/engine/macros.js:454-492`.

Key costs:

- multiple `entities.find(...)` lookups to resolve customer/server context: `src/engine/macros.js:463-469`
- queue depth recomputation on requeue via `noteQueueDepth(...)`

Approximate complexity:

- each `find(...)` is `O(N)`
- queue depth update is `O(N)`

### Whether `ASSIGN` / `RELEASE` causes repeated scans

Yes.

In the current design they can trigger:

- entity-array scans to find candidates or owners
- queue-depth rescans
- then a new Phase C pass that may rescan conditions again

So the cost is not just the macro body itself. It also amplifies the subsequent Phase C work.

## Large Queue Operations

Large queues can cause `O(n)` and `O(n log n)` work repeatedly.

Evidence:

- `waitingOf`, `waitingInQueue`, `listWaiting`, and `selectWaiting` all derive queue state from full-array filtering and sorting: `src/engine/entities.js:107-142`, `src/engine/entities.js:283-312`
- `noteQueueDepth()` rescans entities to count current depth: `src/engine/index.js:388-395`
- `ARRIVE` capacity and balk checks compute queue depth with `entities.filter(...)`: `src/engine/macros.js:225-227` and `src/engine/macros.js:276-278`

This means a large queue can hurt performance in several places:

- condition evaluation
- ARRIVE capacity checks
- ASSIGN candidate selection
- metric maintenance

## Priority Queue Efficiency

Priority queues are correct but not especially efficient.

Evidence:

- queue discipline comparators are defined in `src/engine/entities.js:49-105`
- sorted waiting lists are materialised with `[...waiting].sort(...)` in `src/engine/entities.js:107-109`

Complexity:

- FIFO/LIFO/PRIORITY/SPT/EDD all currently rely on sorting a fresh array view
- that is `O(Qn log Qn)` per selection/listing rather than `O(1)` or `O(log Qn)` incremental maintenance

So priority queues are not implemented as heap-backed or tree-backed priority queues. They are sort-on-read.

## Condition Parsing / Evaluation Caching

### What is cached well

JSON predicate compilation is cached on predicate objects.

Evidence:

- `compilePredicate()` stores compiled closures on the predicate object via a symbol: `src/engine/conditions.js:294-339`
- engine build precompiles C-event conditions once into `_compiledCondition`: `src/engine/index.js:453-460`
- dependency extraction is also cached: `src/engine/conditions.js:231-291`

That is a real efficiency win and a low-risk design.

### What is still repeated

Legacy string conditions are more expensive.

Evidence:

- `migrateLegacyCondition()` reparses strings through `parseConditionString(...)`: `src/model/conditionFormat.js:142-146`
- `compilePredicate(predicate)` only caches on object predicates, not on string primitives: `src/engine/conditions.js:294-339`

Inference from sources:

- if a condition remains stored as a legacy string, each `evaluatePredicate(string, ...)` call can reparse and recompile it
- if the condition is already a predicate object, repeated reparsing is avoided

This matters for:

- legacy C-event conditions that were not normalised before engine build
- routing branch predicates
- `cSchedule.when` predicates

## Whether Route Predicates Are Re-Parsed Repeatedly

Potentially yes for legacy-string routes; much less so for object-form predicates.

Evidence:

- conditional routing evaluates each branch at runtime in `src/engine/phases.js:197-217`
- `cSchedule.when` evaluates with `evaluatePredicate(...)` in `src/engine/phases.js:323-340`
- `evaluatePredicate(...)` calls `compilePredicate(...)` on demand: `src/engine/conditions.js:226-229`

Interpretation:

- object-form route predicates benefit from symbol-based compile caching
- string-form route predicates likely incur repeated parse/compile work because strings cannot hold the cached symbol metadata

So the answer is not a simple yes/no:

- canonical predicate objects: mostly cached
- legacy strings: likely re-parsed repeatedly

## Hotspots

### Measured hotspot

Phase C evaluation pressure is the most clearly benchmarked hotspot.

- `docs/performance-envelope.md:131-162`
- `tests/engine/perf_timing.js:156-233`

### Code-level hotspots

1. Full-array queue and server scans
   - `src/engine/entities.js:283-321`
   - `src/engine/index.js:388-395`
   - `src/engine/macros.js:225-227`
   - `src/engine/macros.js:276-278`

2. Repeated full or near-full Phase C passes
   - `src/engine/index.js:814-904`

3. FEL maintenance by repeated array filtering and sorting
   - `src/engine/index.js:655-687`
   - `src/engine/index.js:795-797`
   - `src/engine/index.js:856-857`

4. Sort-on-read priority handling
   - `src/engine/entities.js:107-142`

5. Legacy predicate migration/evaluation paths
   - `src/model/conditionFormat.js:142-146`
   - `src/engine/conditions.js:294-339`

## Likely Causes Of Slow Runs

1. Many C-events competing for evaluation, especially when most are false most of the time.
2. Restart-rule amplification, where one firing causes the scan to begin again from priority 1.
3. Queue and server state derived from repeated scans over a shared `entities` array.
4. Full-array FEL filtering plus repeated sort calls after event insertion.
5. Sort-on-read discipline handling for waiting lists.
6. Legacy string predicate migration on hot paths that were not normalised to object form.

## Complexity Summary

This section is approximate but grounded in the current implementation.

### One Phase A/B/C step

Let:

- `F` = FEL length
- `N` = total entities
- `C` = number of C-events
- `Qn` = waiting entities in a selected queue/type
- `P` = number of Phase C passes in the current step

Then one step trends toward:

- Phase A due-event discovery/removal: `O(F)`
- Phase B macro work plus FEL maintenance: at least `O(F)` and often `O((F + K) log(F + K))`
- Phase C scanning:
  - without useful filtering: `O(P * C * predicateCost)`
  - with queue/resource helper calls, predicate cost often includes `O(N)` or `O(N + Qn log Qn)`

In the worst practical shape, the dominant term becomes:

- `O(P * C * (N + Qn log Qn))`

That matches the benchmark story: C-heavy runs degrade first.

## Low-Risk Optimisations

These should preserve existing architecture and semantics with the least disruption.

1. Normalize legacy condition strings to predicate objects before hot execution paths.
   - Benefit: avoids repeated string parsing for routing and `when` predicates.

2. Reuse or memoise queue length / waiting existence checks within a single step more aggressively.
   - The current `queueWaitingCache` in `shouldEvaluateCEvent()` is a good start.

3. Avoid rebuilding sorted waiting arrays when only emptiness or first element is needed.
   - Today many helpers build full sorted arrays even when the caller needs only one candidate or a boolean.

4. Reduce repeated `entities.find(...)` lookups for current customer/server context within a macro execution.

5. Keep expanding benchmark scenarios that distinguish:
   - many false C-events
   - many active C-events
   - large queues
   - many scheduled B-events at the same timestamp

## Higher-Risk Architectural Optimisations

These could produce larger wins, but they carry more correctness risk.

1. Replace sort-on-read waiting selection with maintained per-queue structures.
   - FIFO queue deque
   - heap/tree for priority disciplines

2. Replace the FEL array + full sort pattern with a priority queue/min-heap.
   - due-event extraction becomes cheaper
   - insertion avoids repeated full-array sort

3. Maintain indexed entity views instead of deriving everything from the flat `entities` array.
   - per-queue waiting sets
   - per-resource idle/busy sets
   - id-to-entity map

4. Precompile or normalise routing and `cSchedule.when` predicates at model-load time.

5. Consider optional specialised fast paths for common simple conditions like:
   - `queue(X).length > 0`
   - `idle(Server).count > 0`

These higher-risk changes would need careful parity testing because they touch the core semantics of queue ordering, restart behaviour, and event ordering.

## Benchmark Scenarios To Prove Improvements

The repo already has a solid starting set. To prove further improvements, add scenarios that isolate one cost at a time.

### 1. Queue-depth scaling benchmark

Goal:

- prove how `ASSIGN` and queue-length checks behave as queue size grows

Suggested sweep:

- same model, queue depth targets of `10`, `100`, `1,000`, `10,000`

Measure:

- wall time
- `events_processed`
- `c_event_scans`
- served/sec

### 2. Legacy-string vs predicate-object benchmark

Goal:

- prove the cost of repeated condition migration/parsing

Suggested pair:

- same C-heavy model
- one stored with legacy string conditions
- one stored with canonical predicate objects

### 3. FEL pressure benchmark

Goal:

- isolate repeated sort cost

Suggested shape:

- one B-event that self-schedules frequently
- one model with many same-time due events

Measure:

- wall time versus average/max FEL size

### 4. Large-priority-queue benchmark

Goal:

- quantify sort-on-read discipline cost

Suggested shape:

- one queue with `PRIORITY`
- increasing waiting-population sizes
- repeated `ASSIGN`

### 5. ASSIGN/RELEASE churn benchmark

Goal:

- measure repeated scans under busy multi-stage routing

Suggested shape:

- multiple queues sharing a resource pool
- heavy `ASSIGN` then `RELEASE` back into another queue

## Recommended Next Investigation Steps

1. Add a benchmark that compares canonical predicate-object models against legacy string models in the same C-heavy scenarios.
2. Add one queue-depth-scaling benchmark to prove whether queue selection cost is currently linear or worse in practice.
3. Add FEL-size instrumentation to the timing harness so FEL-maintenance cost can be separated from predicate cost.
4. Review whether `waitingOf()` / `waitingInQueue()` callers can be split into:
   - needs boolean only
   - needs first candidate only
   - needs full sorted list

## Tests Run

No tests were run for this task because the prompt requested a review note rather than an implementation change.
