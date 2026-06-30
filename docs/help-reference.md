# simmodlr Help Reference

**Purpose:** System context for Help Assistant LLM responses  
**Audience:** LLM consuming as prompt context (machine-readable)  
**Maintenance:** Updated at end of each sprint alongside core documents  
**Last updated:** 2026-06-20

---

## Core Concepts

### Three-Phase Method

simmodlr implements Pidd's Three-Phase discrete-event simulation algorithm.

| Phase | Trigger | Behaviour |
|-------|---------|-----------|
| A | FEL not empty | Clock advances to next event time |
| B | Events at T_now | All B-events scheduled for current time fire in FEL order |
| C | After Phase B | C-events tested repeatedly until none can fire; restart from top when any C-event fires |

**Key rule:** Phase C restarts from the beginning whenever a C-event fires. This ensures priority ordering is respected.

### Entity Types

Two roles. Defined in `entityTypes[]` array.

| Role | Purpose | Count field | Arrival mechanism |
|------|---------|-------------|-------------------|
| customer | Flows through system; arrives, waits, receives service, departs | Always 0 | ARRIVE macro creates instances |
| server | Provides service capacity; customers compete for server units | Integer ≥ 1 | Present at simulation start |

**Schedule patterns (Sprint 86):** Server entity types can optionally define a `schedulePattern` object with `type: "weekly"` and a 24×7 capacity grid (`grid: [[day][hour]]`). An associated shift schedule (`shiftScheduleId`) defines rostered staff availability. The grid is a 7×24 array of integers. The engine tracks per-shift utilisation and schedule adherence for weekly-pattern servers.

**Attributes:** Customer entities carry named numeric attributes (priority, dueDate, etc.) set at arrival or updated mid-simulation via SET_ATTR.

### Queues

Buffers where customer entities wait for service. Defined in `queues[]` array.

| Field | Purpose |
|-------|---------|
| name | Unique identifier; referenced in macros |
| discipline | Selection rule for next entity to serve |
| capacity | Maximum waiting entities (null = unlimited) |
| customerType | Entity type name expected in this queue |
| overflowDestination | Queue for blocked/balked entities; recursively re-checked at the destination, so overflow chains (A→B→C) are followed at runtime |
| balkProbability | Probability (0-1) an entity declines to join, checked on every join attempt — ARRIVE, RELEASE, routing, batch/split, preemption (V21) |
| balkCondition | Predicate object `{variable, operator, value}` checked on every join attempt, same scope as balkProbability |
| renegeDist / renegeDistParams | Distribution sampled to auto-schedule a patience timer the moment an entity joins — no RENEGE(ctx) B-event needs to be authored |

### B-Events (Bound Events)

Time-scheduled events. Fire at specific simulation clock times. Defined in `bEvents[]` array.

**Purpose:** Arrivals, service completions, scheduled failures, repairs.

**Key fields:**
- `scheduledTime`: Initial fire time (0 for arrivals, 9999 for completions)
- `effect[]`: Array of macro call strings
- `schedules[]`: Re-scheduling rules with distribution

### C-Events (Conditional Events)

State-triggered events. Fire when condition becomes true. Defined in `cEvents[]` array.

**Purpose:** Resource allocation decisions ("if queue non-empty AND server idle → start service").

**Key fields:**
- `condition`: String expression testing queue lengths and server states
- `effect[]`: Array of macro call strings
- `priority`: Integer; lower fires first
- `cSchedules[]`: Service duration distributions

**Condition syntax limitation — variable-vs-literal only:** Each clause (`queue(...).length > 0`, `idle(...).count == 0`, `stateVarName == 1`, etc.) compares one dynamic token against a literal constant. The right-hand side is captured as a fixed literal when the model loads — it is never re-resolved as another queue length, server count, or state variable. A clause like `queue(TraumaQueue).length > traumaInService` parses the right side as a non-numeric literal and silently evaluates to `false` forever (no error, no warning — the C-event just never fires). To gate on a dynamic threshold, compare each side against its own literal in a separate `AND` clause instead of comparing two dynamic tokens to each other, e.g. `queue(TraumaQueue).length > 0 AND traumaInService == 0`.

**Starvation anti-pattern:** When two C-events share a resource and one has a lower priority number (higher urgency), the other may never fire if the first queue is always populated. Symptom: entities accumulate in mid-journey queues; `served=0` or very low for some replications. Diagnosis: check whether any terminal C-event (discharge, exit) has a higher priority number than an entry C-event on the same resource. Fix: set the terminal C-event priority to 0 (highest) so completions are not deferred indefinitely.

**Cross-referencing C-Events and B-Events:** Each `cSchedules[]` entry in the C-Events editor shows a plain-language summary of what its linked B-event actually does (e.g. "Releases Nurse · routes 80% → Discharge Queue, 20% → Transfer Queue", "Entity exits simulation", or — for macros without a friendly phrase yet — the raw macro call as a fallback, so nothing is ever hidden). Clicking the B-event's name jumps straight to it in the B-Events tab. Conversely, if a B-event is referenced by any C-event's `cSchedules`, the B-Events editor shows a "Scheduled by" link back to that C-event. This is presentation only — it does not change the underlying `bEvents[]`/`cEvents[]` data.

### State Variables

Model-level numeric counters. Defined in `stateVariables[]` array.

**Purpose:** Track cumulative counts, implement flags, accumulate custom metrics.

**Access:** Read in conditions as plain names; write via SET(varName, expr) macro.

### Containers

Level-based resource pools. Defined in `containerTypes[]` array.

**Purpose:** Model inventory, blood bank stocks, fuel tanks, warehouse buffers.

**Operations:** FILL adds quantity (clamped to capacity); DRAIN removes quantity (only fires when sufficient level exists).

### Goals

Performance targets. Defined in `goals[]` array.

**Purpose:** Drive AI suggestion prioritisation, colour sweep charts (green=feasible, red=infeasible), display pass/fail on KPI cards.

**Fields:** metric, operator, target, label.

---

## Macros

All 20 effect macros. Syntax is exact — case-sensitive, parentheses required.

### Flow Control Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| ARRIVE | `ARRIVE(EntityType)` or `ARRIVE(EntityType, QueueName)` | Creates entity instance, places in queue | Increments queue depth; schedules reneging if configured | Omitting QueueName when entity type name ≠ queue name |
| COMPLETE | `COMPLETE()` | Marks context entity as served, releases server | Increments served count; records sojourn time | Using without preceding RELEASE |
| RELEASE | `RELEASE(ServerType)` or `RELEASE(ServerType, QueueName)` | Frees server unit, routes entity onward | Sets server to idle; updates service stats | Combining with routing table (mutually exclusive) |
| ASSIGN | `ASSIGN(QueueName, ServerType)` | Seizes server, starts serving front entity from queue | Sets server to busy; sets entity to inService | Using in B-event (C-event only) |
| RENEGE | `RENEGE(ctx)` | Removes context entity from queue (abandonment) | Increments reneged count | Using entity type name instead of ctx |
| RENEGE_OLDEST | `RENEGE_OLDEST(EntityType)` | Removes oldest entity of specified type from queue | Increments reneged count; used for max-queue policies | Confusing with RENEGE(ctx) |

### Resource Management Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| PREEMPT | `PREEMPT(ServerType)` | Interrupts in-service entity, replaces with higher-priority entity | Displaced entity re-queues with remaining service preserved | Using without priority queue discipline |
| FAIL | `FAIL(ServerType)` | Places server into failed (unavailable) state; interrupts any in-progress service | Sets server to failed; in-progress entity re-queues with remaining service time | For pool scope, all servers fail at once; prefer unit scope for realistic modelling |
| REPAIR | `REPAIR(ServerType)` | Restores failed server to idle | Sets server to idle; triggers C-scan | Repairing non-failed server (no effect) |

### Resource-Free Activity Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| DELAY | `DELAY(QueueName)` | Removes the next entity from a queue and marks it serving — without claiming any server | Duration is set by the firing C-event's `cSchedules` entry, not by a server; pairs with a completion B-event for routing | Completion B-event has only an `ARRIVE` effect — `ARRIVE` always creates a new entity and never resolves the delayed one, leaving it stuck in "serving" forever (V47). Add `COMPLETE()`, `RELEASE()`, or routing to the completion B-event |

### Entity Transformation Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| SPLIT | `SPLIT(EntityType, N, QueueName)` | Creates N-1 clones of context entity | N-1 new entities added to entity pool | Omitting QueueName |
| BATCH | `BATCH(QueueName, N)` or `BATCH(QueueName, Entity.attrName)` | Collects N entities into single batch entity | N-1 originals marked done; one batch replaces them | Using N < 2 |
| UNBATCH | `UNBATCH(QueueName)` | Splits batch entity back into constituents | Batch marked done; original entities restored | Using on non-batch entity |
| MATCH | `MATCH(TypeA, QueueA, TypeB, QueueB, QueueName)` | Pairs one entity from each queue into combined batch | Originals marked with _matchedInto; merged attrs = `{...A.attrs, ...B.attrs}` — QueueB overwrites QueueA on name collision | Queues must both have eligible entities; relying on attribute overwrite order without naming attrs distinctly |
| COSEIZE | `COSEIZE(QueueName, ServerType1, ServerType2, ...)` | Atomically seizes entity and multiple server types | All servers set to busy; fails cleanly if any unavailable | Partial seizure never occurs |

### State Manipulation Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| SET | `SET(varName, expr)` | Sets state variable to arithmetic expression result | Mutates state[varName] | Using undefined variable name |
| SET_ATTR | `SET_ATTR(attrName, expr)` | Sets context entity attribute to expression result | Mutates entity.attrs[attrName] | Attribute must exist on entity type |
| COST | `COST(expr)` | Adds expression result to cumulative cost total | Increments summary.totalCost and entity.__cost | Forgetting to set performance goal for cost |

### Container Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| FILL | `FILL(containerId, expr)` | Adds quantity to container | Updates container level, clamped to capacity | containerId must match declared container id |
| DRAIN | `DRAIN(containerId, expr)` | Removes quantity from container | Updates container level, clamped to zero | No-op if level < amount (does not go negative) |

**Safe expression evaluator:** All expr fields support numeric literals, +, -, *, /, parentheses, Entity.attrName, stateVarName, clock, and functions min(a,b), max(a,b), abs(a), round(a), floor(a), ceil(a). No eval() or new Function() used.

### Server Failure Model (MTBF/MTTR)

Server entity types can be configured with random failures using `mtbfDist` and `mttrDist` on the entity type definition. The engine automatically schedules failure and repair events.

**Fields:**

| Field | Description | Values |
|-------|-------------|--------|
| `mtbfDist` | Mean Time Between Failures distribution | Any distribution type (e.g. `Exponential`) |
| `mtbfDistParams` | MTBF distribution parameters | Distribution-specific (e.g. `{mean: "120"}`) |
| `mttrDist` | Mean Time To Repair distribution | Any distribution type |
| `mttrDistParams` | MTTR distribution parameters | Distribution-specific |
| `failureScope` | How failures apply across the pool | `"unit"` (default) — each server fails independently; `"pool"` — one outage affects all servers |

**Best practices:**
- Use `"unit"` scope for realistic individual server unreliability
- Use `"pool"` scope only for shared-infrastructure failures (power outage, network failure)
- MTBF should be much larger than MTTR (typical ratios: 10:1 or higher)
- The engine handles warm-up correctly — failures before warm-up don't inflate post-warmup downtime statistics

---

## Distributions

All 12 distribution types. Parameter values must be strings (e.g., "5" not 5).

### Parametric Distributions

| Distribution | Parameters | Constraints | Typical Use |
|-------------|------------|-------------|-------------|
| Fixed | `{ value: "N" }` | value is numeric | Deterministic duration; removes variability |
| Exponential | `{ mean: "N" }` | mean > 0 | Memoryless inter-arrival and service times (M/M/c) |
| Uniform | `{ min: "N", max: "N" }` | max > min | Service times with known bounds, no preference |
| Normal | `{ mean: "N", stddev: "N" }` | stddev > 0 | Bell-shaped empirical data; negative samples clamped to 0 |
| Triangular | `{ min: "N", mode: "N", max: "N" }` | min ≤ mode ≤ max | Three-point estimates when data scarce |
| Erlang | `{ k: "N", mean: "N" }` | k integer ≥ 1, mean > 0 | Sum of k exponential phases; more regular than Exponential |
| Lognormal | `{ logMean: "N", logStdDev: "N" }` | logStdDev > 0 | Right-skewed durations with a long tail (repair times, complex tasks); naturally non-negative, no clamping needed. Mean = exp(logMean + logStdDev²/2) |

### Time-Varying Distributions

| Distribution | Parameters | Constraints | Typical Use |
|-------------|------------|-------------|-------------|
| Piecewise | `{ periods: [{ startTime, dist, distParams }, ...] }` | First period at time 0; sorted ascending | Arrival rates changing at breakpoints |
| Schedule | `{ times: [N, N, ...] }` or `{ rows: [{ time, attrs }, ...] }` | Times ascending; exhausts and stops | Planned arrivals from timetable or CSV import |

### From-Data Distributions

| Distribution | Parameters | Constraints | Typical Use |
|-------------|------------|-------------|-------------|
| Empirical | `{ values: [N, N, ...] }` | Non-empty array | Sample-driven; draws uniformly from provided values |
| EntityAttr | `{ attr: "attrName" }` | Attribute must exist on entity | Duration from entity attribute (e.g., imported plan) |
| ServerAttr | `{ attr: "attrName" }` | Attribute must exist on server | Duration from assigned server attribute |

---

## Queue Disciplines

All 6 queue disciplines.

| Discipline | Selection Rule | Tiebreaker | Requirements |
|-----------|---------------|------------|--------------|
| FIFO | Smallest arrivalTime | None | Default |
| LIFO | Largest arrivalTime | None | None |
| PRIORITY | Smallest Entity.priority attribute value | FIFO on equal priority | Entity type must have numeric `priority` attribute |
| PRIORITY(attrName) | Smallest value of the named attribute | FIFO on equal value | Entity type must have the named numeric attribute |
| SPT | Smallest `serviceTime` or `processingTime` attribute value | FIFO | Entity type must have `serviceTime` or `processingTime` attribute |
| EDD | Smallest `dueDate` attribute value | FIFO | Entity type must have numeric `dueDate` attribute |

---

## Experiment Controls

### Warmup Period

**Purpose:** Exclude initial transient phase from statistics.

**Behaviour:** At warmup boundary, statistical accumulators reset (_wipIntegral, per-entity wait/service accumulation). FEL events pruned at warmup boundary.

**Detection:** Welch's method automatically detects warmup from cumulative mean chart stabilisation point. (This is Welch's *graphical warm-up detection* method only — scenario-comparison confidence intervals use a separate, standard equal-variance paired t-test, not a Welch unequal-variance correction.)

### Replications

**Purpose:** Statistical confidence via independent runs with different seeds.

**Behaviour:** Each replication uses seed = baseSeed + replicationIndex. Results aggregated with 95% confidence intervals (batch means method).

**When to use:** Always for decision-support; single runs have high variance.

### Termination Modes

| Mode | Field | Behaviour |
|------|-------|-----------|
| time-based | `maxSimTime` | Run ends when clock ≥ maxSimTime |
| condition-based | `terminationCondition` | Run ends when condition evaluates true at Phase A start |

### Seed

**Purpose:** Reproducibility — replaying a run with the same seed produces bit-identical results.

**Behaviour:** Integer seed set in the Execute panel before running. Stored with the run record so any past run can be exactly reproduced.

### PRNG Stream Isolation (Sprint 84)

**Purpose:** Ensure adding or removing a process does not disturb the random streams of other processes.

**Behaviour:** Each generator process (arrival B-event, service C-event, shift schedule) gets an independent PRNG stream derived from `baseSeed + replicationIndex` via `deriveSubSeed(seed, processIndex)`. Modifying one process (e.g., adding a new arrival source) leaves all other streams unchanged — results remain reproducible and statistically comparable across model edits.

### Weekly Schedule Pattern (Sprint 86)

**Purpose:** Define a repeating weekly capacity plan for a server entity type.

**Fields on `entityType`:**
- `schedulePattern.type`: Must be `"weekly"` to enable.
- `schedulePattern.grid`: 7×24 array of integers (7 days × 24 hours). `0` = server unavailable; positive integer = planned capacity for that hour.
- `shiftScheduleId`: UUID referencing a schedule row in `model_schedules` that defines rostered staff time windows with integer capacities.
- `startOfWeekDay`: Derives from the model's epoch — the epoch's day-of-week determines which Monday is the first day of the grid.

**Per-shift utilisation:** Each service event is tagged with the shift label active at the time the server was seized (tag-on-seize). Results include `perShiftUtil[]` with one entry per encountered shift: `shiftLabel`, `utilPct`, `entitiesPerCap`, `totalUtilTime`, `shiftDuration`.

**Schedule adherence:** `actualUtilisation / expectedUtilisation`. Expected utilisation is `totalExpectedBusyTime / (shiftDuration × capacity)` from the grid. Displayed as a colour-coded badge: green ≤ 10 % gap, amber ≤ 25 %, red > 25 %.

**Validation:** Seven rules (V50–V56) guard pattern integrity — see the Warning-Level Rules table.

### Multiplier Mode (Sprint 87)

**Purpose:** Decouple schedule shape from staffing level for parametric sweeps.

**Fields on `schedulePattern`:**
- `mode`: `"absolute"` (default) or `"multiplier"`.
- `baseCapacity`: Required in multiplier mode. The base staffing level (integer or `{{var}}` sweep reference).
- `periods[].capacity`: In multiplier mode, a number 0.0–1.0 representing the fraction of base capacity.

**Resolution:** `actualCapacity = Math.round(baseCapacity × multiplier)`. The engine resolves multipliers to absolute capacities before expansion.

**Example:**
```json
{
  "type": "weekly",
  "mode": "multiplier",
  "baseCapacity": 6,
  "periods": [
    { "dayOfWeek": 1, "start": "07:00", "end": "19:00", "capacity": 1.0 },
    { "dayOfWeek": 1, "start": "19:00", "end": "07:00", "capacity": 0.67 }
  ]
}
```
This gives 6 staff day shift, 4 staff night shift (6 × 0.67 = 4.02 → 4).

**Validation:** V57–V60 guard multiplier mode — baseCapacity must be positive, capacities must be 0.0–1.0.

### Purge Period

**Purpose:** Remove entities that have exceeded a maximum dwell age in a queue.

**Behaviour:** Configured as a B-event with a fixed or periodic interval. At each purge event, entities older than the configured threshold are removed from the target queue. Unlike reneging (entity-driven, patience-timer per entity), purge is a global sweep fired on a timer — useful for batch/job queues with SLA deadlines where wholesale queue clearing is required.

### Shift-change Behavior (Sprint 84)

**Purpose:** Controls what happens when a shift boundary fires while a server is mid-service.

| Mode | Behaviour |
|------|-----------|
| Delay | Server finishes current service before applying the shift change |
| Preempt | Service interrupted immediately; entity re-queues with remaining service time preserved |
| Suspend | Service paused at shift boundary; resumes automatically when the next shift starts |

### Parametric Sweep

**1D sweep:** One parameter varied across range. Full replication batch at each point.

**2D sweep:** Two parameters varied across a grid (capped at 50 points). Heatmap rendering with feasibility colouring (green = all goals met, red = at least one goal violated).

---

## Results and KPIs

### Summary Metrics

| Metric | Meaning | Interpret High | Interpret Low |
|--------|---------|----------------|---------------|
| avgWait | Mean waiting time across all queues (post-warmup) | Congestion, insufficient capacity | Adequate capacity or low utilisation |
| avgSvc | Mean service time | Complex service or slow servers | Fast service or simple tasks |
| avgSojourn | Mean end-to-end time (wait + service, served + reneged only) | System-wide delays | Efficient flow |
| avgTimeInSystem | Weighted mean time in system (all entities, incl. in-progress at 0.5 weight) | System-wide delays including unfinished work | Efficient flow |
| servedRatio | Service completion rate (served / total, 0–1) | Most entities complete service | Many entities still in system or reneging |
| served | Count of entities completing service | High throughput | Low throughput or insufficient run time |
| reneged | Count of entities abandoning before service | Impatience or excessive waits | Patient customers or fast service |
| totalCost | Cumulative cost from COST macro | High operational cost | Low cost (may indicate under-investment) |
| costPerServed | totalCost / served | High cost per unit served | Efficient cost utilisation |
| avgWIP | Time-average work-in-progress (Little's Law integral) | High inventory or queue buildup | Lean operation |

### Confidence Intervals

**Meaning:** 95% CI = range containing true population mean with 95% confidence.

**Interpretation:**
- Narrow CI relative to point estimate → reliable conclusion
- Wide CI (>20% of mean) → more replications needed
- CI overlap between scenarios → difference not statistically significant

**When to act:** Only when CI width < 10% of mean for primary KPI.

### Per-Queue Metrics

| Metric | Meaning |
|--------|---------|
| mean | Average wait time |
| max | Maximum observed wait |
| p50 | Median wait (50th percentile) |
| p90 | 90% of entities wait ≤ this value |
| p95 | 95% of entities wait ≤ this value |
| p99 | 99% of entities wait ≤ this value (tail behaviour) |

### Per-Resource Metrics

| Metric | Meaning | Interpretation |
|--------|---------|----------------|
| utilisation | Fraction of time servers busy | >85% indicates congestion risk; <50% indicates over-capacity |
| busyCount | Number of service start events | Throughput indicator |
| idleCount | Number of idle periods | Under-utilisation indicator |
| starvationTime | Cumulative time server was starved (idle despite entities waiting in a downstream-fed queue) | Zero = fully fed; non-zero = scheduling gap or upstream bottleneck |
| starvationPct | Fraction of post-warmup time server was starved | High value indicates upstream supply problem, not a capacity problem |
| perShiftUtil[] | Per-shift utilisation breakdown for weekly-pattern servers | Array of `{ shiftLabel, utilPct, entitiesPerCap, totalUtilTime, shiftDuration }` — only present for server types with `schedulePattern.type === 'weekly'` |
| scheduleAdherence | Ratio of actual utilisation to expected schedule utilisation (0–1+) for weekly-pattern servers | < 1.0 = actual below plan; > 1.0 = actual exceeds plan. Displayed as colour-coded badge: green ≤ 10 % deviation from 1.0, amber ≤ 25 %, red > 25 %. |

---

## Validation Rules

### Error-Level Rules (Run Prevented)

| Code | Rule | Fix |
|------|------|-----|
| V1 | Entity type names must be unique and non-empty | Rename or remove duplicates |
| V2 | Attribute names must be unique within entity type | Rename conflicting attributes |
| V3 | defaultValue must match declared valueType | Correct type mismatch |
| V4 | PRIORITY discipline requires numeric priority attribute | Add priority attribute to entity type |
| V5 | Distribution parameters out of bounds | Check parameter constraints (§4) |
| V6 | schedules[].eventId or cSchedules[].eventId references non-existent B-event | Create missing B-event or correct ID |
| V8 | No ARRIVE source AND no COMPLETE/RENEGE sink | Add at least one arrival and one departure |
| V9 | C-event condition references undefined queue | Create queue or correct name |
| V10 | Attribute name starts with Resource or Queue | Rename attribute (reserved namespace) |
| V12 | Piecewise distribution has no periods, a non-numeric/non-zero start time, or a nested piecewise period | Add at least one period starting at time 0; don't nest piecewise inside piecewise |
| V13 | Piecewise periods are not sorted by start time | Sort periods ascending by startTime |
| V14 | Server shift schedule has non-numeric/non-zero-start times, isn't sorted ascending, or has a non-positive-integer capacity | Fix shift schedule times and capacities |
| V17 | routing table and RELEASE target both specified, or a routing entry/defaultQueueName references an unknown queue | Use one or the other, not both; correct queue names |
| V18 | Both routing and probabilisticRouting set, or RELEASE target + probabilisticRouting set, or probabilities don't sum to 1.0, or an entry references an unknown queue | Remove the conflicting field; adjust probabilities to sum to 1.0 (±0.001); correct queue names |
| V19 | Server count is not an integer ≥ 1 | Set count ≥ 1 |
| V20 | Queue capacity < 1 when specified, or overflowDestination references an unknown queue | Set capacity ≥ 1 or leave blank; correct overflow destination |
| V21 | balkProbability outside [0, 1] | Correct probability value |
| V22 | BATCH size < 2, or BATCH references an unknown queue | Set size ≥ 2; create queue or correct name |
| V23 | UNBATCH references an unknown queue | Create queue or correct name |
| V24 | loopConfig.maxLoopCount < 1, or loopConfig.exitQueueName references an unknown queue | Set maxLoopCount ≥ 1; correct exit queue name |
| V25 | RENEGE('TypeName') used instead of RENEGE(ctx) | Use exactly RENEGE(ctx) |
| V26 | Container has an empty/duplicate id, capacity ≤ 0, or initialLevel < 0 or > capacity | Set a valid unique id, positive capacity, and initialLevel within [0, capacity] |
| V27 | FILL/DRAIN references an undeclared container | Create container or correct id |
| V28 | Model epoch is not a valid ISO 8601 datetime | Correct the epoch format |
| V30 | B-event/C-event routes to exit (null queue) with no COMPLETE(), RENEGE(ctx), or RELEASE() effect | Add a terminal lifecycle effect so entities are counted as served |
| V31 | Event routes to exit but doesn't explicitly end the lifecycle | Add COMPLETE(), RENEGE(ctx), or RELEASE() |
| V32 | Event has multiple terminal lifecycle sinks | Choose one terminal action: COMPLETE() or RENEGE(ctx) |
| V34 | Replication count is not a whole number ≥ 1 | Set replication count to an integer ≥ 1 |
| V35 | Warm-up time ≥ run duration | Shorten warm-up time below run duration |
| V36 | MTBF/MTTR set on a non-server entity type | Only server entity types may use MTBF/MTTR |
| V37 | MTBF or MTTR is missing its distribution or parameters | Provide both a distribution and parameters for MTBF and for MTTR |
| V39 | Event has both an ARRIVE effect and probabilisticRouting | Remove probabilisticRouting — ARRIVE routes via its own argument |
| V41 | SET_ATTR targets an immutable attribute | Target a mutable attribute instead |
| V45 | Queue is never used as a routing destination (disconnected fragment) | Wire the queue into routing, or remove it |
| V46 | Queue overflow chain cycles back on itself | Break the cycle — overflow chains must terminate at a queue without a cycle |
| V47 | DELAY references an unknown queue, or its completion B-event has only an ARRIVE effect (entity left stuck "serving" forever) | Correct the queue name; add COMPLETE(), RELEASE(), or routing to the completion B-event |
| V50 | Weekly schedule pattern requires a startOfWeek epoch | Set a `startOfWeek` epoch in Model Data (only the day-of-week matters) |
| V51 | Weekly schedule pattern has unscheduled hours with no active shift | Fill every 1-hour cell with a capacity ≥ 0, or add a shift schedule row covering the gap |
| V52 | Set/Capacity schedule reference targets a non-schedule resource | Ensure the referenced entity type is a server with a schedule pattern |
| V53 | Schedule pattern capacity exceeds shift capacity at [time] | Reduce grid capacity or increase shift capacity for the overlapping time window |
| V54 | Shift schedule rows overlap and are not merged | Use the **Merge overlapping shifts** button in the shift schedule editor |
| V55 | Per-shift utilisation chart is empty | Ensure at least one schedule-pattern cell has capacity > 0 and the run is long enough |
| V56 | Schedule adherence is N/A | Only computed for server types with `schedulePattern.type === 'weekly'` |
| V57 | Multiplier mode requires baseCapacity | Set baseCapacity to a positive number when using multiplier mode |
| V58 | Multiplier mode period capacity out of range | In multiplier mode, period capacity must be between 0.0 and 1.0 |
| V59 | Multiplier mode defaultCapacity out of range | In multiplier mode, defaultCapacity must be between 0.0 and 1.0 |
| V60 | Multiplier mode exception capacity out of range | In multiplier mode, exception period capacity must be between 0.0 and 1.0 |

Gaps in the numbering (e.g. no V7) are intentional — codes were retired or renumbered during development and are not reused.

### Warning-Level Rules (Run Proceeds)

| Code | Rule | Implication |
|------|------|-------------|
| V8 (one missing) | Only arrival OR only sink present | Model may not complete entity lifecycle |
| V11 | Normal distribution with mean < 2×stddev | Frequent negative sample clamping to 0 |
| V15 | Shift time after run duration | Shift change never fires |
| V16 | No simulation time limit or termination condition set | Model may run until the 5000-cycle limit if arrivals continue indefinitely |
| V29 | cSchedules all have when with no fallback | Entities matching no condition receive no service |
| V33 | probabilisticRouting used with a single 100% null exit | Prefer explicit COMPLETE() without routing |
| V38 | RELEASE() immediately followed by COMPLETE() | COMPLETE() will always be skipped |
| V38b | COMPLETE() immediately followed by RELEASE() | RELEASE() re-queues the completed entity, causing an infinite loop |
| V40 | SET_ATTR targets an attribute not declared on any entity class | Declare the attribute, or correct the name |
| V42 | SPT discipline but entity class has no serviceTime/processingTime attribute | Discipline falls back to FIFO |
| V43 | EDD discipline but entity class has no dueDate attribute | Discipline falls back to FIFO |
| V44 | SET_ATTR has no preceding ARRIVE/ASSIGN/COSEIZE | Write will be skipped at runtime |
| V47 | DELAY's cSchedule doesn't have "Pass entity context" enabled, or samples the delay from "Server attribute" | Falls back to a fixed delay of 1 |
| W-CAP-01 | Two or more C-events SEIZE/ASSIGN the same server type | Results may be sensitive to C-event priority ordering |
| W-CAP-02 | B-event schedule has an Exponential mean interval < 0.001 | simmodlr models discrete entities — consider SD Studio for continuous flow |

---

## Results Health Flags

Deterministic, rule-based flags computed from simulation results — no LLM involved. They power the
green/amber/red health indicator on the Results screen. Severity is `critical` or `warning`; flags
are listed worst-first.

### Post-Run Flags (computed once, after the run completes)

| Code | Condition | Severity | Suggestion |
|------|-----------|----------|------------|
| H1 | Resource utilisation ≥85%/≥90%/≥95% | warning / critical / critical | Add capacity or reduce arrival rate; ≥90% means the queue cannot recover without more capacity |
| H2 | A queue's late-run (last 20%) mean waiting count > 1.5× its early-run (first 20%) mean, and >2 | warning | Check upstream constraints — the queue is growing faster than it drains; the run may not be reaching steady state |
| H3 | ≥15%/≥20% of arrivals still in system (waiting or serving) at end of run | warning / critical | Identify and relieve capacity constraints; results may be unreliable with a large unfinished backlog |
| H4 | A capacity-limited queue blocked/overflowed ≥10% of arrivals (critical) or any amount (warning); or an unbounded queue peaked >50 waiting (warning) | warning / critical | Increase queue capacity or add an overflow route to handle peak demand |
| H5 | Resource starved (idle despite queued work) >20% of the time | warning | Check routing rules or entity-to-server assignment — servers are idle when work is available |
| H6 | Entities balked (declined to join a queue) — ≥10% of arrivals is critical, any amount is warning | warning / critical | Review the queue's balk probability/condition if this is unintended |
| H7 | Less than 50% of arrivals completed (with ≥10 arrivals) | critical | Reduce arrival rate or add capacity — the system is severely overwhelmed |
| H8 | Little's Law check shows >5% discrepancy between measured and theoretical wait | warning | Increase run duration — the run may be too short to reach steady state |
| H9 | A resource was continuously starved for longer than 2× the mean service time | warning | Check upstream delivery to this resource — work isn't reaching it, suggesting a routing or blocking issue |
| H10 | A resource sustained ≥90% utilisation for 15+ consecutive time units | warning | Add capacity or throttle arrivals — sustained high utilisation means the queue will not recover naturally |
| H11 | A resource was idle for an extended period (zombie asset) while arrivals were active | warning | Check entity routing and B-event destinations — the resource may be unreachable or blocked by an upstream queue |

### Live Flags (computed per-step, during execution)

Live flags mirror the post-run flags above but fire in real time, without the post-run statistical
context (no suggestion text is shown live).

| Code | Mirrors | Condition |
|------|---------|-----------|
| L1 | H1 | Resource utilisation ≥85%/≥90%/≥95% |
| L2 | H5 | Resource starved >20% of the time so far |
| L3 | H4 | Queue has rejected (blocked/overflowed) arrivals at capacity so far |
| L4 | H9 | Resource continuously starved beyond 2× mean service time |
| L5 | H10 | Resource sustained ≥90% utilisation for 15+ consecutive time units |
| L6 | H11 | Resource at 0% utilisation while arrivals are active |
| L7 | H6 | Entities have balked at a queue so far |

---

## Common Problems

### Queue Growing Without Bound

**Symptoms:** Queue depth increases continuously; utilisation >100%.

**Causes:**
- Arrival rate > service capacity (check λ vs μ)
- Insufficient server count
- C-event condition never true (check condition syntax)

**Fix:** Increase servers, reduce arrivals, or fix C-event condition.

### Wide Confidence Intervals

**Symptoms:** CI width >20% of mean; outlier replications flagged.

**Causes:**
- Too few replications
- High variability in model
- Warmup period too short (transient included)

**Fix:** Increase replications to 30-100; extend warmup period.

### RENEGE Not Firing

**Symptoms:** No entities reneging despite reneging schedule configured.

**Causes:**
- Using RENEGE(TypeName) instead of RENEGE(ctx) [V25]
- Manual schedules-based reneging missing isRenege: true flag
- Entity already served before reneging timeout
- Simpler fix: set `renegeDist`/`renegeDistParams` directly on the queue instead of hand-wiring a RENEGE(ctx) B-event — the engine auto-schedules the patience timer on every join, with no eventId wiring required

**Fix:** Use RENEGE(ctx); set isRenege: true on schedule entry.

### Phase C Truncated Warning

**Symptoms:** phaseCTruncated: true in results; warning banner visible.

**Causes:**
- Phase C pass cap (500) hit in engine cycle
- C-event firing repeatedly without state change
- Circular C-event dependencies

**Fix:** Review C-event priorities; ensure state changes break cycles.

### Warmup Too Short

**Symptoms:** Cumulative mean chart shows drift after warmup cutoff.

**Causes:**
- Welch detection found warmup but manual override too short
- System starts empty; initial transient long

**Fix:** Extend warmup to detected cutoff point or longer.

### Model Not Progressing

**Symptoms:** Clock stuck; no events firing.

**Causes:**
- FEL empty (no re-scheduling rules)
- C-event condition never satisfied
- All servers failed with no REPAIR scheduled (check failureScope — "pool" takes everything offline; "unit" affects one at a time)

**Fix:** Check schedules[] on B-events; verify C-event conditions; schedule repairs.

---

## Model Library

### Model Cards

Each model in the library displays a card showing name, description, visibility (public/private), health status, run count, owner, and last updated date.

**Version badge:** When a model has at least one saved version, the card shows a purple **V{n}** badge indicating the latest version number. The badge updates immediately after creating a version — no page refresh required.

**Health indicator:** Green = no issues, amber = warnings, red = validation errors.

### Creating a New Model

Open the New Model dialog from the **+ New Model** button. Enter a name and optional description, then choose a starting method:

| Option | Behaviour |
|--------|-----------|
| **Draw** | Opens the Visual designer with a starter flow pre-placed on the canvas |
| **Describe** | Opens the AI generator (the **Describe** button in the Design toolbar); the model name and description are passed as context to the AI |
| **Use a template** | Browse pre-built scenario templates |
| **Import a file** | Upload a `.json` model file |
| **Paste model** | Paste raw model JSON from clipboard |

**Tip:** The description you enter in the New Model dialog is used by the Describe panel as context. Write a sentence describing the system you want to model ("A two-stage manufacturing line with a shared inspector") to get better initial AI output.

### Model Versioning

Create named version snapshots of your model from the **Versions** tab (visible to model owners). Versions capture the full model JSON at a point in time and can be compared (Diff) or restored.

**Creating a version:** Click **+ Create version**, optionally name it and add notes. The version number is auto-assigned. Structural changes (entity types, queues, events) are detected and flagged automatically.

**Version badge:** The latest version number appears on the model card in the library immediately after creation.

### Access & Sharing

Each model has an **Access** tab (visible to owners) with a **Sharing** section controlling who can open it.

**Visibility:** A model is **🔒 Private** (default — only the owner, plus anyone explicitly granted access, can open it) or **🌐 Public** (read-only for everyone; any signed-in user can fork it into their own editable copy).

**Per-user access grants:** Owners can grant individual users `viewer` or `editor` on a private model via the `access` map, without making the whole model public.

**Copy link (`#model/<id>` deep link):** The Access tab has a **🔗 Copy link** button next to the Private/Public toggle. It copies a URL containing the model's ID as a hash fragment (`#model/<modelId>`). Opening that link:

- If the recipient already has access (owner, granted viewer/editor, or the model is public) and is signed in, it opens the model directly — full editor if they can edit, read-only with a fork prompt if it's a public model they don't own.
- If the recipient is signed out, the target model ID is held (via `sessionStorage`) through sign-in/sign-up and resolved immediately afterwards.
- If the model does not exist, was deleted, or the recipient has no access, the link silently falls through to the recipient's normal Model Library — no error is shown.

This is purely a client-side routing shortcut into the same `fetchModels()` query and Supabase RLS policies that already gate the Model Library — it does not create a new token, table, or anonymous-access mode. It is unrelated to the separate run-level share-link feature (Run History → **Share**), which creates a `share_links` row for anonymous, read-only viewing of one simulation run's results dashboard — that feature requires no login and works even for users with no model access at all.

If a private model has no collaborators and isn't public yet, the Access tab shows a hint that the link won't open it for anyone else until the model is made public or a collaborator is added.

---

## Authoring Modes

### Forms/Tabs Editors

**Purpose:** Precise, field-by-field configuration.

**When to use:** Known model structure; fine-tuning parameters; checking specific fields.

**Strengths:** All fields visible; structured validation; no ambiguity.

### AI Builder

**Purpose:** Bootstrap from natural language description.

**When to use:** New model from scenario description; unfamiliar domain.

**Access:** Design mode → **Describe** sub-tab. Also available from the New Model dialog via **Describe**.

**Behaviour:** Three-phase conversation (Discover → Confirm → Generate). Asks targeted questions; confirms understanding before generating JSON. Uses the model's name and description as context from the first message — set these on the Overview tab for best results. When editing an existing model, the current model structure is also provided as context.

**Strengths:** Fast scaffolding; suggests realistic parameters; refines incrementally.

### Visual Designer

**Purpose:** Topology view; drag-and-drop editing.

**When to use:** Reviewing flow; presenting to stakeholders; connection verification.

**Access:** Design mode → **Visual** sub-tab. Also available from the New Model dialog via **Draw**.

**Strengths:** Visual flow; node badges show advanced config (conditional, feed); bidirectional sync with Forms/Tabs. New blank models open with a starter flow pre-placed on the canvas — no unsaved changes until you make your first edit. Multi-select nodes (Shift/Ctrl-click or box-drag) to bulk-move or bulk-delete; copy/paste (Ctrl+C/Ctrl+V) or duplicate in place (Ctrl+D). Selecting an edge for a probabilistic-routing branch shows an inline `%` input on the edge label — edit the split without leaving the canvas or opening the B-Events editor.

---

## Explain Panel

### Interpret Results

**Purpose:** Plain-English narrative of what simulation found.

**When to use:** After any completed run; first results review.

**Output:** System performance summary, bottleneck identification, goal assessment, notable patterns.

### Compare Runs

**Purpose:** Side-by-side comparison of two saved runs.

**When to use:** Scenario comparison; before/after change analysis.

**Access:** Results → **History**. Select exactly two runs, then click **Compare selected**.

**Output:** KPI differences in a side-by-side comparison table.

### Ask a Question

**Purpose:** Free-form Q&A against run results.

**When to use:** Specific queries not covered by structured analyses.

**Examples:** "Why is utilisation above 90%?", "Is warmup long enough?"

---

## Help Assistant vs Explain

| Aspect | Help Assistant | Explain |
|--------|---------------|-------------|
| **Purpose** | Answers "How do I use simmodlr?" | Answers "What do my results mean?" |
| **When available** | Any screen (via ? button) | After completed run (Results → Explain) |
| **Knowledge base** | Curated help articles, validation rules, macro syntax, distribution guidance | Run results, model JSON, confidence intervals, goal gaps |
| **Knowledge source** | This help-reference document (curated, versioned alongside docs) | Run results + model JSON passed live at query time |
| **Example questions** | "What does ARRIVE do?", "How do I set up reneging?", "What does V8 mean?" | "Why is wait time so high?", "Should I add more servers?", "Are these results reliable?" |
| **Context-awareness** | Suggests questions based on current tab/editor | Analyses current run's specific results |

**Rule:** Route "how to" questions to Help Assistant. Route "what does this mean" questions to Explain.

---

## Schedule Manager (Timetables)

Timetable data for arrival B-events is stored separately from the core model in the **Schedules** tab of the model editor. This keeps the model lightweight and lets you maintain multiple named timetables for the same model.

### Accessing schedules

Open your model and click the **Schedules** tab (between C-Events and State Variables).

### Schedule list

Shows all schedules for the model: name, total row count, which B-events use each schedule. A ★ marks the default schedule.

### Selecting a schedule for a run

When a model has more than one schedule, a **Timetable:** dropdown appears in the Execute panel above the Run button. Select the timetable you want before clicking Run.

### Creating a schedule

Click **+ New Schedule**, enter a name, and save. Populate rows by importing via CSV or entering JSON directly.

### Setting a default

Click **Set as default** (★) next to the schedule to use when no explicit selection is made.

### CSV export

Open a schedule and click **Export CSV** to download all rows for editing externally.

### Export and portability

When you export a model as JSON (toolbar → Export Model), schedule rows are automatically embedded in the exported file. The export is self-contained and can be imported to another simmodlr instance.

### B-event schedule link

Each arrival B-event stores a `scheduleRef` UUID pointing to a schedule record. If the referenced schedule is deleted or unavailable, the B-event produces zero arrivals (a validation warning is shown).

### Bidirectional navigation

In the **B-Events** editor, a green badge appears next to each event that is linked to a named schedule (showing the schedule name). Clicking the badge switches to the Schedules tab with that schedule selected.

In the **Schedules** editor, the Event Links panel lists every B-event that uses the current schedule. Clicking a B-event name switches to the B-Events tab and scrolls to that event.

### Migrating inline rows to a named schedule

If a B-event still has rows embedded directly in the model JSON (legacy format), a **Move to named schedule →** button appears in the B-Events editor above the schedule picker. Clicking it creates a new named schedule from the inline rows and links the B-event to it, removing the embedded data from model JSON.

### CSV import — single-event and multi-event formats

**Single-event:** First column is `time`; subsequent columns are entity attribute names. Import a single schedule's rows.

**Multi-event:** First column is `event` or `eventId` containing B-event IDs or names; second column is `time`; subsequent columns are attributes. Imports rows for multiple B-events at once. The importer shows a per-event match status; unmatched events are flagged. The **Import + create stubs** option auto-creates fire-at-start B-events for any B-event IDs in the CSV that don't yet exist in the model.

---

## ⚡ Optimise — Adaptive Batch Analysis

**Optimise** is reached via the Simulation Assistant sidebar. It runs the model through progressively larger replication batches until statistical confidence is achieved, then streams an LLM-generated opportunity report.

### Accessing Optimise

Click the **⚡ Optimise** button inside the Simulation Assistant sidebar. The button is visible when you are in the Results mode and the model has no validation errors. If the model has errors, fix them in the **Model Health** tab first.

### Pre-flight confirmation

Before any simulation starts, a confirmation dialog shows:
- **Replications limit** — your plan's maximum (Free: 10, Standard: 30, Pro: 100)
- **Model complexity** — Low / Medium / High / Very high based on C-event scan estimate
- **Run duration and warmup** — taken from the model's experiment defaults
- **Target CI** — ±5% of the mean (95% confidence)
- **Hard errors** — if any admission errors are present (e.g. run duration exceeds tier limit), the Proceed button is hidden; fix the issue first
- **Warnings** — shown in amber; you can still proceed

Click **Proceed** (or **Proceed anyway** if warnings are present) to start. Click **Cancel** to close without running.

### How the adaptive batch works

1. Starts with 5 replications (or fewer if the tier max is lower)
2. Computes the 95% CI relative half-width: `halfWidth / |mean| × 100`
3. If half-width < 5% of the mean → **converged**, stops
4. Otherwise adds another batch (step size = `max(5, tierMax ÷ 5)`) and repeats
5. Stops unconditionally when the tier replication limit is reached

Each round uses fresh, non-overlapping seeds so all replications are statistically independent.

### Progress display

During the run, a progress bar fills from left to right showing `N / max replications`. The live CI percentage updates after each round (e.g. `15 / 30 replications — CI ±8.2%`). Click **Cancel** at any time to stop and discard.

### Convergence badge

After the batch completes:
- **Green** `✓ Confidence achieved: ±X.X% with N replications` — CI target met
- **Amber** `⚠ Tier limit reached (N reps) — CI ±X.X% — results are indicative` — tier max hit before CI converged; results are still useful but less precise. Upgrading your plan increases the replication budget.

### AI opportunity report

Once the batch completes, the results are saved to run history and an LLM analysis streams in four sections:

| Section | Content |
|---------|---------|
| **Bottlenecks** | Top 3 bottlenecks ranked by impact — queue or resource name, utilisation or wait metric, reason |
| **Quick Wins** | 3 improvements achievable without adding resources (scheduling, routing, priority changes) |
| **Investment Opportunities** | 2 structural improvements requiring extra resources or redesign; quantified where CI supports it |
| **Confidence Summary** | Statistical robustness statement citing CI, replication count, and any caveats |

### After the report

Click **View Results** to jump directly to the Results › Summary tab for the saved run. All interactive results tools (charts, export, Create Report) are available from there.

### Plan limits

| Plan | Max replications |
|------|-----------------|
| Free | 10 |
| Standard | 30 |
| Pro | 100 |

If the model is complex or high-variance, the Free tier may not achieve the ±5% CI target. The amber badge tells you the CI achieved within your limit so you can judge whether the results are sufficient for your purpose.

---

## Simulation Assistant

The Simulation Assistant is the AI panel available from any model editing, run, or results view. Click the **✦ AI** button in the mode bar to open it. It adapts to your current context:

| Context | What it shows |
|---------|--------------|
| **Design tabs** (entities, queues, B-events, C-events, etc.) | Suggested questions about the current tab's content. A free-text **ASK ABOUT THIS MODEL** input for any question about the model's structure. The assistant receives the full model definition (entity attributes, queue configurations, C-event logic, sections, goals) and can reason about whether conditions and effects are correctly wired. |
| **Run tab** (Execute) | A **Diagnostics** panel showing entity inspection and event log overlays on the Execute canvas. The same **ASK ABOUT THIS MODEL** input is available so you can ask questions about the model while watching it run. After a run completes, a second **ASK A QUESTION** input appears for results-specific queries. |
| **Results tab** | Three focused tabs: **Analyse** (plain-language narrative of results), **Compare** (side-by-side comparison with a saved run), and **Refine Plan** (schedule adjustment suggestions — only when the model has a timetable). A **FOLLOW-UP QUESTION** input lets you ask specific questions about the results. No action fires automatically — click the button to trigger analysis. |

### Opening the Simulation Assistant

Click the **✦ AI** button in the mode bar to toggle the Simulation Assistant. On desktop it opens as a resizable sidebar. On compact layouts (720–1024px) the panel floats as an overlay. On mobile (<720px), it opens full-screen.

### Design and Run tabs — Model Q&A

The **ASK ABOUT THIS MODEL** textarea is always available in design and run tabs. Type any question about the model — the assistant has full knowledge of your entity types, attributes, queue configurations, C-event conditions, sections, and goals. Examples: "Review my entity types", "Are my C-event conditions correctly wired?", "What can this model simulate?"

Quick-start chips suggest context-specific questions based on the tab you're viewing.

### Run tab — Diagnostics

When you open the Simulation Assistant on the Run tab, it shows the **Diagnostics** panel: entity inspector overlays on the Execute canvas, event log filtering by phase, and node status indicators. This replaces the full analysis interface — results-focused actions (Analyse, Compare, Refine Plan) only appear in the Results tab.

### Results tab — Focused actions

| Button | What it does |
|--------|-------------|
| **Analyse** | Streams a plain-language narrative of the latest run KPIs with structured improvement suggestions |
| **Compare** | Select a saved run from the dropdown and click to stream a structural side-by-side comparison |
| **Refine Plan** | Analyses the current schedule against results and suggests timetable adjustments (only when the model has a timetable) |

All actions require an explicit click — nothing fires automatically when you switch tabs.

---

## LLM Bundle Export

### What it is

The LLM Bundle is a structured Markdown file that combines model definition and run results into a self-contained document for paste-into-LLM analysis. It includes a plain-English DES preamble so no additional context is needed when pasting into Claude, ChatGPT, or Gemini.

### How to download

1. Complete a run (any number of replications).
2. In the Execute panel, click **Export…**.
3. Select **LLM Bundle (.md)**.
4. The file downloads immediately. Paste its contents into any LLM interface.

### What the bundle contains

| Section | Contents |
|---------|---------|
| Preamble | Three-Phase DES method explanation, how to interpret the results |
| Model definition | Entity types and attributes (including weekly schedule patterns), queues (discipline, capacity), B-Events and C-Events, performance goals |
| Experiment config | Replications, warm-up period, max sim time, seed, schedule name |
| Headline KPIs | avgWait, avgSvc, avgSojourn, served, reneged, utilisation |
| Per-queue wait table | mean, p50, p90, p95, p99 for every queue (GitHub-Flavored Markdown pipe table) |
| Per-resource utilisation | utilisation %, busyCount, idleCount per server. For schedule-pattern resources: per-shift utilisation breakdown and schedule adherence. |
| Confidence intervals | 95% CI per KPI — present only for runs with ≥ 2 replications |
| Goals pass/fail | Each performance goal with target, actual, and PASS/FAIL |
| Replication summary | seed, served, reneged, avgWait per replication (omitted for single-replication runs) |

**Token estimate:** 1,500–2,500 words (2,000–3,300 tokens) for a fully populated model.

**Availability:** The option is disabled (greyed out) until at least one run has been completed in the current session.

### When confidence intervals are absent

The CI section is omitted for single-replication runs — there is no between-replication variance to report. Run with ≥ 2 replications to include CIs.

---

## SimPy Export

### What it is

Exports any model as a runnable Python SimPy script, or runs it directly in the browser via Pyodide WebAssembly. Provides an independent reference implementation useful for cross-validating JS engine results.

### Category 1 vs Category 2

| Category | Meaning | "Run in Browser" available? |
|----------|---------|----------------------------|
| Category 1 — Complete | All macros auto-translated; script runs without edits | Yes |
| Category 2 — Partial | Contains macros with complex Python patterns; replaced with annotated `# TODO` stubs | No — complete TODO sections in an IDE first, then run locally |

**Category 1 supported macros:** `ARRIVE`, `ASSIGN`, `COSEIZE`, `COMPLETE`, `RELEASE`, `FILL`, `DRAIN`, `SPLIT`, `SET`, `SET_ATTR`, `COST`, `UNBATCH`.

**Category 2 macros (stubs generated):** `RENEGE`, `BATCH`, `RENEGE_OLDEST`, `MATCH`, `FAIL`, `REPAIR`, `PREEMPT`. Note: all of these are fully implemented in the JS Three-Phase engine — they appear as stubs only because their Python translation is non-trivial to auto-generate.

### Run in Browser

Category 1 models can run without leaving the browser. Click **Run in Browser** in the SimPy export dialog:

- First run downloads Pyodide (~25 MB WASM bundle) and caches it. Subsequent runs start immediately.
- A progress bar shows each replication as it completes.
- Results load into the Results workspace with a `[SimPy]` source label — same place as JS engine results.
- Metrics available: served/reneged counts, avg sojourn, avg wait, wait P50/P90/P99, mean service time, per-resource utilisation.

The **Run in Browser** button is disabled for Category 2 models. A tooltip explains that manual edits are required first.

### Output modes (RUN_MODE)

The generated script contains a `RUN_MODE` constant near the top of the configuration block:

- `"text"` (default) — human-readable per-replication summary lines; for `python model_simpy.py` terminal use
- `"json"` — one JSON object per line (JSONL); one `{"type":"rep",...}` per replication followed by a `{"type":"summary",...}` record; designed for pipeline/script consumption. The browser runner sets this mode automatically before execution.

### Accessing the export

Click **⬇ SimPy** in the model header bar, or go to the **Access** tab and click **Export SimPy**.

---

## Results API

### What it is

A Supabase Edge Function that provides read-only programmatic access to saved run and sweep results. Useful for Python notebook analysis, R scripts, and BI tool integration.

### Authentication

Pass a Supabase JWT as a `Bearer` token in the `Authorization` header. For publicly shared runs, append `?shareToken=<token>` instead.

### Routes

| Route | Returns |
|-------|---------|
| `GET /functions/v1/results-api/runs/:runId` | Full result for one run: metadata + `results_json` payload |
| `GET /functions/v1/results-api/runs?modelId=:modelId` | List of run summaries for a model |
| `GET /functions/v1/results-api/sweeps/:sweepId` | Full sweep result: config + per-point results array |

### Python quick-start

```python
import requests, pandas as pd

headers = {"Authorization": "Bearer YOUR_JWT_TOKEN"}
base = "https://YOUR_PROJECT.supabase.co/functions/v1/results-api"

run = requests.get(f"{base}/runs/RUN_ID", headers=headers).json()
reps = pd.json_normalize(run["results"]["replications"])
print(reps[["replicationIndex", "seed", "summary.avgWait", "summary.served"]])
```

### R quick-start

```r
library(jsonlite)
run <- fromJSON(
  "https://YOUR_PROJECT.supabase.co/functions/v1/results-api/runs/RUN_ID",
  headers = c(Authorization = "Bearer YOUR_JWT_TOKEN"),
  simplifyDataFrame = TRUE
)
run$results$replications[, c("replicationIndex", "seed")]
```

### Event log availability

At the default storage level, the event log is condensed to a 4-field `logSummary`. Full event logs are only retained at `resultDetailLevel = "full"` (no UI control). The response includes `_trimmed_fields` listing condensed sections.
