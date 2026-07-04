# simmodlr — Product Specification

**Version:** 7.6.0  
**Date:** 2026-06-20  
**Sprint baseline:** Sprint 89  
**Status:** Living document — reviewed and updated at end of each sprint  
**Note:** package.json version is 0.9.0-Beta; version alignment with spec version number pending.

---

## Contents

1. [Problem Statement](#1-problem-statement)
2. [Target Audience](#2-target-audience)
3. [Core Features (MoSCoW)](#3-core-features-moscow)
4. [User Stories](#4-user-stories)
5. [Success Metrics](#5-success-metrics)
6. [Plain-English Interaction Standard](#6-plain-english-interaction-standard)
7. [Known Limitations and Deferred Items](#7-known-limitations-and-deferred-items)

---

## 1. Problem Statement

Operations teams — in hospitals, logistics networks, call centres, public transport, and manufacturing — routinely need to justify capacity and staffing decisions with quantitative evidence. The standard questions are: *How many servers do we need to meet a service-level target? What happens if demand grows by 20%? Where is the bottleneck?*

The honest answer to these questions requires discrete-event simulation. But traditional DES tools require software engineering skill to use: scenario logic is expressed in procedural code, statistical machinery must be configured by hand, and results are buried in data files that require further tooling to interpret. This places rigorous simulation out of reach for most operations analysts and makes the modelling cycle take days when it should take hours.

simmodlr exists to close that gap. It brings production-grade DES — the Three-Phase method, seeded parallel replications, confidence intervals, parametric sweeps, and statistical tests — to a browser-based, no-code interface. A domain expert who understands queues should be able to build, run, and present a credible model in an afternoon.

---

## 2. Target Audience

### 2.1 Operations Analyst

**Who they are.** An analyst inside a hospital, local authority, logistics hub, call centre, or utility. They are responsible for recommending staffing levels, capacity investments, or process redesigns. They understand queueing concepts (utilisation, wait time, throughput) but are not software developers.

**What they need from simmodlr.** Evidence for a decision: "we need three more nurses on the morning shift." That evidence must include confidence intervals (so it is statistically defensible), scenario comparisons (so alternatives are explored), and a format that can be shared with a manager who will not run the model themselves.

**Primary features.** **Define** editors (structured forms for each model element type) for precise model control; multi-replication runner for statistical confidence; Parametric Sweep with Goal Feasibility to find the minimum staffing that meets a service-level target; the Results view for KPI summaries; Share link and QR code for presenting results to decision-makers.

---

### 2.2 Engineering Student

**Who they are.** An undergraduate or postgraduate in industrial engineering, operations research, or health informatics. They are learning DES for the first time and need to connect theory (M/M/c queues, Erlang-C, Little's Law) to observable behaviour.

**What they need from simmodlr.** A low-risk environment to experiment. Start from a working example, change one parameter, see what happens, and understand *why*. The AI-generated narrative after a run should explain behaviour, not just report numbers.

**Primary features.** Template Library (especially M/M/1 and ER Triage) as learning scaffolds; AI Generator to bootstrap unfamiliar scenarios; Results → Explain for building intuition; Execute canvas to watch entity flow animate in real time; wait-time histograms to understand distributions visually.

---

### 2.3 Consultant and Decision-Maker

**Who they are.** A management consultant who builds models for clients, or a senior executive who needs to view and share a colleague's results. They may not build models themselves, but they must read results, validate realism, and distribute findings.

**What they need from simmodlr.** A polished, self-contained results view openable without a login, shareable via QR code, and readable without simulation background. KPI cards must tell an immediate pass/fail story against agreed service-level targets.

**Primary features.** Share link with configurable widget visibility; QR code for presentations; read-only public dashboard; goal-aware KPI cards (green/red against targets); Export CSV for PowerPoint; Senior Management report in plain English.

---

## 3. Core Features (MoSCoW)

### Must-have

These are non-negotiable. Removing any one of them makes simmodlr no longer a simulation platform.

| # | Feature | Description |
|---|---------|-------------|
| M1 | **Three-Phase DES engine** | Pidd's A/B/C algorithm with restart rule, pure JavaScript, runs in browser or Web Worker. No `eval`, no `new Function`. |
| M2 | **Entity model** | Typed entity types with named attributes (number/string/boolean). Entities flow through queues and are served by resources. |
| M3 | **Queue disciplines** | FIFO, LIFO, PRIORITY, SPT, EDD. PRIORITY requires a numeric entity attribute. |
| M4 | **Macro vocabulary** | 24 action macros: ARRIVE, ASSIGN, BATCH, CANCEL, COMPLETE, COSEIZE, COST, DELAY, DRAIN, FAIL, FILL, FINISH, MATCH, PREEMPT, RELEASE, RELEASE_COSEIZED, RENEGE, RENEGE_OLDEST, REPAIR, ROUND_ROBIN, SET, SET_ATTR, SPLIT, UNBATCH. |
| M5 | **Predicate Builder** | Type-safe, point-and-click condition editor for C-Events. No free-text logic. Operator set constrained by attribute type. |
| M6 | **Distribution library** | 14 distribution types: Exponential, Uniform, Normal, Triangular, Fixed, Lognormal, Erlang, Empirical, Categorical, Piecewise, Attribute-based (ServerAttr, EntityAttr), Schedule, Distance (travel time from a declared distance ÷ a speed attribute — Reference Data tab). Lognormal is recommended for heavily right-skewed durations (repair times, long-tail task durations). Seeded PRNG (mulberry32). No `Math.random()` in engine. |
| M7 | **Validation gates** | 79 validation rules (V1–V70, plus named V-SKILL-*, V-CAL-*, V-SLOT-* rules). Blocking errors prevent run; warnings proceed with banner. Model Health panel shows live status. |
| M8 | **Health flag system** | Deterministic post-run health evaluation across 13 codes (H1-H13) covering utilisation (80/90/95% thresholds), queue growth, starvation, completion rate, peak overflow, Little's Law validation, resource failure/downtime (H12), and engine cycle-limit truncation (H13). Flags carry severity (critical/warning), suggested actions, and resource attribution. Displayed as a "Key Findings" banner above all result summaries. |
| M9 | **Multi-replication runner** | Parallel Web Worker pool. Configurable seed, warm-up period, termination condition, max sim time. |
| M10 | **Confidence intervals** | 95% CI via batch means. Displayed on all KPI cards for multi-replication runs. |
| M11 | **Define editors** | Structured UI editors for all model element types, accessed via the **Define** button in the Design toolbar. Sub-sections: Entity Types, Queues, B-Events, C-Events, Schedules, Model Data. No free-text logic fields. |
| M12 | **Run history** | Every run saved (summary + model snapshot). Reproducible via stored seed and schedule reference. |
| M13 | **Supabase persistence** | Models, runs, schedules, and user accounts stored in PostgreSQL with Row-Level Security. |

### Should-have

High-value features that are complete but whose absence would degrade the platform significantly.

| # | Feature | Description |
|---|---------|-------------|
| S1 | **Visual Designer** | @xyflow/react drag-and-drop canvas (**Draw** button). Writes to the same `model_json` as the Define editors. Supports mouse and touch-friendly multi-select, group move, and bulk delete for larger diagrams; node duplication and clipboard copy/paste (Ctrl+D / Ctrl+C / Ctrl+V); and inline editing of probabilistic-routing branch probabilities directly on the edge label, without leaving the canvas. |
| S2 | **AI Generator** | Natural-language model authoring. Four-phase conversation (clarify / confirm / build / refine). Produces complete `model_json`. |
| S3 | **Execute canvas** | Topology-derived live flow canvas. Entity token animation, queue depth badges, server utilisation overlays. |
| S4 | **Parametric sweep** | 1D and 2D sweeps with Goal Feasibility line. Two-scenario comparison uses paired-t confidence intervals with Bonferroni correction. Note: tukeyHSD() and oneWayANOVA() are implemented in the engine but not yet wired to the UI. |
| S5 | **Warm-up diagnostics** | Welch graphical warm-up test. Transient detection. Replication-level variance chart. |
| S6 | **Report generation** | Senior Management and Technical reports in HTML and Markdown. AI-written narrative sections grounded in run results. |
| S7 | **Live health warnings** | 7 live warning codes (L1-L7) evaluated per-step during Step and AutoRun execution. Covers utilisation thresholds, starvation percentage, continuous starvation duration, sustained high utilisation, zombie asset detection, and queue capacity overflow. Displayed as a clickable ⚠ badge in the compact run bar. Zero overhead when timeSeries is disabled (batch/sweep/experiment runs). |
| S8 | **Run mode UX** | During Step and AutoRun, the sidebar, header, and section tabs collapse into a compact bar showing only run controls (Step, Auto Run, speed, Cancel). The BottomPanel defaults to collapsed with touch-friendly resize. |
| S9 | **Share / public dashboard** | Public link, QR code, embeddable widget. Read-only. No login required for viewers. |
| S10 | **Model versioning** | Explicit milestones with notes. Version history panel. Structural change detection. Run records reference version snapshot. |
| S11 | **Simulation Assistant (AI)** | Persistent sidebar. Design mode: tab-aware suggested questions and model Q&A with full structure context (entity attributes, queue configs, C-event logic). Run mode: canvas diagnostics (entity inspector, event log overlays) with model Q&A above. Results mode: Analyse, Compare, and Refine Plan tabs — all manual, no auto-fire. Also includes **⚡ Optimise** for adaptive batch analysis.
| S12 | **Template library** | 26 pre-built templates covering healthcare, logistics, transport, manufacturing, and service industries. Browsable by domain chip filter and text search. |
| S13 | **Schedule Manager** | Named timetables (e.g. Weekday, Weekend) stored separately from `model_json` (ADR-016). CSV and Excel/XLSX import, multi-event import, and inline-row migration to named schedules. Schedule selector in Execute panel. |
| S14 | **Resource failures and shift-change behavior** | FAIL/REPAIR macros with MTBF/MTTR distributions. V37 validation enforces paired configuration. Shift-change behavior configurable per server: **Delay** (finish current service before applying shift change), **Preempt** (interrupt immediately; entity re-queues with remaining service time), or **Suspend** (pause service at shift boundary; resume on next shift start). |
| S24 | **Weekly schedule patterns** | Server entity types can define a repeating 24×7 capacity grid (hours × days of the week) via a visual grid editor. A linked shift schedule defines rostered staff. The engine tracks **per-shift utilisation** (horizontal bar chart in Results) and **schedule adherence** (colour-coded badge comparing actual vs. expected utilisation). 7 new validation rules (V50–V56) guard pattern consistency: epoch requirement, unscheduled hour gaps, capacity-vs-shift mismatch, overlapping shifts, and non-server schedule references. |
| S15 | **Voice input** | Microphone button in AI chat dialogs. Uses the Web Speech API to transcribe spoken input into the prompt field. |
| S16 | **Simulation Assistant / Optimise (AdaptiveBatchPanel)** | AI-driven bottleneck analysis, accessed via ⚡ Optimise in the Simulation Assistant sidebar. Runs adaptive replication stepping (increasing batch size until 95% CI is within ±5% of the mean), surfaces bottleneck resources and queues, and provides an Apply-to-model action. |
| S17 | **Run admission tier system** | Per-user run tier (Free/Standard/Pro) gates replications, run duration, planned schedule rows, and estimated C-event scans before a run starts, derived from a pre-run complexity estimate (the **Workload Estimate** panel on the Execute screen: planned arrivals, expected entities, stage moves, C-event scans, confidence). The panel auto-expands whenever the estimate produces an actionable warning or confirmation (e.g. chart data or live trace will be auto-disabled for this run); it can still be manually collapsed afterwards. After a run completes, the panel also shows how the estimate compared to what actually happened (scans/entities ratio vs. estimate), so the estimator's accuracy can be tracked over time. Enforced before each run. |
| S18 | **Per-outcome metrics** | avgWait and avgSojourn reported per journey outcome in run results, enabling comparison across routing branches. |
| S19 | **SimPy Python export and browser execution** | One-click export of any model as a runnable SimPy `.py` script. Category 1 (fully runnable) for models using standard macros; Category 2 (annotated TODO stubs) for models containing RENEGE, BATCH, MATCH, FAIL, REPAIR, PREEMPT, or RENEGE_OLDEST. Available from the header bar (⬇ SimPy button) and from the Access tab → Export section. Category 1 models can **Run in Browser** via Pyodide WebAssembly (~25 MB, cached after first use) — no Python installation needed; results load directly into the Results workspace with a `[SimPy]` source label and are saved to run history (label: `SimPy  DD/MM/YYYY HH:mm`). The Results workspace shows enriched KPI cards: arrivals, served, completion rate, avg wait, wait percentiles (P50/P90/P99), avg service time, avg sojourn, and per-resource utilisation. The generated script supports `RUN_MODE = "text"` (human-readable terminal output) or `"json"` (JSONL per-replication records for pipeline use); the browser runner sets `"json"` automatically. Piecewise, Schedule, and Empirical distributions are fully Category 1; all 26 built-in templates export runnable scripts. No round-trip import. |
| S20 | **Starvation tracking** | Per-resource starvation metric: cumulative time a server was idle despite entities waiting upstream (`starvationTime`) and the fraction of post-warmup time starved (`starvationPct`). Distinguishes upstream supply bottlenecks from capacity shortfalls — a high-utilisation server with non-zero starvation indicates a feed problem, not an under-capacity problem. Starvation is tracked independently of resource failures/downtime (H12) — a breakdown cannot itself inflate a starvation reading. If a server fails while idle, repair now correctly flushes the pre-failure idle interval into `starvationTime` rather than discarding it. |
| S21 | **Purge period** | Scheduled queue sweep that removes entities exceeding a maximum dwell time. Configured as a B-event with a fixed or periodic interval. Complements entity-driven reneging with a global timer-based clearance — useful for batch/job queues operating under SLA deadlines. |
| S22 | **Sign-in Welcome dialog** | Modal dialog shown to all users on every sign-in (not on page refresh). Four option cards in a 2×2 grid: **Create a Model** (opens NewModelModal with describe/draw/define framing), **Access the Model Library** (switches to My Models tab), **Build with AI Tools** (downloads AI Prompt Pack), **Get Help** (opens AI Help Assistant). Triggered via `signedInThisSession` boolean state in App.jsx; guarded by a `didShowWelcome` ref so it fires once per session. Race condition (dialog firing for existing users immediately on login) fixed by calling `setLoading(true)` in the SIGNED_IN auth handler before `setSession()`. |
| S23 | **AI Prompt Pack export** | `buildLLMSchemaPromptPack()` in `src/llm/bundleExport.js` bundles `docs/model-schema-for-llm.md` verbatim with a how-to preamble and starter prompt. Downloaded as `simmodlr-ai-prompt-pack.md` from: (a) the Welcome dialog → Build with AI Tools card, and (b) the **↓ AI Prompt Pack** ghost button in the Model Library header next to **+ New Model**. |

### Could-have

Valuable additions already partially implemented or planned for near-term sprints.

| # | Feature | Description |
|---|---------|-------------|
| C1 | **Real-time data adapters** | REST and schedule-feed adapters that bind live data to distribution parameters. |
| C2 | **Actuals tracking** | Plan vs actual deviation per entity. `avgPlanDeviation` in run summary. |
| C3 | **Magic-link model import** | Encode a model as a URL. Opening the link shows a pre-flight preview and saves to the library with one click. |
| C4 | **Community gallery** | Browse, tag, fork, and import public models shared by other users. Tag-filter UI and text search shipped for My Models, Public Library, and Community tabs; curator/fork workflow not yet built. |
| C5 | **Container resource pools** | FILL/DRAIN macros for bulk resource consumption (e.g. fuel, inventory). Both macros are fully implemented in the engine. |
| C6 | **Multi-shift rostering** | Named shift patterns bound to resource capacity over time. Currently limited to piecewise NHPP arrivals. |
| C7 | **Results API** | Read-only Supabase Edge Function (`supabase/functions/results-api/`) exposing three routes: `GET /runs/:runId`, `GET /runs?modelId=`, `GET /sweeps/:sweepId`. JWT Bearer auth. Share-token pass-through for publicly shared runs. |
| C8 | **LLM Export Bundle** | One-click Markdown export (`buildLLMBundle()` in `src/llm/bundleExport.js`) combining model definition, experiment configuration, and full results — including per-queue percentile tables, per-resource utilisation, 95% CIs (multi-replication), and goal pass/fail — with a plain-English DES preamble. Accessible via the Export… popover in the Execute panel. |
| C9 | **Direct model share link** | `#model/<modelId>` deep link, copied from the Access tab's Sharing section (**🔗 Copy link**). Opening it routes the recipient straight into that model using their existing visibility/access permissions (owner/editor/viewer opens the full editor; public-but-unowned opens read-only with a fork prompt; no access falls through to the normal Model Library with no error). Signed-out recipients are routed through sign-in first, then resume automatically. Pure client-side routing on top of the existing `fetchModels()` query and RLS policies — no new token, table, or anonymous-access mode, distinct from the run-level share-link feature (S9). |

### Won't-have (this release)

| # | Feature | Rationale |
|---|---------|-----------|
| W1 | **Agent-based simulation** | Fundamentally different modelling paradigm; outside simmodlr's scope. |
| W2 | **Continuous simulation (ODE solver)** | DES is discrete by design; continuous equations require a different engine. |
| W3 | **Code editor / scripting** | A deliberate non-goal. All logic is expressed through structured UI and Predicate Builder. |
| W4 | **Native mobile app** | Responsive web layout covers tablet use; full mobile authoring is deprioritised. |
| W5 | **Offline-first operation** | Supabase requires network connectivity for sync; anonymous local-only mode is a partial workaround. |

---

## 4. User Stories

### US-1 — Staffing decision with evidence

> *As an operations analyst, I want to run multiple replications of a staffing scenario and see 95% confidence intervals on average wait time, so that I can justify a headcount recommendation with statistical rigour rather than a single-point estimate.*

**Acceptance criteria:**
- Multi-replication runner executes ≥ 10 replications in parallel.
- Results Summary shows `mean ± CI` for all KPI cards.
- Run History records the seed, schedule, and model snapshot so the result is reproducible.

---

### US-2 — Learning by doing

> *As an engineering student, I want to open a pre-built M/M/1 template, change the arrival rate, re-run immediately, and see how the queue length changes — so that I can observe queuing theory behaviour directly rather than just solving equations.*

**Acceptance criteria:**
- Template library includes a validated M/M/1 model.
- Editing one distribution parameter and clicking Run takes fewer than 30 seconds.
- Results → Analysis shows the Welch warm-up plot so the student can see transient behaviour.

---

### US-3 — No-code model construction

> *As an analyst without programming experience, I want to describe my system in plain English and have the AI Generator produce a runnable model skeleton, so that I spend time refining the model rather than learning syntax.*

**Acceptance criteria:**
- AI Generator produces a `model_json` that passes validation with zero blocking errors for a well-described scenario.
- Refinement loop lets the user describe what is wrong and the AI patches the model without regenerating from scratch.
- Generated model is immediately editable via **Define** (structured editors) or **Draw** (Visual Designer).
- Visual Designer users can select multiple nodes, move them as a group, and delete them together without switching to the structured editor.

---

### US-4 — Scenario comparison for a decision-maker

> *As a senior manager, I want to open a shared results link from my phone and immediately see whether the proposed staffing change meets our service-level target — without logging in or understanding the model — so that I can give a go/no-go at the meeting.*

**Acceptance criteria:**
- Public results link opens without authentication.
- KPI cards show goal status as green (PASS) or red (FAIL) against the configured target.
- Senior Management report is written in plain English with High/Medium/Low confidence language.

---

### US-5 — Finding the minimum resource configuration

> *As an analyst, I want to run a parametric sweep over the number of servers (1 to 10) and see the average wait plotted against server count, with the service-level target drawn as a threshold line — so that I can identify the minimum number of servers that reliably meets the target.*

**Acceptance criteria:**
- 1D parametric sweep runs the full replication set for each parameter value.
- Results chart plots mean ± CI for each value.
- Goal Feasibility overlay shows where the target is met.
- Two-scenario comparison uses paired-t confidence intervals with Bonferroni correction to identify statistically distinguishable configurations.

---

### US-7 — Calendar-aware resource scheduling

> *As a shift manager, I want to define a repeating weekly capacity pattern for each server type (e.g. 2 nurses on the early shift, 1 on late), run the simulation, and see whether actual utilisation matches what the schedule planned — so that I can tell whether my headcount matches the workload pattern.*

**Acceptance criteria:**
- Weekly schedule pattern is editable as a 24×7 grid in the Entity Types editor (toggle to enable).
- Shift schedule rows define rostered staff (time windows with integer capacity).
- Engine tags each service event with the shift label active at the start of service (tag-on-seize).
- Results per-shift utilisation chart shows a horizontal bar for each shift (label, % busy, entities-per-capacity count).
- Resource cards display a colour-coded schedule adherence badge (green/amber/red) against the planned capacity.
- V50–V56 validation rules catch pattern/epoch/shift mismatches before the run.
- Multiplier mode (Sprint 87): schedule pattern can use percentages (0–100%) of a base capacity, enabling parametric sweeps over staffing levels. V57–V60 validation rules guard multiplier mode.

---

### US-6 — Export for Python practitioners

> *As a simulation researcher or Python developer, I want to export a model I built in simmodlr as a runnable SimPy Python script, so that I can use it as the basis for more complex experiments in code — adding custom distributions, logging, or integration with real data pipelines — without having to translate the model by hand.*

**Acceptance criteria:**
- Every valid model produces a `.py` file that runs without errors after `pip install simpy`.
- Category 1 scripts require no manual editing; the output is self-contained and correct.
- Category 2 scripts identify which macros need manual completion and provide a commented pattern for each.
- The export is available from both the header bar and the Access tab.
- Filename is derived from the model name (kebab-case slug + `_simpy.py`).
- Category 1 models can be executed directly in the browser; results appear in the Results workspace with a `[SimPy]` source label, carrying arrivals, served/reneged counts, completion rate, wait percentiles (P50/P90/P99), avg service time, avg sojourn, and per-resource utilisation.
- Browser runs are saved to run history with the label `SimPy  DD/MM/YYYY HH:mm`.
- Piecewise, Schedule, and Empirical distributions are fully Category 1; all 26 built-in templates export runnable scripts.

---

## 5. Success Metrics

| Metric | Target | Measurement method |
|--------|--------|-------------------|
| **Time to first runnable model** | < 30 minutes for a new user with a template | Usability session: time from login to first completed run |
| **AI Generator accuracy** | > 80% of generated models pass validation with zero blocking errors on first attempt | Automated test suite: generate from a fixed scenario set, count V1–V38 blocking errors |
| **Engine correctness** | M/M/1 mean wait within 5% of analytical value; M/M/c within 5% | CI benchmark scripts (`tests/engine/mm1_benchmark.js`, `tests/engine/mmc_benchmark.js`) — must exit 0 |
| **Test suite coverage** | ≥ 1,000 passing Vitest tests across engine, UI, and DB layers | `npm test -- --run` — exit 0 |
| **Build reliability** | Production build succeeds on every push to main | GitHub Actions build gate — exit 0 |
| **Replication throughput** | 100 replications of a 1,000-event model in < 60 seconds wall clock | Performance benchmark in CI |
| **Share link adoption** | ≥ 20% of completed runs result in a share link being generated | Supabase analytics on `run_results` table |
| **Report quality** | Senior Management report rated "useful" or "very useful" by ≥ 70% of reviewers | In-app Feedback widget (category: Report) |

---

## 6. Plain-English Interaction Standard

simmodlr is built for advanced modellers but must not alienate users who encounter it for the first time. All user-facing text — labels, headings, buttons, empty states, result summaries — follows this hierarchy:

1. **Primary wording in everyday language.** Describe the purpose of the option or result.
2. **Technical detail as support.** Keep domain terms, validation codes, raw IDs, and distribution names in helper text, tooltips, or expandable sections.

**Examples:**

| Avoid | Prefer |
|-------|--------|
| "V4 validation error" | "This queue uses priority ordering but no entity has a priority attribute" (with "V4" as a sub-label) |
| "MTBF/MTTR not configured" | "You've set the server to fail but haven't said how long failures last" |
| "C-scan restart limit exceeded" | "The simulation detected a possible loop in your service conditions (C-Event restart limit reached)" |
| "95% CI: [8.2, 11.4]" | "Average wait: 9.8 minutes (High confidence)" |
| Health Alerts | Key Findings |

This standard applies to all new UI text and to the AI-generated narrative in reports. Technical precision is preserved in the underlying data; the surface layer speaks plain English first.

---

## 7. Known Limitations and Deferred Items

| Item | Status | Notes |
|------|--------|-------|
| Full multi-shift rostering | ✅ Delivered (Sprint 86) | Weekly schedule patterns with 24×7 grid editor, shift schedule rows, per-shift utilisation tracking, schedule adherence badge, and 7 validation rules (V50–V56). Shift-change behavior (Delay/Preempt/Suspend) was delivered in Sprint 84. |
| Automated end-to-end tests | Not started | Manual smoke tests cover the golden path; no Playwright/Cypress suite exists. |
| Offline-first operation | Deferred | Anonymous local-storage mode exists; full offline Supabase sync is out of scope. |
| Dependency CVEs | Tracked | 4 moderate CVEs in Vite/Vitest; fix requires a Vite 8 breaking upgrade — deferred pending ecosystem readiness. |
| Native mobile authoring | Won't have | Responsive layout covers tablet; full small-screen authoring deprioritised. |
| Community gallery moderation | Partial | Import/export and tagging implemented; curator workflow and content moderation not yet built. |
| Event log via Results API | Degraded | At the default `"minimal"` persistence level the event log (`result.log`) is replaced by a 4-field `logSummary`. Full log retrieval requires `resultDetailLevel = "full"` (no UI control exists). The API response surfaces `logSummary` and documents the omission via `_trimmed_fields`. |
