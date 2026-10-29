# Flow Help Reference

**Purpose:** System context for Help Assistant LLM responses  
**Audience:** LLM consuming as prompt context (machine-readable)  
**Maintenance:** Updated whenever a user-visible feature changes, alongside `docs/DES_Studio_User_Guide.md`  
**Last updated:** 2026-10-29 (covers everything merged up to PR #613)

The app is called **Flow** (shown as "flow" in the header). It is part of the simmodlr family; older documents call it DES Studio or simmodlr.

## Where Things Are

| Area | How to reach it | What is there |
|------|-----------------|---------------|
| Model Library | Home screen after sign-in, or **← Back** from a model | Tabs **My Models**, **Templates**, **Public Library**, **Community**; header buttons **Explore published**, **↓ AI Prompt Pack**, **Connect AI app**, **+ New Model** |
| Model header | Top of an open model | **← Back**, model name, visibility and version chips, **↩ Undo**, **↪ Redo**, **Save** / **Discard** when there are unsaved changes |
| Mode bar | Below the model header | **Overview**, **Design**, **Run**, **Results**, and for owners **Access** and **Versions**; then **✨ Simulation Assistant** |
| Overview | Mode bar → Overview | Getting-started cards, notes, last run and recent runs, **Named Scenarios**, scenario copies |
| Design | Mode bar → Design | **Draw**, **Describe**, **Define**, **Model Health** (only when there are issues) and **View definition** (a printable model document) |
| Define sub-tabs | Design → Define | **Entity Types**, **Queues**, **Model Data** (Skills, Containers, Distances, State Variables), **Bound Events**, **Conditional Events**, **Sections**, **Time & Schedules**, **Goals**, **Evidence**; **Data Sources** only when the experimental flag is on |
| Run | Mode bar → Run | Views **Run**, **Experiments**, **Studies**; run controls, Run canvas, docked inspector, bottom panel |
| Results | Mode bar → Results | Views **Summary**, **Log**, **Entities**, **History** |
| Access (owners) | Mode bar → Access | **Sharing** (Private/Public, Copy link), **Export** (Export Model, Export SimPy), **Publish**, **Collaborators**, **Business view** |
| Versions (owners) | Mode bar → Versions | **+ Create version**, **Compare to current**, restore |
| Help Assistant | **?** icon in the top header, or press **?** outside a text field | This assistant |
| Settings | Gear icon in the top header | Your user settings |
| Account menu | **•••** in the top header | Feedback, About, **Keyboard shortcuts**, **Admin panel** (admins), sign out |
| Published models | **Explore published** in the library, or `#/published` | Public gallery and each published model's page; no account needed |

---

## Core Concepts

### Three-Phase Method

simmodlr implements Pidd's Three-Phase discrete-event simulation algorithm.

| Phase | Trigger | Behaviour |
|-------|---------|-----------|
| A | FEL not empty | Clock advances to next event time |
| B | Events at T_now | All Bound events scheduled for current time fire in FEL order |
| C | After Phase B | Conditional events tested repeatedly until none can fire; restart from top when any Conditional event fires |

**Key rule:** Phase C restarts from the beginning whenever a Conditional event fires. This ensures priority ordering is respected.

### Entity Types

Two roles. Defined in `entityTypes[]` array.

| Role | Purpose | Count field | Arrival mechanism |
|------|---------|-------------|-------------------|
| customer | Flows through system; arrives, waits, receives service, departs | Always 0 | ARRIVE macro creates instances |
| server | Provides service capacity; customers compete for server units | Integer ≥ 1 | Present at simulation start |

**Schedule patterns (Sprint 86):** Server entity types can optionally define a `schedulePattern` object with `type: "weekly"` and a 24×7 capacity grid (`grid: [[day][hour]]`). An associated shift schedule (`shiftScheduleId`) defines rostered staff availability. The grid is a 7×24 array of integers. The engine tracks per-shift utilisation and schedule adherence for weekly-pattern servers.

**Attributes:** Customer entities carry named numeric attributes (priority, dueDate, etc.) set at arrival or updated mid-simulation via SET_ATTR.

**Quantity attribute (`quantityAttr`):** A customer entity type can name one of its **number** attributes as its quantity — e.g. `volume` on a crude cargo (Aframax ≈ 0.7 Mb, Suezmax ≈ 1 Mb, VLCC ≈ 2 Mb). Set it with the **Quantity attribute** picker in the Entity Types editor. Results then also total that attribute alongside the usual entity counts: quantity served, quantity in system, quantity through each queue, quantity processed by each resource, and quantity per outcome and journey (see **Quantities** under Results). The value is read from the entity's current attribute when it is measured, so SET_ATTR changes are reflected. Validation: the attribute must exist on that type and be a number (V78, blocking); a warning (V79) fires if it has no default value and no distribution, since every entity's quantity would then be 0.

**Entity family / inheritance (`parentTypeId`):** An entity type can set `parentTypeId` to another entity type's `id` (same role) to inherit its `attrDefs`, `skills`, and `skillProfiles` at model-load time — a build-time merge, not a runtime concept the engine is otherwise aware of. Child values override the parent's on name collision. Must be same-role, non-self-referential, and acyclic (V67).

**Service sequence enforcement (`requiredSequence`):** A customer entity type can set `requiredSequence` — an ordered list of queue names it should visit in order. Design-time only: the engine does not enforce it at run time, but validation (V68) traces the model's actual routing and warns if this entity type is ever routed backward through the declared stages. Not a blocking error, since rework/retry loops are a legitimate pattern.

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
| renegeDist / renegeDistParams | Distribution sampled to auto-schedule a patience timer the moment an entity joins — no RENEGE(ctx) Bound event needs to be authored |

### Bound Events (B-Events)

Time-scheduled events. Fire at specific simulation clock times. Defined in `bEvents[]` array.

**Purpose:** Arrivals, service completions, scheduled failures, repairs.

**Key fields:**
- `scheduledTime`: Initial fire time (0 for arrivals, 9999 for completions)
- `effect[]`: Array of macro call strings
- `schedules[]`: Re-scheduling rules with distribution

### Conditional Events (C-Events)

State-triggered events. Fire when condition becomes true. Defined in `cEvents[]` array.

**Purpose:** Resource allocation decisions ("if queue non-empty AND server idle → start service").

**Key fields:**
- `condition`: String expression testing queue lengths and server states
- `effect[]`: Array of macro call strings
- `priority`: Integer; lower fires first
- `cSchedules[]`: Service duration distributions

**What the right-hand side of a condition can be:** Each clause compares a left side with a right side — no arithmetic on either side. The right-hand side is read **dynamically** (its current value at the moment the condition is checked) when it is:
- one of the function-call tokens `queue(Q).length`, `idle(T).count`, `busy(T).count`, `container(C).level|capacity|min|max`, `attr(T, a)` — e.g. shortest-queue routing `queue(A).length < queue(B).length`;
- a **state variable**, written as its bare name or as `state.<name>` — e.g. `clock >= closureStart`, `queue(Waiting).length > maxQueueLength`.

Anything else is a **literal**: a number (`3`), or text (`"sour"`) — e.g. `Entity.grade == "sour"`. A bare word is read as a state variable only if a state variable of exactly that name exists; otherwise it stays literal text. `Entity.<attr>` on the right-hand side is not resolved — it is literal text.

A non-numeric literal on the right of a numeric comparison (an ordering operator `<`, `>`, `<=`, `>=`, or a numeric left side such as `clock` or `queue(Q).length`) is almost always a typo — e.g. `clock >= closureStrat` — and would make the clause always false. Validation warns about it (**V76**).

**Time-based gates without a daily tick:** because `clock` and state variables can now be compared directly, a timed closure needs no repeating "status check" Bound event — two Conditional events do it: one with `clock >= closureStart AND clock < closureEnd AND closureEnabled == 1 AND isOpen == 1` and effect `SET(isOpen, 0)`, and one with `clock >= closureEnd AND isOpen == 0` and effect `SET(isOpen, 1)`. Conditional events are checked after every event, so the gate flips at the first event at or after the given time.

**Starvation anti-pattern:** When two Conditional events share a resource and one has a lower priority number (higher urgency), the other may never fire if the first queue is always populated. Symptom: entities accumulate in mid-journey queues; `served=0` or very low for some replications. Diagnosis: check whether any terminal Conditional event (discharge, exit) has a higher priority number than an entry Conditional event on the same resource. Fix: set the terminal Conditional event priority to 0 (highest) so completions are not deferred indefinitely.

**Cross-referencing Conditional Events and Bound Events:** Each `cSchedules[]` entry in the Conditional Events editor shows a plain-language summary of what its linked Bound event actually does (e.g. "Releases Nurse · routes 80% → Discharge Queue, 20% → Transfer Queue", "Entity exits simulation", or — for macros without a friendly phrase yet — the raw macro call as a fallback, so nothing is ever hidden). Clicking the Bound event's name jumps straight to it in the Bound Events tab. Conversely, if a Bound event is referenced by any Conditional event's `cSchedules`, the Bound Events editor shows a "Scheduled by" link back to that Conditional event. This is presentation only — it does not change the underlying `bEvents[]`/`cEvents[]` data.

### State Variables

Model-level numeric counters. Defined in `stateVariables[]` array.

**Purpose:** Track cumulative counts, implement flags, accumulate custom metrics.

**Access:** Read in conditions as plain names (or `state.<name>`), on either side of a comparison — e.g. `closureEnabled == 1` or `clock >= closureStart`; write via SET(varName, expr) macro.

### Containers

Level-based resource pools. Defined in `containerTypes[]` array.

**Purpose:** Model inventory, blood bank stocks, fuel tanks, warehouse buffers.

**Operations:** FILL adds quantity (clamped to capacity); DRAIN removes quantity (does nothing unless the full amount is available); DRAIN_PARTIAL removes whatever is there up to the amount and can record the shortfall in a second container.

**Modelling unmet demand:** `DRAIN_PARTIAL(products, dailyDemand, unmet)` on a daily demand Bound event draws `min(level, dailyDemand)` from the product stock and adds the rest to the `unmet` container, so `unmet` accumulates exactly the demand that could not be met — no lot-size remainder. This is **lost-sales** semantics: the shortfall is recorded when it happens and is not served later. If unmet demand should instead wait as back-orders and be filled when product arrives, keep a backlog container that demand FILLs and a supply Conditional event that DRAINs it together with the stock.

**Results:** each container reports min, avg, max and final level (post-warm-up), plus a **level over time** chart and trough/peak tiles (see Results). For multi-replication runs min, avg, max and final are each the **mean across replications**; the lowest and highest level any single replication reached are shown separately.

Edited in the UI via the **Model Data** tab, which also holds Skills, the **Distances** registry, and State Variables.

**Capacity and initial level as run-time parameters:** Container `capacity` and initial `level` are adjustable and sweepable like any other parameter — via the Run tab's **🎛 Adjust parameters** panel, the Scenario Manager, a parametric sweep, or (for Business view sharing) Access-tab owner curation — not only via the Model Data tab.

### Distances

Named, undirected distances between queue pairs. Defined in the `distances[]` array (`{id, fromQueue, toQueue, distance}`), edited in the same **Model Data** tab as Containers.

**Purpose:** Consumed by the `Distance` distribution type to compute a Conditional event schedule's duration as distance ÷ a speed attribute, instead of a flat sampled number — for courier/dispatch/transport-style models.

**Validation:** V69 (registry structure), V70 (usage cross-reference — see Distributions above).

### Goals

Performance targets. Defined in `goals[]` array. Edited in Design → Define → **Goals**.

**Purpose:** Drive AI suggestion prioritisation, colour sweep charts (green=feasible, red=infeasible), display pass/fail on KPI cards.

**Fields:** metric, operator, target, label, and an optional scope (a queue, resource or container).

**Quantity goals:** with a quantity attribute set (see Entity Types), goals can also target `summary.servedQuantity` (quantity served), `summary.quantityThrough` scoped to a queue, and `resource.quantityProcessed` scoped to a resource.

**Outcomes in the results file:** every run records each goal's result, gap and status (`met`, `not-met`, or `no-data` when the metric could not be evaluated) as `goalOutcomes`, exported in the JSON and the workbook's **Goals** sheet.

---

## Macros

The effect macros: ARRIVE, ASSIGN, BATCH, CANCEL, COMPLETE, COSEIZE, COST, DELAY, DRAIN, DRAIN_PARTIAL, FAIL, FILL, FINISH, JOIN, MATCH, PREEMPT, RELEASE, RELEASE_COSEIZED, RENEGE, RENEGE_OLDEST, REPAIR, ROUND_ROBIN, SET, SET_ATTR, SPLIT, UNBATCH. Syntax is exact — case-sensitive, parentheses required.

**Entering effects in the UI (Effect picker):** Effects are added from a structured picker, never free text. The picker has a type-ahead search box to filter the option list. Quantity-bearing macros (BATCH, SPLIT, DRAIN, FILL, FAIL, REPAIR) are entered via a composer — pick the operand from a dropdown and type the quantity into a validated number field (no preset quantity lists); FAIL/REPAIR also keep an enumerated "all servers" quick pick alongside the composer. COSEIZE has its own composer for picking any number of server types, each with an optional skill and an optional quantity (seize 2 of one type + 1 of another in the same call). JOIN has a two-dropdown composer (rendezvous queue → "then route to" target; the target must differ from the rendezvous queue). MATCH and COSEIZE stop enumerating ready-made combinations above 50 options and fall back to their composers.

### Flow Control Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| ARRIVE | `ARRIVE(EntityType)` or `ARRIVE(EntityType, QueueName)` | Creates entity instance, places in queue | Increments queue depth; schedules reneging if configured | Omitting QueueName when entity type name ≠ queue name |
| COMPLETE | `COMPLETE()` | Marks context entity as served, releases server | Increments served count; records sojourn time | Using without preceding RELEASE |
| RELEASE | `RELEASE(ServerType)` or `RELEASE(ServerType, QueueName)` | Frees server unit, routes entity onward | Sets server to idle; updates service stats | Combining with routing table (mutually exclusive); using on a COSEIZE-scheduled Bound event instead of RELEASE_COSEIZED (see below) |
| RELEASE_COSEIZED | `RELEASE_COSEIZED([Type1, Type2, ...])` or `RELEASE_COSEIZED([Type1, Type2, ...], QueueName)` | Frees **all** currently-claimed servers of each listed type atomically, routes entity onward — quantity-agnostic: if a type was seized with `Type:N`, all N are released, however many were seized | Sets all listed servers to idle; updates service stats for each | Stacking separate `RELEASE(Type)` calls instead — each resolves against the same cached server, so only the first release actually happens (V38c); listing a type not part of the scheduling COSEIZE(...) (V38d); misspelling it `RELEASE_COSEIZE` without the trailing "D" — not a real macro, silently no-ops at runtime (V38e); expecting a *partial* release (e.g. releasing only 1 of 2 seized Nurses) — not supported, permanently |
| ASSIGN | `ASSIGN(QueueName, ServerType)` | Seizes server, starts serving front entity from queue | Sets server to busy; sets entity to inService | Using in Bound event (Conditional event only) |
| ASSIGN (skilled) | `ASSIGN(QueueName, ServerType, "Skill")` | Seizes server, only considers idle servers whose type has the named skill | Sets server to busy with skill tracking | Skill not in model registry (V-SKILL-2) |
| ASSIGN (entity skill) | `ASSIGN(QueueName, ServerType, Entity.attrName)` | Reads skill from entity attribute at runtime; null = any server | Supports per-entity skill variation from one Conditional event | Attribute undefined on customer type (V-SKILL-3) |
| ASSIGN (any type) | `ASSIGN(QueueName, ANY, "Skill")` | Seizes an idle server of **any** server type that has the named skill, instead of one fixed type | Pools candidates across every server type; still prefers higher `skillProfiles[].priority` when multiple match | Omitting the skill argument (ANY has no meaning without a skill filter); naming a real server type `ANY` (reserved word, V62) |
| ASSIGN (scan ahead) | `ASSIGN(QueueName, ServerType, Entity.attrName, SCAN)` or `ASSIGN(QueueName, ANY, "Skill", SCAN:N)` | Without SCAN only the **front** entity is tried — if no idle server has its skill, nothing is assigned even when entities behind it could be served. With SCAN the queue is walked in discipline order and the first entity whose skill has an idle server is assigned (FIFO order is kept among entities of the same skill). `SCAN:N` limits the look-ahead to the first N entities. Lets one queue per hub hold several grades/skills instead of one queue per grade | Same as skilled ASSIGN once an entity is chosen; the step log notes how many entities were passed | Using SCAN without a skill argument (V77); N must be a positive whole number (V77) |
| ASSIGN (consumable-gated) | `ASSIGN(QueueName, ServerType, ContainerId:amount)` | Gates the assignment on a declared container having level ≥ `amount`; server claim and container deduction commit atomically together | Deducts `amount` from the container level (same clamping/logging as DRAIN); no-op (both server and container untouched) if either check fails | Referencing an undeclared container (V27); combine with a skill by putting the container clause last: `ASSIGN(Queue, Server, "Skill", ContainerId:amount)` |
| ASSIGN (preempt) | `ASSIGN(QueueName, ServerType, PREEMPT[, Criterion][, Policy][, MAX:n][, MINSERVICE:t])` | Serves the front entity, taking a server if none is idle. An idle server → exactly a plain ASSIGN. Otherwise a busy server whose entity ranks **strictly below** the front entity is interrupted and handed to it in the same firing (no other activity can take it). Rank is the queue's discipline key (`PRIORITY(attr)`, `PRIORITY`, `SPT`, `EDD`; lower value = more urgent) or `PRIORITY(attr)` given as the Criterion; equal rank never interrupts. The victim is the lowest-ranked entity in service (ties: least service so far); `LONGEST`/`SHORTEST` pick by service so far instead. Policy for the interrupted entity: `RESUME` (default, its remaining time), `RESTART` (its full time again), `RESAMPLE` (a new sample) or `DROP:Queue` (joins that queue instead). `MAX:n` — an entity is interrupted at most n times; `MINSERVICE:t` — only an entity with at least t of service so far is interrupted (checked when the activity is next tried, i.e. after any event). Needs no counter or gating activity: a condition of `queue(Q).length > 0` is enough | Interrupted entity re-queues as with PREEMPT (its pending completion never fires) | A FIFO/LIFO queue with no `PRIORITY(attr)` criterion never interrupts anything (V81); unknown options, a missing rank attribute or an unknown DROP queue (V81). Not with a skill, ANY or container clause |
| RENEGE | `RENEGE(ctx)` | Removes context entity from queue (abandonment) | Increments reneged count | Using entity type name instead of ctx |
| RENEGE_OLDEST | `RENEGE_OLDEST(EntityType)` | Removes oldest entity of specified type from queue | Increments reneged count; used for max-queue policies | Confusing with RENEGE(ctx) |
| CANCEL | `CANCEL(EventName)` | Removes a pending scheduled event for the current context entity only | Deletes the matching FEL entry so it never fires | Expecting it to cancel every entity's instance of that event — it is entity-scoped only, not global |

### Resource Management Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| PREEMPT | `PREEMPT(ServerType[, Criterion])` | Interrupts an in-service entity of a busy server, replaces with a higher-priority entity. Optional Criterion selects which busy server to interrupt when more than one is busy: `PRIORITY(attrName)` (lowest value targeted), `LONGEST`/`SHORTEST` (by elapsed service time). Omitted or unrecognized criterion picks the first busy server (today's behavior). | Displaced entity re-queues with remaining service preserved (any service distribution) and its original completion is cancelled — it never fires, nor do its other effects; results count the service already received as service, not wait. If the entity was co-seized (COSEIZE), any other claimed servers are released too | Using without priority queue discipline; firing it from an activity that doesn't check `idle(ServerType)` can interrupt a job while a server is idle (V81) — prefer ASSIGN … PREEMPT |
| FAIL | `FAIL(ServerType[, N])` | Places up to N servers into failed (unavailable) state; interrupts any in-progress service on servers that must be preempted. Omitted or non-positive N means "all" (unchanged behavior). Prefers idle servers first — busy/serving ones are only touched once idle capacity runs out. | Sets server(s) to failed; in-progress entity re-queues with remaining service time; if the entity was co-seized (COSEIZE), any other claimed servers are released too | For pool scope, all servers fail at once; prefer unit scope for realistic modelling; requesting more than N are available fails all available and notes the shortfall |
| REPAIR | `REPAIR(ServerType[, N])` | Restores up to N failed servers to idle, oldest-failure-first. Omitted or non-positive N means "all" (unchanged behavior). | Sets server(s) to idle; triggers C-scan | Repairing non-failed server (no effect); requesting more than N are failed repairs all failed and notes the shortfall |
| FINISH | `FINISH(ServerType[, Criterion])` | Ends the in-progress service of the entity a busy server of ServerType is currently serving — right now, not at a scheduled time. Optional Criterion (same vocabulary as PREEMPT: `PRIORITY(attrName)`, `LONGEST`, `SHORTEST`) selects which busy server to target when more than one is busy; omitted or unrecognized criterion picks the first busy server (today's behavior). | Marks the entity done, releases the server, records the stage — same outcome as COMPLETE() but triggered by a condition instead of a delay | Use for "activity of unknown duration" (service ends when a condition becomes true); no busy server of that type → logs and no-ops |

### Resource-Free Activity Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| DELAY | `DELAY(QueueName)` or `DELAY(QueueName, N)` | Removes up to N entities from a queue (or all if N omitted) and marks them serving — without claiming any server. Use for scheduling delays, recovery periods, or any hold that doesn't tie up a server. | Duration is set by the firing Conditional event's `cSchedules` entry, not by a server; pairs with a completion Bound event for routing. When N is provided, drains at most N entities per firing (slot capacity pattern). | Completion Bound event has only an `ARRIVE` effect — `ARRIVE` always creates a new entity and never resolves the delayed one, leaving it stuck in "serving" forever (V47). Add `COMPLETE()`, `RELEASE()`, or routing to the completion Bound event. Capacity N must be a positive integer (V-SLOT-1). |

### Entity Transformation Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| SPLIT | `SPLIT(EntityType, N, QueueName)` | Creates N-1 clones of context entity; records the family lineage JOIN later consumes — pair with `JOIN(Queue, Target)` for fork/join | N-1 new entities added to entity pool | Omitting QueueName; forgetting to route the parent to the rendezvous queue (e.g. `["SPLIT(...)", "RELEASE(Server, SyncQueue)"]`) when a JOIN waits downstream |
| JOIN | `JOIN(QueueName, TargetQueue)` (both required) | Fork/join rendezvous: holds SPLIT-family members arriving in QueueName until the family is complete, then merges them into one survivor routed to TargetQueue. Completeness is lenient — members that went terminal (done/reneged) or vanished (balk/overflow) count as "never coming", so a lost branch degrades the join instead of deadlocking it. The ORIGINAL parent survives when present (keeping its arrivalTime and stage history, so sojourn spans the whole fork-join); otherwise the earliest-arrived member does | Merged members terminated with `endedBy: "JOIN"` and snapshotted onto `survivor.joined.children` (+ `lostMemberIds`); survivor queue-joins TargetQueue with standard capacity/balk semantics | Routing the survivor back into the rendezvous queue (use a distinct TargetQueue); re-SPLITting a clone — single-level families only; expecting it to consume non-split entities (they are never touched) |
| BATCH | `BATCH(QueueName, N)` or `BATCH(QueueName, Entity.attrName)` | Collects N entities into single batch entity | N-1 originals marked done; one batch replaces them | Using N < 2 |
| UNBATCH | `UNBATCH(QueueName)` | Splits batch entity back into constituents | Batch marked done; original entities restored | Using on non-batch entity |
| MATCH | `MATCH(TypeA, QueueA, TypeB, QueueB, QueueName)` | Pairs one entity from each queue into combined batch | Originals marked with _matchedInto; merged attrs = `{...A.attrs, ...B.attrs}` — QueueB overwrites QueueA on name collision | Queues must both have eligible entities; relying on attribute overwrite order without naming attrs distinctly |
| MATCH (compatible pair) | `MATCH(TypeA, QueueA, TypeB, QueueB, QueueName, "Entity.bloodType == Other.bloodType")` | Optional 6th argument: scans both queues for the first pair satisfying the predicate instead of always taking the front of each | Same as plain MATCH once a pair is found; `Entity.<attr>` is the QueueA candidate, `Other.<attr>` is the QueueB candidate | No compatible pair found → no-op, same as an empty queue; a malformed predicate is caught gracefully at runtime but flagged at design time (V66) |
| COSEIZE | `COSEIZE(QueueName, ServerType1[Skill1][:N1], ServerType2[Skill2][:N2], ...)` | Atomically seizes entity and multiple server types, optionally N of a type ("2 Nurses + 1 Doctor" is `COSEIZE(Q, Nurse:2, Doctor)`) | All servers set to busy; fails cleanly if any type's idle count is below its requested N | Partial seizure never occurs; a type may appear as only one arg — request more via `Type:N`, not by repeating the arg (rejected at runtime and flagged at design time, V38f); the completion Bound event must release all seized types together — use `COMPLETE()` (terminal) or `RELEASE_COSEIZED([...])` (continues, releases every server of each listed type regardless of quantity), never separate `RELEASE()` calls per type |

### State Manipulation Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| SET | `SET(varName, expr)` | Sets state variable to arithmetic expression result | Mutates state[varName] | Using undefined variable name |
| SET_ATTR | `SET_ATTR(attrName, expr)` | Sets context entity attribute to expression result | Mutates entity.attrs[attrName] | Attribute must exist on entity type |
| COST | `COST(expr)` | Adds expression result to cumulative cost total | Increments summary.totalCost and entity.__cost | Forgetting to set performance goal for cost |
| ROUND_ROBIN | `ROUND_ROBIN(varName, N)` | Advances a state variable through a 0..N-1 rotation, wrapping back to 0 | Mutates state[varName] to the next index | Forgetting to pair it with routing[] branches that compare the variable to each literal index; N must be a positive integer |

### Container Macros

| Macro | Syntax | Purpose | Side Effects | Common Mistakes |
|-------|--------|---------|--------------|-----------------|
| FILL | `FILL(containerId, expr)` | Adds quantity to container | Updates container level, clamped to capacity | containerId must match declared container id |
| DRAIN | `DRAIN(containerId, expr)` | Removes quantity from container | Updates container level, clamped to zero | No-op if level < amount (does not go negative) |
| DRAIN_PARTIAL | `DRAIN_PARTIAL(containerId, expr)` or `DRAIN_PARTIAL(containerId, expr, shortfallContainerId)` | Removes `min(level, amount)`; when a shortfall container is named, adds the part that could not be drawn to it (clamped to its capacity) | Updates one or both container levels | Naming the same container as source and shortfall, an undeclared container, or a non-positive amount (V27) |

**ASSIGN that finds no match does nothing:** if an ASSIGN's condition is true but no waiting entity can be paired with an idle server (for example every idle unit lacks the waiting entities' skill), the firing changes nothing, schedules nothing and is not counted in activity throughput.

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

### Holding a Resource Across Stages

An entity can keep one resource while it passes through later stages — a tanker keeps its VLCC through a chokepoint and the voyage: `COSEIZE(Loading Queue, Berth, VLCC)` → `RELEASE_COSEIZED([Berth], Hormuz Queue)` (frees only the berth) → `ASSIGN(Hormuz Queue, Lane)` → `RELEASE(Lane, Voyage Queue)` → `DELAY(Voyage Queue)` → `RELEASE(VLCC, Asia Crude Queue)`. Turn on **Pass entity context** on every completion schedule in the chain.

- A failure or preemption of one resource interrupts only the stage it belongs to (resources seized together by one ASSIGN/COSEIZE): if the lane fails, the transit is re-queued and the tanker keeps its VLCC.
- If the carried resource itself fails or is preempted, the entity loses it but continues its current stage; the later RELEASE of it simply routes the entity onward.

### Preemptive Priority

To let an urgent case take a resource from a less urgent one, give its Conditional event the effect `ASSIGN(UrgentQueue, Doctor, PREEMPT, PRIORITY(priority))` and the condition `queue(UrgentQueue).length > 0`. In the effect builder: ASSIGN → tick **May interrupt a lower-priority job (PREEMPT)**.

- An idle resource is used first. Otherwise the resource serving the lowest-ranked entity is interrupted, but only if that entity ranks strictly below the waiting one, and it goes straight to the waiting entity.
- Rank: lower value = more urgent. It comes from the queue's PRIORITY discipline, or the **Rank by** attribute. Every entity type that can hold the resource needs that numeric attribute (e.g. trauma 0, patients 1–5). Equal rank never interrupts.
- The interrupted entity re-queues and, by default, resumes with its remaining time. **Interrupted job** can instead restart its full time, get a new sampled time, or go to another queue (`DROP:Queue`). `MAX:n` limits how often one entity can be interrupted; `MINSERVICE:t` leaves an entity that has had less than t of service alone.
- No counter state variable or separate PREEMPT event is needed. Plain `PREEMPT(Type)` still works, but it interrupts whichever busy resource it finds first.
- See the **Priority ED with Balking** template.

### Turnaround After Release

Some resources need time away after each job before they can take the next one: a tanker sailing back empty after discharging, an ambulance returning to base, an aircraft turnaround. Tick **Unavailable for a time after each release** on the server type (Entity Types → Turnaround after release) and set the turnaround distribution (`turnaroundDist` / `turnaroundDistParams`).

- When RELEASE, RELEASE_COSEIZED, COMPLETE or FINISH frees the resource, the entity moves on at once; the resource stays unavailable for the sampled time, then becomes idle and waiting work can take it.
- It does not apply when work is cut short (PREEMPT, a failure, a shift change). A failure during turnaround ends it; after repair the resource is idle.
- Results: utilisation includes turnaround time; each resource tile also shows the split ("X% with an entity · Y% in turnaround"), and `perResource` reports `turnaroundTime`, `turnaroundFraction`, `busyUtilisation` and `turnaroundCount`.
- Use this instead of SPLITting a clone entity to carry the return leg, which inflates served counts.

---

## Distributions

Parameter values must be strings (e.g., "5" not 5).

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
| Piecewise | `{ periods: [{ startTime, dist, distParams }, ...], cycleLength? }` | First period at time 0; sorted ascending. Optional `cycleLength` wraps the clock so the periods repeat (e.g. 10080 = one week); it must be positive (V71) and every startTime must be below it (V72) | Arrival rates changing at breakpoints; a repeating daily or weekly pattern |
| SchedulePattern | `{ schedulePattern: { type: "weekly", mode: "absolute", periods: [{ dayOfWeek, start, end, capacity }], defaultCapacity } }` | Requires the model epoch; each period's `capacity` is read as **arrivals per hour** (a number ≥ 0, V73; 0 means closed, V74 warning); multiplier mode is not supported for arrivals (V75); date exceptions are ignored | Arrival rates drawn on the same weekly grid used for staff schedules |
| Schedule | `{ times: [N, N, ...] }` or `{ rows: [{ time, attrs }, ...] }` | Times ascending; exhausts and stops | Planned arrivals from timetable or CSV import |

### From-Data Distributions

| Distribution | Parameters | Constraints | Typical Use |
|-------------|------------|-------------|-------------|
| Empirical | `{ values: [N, N, ...] }` | Non-empty array | Sample-driven; draws uniformly from provided values |
| EntityAttr | `{ attr: "attrName" }` | Attribute must exist on entity | Duration from entity attribute (e.g., imported plan) |
| ServerAttr | `{ attr: "attrName" }` | Attribute must exist on server | Duration from assigned server attribute |
| Distance | `{ from, to, speedAttr, speedSource: "entity"\|"server" }` | `from`/`to` must be declared queues; `speedSource` must be "entity" or "server" | Travel time = declared distance (Model Data tab) ÷ speed attribute. Only meaningful on a Conditional event's `cSchedules`, after an `ASSIGN`. |

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

### Run Tab Layout and Controls

The Run tab has three views: **Run**, **Experiments** and **Studies**. On the **Run** view the toolbar holds, in order: the run readiness status, **Check Model** (structural checks), **⟳ Reset**, **Step**, **Auto Run** (**Stop Auto** while running), the speed control, **⏸ Pause when…**, **⚡ Batch Run**, **View Results →** (after a run), **Export ▾**, then the run settings summary, **🎛 Adjust parameters** and **⚙ Setup**. During a batch or single run, **Cancel Batch** / **Cancel Run** appear. If the model has more than one named timetable, a **Timetable:** picker appears.

**⚙ Setup** opens **Run setup** (values are saved as the model's experiment defaults):

| Field in the UI | Meaning |
|-----------------|---------|
| Run name | Label for the saved run (placeholder "Baseline") |
| Ignore early results | Warm-up period. **Suggest a value** (after a batch run) runs Welch's method and offers **Use this suggestion** |
| Number of runs | Replications |
| Random starting point | Seed; **Randomise** picks a new one |
| When should the run stop? | **Run for** a run duration, or **Stop when this becomes true** (a condition) |
| Extra options | **Show entity movement (Step and Auto Run)**; **Keep chart data during the run**; **Force event trace (debug, slower)** (only when a large run switched the trace off); **Let in-flight entities complete** (the purge period) |
| Archive detail | **Minimal**, **Standard** or **Full** — how much of each saved run is stored (`resultDetailLevel`); Full keeps the full event log |

**Bottom panel tabs:** **Step Log** (filter by phase: All phases, B-Events, C-Events, A-phase, Warmup, Errors; a debug-detail toggle), **Entity Details** (entity tracking, attributes and stage history), **Resources** (per server, filter by busy/failed/suspended/idle), **Charts**, **Live Metrics** (collapsible Queues, Servers, Journey Outcomes, Journey Paths, Sections, B-Events, C-Events), **State Variables** (current values and a history of each change with the event that made it; single runs only) and **Future Events** (the FEL, first 100 rows).

### Pause When… (Auto Run)

**⏸ Pause when…** (next to the speed control, and in the compact run bar) stops Auto Run when a condition becomes true. **+ Add condition**, then choose:

- **An entity enters a queue** (pick the queue);
- **A queue reaches a length** (pick the queue and a number N: N or more waiting);
- **Simulation time reaches** a value.

Each condition has a tick box to turn it on or off; **Clear all** removes them. The button shows how many are active, e.g. "⏸ Pause when… (2)". Conditions are checked after every event cycle; Auto Run stops on the first that becomes true and a banner says which and when. Press **Auto Run** to carry on. A condition already true when Auto Run starts waits for the next change: a queue-length condition fires again only after the queue drops below N and climbs back; a time condition fires once. Conditions are stored in this browser per model (`flow.pauseRules.<modelId>`), are not part of the model, and do not affect Step or Batch Run.

### Run Inspector (docked)

Clicking a node on the Run canvas opens its inspector **docked beside the canvas**, like the Draw inspector — it never covers the page header or the Simulation Assistant. Drag its left edge to resize (or focus the edge and use ←/→; double-click resets); the width is remembered. On phone-sized screens it overlays the right of the canvas.

- **Queue:** summary cards (waiting, capacity, longest wait, average wait), a fill bar when the queue has a capacity, and one card per waiting entity.
- **Delay activity:** summary cards (how many are held, longest and average time held) and one card per held entity.
- **Resourced activity:** utilisation bar and one card per server, with the entity it is serving.
- **Section card** (in the Sections view): the section's description and its live numbers.
- Before the run starts, an activity's inspector says there is no live data yet.
- Underlined entity ids open that entity in the bottom panel's **Entity Details** tab.

### Run Canvas Readouts

- **Switches**: state variables shown as pills — 0 = OFF, 1 = ON, any other number as its value. A pill flashes when it changes. Hide a variable from it with **Show on run canvas** in Model Data → State Variables. Activities whose routing depends on a switch carry a badge naming it.
- **Preemption**: an activity whose jobs were interrupted shows "N interrupted" and a running preempt count.
- **Containers**: the container node shows a fill gauge and a 0–capacity level trend.
- **Sections**: the **Detail | Sections** switch at the top left (see Sections below); **Outlines** toggles section outlines in the Detail view. Loops are drawn as dashed amber lines labelled with the activity and its loop limit.

### Run Readiness and the Run Canvas

**Run readiness** collapses to one line by default ("Ready to run" or "Needs attention" plus an advisory count when there are any); click **Details ▸** to see the full breakdown (blocking issues, advisories, and the workload estimate). A genuine blocking issue always shows full detail automatically — it never collapses to a one-line "Blocked" with no explanation.

**C-event scan limit (per replication).** Each plan has a limit on C-event condition checks per replication (Free 50,000 · Standard 250,000 · Pro 1,000,000). The workload estimate counts B-events per replication — arrivals, one completion per activity each entity actually visits along its route (probabilistic branches weighted, conditional branches taking the longest path), and any other self-repeating B-event such as a clock tick or a daily demand top-up — and multiplies by the scans each B-event costs: one per C-event by default (1.5 per C-event below 8 C-events), or the ratio measured on this model's last run once you have run it. Because it is an estimate:
- **Under the limit** — runs normally (a warning at 80% or more).
- **Between 1× and 2× the limit** — runs, with a warning and a confirmation.
- **More than 2× the limit** — blocked (RA7). The message shows the estimate and its basis.
- **At run time**, any replication that reaches 2× the limit stops early and is flagged (Key Finding H16), whatever the estimate said.

**Canvas scale parity with Draw:** the Run canvas opens at the same pan and zoom you last used on the Draw canvas for this model (both canvases share coordinates), rather than always zooming out to fit everything. First-time viewing of a model (or opening it on a different browser/device, since this is a local per-browser setting) falls back to fitting the whole model.

**Maximised canvas:** the Run canvas fills the available window height by default and recalculates on resize/rotation; drag its bottom edge to set a manual height instead, which is then remembered. The bottom panel stays collapsed by default so the canvas gets the space; expanding it is remembered for next time.

**Watching entities move:** entity animation (coloured dots travelling the edges — arrivals, seizes, routing hops including probabilistic branches, and completions) runs during **Step** and **Auto Run** only. **⚡ Batch Run** computes replications at full speed without animation. The "Show entity movement (Step and Auto Run)" checkbox in **⚙ Setup → Extra options** controls it and the choice is remembered; it defaults off when the operating system requests reduced motion.

**Live node visual language:** Activity nodes flash a start-of-service pulse and hold a persistent border colour for busy/idle/failed state, so status is visible even between animation frames. Source nodes show a running arrival count (mirroring Sink's "served" count). Queue nodes show a colour-coded label per entity type waiting and a simplified "N waiting" caption. Balking and reneging are animated rather than silent: declined/abandoning entities render as distinctly coloured tokens, the destination Sink shows running "N balked"/"N reneged" totals, and the Queue node pulses when a balk or renege occurs. All Run canvas node types render at a fixed height; rows beyond the first three collapse to a "+N more" indicator instead of growing the node.

**Adjust parameters (quick, ad-hoc run):** the **🎛 Adjust parameters** button next to the run settings summary opens the same searchable, grouped parameter browser used by the Business view curation and Scenario manager (`ParamBrowserPanel`) — but over the full set of sweepable parameters, not an owner-curated subset. Pick a parameter, type a new value, and it patches the model for every run mode (Step, Auto Run, Batch Run) via the same `effectiveModel`/`applySweepValues` mechanism a loaded Experiment already used — no Experiment or Scenario has to exist first. Changes are ad-hoc: they reset when you switch models or reload the page, and are never written to the database. **Reset all** clears them immediately; **Save as Experiment…** carries the current overrides and run settings into a new saved Experiment, if you decide to keep them. If a saved Experiment is also loaded, an ad-hoc change to the same parameter takes priority over the loaded value.

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

**Behaviour:** Integer seed set in **⚙ Setup → Random starting point** before running. Stored with the run record so any past run can be exactly reproduced.

### PRNG Stream Isolation (Sprint 84)

**Purpose:** Ensure adding or removing a process does not disturb the random streams of other processes.

**Behaviour:** Each generator process (arrival Bound event, service Conditional event, shift schedule) gets an independent PRNG stream derived from `baseSeed + replicationIndex` via `deriveSubSeed(seed, processIndex)`. Modifying one process (e.g., adding a new arrival source) leaves all other streams unchanged — results remain reproducible and statistically comparable across model edits.

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

**UI:** **⚙ Setup → Extra options → Let in-flight entities complete**.

**Purpose:** A run-down phase after the run length — for end-of-day or end-of-shift questions such as "how long until everyone already here is seen?"

**Behaviour:** When the clock reaches the run length, new arrivals stop but the simulation carries on so entities already in the system can finish. It ends when the system is empty or after an extra time limit (by default twice the run length, at most 5,000 time units). Results record that the purge period was used (`purgePeriodUsed`).

### Shift-change Behavior (Sprint 84)

**Purpose:** Controls what happens when a shift boundary fires while a server is mid-service.

| Mode | Behaviour |
|------|-----------|
| Delay | Server finishes current service before applying the shift change |
| Preempt | Service interrupted immediately; entity re-queues with remaining service time preserved |
| Suspend | Service paused at shift boundary; resumes automatically when the next shift starts |

### Studies (Parametric Sweeps and Other Plans)

**Access:** Run → **Studies**. Every completed study is saved automatically when signed in and listed under **Past studies** (**Load** to reopen it); signed out, results last only for the session.

| Mode | What it does |
|------|-------------|
| **1D Sweep** | One parameter varied across a range (min, max, step). Full replication batch at each point; line chart |
| **2D Sweep** | Two parameters varied across a grid (capped at 50 points). Heatmap with feasibility colouring (green = all goals met, red = at least one goal violated) |
| **Sampled** | Several parameters, each with a range, sampled at a chosen number of points; a results table plus **Sensitivity — which parameters matter most** |
| **Sequential** | **Seed from** a saved Experiment or a point from an earlier Study, then narrow the ranges around it |

Each study has a **Study name**, an **Objective** KPI and a **Direction** (minimise or maximise). Two points can be compared as scenarios (**Scenario comparison**, Cell A vs Cell B in 2D). On Sampled and Sequential results, **Promote to Experiment** turns a point into a saved Experiment. The Simulation Assistant can propose a study; it loads here with **AI proposal loaded** and its rationale.

### Experiments

**Access:** Run → **Experiments** ("Saved run configurations to replay or compare"). **+ New Experiment** takes a **Name**, **Description** and **Parameter overrides**. Each saved experiment has **Load** (apply it to the Run view), **Run**, **Edit** and **Clone**. **Save as Experiment…** in **🎛 Adjust parameters** seeds a new one from the current ad-hoc changes. Requires sign-in.

### Named Scenarios (Scenario Manager)

**Purpose:** Compare a handful of discrete alternatives ("current staffing" vs. "double staffing" vs. "second counter") rather than sweeping a range.

**Access:** Model **Overview** tab → **Named Scenarios** panel. Requires sign-in.

**Creating:** Click **+ New Scenario**, give it a name, add one or more parameter changes via **+ Choose parameter** — a searchable browser grouped by category, same parameter list as sweeps; picking a parameter pre-fills its current value ready to override. Optionally set a seed and replication count. Scenarios store only the parameter changes, so they always run against the model's latest version.

**Comparing:** Tick 2+ saved scenarios (the **Base model (current parameters)** row can be one of them) and click **Compare selected**. Each group runs fresh in the browser:

- **Exactly 2 groups** → paired-t comparison table (mean difference with confidence interval per KPI).
- **3+ groups** → one-way ANOVA significance test plus Tukey HSD pairwise comparisons, showing which specific pairs differ.

**Limits:** Comparison runs are computed on demand and not saved to the run history. Models using named/shared schedules (ADR-016) may not reflect shared-schedule timing in scenario runs.

---

## Results and KPIs

### Summary Metrics

| Metric | Meaning | Interpret High | Interpret Low |
|--------|---------|----------------|---------------|
| avgWait | Mean waiting time across all queues (post-warmup). Service received before an interruption counts as service, not wait | Congestion, insufficient capacity | Adequate capacity or low utilisation |
| avgSvc | Mean service time (all service intervals when service was interrupted) | Complex service or slow servers | Fast service or simple tasks |
| avgSojourn | Mean end-to-end time (wait + service, served + reneged only) | System-wide delays | Efficient flow |
| avgTimeInSystem | Weighted mean time in system (all entities, incl. in-progress at 0.5 weight) | System-wide delays including unfinished work | Efficient flow |
| servedRatio | Service completion rate (served / total, 0–1) | Most entities complete service | Many entities still in system or reneging |
| served | Count of entities completing service | High throughput | Low throughput or insufficient run time |
| reneged | Count of entities abandoning before service | Impatience or excessive waits | Patient customers or fast service |
| balked | Count of entities declining to join a queue on arrival (never entered) | Undersized capacity or an aggressive balk condition/probability | Adequate capacity or a lenient/absent balk rule |
| totalCost | Cumulative cost from COST macro | High operational cost | Low cost (may indicate under-investment) |
| costPerServed | totalCost / served | High cost per unit served | Efficient cost utilisation |
| avgWIP | Time-average work-in-progress (Little's Law integral) | High inventory or queue buildup | Lean operation |
| servedQuantity | Sum of the quantity attribute over served entities (only when a type sets `quantityAttr`) | High volume delivered | Low volume delivered |
| quantityInSystem | Sum of the quantity attribute over entities still waiting or in service at the end | Large volume stuck in the system | Little left in progress |

**Batch runs:** entity counts (served, reneged, balked) are summed across replications and shown per run; average-type metrics are means. Quantities are the **mean per replication** (labelled `quantityAggregation: "mean-of-replications"`).

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

### Quantities

Shown when an entity type sets a quantity attribute (see Entity Types). Volume-weighted versions of the counts, so results stay meaningful in barrels, tonnes, etc. when entities differ in size:

| Where | Field |
|-------|-------|
| Summary cards | Quantity served, Quantity in system at end (`summary.servedQuantity`, `summary.quantityInSystem`; also `renegedQuantity`, `balkedQuantity`) |
| Per queue | Quantity through each queue (`summary.quantityThroughByQueue`) — credited per completed post-warm-up service |
| Per resource | Quantity processed (`perResource[].quantityProcessed`), shown on each resource tile |
| Per outcome / journey | `outcomes[].quantity`, `journeyQuantities`, `queueJourneyQuantities` alongside the counts |
| Time series | `quantityInSystem` and `byQueue[].quantityWaiting` at every sample |

Exported in the JSON, the workbook's **Quantities** sheet, the LLM export pack and AI analysis.

### Activity Throughput

Per-activity cards showing how many **entities each activity started** (`activityCounts[].count`), plus how many times the Conditional event fired (`firings`). These differ for DELAY: one DELAY firing starts every entity waiting in its queue, so a DELAY that released 20 lots at once counts 20 entities from 1 firing. For ASSIGN-type activities each firing starts one entity, so the two are equal. Complements the queue- and resource-level metrics above by attributing throughput to the process step itself.

### Container Levels

Each container reports **min, avg, max and final** level over the post-warm-up period (container statistics restart when warm-up ends, like every other statistic). For a multi-replication run all four are the **mean across replications** (a typical run), and the **lowest / highest level any single replication reached** are shown separately — so a container goal is judged against a typical replication, not the worst one.

**Level over time:** the time series records each container's level at every sample (`byContainer`) — the actual level at that moment, not an average over the interval, so a stock hitting zero shows as a dip to zero. The Results tab charts it per container with **trough** (lowest level and when), peak, final and point-count tiles, and the Run tab's Charts panel shows it live. Exported in the JSON and the workbook's **Container Levels Over Time** sheet. For multi-replication runs each point is the mean across replications, resampled to 150 points, so a very brief zero between points may not show (the min figure is still exact).

**Running dry:** Key Findings flag a container that ran empty (H14) or is being drawn down (H15); the LLM pack and AI analysis get each container's trough and time, first time empty, number of times emptied, % of the run spent empty and a short level profile.

### What a Results File Records

- **Parameter overrides** — any parameter values the run used instead of the model's own (from a loaded experiment or the Run tab's **Adjust parameters**), with model value, value used and source (`_experiment_config.parameterOverrides`). The Results tab shows a note naming them; a baseline run records an empty list.
- **Model snapshot** — the model actually simulated (overrides applied), with its `experimentDefaults` set to the run's own replications, run length, warm-up, seed and termination.
- **Goal outcomes** — pass/fail per goal (`goalOutcomes`).
- **Time series** — queue depth and wait, resource use, WIP, throughput, container levels (`byContainer`) and, with a quantity attribute, quantities.

### Interruptions

Per-resource count of preemption events (PREEMPT, `ASSIGN … PREEMPT`, FAIL, breakdowns and shift closes that cut off in-progress service). Each entity's stage record also carries `interruptions` and `serviceSegments` (the service intervals before each interruption). An interrupted entity's original completion never fires, and it resumes with exactly its remaining time. In the Run tab's trace (Log, expand details), each preemption shows who was interrupted and for whom, their ranks, what the interrupted entity gets (remaining time, restart, new duration or another queue) and why it was chosen. A high count alongside a low `scheduleAdherence` or high `starvationPct` usually points to a failure/MTBF-MTTR model or a higher-priority job repeatedly bumping lower-priority work — see Server Failure Model above.

### Queue Rejections

Balked and blocked entity counts, reported per queue independently of the general capacity-blocking checks in the Results Health Flags. Shows where in the topology entities are declining to join (balking) or being turned away at capacity (blocking), which the top-level `balked`/`reneged` summary metrics alone don't localise.

### Skill Utilisation

Per-skill utilisation stats, aggregated correctly across multi-replication batch runs. Shows how busy each named skill is across every server instance that offers it, independent of any single server's own utilisation figure — useful for spotting a scarce skill that is the true bottleneck even when overall resource utilisation looks moderate.

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
| V6 | schedules[].eventId or cSchedules[].eventId references non-existent Bound event | Create missing Bound event or correct ID |
| V8 | No ARRIVE source AND no COMPLETE/RENEGE sink | Add at least one arrival and one departure |
| V9 | Conditional event condition references undefined queue | Create queue or correct name |
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
| V27 | FILL/DRAIN/DRAIN_PARTIAL, or ASSIGN's optional ContainerId:amount clause, references an undeclared container; DRAIN_PARTIAL uses the same container as source and shortfall, or a non-positive amount | Create container or correct id; use two different containers; use a positive amount |
| V28 | Model epoch is not a valid ISO 8601 datetime | Correct the epoch format |
| V30 | Bound event/Conditional event routes to exit (null queue) with no COMPLETE(), RENEGE(ctx), or RELEASE() effect | Add a terminal lifecycle effect so entities are counted as served |
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
| V47 | DELAY references an unknown queue, or its completion Bound event has only an ARRIVE effect (entity left stuck "serving" forever) | Correct the queue name; add COMPLETE(), RELEASE(), or routing to the completion Bound event |
| V50 | Weekly schedule pattern requires a startOfWeek epoch | Set a `startOfWeek` epoch in Time & Schedules (only the day-of-week matters) |
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
| V61 | `defaultQueueName` set with no `routing[]`/`probabilisticRouting[]` and nothing else resolves the entity | Add a routing table, or use `probabilisticRouting: [{probability: 1.0, queueName: '...'}]` for a single fixed destination |
| V63 | `CANCEL(EventName)` references an event name that doesn't match any Bound Event or Conditional Event | Correct the event name, or add the missing event |
| V64 | `ROUND_ROBIN(StateVar, N)`'s N is not a positive integer | Set N to a positive integer ≥ 1 |
| V65 | `skillProfiles[].priority`, if present, must be numeric | Set priority to a number, or remove it |
| V66 | `MATCH`'s compatibility predicate (6th argument) fails to parse or evaluate | Fix the predicate syntax — check for unknown variable namespaces or malformed operators |
| V67 | `parentTypeId` is self-referential, references an unknown entity type, references a different-role entity type, or creates a circular inheritance chain | Point `parentTypeId` at a real entity type of the same role, with no cycle |
| V68 | An entry in `requiredSequence` doesn't match any declared queue (blocking), or the model's routing sends this entity type backward through the declared stages (warning — intentional rework loops can be ignored) | Correct the queue name; or review the routing edge and confirm the backward jump is intentional |
| V69 | A `distances[]` entry has an empty/duplicate id, `fromQueue`/`toQueue` doesn't match a declared queue or the two are the same, a non-positive `distance`, or a duplicate entry for the same undirected pair | Fix the id, queue names, distance value, or remove the duplicate pair |
| V70 | A `Distance`-typed schedule has an invalid `from`/`to`/`speedSource`/`speedAttr` (blocking), or references a pair/attribute that isn't declared (warning — falls back to a duration of 0) | Correct the distParams; or declare the missing distance/attribute |
| V71 | Piecewise `cycleLength` is set but is not a positive number | Use a positive number (e.g. 10080 for one week in minutes), or clear it |
| V72 | A Piecewise period's `startTime` is not less than `cycleLength` | That period would never be reached — lower its start time or raise `cycleLength` |
| V73 | A SchedulePattern arrival period's rate is not a number ≥ 0 | Enter arrivals per hour as a number ≥ 0 |
| V75 | A SchedulePattern arrival distribution uses multiplier mode | Use absolute arrival rates for arrivals |
| V77 | `ASSIGN(..., SCAN)` has no skill argument, or `SCAN:N` is not a positive whole number | Put the skill (`"Skill"` or `Entity.attr`) before SCAN; use e.g. `SCAN:10` |
| V78 | An entity type's `quantityAttr` names an attribute it doesn't have, a non-number attribute, or is set on a server type | Pick a number attribute of that customer type, or clear the quantity attribute |
| V80 | Turnaround time set on a non-server type, only one of `turnaroundDist`/`turnaroundDistParams` set, a non-sampling distribution, or numeric (non-string) parameter values | Set turnaround only on resources, with both fields and string parameters such as `{ "value": "20" }` |

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
| V38c | Stacked separate RELEASE(Type) calls for co-seized types | Only the first release actually happens; use RELEASE_COSEIZED([...]) instead |
| V38d | RELEASE_COSEIZED([...]) lists a type not in the scheduling COSEIZE(...) | Fails at runtime with "no claimed ... server" |
| V38e | RELEASE_COSEIZE(...) — missing the trailing "D" | Not a real macro; silently no-ops as an "Unknown effect", servers never release |
| V38f | COSEIZE(...) lists the same server type as more than one arg | Fails at runtime with "duplicate server type"; use `Type:N` instead of repeating the arg |
| V40 | SET_ATTR targets an attribute not declared on any entity class | Declare the attribute, or correct the name |
| V42 | SPT discipline but entity class has no serviceTime/processingTime attribute | Discipline falls back to FIFO |
| V43 | EDD discipline but entity class has no dueDate attribute | Discipline falls back to FIFO |
| V44 | SET_ATTR has no preceding ARRIVE/ASSIGN/COSEIZE | Write will be skipped at runtime |
| V47 | DELAY's cSchedule doesn't have "Pass entity context" enabled, or samples the delay from "Server attribute" | Falls back to a fixed delay of 1 |
| V62 | A server entity type is named `ANY` | Collides with the reserved `ASSIGN(..., ANY, ...)` cross-type-pooling sentinel — rename the server type |
| V-SKILL-2 (ANY variant) | `ASSIGN(Q, ANY, "Skill")` references a skill no registered server type actually has | The cross-type pool is guaranteed empty — add the skill to a server type, or correct the skill name |
| V76 | A condition compares a numeric value with non-numeric text that is not a state variable or dynamic reference (e.g. `clock >= closureStrat`) | The clause is always false — fix the spelling, or declare the name as a state variable |
| V79 | A `quantityAttr` attribute has no default value and no distribution | Every entity's quantity is 0 unless an effect sets it |
| V74 | A SchedulePattern arrival period has a rate of 0 | No arrivals during that window (fine for a closed period) |
| V81 | `ASSIGN(…, PREEMPT, …)` with an unknown option, a queue that doesn't rank entities (FIFO/LIFO, no `PRIORITY(attr)`), a rank attribute the entity type lacks, or a `DROP:` queue that doesn't exist; or a Conditional event that fires `PREEMPT(Type)` without checking `idle(Type)` | The preemption never happens, or it interrupts a job while a resource is idle |
| V82 | An element is in more than one section | Keep it in one section so section views and results stay unambiguous (Define → Sections; ticking it in one section removes it from the other) |
| V-BACK-01 | A backing link points at a missing record, element or parameter | Evidence → Coverage → **Remove broken links**, or reattach |
| V-BACK-02 | An evidence or assumption record backs nothing | Attach it, or delete it |
| V-BACK-03 | Evidence was last verified more than 12 months ago | Re-check the source and update **Last verified** |
| V-BACK-04 | A contested assumption sets an arrival or capacity parameter | Find evidence, or test the result's sensitivity to it |
| V-BACK-05 | Arrival or capacity parameters have no evidence or assumption (one warning listing them; only when the model has any records) | Attach evidence or an assumption on the Evidence tab |
| W-CAP-01 | Two or more Conditional events SEIZE/ASSIGN the same server type | Results may be sensitive to Conditional event priority ordering |
| W-CAP-02 | Bound event schedule has an Exponential mean interval < 0.001 | simmodlr models discrete entities — consider SD Studio for continuous flow |

---

## Results Health Flags

Deterministic, rule-based flags computed from simulation results — no LLM involved. They power the
green/amber/red health indicator on the Results screen. Severity is `critical` or `warning`; flags
are listed worst-first.

### Post-Run Flags (computed once, after the run completes)

| Code | Condition | Severity | Suggestion |
|------|-----------|----------|------------|
| H1 | Resource utilisation ≥85%/≥90%/≥95% | warning / critical / critical | Add capacity or reduce arrival rate; ≥90% means the queue cannot recover without more capacity |
| H2 | A queue's late-run (last 20%) mean waiting count > 1.5× its early-run (first 20%) mean, and >2 — measured after warm-up | warning | Check upstream constraints — the queue is growing faster than it drains; the run may not be reaching steady state |
| H3 | ≥15%/≥20% of arrivals still in system (waiting or serving) at end of run | warning / critical | Identify and relieve capacity constraints; results may be unreliable with a large unfinished backlog |
| H4 | A capacity-limited queue blocked/overflowed ≥10% of arrivals (critical) or any amount (warning); or an unbounded queue peaked >50 waiting (warning) | warning / critical | Increase queue capacity or add an overflow route to handle peak demand |
| H5 | Resource starved >20% of its server time — idle servers while a queue it serves (through a plain `ASSIGN(Queue, ServerType)`) had work waiting. Not tracked for types served only by skill-filtered or `ANY` assigns | warning | Check routing rules or entity-to-server assignment — servers are idle when work is available |
| H6 | Entities balked (declined to join a queue) — ≥10% of arrivals is critical, any amount is warning | warning / critical | Review the queue's balk probability/condition if this is unintended |
| H7 | Less than 50% of arrivals completed (with ≥10 arrivals) | critical | Reduce arrival rate or add capacity — the system is severely overwhelmed |
| H8 | Little's Law check: measured time in system differs by >5% from average number in system ÷ throughput | warning | Increase run duration — the run may be too short to reach steady state |
| H9 | A resource's longest continuous stretch of starvation (idle servers while work it serves was waiting) exceeded 2× the mean service time | warning | Check upstream delivery to this resource — work isn't reaching it, suggesting a routing or blocking issue |
| H10 | ≥90% of a resource's servers stayed busy for at least 10× the mean service time (never less than 15 time units), after warm-up. For a batch run the figure is the average of each run's longest stretch | warning | Add capacity or throttle arrivals — sustained high utilisation means the queue will not recover naturally |
| H11 | A resource was idle (0% busy, after warm-up) for longer than 5× the mean time between arrivals | warning | Check entity routing and Bound event destinations — the resource may be unreachable or blocked by an upstream queue |
| H12 | A resource with failures was available <80% (critical) or <90% (warning) of the run | warning / critical | Review MTBF/MTTR or add redundant capacity |
| H13 | The run hit the internal cycle limit before its intended end | critical | Re-run; if it recurs, look for a runaway Conditional event chain |
| H14 | A container that held stock ran empty — reports how many times, % of the run spent empty and when it first happened (mean level across replications for batch runs) | warning | If activities DRAIN from it, demand went unmet while it was empty — raise the initial level, FILL faster or more, or add capacity |
| H15 | A container's level is trending down (late-run mean < half the early-run mean) without having run empty yet | warning | A longer run may run it dry — check the balance of FILL and DRAIN |
| H17 | Chart/time-series data was not collected because the run was estimated to be large | warning | Numbers are unaffected; only the time-series charts are unavailable |
| H16 | A replication hit the C-event scan limit (2× the plan's per-replication limit) and stopped early — batch results say how many replications | critical | Shorten the run, reduce arrivals, or merge C-events that wait on the same queue (e.g. one queue per station with `ASSIGN … SCAN`) |

### Live Flags (computed per-step, during execution)

Live flags mirror the post-run flags above but fire in real time, without the post-run statistical
context (no suggestion text is shown live).

| Code | Mirrors | Condition |
|------|---------|-----------|
| L1 | H1 | Resource utilisation ≥85%/≥90%/≥95% |
| L2 | H5 | Resource idle with work waiting >20% of its server time so far |
| L3 | H4 | Queue has rejected (blocked/overflowed) arrivals at capacity so far |
| L4 | H9 | Resource idle with work waiting, continuously, beyond 2× mean service time |
| L5 | H10 | ≥90% of a resource's servers busy for at least 10× the mean service time (min 15 time units) |
| L6 | H11 | Resource at 0% utilisation while arrivals are active |
| L7 | H6 | Entities have balked at a queue so far |

---

## Skills & Attribute-Based Routing

### Defining and using server skills

1. **Register skills** in the Model Data tab's Skills section. Type a skill name and press Enter.
2. **Assign to server types** in Entity Types tab. Expand a server type, tick skills in the Skills panel.
3. **Use in Conditional Events** via ASSIGN with quoted skill: `ASSIGN(Queue, Doctor, "Surgery")` — only doctors with Surgery skill are considered.
4. **Pool across server types** — use `ASSIGN(Queue, ANY, "Surgery")` instead of a fixed server type to seize any idle server, of any type, that has the skill. Requires a skill argument.
5. **Mixed skills in one queue** — when one queue holds entities needing different skills (e.g. sour and sweet crude at one refinery hub), add `SCAN`: `ASSIGN(Hub Crude Queue, Hub Unit, Entity.grade, SCAN)`. Without it a sour cargo at the front blocks the sweet cargoes behind it whenever only sweet units are idle; with it the first entity that has an idle matching unit is served. This replaces one-queue-per-grade designs (3 hubs × 2 grades = 6 queues and 6 Conditional events become 3 of each). Use per-instance skill profiles (below) for a unit type whose units have different skills.

### Per-instance server skills

For server pools where individual servers have different skill sets (e.g., 4 doctors: 2 surgeons, 1 consultant, 1 radiologist):

1. **Define the skill pool** in Shared mode — check all skills the type could have.
2. **Switch to Per-instance mode** — radio toggle below the checkboxes.
3. **Add profiles** — each profile has a name, a subset of skills, and either:
   - **Count** — exactly N servers get this profile, assigned in order to servers 0, 1, ... N-1
   - **Weight** (0-100%) — each server independently gets this profile with the given probability
4. **Profiles are non-exclusive** — a server matches multiple profiles, final skills = union.
5. **Set a Priority** (optional, default 0) — when `ASSIGN` has multiple idle servers matching a skill, it prefers the one from the higher-priority profile (e.g. a Specialist profile at priority 10 is picked over a Generalist at priority 1, regardless of who's been idle longer). Ties still resolve FIFO by idle-since time. Applies to both same-type and `ANY` cross-type ASSIGN.
6. **Check the counter** — count-based total must not exceed server count (V-SKILL-5).
7. **Switch back to Shared** to remove all profiles and revert to identical servers.

### Setting skill requirements on arrival (entity-side)

Instead of one Conditional Event per skill, use a single Conditional Event that reads the skill from the entity:

1. **Add a string attribute** to the customer entity type (e.g. `requiredSkill`), set valueType to String.
2. **Choose Weighted mode** in the attribute editor. Add weighted options: value + relative weight. Options can include **no requirement** (null), which means any idle server matches.
3. **The visual bar** always fills 100% width. Segments show proportions. Remainder = no requirement.
4. **Use in a Conditional event**: pick `ASSIGN(Queue, Server, Entity.requiredSkill)` from the effect dropdown. The engine reads each entity's attribute at runtime and filters servers accordingly.

### Schedule-based attribute overrides

In the Schedule Manager, view a schedule's detail. After CSV import, attribute columns appear next to time slots. Each cell is editable — type a value to override the entity type's default for that time slot. Delete a cell value to revert to the entity type default. This is useful for varying `requiredSkill`, `priority`, or `severity` by time of day.

### Categorical distribution for entity attributes

The **Categorical** distribution type does weighted random selection from a list of values. It is the only distribution that returns non-numeric values (strings, booleans, null). It is used exclusively for entity attributes — never for Bound event delays or service times. Configure it in the Attribute Editor by switching from Static to Weighted mode.

### Calendar-aware conditions

Use calendar variables in Conditional event conditions to restrict activities to specific times:

- `isWeekday` — boolean, true Monday-Friday
- `isWeekend` — boolean, true Saturday-Sunday
- `hourOfDay` — integer 0-23
- `dayOfWeek` — integer 0-6 (0=Sunday, 1=Monday, ..., 6=Saturday)

**Requires epoch:** Set the model's epoch in the Time & Schedules tab → "Real-world start date/time". Without epoch, calendar variables return defaults (isWeekday=true, hourOfDay=0).

**Example:** "Schedule appointments weekdays 9am-5pm only":
```
Condition: queue(BookingQueue).length >= 1 AND isWeekday AND hourOfDay >= 9 AND hourOfDay < 17
```

**Validation:** V-CAL-1 warns if calendar conditions are used without epoch set. V-CAL-2 warns if hourOfDay comparison value is outside 0-23.

### Slot booking pattern

Model periodic batch scheduling with DELAY capacity + a recurring timer Bound event + calendar conditions. **Conditions have no arithmetic evaluator** — `(clock - state.lastSlotTime) >= N` is not valid syntax (it throws `Unknown variable namespace in predicate` at runtime); use a timer + flag instead:

1. Create a state variable `slotReady` (initial 0)
2. Create a self-rescheduling Bound event that fires every `slotInterval` minutes with effect `SET(slotReady, 1)` (schedule it to re-fire itself, the same way an arrival Bound event self-reschedules)
3. Create a Conditional event with condition: `queue(Queue).length >= 1 AND isWeekday AND hourOfDay >= 9 AND hourOfDay < 17 AND slotReady == 1`
4. Effect: `DELAY(Queue, N)` + `SET(slotReady, 0)`

This drains up to N entities per firing, consumes the ready flag until the next timer tick, and only fires during business hours. Remaining entities wait for the next slot.

### Per-entity delay times

Use `EntityAttr` distribution in cSchedule to read delay duration from an entity attribute. Combined with `cSchedule[].when` predicates, different entity types get different delays:

```json
"cSchedules": [
  { "when": { "variable": "Entity.type", "operator": "==", "value": "General" },
    "eventId": "b_done", "dist": "Fixed", "distParams": { "value": "30" }, "useEntityCtx": true },
  { "when": { "variable": "Entity.type", "operator": "==", "value": "Specialist" },
    "eventId": "b_done", "dist": "Fixed", "distParams": { "value": "60" }, "useEntityCtx": true },
  { "eventId": "b_done", "dist": "Fixed", "distParams": { "value": "45" }, "useEntityCtx": true }
]
```

First-match semantics: engine evaluates `when` in order, uses first match. Last entry (no `when`) is fallback.

---

## Common Problems

### Comparing Two Queues (Shortest-Queue Routing)

**Goal:** Route an entity to whichever of two queues currently has fewer entities waiting, instead of a fixed destination.

**How:** In the Condition Builder, a number-type clause has a small "Number / Dynamic" toggle next to its value field. Switch it to **Dynamic** to compare against another `queue(...).length`, `idle(...).count`, `busy(...).count`, `container(...).level`, or `attr(...)` value instead of typing a fixed number. This works in Conditional event conditions, `routing[]` tables, `balkCondition`, and `cSchedules[].when`.

**Gotcha:** On the right-hand side, only those function-style values and **state variables** (bare name or `state.<name>`) are read dynamically. `Entity.<attr>` and any other text typed into the value field is a literal — see "What the right-hand side of a condition can be" under Conditional Events, and V76.

### Queue Growing Without Bound

**Symptoms:** Queue depth increases continuously; utilisation >100%.

**Causes:**
- Arrival rate > service capacity (check λ vs μ)
- Insufficient server count
- Conditional event condition never true (check condition syntax)

**Fix:** Increase servers, reduce arrivals, or fix Conditional event condition.

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
- Simpler fix: set `renegeDist`/`renegeDistParams` directly on the queue instead of hand-wiring a RENEGE(ctx) Bound event — the engine auto-schedules the patience timer on every join, with no eventId wiring required

**Fix:** Use RENEGE(ctx); set isRenege: true on schedule entry.

### Phase C Truncated Warning

**Symptoms:** phaseCTruncated: true in results; warning banner visible.

**Causes:**
- Phase C pass cap (500) hit in engine cycle
- Conditional event firing repeatedly without state change
- Circular Conditional event dependencies

**Fix:** Review Conditional event priorities; ensure state changes break cycles.

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
- Conditional event condition never satisfied
- All servers failed with no REPAIR scheduled (check failureScope — "pool" takes everything offline; "unit" affects one at a time)

**Fix:** Check schedules[] on Bound events; verify Conditional event conditions; schedule repairs.

---

## Model Library

### Library Tabs and Header

Tabs: **My Models**, **Templates** (search, domain chips, **Patterns Guide**; click a card to open a copy), **Public Library** and **Community**. My Models, Public Library and Community have a search bar, a sort menu (Last modified, Name A→Z, Most runs, Version) and tag chips (OR filter, **Clear tags**). Owners add tags on their cards with the **+ tag** field.

Header buttons: **Explore published** (public gallery of published models, no account needed), **↓ AI Prompt Pack** (downloads `flow-ai-prompt-pack.md`), **Connect AI app** (Flow MCP downloads, see below) and **+ New Model**.

### Model Cards

Each model in the library displays a card showing name, description, visibility (public/private), health status, run count, owner, and last updated date. Scenario copies show **Scenario**; a model with scenario copies shows how many.

**Version badge:** When a model has at least one saved version, the card shows a purple **V{n}** badge indicating the latest version number. The badge updates immediately after creating a version — no page refresh required.

**Health indicator:** Green = no issues, amber = warnings, red = validation errors.

### Creating a New Model

Open the New Model dialog from the **+ New Model** button and choose a starting method:

| Option | Behaviour |
|--------|-----------|
| **Model assistant** (Recommended) | Asks for a name (required) and description, then opens Design → **Describe** to build the model in conversation; the name and description are passed as context to the AI |
| **Draw** | Asks for a name, then opens Draw with a starter flow pre-placed on the canvas |
| **Use a template** | Opens the Templates tab |
| **Import a file** | Upload a `.json` model file — keeps its name |
| **Paste model** | Paste model JSON from the clipboard — keeps its name |

**Tip:** The description you enter for **Model assistant** is used by the Describe panel as context. Write a sentence describing the system you want to model ("A two-stage manufacturing line with a shared inspector") to get better initial AI output.

### Model Versioning

Create named version snapshots of your model from the **Versions** tab (visible to model owners). Versions capture the full model JSON at a point in time; each can be compared with the current model (**Compare to current**) or restored (the restored model is marked unsaved until you click Save). A published model's release can be pinned to a version (see Publishing).

**Creating a version:** Click **+ Create version**, optionally name it and add notes. The version number is auto-assigned. Structural changes (entity types, queues, events) are detected and flagged automatically.

**Version badge:** The latest version number appears on the model card in the library immediately after creation.

### Access & Sharing

Each model has an **Access** tab (visible to owners) with a **Sharing** section controlling who can open it.

**Visibility:** A model is **🔒 Private** (default — only the owner, plus anyone explicitly granted access, can open it) or **🌐 Public** (read-only for everyone; any signed-in user can fork it into their own editable copy).

**Per-user access grants:** Owners can grant individual users `viewer` or `editor` on a private model via the `access` map, without making the whole model public. The roles open different experiences:

| Role | What opening the model shows |
|------|------------------------------|
| owner | Full editor, including the owner-only Access and Versions tabs |
| editor | Full editor, without the Access/Versions tabs |
| viewer | The **Business view** — a simplified run-and-results page, never the editor (see next section) |

**Copy link (`#model/<id>` deep link):** The Access tab has a **🔗 Copy link** button next to the Private/Public toggle. It copies a URL containing the model's ID as a hash fragment (`#model/<modelId>`). Opening that link:

- If the recipient already has access and is signed in, it opens the model directly — per the role table above (editors get the editor, viewers get the Business view), or read-only with a fork prompt if it's a public model they don't own.
- If the recipient is signed out, the target model ID is held (via `sessionStorage`) through sign-in/sign-up and resolved immediately afterwards.
- If the model does not exist, was deleted, or the recipient has no access, the link silently falls through to the recipient's normal Model Library — no error is shown.

This is purely a client-side routing shortcut into the same `fetchModels()` query and Supabase RLS policies that already gate the Model Library — it does not create a new token, table, or anonymous-access mode. It is unrelated to the separate run-level share link (Results → **History** → the run's **⋯** menu → **🔗 Create share link**; **✕ Unshare** removes it), which creates a `share_links` row for anonymous, read-only viewing of one simulation run's results dashboard — that feature requires no login and works even for users with no model access at all.

If a private model has no collaborators and isn't public yet, the Access tab shows a hint that the link won't open it for anyone else until the model is made public or a collaborator is added.

### Business View (sharing with non-modellers)

The Business view is what a **viewer-role** collaborator gets when they open a shared model: a single simplified page for exploring the model without ever seeing the modelling environment (no Design canvas, no B/Conditional event editors, no tabs).

**Owner setup (Access tab → "Business view" section, owner-only):**

1. Add the person as a collaborator with the **viewer** role.
2. In the Business view section, click **+ Add adjustable setting** and pick from the searchable browser — parameters are grouped by category (Servers & Capacity, Arrival Distributions, Service Distributions, State Variables, Queue Capacity) with a filter box, and already-exposed settings show greyed out. The list is the model's sweepable parameters (the same list the parameter-sweep feature uses).
3. Per setting, optionally give it a plain-English name (e.g. "How many tellers on shift") and min/max bounds. Leave the list empty to let viewers run the model exactly as-is.
4. **Save** — the curation is stored on the model (`exposedParams` in `model_json`). If a curated setting's target is later deleted or renamed, the section flags it as no longer existing so the owner can remove it; viewers never see broken entries.

**Viewer experience:**

- One page: model name and description, the exposed settings as bounded number inputs (each showing its standard value, with a per-setting Reset), a **Run the simulation** button, progress bar with Cancel, and results.
- Running executes N replications in the viewer's browser (N from the owner's experiment defaults, capped by the viewer's own plan tier) and shows averaged business KPIs — arrivals, served, average wait, completion rate, utilisation, cost — with confidence-interval badges.
- The viewer's changes apply to a temporary in-memory copy; the shared model itself is never modified, and viewer runs are **not** saved anywhere (results exist only for that visit).
- If the model has a blocking validation problem, the viewer sees a friendly "only its owner can fix this" message — never raw validation codes.

**Current limits:** no animated run view on this page (the Run tab's animation is editor-only for now); no saved or owner-visible history of what a viewer ran; queue-capacity settings floor viewer input at 1 (0 would mean an unlimited queue).

---

## Publishing a Model

**What it is:** a frozen release of a model with its own public page. Anyone with the link can read it and run it in their own browser, without an account. Separate from Private/Public visibility and from Business view collaborators. Needs a signed-in owner (not available for models stored only on this device).

**Owner setup:** Access → **Publish** → **Set up publishing**. The panel shows a status chip (**Not published**, **Published**, **Withdrawn**) and these groups:

| Group | Fields |
|-------|--------|
| What the public sees | **Title** (required), **One-line summary** (gallery card), **Description**, **Category**, **Licence**, **Cover image URL** (optional) |
| The release | **Which version the public sees** — a saved version, or **Snapshot the model as it is now (taken when you publish)**; **Release notes** |
| Provenance | **Show the evidence and assumption register on the public page** (shows the model's current % evidenced) |
| Can a visitor run it? | Whether a visitor's run at the model's experiment defaults fits the published limits, or is heavy |
| What a visitor can change | Tick parameters to expose; each has **Visitor label**, **Minimum**, **Maximum**. Separate from Business view settings |

Then tick **I understand this model becomes publicly readable** and click **Publish**. Buttons: **Publish** / **Publish again** (replace the public release), **Save settings** (keep changes for the next release), **Withdraw** (page stops resolving and looks like it never existed), **Copy public link**, **Unpublish** (back to draft, settings kept), **Remove publish settings** (delete the publication; the model is untouched). **Your other published models** lists the owner's other publications with **Withdraw**.

**Rules:**
- Publishing is blocked while the model has Model Health errors. A warning appears if the model reads live data sources (visitors cannot reach them; external data-source settings are stripped from the published copy).
- What the public sees changes only when you press **Publish again** — editing the model or the settings does not change it. The released definition and timetable rows stay frozen.
- Visitor runs use the model's own experiment defaults (number of runs, run length, warm-up, seed) and the **Published** run limits: up to 30 runs, a run length up to 200,000, and up to 1,000,000 condition checks per replication (a runaway replication is still stopped at run time). The owner's plan does not matter, because visitor runs use the visitor's computer. To change the settings, change the experiment defaults and save a new version.

**Public surfaces:** **Explore published** (`#/published`) is the gallery: search, a category filter and **Show more**. A model's page (`#/published/<model id>`) shows title, summary, category, author, publication date and release, then **The model** (read-only diagram), **Run it** (**Run this model** → exposed settings with standard values and bounds → **Run the simulation**, progress, **Cancel**; afterwards the full Results view — per-section numbers, pathways, queue and resource tables, charts, statistics — and **Download report** as HTML), **What this model is** (description), **How it's organised** (sections and descriptions), **Where the numbers come from** and **The register** (when the author included them). Visitor runs never contact the author, never change the author's model or history, and never call an AI service. **Open in Flow** in the page header opens `#model/<id>` in the app, which works only if the visitor has access to the model itself.

---

## Evidence and Assumptions

**Access:** Design → Define → **Evidence**. Stored in the model as `evidence[]`, `assumptions[]` and `backingLinks[]`, so they travel with exports and versions.

The header reads e.g. "12 of 30 elements and parameters evidenced, 8 assumption only, 10 unbacked." Three views:

| View | Contents |
|------|----------|
| **Evidence (n)** | Records with a source: **Name**, **Type** (Data, Literature, Expert judgement, Anecdote), **Source**, **Strength** (Low, Medium, High), **Date captured**, **Last verified**, **Description** |
| **Assumptions (n)** | **Name**, **Assumption** text, **Confidence** (Low, Medium, High), **Contested (stakeholders disagree)** |
| **Coverage** | Every backable element and its parameters with status **Evidenced**, **Assumption only** or **Unbacked**; **Show** filter; **Attach a record…** on each row; **Remove broken links** when links point at deleted things |

**Attaching:** open a record, choose a target under **Attached to** and click **Attach**. Targets are whole elements — entity type, queue, Bound event, Conditional event, state variable, container, schedule, goal, distance, data source — or one of an element's parameters (e.g. an arrival event's mean, a server type's count). One record can back many targets. **Remove** detaches; **Delete** removes the record and its links. A target is Evidenced if any evidence backs it, Assumption only if only assumptions do.

**Draw inspector:** a selected queue, activity or container shows an **Evidence** block — status, "N of M parameters backed", the attached records' names, and **Open in Evidence tab**.

**Model Health:** warnings V-BACK-01 … V-BACK-05 (see Validation Rules). Evidence never blocks a run, and models with no records get no evidence warnings.

**Elsewhere:** reports add an **Evidence and assumptions** section; a published page can show the register and coverage; the Describe builder adds AI-recorded assumptions (never AI evidence, never overwriting existing records); the Flow MCP's `flow_record_evidence` adds named records from sources the user gives, and `flow_evidence_coverage` reports coverage.

---

## Sections

**Access:** Design → Define → **Sections** → **+ Add Section**. Each section has a name, a **description** (up to 500 characters), a colour and members (Queues, Entity Types, B-Events, C-Events). An element belongs to at most one section — ticking it in another section moves it (V82 warns about older overlaps). Editors for Entity Types, Queues, Bound Events and Conditional Events gain a coloured section filter strip.

**Draw:** **Detail | Sections** switch at the top left of the canvas.
- **Detail**: all nodes. **Outlines** shows/hides coloured section boxes. A loop that stays inside a section is drawn on a lane inside its box, labelled e.g. "↻ Review (up to 3×)"; loops that leave a section use the shared lane below.
- **Sections**: one card per populated section, with what it holds ("2 queues · 3 activities · 1 exit") and its description on hover, ordered left to right by flow; ungrouped nodes stay visible; one arrow per pair of stages labelled with the number of graph links (not customers); links to an earlier stage are dashed ↩ return arrows.
- The **▾** chevron by a section name collapses just that section to a card; **Show detail** (or double-click) restores its nodes in place. Layout reset and dragging are off while cards are shown. The view choice is remembered per model in this browser (`des.sections.view.<modelId>`); read-only viewers can switch too.

**Run:** the same switch shows live section cards — in the section now, entered, left, average time of finished stays so far, busiest resource — and arrows showing customers moved between sections. Clicking a card opens it in the docked inspector; **Show detail** returns to the nodes with that section highlighted. Numbers match the **Sections** block in Results, which also shows **Entity pathways across sections**.

Sections never change how the model runs.

---

## Flow MCP (Connect AI App)

**Access:** Model Library header → **Connect AI app**. For Claude Desktop, **↓ Download flow.mcpb** and double-click it to install. For Claude Code, Cursor, VS Code and other MCP apps, **↓ Download flow-mcp.mjs** (needs Node.js 20+) and add it to the app's MCP settings; Claude Code: `claude mcp add flow -- node /path/to/flow-mcp.mjs`.

Everything runs on the user's computer; models are JSON files in `Documents/Flow models` by default. The assistant needs no Flow sign-in. It checks Flow's website for a newer version at start-up and says when one is available (no personal data sent).

**Flow MCP 0.6 tools:** `flow_get_guide` (modelling method), `flow_get_schema`, `flow_list_models`, `flow_read_model`, `flow_validate_model`, `flow_run_model`, `flow_compare_models`, `flow_run_over_time`, `flow_sweep_parameter`, `flow_trace_run`, `flow_edit_model`, `flow_save_model`, `flow_open_in_app`, `flow_evidence_coverage` (what backs the model, unbacked arrival and capacity parameters, contested assumptions, V-BACK warnings) and `flow_record_evidence` (add named evidence with a user-named source, or assumptions, and attach them to an element or one parameter by name; unknown or ambiguous names are reported, never guessed).

**Bringing a model into Flow:** `flow_open_in_app` opens a preview in the browser; choose **Save to my models**, or for a file exported from Flow (Access → **Export Model**) **Update "<model>"** (saves a version first, then replaces; owners and editors only) or **Save as a new model**. Or use **+ New Model → Import a file**.

**Compared with the AI Prompt Pack:** the Prompt Pack is a document you paste into any chat; the MCP lets the assistant validate, run and fix the model itself.

---

## Authoring Modes

### Define Editors

**Access:** Design → **Define**, then a sub-tab (see Where Things Are).

**Purpose:** Precise, field-by-field configuration.

**When to use:** Known model structure; fine-tuning parameters; checking specific fields.

**Strengths:** All fields visible; structured validation; no ambiguity.

### AI Builder

**Purpose:** Bootstrap from natural language description.

**When to use:** New model from scenario description; unfamiliar domain.

**Access:** Design → **Describe**. Also the **Model assistant** option in the New Model dialog.

**Behaviour:** Conversation (Discover → Confirm → Generate). Asks targeted questions one at a time; shows what it understood and waits for confirmation before building. Enter sends, Shift+Enter adds a new line; a microphone button allows voice input. Uses the model's name and description as context from the first message. When editing an existing model, the current model structure is also provided as context, so a request like "add another doctor to triage" edits rather than rebuilds.

**Reviewing the result:** **Review proposal** (the **Proposal** pane on narrow screens) shows a diff of every element as Added, Removed, Modified or Unchanged. Buttons: **Apply model**, **Apply & Save All**, **Apply Selected** / **Apply & Save Selected** (ticked elements only), **Refine this**, **Discard**. Applying takes any assumptions the AI recorded into the Evidence tab, but never AI evidence and never overwriting existing records.

**Strengths:** Fast scaffolding; suggests realistic parameters; refines incrementally.

### Visual Designer

**Purpose:** Topology view; drag-and-drop editing.

**When to use:** Reviewing flow; presenting to stakeholders; connection verification.

**Access:** Design → **Draw**. Also available from the New Model dialog via **Draw**.

**Strengths:** Visual flow; node badges show advanced config (`feed` for a live data source on an arrival, `when` for attribute-conditional completion schedules) plus at-a-glance design detail — a Source/Activity's distribution label, a Queue's discipline and capacity badge, an edge's "N routes" badge for multi-way routing, and a Container node's capacity/initial-level; bidirectional sync with Forms/Tabs. New blank models open with a starter flow pre-placed on the canvas — no unsaved changes until you make your first edit. Multi-select nodes (Shift/Ctrl-click or box-drag) to bulk-move or bulk-delete; copy/paste (Ctrl+C/Ctrl+V) or duplicate in place (Ctrl+D). Selecting an edge for a probabilistic-routing branch shows an inline `%` input on the edge label — edit the split without leaving the canvas or opening the Bound Events editor.

**Container canvas node:** Containers get their own dedicated canvas node (replacing the earlier gauge-strip panel), showing capacity and current/initial level alongside the rest of the topology instead of in a separate strip.

**Balking, reneging, and activity-type badges:** Queue nodes show a badge when a balk probability/condition or renege distribution is configured; Activity nodes always show an activity-type badge (service / delay / advanced) so the processing model is visible without opening the inspector.

**Rework and loop-back edges:** Edges that route an entity backward to an earlier stage (rework/retry loops) are drawn through a dedicated lane below the main canvas instead of crossing over unrelated nodes, keeping the primary flow readable.

**Editing without leaving Draw:** The inspector is resizable (drag its left edge; the width is remembered) and supports inline description editing directly on Queue, Source, Sink, and Activity nodes. It also has an **Evidence** block (see Evidence and Assumptions). A time-varying (piecewise) distribution lists its periods collapsed to one-line summaries; click one, or **Expand all**, to edit. Where a field can only be edited in a Define tab, the inspector's "Edit in the X tab" pointer is a clickable jump link that opens the corresponding tab with the exact card already expanded.

**Advanced effects and the canvas:** Layout edits (dragging, aligning, panning) never change model logic — they only save positions. Structural canvas edits that would overwrite an advanced effect (COSEIZE, skill-gated ASSIGN, BATCH, MATCH, multi-macro effects, attribute-conditional `when` schedules) are refused with a message pointing at the Define editors — the Conditional Events/Bound Events editors remain the home of the advanced macro vocabulary. Simpler edits near advanced constructs are surgical: switching a sink between COMPLETE and RENEGE, changing a source's queue, or deleting a queue preserves any co-located macros (COST, SET, …) instead of rewriting the whole effect.

**Sections:** the **Detail | Sections** switch and **Outlines** button (see Sections).

**Alignment guides:** While dragging a single node, dashed guide lines appear whenever the dragged node's edges or centre line up with another node's edges or centre. Release while a guide is showing and the node snaps exactly into alignment. Guides don't appear for multi-node drags — use the selection toolbar's align/distribute tools for those. Placement is otherwise free: nodes don't snap to a background grid, so the alignment snap is the only snap.

---

## Explain Panel

The **Explain** button on a run in Results → **History** opens that run's results with the Simulation Assistant's analysis; the same actions are under **Analyse**, **Compare** and the question box in the Simulation Assistant on the Results tab.

### Interpret Results

**Purpose:** Plain-English narrative of what simulation found.

**When to use:** After any completed run; first results review.

**Output:** System performance summary, bottleneck identification, goal assessment, notable patterns.

### Compare Runs

**Purpose:** Side-by-side comparison of two saved runs.

**When to use:** Scenario comparison; before/after change analysis.

**Access:** Results → **History**. Tick two runs, then click **Compare selected**. (The Simulation Assistant's **Compare** action gives an AI narrative of the same comparison.)

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
| **When available** | Any screen (the **?** icon in the top header, or the **?** key) | After a completed run (Results → History → **Explain**, or the Simulation Assistant on the Results tab) |
| **Knowledge base** | Curated help articles, validation rules, macro syntax, distribution guidance | Run results, model JSON, confidence intervals, goal gaps |
| **Knowledge source** | This help-reference document (curated, versioned alongside docs) | Run results + model JSON passed live at query time |
| **Example questions** | "What does ARRIVE do?", "How do I set up reneging?", "What does V8 mean?" | "Why is wait time so high?", "Should I add more servers?", "Are these results reliable?" |
| **Context-awareness** | Suggests questions based on current tab/editor | Analyses current run's specific results |

**Rule:** Route "how to" questions to Help Assistant. Route "what does this mean" questions to Explain.

---

## Schedule Manager (Timetables)

Timetable data for arrival Bound events is stored separately from the core model in the **Time & Schedules** tab of the model editor. This keeps the model lightweight and lets you maintain multiple named timetables for the same model.

### Accessing schedules

Open your model and click the **Time & Schedules** tab (between Sections and Goals).

### Schedule list

Shows all schedules for the model: name, total row count, which Bound events use each schedule. A ★ marks the default schedule.

### Selecting a schedule for a run

When a model has more than one schedule, a **Timetable:** picker appears on the Run tab. Select the timetable you want before starting the run.

### Creating a schedule

Click **+ New Schedule**, enter a name, and save. Populate rows by importing via CSV or entering JSON directly.

### Setting a default

Click **Set as default** (★) next to the schedule to use when no explicit selection is made.

### CSV export

Open a schedule and click **Export CSV** to download all rows for editing externally.

### Export and portability

When you export a model as JSON (Access → **Export Model**), schedule rows are automatically embedded in the exported file. The export is self-contained and can be imported to another simmodlr instance.

### Bound event schedule link

Each arrival Bound event stores a `scheduleRef` UUID pointing to a schedule record. If the referenced schedule is deleted or unavailable, the Bound event produces zero arrivals (a validation warning is shown).

### Bidirectional navigation

In the **Bound Events** editor, a green badge appears next to each event that is linked to a named schedule (showing the schedule name). Clicking the badge switches to the Time & Schedules tab with that schedule selected.

In the **Time & Schedules** editor, the Event Links panel lists every Bound event that uses the current schedule. Clicking a Bound event name switches to the Bound Events tab and scrolls to that event.

### Migrating inline rows to a named schedule

If a Bound event still has rows embedded directly in the model JSON (legacy format), a **Move to named schedule →** button appears in the Bound Events editor above the schedule picker. Clicking it creates a new named schedule from the inline rows and links the Bound event to it, removing the embedded data from model JSON.

### CSV import — single-event and multi-event formats

**Single-event:** First column is `time`; subsequent columns are entity attribute names. Import a single schedule's rows.

**Multi-event:** First column is `event` or `eventId` containing Bound event IDs or names; second column is `time`; subsequent columns are attributes. Imports rows for multiple Bound events at once. The importer shows a per-event match status; unmatched events are flagged. The **Import + create stubs** option auto-creates fire-at-start Bound events for any Bound event IDs in the CSV that don't yet exist in the model.

---

## ⚡ Optimise — Adaptive Batch Analysis

**Optimise** is reached via the Simulation Assistant sidebar. It runs the model through progressively larger replication batches until statistical confidence is achieved, then streams an LLM-generated opportunity report.

### Accessing Optimise

Click **⚡ Optimise** inside the Simulation Assistant — in Design (under the quick-start questions), on the Run tab (next to the Design / Diagnose / Debug modes) and on the Results tab. The panel is titled **Explore**. If the model has errors, fix them in **Model Health** first.

### Pre-flight confirmation

Before any simulation starts, a confirmation dialog shows:
- **Replications limit** — your run tier's maximum (defaults: Free 10, Standard 30, Pro 500)
- **Model complexity** — Low / Medium / High / Very high based on Conditional event scan estimate
- **Run duration and warmup** — taken from the model's experiment defaults
- **Target CI** — ±5% of the mean (95% confidence)
- **Hard errors** — if any admission errors are present (e.g. run duration exceeds tier limit), the Proceed button is hidden; fix the issue first
- **Warnings** — shown in amber; you can still proceed

Click **Proceed** (or **Proceed anyway** if warnings are present) to start. Click **Cancel** to close without running.

### How the adaptive batch works

1. Starts with 10 replications (or fewer if the tier max is lower)
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

| Run tier | Max replications | Max run length | Condition checks per replication |
|----------|-----------------|----------------|----------------------------------|
| Free | 10 | 10,000 | 50,000 |
| Standard | 30 | 50,000 | 250,000 |
| Pro | 500 | 200,000 | 1,000,000 |
| Published (visitors to a published model) | 30 | 200,000 | 1,000,000 |

These are defaults; an administrator can change the limits and which tier each plan gets (out of the box: Free → Free, Standard and Pro → Standard, Enterprise and Pro Plus → Pro; administrators always get Pro).

If the model is complex or high-variance, the Free tier may not achieve the ±5% CI target. The amber badge tells you the CI achieved within your limit so you can judge whether the results are sufficient for your purpose.

---

## Simulation Assistant

The Simulation Assistant is the AI panel available from any model view. Click **✨ Simulation Assistant** at the right of the mode bar to open it. It adapts to your current context:

| Context | What it shows |
|---------|--------------|
| **Design tabs** (entities, queues, Bound events, Conditional events, etc.) | Suggested questions about the current tab's content. A free-text **ASK ABOUT THIS MODEL** input for any question about the model's structure. The assistant receives the full model definition (entity attributes, queue configurations, Conditional event logic, sections, goals) and can reason about whether conditions and effects are correctly wired. |
| **Run tab** | Three modes: **Design** (questions about the model; an unsent question is kept when you switch), **Diagnose** (investigate a completed run, with a **Diagnose** button) and **Debug** (a conversation about the run trace). Diagnose and Debug need a completed run. **⚡ Optimise** sits next to the modes. The title, close button and mode buttons stay fixed while the content scrolls. |
| **Results tab** | Three focused tabs: **Analyse** (plain-language narrative of results), **Compare** (side-by-side comparison with a saved run), and **Refine Plan** (schedule adjustment suggestions — only when the model has a timetable). A **FOLLOW-UP QUESTION** input lets you ask specific questions about the results. No action fires automatically — click the button to trigger analysis. |

### Opening the Simulation Assistant

Click **✨ Simulation Assistant** in the mode bar to toggle it; press Esc to close it. On desktop it opens as a resizable sidebar. On compact layouts (720–1024px) the panel floats as an overlay. On mobile (<720px), it opens full-screen.

### Design and Run tabs — Model Q&A

The **ASK ABOUT THIS MODEL** textarea is always available in design and run tabs. Type any question about the model — the assistant has full knowledge of your entity types, attributes, queue configurations, Conditional event conditions, sections, and goals. Examples: "Review my entity types", "Are my Conditional event conditions correctly wired?", "What can this model simulate?"

Quick-start chips suggest context-specific questions based on the tab you're viewing (for example "Explain the sections" on the Sections tab, "Review skills, containers, distances, and state variables" on Model Data).

### Run tab — Design, Diagnose, Debug

On the Run tab the assistant has three modes (see the table above). Results-focused actions (Analyse, Compare, Refine Plan) appear only on the Results tab.

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

### Where to find Export ▾

The unified **Export ▾** popover is available across all results views: the **Run** tab toolbar (after a run completes), the **Results** workspace, and per-run in Results → **History** (**Export results ▾**).

### How to download

1. Complete a run (any number of replications).
2. Open **Export ▾** on the Run tab toolbar or in the Results workspace, or **Export results ▾** on a run in Results → History.
3. Under the **AI & Reports** section, click **LLM Bundle (.md)**.
4. The file downloads immediately. Paste its contents into any LLM interface.

Other options in the **Export ▾** popover:
- **Results Data** section: Full JSON (.json), Metrics-only JSON, Results table (.csv), Results workbook (.xlsx — multi-sheet: Summary, Replications, Entity Journeys)
- **AI & Reports** section: LLM Bundle (.md), Create Report…
- **Reference** section: Schema reference — opens a modal documenting the full `simmodlr.results.v1` JSON structure

The full JSON export now includes an **entity journeys** section with every customer entity's path through the model (stages, wait times, service times, outcome).

### What the bundle contains

| Section | Contents |
|---------|---------|
| Preamble | Three-Phase DES method explanation, how to interpret the results |
| Model definition | Entity types and attributes (including weekly schedule patterns), queues (discipline, capacity), Bound Events and Conditional Events, performance goals |
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

**Preempt-and-assign:** `ASSIGN(Queue, ServerType, PREEMPT, …)` is translated to `simpy.PreemptiveResource` (Category 1); see the SimPy export guide for what differs.

**Category 2 macros (stubs generated):** `RENEGE`, `BATCH`, `RENEGE_OLDEST`, `MATCH`, `FAIL`, `REPAIR`, `PREEMPT`, `FINISH`, `RELEASE_COSEIZED`, `JOIN`. Note: all of these are fully implemented in the JS Three-Phase engine — they appear as stubs only because their Python translation is non-trivial to auto-generate.

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

Go to the **Access** tab (owners) and click **Export SimPy** in the **Export** section.

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

At the default storage level, the event log is condensed to a 4-field `logSummary`. Full event logs are only retained when **⚙ Setup → Archive detail** is **Full** (`resultDetailLevel = "full"`). The response includes `_trimmed_fields` listing condensed sections.
