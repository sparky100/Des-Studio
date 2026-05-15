> **SUPERSEDED** — This document has been replaced by `docs/capability-gap-analysis.md`.
> All gap analysis findings have been incorporated into the current capability gap analysis.
> Date superseded: 2026-05-15

# DES Studio — Professional Gap Analysis

**Date:** 2026-05-08  
**Comparator set:** Arena, Simio, AnyLogic, FlexSim, ExtendSim  
**Scope:** Capability coverage for production discrete-event simulation work

---

## Verdict

DES Studio is a capable **academic/pedagogical tool** and a solid **prototyping environment** for mid-complexity queueing models. It is **not yet a replacement** for AnyLogic, Simio, or Arena in production environments. The architecture is clean enough that bridging most gaps is architecturally feasible, but each represents significant engineering.

The single biggest practical gap for professional use is the **absence of an optimizer** — most real-world simulation projects are about finding optimal resource allocations, not just measuring current-state performance.

---

## Gap Table

| #   | Gap                                   | Severity   | DES Studio                                                                                                            | Professional Tool Baseline                                                                       | Effort to Close                                                  |
| --- | ------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | Performance at scale                  | **High**   | JS engine in browser tab. 50K+ entity models will struggle. No compiled execution. No database-backed entity storage. | Compiled engines (C++/Java). Cloud batch execution. Million-entity scale.                        | Very large — requires rearchitecture or SimPy/FastAPI backend    |
| 2   | Input modeling — distribution fitting | **High**   | User manually picks distribution type and parameters. No automatic fitting.                                           | Auto-fit empirical data to theoretical dists with chi-square/K-S goodness-of-fit.                | Medium — well-understood algorithms, can be browser-side         |
| 3   | Statistical output analysis           | **High**   | Mean + 95% CI + waiting-time percentiles only.                                                                        | ANOVA, batch-means, Welch warm-up detection, multiple-comparison methods, design of experiments. | Large — the statistical engine itself is significant engineering |
| 4   | Optimization (search)                 | **High**   | None. Manual trial-and-error only.                                                                                    | OptQuest, genetic algorithms, parameter sweeps, scenario comparison.                             | Very large — requires scenario/optimization engine               |
| 5   | 2D/3D visualization                   | **Medium** | Basic 2D node canvas with coloured token dots.                                                                        | Rich 3D facility layouts with realistic object animation.                                        | Very large — 3D rendering is a product in itself                 |
| 6   | Cost & financial modeling             | **Medium** | No cost variables, resource cost rates, or financial KPIs.                                                            | Resource cost rates, per-activity costing, ROI calculation, P&L output.                          | Medium — add cost fields to model schema                         |
| 7   | Hierarchical modeling                 | **Medium** | Flat model structure. No sub-models or reusable components.                                                           | Hierarchical sub-models, libraries, reusable template objects.                                   | Large — affects model schema, engine, UI, validation             |
| 8   | Live data connectivity                | **Medium** | No database/API/ODBC connectors during runs.                                                                          | JDBC/ODBC/REST connectors for real-time data during simulation.                                  | Medium — REST connector via Edge Functions                       |
| 9   | Pre-built model library               | **Low**    | No templates. Every model starts from scratch.                                                                        | Call center, manufacturing, healthcare, logistics templates.                                     | Medium — content effort, not engineering                         |
| 10  | Team collaboration                    | **Low**    | Basic public/private sharing. No diffing, branching, review, or change history.                                       | Shared model repositories, branching, access control, audit trails.                              | Large — full platform feature                                    |
| 11  | Maturity / validation                 | **Low**    | 523 tests. Built in ~3 weeks.                                                                                         | Decades of field validation across thousands of real-world models.                               | Not quantifiable — requires time + users                         |
| 12  | Extensibility                         | **Low**    | Closed five-macro vocabulary. Registry pattern for distributions.                                                     | Java/C# scripting, custom process blocks, plug-in architecture.                                  | Large — needs scripting runtime or plug-in API                   |
| 13  | Cold-start model building             | **Low**    | AI-generated model authoring covers basic patterns.                                                                   | Arena Process Wizard, AnyLogic Enterprise Library wizards.                                       | Already competitive — AI authoring is a strength                 |

---

## Detailed Gap Analysis

### Gap 1 — Performance at Scale (High)

**Current state:** The engine runs synchronously in a single browser thread. Entity count is bounded by available heap. The largest model tested is M/M/1 with ~10,000 arrivals. No streaming or disk-backed entity storage exists.

**Professional baseline:** AnyLogic and Simio compile to Java/C++. FlexSim uses C++. Arena runs on a compiled foundation. Million-entity runs are routine. Cloud-based batch execution is standard.

**Path forward:** The Sprint backlog already has "SimPy/FastAPI backend on Render" deferred to post-Sprint 12. This is the correct approach — offload heavy runs to a Python backend while keeping light prototyping in-browser.

---

### Gap 2 — Input Modeling (High)

**Current state:** Users must understand distributions. Choosing between Normal and Lognormal for a given dataset requires statistical knowledge. No distribution fitting wizard exists.

**Professional baseline:** Arena's Input Analyzer, AnyLogic's distribution fitting tool, and Stat::Fit all accept raw data, test candidate distributions, rank by goodness-of-fit, and generate parameter estimates automatically.

**Path forward:** Medium effort. Add a client-side distribution fitting module using standard MLE/moment-matching. Integrate into the DistPicker as a "Fit to data" flow.

---

### Gap 3 — Statistical Output Analysis (High)

**Current state:** The engine reports means, 95% CIs (t-distribution), and waiting-time percentiles. No warm-up detection, no output analysis for terminating vs. steady-state, no multiple comparison.

**Professional baseline:** Arena's Output Analyzer provides batch-means for autocorrelated output, Welch's method for warm-up detection, paired-t and Bonferroni for scenario comparison, and automated warm-up truncation.

**Path forward:** Large effort. The statistics module (`src/engine/statistics.js`) would need significant extension. This is methodologically sensitive — incorrect implementation yields invalid conclusions.

---

### Gap 4 — Optimization (High)

**Current state:** No optimizer. Model parameters (capacity, count, rate) can only be changed manually between runs. No automated search.

**Professional baseline:** OptQuest (embedded in Arena, Simio, AnyLogic) uses scatter search and tabu heuristics. Simio supports tabu search, genetic algorithms, and Nelder-Mead. FlexSim includes OptQuest.

**Path forward:** Very large effort. Requires a scenario management system (multi-parameter configs), a search engine, and a results comparison dashboard. This is the single biggest gap for professional use.

---

### Gap 5 — 2D/3D Visualization (Medium)

**Current state:** Execute canvas shows a 2D node diagram with entity token dots (coloured circles). No spatial layout, no geometry, no animation beyond token movement.

**Professional baseline:** AnyLogic supports full 3D with CAD import, camera controls, floor plans, and realistic entity shapes. FlexSim has industrial-strength 3D with import from STEP/STL.

**Path forward:** Very large effort. Adding 3D rendering would be a near-complete rewrite of the visualization layer. The current 2D canvas is architecturally sound for what it is — accept this gap as a conscious product boundary.

---

### Gap 6 — Cost & Financial Modeling (Medium)

**Current state:** No cost tracking. Resources have counts but no cost rates. Activities have no per-use cost. No financial KPIs.

**Professional baseline:** Resource hourly costs, per-transaction activity costs, capital costs, operating costs, NPV/ROI/Payback period outputs.

**Path forward:** Medium effort. Add cost fields to resource/activity definitions. Track cumulative cost in engine state. Display cost KPIs in results. No architectural change needed.

---

### Gap 7 — Hierarchical Modeling (Medium)

**Current state:** Flat model structure. All entity types, queues, and activities exist at the same level.

**Professional baseline:** AnyLogic supports hierarchical agents, reusable model libraries, and inheritance. Simio has object templates with inheritance.

**Path forward:** Large effort. Requires changes to model schema (sub-model references), engine (cross-model entity routing), UI (sub-model editor), and validation. Consider deferring indefinitely.

---

### Gap 8 — Live Data Connectivity (Medium)

**Current state:** No runtime data access. All model parameters are static at run-start.

**Professional baseline:** AnyLogic database query blocks, Simio ODBC data sources, FlexSim SQL queries. Models can read live data mid-run.

**Path forward:** Medium effort. Add a REST/DB query primitive via an Edge Function or the existing LLM proxy infrastructure.

---

### Gap 9 — Pre-built Model Library (Low)

**Current state:** No templates. The sample M/M/1 model is hardcoded in `src/App.jsx`.

**Professional baseline:** Comprehensive template libraries for call centers, manufacturing, healthcare, logistics, airports.

**Path forward:** Medium effort (content, not engineering). Create a set of curated templates stored in Supabase. This is a documentation/content task once the UI supports import from a template gallery.

---

### Gap 10 — Team Collaboration (Low)

**Current state:** Basic public/private model sharing. Fork-on-run for non-owners. No diffing, branching, or review.

**Professional baseline:** Git-like model versioning, role-based access, shared model libraries, change history with annotations.

**Path forward:** Large effort. Requires a collaboration layer on top of Supabase. ADR-008 defers SaaS tenancy/workspaces to post-Sprint 12.

---

### Gap 11 — Maturity / Validation (Low, by nature)

**Current state:** 523 tests across 18 sprint cycles (~3 weeks of development). One benchmark (M/M/1).

**Professional baseline:** Thousands of validated models across decades. Vendor QA teams. Academic peer review. Field testing on hundreds of real projects.

**Path forward:** Not solvable through engineering alone. Requires users, field exposure, and time. Each deployed model adds to validation confidence.

---

### Gap 12 — Extensibility (Low)

**Current state:** Closed five-macro vocabulary. New distributions can be added via `registerDistribution()`.

**Professional baseline:** AnyLogic's Java API, FlexSim's C++ scripting, Simio's expression language — users write custom process logic.

**Path forward:** Large effort. Adding a scripting layer (e.g., a sandboxed JS evaluation for custom C-Events) would need careful security design and would reintroduce some of the XSS risk removed in Sprint 1.

---

### Gap 13 — Cold-Start Model Building (Low — Strength)

**Current state:** AI-generated model from natural language description. Diff preview, partial apply. This is genuinely competitive.

**Professional baseline:** Arena Process Wizard (guided template), AnyLogic Enterprise Library wizards. Most tools lack LLM integration entirely.

**Path forward:** Already a strength. Continue improving prompt quality and model coherence. This is DES Studio's differentiator.

---

## Summary

| Area | Competitive? | Notes |
|---|---|---|
| Core DES engine | **Yes** | Three-Phase, seeded, safe evaluator, clean architecture |
| Modelling vocabulary | **Mostly** | Covers queueing, routing, pooling, balking. Missing batching + rework. |
| AI integration | **Ahead** | Model authoring + run analysis. No competitor has this. |
| Three authoring modes | **Ahead** | Forms + AI + Visual Designer is genuinely novel. |
| Performance | **No** | Largest gap for production use. |
| Optimization | **No** | Biggest practical gap — most projects need this. |
| Statistical analysis | **No** | Needs output analysis engine. |
| Visualization | **No** | 2D canvas is fine for development, not for stakeholder presentation. |
| Collaboration | **No** | Single-user at core. Sharing is basic. |

**Bottom line:** DES Studio is architecturally sound, genuinely innovative in its AI and authoring-mode approach, and well-positioned as a **design-phase prototyping tool** or **academic teaching platform**. For production simulation work at enterprise scale, 3–5 major engineering efforts (performance, optimization, statistics, collaboration, visualization) separate it from professional-grade tools. The architecture is clean enough to close these gaps incrementally — none require a rewrite.
