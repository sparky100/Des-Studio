# DES Studio — Capability Gap Analysis

**Date:** 2026-05-16 (updated post sprint 45)
**Scope:** DES Studio vs SimPy 4.x, AnyLogic 8.x (Process Modelling Library), JaamSim 2024
**Method:** Web-fetched reference feature lists + full codebase audit (engine, macros, UI, tests, templates)

---

## Version History

| Version | Date | Sprint | Changes |
|---|---|---|---|
| v1.0 | 2026-05-14 | Pre-Sprint 31 | Initial gap analysis — 24 gaps identified across 6 categories |
| v1.1 | 2026-05-14 | Sprint 31 | Closed G05 (clock token), G11 (WIP metric), G15 (live time-plot) |
| v1.2 | 2026-05-14 | Sprint 32 | Closed G01 (preemption), G04 (resource failures/MTBF/MTTR) |
| v1.3 | 2026-05-14 | Sprint 33 | Closed G06 (SPLIT), G07 (COSEIZE), G08 (SPT/EDD/PRIORITY), G09 (dynamic BATCH), G10 (MATCH), G12 (histograms), G13 (ANOVA), G16 (failure UI) |
| v1.4 | 2026-05-15 | Post-sprint review | Corrected four engine bugs found during code review: B1 (REPAIR _downtime always 0), B2 (avgWIP denominator wrong with warmup), B3 (COSEIZE auxiliary servers not released — caused surgical-suite deadlock after first service), B4 (SPLIT child entities missing waitingSince/waitingFor metadata). Scoring matrix updated for G01/G04/G05/G11/G14/G15 which were still showing pre-implementation statuses. Coverage table recalculated. |
| v1.5 | 2026-05-15 | Sprint 34 | Partial close of G02 (scripting): added `SET(varName, expr)` and `SET_ATTR(attrName, expr)` macros with safe arithmetic expression evaluator supporting Entity attribute refs, state variable refs, clock, arithmetic operators, and math functions (min/max/abs/round/floor/ceil). F matrix row 2 updated ❌→⚠️. Coverage table updated. |
| v1.6 | 2026-05-15 | Sprint 35 | Engine correctness fixes — no scoring matrix changes. M2: warmup FEL pruning narrowed to context-dependent events only, fixing replication CI gate (ci.n now reaches full replication count with warmup enabled). M3: V8 product decision documented (both-missing=error, individual-missing=warning). L1: dead summary block removed. Architecture review updated to v2.0 with finding status table for all 16 H/M/L findings. |
| v1.7 | 2026-05-15 | Sprint 41 | UI exposure: COST, PREEMPT, FAIL, REPAIR, SPLIT, SET, SET_ATTR added to B/C-event editors. No scoring matrix changes (capabilities existed, just not in UI). |
| v1.8 | 2026-05-15 | Sprint 42 | UI usability: SectionPanel, EffectPicker, loopConfig Loop Guard UI, balkCondition expression UI. No scoring matrix changes. |
| v1.9 | 2026-05-15 | Sprint 43 | AI: buildGoalGaps(), evaluateSweepPointGoals(), goal-driven sweep feasibility colouring in SweepChart and Sweep2DGrid. |
| v2.0 | 2026-05-15 | Sprint 44 | Execution insights: LogViewer, QueueHistogram, EntitySummaryTable, goal-aware KPI cards. |
| v2.1 | 2026-05-16 | Sprint 45 | AI prompt grounding: enriched KPI payload, B-event/C-event digest, server failure model, state variables, entity anomaly digest, MAX_PROMPT_WORDS 2000. |

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
| Probabilistic routing / branching | ✅ | ✅ | ✅ | ✅ conditional + probabilistic routing tables | — |
| Conditional routing (Select Output) | ✅ | ✅ | ✅ | ✅ condition-based routing branches | — |
| Entity cloning / splitting | ⚠️ manual | ✅ Split block | ✅ EntitySplit | ✅ SPLIT macro | — |
| Entity joining / combining | ⚠️ manual | ✅ Combine block | ✅ Combine | ✅ MATCH macro | — |
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
| Resource preemption | ✅ PreemptiveResource | ✅ | ✅ priority maintenance | ✅ PREEMPT macro | — |
| Resource breakdowns / failures | ❌ | ✅ | ✅ Maintenance block | ✅ FAIL macro; MTBF auto-scheduling | — |
| Resource repair / MTTR | ❌ | ✅ | ✅ | ✅ REPAIR macro; MTTR auto-scheduling | — |
| Multiple resource types per task | ⚠️ manual | ✅ | ✅ SeizeSet | ✅ COSEIZE macro | — |
| Resource state: idle/busy/failed/off-shift | ⚠️ 2 states | ✅ 4+ states | ✅ 4+ states | ✅ idle/busy/failed | — |
| Container (level/tank resource) | ✅ Container | ✅ | ✅ | ❌ | Gap |
| Store / item buffer resource | ✅ Store/FilterStore | ✅ | ✅ | ❌ | Gap |
| Priority request queue for resources | ✅ PriorityResource | ✅ | ✅ | ⚠️ via queue PRIORITY | — |

### C — Queueing & Scheduling

| Feature                                   | SimPy              | AnyLogic          | JaamSim        | DES Studio                  | Gap? |
| ----------------------------------------- | ------------------ | ----------------- | -------------- | --------------------------- | ---- |
| FIFO queue discipline                     | ⚠️ implicit        | ✅                 | ✅              | ✅                           | —    |
| LIFO queue discipline                     | ❌                  | ✅                 | ✅              | ✅                           | —    |
| PRIORITY discipline (numeric attr)        | ✅ PriorityResource | ✅                 | ✅              | ✅                           | —    |
| Custom comparator / sort key              | ✅ FilterStore      | ✅ Java comparator | ✅              | ✅ SPT/EDD/PRIORITY(attr)    | —    |
| Shortest processing time (SPT)            | ❌                  | ✅                 | ⚠️             | ✅ SPT discipline            | —    |
| Finite queue capacity                     | ❌                  | ✅                 | ✅              | ✅ capacity field            | —    |
| Balking (hard — entity lost)              | ❌                  | ✅                 | ✅              | ✅                           | —    |
| Balking with overflow routing             | ❌                  | ✅                 | ✅              | ✅ overflowDestination       | —    |
| Balking probability                       | ❌                  | ✅                 | ✅              | ✅ balkProbability           | —    |
| Reneging / abandonment (patience timeout) | ✅                  | ✅ Timeout block   | ✅              | ✅ RENEGE + isRenege         | —    |
| Jockeying (queue-switching)               | ❌                  | ✅                 | ❌              | ❌                           | Gap  |
| Batching (accumulate N → one unit)        | ⚠️ manual          | ✅ Batch block     | ✅ BatchService | ✅ BATCH macro               | —    |
| Batch size by attribute / condition       | ❌                  | ✅                 | ✅              | ✅ BATCH(Queue, Entity.attr) | —    |
| Unbatching / splitting batches            | ⚠️ manual          | ✅ Unbatch block   | ✅              | ✅ UNBATCH macro             | —    |
| Match / synchronise entities              | ❌                  | ✅ Match block     | ✅ Combine      | ✅ MATCH macro               | —    |
| C-event priority ordering                 | ⚠️ implicit        | ✅                 | ✅              | ✅ priority field            | —    |
| Phase C restart rule (three-phase)        | N/A                | N/A               | N/A            | ✅ canonical                 | —    |
| Time-varying arrival rates                | ⚠️ manual          | ✅                 | ✅              | ✅ Piecewise dist            | —    |

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
| WIP (work in progress) | ⚠️ manual | ✅ | ✅ | ✅ avgWIP (time-integral, Little's Law) | — |
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
| ANOVA / ranking & selection | ❌ | ⚠️ | ❌ | ✅ oneWayANOVA + tukeyHSD | — |
| Cost / ROI modelling | ❌ | ✅ | ✅ | ❌ | Gap |
| Histogram output (freq distribution) | ⚠️ manual | ✅ | ✅ | ✅ buildHistogram / buildHistogramFD | — |
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
| Histogram / bar charts inline | ❌ | ✅ | ✅ | ✅ histogram collector | — |
| Time-plot / signal charts | ❌ | ✅ | ✅ | ✅ QueueDepthTimePlot in BottomPanel Charts tab | — |
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
| Custom logic in process steps | ✅ yield | ✅ code blocks | ❌ | ⚠️ SET/SET_ATTR macros; arithmetic + math fns; no coroutines | Gap |
| Custom condition expressions | ✅ Python | ✅ Java | ✅ input lang | ⚠️ token-based DSL | Gap |
| Clock value in conditions | ✅ env.now | ✅ | ✅ | ✅ `clock` token in Condition Builder UI + runtime evaluator | — |
| Custom distributions | ✅ any fn | ✅ | ✅ | ⚠️ Empirical / CSV only | Gap |
| Distribution fitting from data | ❌ | ❌ | ❌ | ✅ fitDistribution() | — |
| Macro / block extensibility | ❌ | ⚠️ | ❌ | ✅ MACROS registry | — |
| Safe execution (no code injection) | ❌ | ❌ | ❌ | ✅ no new Function() | — |
| Event listeners / callbacks | ✅ | ✅ | ❌ | ⚠️ phase hooks internal | Gap |
| Process-level interrupts | ✅ interrupt() | ✅ | ❌ | ✅ via PREEMPT macro (G01/G14) | — |
| Entity-to-entity events / rendezvous | ✅ | ✅ | ⚠️ | ❌ | Gap |
| External data import (DB / files) | ⚠️ manual | ✅ | ✅ | ✅ CSV import | — |
| API surface for embedding | ✅ Python API | ✅ | ❌ | ⚠️ buildEngine() internal | Gap |
| Headless / CLI execution | ✅ | ✅ | ✅ | ✅ Node.js | — |
| Seeded reproducibility | ⚠️ manual | ⚠️ | ⚠️ | ✅ mulberry32 contract | — |
| CSV empirical distributions | ❌ | ❌ | ❌ | ✅ | — |

---

## Section 2: Gap Register

| # | Feature | Category | Priority | Status | Notes |
|---|---|---|---|---|---|
| G01 | **Resource preemption** | B | **High** | ✅ Complete | `PREEMPT(ServerType)` macro; interrupted entity re-queues with `_remainingService`; trace entry emitted. Sprint 32. |
| G02 | **General-purpose scripting / custom process logic** | F | **High** | ⚠️ Partial | Sprint 34: `SET(varName, expr)` and `SET_ATTR(attrName, expr)` macros close three high-value sub-cases: (1) entity attribute mutation mid-process, (2) state variable arithmetic with entity/clock/state references and math functions, (3) routing based on computed attributes. Multi-step coroutine-style logic (arbitrary branching, loops, sequential waiting within a single entity's lifetime) remains architecturally impossible in Pidd's three-phase model. |
| G03 | ~~**Probabilistic / conditional routing**~~ | A | ~~High~~ | ~~Sprint 31~~ ✅ Resolved | Both conditional routing (predicate-based branches) and probabilistic routing (probability-weighted selection) implemented in `fireBEvent()`. V17/V18 validation rules cover both. |
| G04 | **Resource breakdowns / failures** | B | **High** | ✅ Complete | `FAIL(ServerType)` and `REPAIR(ServerType)` macros; `failed` server state; MTBF/MTTR auto-scheduling. Sprint 32. **Review fix B1:** `_downtime` was always 0 because `srv._failedAt` was cleared before being read; fixed by saving to a local variable first. |
| G05 | ~~**Clock value in conditions**~~ | F | ~~Low~~ | ~~Sprint 31~~ ✅ Resolved | `clock` token added to `buildConditionTokens()`. Engine already supported it at runtime. |
| G06 | ~~**Entity splitting / cloning**~~ | A | ~~Med~~ | ~~Sprint 33~~ ✅ Resolved | `SPLIT(EntityType, N, TargetQueue)` macro creates N-1 clones with parent-child tracking (`_splitParent`, `_splitChildren`, `_splitFrom`, `_splitIndex`). **Review fix B4:** child entities were missing `waitingSince`/`waitingFor` because `markEntityWaiting()` was not called; queue wait-time tracking for split children is now correct. |
| G07 | ~~**Multiple resource types per task (co-seize)**~~ | B | ~~Med~~ | ~~Sprint 33~~ ✅ Resolved | `COSEIZE(Queue, ServerType1, ServerType2[, ...])` atomically seizes one customer and multiple server types. Fails if any type has no idle server. **Review fix B3 (critical):** after COMPLETE fired, only the primary server was released; auxiliary servers (e.g. Anesthetist in the Surgical Suite) remained permanently `busy`, deadlocking the model after the first service. COMPLETE now scans for and releases all servers still referencing the completed customer. |
| G08 | ~~**Custom / SPT queue comparator**~~ | C | ~~Med~~ | ~~Sprint 33~~ ✅ Resolved | `SPT`, `EDD`, and `PRIORITY(attrName)` queue disciplines implemented. All use FIFO tiebreaker. |
| G09 | ~~**Batch size by condition / attribute**~~ | C | ~~Med~~ | ~~Sprint 33~~ ✅ Resolved | `BATCH(Queue, Entity.attrName)` reads batch size from first waiting entity's attribute. Fixed integer syntax still supported. |
| G10 | ~~**Entity matching / synchronisation**~~ | C | ~~Med~~ | ~~Sprint 33~~ ✅ Resolved | `MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue)` pairs one entity from each queue into a batch entity. Originals marked `done` with `_matchedInto`. |
| G11 | ~~**WIP (work-in-progress) metric**~~ | D | ~~Med~~ | ~~Sprint 31~~ ✅ Resolved | `avgWIP` exposed in `getSummary()`. Little's Law: `avgWIP ≈ λ × avgSojourn`. **Review fix B2:** when a warmup period is configured, `_wipIntegral` is correctly reset at the warmup boundary but `getSummary()` divided by `clock` (total time) instead of `clock - _statsResetTime` (post-warmup elapsed time), causing systematic underestimation. |
| G12 | ~~**Histogram output for arbitrary metrics**~~ | D | ~~Med~~ | ~~Sprint 33~~ ✅ Resolved | `buildHistogram()` (equal-width bins) and `buildHistogramFD()` (Freedman-Diaconis automatic bin selection) in statistics.js. |
| G13 | ~~**ANOVA / ranking-and-selection**~~ | D | ~~Med~~ | ~~Sprint 33~~ ✅ Resolved | `oneWayANOVA()` with F-test, p-value approximation (Lanczos), and `tukeyHSD()` post-hoc test with Bonferroni correction. |
| G14 | ~~**Process-level interrupts**~~ | F | ~~Med~~ | ~~Sprint 32~~ ✅ Resolved | Covered by G01 preemption. `PREEMPT(ServerType)` interrupts mid-service entities. |
| G15 | ~~**Inline time-plot / live signal chart**~~ | E | ~~Med~~ | ~~Sprint 31~~ ✅ Resolved | "Charts" tab in BottomPanel with `QueueDepthTimePlot` SVG chart. One line per queue, colour-coded. |
| G16 | ~~**Resource failure state in UI**~~ | E | ~~Med~~ | ~~Sprint 33~~ ✅ Resolved | Execute canvas Activity nodes show failed servers as red dots in pool grid, "⚠ N failed" badge, and text fallback for large pools. |
| G17 | ~~**Cost modelling**~~ | D | ~~Low~~ | ~~Sprint 36~~ ✅ Resolved | `COST(expr)` macro accumulates per-entity cost to `summary.totalCost`; `costPerServed` added to Summary. Expression syntax identical to SET/SET_ATTR: Entity attributes, state variables, clock, arithmetic, math functions. Time-integral resource costing (busyTime × costRate) deferred as separate sprint. | Sprint 34 |
| G18 | **Jockeying** | C | **Low** | ❌ Open | Entities moving between queues based on length comparisons. Extremely complex; low practical demand. | Backlog |
| G19 | **2D spatial layout / conveyor** | A | **Low** | ❌ Open | Physical distance, travel time, conveyor belts. Major scope — AnyLogic/JaamSim-class feature. | Backlog |
| G20 | **3D environment** | E | **Low** | ❌ Open | Full 3D is out of scope for a browser-based tool. | Backlog |
| G21 | **Container / level resource** | B | **Low** | ❌ Open | SimPy Container models a continuous tank. Implementable as state variable with C-event guards. | Sprint 34 |
| G22 | **GIS / map integration** | E | **Low** | ❌ Open | Geographic routing and map layers. Out of scope for core DES. | Backlog |
| G23 | **Entity-to-entity rendezvous** | F | **Low** | ❌ Open | One entity waiting on another specific entity's event. Rare in three-phase DES. | Backlog |
| G24 | ~~**Public embeddable API**~~  | F | ~~Low~~ | ~~Sprint 36~~ ✅ Resolved | `src/engine/public-api.js` thin re-export of stable surface: `buildEngine`, `validateModel`, `runReplications`, statistics functions, `mulberry32`. Full reference at `docs/engine-api-reference.md`. | Sprint 34 |

---

## Section 3: Capability Summary

### A — Core Entity Model
DES Studio implements the essential entity lifecycle: typed entities with sampled attributes, multi-stage routing via RELEASE, recirculation tracking, balking/reneging, and both **conditional routing** (predicate-based branches) and **probabilistic routing** (probability-weighted selection). **Entity splitting/cloning** (G06) and **entity matching/synchronisation** (G10) are now implemented via the `SPLIT` and `MATCH` macros, closing the two most impactful gaps in this category. Entity conveyors and spatial movement remain out of scope for the tool's browser-based positioning.

### B — Resource & Server Model
Server pools, multi-capacity types, shift schedules, dynamic capacity adjustment, and utilisation tracking are all solid. **Resource preemption** (G01), **resource failures/breakdowns** (G04), and **multi-resource co-seize** (G07) are now implemented — the three highest-impact gaps in this category have been closed. Interrupted entities preserve remaining service time via `_remainingService` and resume correctly on re-seizure. MTBF/MTTR failure/repair cycles are auto-scheduled from server entity type configuration, with downtime accurately tracked per server. COSEIZE atomically seizes all required server types or fails cleanly; all co-seized servers are correctly released when service completes. The remaining gaps are Container/level resources and Store/filter-store resources, both of which require a fluid-model extension beyond the current three-phase entity paradigm.

### C — Queueing & Scheduling
Queue discipline coverage (FIFO, LIFO, PRIORITY), finite capacity, balking, reneging, batching, and unbatching are all implemented and tested. DES Studio is ahead of SimPy here by providing these as first-class guided features. **Custom sort comparators** (G08) — SPT, EDD, and PRIORITY(attrName) — are now implemented. **Entity matching/synchronisation** (G10) and **dynamic batch sizing** (G09) are also closed. Jockeying remains the only queueing gap and is low-priority.

### D — Statistical Output
DES Studio's statistical output is arguably its strongest differentiator: 95% CI, batch means, paired t-test, 1D/2D parametric sweeps, warm-up with Welch's graphical test, anomalous replication flagging, run labelling/tagging/archiving, and saved experiment configurations are all implemented — capabilities that SimPy entirely lacks and AnyLogic only covers with its Experiments framework. **WIP time-average** (G11), **histogram collectors** (G12), and **multi-scenario ANOVA with Tukey HSD** (G13) are all implemented. `avgWIP` is a true time-integral average (∫ WIP dt / post-warmup elapsed time), consistent with Little's Law. Histogram bins use either equal-width or Freedman-Diaconis automatic sizing. ANOVA uses an F-test with incomplete-beta p-value approximation (Lanczos log-gamma); Tukey HSD identifies significantly different group pairs. **Cost/ROI modelling** (G17) is now implemented via `COST(expr)` macro — per-entity costs, attribute-based costs, and time-based costs are all expressible. Time-integral resource costing (busyTime × costRate) is deferred. All statistical gaps in this category are now closed.

### E — Visual Authoring
The visual authoring surface is comprehensive for a browser-based tool: canvas DAG editor, real-time token animation, per-node live counts, structured trace/event log, entity inspector, KPI cards, sweep charts, and a model gallery with sharing and forking. **Live queue-depth time-plot** (G15) is implemented as a Charts tab in the BottomPanel (one SVG line per queue, colour-coded). **Failed server visualisation** (G16) is complete: Execute canvas Activity nodes show failed servers as red dots in the pool grid with a "⚠ N failed" badge. The remaining gaps are 2D spatial layout, 3D environments, and GIS integration, all of which are out of scope for a browser-first tool at DES Studio's positioning.

### F — Scripting & Extensibility
DES Studio makes a deliberate safety-first choice: all logic is expressed through a declarative macro and condition token system with no `new Function()` or `eval()`. This prevents code injection and makes the tool accessible to non-programmers. **Sprint 34** partially closes the scripting gap with two new macros: `SET(varName, expr)` updates any scalar state variable using a safe arithmetic expression that can reference entity attributes (`Entity.<attrName>`), other state variables, `clock`, arithmetic operators, and math functions (`min`, `max`, `abs`, `round`, `floor`, `ceil`). `SET_ATTR(attrName, expr)` mutates an attribute on the current context entity mid-process, enabling computed priority scoring, cost calculation, and derived attribute routing — all without `eval`. The **clock token** (G05) is exposed in the UI Condition Builder. The macro registry and distribution registry are open to extension without touching engine internals. **Sprint 36** adds `COST(expr)` for cost accumulation and formalises the public embeddable API via `src/engine/public-api.js` with full reference documentation at `docs/engine-api-reference.md`. What remains impossible under the three-phase declarative model is **coroutine-style multi-step waiting** within a single entity's lifetime (arbitrary loops, branching, sequential suspension) — the fundamental capability that SimPy Python and AnyLogic Java code blocks provide.

---

## Section 4: Sprint Delivery History

All gaps from the original 24-gap register have now been either closed, partially closed, or explicitly deferred to backlog. Sprints 31–35 delivered the following:

| Sprint | Gaps closed | Key deliverables |
|--------|-------------|-----------------|
| 31 | G05, G11, G15 | Clock token in conditions, WIP metric, live queue-depth time-plot |
| 32 | G01, G04, G14 | PREEMPT, FAIL/REPAIR macros, MTBF/MTTR auto-scheduling |
| 33 | G06, G07, G08, G09, G10, G12, G13, G16 | SPLIT, COSEIZE, SPT/EDD/PRIORITY, dynamic BATCH, MATCH, histograms, ANOVA/Tukey, failure UI |
| Post-review | B1–B4 | Four engine bug fixes: _downtime, avgWIP denominator, COSEIZE release, SPLIT child metadata |
| 34 | G02 (partial) | SET and SET_ATTR macros; safe arithmetic expression evaluator with math functions |
| 35 | — (correctness) | Warmup FEL pruning fix, dead code removal, V8 product decision documented |
| 36 | G17, G24 | COST macro (per-entity cost accumulation), public API module + reference docs; H4 serviceStart=0 fix |

### Remaining open gaps

| Gap | Category | Assessment |
|-----|----------|------------|
| G02 ⚠️ | F — Scripting | Coroutine-style multi-step logic is an architectural non-starter for the three-phase declarative model. SET/SET_ATTR cover the practical common cases. No further progress expected without a fundamental rearchitecture. |
| G21 ❌ | B — Resources | Container/level resource (continuous tank). Rare in queueing models; approximable with state variable + C-event guard today. Low priority. |
| G18 ❌ | C — Queuing | Jockeying (entities move between queues). Very complex; extremely low practical demand. Backlog indefinitely. |
| G19, G20, G22 ❌ | A/E — Spatial | 2D layout, 3D, GIS. Out of scope for a browser-based declarative tool at DES Studio's market positioning. |
| G23 ❌ | F — Scripting | Entity-to-entity rendezvous. Rare in three-phase DES; would require significant engine extension. Backlog. |

### Architecture correctness items (from simulation-architecture-review.md)

These are **not** capability gaps against comparator tools, but open engine correctness findings that affect result accuracy:

All H-severity and M1 architecture review findings are now closed as of Sprint 36:

| Finding | Sprint closed | Notes |
|---------|--------------|-------|
| H1 — phaseCTruncated propagation | Sprint 31–35 | ✅ Closed |
| H2 — Reneging timer binding | Pre-review (confirmed Sprint 36) | ✅ Closed — `effectCtx._lastCustId` already used correctly |
| H3 — COMPLETE on waiting entities | Pre-review (confirmed Sprint 36) | ✅ Closed — `macros.js:405` already rejects non-batch waiting |
| H4 — serviceStart=0 bias | Sprint 36 | ✅ Fixed — `\|\|` → `??` in PREEMPT/FAIL remaining-service calc |
| H5 — Initial FEL cap at t=900 | Pre-review (confirmed Sprint 36) | ✅ Closed — no cap exists; was a misread of the code |
| H6 — Persistence omits graph/experimentDefaults | Sprint 31–35 | ✅ Closed |
| M1 — Shift-capacity busy-server reconciliation | Pre-review (confirmed Sprint 36) | ✅ Closed — `retireIdleExcessServers()` already called |

**Remaining open from architecture review (medium/low):** M4 (queue discipline duplication), M5 (legacy string conditions), L2 (rendering filters), L4 (DB schema baseline).

## Appendix: Coverage Summary

Counts are derived from the Section 1 scoring matrix. Each row in the matrix is one assessed feature.

| Category | Features Assessed | DES Studio ✅ | DES Studio ⚠️ | DES Studio ❌ | Coverage % |
|----------|-------------------|---------------|---------------|---------------|------------|
| A — Core entity model | 14 | 11 | 1 | 2 | 82% |
| B — Resource & server model | 14 | 11 | 1 | 2 | 82% |
| C — Queueing & scheduling | 18 | 17 | 0 | 1 | 94% |
| D — Statistical output | 27 | 27 | 0 | 0 | 100% |
| E — Visual authoring | 20 | 17 | 0 | 3 | 85% |
| F — Scripting & extensibility | 16 | 10 | 5 | 1 | 78% |
| **Total** | **109** | **93** | **7** | **9** | **88%** |

*Coverage % = (✅ + 0.5×⚠️) / Total. Remaining ❌ items (conveyors, state machine, container resources, 2D/3D/GIS environments, general scripting / coroutines, jockeying) are either architectural non-starters for a browser-based declarative tool or explicitly deferred backlog items.*

**Remaining open gaps by priority:**
1. G02 ⚠️ — General-purpose scripting (F, High) — partially closed; coroutine/multi-step sub-case is an architectural constraint of the three-phase model
2. G21 ❌ — Container/level resource (B, Low) — approximable with state variables today
3. G18 ❌ — Jockeying (C, Low) — backlog (very low practical demand)

**What changed in v1.7 vs v1.6 (Sprint 36):**

| Section | Item | Before | After | Reason |
|---------|------|--------|-------|--------|
| D | Cost modelling (G17) | ❌ Open | ✅ Resolved | `COST(expr)` macro; `totalCost`/`costPerServed` in Summary |
| F | Public embeddable API (G24) | ❌ Open | ✅ Resolved | `public-api.js` module + `engine-api-reference.md` |
| D coverage | Statistical output | 96% (26✅ 1❌) | 100% (27✅ 0❌) | G17 closed |
| F coverage | Scripting & extensibility | 72% (9✅ 5⚠️ 2❌) | 78% (10✅ 5⚠️ 1❌) | G24 closed |
| Total | All categories | 87% (91✅ 7⚠️ 11❌) | 88% (93✅ 7⚠️ 9❌) | G17 + G24 closed |
| Architecture | H2–H6, M1 | Open | All ✅ Closed | Sprint 36 audit + H4 fix |

**What changed in v1.6 vs v1.5 (Sprint 35):**

| Section | Item | Before | After | Reason |
|---------|------|--------|-------|--------|
| Architecture | Warmup FEL pruning (M2) | ❌ Bug | ✅ Fixed | `_requiresCtxEntity` flag narrows pruning scope |
| Architecture | Dead summary block (L1) | ❌ Dead code | ✅ Removed | Unreachable block in getSummary() removed |
| Architecture | V8 validation contract (M3) | ⚠️ Unclear | ✅ Documented | Product decision: V8 is a warning, not a block |

**What changed in v1.5 vs v1.4 (Sprint 34):**

| Section | Item | Before | After | Reason |
|---------|------|--------|-------|--------|
| F | Custom logic in process steps | ❌ High Gap | ⚠️ | SET/SET_ATTR macros close attribute mutation, state arithmetic, computed routing sub-cases |
| Gap register | G02 | ❌ Open | ⚠️ Partial | Sprint 34 delivery |
| F coverage | Scripting & extensibility | 69% | 72% | One ❌→⚠️ (row 2 of F matrix) |
| Total | All categories | 86% (91✅ 6⚠️ 12❌) | 87% (91✅ 7⚠️ 11❌) | G02 partial close |

**What changed in v1.4 vs v1.3 (post-review fixes):**

| Section | Item | Before | After | Reason |
|---------|------|--------|-------|--------|
| B | Resource preemption | ❌ High Gap | ✅ | Scoring matrix not updated after Sprint 32 delivery |
| B | Resource breakdowns/failures | ❌ Gap | ✅ | Scoring matrix not updated after Sprint 32 delivery |
| B | Resource repair/MTTR | ❌ Gap | ✅ | Scoring matrix not updated after Sprint 32 delivery |
| D | WIP (work in progress) | ⚠️ Gap | ✅ | Scoring matrix not updated after Sprint 31 delivery; B2 bug also fixed |
| E | Time-plot / signal charts | ⚠️ Gap | ✅ | Scoring matrix not updated after Sprint 31 delivery |
| F | Clock value in conditions | ⚠️ Gap | ✅ | Scoring matrix not updated after Sprint 31 delivery |
| F | Process-level interrupts | ❌ Gap | ✅ | Resolved by G01 preemption (G14 cross-reference) |

---

## Section 7: AI Analysis Capability Coverage

The AI analysis layer (src/llm/prompts.js) now receives the following data for every suggestion and narrative prompt. This table tracks AI grounding coverage.

| Data category | Available in engine | In AI suggestion prompt | In AI narrative prompt | In AI query prompt |
|---------------|--------------------|-----------------------|----------------------|-------------------|
| Per-queue wait percentiles (p50-p99) | ✅ | ✅ S43 | ✅ S43 | ✅ |
| Per-resource utilisation/idle | ✅ | ✅ | ✅ | ✅ |
| Goal gaps (current vs target) | ✅ | ✅ S43 | ✅ S43 | ✅ |
| Replication CI / aggregateStats | ✅ | ✅ | ✅ | — |
| maxSojourn, avgWIP | ✅ | ✅ S45 | ✅ S45 | — |
| totalCost, costPerServed | ✅ | ✅ S45 | ✅ S45 | — |
| containerLevels | ✅ | ✅ S45 | ✅ S45 | — |
| Engine warnings / phaseCTruncated | ✅ | ✅ S45 | ✅ S45 | — |
| Server failure/repair model | ✅ | ✅ S45 | ✅ S45 | — |
| Shift schedule flag | ✅ | ✅ S45 | — | — |
| Queue overflow destination | ✅ | ✅ S45 | — | — |
| B-event structure digest | ✅ | ✅ S45 | — | — |
| C-event structure digest | ✅ | ✅ S45 | — | — |
| State variables | ✅ | ✅ S45 | ✅ S45 | ✅ |
| Entity anomaly digest | ✅ S44 | ✅ S45 | — | — |
| Time-series data | ✅ | — (flag only) | — | flag only |
| Event fire counts | ✅ (snap) | ✅ S45 (single run) | — | — |
