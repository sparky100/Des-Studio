# simmodlr — DES Modeling Capability Gap Analysis

> Comparison of simmodlr's current modeling capabilities against standard DES modeling patterns found in commercial and open-source tools.

---

## Arrival Patterns

| Pattern | Supported? | Notes |
|---|---|---|
| Single-stream inter-arrival distributions | ✅ | `ARRIVE(Type, Queue)` + `schedules[].dist` |
| Multi-stream arrivals with superpositions | ✅ | Multiple B-Events targeting the same queue |
| Thinning / rejection at arrival | ✅ | Queue-level balking and capacity overflow |
| Batch arrivals | Partial | `SPLIT` macro or multiple `ARRIVE` in one effect. Awkward — no first-class batch-arrive. |
| Triggered arrivals (condition-driven) | ❌ | `ARRIVE` is B-event only. Can't "create entity when StateVar > threshold" without a helper pattern. |
| Seasonal / trend-based arrival rates | ✅ | `Piecewise` distributions for time-varying rates |
| Schedule-based arrivals (timetable) | ✅ | `Schedule` distribution with `rows[]` and per-row attributes |
| CSV-imported planned arrivals | ✅ | `ScheduleManager` CSV import with attribute columns |
| Jitter on planned arrivals | ✅ | `Schedule` distribution with `jitterDist`/`jitterParams` |

**Gaps:** No condition-driven arrivals. No first-class batch-arrive (N entities created as a group).

---

## Routing

| Pattern | Supported? | Notes |
|---|---|---|
| Deterministic routing (always to queue X) | ✅ | `RELEASE(Server, QueueName)` |
| Conditional routing (attribute-based) | ✅ | `routing[]` with predicate conditions |
| Probabilistic routing | ✅ | `probabilisticRouting[]` with probabilities |
| Exit routing | ✅ | `probabilisticRouting[].queueName = null` + `COMPLETE()` |
| Recirculation / looping | ✅ | `loopConfig.maxLoopCount` guard |
| Re-routing on block | ❌ | No "if Queue A is full, try Queue B" cascading overflow beyond `overflowDestination` |
| Round-robin / cyclic routing | ❌ | No state tracking for "next queue in rotation" |
| Shortest-queue routing | ❌ | Cannot dynamically compare `queue(X).length < queue(Y).length` at routing time |
| Entity-to-entity pairing (attribute-aware) | Partial | `MATCH` pairs 1:1 from two queues. No attribute-based compatibility matching (e.g., blood type). |
| Routing decision independent of B-event | Partial | Routing happens on `RELEASE()` or `COMPLETE()`. No standalone "decide" node. |

**Gaps:** No shortest-queue or round-robin routing. No cascading overflow. No attribute-based entity pairing.

---

## Queue Behavior

| Pattern | Supported? | Notes |
|---|---|---|
| FIFO / LIFO / PRIORITY / SPT / EDD | ✅ | All six queue disciplines implemented |
| Maximum capacity | ✅ | `queue.capacity` with balking |
| Overflow destination | ✅ | `queue.overflowDestination` |
| Automatic reneging (abandonment) | ✅ | `queue.renegeDist` sets per-entity timer on queue join |
| Balking (probability or condition) | ✅ | `queue.balkProbability` and `queue.balkCondition` |
| Push-out / evict oldest on full capacity | Partial | `RENEGE_OLDEST(Type)` exists but needs explicit C-event — not automatic on arrival |
| Impatient balking with return | ❌ | Balk = discard permanently. No "balk now, return later if queue shrinks" |
| Queue-dependent service speed | Partial | `cSchedule.when` checking `queue(X).length` can vary service per entry, but not dynamically adjust mid-service |
| Queue merging / splitting without routing | ❌ | Queues are passive — entities only leave via explicit macros |

**Gaps:** No automatic push-out on capacity. No return-after-balk. No dynamic queue-driven service speed adjustment.

---

## Resources / Servers

| Pattern | Supported? | Notes |
|---|---|---|
| Server pools with capacity | ✅ | `et.count` + `shiftSchedule` for time-varying capacity |
| Weekly schedule patterns | ✅ | `schedulePattern` with 24x7 grid editor |
| Multiplier mode for sweep integration | ✅ | `schedulePattern.mode: "multiplier"` with `baseCapacity` |
| Server skills (type-level) | ✅ | `et.skills[]` on type definition |
| Per-instance skills | ✅ | `skillProfiles` with count-based and weight-based assignment |
| Skill-filtered ASSIGN | ✅ | `ASSIGN(Q, Server, "Skill")` and `ASSIGN(Q, Server, Entity.attrName)` |
| Skill-filtered conditions | ✅ | `idle(Server, "Skill").count` / `busy(Server, "Skill").count` |
| Per-skill utilisation analytics | ✅ | `skillUtil` in results summary |
| Server failure / repair | ✅ | MTBF/MTTR with FAIL/REPAIR macros |
| Preemption | ✅ | `PREEMPT(ServerType)` |
| Cross-type skill pooling | ❌ | Must specify server TYPE in ASSIGN. Cannot "seize any resource with Skill X" across types |
| Skill-based preference / priority | ❌ | Servers matched FIFO by idle time. No "prefer specialist over generalist" |
| Skill proficiency levels | Partial | `ServerAttr` can read proficiency from server attrs, but ASSIGN filter treats all servers with matching skill equally |
| Consumable resources | Partial | Containers (FILL/DRAIN) track levels but don't gate ASSIGN — cannot "seize server + consume 1 unit" |
| Mobile resources / transporters | ❌ | No location/travel model. Entities teleport between queues |
| Standby pool (activate on failure) | ❌ | No automatic "spare server replaces failed server" |
| Resource roster (which specific servers, not just how many) | Partial | Shift schedule controls capacity. `skillProfiles` controls which servers have which skills. But no roster-driven duty assignment. |

**Gaps:** Cross-type skill pooling. Skill-based server preference. Consumable resource gating on seize. Transporters/location.

---

## Service / Processing

| Pattern | Supported? | Notes |
|---|---|---|
| Distribution-based service times | ✅ | All 12 distributions on `cSchedule` |
| Per-entity service times via attribute | ✅ | `EntityAttr` distribution reads `entity.attrs.serviceTime` |
| Per-server service times via attribute | ✅ | `ServerAttr` distribution reads server's `attrs.serviceTime` |
| Per-skill service times | ✅ | `cSchedule.when` predicate selects distribution per entity attribute |
| Resource-free delays | ✅ | `DELAY(QueueName)` macro |
| Multi-stage service with RELEASE | ✅ | `RELEASE(Server, NextQueue)` for stage transitions |
| Activity of unknown duration | ❌ | B-event fires at scheduled time. Cannot "service ends when StateVar > 10" |
| Inspection / yield with re-work | ✅ | Probabilistic routing with loop-back and `loopConfig` guard |
| Disassembly (1 → many) | Partial | `SPLIT` creates N-1 clones but doesn't consume the original. `UNBATCH` requires a pre-created batch. |
| Transport time (separate from service) | Partial | `DELAY` can model a transport hold. No distance/speed/location model. |
| Interruption with resume | ✅ | `PREEMPT` preserves remaining service time |
| Recipe-based assembly (BOM) | ❌ | `BATCH(N)` accumulates equal-N. `MATCH` pairs 1:1. No "3A + 2B + 1C → widget" assembly. |
| Service sequence enforcement | ❌ | No built-in "entity must pass through A then B then C in order" guard. Modeller enforces this via routing. |

**Gaps:** Condition-triggered service completion. True disassembly. Recipe-based assembly with Bill of Materials. Transport time/location.

---

## Entities / Attributes

| Pattern | Supported? | Notes |
|---|---|---|
| Entity attribute definitions | ✅ | `attrDefs[]` with number/string/boolean types |
| Distribution-based attribute sampling | ✅ | Numeric distributions + `Categorical` for string/boolean |
| Per-instance attribute overrides (schedule) | ✅ | `rows[].attrs` with editable cells in ScheduleDetail |
| Entity attributes set at arrival | ✅ | `sampleAttrs()` on ARRIVE + `SET_ATTR` in effects |
| Immutable attributes | ✅ | `mutable: false` blocks `SET_ATTR` |
| Attribute-based routing | ✅ | `routing[].condition.{variable: "Entity.attr", ...}` |
| Dynamic attribute modification | ✅ | `SET_ATTR(attrName, expression)` in B-event and C-event effects |
| Entity age / lifecycle tracking | ✅ | `clock - arrivalTime` accessible in expressions |
| Entity priorities that change over time | Partial | Requires explicit C-event with `SET_ATTR` to bump priority. No automatic aging-based priority increase. |
| Entity families / inheritance | ❌ | No parent-child type relationships. Each entity type is standalone. |
| Multi-entity attribute references | ❌ | Cannot reference other entities' attributes from conditions or expressions (e.g., "entity A's priority > entity B's priority"). |

**Gaps:** No automatic aging-based priority. No entity type inheritance. No cross-entity attribute references.

---

## State / Events

| Pattern | Supported? | Notes |
|---|---|---|
| User-defined state variables | ✅ | `stateVariables[]` with SET/VAR++ macros |
| C-event condition evaluation | ✅ | Full predicate builder with AND/OR, all operators |
| B-event scheduling with distributions | ✅ | `schedules[].dist` with all 12 distributions |
| Scheduled B-event cancellation | ❌ | Once a B-event is in the FEL, it fires. Cannot cancel or reschedule mid-run. |
| Condition-triggered B-events | ❌ | B-events are time-scheduled only. No "fire this B-event when condition becomes true" (that's a C-event with effects). |
| Timed wait with condition break | ❌ | Cannot "wait up to 10 minutes, but if condition becomes true sooner, proceed." Only B-event timer OR C-event condition — not both. |
| Stopping condition with summary | ✅ | `terminationCondition` expression |
| Multi-condition termination | ✅ | `terminationCondition` supports AND/OR compound conditions |
| Warm-up with statistics reset | ✅ | `warmupPeriod` resets statistics collectors |

**Gaps:** No B-event cancellation. No timed-wait-with-condition-break. No condition-triggered B-events outside C-event effects.

---

## Batch / Replications

| Pattern | Supported? | Notes |
|---|---|---|
| Multiple replications with CI | ✅ | `runReplications()` with 95% CI |
| Web Worker parallel runs | ✅ | Pool-based worker execution |
| Fixed seed reproducibility | ✅ | `mulberry32` PRNG, seed stored with each run |
| Parametric sweep (1D) | ✅ | Single parameter variation |
| Parametric sweep (2D) | ✅ | Two-parameter grid with rollup |
| Common random numbers across scenarios | ❌ | Each run uses independent seed. Cannot synchronize random streams for variance reduction across scenario comparisons. |
| Sequential replications | ❌ | Runs are independent. Cannot "run A, feed results into run B." |
| Replication batch with outlier detection | ✅ | IQR-based outlier flagging |
| Anomalous replication badges | ✅ | Per-replication flags in run history |

**Gaps:** No common random numbers. No sequential/chained replication runs.

---

## Output / Analysis

| Pattern | Supported? | Notes |
|---|---|---|
| Summary KPIs | ✅ | avgWait, avgSvc, avgSojourn, utilisation, cost |
| Confidence intervals | ✅ | 95% CI with half-width and precision indicators |
| Queue depth time series | ✅ | Time-plot in BottomPanel and Results |
| Wait time distribution | ✅ | Histogram in Results |
| Per-skill utilisation breakdown | ✅ | `skillUtil` in results |
| Per-stage service breakdown | ✅ | `computePerQueueServiceTimes()` |
| Journey outcome tracking | ✅ | `summary.outcomes` with route labels |
| Little's Law validation | ✅ | `avgWaitByLittle` and `waitDiscrepancy` |
| Cost-based optimization | Partial | Parametric sweep can find cost-minimizing parameter. No built-in optimizer. |
| Process animation stats | ✅ | ExecuteCanvas with live node overlays and entity token animation |
| Full factorial experiment design | Partial | 2D sweep handles two factors. No N-dimensional factorial support. |
| Trace validation against historical data | ❌ | No built-in historical data comparison or goodness-of-fit reporting. |
| Goal pass/fail reporting | ✅ | `goals[]` with operator, target, label. PASS/FAIL in reports. |

**Gaps:** No built-in optimizer. No N-dimensional factorial design. No historical data validation.

---

## Workflow / UX

| Pattern | Supported? | Notes |
|---|---|---|
| Forms/Tabs editor | ✅ | Structured editors for entity types, queues, events |
| Visual Designer canvas | ✅ | `@xyflow/react` DAG authoring canvas |
| AI-assisted model building | ✅ | Natural language model generation via LLM |
| Undo / rollback | ❌ | No undo stack. Save points via version history (manual). |
| Model versioning | ✅ | `model_versions` table with snapshots |
| Model diff / compare | Partial | Version comparison via history. No visual diff between versions. |
| Parameterized templates | ❌ | Templates are fixed models. Cannot "give me an M/M/c with X=3, Y=4." |
| What-if scenario sets | Partial | Sweep configurations. Experiment saves. No named what-if scenario list. |
| Model validation checklist | Partial | V1-V60 rules catch structural issues. No pre-built domain-specific checklists. |
| Concurrent multi-model editing | ❌ | One model at a time per session. |
| Locking / conflict detection | ❌ | No collaborative editing conflict detection. Last-save-wins on Supabase. |

**Gaps:** No undo. No visual diff. No parameterized templates. No collaborative editing.

---

## Top 7 Gaps by Impact

| # | Pattern | Why it matters | Impact |
|---|---|---|---|
| 1 | **Decision nodes independent of C-events** | "After service, check condition and route" without needing a separate C-event. Would simplify multi-stage models significantly. Many DES tools have decide/branch modules at any point in the flow. | High |
| 2 | **Cross-type resource pooling** | "Any server with skill X" rather than "Doctor with skill X." Forces duplicate C-events. Users hit this immediately with mixed-resource models. | High |
| 3 | **Attribute-based transport / location model** | Real models have distance, travel time, location constraints. Currently everything is invisible teleportation. Fundamental to factory, warehouse, hospital bed models. | High |
| 4 | **Skill-based server preference / priority** | With mixed-skill pools, users notice immediately that the specialist is treated identically to the generalist. "Prefer the surgeon, fall back to GP" is standard in healthcare models. | High |
| 5 | **Time-dependent entity behavior** | Priority aging, patience decay, reneging probability escalation. Requires explicit C-events today. Natural behavior in most models. | Medium |
| 6 | **Recipe-based assembly / disassembly** | Real manufacturing needs N of A + M of B = product. `BATCH` is too simple. Critical for factory, supply chain, assembly line models. | Medium |
| 7 | **Parameterized templates** | Every new hospital/clinic/factory model starts from scratch. Other tools let users fill in parameters and generate. Would enable non-experts to build working models. | Medium |

---

*Version: 2026-07-01 | Coverage: 45+ patterns across 8 categories*
