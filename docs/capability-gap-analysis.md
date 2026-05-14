# DES Studio — Capability Gap Analysis

**Date:** 2026-05-14
**Scope:** DES Studio vs SimPy 4.x, AnyLogic 8.x (Process Modelling Library), JaamSim 2024
**Method:** Web-fetched reference feature lists + full codebase audit (engine, macros, UI, tests, templates)

---

## Section 1: Scoring Matrix

Scoring: ✅ Implemented | ⚠️ Partial | ❌ Missing

### A — Core Entity Model

| Feature | SimPy | AnyLogic | JaamSim | DES Studio | Gap? |
|---|---|---|---|---|---|
| Customer/entity creation (generator/source) | ✅ | ✅ | ✅ | ✅ ARRIVE macro | — |
| Entity disposal (sink) | ✅ | ✅ | ✅ | ✅ COMPLETE macro | — |
| Named entity types with roles | ⚠️ manual | ✅ | ✅ | ✅ entityTypes[] | — |
| Entity attributes (typed, sampled at birth) | ⚠️ manual | ✅ | ✅ | ✅ attrDefs + dist | — |
| Mutable entity attributes | ✅ | ✅ | ✅ | ✅ mutable flag | — |
| Attribute-based routing predicates | ✅ | ✅ | ✅ | ⚠️ entityFilter on ASSIGN only | Gap |
| Multi-stage sequential routing | ✅ | ✅ | ✅ | ✅ RELEASE macro | — |
| Probabilistic routing / branching | ✅ | ✅ | ✅ | ⚠️ balkProbability only | Gap |
| Conditional routing (Select Output) | ✅ | ✅ | ✅ | ⚠️ overflow destination only | Gap |
| Entity cloning / splitting | ⚠️ manual | ✅ Split block | ✅ EntitySplit | ❌ | Gap |
| Entity joining / combining | ⚠️ manual | ✅ Combine block | ✅ Combine | ❌ | Gap |
| Process recirculation / loops | ✅ | ✅ | ✅ | ✅ loopCount tracked | — |
| Entity conveyors / transporters | ❌ | ✅ | ✅ | ❌ | Gap |
| Entity state machine | ⚠️ manual | ✅ StatechartAgent | ❌ | ❌ | Gap |

### B — Resource & Server Model

| Feature | SimPy | AnyLogic | JaamSim | DES Studio | Gap? |
|---|---|---|---|---|---|
| Multi-capacity server pool | ✅ Resource | ✅ ResourcePool | ✅ ResourcePool | ✅ count per type | — |
| Single-entity server (c=1) | ✅ | ✅ | ✅ | ✅ | — |
| Per-server attribute sampling | ⚠️ manual | ✅ | ✅ | ✅ ServerAttr dist | — |
| Server utilisation tracking | ⚠️ manual | ✅ | ✅ | ✅ per-type utilisation | — |
| Shift schedules (capacity change) | ❌ | ✅ | ✅ | ✅ SHIFT_CHANGE B-event | — |
| Dynamic capacity increase/decrease | ❌ | ✅ | ✅ | ✅ retireIdleExcessServers | — |
| Resource preemption | ✅ PreemptiveResource | ✅ | ✅ priority maintenance | ❌ | **High Gap** |
| Resource breakdowns / failures | ❌ | ✅ | ✅ Maintenance block | ❌ | Gap |
| Resource repair / MTTR | ❌ | ✅ | ✅ | ❌ | Gap |
| Multiple resource types per task | ⚠️ manual | ✅ | ✅ SeizeSet | ❌ | Gap |
| Resource state: idle/busy/failed/off-shift | ⚠️ 2 states | ✅ 4+ states | ✅ 4+ states | ⚠️ idle/busy only | Gap |
| Container (level/tank resource) | ✅ Container | ✅ | ✅ | ❌ | Gap |
| Store / item buffer resource | ✅ Store/FilterStore | ✅ | ✅ | ❌ | Gap |
| Priority request queue for resources | ✅ PriorityResource | ✅ | ✅ | ⚠️ via queue PRIORITY | — |

### C — Queueing & Scheduling

| Feature | SimPy | AnyLogic | JaamSim | DES Studio | Gap? |
|---|---|---|---|---|---|
| FIFO queue discipline | ⚠️ implicit | ✅ | ✅ | ✅ | — |
| LIFO queue discipline | ❌ | ✅ | ✅ | ✅ | — |
| PRIORITY discipline (numeric attr) | ✅ PriorityResource | ✅ | ✅ | ✅ | — |
| Custom comparator / sort key | ✅ FilterStore | ✅ Java comparator | ✅ | ❌ | Gap |
| Shortest processing time (SPT) | ❌ | ✅ | ⚠️ | ❌ | Gap |
| Finite queue capacity | ❌ | ✅ | ✅ | ✅ capacity field | — |
| Balking (hard — entity lost) | ❌ | ✅ | ✅ | ✅ | — |
| Balking with overflow routing | ❌ | ✅ | ✅ | ✅ overflowDestination | — |
| Balking probability | ❌ | ✅ | ✅ | ✅ balkProbability | — |
| Reneging / abandonment (patience timeout) | ✅ | ✅ Timeout block | ✅ | ✅ RENEGE + isRenege | — |
| Jockeying (queue-switching) | ❌ | ✅ | ❌ | ❌ | Gap |
| Batching (accumulate N → one unit) | ⚠️ manual | ✅ Batch block | ✅ BatchService | ✅ BATCH macro | — |
| Batch size by attribute / condition | ❌ | ✅ | ✅ | ❌ | Gap |
| Unbatching / splitting batches | ⚠️ manual | ✅ Unbatch block | ✅ | ✅ UNBATCH macro | — |
| Match / synchronise entities | ❌ | ✅ Match block | ✅ Combine | ❌ | Gap |
| C-event priority ordering | ⚠️ implicit | ✅ | ✅ | ✅ priority field | — |
| Phase C restart rule (three-phase) | N/A | N/A | N/A | ✅ canonical | — |
| Time-varying arrival rates | ⚠️ manual | ✅ | ✅ | ✅ Piecewise dist | — |

### D — Statistical Output

| Feature | SimPy | AnyLogic | JaamSim | DES Studio | Gap? |
|---|---|---|---|---|---|
| Throughput (served count) | ⚠️ manual | ✅ | ✅ | ✅ | — |
| Mean / max wait time | ⚠️ manual | ✅ | ✅ | ✅ avgWait, maxSojourn | — |
| Mean service time | ⚠️ manual | ✅ | ✅ | ✅ avgSvc | — |
| Mean sojourn time (end-to-end) | ⚠️ manual | ✅ | ✅ | ✅ avgSojourn | — |
| Reneged / balked counts | ⚠️ manual | ✅ | ✅ | ✅ | — |
| Per-queue utilisation | ⚠️ manual | ✅ | ✅ | ✅ per-type util% | — |
| Wait-time distribution (percentiles) | ⚠️ manual | ✅ | ✅ | ✅ p50/p90/p95/p99 | — |
| WIP (work in progress) | ⚠️ manual | ✅ | ✅ | ⚠️ in-flight entity count | Gap |
| Queue length time-series | ⚠️ manual | ✅ | ✅ | ✅ _timeSeries[] | — |
| Event fire counts | ⚠️ manual | ✅ | ✅ | ✅ _eventCounts | — |
| Replication support | ⚠️ manual | ✅ | ✅ | ✅ runReplications() | — |
| Parallel replication workers | ❌ | ✅ | ✅ | ✅ worker pool | — |
| 95% confidence intervals | ⚠️ manual | ✅ | ✅ | ✅ confidenceInterval95() | — |
| Warm-up period / transient removal | ⚠️ manual | ✅ | ✅ | ✅ WARMUP event | — |
| Batch-means CI estimator | ❌ | ✅ | ✅ | ✅ batchMeansCI | — |
| Welch's graphical warm-up test | ❌ | ⚠️ | ❌ | ✅ WelchChart | — |
| Outlier / anomalous rep flagging | ❌ | ❌ | ❌ | ✅ IQR+z-score | — |
| Paired t-test (scenario comparison) | ⚠️ manual | ✅ | ⚠️ | ✅ pairedTCI | — |
| 1D parametric sweep | ❌ | ✅ Experiment | ✅ | ✅ with CI ribbon | — |
| 2D parametric sweep | ❌ | ✅ | ⚠️ | ✅ heatmap grid | — |
| ANOVA / ranking & selection | ❌ | ⚠️ | ❌ | ❌ | Gap |
| Cost / ROI modelling | ❌ | ✅ | ✅ | ❌ | Gap |
| Histogram output (freq distribution) | ⚠️ manual | ✅ | ✅ | ⚠️ wait-time dist only | Gap |
| Entity-level data export | ⚠️ manual | ✅ | ✅ | ✅ entitySummary[] | — |
| Structured trace / event log export | ❌ | ⚠️ | ❌ | ✅ cycleLog[] | — |
| Run labelling, tagging, archiving | ❌ | ❌ | ❌ | ✅ run_label, tags, archived | — |
| Saved experiment configurations | ❌ | ✅ | ⚠️ | ✅ experiments table | — |

### E — Visual Authoring

| Feature | SimPy | AnyLogic | JaamSim | DES Studio | Gap? |
|---|---|---|---|---|---|
| Canvas-based process flow editor | ❌ | ✅ | ✅ | ✅ VisualDesignerPanel | — |
| Drag-and-drop entity type creation | ❌ | ✅ | ✅ | ✅ palette nodes | — |
| Form-based model editor (fallback) | ❌ | ✅ | ❌ | ✅ primary editor | — |
| Real-time execution animation | ❌ | ✅ | ✅ | ✅ SVG token animation | — |
| Live entity count overlays | ❌ | ✅ | ✅ | ✅ per-node counts | — |
| Inspector panel (node properties) | ❌ | ✅ | ✅ | ✅ per-type editors | — |
| Model validation with inline errors | ❌ | ✅ | ✅ | ✅ 11 V-rules | — |
| Charts / dashboards | ❌ | ✅ | ✅ | ✅ KPI cards, sweep charts | — |
| 2D spatial environment / layout | ❌ | ✅ | ✅ | ❌ | Gap |
| 3D environment / animation | ❌ | ✅ | ✅ | ❌ | Gap |
| GIS / map integration | ❌ | ✅ | ❌ | ❌ | Gap |
| Histogram / bar charts inline | ❌ | ✅ | ✅ | ⚠️ wait-time dist only | Gap |
| Time-plot / signal charts | ❌ | ✅ | ✅ | ⚠️ cumulative mean only | Gap |
| Model sharing / public gallery | ❌ | ❌ | ❌ | ✅ | — |
| Shareable results dashboard (URL) | ❌ | ⚠️ | ❌ | ✅ QR + hash route | — |
| AI-assisted model generation | ❌ | ❌ | ❌ | ✅ LLM authoring | — |
| Template library with metadata | ❌ | ✅ | ✅ | ✅ 14 templates, 6 domains | — |
| Community model gallery | ❌ | ⚠️ | ❌ | ✅ fork-to-run | — |
| In-browser (no install) | ❌ | ❌ | ❌ | ✅ | — |
| Keyboard navigation / accessibility | ❌ | ❌ | ❌ | ✅ ARIA, tabIndex | — |

### F — Scripting & Extensibility

| Feature | SimPy | AnyLogic | JaamSim | DES Studio | Gap? |
|---|---|---|---|---|---|
| General-purpose scripting language | ✅ Python | ✅ Java | ❌ | ❌ | Gap |
| Custom logic in process steps | ✅ yield | ✅ code blocks | ❌ | ❌ | **High Gap** |
| Custom condition expressions | ✅ Python | ✅ Java | ✅ input lang | ⚠️ token-based DSL | Gap |
| Clock value in conditions | ✅ env.now | ✅ | ✅ | ❌ | Gap |
| Custom distributions | ✅ any fn | ✅ | ✅ | ⚠️ Empirical / CSV only | Gap |
| Distribution fitting from data | ❌ | ❌ | ❌ | ✅ fitDistribution() | — |
| Macro / block extensibility | ❌ | ⚠️ | ❌ | ✅ MACROS registry | — |
| Safe execution (no code injection) | ❌ | ❌ | ❌ | ✅ no new Function() | — |
| Event listeners / callbacks | ✅ | ✅ | ❌ | ⚠️ phase hooks internal | Gap |
| Process-level interrupts | ✅ interrupt() | ✅ | ❌ | ❌ | Gap |
| Entity-to-entity events / rendezvous | ✅ | ✅ | ⚠️ | ❌ | Gap |
| External data import (DB / files) | ⚠️ manual | ✅ | ✅ | ✅ CSV import | — |
| API surface for embedding | ✅ Python API | ✅ | ❌ | ⚠️ buildEngine() internal | Gap |
| Headless / CLI execution | ✅ | ✅ | ✅ | ✅ Node.js | — |
| Seeded reproducibility | ⚠️ manual | ⚠️ | ⚠️ | ✅ mulberry32 contract | — |
| CSV empirical distributions | ❌ | ❌ | ❌ | ✅ | — |

---

## Section 2: Gap Register

| # | Feature | Category | Priority | Implementation Notes | Suggested Sprint |
|---|---|---|---|---|---|
| G01 | **Resource preemption** | B | **High** | High-priority entity interrupts a lower-priority entity currently in service. Requires preemption claim stack in server entity, interrupted entity re-queues with remaining service time. | Sprint 31 |
| G02 | **General-purpose scripting / custom process logic** | F | **High** | Users cannot write conditional loops, multi-step sequences, or arbitrary logic within a single entity's lifetime. The three-phase declarative model is architecturally intentional but limits certain use cases. Partial mitigation: structured C-event priority chain. | Sprint 33 |
| G03 | **Probabilistic / conditional routing** | A | **High** | Beyond overflow routing, no explicit Select-Output or Branch block. Workaround: separate queues + C-event conditions, but it's tedious. Suggest `ROUTE(EntityType, {prob: Q1, prob: Q2})` macro or routing-table UI. | Sprint 31 |
| G04 | **Resource breakdowns / failures** | B | **High** | No MTBF/MTTR modelling. Servers can only be idle or busy. Add `FAIL(ServerType)` and `REPAIR(ServerType)` macros + failed state; schedule via B-events. | Sprint 32 |
| G05 | **Clock value in conditions** | F | **Med** | `time() > 100` or `clock >= shiftEnd` cannot be expressed in condition tokens. Required for time-triggered logic without a dedicated B-event. Add `time()` as a reserved condition token. | Sprint 31 |
| G06 | **Entity splitting / cloning** | A | **Med** | No equivalent of AnyLogic Split or JaamSim EntitySplit. Needed for parallel service paths (e.g. sample sent to two labs). Suggest `SPLIT(EntityType, N, TargetQueue)` macro. | Sprint 32 |
| G07 | **Multiple resource types per task (co-seize)** | B | **Med** | A task requiring both a Nurse AND a Room simultaneously cannot be expressed. Requires a compound ASSIGN or SeizeSet concept. | Sprint 32 |
| G08 | **Custom / SPT queue comparator** | C | **Med** | Only FIFO/LIFO/PRIORITY available. Shortest Processing Time (SPT), Earliest Due Date (EDD), or user-defined sort keys are unsupported. Extend discipline enum + attribute-based sort key field. | Sprint 33 |
| G09 | **Batch size by condition / attribute** | C | **Med** | `BATCH(Queue, N)` requires a fixed integer N. Batching when entity.attrs.batchSize == 10, or batching all available, is not possible. | Sprint 33 |
| G10 | **Entity matching / synchronisation** | C | **Med** | No equivalent of AnyLogic Match block (pair entity A with entity B from a different queue). Needed for assembly models where two different part types must meet. | Sprint 32 |
| G11 | **WIP (work-in-progress) metric** | D | **Med** | In-flight entity count exists per-type but no cumulative WIP time-average (∫ WIP dt / T). Add to summary stats alongside avgWait. | Sprint 31 |
| G12 | **Histogram output for arbitrary metrics** | D | **Med** | Wait-time distribution returned for queues, but no histogram collector for custom metrics (e.g. batch size histogram, service time by entity type). | Sprint 33 |
| G13 | **ANOVA / ranking-and-selection** | D | **Med** | Multi-scenario comparison limited to paired t-test (two scenarios). No Bonferroni-corrected k-scenario ANOVA, no Indifference Zone selection procedure. | Sprint 33 |
| G14 | **Process-level interrupts** | F | **Med** | SimPy `process.interrupt()` enables one process to abort another mid-service. No DES Studio equivalent — needed for priority preemption and emergency stop scenarios. | Sprint 32 |
| G15 | **Inline time-plot / live signal chart** | E | **Med** | Queue-length and utilisation time series are collected but only the cumulative mean chart and sweep charts exist. A live time-plot panel (queue depth vs time) during execution would significantly aid model validation. | Sprint 31 |
| G16 | **Resource failure state in UI** | E | **Med** | Depends on G04. Once resource failures exist, the execute canvas needs a "failed" node state and failure log. | Sprint 32 |
| G17 | **Cost modelling** | D | **Low** | No cost-per-entity, cost-per-server-hour, or revenue calculation. AnyLogic and JaamSim support this natively. Implementable as user-defined state variables + custom scalar effects, but not guided. | Sprint 34 |
| G18 | **Jockeying** | C | **Low** | Entities moving between queues based on length comparisons. Extremely complex to implement; low practical demand for most modelling scenarios. | Backlog |
| G19 | **2D spatial layout / conveyor** | A | **Low** | Physical distance, travel time, conveyor belts, and transporters. Architectural addition (spatial coordinates on entities). Major scope — AnyLogic/JaamSim-class feature. | Backlog |
| G20 | **3D environment** | E | **Low** | Full 3D is out of scope for a browser-based tool. Not a gap for the target audience. | Backlog |
| G21 | **Container / level resource** | B | **Low** | SimPy Container models a continuous tank (fluid level). Needed for inventory level modelling. Implementable as a state variable with custom C-event guards, but not guided. | Sprint 34 |
| G22 | **GIS / map integration** | E | **Low** | Geographic routing and map layers. Out of scope for core DES. | Backlog |
| G23 | **Entity-to-entity rendezvous** | F | **Low** | One entity's process waiting on another specific entity's event. Rare in three-phase DES; most cases handled by shared queue + C-event. | Backlog |
| G24 | **Public embeddable API** | F | **Low** | `buildEngine()` is internal. A documented, stable public API for embedding DES Studio in other web apps would unlock integration use cases. | Sprint 34 |

---

## Section 3: Capability Summary

### A — Core Entity Model
DES Studio implements the essential entity lifecycle: typed entities with sampled attributes, multi-stage routing via RELEASE, recirculation tracking, and balking/reneging. It covers the patterns needed for the vast majority of service and manufacturing models. The two most impactful gaps are **probabilistic/conditional routing** (currently only overflow routing exists — a proper Branch/Select-Output macro would unlock a large class of models) and **entity splitting/cloning** (parallel sub-process paths). Entity conveyors and spatial movement are out of scope for the tool's browser-based positioning.

### B — Resource & Server Model
Server pools, multi-capacity types, shift schedules, dynamic capacity adjustment, and utilisation tracking are all solid. The critical missing capability is **preemption**: the ability for a higher-priority entity to interrupt an in-service lower-priority entity and reclaim the server. This is fundamental to a wide class of healthcare, emergency response, and manufacturing-interruption models. **Resource failures/breakdowns** (MTBF/MTTR cycles) represent the second most impactful gap — essential for reliability and maintenance modelling. Multi-resource co-seize (requiring both a nurse and a room simultaneously) is a medium-priority gap.

### C — Queueing & Scheduling
Queue discipline coverage (FIFO, LIFO, PRIORITY), finite capacity, balking, reneging, batching, and unbatching are all implemented and tested. DES Studio is ahead of SimPy here by providing these as first-class guided features. The main gap is **custom sort comparators** (SPT, EDD, attribute-based sort keys beyond a single numeric priority field) and **entity matching/synchronisation** (coordinating two different entity types from separate queues). Batch size by attribute and jockeying are lower-priority additions.

### D — Statistical Output
DES Studio's statistical output is arguably its strongest differentiator: 95% CI, batch means, paired t-test, 1D/2D parametric sweeps, warm-up with Welch's graphical test, anomalous replication flagging, run labelling/tagging/archiving, and saved experiment configurations are all implemented — capabilities that SimPy entirely lacks and AnyLogic only covers with its Experiments framework. The gaps to close are **WIP time-average** (a standard Little's Law statistic), **histogram collectors for arbitrary metrics**, and **multi-scenario ANOVA** (currently limited to pairwise comparison).

### E — Visual Authoring
The visual authoring surface is comprehensive for a browser-based tool: canvas DAG editor, real-time token animation, per-node live counts, structured trace/event log, entity inspector, KPI cards, sweep charts, and a model gallery with sharing and forking. The notable absence vs AnyLogic/JaamSim is a **live time-plot panel** (queue depth and utilisation over simulation time) — this would be the highest-impact UI addition. 2D spatial layouts and 3D environments are out of scope for the tool's positioning.

### F — Scripting & Extensibility
DES Studio makes a deliberate safety-first choice: all logic is expressed through a declarative macro and condition token system with no `new Function()` or `eval()`. This prevents code injection and makes the tool accessible to non-programmers, but it means **sequential process logic** (loops, conditionals, multi-step waiting within a single entity's lifetime) is not expressible — a fundamental architectural constraint that SimPy Python and AnyLogic Java code blocks resolve trivially. The most actionable near-term fix is adding **`time()` as a condition token** (clock-aware guards) and **custom condition expressions** beyond the current fixed-token DSL. The macro registry and distribution registry are already open to extension without touching engine internals.

---

## Section 4: Recommended Next Sprints

### Sprint 31 — Core Expressiveness (High-Impact, Low-Risk)

**Goal:** Close the highest-frequency gaps that limit real model expressiveness with targeted, safe additions.

| Feature | Gap # | Approach |
|---|---|---|
| Probabilistic / conditional routing macro | G03 | Add `ROUTE(Type, {Queue1: p1, Queue2: p2})` macro to MACROS registry; C-event effect; routing table UI in C-event editor |
| Clock value in conditions | G05 | Add `time()` as a reserved token in evalCondition; maps to current `clock` value |
| WIP time-average metric | G11 | Track cumulative `∫ WIP dt` in engine step loop; expose in summary as `avgWIP` |
| Live queue-depth time-plot | G15 | New chart panel in Execute bottom bar using existing `_timeSeries[]` data; line chart per queue/server type |

**Exit gate:** All 4 features tested; no regressions; 2 new templates demonstrating routing.

---

### Sprint 32 — Resource Reliability (High-Impact, Moderate Complexity)

**Goal:** Add resource failure/repair cycles and multi-resource co-seize — the two biggest resource modelling gaps.

| Feature | Gap # | Approach |
|---|---|---|
| Resource preemption | G01 | New server state `preempted`; `PREEMPT(ServerType)` macro; interrupted entity re-queues with remaining service in `_remainingService`; schedule resume B-event |
| Resource breakdowns / failures | G04 | Add `failed` server state; `FAIL(ServerType)` and `REPAIR(ServerType)` macros; MTBF/MTTR scheduled as recurring B-events on server entity types; failed server excluded from `idle(Type).count` |
| Entity splitting / cloning | G06 | `SPLIT(Type, N, TargetQueue)` macro; creates N child entities in target queue, marks parent as split |
| Multi-resource co-seize | G07 | `ASSIGN(Queue, [Server1, Server2])` compound form; condition: `idle(Server1).count > 0 AND idle(Server2).count > 0` |

**Exit gate:** Hospital emergency template demonstrating preemption; manufacturing template demonstrating breakdown/repair; all 1000+ tests passing.

---

### Sprint 33 — Advanced Scheduling & Analytics (Medium-Impact)

**Goal:** Extend queue discipline options, batch flexibility, and multi-scenario statistical analysis.

| Feature | Gap # | Approach |
|---|---|---|
| Custom queue sort key (SPT, EDD, attr-based) | G08 | Add `sortKey` field to queue config; `PRIORITY(attrName)` discipline variant; extend `sortWaitingEntities()` |
| Batch size by attribute or condition | G09 | `BATCH(Queue, attrName)` form reads batch size from first entity's attribute; or `BATCH(Queue, condition)` |
| Entity matching / synchronisation | G10 | `MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue)` macro; waits for one of each; pairs them as a combined entity |
| Histogram collector for custom metrics | G12 | Add `HISTOGRAM(metricName, value, buckets)` macro; stored in `summary.histograms`; rendered as bar chart in results |
| ANOVA / multi-scenario comparison | G13 | Extend sweep results to run Bonferroni-corrected pairwise CIs across k scenarios; ranking table in Results Workspace |
| General-purpose scripting (Phase 1) | G02 | Introduce computed-value expressions: arithmetic on entity attrs, state variables, and time() in effect strings; e.g. `ASSIGN(Queue, Server) WHERE entity.attrs.type == 'urgent'` |

**Exit gate:** At least 2 new templates exercising SPT and MATCH; histogram panel visible in results; ANOVA comparison table rendered.

---

## Appendix: Coverage Summary

| Category | Features Assessed | DES Studio ✅ | DES Studio ⚠️ | DES Studio ❌ | Coverage % |
|---|---|---|---|---|---|
| A — Core entity model | 14 | 8 | 3 | 3 | 64% |
| B — Resource & server model | 14 | 8 | 2 | 4 | 64% |
| C — Queueing & scheduling | 19 | 12 | 1 | 6 | 68% |
| D — Statistical output | 24 | 19 | 2 | 3 | 83% |
| E — Visual authoring | 21 | 15 | 2 | 4 | 74% |
| F — Scripting & extensibility | 16 | 8 | 3 | 5 | 56% |
| **Total** | **108** | **70** | **13** | **25** | **76%** |

*Coverage % = (✅ + 0.5×⚠️) / Total*

**Top 5 highest-priority gaps:**
1. G01 — Resource preemption (B, High)
2. G02 — General-purpose scripting / custom process logic (F, High)
3. G03 — Probabilistic / conditional routing (A, High)
4. G04 — Resource breakdowns / failures (B, High)
5. G05 — Clock value in conditions (F, Med — quick win)
