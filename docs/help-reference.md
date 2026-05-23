# DES Studio Help Reference

**Purpose:** System context for Help Assistant LLM responses  
**Audience:** LLM consuming as prompt context (machine-readable)  
**Maintenance:** Updated at end of each sprint alongside core documents

---

## Core Concepts

### Three-Phase Method

DES Studio implements Pidd's Three-Phase discrete-event simulation algorithm.

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

**Attributes:** Customer entities carry named numeric attributes (priority, dueDate, etc.) set at arrival or updated mid-simulation via SET_ATTR.

### Queues

Buffers where customer entities wait for service. Defined in `queues[]` array.

| Field | Purpose |
|-------|---------|
| name | Unique identifier; referenced in macros |
| discipline | Selection rule for next entity to serve |
| capacity | Maximum waiting entities (null = unlimited) |
| customerType | Entity type name expected in this queue |
| overflowDestination | Queue for blocked/balked entities |

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

All 19 effect macros. Syntax is exact — case-sensitive, parentheses required.

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
| FAIL | `FAIL(ServerType)` | Places server into failed (unavailable) state; interrupts any in-progress service | Sets server to failed; in-service entity re-queues with remaining service time | Forgetting to schedule a paired REPAIR B-event |
| REPAIR | `REPAIR(ServerType)` | Restores failed server to idle | Sets server to idle; triggers C-scan | Repairing non-failed server (no effect) |

### Entity Transformation Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| SPLIT | `SPLIT(EntityType, N, QueueName)` | Creates N-1 clones of context entity | N-1 new entities added to entity pool | Omitting QueueName |
| BATCH | `BATCH(QueueName, N)` or `BATCH(QueueName, Entity.attrName)` | Collects N entities into single batch entity | N-1 originals marked done; one batch replaces them | Using N < 2 |
| UNBATCH | `UNBATCH(QueueName)` | Splits batch entity back into constituents | Batch marked done; original entities restored | Using on non-batch entity |
| MATCH | `MATCH(TypeA, QueueA, TypeB, QueueB, QueueName)` | Pairs one entity from each queue into combined batch | Originals marked with _matchedInto | Queues must both have eligible entities |
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

---

## Distributions

All 11 distribution types. Parameter values must be strings (e.g., "5" not 5).

### Parametric Distributions

| Distribution | Parameters | Constraints | Typical Use |
|-------------|------------|-------------|-------------|
| Fixed | `{ value: "N" }` | value is numeric | Deterministic duration; removes variability |
| Exponential | `{ mean: "N" }` | mean > 0 | Memoryless inter-arrival and service times (M/M/c) |
| Uniform | `{ min: "N", max: "N" }` | max > min | Service times with known bounds, no preference |
| Normal | `{ mean: "N", stddev: "N" }` | stddev > 0 | Bell-shaped empirical data; negative samples clamped to 0 |
| Triangular | `{ min: "N", mode: "N", max: "N" }` | min ≤ mode ≤ max | Three-point estimates when data scarce |
| Erlang | `{ k: "N", mean: "N" }` | k integer ≥ 1, mean > 0 | Sum of k exponential phases; more regular than Exponential |

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

**Detection:** Welch's method automatically detects warmup from cumulative mean chart stabilisation point.

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
| avgSojourn | Mean end-to-end time (wait + service) | System-wide delays | Efficient flow |
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
| V17 | routing table and RELEASE target both specified | Use one or the other, not both |
| V18 | Probabilistic routing probabilities don't sum to 1.0 | Adjust probabilities |
| V19 | Server count < 1 | Set count ≥ 1 |
| V20 | Queue capacity < 1 when specified | Set capacity ≥ 1 or leave blank |
| V21 | balkProbability outside [0, 1] | Correct probability value |
| V22 | BATCH size < 2 or queue doesn't exist | Set size ≥ 2; create queue |
| V24 | loopConfig.maxLoopCount < 1 | Set maxLoopCount ≥ 1 |
| V26 | Container id empty or capacity ≤ 0 | Set valid id and capacity |
| V27 | FILL/DRAIN references undeclared container | Create container or correct id |

### Warning-Level Rules (Run Proceeds)

| Code | Rule | Implication |
|------|------|-------------|
| V8 (one missing) | Only arrival OR only sink present | Model may not complete entity lifecycle |
| V11 | Normal distribution with mean < 2×stddev | Frequent negative sample clamping to 0 |
| V15 | Shift time after run duration | Shift change never fires |
| V25 | RENEGE(TypeName) instead of RENEGE(ctx) | Macro silently fails; no reneging occurs |
| V28 | Invalid epoch format | Real-world clock conversions disabled |
| V29 | cSchedules all have when with no fallback | Entities matching no condition receive no service |
| W-CAP-01 | Multi-class resource contention | Priority inversion possible |
| W-CAP-02 | Arrival rate exceeds capacity by >20% | Queue growth and long waits expected |

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
- Reneging schedule missing isRenege: true flag
- Entity already served before reneging timeout

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
- All servers failed with no REPAIR scheduled

**Fix:** Check schedules[] on B-events; verify C-event conditions; schedule repairs.

---

## Authoring Modes

### Forms/Tabs Editors

**Purpose:** Precise, field-by-field configuration.

**When to use:** Known model structure; fine-tuning parameters; checking specific fields.

**Strengths:** All fields visible; structured validation; no ambiguity.

### AI Generator

**Purpose:** Bootstrap from natural language description.

**When to use:** New model from scenario description; unfamiliar domain.

**Behaviour:** Three-phase conversation (Discover → Confirm → Generate). Asks targeted questions; confirms understanding before generating JSON.

**Strengths:** Fast scaffolding; suggests realistic parameters.

### Visual Designer

**Purpose:** Topology view; drag-and-drop editing.

**When to use:** Reviewing flow; presenting to stakeholders; connection verification.

**Strengths:** Visual flow; node badges show advanced config (conditional, feed); bidirectional sync with Forms/Tabs.

---

## AI Insights Panel

### Interpret Results

**Purpose:** Plain-English narrative of what simulation found.

**When to use:** After any completed run; first results review.

**Output:** System performance summary, bottleneck identification, goal assessment, notable patterns.

### Suggest Improvements

**Purpose:** Structured six-step analysis per suggestion.

**When to use:** Goals not met; seeking optimisation.

**Output:** Binding constraint, root cause, specific change, predicted effect, goal impact, ranking.

### Apply & Re-run

**Purpose:** Test suggested change without mutating saved model.

**When to use:** Evaluating AI suggestions before committing.

**Behaviour:** Runs patched model copy; shows before/after comparison table.

### Sensitivity Analysis

**Purpose:** Assess result uncertainty.

**When to use:** Before acting on results; deciding replication count.

**Output:** CI width assessment, KPI uncertainty flags, replication sufficiency recommendation.

### Compare Runs

**Purpose:** Side-by-side narrative of two saved runs.

**When to use:** Scenario comparison; before/after change analysis.

**Output:** KPI differences, statistical significance (CI overlap), interpretation of why results differ.

### Ask a Question

**Purpose:** Free-form Q&A against run results.

**When to use:** Specific queries not covered by structured analyses.

**Examples:** "Why is utilisation above 90%?", "Is warmup long enough?"

---

## Help Assistant vs AI Insights

| Aspect | Help Assistant | AI Insights |
|--------|---------------|-------------|
| **Purpose** | Answers "How do I use DES Studio?" | Answers "What do my results mean?" |
| **When available** | Any screen (via ? button) | After completed run (Execute panel) |
| **Knowledge base** | Curated help articles, validation rules, macro syntax, distribution guidance | Run results, model JSON, confidence intervals, goal gaps |
| **Knowledge source** | This help-reference document (curated, versioned alongside docs) | Run results + model JSON passed live at query time |
| **Example questions** | "What does ARRIVE do?", "How do I set up reneging?", "What does V8 mean?" | "Why is wait time so high?", "Should I add more servers?", "Are these results reliable?" |
| **Context-awareness** | Suggests questions based on current tab/editor | Analyses current run's specific results |

**Rule:** Route "how to" questions to Help Assistant. Route "what does this mean" questions to AI Insights.

---

<!-- help-reference version: 1.1 | sprint baseline: Sprint 70 | word count: ~3200 -->
