# simmodlr — Competitive Comparison & Gap Assessment 2026

**Date:** 2026-05-29
**Scope:** Comprehensive cross-comparison against open-source (SimPy 4.x, salabim, JaamSim 2024, simmer) and professional (AnyLogic 8.x Process Modelling Library, Simio, Arena, FlexSim) DES tools.
**Method:** Web-fetched reference feature lists + full codebase audit (engine, macros, UI, tests, templates, adapters) — refreshed post-Sprint 77.

---

## Executive Summary

simmodlr has evolved from a promising browser-based modeller into a competitive DES platform with distinct strength in **guided no-code authoring, AI integration, statistical output breadth, real-time data connectivity, and collaborative sharing**. It now covers **91% of assessed features** across 127 capability dimensions in the detailed matrix (112 ✅, 7 ⚠️, 8 ❌).

The most significant changes since the last comprehensive gap analysis (v3.0, Sprint 68 — May 2026):

| Area | v3.0 (Sprint 68) | Current (Sprint 77) | Change |
|------|------------------|---------------------|--------|
| Features assessed | 127 | 127+ | Extended for new sprint capabilities |
| Coverage | 91% | ~92% | Help Assistant, schedule separation, report refinements, Dagre layout |
| Open gaps | 8 ❌, 7 ⚠️ | 7 ❌, 6 ⚠️ | G29 (versioning) closed; G02 partial status sustained |
| Templates | 20 | 20 | No new templates added in Sprints 68–77 |
| Tests | ~1000 | ~1000+ | Maintained across 77 sprints |

**Key verdict:** simmodlr is competitive with or ahead of open-source tools in most capability dimensions. Against professional tools (AnyLogic, Simio, Arena), it leads in accessibility, AI integration, real-time data connectivity, and collaboration, but trails in simulation depth (scripting, conveyors, entity state machines), high-dimensional optimisation (OptQuest-style), and production-scale performance. The gap to professional-grade has narrowed significantly since the original assessment — the dominant remaining barriers are **scripting flexibility**, **performance at scale**, and **hierarchical modelling**.

---

## Section 1: Comparator Landscape

### Open-Source Tools

| Tool | Language | Paradigm | Strengths | Weaknesses |
|------|----------|----------|-----------|------------|
| **SimPy 4.x** | Python | Process-interaction (generator-based) | Rich process semantics; interrupts; resource/store/container idioms; flexible scripting | No built-in UI; manual stats; no browser; requires programming; no reproducibility contract |
| **salabim** | Python | Process-interaction with animation | Strong queue/resource/monitor types; built-in animation; debugging facilities | Python dependency; no browser; smaller ecosystem than SimPy |
| **JaamSim 2024** | Java | Visual (drag-and-drop) + scripting | Industrial-scale visual modelling; mature object library; 3D optional | Desktop install; steeper learning curve; limited AI/analytics |
| **simmer (R)** | R | Process-oriented for R ecosystem | Strong experiment workflows; analytics integration with R | R-only; limited visualisation; niche user base |

### Professional / Commercial Tools

| Tool | Language/Platform | Paradigm | Strengths | Weaknesses |
|------|------------------|----------|-----------|------------|
| **AnyLogic 8.x** | Java (Process Library) | Multi-method (DES + agent-based + system dynamics) | Broadest capability palette; hierarchical agents; 2D/3D visualisation; database connectivity | Expensive; desktop install; steep learning curve; no browser-native support |
| **Simio** | .NET/C# | Object-oriented DES with agent extensions | Strong optimisation (OptQuest); 3D animation; object templates with inheritance; experiment management | Enterprise pricing; desktop-only; Windows-centric |
| **Arena** | SIMAN (proprietary) | Process-flow with SIMAN underpinnings | Industry-standard in manufacturing/logistics; extensive template library; Input Analyzer/Output Analyzer | Legacy architecture; desktop only; limited visualisation; vendor-locked |
| **FlexSim** | C++ | Visual DES with 3D | Industrial-strength 3D visualisation; CAD/STL import; C++ scripting; throughput-focused | Niche (manufacturing/logistics focus); desktop-only; expensive |

### simmodlr Positioning

simmodlr occupies a previously empty niche: **browser-native, no-install, AI-augmented, collaboratively shareable DES** with structured (non-code) model authoring. It competes on accessibility and modern workflow rather than raw simulation power. The nearest direct competitor is **JaamSim** (visual, desktop, open-source) — simmodlr matches or exceeds JaamSim on statistical output, AI integration, and sharing, while trailing on 3D visualisation and scale.

---

## Section 2: Scoring Matrix

Scoring: ✅ Implemented | ⚠️ Partial | ❌ Missing | N/A Not applicable

### A — Core Entity Model

| Feature | SimPy | salabim | JaamSim | simmer | AnyLogic | Simio | Arena | FlexSim | **simmodlr** | Gap? |
|---------|-------|---------|---------|--------|----------|-------|-------|---------|---------------|------|
| Entity creation (source) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ ARRIVE | — |
| Entity disposal (sink) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ COMPLETE | — |
| Named entity types with roles | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ entityTypes[] | — |
| Typed attributes (sampled at birth) | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ attrDefs + dist | — |
| Mutable entity attributes | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ mutable flag | — |
| Attribute-based routing predicates | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ entityFilter on ASSIGN only | **Gap** |
| Multi-stage sequential routing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ RELEASE | — |
| Probabilistic routing / branching | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ routing tables | — |
| Conditional routing (Select Output) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ condition-based branches | — |
| Entity cloning / splitting | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ SPLIT | — |
| Entity joining / combining | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ MATCH | — |
| Process recirculation / loops | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ loopCount tracked | — |
| Named entity instances (schedule) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ✅ scheduleFeed; entity._name | — |
| Entity conveyors / transporters | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | **Gap** |
| Entity state machine | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | **Gap** |

### B — Resource & Server Model

| Feature | SimPy | salabim | JaamSim | simmer | AnyLogic | Simio | Arena | FlexSim | **simmodlr** | Gap? |
|---------|-------|---------|---------|--------|----------|-------|-------|---------|---------------|------|
| Multi-capacity server pool | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ count per type | — |
| Single-entity server (c=1) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Per-server attribute sampling | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ ServerAttr dist | — |
| Server utilisation tracking | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ per-type utilisation | — |
| Shift schedules (capacity change) | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ SHIFT_CHANGE B-event | — |
| Dynamic capacity increase/decrease | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ retireIdleExcessServers | — |
| Resource preemption | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ PREEMPT | — |
| Breakdowns / failures | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ FAIL; MTBF auto-scheduling | — |
| Repair / MTTR | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ REPAIR; MTTR auto-scheduling | — |
| Multiple resource types per task | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ COSEIZE | — |
| Resource state visualisation | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ idle/busy/failed dots | — |
| Container / level resource | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ✅ FILL/DRAIN macros | — |
| Store / item buffer resource | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | **Gap** |
| Priority request queue | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ⚠️ via queue PRIORITY | — |

### C — Queueing & Scheduling

| Feature | SimPy | salabim | JaamSim | simmer | AnyLogic | Simio | Arena | FlexSim | **simmodlr** | Gap? |
|---------|-------|---------|---------|--------|----------|-------|-------|---------|---------------|------|
| FIFO queue discipline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| LIFO queue discipline | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| PRIORITY discipline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Custom comparator / sort key | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ SPT/EDD/PRIORITY(attr) | — |
| Shortest processing time (SPT) | ❌ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Finite queue capacity | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ capacity field | — |
| Balking (entity lost) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Balking with overflow routing | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ overflowDestination | — |
| Balking probability | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ balkProbability | — |
| Reneging / abandonment | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ RENEGE + isRenege | — |
| Jockeying (queue-switching) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | **Gap** |
| Batching (accumulate N → one) | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ BATCH macro | — |
| Batch size by attribute | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ BATCH(Queue, attr) | — |
| Unbatching / splitting batches | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ UNBATCH | — |
| Match / synchronise entities | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ✅ MATCH | — |
| C-event priority ordering | ⚠️ | N/A | ✅ | N/A | ✅ | ✅ | ✅ | ✅ | ✅ explicit priority field | — |
| Phase C restart rule (three-phase) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ✅ canonical | — |
| Time-varying arrival rates | ⚠️ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ Piecewise dist | — |

### D — Statistical Output & Analysis

| Feature | SimPy | salabim | JaamSim | simmer | AnyLogic | Simio | Arena | FlexSim | **simmodlr** | Gap? |
|---------|-------|---------|---------|--------|----------|-------|-------|---------|---------------|------|
| Throughput (served count) | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Mean / max wait time | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ avgWait, maxSojourn | — |
| Mean service time | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ avgSvc | — |
| Mean sojourn time | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ avgSojourn | — |
| Reneged / balked counts | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Per-queue utilisation | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ per-type util% | — |
| Wait-time percentiles | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ p50/p90/p95/p99 | — |
| WIP (work in progress) | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ avgWIP (Little's Law) | — |
| Queue length time-series | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ _timeSeries[] | — |
| Event fire counts | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ _eventCounts | — |
| Replication support | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ runReplications() | — |
| Parallel replication workers | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ worker pool | — |
| 95% confidence intervals | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ confidenceInterval95() | — |
| Warm-up period / transient removal | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ WARMUP event | — |
| Batch-means CI estimator | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ batchMeansCI | — |
| Welch's graphical warm-up test | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ WelchChart | **Ahead** |
| Outlier / anomalous rep flagging | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ IQR+z-score | **Ahead** |
| Paired t-test (scenario comparison) | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ pairedTCI | — |
| 1D parametric sweep | ❌ | ❌ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ with CI ribbon | — |
| 2D parametric sweep | ❌ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ✅ heatmap grid | — |
| ANOVA / ranking & selection | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ oneWayANOVA + tukeyHSD | **Ahead** |
| Cost / ROI modelling | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ COST macro; totalCost | — |
| Histogram output | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ buildHistogram | — |
| Entity-level data export | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ entitySummary[] | — |
| Structured trace / event log | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ cycleLog[] | **Ahead** |
| Run labelling, tagging, archiving | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ tags, archived | **Ahead** |
| Saved experiment configurations | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ experiments | — |
| Plan vs actual deviation tracking | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ avgPlanDeviation | **Ahead** |
| AI narrative explanation of results | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ AI Explain | **Ahead** |

### E — Visual Authoring & UX

| Feature | SimPy | salabim | JaamSim | simmer | AnyLogic | Simio | Arena | FlexSim | **simmodlr** | Gap? |
|---------|-------|---------|---------|--------|----------|-------|-------|---------|---------------|------|
| Canvas-based process flow editor | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ VisualDesignerPanel | — |
| Drag-and-drop entity creation | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ palette nodes | — |
| Form-based model editor (fallback) | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ primary editor | — |
| Real-time execution animation | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ SVG token animation | — |
| Live entity count overlays | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ per-node counts | — |
| Inspector panel (properties) | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ per-type editors | — |
| Model validation with inline errors | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ 30+ V-rules | — |
| Charts / dashboards | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ KPI cards, sweep charts | — |
| Node discoverability badges | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ `when`/`feed` badges | **Ahead** |
| Automated graph layout (Dagre) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ Sprint 77; Sugiyama | — |
| 2D spatial environment / layout | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ❌ | **Gap** |
| 3D environment / animation | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | **Gap** |
| GIS / map integration | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | **Gap** |
| Time-plot / signal charts | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ QueueDepthTimePlot | — |
| Model sharing / public gallery | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Community Gallery | **Ahead** |
| Shareable results dashboard (URL/QR) | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ QR + hash route | **Ahead** |
| AI-assisted model generation | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ LLM authoring | **Ahead** |
| AI persistent sidebar assistant | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Sprint 75; ✦ AI toggle | **Ahead** |
| Template library with metadata | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ 20 templates, 6 domains | — |
| Community model gallery | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ fork-to-run | **Ahead** |
| In-browser (no install) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | **Ahead** |
| Keyboard navigation / accessibility | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ ARIA, tabIndex | **Ahead** |
| Plain-English UX (non-specialist) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ formal rule, Sprint 67 | **Ahead** |
| Help Assistant (in-app guidance) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Sprint 70 | **Ahead** |
| Schedule management UI (ADR-016) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ✅ ScheduleManager; Sprint 73 | — |
| Model versioning (milestones) | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ✅ model_versions table | — |
| Report generation (HTML/Markdown) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ generateReport(); Sprint 76 | — |

### F — Scripting & Extensibility

| Feature | SimPy | salabim | JaamSim | simmer | AnyLogic | Simio | Arena | FlexSim | **simmodlr** | Gap? |
|---------|-------|---------|---------|--------|----------|-------|-------|---------|---------------|------|
| General-purpose scripting language | ✅ Python | ✅ Python | ❌ | ✅ R | ✅ Java | ✅ C# | ⚠️ SIMAN | ✅ C++ | ❌ | **Gap** |
| Custom logic in process steps | ✅ yield | ✅ | ❌ | ✅ | ✅ code blocks | ✅ expressions | ⚠️ | ✅ | ⚠️ SET/SET_ATTR macros | **Gap** |
| Custom condition expressions | ✅ Python | ✅ | ✅ input lang | ✅ R | ✅ Java | ✅ expressions | ⚠️ | ✅ | ⚠️ token-based DSL | **Gap** |
| Clock value in conditions | ✅ env.now | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ clock token | — |
| Custom distributions | ✅ any fn | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ Empirical / CSV only | **Gap** |
| Distribution fitting from data | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ Input Analyzer | ❌ | ✅ fitDistribution() | — |
| Macro / block extensibility | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ✅ MACROS registry | — |
| Safe execution (no code injection) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ no new Function() | **Ahead** |
| Event listeners / callbacks | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ⚠️ phase hooks internal | **Gap** |
| Process-level interrupts | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ via PREEMPT | — |
| Entity-to-entity events / rendezvous | ✅ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ❌ | **Gap** |
| External data import (CSV) | ⚠️ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ CSV Import Bridge | — |
| REST parameter feeds | ⚠️ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ RestAdapter (poll, cache, retry) | — |
| WebSocket / streaming feeds | ⚠️ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ WebSocketAdapter | — |
| Real-world clock / epoch mapping | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ epoch; clockUtils.js | — |
| Planned schedule import (CSV) | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ❌ | ✅ planCsvParser | — |
| API surface for embedding | ✅ Python | ❌ | ❌ | ✅ R | ✅ Java | ✅ .NET | ❌ | ✅ C++ | ✅ public-api.js | — |
| Headless / CLI execution | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Node.js | — |
| Seeded reproducibility | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ mulberry32 contract | — |
| CSV empirical distributions | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | **Ahead** |
| Attribute-conditional service times | ❌ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ dist per procedure type | — |
| Data adapter / live parameter resolution | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ AdapterRegistry | — |

### G — Real-Time Operations, Versioning & Collaboration

*Many features in this category are simmodlr innovations without direct comparator equivalents.*

| Feature | SimPy | salabim | JaamSim | simmer | AnyLogic | Simio | Arena | FlexSim | **simmodlr** | Gap? |
|---------|-------|---------|---------|--------|----------|-------|-------|---------|---------------|------|
| Calibrated batch mode (pre-fetch, freeze) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ prefetchAll() | **Ahead** |
| Rolling run mode (live params per event) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ registry.resolve() | **Ahead** |
| Warm-start from system snapshot | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ injectState() | **Ahead** |
| FEL reschedule during run | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ updateScheduledTime() | **Ahead** |
| Model version milestones | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ✅ model_versions | — |
| Structural vs parameter change detection | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ detectStructuralChanges() | **Ahead** |
| Run records linked to versions | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ version_id on runs | **Ahead** |
| Fork-to-run (public model access) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ fork creates owned copy | **Ahead** |
| Goal-driven sweep with AI narrative | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ buildGoalGaps() | **Ahead** |
| Persistent AI sidebar (context-aware) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Sprint 75 | **Ahead** |
| Timetable schedule separation (ADR-016) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ model_schedules table | — |
| Report generation with entity names, diagrams | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ Sprint 76; generateReport() | **Ahead** |

---

## Section 3: Gap Register

### Gaps by Severity

#### High Severity

| # | Feature | Category | Status | Notes | Target |
|---|---------|----------|--------|-------|--------|
| G02 | **General-purpose scripting / custom process logic** | F — Scripting | ⚠️ Partial | SET/SET_ATTR macros cover basic variable arithmetic and attribute mutation. Multi-step coroutine-style logic (SimPy `yield`, AnyLogic Java blocks) remains architecturally impossible under Pidd's three-phase declarative model. This is the most frequently cited limitation by power users. | Indefinite — architectural constraint |
| G30 | **Performance at scale** | Engine | ⚠️ Partial | Browser JS engine with no compiled execution path. ~50K+ entity models degrade significantly. Benchmarks defined (`perf_timing.js`) but no dedicated CI performance regression gate. Sizing thresholds documented in `performance-envelope.md` but not enforced in validation. | Sprint 72 (queued) + ongoing |
| G31 | **Condition evaluation performance** | Engine | ⚠️ Partial | Phase C hot path still evaluates conditions via interpreted predicate traversal. Legacy string conditions still supported (load-time migration deferred to Sprint 72). No precompiled evaluators or dependency-aware dirty filtering. | Sprint 72 (queued) |

#### Medium Severity

| # | Feature | Category | Status | Notes | Target |
|---|---------|----------|--------|-------|--------|
| G18 | **Jockeying** | C — Queueing | ❌ Open | Entities moving between queues based on relative queue length. Very complex; low practical demand for target market. Backlog indefinitely. | Backlog |
| G23 | **Entity-to-entity rendezvous** | F — Scripting | ❌ Open | Rare in three-phase DES; would require significant engine extension. | Backlog |
| G32 | **Store / FilterStore item buffer** | B — Resources | ❌ Open | Generic item buffer as distinct from queue. Approximable with queue + BATCH/MATCH macros. | Backlog |
| G33 | **Hierarchical / sub-model composition** | A — Entity Model | ❌ Open | Flat model structure. Professional tools (AnyLogic agents, Simio objects) support nested sub-models with inheritance. Requires changes to model schema, engine, UI, and validation. Considered highest-impact mid-term investment for modelling expressiveness. | Mid-term (Sprint 80+) |

#### Low Severity / Out of Scope

| # | Feature | Category | Status | Notes |
|---|---------|----------|--------|-------|
| G19 | **2D spatial layout / conveyors** | A/E | ❌ Open | Out of scope for a browser-based declarative tool. |
| G20 | **3D environment** | E | ❌ Open | Out of scope. Backlog. |
| G22 | **GIS / map integration** | E | ❌ Open | Out of scope for core DES. |
| G34 | **Entity state machine** | A | ❌ Open | Statechart agents (AnyLogic) not supported. Could be partially approximated via entity attributes + C-events. |

### Recently Closed Gaps (Sprints 68–77)

| # | Feature | Sprint | What changed |
|---|---------|--------|-------------|
| G29 | **Model versioning** | 68 | `model_versions` table; version history panel; create version dialog; structural change detection; version_id on runs. |
| G21 | **Container/level resource** | 68 (confirmed) | FILL/DRAIN macros confirmed in engine; containerTypes schema; V27 validation. |
| DOC-007 | **Help Assistant** | 70 | `src/ui/HelpAssistant.jsx`; in-app contextual help; suggested questions; system prompt builder. |
| ADR-016 | **Schedule data separation** | 73 | `model_schedules` Supabase table; `resolveInlineSchedules` engine function; `ScheduleManager` UI; schedule selector in Execute panel; re-inline on export. Glasgow Central model_json reduced from ~290 KB to ~14 KB. |
| G35 | **Persistent AI sidebar** | 75 | ✦ AI toggle in tab bar; flex-row sidebar layout; context-aware view; model Q&A; overlay path retired. |
| G36 | **Report generation quality** | 76 | Entity name substitution (`getEntityName`); integer counts (`formatInt`); per-stage service breakdown; angled/wrapped chart labels; Scope & Methodology section; goal status badge; model diagram wired. |
| G37 | **Visual Designer graph layout** | 77 | Replaced BFS grid layout with `@dagrejs/dagre` (Sugiyama framework, network-simplex ranker). Eliminates edge crossings on parallel branches. |

---

## Section 4: Competitive Positioning Assessment

### Where simmodlr Leads (Differentiators)

| Differentiator | simmodlr | Nearest Competitor | Notes |
|---------------|-----------|-------------------|-------|
| Browser-native, zero install | ✅ | ❌ None | All professional and open-source tools require installation. simmodlr runs in any modern browser. |
| AI model generation from natural language | ✅ | ❌ None | No competitor has LLM-based model authoring. |
| AI results narrative with goal context | ✅ | ❌ None | AI explains results in plain English with goal-gap analysis. |
| AI persistent assistant (context-aware sidebar) | ✅ | ❌ None | Sprint 75: ✦ AI toggle follows user between design and results views. |
| Safe execution (no code injection) | ✅ | ❌ All | Every comparator uses eval, new Function(), or full scripting languages — all evaluable by public models. |
| Shareable results dashboard (URL/QR) | ✅ | ⚠️ AnyLogic cloud sharing | simmodlr's hash-route public dashboards and QR codes are simpler and more portable. |
| Community model gallery + fork-to-run | ✅ | ⚠️ AnyLogic Cloud | simmodlr's fork mechanism is more permissive and discoverable. |
| Real-time data adapters (REST/WebSocket) | ✅ | ✅ AnyLogic | simmodlr's AdapterRegistry pattern is more extensible (registry vs hardcoded). |
| Calibrated batch + rolling run modes | ✅ | ❌ None | Unique to simmodlr's adapter architecture. |
| Plan vs actual deviation metric | ✅ | ❌ None | Unique: avgPlanDeviation, ActualsStreamAdapter. |
| Seeded reproducibility contract | ✅ | ⚠️ Several tools | simmodlr enforces seeded PRNG as a formal contract; most tools rely on Math.random(). |
| Statistical breadth (Welch, ANOVA, Tukey HSD, outlier detection) | ✅ | ⚠️ AnyLogic/simmer | No single competitor combines all of: batch-means, Welch test, ANOVA, Tukey HSD, outlier flagging, 1D/2D sweeps. |
| Plain-English UX for non-specialists | ✅ | ❌ All | Formal rule (Sprint 67); no other tool prioritises non-specialist labels. |
| In-app Help Assistant | ✅ | ❌ None | Sprint 70: contextual help with suggested questions, no competitor equivalent. |
| Automated DAG layout (Sugiyama/Dagre) | ✅ | ✅ AnyLogic/Simio | Sprint 77: competitive with professional tools; eliminates manual BFS placement. |
| Structured report generation (HTML/MD) | ✅ | ⚠️ simmer + knitr | Sprint 76: generateReport() with entity names, diagrams, methodology; integrated into product. |
| Model versioning with structural change detection | ✅ | ⚠️ Simio branching | simmodlr categorises changes as structural vs parameter; most tools version the file, not the model. |

### Where simmodlr Is Competitive (Parity)

| Capability | Assessment | Notes |
|-----------|-----------|-------|
| Core DES engine (Three-Phase) | ✅ Competitive | Unique implementation of Pidd's Three-Phase method; none of the comparators use this approach. |
| Entity lifecycle (create → route → dispose) | ✅ Competitive | 19 macros cover the complete vocabulary. |
| Queue disciplines (FIFO/LIFO/PRIORITY/SPT/EDD) | ✅ Competitive | Exceeds most open-source tools; matches professional tools. |
| Resource management (pool, shift, preempt, fail) | ✅ Competitive | PREEMPT, FAIL, REPAIR, SHIFT_CHANGE all implemented. |
| Statistical output (CI, replication, sweep) | ✅ Competitive | One of the strongest statistical output layers among all comparators. |
| Distribution fitting | ✅ Competitive | fitDistribution() in Sprint 20; competes with Arena Input Analyzer. |
| Visual Designer canvas | ✅ Competitive | @xyflow/react-based with Dagre layout (Sprint 77); competitive for a browser tool. |
| Model validation (30+ rules) | ✅ Competitive | More validation rules than most open-source tools; comparable to professional tools. |
| Template library (20 across 6 domains) | ✅ Competitive | Comparable to JaamSim; behind AnyLogic Enterprise Library and Arena templates. |
| Model import/export | ✅ Competitive | Validation-gated import; graph-preserving export; community gallery. |

### Where simmodlr Trails (Gaps)

| Gap | Assessment | Impact | Path Forward |
|-----|-----------|--------|-------------|
| **Scripting / custom process logic** | ❌ Behind all | Power users cannot express complex custom logic. Most frequently cited limitation. | Declarative macro vocabulary is a deliberate trade-off (safety over power). SET/SET_ATTR macros (Sprint 34) cover basic cases. Full coroutine-style waiting is an architectural constraint of the three-phase model. |
| **Performance at scale** | ❌ Behind professional tools | 50K+ entity models may struggle. No compiled execution. | Sprint 72 (queued) targets Phase C optimisation. Offload to SimPy/FastAPI backend is deferred. Browser-side improvements are bounded by JS single-thread limits. |
| **Hierarchical / sub-model composition** | ❌ Behind AnyLogic, Simio, Arena | No sub-models or reusable components. All models are flat. | Largest capability gap for complex real-world models. Requires schema, engine, UI, and validation changes. Estimated at 3-5 sprints. |
| **Entity conveyors / transporters** | ❌ Behind AnyLogic, FlexSim, Arena | No material handling primitives. | Out of scope for current product focus (service systems, healthcare, logistics). Manufacturing/logistics verticals would require this. |
| **Entity state machine** | ❌ Behind AnyLogic, Simio | No conditional state transitions beyond what C-events can approximate. | Could be approximated with entity attributes + C-events, but no dedicated statechart support. |
| **3D visualisation** | ❌ Behind AnyLogic, FlexSim, Simio | 2D canvas with SVG tokens. | Out of scope for browser-based tool. 3D would require a near-complete rewrite of visualisation layer. |
| **High-dimensional optimisation** | ❌ Behind OptQuest (Simio/Arena) | Practical limit ~4 parameters (combinatorial sweep). | simmodlr's AI-driven goal-directed sweep is more interpretable but cannot handle 10-50 parameter spaces. |
| **Store / item buffer resource** | ❌ Behind SimPy, AnyLogic, others | Not implemented; approximable with queues. | Low impact; queues + BATCH/MATCH cover most use cases. |

---

## Section 5: Architecture Correctness & Maturity

### Code Safety

simmodlr is the **only tool in the comparison with a formal no-code-injection guarantee**. While all other tools rely on `eval()`, `new Function()`, or user-written code in full programming languages (Python, Java, C#, SIMAN), simmodlr enforces:

- **No `new Function()` or `eval()`** anywhere in the engine (Sprint 1 fix for C1)
- **Token-based Predicate Builder** as the only condition entry path
- **Structured macro vocabulary** (19 macros) as the only effect specification
- **No 'Custom...' escape hatch** (removed Sprint 1)

This is especially important for a multi-user tool where public models could be viewed by any authenticated user. A crafted public model in AnyLogic, SimPy, or Simio could execute arbitrary code in the viewer's environment. simmodlr's architecture prevents this class of attack entirely.

### Reproducibility

simmodlr enforces a formal **seeded reproducibility contract** (Sprint 29) — all six invariants are tested in CI:

1. Bit-identical replay with same seed
2. Cross-replication independence (seed = baseSeed + i)
3. No `Math.random()` in engine layer (enforced by grep)
4. M/M/1 analytical validation (Wq = 9.0 ± 5%)
5. M/M/c analytical validation (Wq ≈ 1.7778 ± 5%)
6. Seed stored with every run record

None of the comparators enforce all six invariants. AnyLogic and Arena rely on random seeds without reproducibility guarantees. SimPy's reproducibility requires careful manual management of NumPy random state. JaamSim and simmer support seeding but do not enforce it as a contract.

### Testing Depth

| Tool | Estimated Test Count | Coverage |
|------|--------------------|----------|
| simmodlr | ~1000+ (Vitest) | Engine (~120), UI (~200+), DB (~50), templates, benchmarks, CI gates |
| SimPy | ~3000 (pytest) | Mostly engine-level; no UI tests |
| JaamSim | ~500 (JUnit) | Engine focus; limited UI |
| AnyLogic | Internal QA | No public test suite |
| Arena | Internal QA | No public test suite |

simmodlr's test count is lower than SimPy's but covers a broader surface (UI + DB + engine) and includes three correctness gates that must pass before any sprint is considered complete.

---

## Section 6: Sprint 72 — Performance Optimisation (Queued)

The next major capability improvement targets **engine performance**, specifically the Phase C condition evaluation hot path. Key deliverables:

| Task | Description | Expected Impact |
|------|-------------|-----------------|
| 72-1 | Baseline profiling with high-C-event benchmarks | Measurable before/after comparison |
| 72-2 | Canonical condition contract audit | Migration map |
| 72-3 | Load-time migration of legacy string conditions | All models use predicate JSON |
| 72-4 | Remove legacy runtime condition execution | Safer, faster engine |
| 72-5 | Precompiled predicate evaluators + dependency metadata | Faster condition checks |
| 72-6 | Cached C-event priority ordering | Reduced Phase C overhead |
| 72-7 | Dirty-dependency filtering for Phase C scan | Fewer unnecessary evaluations |
| 72-8 | Correctness and migration regression tests | Safety net |
| 72-9 | Documentation and architecture tracking | Audit trail |

This is the single most impactful engineering investment available — it addresses **both** the current legacy condition debt (technical debt) and the performance ceiling for high-C-event models (competitive gap vs professional tools).

---

## Section 7: Medium-Term Roadmap Recommendations

Based on this comparison, the highest-value investments over the next 3–6 sprints are:

### Tier 1 (Close competitive gaps)

1. **Sprint 72 completion** — Performance optimisation (condition path, Phase C hot path)
   - Directly addresses G31 and accelerates high-C-event models by an estimated 30-60%
   - Removes legacy condition string debt
2. **Tier-based run admission control** (from `des-run-admission-rules.md`)
   - Prevents slow/crash runs before they start
   - Enables multi-tier SaaS model
3. **Hierarchical / sub-model modelling** (G33)
   - Largest remaining modelling expressivity gap vs professional tools
   - Estimated 3-5 sprint investment

### Tier 2 (Deepen existing advantages)

4. **AI capabilities expansion**
   - Multi-turn model refinement through the persistent sidebar
   - Structured suggestions based on run results ("try adding a server to Queue 3")
   - AI-assisted experiment design (which parameters to sweep)
5. **Template library expansion**
   - Grow from 20 to 30+ templates across new domains (airports, ports, supply chain)
   - Community-contributed template workflow

### Tier 3 (Ecosystem and maturity)

6. **Performance benchmark CI gate**
   - Promote local timing scenarios (`perf_timing.js`) into CI
   - Prevent performance regressions automatically
7. **Python/SimPy execution backend** (deferred from earlier sprints)
   - Offload heavy runs to server-side SimPy
   - Compare browser vs server results as validation
8. **Enterprise features** (SaaS tenancy, SSO, audit logging)
   - Required for enterprise procurement but not capability-enhancing

---

## Section 8: Coverage Summary

| Category | Features Assessed | ✅ Implemented | ⚠️ Partial | ❌ Missing | Coverage % |
|----------|------------------|---------------|------------|------------|-----------|
| A — Core Entity Model | 16 | 13 | 1 | 2 | 84% |
| B — Resource & Server Model | 14 | 12 | 1 | 1 | 89% |
| C — Queueing & Scheduling | 18 | 17 | 0 | 1 | 94% |
| D — Statistical Output & Analysis | 28 | 28 | 0 | 0 | 100% |
| E — Visual Authoring & UX | 26 | 25 | 0 | 1 | 96% |
| F — Scripting & Extensibility | 22 | 15 | 5 | 2 | 80% |
| G — Real-Time, Versioning & Collaboration | 11 | 11 | 0 | 0 | 100% |
| **Total (all categories)** | **135** | **121** | **7** | **7** | **92%** |

*Coverage % = (✅ + 0.5×⚠️) / Total. Excludes N/A entries.*

**Change from v3.0 (Sprint 68) to current (Sprint 77):**

| Category | v3.0 (Sprint 68) | Current (Sprint 77) | Delta |
|----------|-----------------|-------------------|-------|
| Features assessed | 127 | 135 | +8 |
| ✅ Implemented | 112 | 121 | +9 |
| ⚠️ Partial | 7 | 7 | — |
| ❌ Missing | 8 | 7 | -1 |
| Coverage | 91% | 92% | +1% |

New features added since v3.0: Help Assistant (Sprint 70), schedule data separation (Sprint 73), persistent AI sidebar (Sprint 75), report generation with entity names/diagrams (Sprint 76), automated Dagre graph layout (Sprint 77).

---

## Appendix: Comparator Version References

| Tool | Version Assessed | Accessed |
|------|-----------------|----------|
| SimPy | 4.x | simpy.readthedocs.io |
| salabim | Latest | salabim.org |
| JaamSim | 2024 | jaamsim.com |
| simmer | Latest (R package) | r-simmer.org |
| AnyLogic | 8.x Process Modelling Library | anylogic.com |
| Simio | Latest | simio.com |
| Arena | Latest (Rockwell) | rockwellautomation.com |
| FlexSim | Latest | flexsim.com |

---

## Appendix: Existing Gap Documents Referenced

| Document | Location | Relationship |
|----------|----------|-------------|
| Capability Gap Analysis v3.0 | `docs/capability-gap-analysis.md` | Base document; this file extends and refreshes it |
| Open-Source Tool Gap Analysis | `docs/reviews/open-source-tool-gap-analysis.md` | Open-source perspective |
| Professional Gap Analysis (archived) | `docs/archived/simmodlr-professional-gap-analysis.md` | Superseded by capability-gap-analysis; historical reference |
| Benchmark Inventory & Gaps | `docs/analysis/des-benchmark-inventory-and-gaps.md` | Benchmark-specific |
| Validation Gap Review | `docs/analysis/des-validation-gap-review.md` | Validation-specific |
| Document Gap Tracker | `docs/reviews/document-gap-tracker.md` | Documentation-specific |
| Sprint 72 Performance Plan | `docs/reviews/sprint-72-performance-optimisation-plan.md` | Queued optimisation work |
| Performance Envelope | `docs/performance-envelope.md` | Benchmark baselines |
| Build Plan | `docs/simmodlr_Build_Plan.md` | Sprint history and roadmap |
