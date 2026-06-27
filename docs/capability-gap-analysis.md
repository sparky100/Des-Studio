# simmodlr — Capability Gap Analysis

**Date:** 2026-05-21 (updated post Sprint 68)
**Scope:** simmodlr vs SimPy 4.x, AnyLogic 8.x (Process Modelling Library), JaamSim 2024
**Method:** Web-fetched reference feature lists + full codebase audit (engine, macros, UI, tests, templates)

---

## Version History

| Version | Date | Sprint | Changes |
|---|---|---|---|
| v1.0 | 2026-05-14 | Pre-Sprint 31 | Initial gap analysis — 24 gaps identified across 6 categories |
| v1.1 | 2026-05-14 | Sprint 31 | Closed G05 (clock token), G11 (WIP metric), G15 (live time-plot) |
| v1.2 | 2026-05-14 | Sprint 32 | Closed G01 (preemption), G04 (resource failures/MTBF/MTTR) |
| v1.3 | 2026-05-14 | Sprint 33 | Closed G06 (SPLIT), G07 (COSEIZE), G08 (SPT/EDD/PRIORITY), G09 (dynamic BATCH), G10 (MATCH), G12 (histograms), G13 (ANOVA), G16 (failure UI) |
| v1.4 | 2026-05-15 | Post-sprint review | Corrected four engine bugs B1–B4; scoring matrix updated for G01/G04/G05/G11/G14/G15. |
| v1.5 | 2026-05-15 | Sprint 34 | Partial close of G02 (scripting): SET and SET_ATTR macros. F matrix row 2 updated ❌→⚠️. |
| v1.6 | 2026-05-15 | Sprint 35 | Engine correctness fixes — warmup FEL pruning, dead code removal. Architecture review updated to v2.0. |
| v1.7 | 2026-05-15 | Sprint 41 | UI exposure: COST, PREEMPT, FAIL, REPAIR, SPLIT, SET, SET_ATTR added to editors. |
| v1.8 | 2026-05-15 | Sprint 42 | UI usability: SectionPanel, EffectPicker, loopConfig, balkCondition expression UI. |
| v1.9 | 2026-05-15 | Sprint 43 | AI: buildGoalGaps(), evaluateSweepPointGoals(), goal-driven sweep feasibility colouring. |
| v2.0 | 2026-05-15 | Sprint 44 | Execution insights: LogViewer, QueueHistogram, EntitySummaryTable, goal-aware KPI cards. |
| v2.1 | 2026-05-16 | Sprint 45 | AI prompt grounding: enriched KPI payload, B/C-event digest, server failure model, state variables, anomaly digest. |
| v2.2 | 2026-05-16 | Post-Sprint 55a | AI optimisation positioning corrected. simmodlr goal-driven sweep reframed as a differentiator. Section D narrative and competitive differentiators table updated. |
| v2.3 | 2026-05-17 | Sprints 56–61 | **Real-time data integration:** AdapterRegistry, RestAdapter, WebSocketAdapter, mockAdapter, calibrated batch mode, rolling mode. New rows added to F and G matrices. G25 registered. |
| v2.4 | 2026-05-18 | Sprints 62–65 | **Real-world clock + planned data:** epoch, clockUtils, planCsvParser, named entity instances, schedule feed API, ActualsStreamAdapter, avgPlanDeviation. G26–G28 registered and closed. New D row added. |
| v2.5 | 2026-05-18 | Sprint 66 | **Visual Designer UX:** `when`/`feed` discoverability badges on nodes, Export popover consolidation, chart formatting. New E row added. |
| v2.6 | 2026-05-19 | Sprint 67 | **Plain-English UX:** plain-English-first labelling across all surfaces formalised in AGENTS.md. Results workspace restructured around user questions. New Section 8: Usability Assessment added. |
| v3.0 | 2026-05-21 | Sprint 68 | **Model versioning + G21 closure:** Closed G21 (Container/level resource) — FILL/DRAIN macros confirmed in engine; containerTypes schema. Model versioning (G29) closed. New G category matrix. Coverage recalculated: 91% (111✅ 7⚠️ 8❌ of 126 assessed features). Template count updated to 20. |

---

## Section 1: Scoring Matrix

Scoring: ✅ Implemented | ⚠️ Partial | ❌ Missing

### A — Core Entity Model

| Feature | SimPy | AnyLogic | JaamSim | simmodlr | Gap? |
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
| Named entity instances (from schedule) | ❌ | ✅ | ❌ | ✅ scheduleFeed; entity._name from rows[] | — |
| Entity conveyors / transporters | ❌ | ✅ | ✅ | ❌ | Gap |
| Entity state machine | ⚠️ manual | ✅ StatechartAgent | ❌ | ❌ | Gap |

### B — Resource & Server Model

| Feature | SimPy | AnyLogic | JaamSim | simmodlr | Gap? |
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
| Container (level/tank resource) | ✅ Container | ✅ | ✅ | ✅ FILL/DRAIN macros; containerTypes | — |
| Store / item buffer resource | ✅ Store/FilterStore | ✅ | ✅ | ❌ | Gap |
| Priority request queue for resources | ✅ PriorityResource | ✅ | ✅ | ⚠️ via queue PRIORITY | — |

### C — Queueing & Scheduling

| Feature | SimPy | AnyLogic | JaamSim | simmodlr | Gap? |
|---|---|---|---|---|---|
| FIFO queue discipline | ⚠️ implicit | ✅ | ✅ | ✅ | — |
| LIFO queue discipline | ❌ | ✅ | ✅ | ✅ | — |
| PRIORITY discipline (numeric attr) | ✅ PriorityResource | ✅ | ✅ | ✅ | — |
| Custom comparator / sort key | ✅ FilterStore | ✅ Java comparator | ✅ | ✅ SPT/EDD/PRIORITY(attr) | — |
| Shortest processing time (SPT) | ❌ | ✅ | ⚠️ | ✅ SPT discipline | — |
| Finite queue capacity | ❌ | ✅ | ✅ | ✅ capacity field | — |
| Balking (hard — entity lost) | ❌ | ✅ | ✅ | ✅ | — |
| Balking with overflow routing | ❌ | ✅ | ✅ | ✅ overflowDestination | — |
| Balking probability | ❌ | ✅ | ✅ | ✅ balkProbability | — |
| Reneging / abandonment (patience timeout) | ✅ | ✅ Timeout block | ✅ | ✅ RENEGE + isRenege | — |
| Jockeying (queue-switching) | ❌ | ✅ | ❌ | ❌ | Gap |
| Batching (accumulate N → one unit) | ⚠️ manual | ✅ Batch block | ✅ BatchService | ✅ BATCH macro | — |
| Batch size by attribute / condition | ❌ | ✅ | ✅ | ✅ BATCH(Queue, Entity.attr) | — |
| Unbatching / splitting batches | ⚠️ manual | ✅ Unbatch block | ✅ | ✅ UNBATCH macro | — |
| Match / synchronise entities | ❌ | ✅ Match block | ✅ Combine | ✅ MATCH macro | — |
| C-event priority ordering | ⚠️ implicit | ✅ | ✅ | ✅ priority field | — |
| Phase C restart rule (three-phase) | N/A | N/A | N/A | ✅ canonical | — |
| Time-varying arrival rates | ⚠️ manual | ✅ | ✅ | ✅ Piecewise dist | — |

### D — Statistical Output

| Feature | SimPy | AnyLogic | JaamSim | simmodlr | Gap? |
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
| Cost / ROI modelling | ❌ | ✅ | ✅ | ✅ COST macro; totalCost/costPerServed | — |
| Histogram output (freq distribution) | ⚠️ manual | ✅ | ✅ | ✅ buildHistogram / buildHistogramFD | — |
| Entity-level data export | ⚠️ manual | ✅ | ✅ | ✅ entitySummary[] | — |
| Structured trace / event log export | ❌ | ⚠️ | ❌ | ✅ cycleLog[] | — |
| Run labelling, tagging, archiving | ❌ | ❌ | ❌ | ✅ run_label, tags, archived | — |
| Saved experiment configurations | ❌ | ✅ | ⚠️ | ✅ experiments table | — |
| Plan vs actual deviation tracking | ❌ | ❌ | ❌ | ✅ avgPlanDeviation; ActualsStreamAdapter | — |

### E — Visual Authoring

| Feature | SimPy | AnyLogic | JaamSim | simmodlr | Gap? |
|---|---|---|---|---|---|
| Canvas-based process flow editor | ❌ | ✅ | ✅ | ✅ VisualDesignerPanel | — |
| Drag-and-drop entity type creation | ❌ | ✅ | ✅ | ✅ palette nodes | — |
| Form-based model editor (fallback) | ❌ | ✅ | ❌ | ✅ primary editor | — |
| Real-time execution animation | ❌ | ✅ | ✅ | ✅ SVG token animation | — |
| Live entity count overlays | ❌ | ✅ | ✅ | ✅ per-node counts | — |
| Inspector panel (node properties) | ❌ | ✅ | ✅ | ✅ per-type editors | — |
| Model validation with inline errors | ❌ | ✅ | ✅ | ✅ 11+ V-rules | — |
| Charts / dashboards | ❌ | ✅ | ✅ | ✅ KPI cards, sweep charts | — |
| Node discoverability badges (data feed, condition) | ❌ | ❌ | ❌ | ✅ `when`/`feed` badge chips on nodes | — |
| 2D spatial environment / layout | ❌ | ✅ | ✅ | ❌ | Gap |
| 3D environment / animation | ❌ | ✅ | ✅ | ❌ | Gap |
| GIS / map integration | ❌ | ✅ | ❌ | ❌ | Gap |
| Histogram / bar charts inline | ❌ | ✅ | ✅ | ✅ histogram collector | — |
| Time-plot / signal charts | ❌ | ✅ | ✅ | ✅ QueueDepthTimePlot in BottomPanel Charts tab | — |
| Model sharing / public gallery | ❌ | ❌ | ❌ | ✅ | — |
| Shareable results dashboard (URL) | ❌ | ⚠️ | ❌ | ✅ QR + hash route | — |
| AI-assisted model generation | ❌ | ❌ | ❌ | ✅ LLM authoring | — |
| Template library with metadata | ❌ | ✅ | ✅ | ✅ 20 templates, 6 domains | — |
| Community model gallery | ❌ | ⚠️ | ❌ | ✅ fork-to-run | — |
| In-browser (no install) | ❌ | ❌ | ❌ | ✅ | — |
| Keyboard navigation / accessibility | ❌ | ❌ | ❌ | ✅ ARIA, tabIndex | — |
| Plain-English UX (non-specialist labels) | ❌ | ❌ | ❌ | ✅ formal rule in AGENTS.md; enforced Sprint 67 | — |

### F — Scripting & Extensibility

| Feature | SimPy | AnyLogic | JaamSim | simmodlr | Gap? |
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
| Process-level interrupts | ✅ interrupt() | ✅ | ❌ | ✅ via PREEMPT macro | — |
| Entity-to-entity events / rendezvous | ✅ | ✅ | ⚠️ | ❌ | Gap |
| External data import (DB / files) | ⚠️ manual | ✅ | ✅ | ✅ CSV import; REST/WebSocket adapter | — |
| REST parameter feeds | ⚠️ manual | ✅ | ❌ | ✅ RestAdapter (poll, TTL cache, retry) | — |
| WebSocket / streaming parameter feeds | ⚠️ manual | ✅ | ❌ | ✅ WebSocketAdapter; ActualsStreamAdapter | — |
| Real-world clock / epoch mapping | ❌ | ✅ | ❌ | ✅ epoch field; simToWall/wallToSim (clockUtils.js) | — |
| Planned schedule import (CSV/XLSX + timestamps) | ❌ | ⚠️ | ❌ | ✅ planCsvParser; rows[] feed; HH:MM + ISO 8601 | — |
| API surface for embedding | ✅ Python API | ✅ | ❌ | ✅ public-api.js; engine-api-reference.md | — |
| Headless / CLI execution | ✅ | ✅ | ✅ | ✅ Node.js | — |
| Seeded reproducibility | ⚠️ manual | ⚠️ | ⚠️ | ✅ mulberry32 contract | — |
| CSV empirical distributions | ❌ | ❌ | ❌ | ✅ | — |
| Attribute-conditional service times | ❌ | ✅ | ⚠️ | ✅ dist per procedure type; attrDefs calibration | — |

### G — Real-Time Operations, Versioning & Collaboration

*New category. All features in this category are simmodlr innovations without direct comparator equivalents.*

| Feature | SimPy | AnyLogic | JaamSim | simmodlr | Gap? |
|---|---|---|---|---|---|
| Calibrated batch mode (pre-fetch live params, freeze for run) | ❌ | ❌ | ❌ | ✅ prefetchAll() before buildEngine() | — |
| Rolling run mode (re-sample params on each FEL event) | ❌ | ❌ | ❌ | ✅ registry.resolve() per sample site | — |
| Warm-start from live system snapshot | ❌ | ❌ | ❌ | ✅ injectState(); SnapshotAdapter | — |
| FEL reschedule during run (dynamic rescheduling) | ❌ | ❌ | ❌ | ✅ engine.updateScheduledTime() | — |
| Model version milestones (named snapshots) | ❌ | ⚠️ branching | ❌ | ✅ model_versions table; CreateVersionModal | — |
| Structural vs parameter change detection | ❌ | ❌ | ❌ | ✅ detectStructuralChanges() in validation.js | — |
| Run records linked to version snapshots | ❌ | ❌ | ❌ | ✅ version_id on run records | — |
| Fork-to-run (public model access without ownership) | ❌ | ❌ | ❌ | ✅ fork creates owned copy | — |
| Goal-driven parametric sweep with AI narrative | ❌ | ❌ | ❌ | ✅ buildGoalGaps() + evaluateSweepPointGoals() | — |

---

## Section 2: Gap Register

| # | Feature | Category | Priority | Status | Notes |
|---|---|---|---|---|---|
| G01 | **Resource preemption** | B | **High** | ✅ Complete | `PREEMPT(ServerType)` macro; interrupted entity re-queues with `_remainingService`; trace entry emitted. Sprint 32. **Test coverage (Sprint 86):** direct `apply()` unit tests in `src/engine/__tests__/macros.test.js` (no-busy-server no-op, remaining-service precision, repeated preempt/resume) plus integration coverage in `tests/engine/sprint-32-preemption.test.js`; `priority-ed-balking` template demonstrates a worked example. |
| G02 | **General-purpose scripting / custom process logic** | F | **High** | ⚠️ Partial | Sprint 34: `SET` and `SET_ATTR` macros close attribute mutation, state arithmetic, computed routing. Multi-step coroutine-style logic remains architecturally impossible in Pidd's three-phase model. |
| G03 | ~~**Probabilistic / conditional routing**~~ | A | ~~High~~ | ✅ Resolved | Both conditional and probabilistic routing implemented in `fireBEvent()`. Sprint 31. |
| G04 | **Resource breakdowns / failures** | B | **High** | ✅ Complete | `FAIL` and `REPAIR` macros for explicit/conditional outages; `mtbfDist`/`mttrDist` on a server entityType is a genuine engine-automatic feature (`makeFailureEvents()`, `src/engine/index.js`) — the engine internally generates FAILURE/REPAIR pseudo-events from those declarative fields with zero B-event/C-event authoring required. Sprint 32. **Test coverage (Sprint 86):** direct `apply()` unit tests in `src/engine/__tests__/macros.test.js` (downtime accounting precision, starvation-interval flushing, repair-of-non-failed-server no-op, pool vs. unit scope) plus integration coverage in `tests/engine/per-server-failure.test.js`; Machine Shop with Failures template demonstrates the MTBF/MTTR pattern. |
| G05 | ~~**Clock value in conditions**~~ | F | ~~Low~~ | ✅ Resolved | `clock` token in `buildConditionTokens()`. Sprint 31. |
| G06 | ~~**Entity splitting / cloning**~~ | A | ~~Med~~ | ✅ Resolved | `SPLIT` macro with parent-child tracking. Sprint 33. **Test coverage (Sprint 86):** direct `apply()` unit tests in `src/engine/__tests__/macros.test.js` (partial balking, `_splitParent`/`_splitChildren` metadata, renege-from-clone-queue). Fixed a UI bug (B1) where the B-event effect picker generated an invalid 2-arg `SPLIT(N, Queue)` call instead of the required 3-arg `SPLIT(EntityType, N, Queue)` form. |
| G07 | ~~**Multiple resource types per task (co-seize)**~~ | B | ~~Med~~ | ✅ Resolved | `COSEIZE` macro with atomic all-or-nothing seizing. Sprint 33. |
| G08 | ~~**Custom / SPT queue comparator**~~ | C | ~~Med~~ | ✅ Resolved | SPT, EDD, PRIORITY(attrName) disciplines. Sprint 33. |
| G09 | ~~**Batch size by condition / attribute**~~ | C | ~~Med~~ | ✅ Resolved | `BATCH(Queue, Entity.attrName)`. Sprint 33. |
| G10 | ~~**Entity matching / synchronisation**~~ | C | ~~Med~~ | ✅ Resolved | `MATCH` macro. Sprint 33. **Test coverage (Sprint 86):** direct `apply()` unit tests in `src/engine/__tests__/macros.test.js` (attribute-merge collision order — QueueB overwrites QueueA on name clash — and discipline-respecting candidate selection). Fixed a UI gap (B2) where `MATCH` was not offered in the C-event effect picker at all (raw text entry only). |
| G11 | ~~**WIP (work-in-progress) metric**~~ | D | ~~Med~~ | ✅ Resolved | `avgWIP` time-integral. Sprint 31. |
| G12 | ~~**Histogram output**~~ | D | ~~Med~~ | ✅ Resolved | `buildHistogram` + `buildHistogramFD`. Sprint 33. |
| G13 | ~~**ANOVA / ranking-and-selection**~~ | D | ~~Med~~ | ✅ Resolved | `oneWayANOVA` + `tukeyHSD`. Sprint 33. |
| G14 | ~~**Process-level interrupts**~~ | F | ~~Med~~ | ✅ Resolved | Covered by G01 preemption. Sprint 32. |
| G15 | ~~**Inline time-plot / live signal chart**~~ | E | ~~Med~~ | ✅ Resolved | QueueDepthTimePlot in BottomPanel Charts tab. Sprint 31. |
| G16 | ~~**Resource failure state in UI**~~ | E | ~~Med~~ | ✅ Resolved | Activity nodes show failed servers as red dots + badge. Sprint 33. |
| G17 | ~~**Cost modelling**~~ | D | ~~Low~~ | ✅ Resolved | `COST(expr)` macro; `totalCost`/`costPerServed`. Sprint 36. |
| G18 | **Jockeying** | C | **Low** | ❌ Open | Entities moving between queues by length. Very complex; low practical demand. Backlog indefinitely. |
| G19 | **2D spatial layout / conveyor** | A | **Low** | ❌ Open | Out of scope for a browser-based declarative tool. Backlog. |
| G20 | **3D environment** | E | **Low** | ❌ Open | Out of scope. Backlog. |
| G21 | ~~**Container / level resource**~~ | B | ~~Low~~ | ✅ Resolved | `FILL(ContainerName, amount)` and `DRAIN(ContainerName, amount)` macros with level clamping, time-integral tracking, capacity enforcement, and min/max statistics. Container types declared in `model.containerTypes[]`. V27 validation. Implemented by Sprint 55a. |
| G22 | **GIS / map integration** | E | **Low** | ❌ Open | Out of scope for core DES. Backlog. |
| G23 | **Entity-to-entity rendezvous** | F | **Low** | ❌ Open | Rare in three-phase DES. Would require significant engine extension. Backlog. |
| G24 | ~~**Public embeddable API**~~ | F | ~~Low~~ | ✅ Resolved | `public-api.js`; `docs/engine-api-reference.md`. Sprint 36. |
| G25 | ~~**Real-time data integration**~~ | F/G | ~~Med~~ | ✅ Resolved | AdapterRegistry, RestAdapter (poll + TTL cache + retry), WebSocketAdapter, mockAdapter; calibrated batch and rolling modes. Sprint 57–61. |
| G26 | ~~**Real-world clock / epoch**~~ | F/G | ~~Med~~ | ✅ Resolved | `model.epoch` field; `simToWall()`/`wallToSim()` in `clockUtils.js`; V28 validation; report period formatted as human-readable datetime range. Sprint 62. |
| G27 | ~~**Planned schedule import**~~ | F/G | ~~Med~~ | ✅ Resolved | `planCsvParser.js`; `rows[]` feed on B-events; named entity instances (`entity._name`); HH:MM + ISO 8601 timestamp conversion; schedule feed API (`scheduleFeed` dataSource type). Sprint 63. |
| G28 | ~~**Actuals tracking / plan deviation**~~ | D/G | ~~Med~~ | ✅ Resolved | `ActualsStreamAdapter` (WebSocket + direct push); `_plannedArrivalTime` on FEL entries; `entity._plannedTime`; `engine.updateScheduledTime()`; `avgPlanDeviation` in `getSummary()`; Plan vs Actual section in Word report. Sprint 65. |
| G29 | ~~**Model versioning**~~ | G | ~~Med~~ | ✅ Resolved | `model_versions` table; `createVersion`, `listVersions`, `getVersion`, `deleteVersion` wrappers; `detectStructuralChanges()` utility; `VersionHistoryPanel` and `CreateVersionModal` UI; `version_id` on run records. Sprint 68. |

---

## Section 3: Capability Summary

### A — Core Entity Model
simmodlr implements the essential entity lifecycle: typed entities with sampled attributes, multi-stage routing via RELEASE, recirculation tracking, balking/reneging, and both conditional and probabilistic routing. Entity splitting/cloning (G06) and entity matching/synchronisation (G10) are implemented via the `SPLIT` and `MATCH` macros. Named entity instances (Sprint 63) allow real schedule data — surgical patients, flight arrivals — to be modelled with individual identity rather than anonymous statistical arrivals. Entity conveyors and state machines remain out of scope.

### B — Resource & Server Model
Server pools, multi-capacity types, shift schedules, dynamic capacity adjustment, utilisation tracking, preemption (G01), resource failures (G04), and multi-resource co-seize (G07) are all implemented and tested. **Container/level resources (G21) are now fully closed** via `FILL` and `DRAIN` macros with capacity clamping, time-integral averaging, min/max statistics, and V27 validation — closing the only remaining resource category gap of practical significance. Store/FilterStore item buffers remain the single open resource gap (low priority; approximable with queues).

### C — Queueing & Scheduling
Queue discipline coverage (FIFO, LIFO, PRIORITY), finite capacity, balking, reneging, batching, unbatching, SPT/EDD/PRIORITY(attr) sort keys, and entity matching/synchronisation are all implemented. Jockeying is the only remaining queueing gap and is low-priority (backlog indefinitely).

### D — Statistical Output
simmodlr's statistical output remains its strongest differentiator: 95% CI, batch means, paired t-test, 1D/2D parametric sweeps, warm-up with Welch's graphical test, anomalous replication flagging, ANOVA with Tukey HSD, cost modelling, run labelling/tagging, and saved experiments. **Sprints 62–65 added plan vs actual deviation tracking** (`avgPlanDeviation`) as a new first-class metric — surfaced in `getSummary()` and the Word report's Plan vs Actual section. This capability has no equivalent in SimPy, AnyLogic, or JaamSim and targets operational planning contexts where comparing schedule to reality matters. All statistical gaps in this category are closed.

**AI-driven optimisation — simmodlr's primary differentiator vs all comparators:**

| Capability | OptQuest (Arena/Simio/AnyLogic) | simmodlr |
|-----------|--------------------------------|------------|
| Goal specification | Numeric objective + constraint bounds | Natural language goals (`buildGoalGaps()`) |
| Parameter space exploration | Black-box heuristic search | Full 1D/2D exhaustive sweep; entire tradeoff surface visible |
| Transparency | Opaque — "solution: servers=4" | Interactive — user sees every configuration's performance |
| Result explanation | None | AI narrative with goal-gap context |

Where OptQuest still leads: parameter spaces larger than ~4 dimensions and formal convergence guarantees on non-convex spaces. For simmodlr's target market (operations analysts, consultants, educators), the AI-driven goal-directed approach produces more interpretable outputs than OptQuest.

### E — Visual Authoring
The visual authoring surface is comprehensive for a browser-based tool: canvas DAG editor, real-time token animation, per-node live counts, structured trace/event log, entity inspector, KPI cards, and sweep charts. **Sprint 66 added node discoverability badges** — `when` badges on Activity nodes show whether a C-event condition is attached; `feed` badges on Source nodes show when a live data source is bound. This closes a discoverability gap where configuration was invisible from the canvas. **Sprint 67 formalised a plain-English-first UI rule** covering all primary labels, with technical terminology demoted to helper text and tooltips. Remaining gaps (2D spatial, 3D, GIS) are out of scope for a browser-first declarative tool.

### F — Scripting & Extensibility
simmodlr makes a deliberate safety-first choice: all logic is expressed through a declarative macro and condition token system with no `new Function()` or `eval()`. **Sprints 57–65 added a production-grade adapter layer**: RestAdapter (poll with TTL cache and exponential-backoff retry), WebSocketAdapter (streaming parameter feeds), ActualsStreamAdapter (real-time actuals ingestion), and mockAdapter for testing. The `AdapterRegistry` pattern means any `distParams` field can be resolved from a live data source at sample time — fully backwards-compatible with existing static models. **Real-world clock (Sprint 62)** maps simulation time to calendar datetime via `model.epoch`, enabling HH:MM and ISO 8601 timestamps in CSV imports. **Planned data import (Sprint 63)** adds named entity instances and the `scheduleFeed` dataSource type. The public embeddable API (`public-api.js`) is stable and documented. What remains impossible under the three-phase declarative model is coroutine-style multi-step waiting within a single entity's lifetime.

### G — Real-Time Operations, Versioning & Collaboration
This is simmodlr's newest and most distinctive capability dimension — entirely absent from SimPy, AnyLogic, and JaamSim:

- **Calibrated batch mode:** live parameter values pre-fetched once at run start and frozen for all replications, enabling reproducible multi-replication studies calibrated to current real-world conditions.
- **Rolling single-run mode:** parameters re-resolved on each FEL scheduling event, enabling digital twin and real-time operations dashboards.
- **Warm-start from system snapshot:** `injectState()` and `SnapshotAdapter` seed a run from a live queue state, enabling "what happens if I add a server right now?" decision support.
- **FEL rescheduling:** `engine.updateScheduledTime()` re-anchors a planned FEL event to a new sim time, supporting actuals-driven run correction.
- **Model versioning:** named version milestones with structural-vs-parameter classification, version history UI, and optional run–version linkage for human navigation.

---

## Section 4: Sprint Delivery History

| Sprint | Gaps closed | Key deliverables |
|--------|-------------|-----------------|
| 31 | G05, G11, G15 | Clock token, WIP metric, live queue-depth time-plot |
| 32 | G01, G04, G14 | PREEMPT, FAIL/REPAIR macros, MTBF/MTTR |
| 33 | G06, G07, G08, G09, G10, G12, G13, G16 | SPLIT, COSEIZE, SPT/EDD/PRIORITY, BATCH, MATCH, histograms, ANOVA/Tukey, failure UI |
| Post-review | B1–B4 | Four engine bug fixes: _downtime, avgWIP denominator, COSEIZE release, SPLIT child metadata |
| 34 | G02 (partial) | SET and SET_ATTR macros; safe arithmetic expression evaluator |
| 35 | — (correctness) | Warmup FEL pruning fix, dead code removal, V8 product decision |
| 36 | G17, G24 | COST macro, public API module + reference docs; H4 serviceStart=0 fix |
| 41–45 | — (UI/AI) | UI exposure for all macros; goal-driven sweeps; AI prompt grounding |
| 55a | — (refactor) | God component decomposition; model health panel; experiment controls extraction |
| 56 | — (prep) | ExecutePanel hook extraction enabling adapter injection |
| 57–61 | G25 | AdapterRegistry, RestAdapter, WebSocketAdapter, mockAdapter, calibrated batch + rolling modes |
| 62–65 | G26, G27, G28 | Real-world clock (epoch), planned CSV import, named entity instances, ActualsStreamAdapter, avgPlanDeviation |
| 66 | — (UX) | Node discoverability badges (`when`/`feed`), export consolidation, chart formatting |
| 67 | — (UX) | Plain-English-first UI rule formalised; Results workspace restructured by user question |
| 68 | G21 (confirmed), G29 | Container/level resource confirmed closed; model versioning (milestones, history UI, structural change detection) |

### Remaining open gaps

| Gap | Category | Assessment |
|-----|----------|------------|
| G02 ⚠️ | F — Scripting | Coroutine-style multi-step logic is an architectural non-starter for the three-phase declarative model. SET/SET_ATTR cover the practical common cases. No further progress expected without fundamental rearchitecture. |
| G18 ❌ | C — Queueing | Jockeying (entities move between queues). Very complex; extremely low practical demand. Backlog indefinitely. |
| G19, G20, G22 ❌ | A/E — Spatial | 2D layout, 3D, GIS. Out of scope for a browser-based declarative tool at simmodlr's market positioning. |
| G23 ❌ | F — Scripting | Entity-to-entity rendezvous. Rare in three-phase DES; would require significant engine extension. Backlog. |
| Store/FilterStore ❌ | B — Resources | Item buffer resource type. Low priority; approximable with queues and BATCH/MATCH macros. |

### Architecture correctness items

All H-severity and M1 architecture review findings are closed as of Sprint 36. Remaining open items are medium/low tech debt (M4: queue discipline duplication, M5: legacy string conditions, L2: rendering filters, L4: DB schema baseline).

---

## Section 5: AI Analysis Capability Coverage

The AI analysis layer (`src/llm/prompts.js`) receives the following data for every suggestion and narrative prompt:

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
| Plan vs actual deviation | ✅ S65 | — | — | — |
| Time-series data | ✅ | — (flag only) | — | flag only |
| Event fire counts | ✅ (snap) | ✅ S45 (single run) | — | — |

---

## Section 6: Competitive Differentiators

The following capabilities are simmodlr-exclusive among the compared tools:

| Differentiator | simmodlr | SimPy | AnyLogic | JaamSim |
|---|---|---|---|---|
| In-browser, no install | ✅ | ❌ | ❌ | ❌ |
| AI model generation from natural language | ✅ | ❌ | ❌ | ❌ |
| Goal-driven sweep with AI narrative | ✅ | ❌ | ❌ | ❌ |
| Welch's graphical warm-up test | ✅ | ❌ | ⚠️ | ❌ |
| Anomalous replication flagging (IQR+z) | ✅ | ❌ | ❌ | ❌ |
| Safe execution (no code injection) | ✅ | ❌ | ❌ | ❌ |
| Real-time parameter feeds (REST/WebSocket) | ✅ | ⚠️ | ✅ | ❌ |
| Calibrated batch + rolling run modes | ✅ | ❌ | ❌ | ❌ |
| Planned schedule import with named entities | ✅ | ❌ | ⚠️ | ❌ |
| Plan vs actual deviation metric | ✅ | ❌ | ❌ | ❌ |
| Community model gallery + fork-to-run | ✅ | ❌ | ❌ | ❌ |
| Shareable results dashboard (URL/QR) | ✅ | ❌ | ⚠️ | ❌ |
| Seeded reproducibility contract | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Distribution fitting from empirical data | ✅ | ❌ | ❌ | ❌ |
| Model versioning as explicit milestones | ✅ | ❌ | ⚠️ | ❌ |
| Structural vs parameter change detection | ✅ | ❌ | ❌ | ❌ |
| Plain-English UX for non-specialist users | ✅ | ❌ | ❌ | ❌ |

---

## Section 7: Usability Assessment

*Added in v2.6/v3.0. This section evaluates simmodlr as a tool that real users must navigate, not just as a feature checklist.*

### Target audience alignment

simmodlr targets **operations analysts, consultants, service system designers, and educators** — not simulation programmers. The design choices throughout reflect this:

- No code entry anywhere in the product. All logic is expressed through structured pickers, the Predicate Builder, and the Macro editor.
- Primary labels use natural language ("How long until the next patient arrives?"); technical simulation terms appear only in helper text and tooltips.
- Three authoring modes — Forms/Tabs (guided), Visual Designer (topology-first), and AI Generation (natural language) — serve different user preferences and skill levels while sharing one canonical model.

This positioning is well-maintained and enforced by a formal rule in `AGENTS.md` (Sprint 67). The product is meaningfully more accessible than SimPy or JaamSim for non-programmers.

### Strengths

**1. Multiple entry points.** Users can describe a system in plain English and have an AI generate a runnable model, drag-and-drop a process flow in the Visual Designer, or fill in a structured form. All three paths are first-class and round-trip without data loss.

**2. In-context validation.** Inline error messages surfaced per-tab (not just at run time) catch structural mistakes — undefined event references, mismatched attribute types, invalid distribution parameters — before the user ever clicks Run. This is significantly better than tools that fail silently at run time.

**3. Guided statistical workflow.** The Results workspace (restructured Sprint 67) leads with a summary band ("what happened?"), then confidence and reliability guidance ("can I trust this?"), then analytical method detail. This ordering reduces the risk of misinterpreting results.

**4. 20 domain-specific templates.** Templates spanning healthcare (ER Triage, Surgical Suite, Outpatient Clinic), logistics (Warehouse Picking, Port Berth, Construction), manufacturing (Factory Assembly, Machine Shop with Failures), and services (Call Center, Retail Checkout) give new users a working starting point in their domain within seconds.

**5. Node badges for discoverability (Sprint 66).** The `when` badge on Activity nodes and `feed` badge on Source nodes make configuration visible on the canvas without requiring the user to open every inspector panel. This materially improves the visual comprehension of complex models.

**6. AI-generated results narratives.** After a run, the AI narrative surfaces the key finding ("Queue 2 is the bottleneck — avg wait 18 min vs your 10-min target") with model-specific context rather than generic advice. This is accessible to users who cannot interpret confidence interval tables.

**7. Real-time run monitoring.** The Execute canvas shows live entity token animation, per-node utilisation, queue depth sparklines, and a phase-tagged event log simultaneously. Users can watch a model run and identify problems before results are finalised.

### Limitations and friction points

**1. Three-phase model concept requires orientation.** The distinction between B-events (bound, scheduled) and C-events (conditional) is central to Pidd's method but not self-evident to users with no prior DES experience. The UI provides help text, but new users without a tutorial or template starting point may find the first model creation disorienting.

**2. Predicate Builder expressiveness ceiling.** The token-based DSL is safe and structured but cannot express complex multi-condition logic without multiple C-events. Advanced users occasionally hit the ceiling and expect free-text expression entry. This is a deliberate trade-off (safety over power) but should be clearly documented as a constraint.

**3. Real-time data integration adds surface area.** The adapter layer (Sprints 57-65) is powerful but introduces new concepts (DataSources, paramSource bindings, adapter types, epoch) that significantly expand the cognitive load of model configuration. The Data Sources editor is functional but would benefit from guided setup wizards and clearer error messages for misconfigured feeds.

**4. Visual Designer is complementary, not a complete replacement.** The canvas editor handles topology well, but detailed configuration (distribution parameters, predicate logic, server attributes) still requires the Forms editor. Users who expect the Visual Designer to be the sole authoring surface will need to use both panels.

**5. Statistical concepts require some expertise.** Warm-up periods, CI width, ANOVA, and Tukey HSD are correctly implemented and well-labelled, but interpreting them still requires background knowledge. The Results workspace restructuring (Sprint 67) helps, but a brief statistical literacy guide or contextual tooltips on significance thresholds would further reduce the expertise barrier.

**6. Model versioning UI is new (Sprint 68).** The version history panel and create-version workflow are functional but this is v1 — the structural change detection summary and the link between runs and versions are useful but not yet prominent in the default workflow. Discoverability of versioning may be low for users who do not seek it out.

### Usability rating vs comparators

| Dimension | simmodlr | SimPy | AnyLogic | JaamSim |
|---|---|---|---|---|
| Non-programmer accessibility | ★★★★★ | ★★ | ★★★ | ★★ |
| Time to first runnable model | ★★★★★ (template) / ★★★ (from scratch) | ★★ | ★★★ | ★★ |
| Results interpretability | ★★★★ | ★★ | ★★★★ | ★★★ |
| Visual model comprehension | ★★★★ | ★ | ★★★★★ | ★★★★ |
| Power user / scripting flexibility | ★★ | ★★★★★ | ★★★★★ | ★★★ |
| Real-time / operational integration | ★★★★★ | ★★ | ★★★ | ★ |
| Collaboration / sharing | ★★★★★ | ★ | ★★ | ★ |
| Deployment friction | ★★★★★ (browser) | ★★★ | ★★ (install) | ★★ (install) |

**Overall usability assessment:** simmodlr is the most accessible and collaboration-ready DES tool in this comparison for its target user group. The plain-English UX, template library, AI-assisted authoring, and in-browser deployment remove the main friction points that prevent non-specialists from adopting simulation. The primary usability debt is the conceptual overhead of the three-phase model and the two-panel (canvas + forms) authoring workflow — both solvable with onboarding improvements rather than architectural changes.

---

## Appendix: Coverage Summary

Counts are derived from the Section 1 scoring matrix.

| Category | Features Assessed | simmodlr ✅ | simmodlr ⚠️ | simmodlr ❌ | Coverage % |
|----------|-------------------|---------------|---------------|---------------|------------|
| A — Core entity model | 15 | 12 | 1 | 2 | 83% |
| B — Resource & server model | 14 | 12 | 1 | 1 | 89% |
| C — Queueing & scheduling | 18 | 17 | 0 | 1 | 94% |
| D — Statistical output | 28 | 28 | 0 | 0 | 100% |
| E — Visual authoring | 22 | 19 | 0 | 3 | 86% |
| F — Scripting & extensibility | 21 | 15 | 5 | 1 | 83% |
| G — Real-time, versioning & collaboration | 9 | 9 | 0 | 0 | 100% |
| **Total** | **127** | **112** | **7** | **8** | **91%** |

*Coverage % = (✅ + 0.5×⚠️) / Total. Remaining ❌ items (conveyors, entity state machine, store/filter-store, jockeying, 2D/3D/GIS environments, entity-to-entity rendezvous) are either architectural non-starters for a browser-based declarative tool or explicitly deferred backlog items with very low practical demand.*

**Change from v2.2 (post-Sprint 55a) to v3.0 (Sprint 68):**

| Section | Item | Before (v2.2) | After (v3.0) | Reason |
|---------|------|--------------|-------------|--------|
| B | Container/level resource (G21) | ❌ Open | ✅ Resolved | FILL/DRAIN macros confirmed in engine; containerTypes schema |
| D | Plan vs actual deviation | — | ✅ New | avgPlanDeviation; ActualsStreamAdapter (Sprint 65) |
| A | Named entity instances | — | ✅ New | scheduleFeed; rows[]; entity._name (Sprint 63) |
| E | Node discoverability badges | — | ✅ New | `when`/`feed` badge chips on canvas nodes (Sprint 66) |
| E | Plain-English UX | — | ✅ New | Formal rule; enforced Sprint 67 |
| E | Template count | 14 | 20 | Templates added across sprints 46–68 |
| F | REST parameter feeds | — | ✅ New | RestAdapter (Sprint 57) |
| F | WebSocket parameter feeds | — | ✅ New | WebSocketAdapter (Sprint 59) |
| F | Real-world clock / epoch | — | ✅ New | clockUtils.js (Sprint 62) |
| F | Planned schedule import | — | ✅ New | planCsvParser (Sprint 63) |
| F | Attribute-conditional service times | — | ✅ New | per-procedure dist calibration (Sprint 64) |
| F | Public API | ❌ Open | ✅ Resolved | public-api.js (Sprint 36; correction — was already closed in v2.2) |
| G (new) | All 9 features | — | ✅ New | Real-time modes, versioning, collaboration (Sprints 57–68) |
| Coverage | Total | 88% (109 features, 93✅ 7⚠️ 9❌) | 91% (127 features, 112✅ 7⚠️ 8❌) | G21 closed + 18 new features across D/E/F/G |
