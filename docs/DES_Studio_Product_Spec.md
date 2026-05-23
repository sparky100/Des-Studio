# DES Studio — Product Specification
**Version:** 1.2.0
**Date:** 2026-05-23
**Sprint baseline:** Sprint 70
**Status:** Living document — reviewed and updated at end of each sprint

---

## Version History

| Version | Date | Sprint | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2026-05-16 | Sprint 45 | Initial product specification |
| v1.1.0 | 2026-05-17 | Sprint 55a | Added COSEIZE macro; updated limitations (loopConfig/balkCondition status); AI Apply & Re-run; keyboard shortcuts; cost summary in Results view; distribution picker redesign; responsive layout; sprint 46–55a roadmap closure |
| v1.1.1 | 2026-05-19 | Sprint 67 plan | Added plain-English-first UI requirement and Results presentation ordering requirements |
| v1.2.0 | 2026-05-23 | Sprints 68–70 | Model versioning (explicit milestones, version history panel, structural change detection); AI debugging (trace emission, model checker); Help Assistant (in-app contextual help with suggested questions); documentation accuracy fixes |

---

## 1. Product Vision

DES Studio is a browser-native, no-code discrete-event simulation platform that enables operations analysts and simulation practitioners to build, run, and optimise queueing models without writing code. Users describe a system in terms of arrivals, queues, resources, and service times; the platform constructs, executes, and analyses the model and then surfaces results through interactive charts, animated flow views, and AI-generated narratives. The goal is to compress the modelling cycle — scenario to model to experiment to actionable insight — from days to hours, making rigorous simulation accessible to anyone who understands a queue.

---

## 2. Target Users and Use Cases

### Operations Analyst

**Who they are.** An analyst working inside a hospital, call centre, airport, logistics hub, or public sector organisation. They are responsible for recommending staffing levels, capacity investments, or process redesigns. They understand queueing concepts (utilisation, wait time, throughput) but are not software developers.

**What they want.** They want to justify a decision — "we need three more nurses on the morning shift" — with quantitative evidence rather than gut feel. They need confidence intervals, scenario comparisons, and a way to share results with a manager who will not run the model themselves.

**Features they primarily use.** Forms/Tabs editors for precise model control; Replication batch for statistical confidence; Parametric Sweep with Goal Feasibility to find the minimum staffing that meets a service-level target; the Analysis view for KPI summaries; Share link and QR code to present results to decision-makers.

---

### Engineering Student

**Who they are.** An undergraduate or postgraduate student studying industrial engineering, operations research, systems engineering, or health informatics. They are learning discrete-event simulation for the first time and need to connect theoretical concepts (M/M/c queues, Erlang-C, Little's Law) to observable behaviour.

**What they want.** They want to experiment without fear of breaking something. They want to start from a working example, change one parameter, and immediately see what happens. They also want the AI to explain what they are seeing — not just report numbers, but help them understand why a 90% utilised server produces such a long queue.

**Features they primarily use.** Template Library (especially M/M/1 and ER Triage) as learning scaffolds; AI Model Generator to bootstrap unfamiliar scenarios; AI Insights — specifically Interpret Results and Ask a Question — to build intuition; Live View to watch entity flow animate in real time; Histograms to understand wait-time distributions visually.

---

### Consultant / Decision Maker

**Who they are.** A management consultant who builds models for clients, or a senior manager or executive who needs to view and share a colleague's model. They may not build models themselves, but they need to read results, validate that the scenario is realistic, and distribute findings.

**What they want.** They want a polished, self-contained results view they can open without a login, share in a meeting via QR code, and hand off to others. They need KPI cards to tell an immediate pass/fail story against agreed service-level targets.

**Features they primarily use.** Share link with configurable widget visibility; QR code for presentation sharing; read-only DashboardView of saved run results; goal-aware KPI cards showing green or red against targets; Export CSV for further analysis in Excel or PowerPoint.

---

## 3. Core Capabilities

### 3.1 Model Authoring

DES Studio provides three authoring modes. All three modes edit the same underlying model — they are different views onto one canonical model definition, not separate formats. Switching between modes never loses data or requires a conversion step.

**Forms/Tabs.** The default authoring mode. Each model element type (Entity Types, Queues, B-Events, C-Events, State Variables, Performance Goals, Containers) has its own tab with structured fields, dropdown selectors, and distribution pickers. This mode is the most precise: every field is explicitly visible and every option is reachable. Best for modellers who know exactly what they want to configure, or who need to check that a parameter was set correctly.

**AI Generator.** The "Generate with AI" button accepts a natural-language scenario description and produces a complete starter model: entity types, queues, events, distributions, and suggested performance goals. The AI Generator is best used for bootstrapping — it creates the structural skeleton in seconds, which the modeller then refines in Forms/Tabs or the Visual Designer. The AI Generator also supports results-informed refinement: after a run it can propose model changes based on what the results reveal, using the same structured six-step analysis as Suggest Improvements.

**Visual Designer.** A drag-and-drop canvas showing the model as a flow graph — queues as rectangles, events as rounded rectangles or diamonds, entity types as circles, with arcs connecting them. The Visual Designer is best for reviewing topology, confirming that routing connections are correct, and presenting the model structure to stakeholders. Clicking any node opens an inspector panel with the same editable fields as Forms/Tabs.

### 3.1a Plain-English Interaction Standard

DES Studio is designed for advanced modellers, but user-facing wording must not assume that every user wants simulation jargon as the first layer of explanation.

**Product requirement:** labels, section headings, action buttons, empty states, and results summaries must follow a **plain-English-first** pattern:

1. **Primary wording in everyday language** — describe the purpose of the option or result
2. **Technical detail as support** — keep domain terms, method names, validation codes, IDs, and raw formats in helper text, tooltips, captions, or expandable advanced sections

Examples:
- Prefer **Run** over **Execute**
- Prefer **Results** over **Analysis** when the destination is the results workspace
- Prefer **Ignore early results** with helper text noting the technical term **warm-up period**
- Prefer **Real-world start date and time** with helper text noting **epoch**

This requirement applies across authoring, execution, results, and history surfaces.

---

### 3.2 Model Elements

#### Entity Types

Entity types define the actors in the model. A customer entity type (patients, calls, trucks, jobs) arrives, waits in queues, receives service, and departs. A server entity type (nurses, agents, machines, beds) holds the resource capacity that customer entities compete for.

Each entity type can carry named attributes — numeric values that travel with every instance through the model (for example, a severity score for patients, a priority level for jobs, or a due date for manufacturing orders). Attributes can be updated mid-simulation using the SET_ATTR macro, enabling dynamic priority reordering and conditional routing decisions.

Server entity types support **failure models** — each server can be configured with a mean time between failures (MTBF) and mean time to repair (MTTR). When a server fails, in-progress service is interrupted with remaining service time preserved; when repair completes, the server re-enters the available pool. Server entity types also support **shift schedules** — time-varying capacity that models day/night shifts, weekend staffing, and seasonal variation by specifying how many server units are active at each time point.

#### Queues

Queues are the buffers where customer entities wait for service. Each queue is configured with a **discipline** that determines selection order: FIFO (first in, first out), LIFO (last in, first out), Priority (by a numeric entity attribute — lowest value served first), SPT (shortest processing time first), EDD (earliest due date first), or a named attribute-based priority.

Queues support a finite **capacity** limit. When the queue is full, arriving entities are directed to an **overflow destination** (a different queue or a sink). Queues also support **balking** — either a probability that any arriving entity simply leaves, or a conditional expression (balkCondition) that evaluates queue state and entity attributes to decide whether a specific arriving entity joins or leaves.

#### B-Events (Bound Events)

B-Events are the time-scheduled workhorses of the model. They fire at a specific simulated time: arrivals inject new entities into the system, service completions free resources and route entities onward, and failure events place servers into a down state. Each B-Event carries a distribution that governs when its next occurrence is scheduled and an effect sequence specifying what happens when it fires. A **loop guard** can be placed on a B-Event to cap the number of times an entity recirculates through it, preventing infinite rework loops.

#### C-Events (Conditional Events)

C-Events fire when a condition becomes true during the model's conditional phase. They are the resource allocation decisions: "if there is a patient waiting and a doctor is free, start the consultation." C-Events are tested repeatedly after every B-Event until no more can fire. They model the state-driven logic that separates real operational systems from simple flow diagrams.

#### State Variables

State variables are model-level numeric counters or flags that any event can read or write. They are used to track cumulative counts (total calls handled, total cost accrued), implement custom flags (rush hour active), or accumulate metrics that are not automatically captured by the engine. State variables are visible in the event log and in the Analysis view.

#### Performance Goals

Performance goals define the feasibility thresholds that turn the tool from a measurement instrument into a decision-support system. A goal specifies a metric (average wait time, queue length, utilisation, throughput, total cost), an operator, and a target value — for example, "average wait in the Emergency Queue must be less than 5 minutes." Goals drive the colour coding of sweep charts, focus AI suggestions on unmet targets, and display pass/fail indicators on every KPI card.

#### Containers

Containers are level-based resource pools: a named quantity with a capacity and a current level. Unlike server entity types — which model discrete resource units — a container models a continuous or large-integer resource such as a blood bank inventory, a fuel tank, or a warehouse buffer. The FILL macro adds a specified quantity to the container; the DRAIN macro removes a quantity but only fires when the current level is sufficient, making drain a conditional operation. This allows inventory replenishment and consumption to be modelled precisely.

---

### 3.3 Effect Macros

Effect macros are the action vocabulary of DES Studio. They appear in the Effects field of every B-Event and C-Event. Multiple macros can be chained in sequence in a single effects field.

#### Flow Control

| Macro | Plain-English Purpose |
|-------|-----------------------|
| ARRIVE | Creates a new entity instance and injects it into a target queue, then schedules the next arrival |
| COMPLETE | Marks an entity as served, records its lifecycle statistics, and removes it from active service |
| RELEASE | Frees one unit of a server resource and routes the entity to the next queue in the flow |
| ASSIGN | Takes the next eligible entity from a queue and binds it to a free server, starting the service clock |
| RENEGE | Removes an entity that has waited too long from a queue before it reaches service |

#### Resource Management

| Macro | Plain-English Purpose |
|-------|-----------------------|
| PREEMPT | Interrupts the entity currently in service on a server and replaces it with a higher-priority entity; the displaced entity re-enters the queue with its remaining service time preserved |
| FAIL | Places a server into a failed (unavailable) state, re-queuing any entity that was mid-service |
| REPAIR | Restores a failed server to idle status so it can resume accepting entities |

#### Entity Transformation

| Macro | Plain-English Purpose |
|-------|-----------------------|
| SPLIT | Creates N−1 clones of the current entity, each following an independent downstream path — useful for parallel lab tests or order line splitting |
| BATCH | Collects N individual entities from a queue into a single batch entity for group processing |
| UNBATCH | Restores the original individual entities from a completed batch back into a target queue |
| MATCH | Pairs one entity from each of two queues into a single batch — models kitting and assembly operations where two components must meet |
| COSEIZE | Atomically claims one entity from a queue and one idle server of each listed type simultaneously; if any type has no idle server the entire attempt fails cleanly with no partial seizure — models operations that require multiple resource types at once (for example, a patient who needs both a doctor and an examination room) |

#### State Manipulation

| Macro | Plain-English Purpose |
|-------|-----------------------|
| SET | Sets a model-level state variable to a given value |
| SET_ATTR | Updates a named attribute on the current entity instance mid-simulation (enables dynamic priority changes and conditional downstream routing) |
| COST | Adds a calculated amount to the entity's cost record and to the model's cumulative cost total |

#### Container

| Macro | Plain-English Purpose |
|-------|-----------------------|
| FILL | Adds a quantity to a named container, up to its capacity |
| DRAIN | Removes a quantity from a named container; only fires when the current level is sufficient |

---

### 3.4 Running Experiments

**Single run.** The simplest experiment: the model runs from time zero to the configured end time. The modeller can step through events one at a time in single-step mode to inspect every event in sequence, or click Run All to complete the run in one pass. Auto-run mode drives the simulation continuously at an adjustable speed, updating Live View in real time.

**Replication batch.** A batch of independent runs, each using a different random seed, executed in parallel. DES Studio aggregates the replications and reports a 95% confidence interval for every KPI. Outlier replications — those deviating more than two standard deviations from the batch mean — are flagged. Replications are the right experiment mode when statistical rigour matters: a single run is one observation; thirty replications produce a distribution of outcomes.

**Parametric sweep (1D).** One model parameter is varied across a defined range and step size — for example, server count from 1 to 8. DES Studio runs the full replication batch at each value and plots a KPI response curve. When performance goals are defined, each point on the curve is coloured green (all goals met) or red (at least one goal violated), so the feasible region is immediately visible.

**Parametric sweep (2D).** Two parameters are varied simultaneously across a grid. DES Studio runs the full replication batch at every grid point and renders the results as a heatmap. The same goal-feasibility colouring applies — green cells are feasible configurations; red cells are not. The best feasible point (meeting all goals at minimum cost or maximum throughput) is annotated on the heatmap. This mode is particularly effective for staffing optimisation: vary both server count and shift length, for instance, and find the minimum-cost configuration that still meets service-level targets.

---

### 3.5 Execution Panel Views

**Live View.** An animated canvas showing entity tokens (small circles, coloured by entity type) flowing along arcs between queues and events in real time. Queue nodes swell visually as entities accumulate. Server nodes display their current state — idle, busy, or failed — through colour coding. Live View is used to confirm that model topology is wired correctly and to demonstrate system behaviour to stakeholders who may not be familiar with tables and charts.

**Log.** A scrollable, searchable event-by-event record of everything that happened during the run. Each row shows simulation time, event phase (B or C), event name, entity ID, and a plain-English description of the action. The log can be filtered by phase and searched by entity or event name. The full log exports to CSV for external analysis in spreadsheets or scripting environments.

**Histograms.** A bar chart of waiting time for each queue, showing the empirical distribution of how long entities waited before service began. Vertical markers indicate the p50, p90, and p99 percentiles. Histograms make tail behaviour visible — a mean wait of five minutes with a p99 of forty minutes tells a very different story than a mean of five minutes with a p99 of eight minutes.

**Entities.** A per-entity lifecycle table. Each row represents one entity instance; columns include arrival time, service start time, departure time, time spent waiting, and any custom attribute values. The table is sortable and filterable. An anomaly detection layer highlights rows where waiting time or total time in system is more than three standard deviations from the mean, enabling fast identification of individual outlier cases and root-cause investigation.

**Analysis.** The primary results dashboard, built on the ResultsWorkspace. It presents aggregate KPI cards (throughput, mean wait, mean time in system, goal pass/fail status with green or red borders), per-queue wait statistics (mean, maximum, p50, p90, p99), per-resource utilisation bars, a cumulative mean chart with Welch warmup cutoff marked, and — when replications have been run — a replication summary table showing the mean and 95% confidence interval for every KPI.

### 3.5a Results Presentation Principles

The Results workspace must be organized around the modeller's decision-making flow, not the internal analysis pipeline.

**Required presentation order:**
1. **Results summary** — what happened?
2. **Reliability / confidence** — can these results be trusted yet?
3. **Bottlenecks and pressure points** — where are queues, waits, or utilisation problems emerging?
4. **Detailed charts** — supporting visuals
5. **Raw data and exports** — numbers behind the charts

**Required wording pattern:**
- Lead with outcome and consequence before statistical method
- Use question-led headings where possible (for example, *How reliable are these results?*)
- Keep advanced analysis terminology available, but secondary to the plain-English explanation
- Show data provenance as supporting captions rather than as the dominant section heading

---

### 3.6 AI Insights

The AI Insights panel provides five analytical capabilities, all grounded in the current run's results and the model definition. As of Sprint 45, every AI call receives the model's performance goals, structural summary, per-queue wait distributions, entity failure counts, and anomaly data — giving the AI the specific context it needs to make precise, actionable observations rather than generic queueing advice.

**1. Interpret Results.** Produces a plain-English narrative of what the simulation found: overall system performance, which queues are longest, which resources are most utilised, whether performance goals are met, and any notable patterns such as queue oscillation or a long warmup transient.

**2. Suggest Improvements.** Produces a structured six-step analysis for each suggested change. The steps are: (1) identify the binding constraint — the queue, resource, or event limiting performance; (2) diagnose the root cause — why the constraint exists; (3) propose a specific, actionable change to the model; (4) estimate the predicted effect quantitatively; (5) assess whether the change is expected to bring the model within the configured performance goal thresholds; and (6) rank all suggestions by expected value. Because the AI receives goal gap data directly, suggestions focus on whatever is blocking feasibility first.

**3. Sensitivity Analysis.** Assesses how much uncertainty exists in the results. The output identifies KPIs with wide confidence intervals relative to their point estimates, flags parameters where small changes produce large KPI swings, and recommends whether the current replication count is sufficient to draw reliable conclusions.

**4. Ask a Question.** A free-form conversational interface. The modeller types any question about the model or the run — "Why is utilisation above 90%?", "What would happen if I added a priority queue for urgent patients?", "Is the warmup period long enough?" — and the AI answers using the model JSON and the current results as context.

**5. Compare Runs.** The modeller selects two saved runs from Run History and requests a comparison. The AI produces a narrative covering which run performed better on each KPI, whether differences are statistically meaningful given confidence interval overlap, and an interpretation of why the results differ — based on the different model parameters or structural changes between the two runs.

---

### 3.7 Help Assistant

The Help Assistant provides contextual, in-app guidance accessible from any screen via the `?` button in the toolbar. Unlike the AI Insights panel (which analyses run results), the Help Assistant answers questions about how to use DES Studio itself — model building, experiment setup, interpreting validation errors, and selecting distributions.

**How it works.** Clicking the `?` button opens a chat-style panel with suggested questions. The assistant's knowledge base covers:
- Model element definitions (entity types, queues, B-events, C-events, state variables, containers)
- Effect macro usage and syntax
- Distribution selection guidance (which distribution for which scenario)
- Validation error explanations (plain-English meanings of V1–V29, W-CAP-01, W-CAP-02)
- Experiment setup (warmup period, replications, parametric sweeps)
- Results interpretation (KPI meanings, confidence intervals, goal feasibility)

**Suggested questions.** The assistant surfaces context-aware suggestions based on the current screen:
- In the Entity Types tab: "What's the difference between customer and server entities?", "When should I use attributes?"
- In the B-Event editor: "What does ARRIVE do?", "How do I set up reneging?"
- In the Distribution picker: "Which distribution should I choose for arrivals?", "What's the difference between Triangular and Normal?"
- When validation errors are present: "What does V8 mean?", "How do I fix 'no arrival source'?"

**Plain-English-first.** Answers follow the same plain-English-first pattern as the rest of DES Studio: primary explanation in everyday language, with technical terms and syntax details in expandable sections or code examples.

---

### 3.8 Sharing and Exporting

**Share link.** From any model or saved run, a unique shareable URL can be generated. The share modal lets the modeller configure which widgets are visible to the recipient — for example, showing only the KPI summary and queue stats but not the full event log. Recipients can view results in read-only mode without signing in.

**QR code.** The share modal also generates a QR code alongside the URL, suitable for display in presentations or printed reports. Scanning the code opens the same read-only results view.

**Export results.** From the Analysis view or Run History, results can be exported as CSV (KPI summary table, per-queue stats, per-resource utilisation, and optionally the per-entity lifecycle table — suitable for Excel or R) or as JSON (the full results object including replication data and confidence intervals — suitable for archival or programmatic processing). The event log can be exported separately as CSV from the Log view.

**Export model.** The model definition can be downloaded as a JSON file and imported into any DES Studio instance, enabling model portability and sharing of model structures separately from results.

**Export report.** After a completed run, a professional Word document (`.docx`) can be exported containing: cover page, executive summary, AI-generated model description, experiment configuration, model diagram screenshot, simulation results with confidence intervals, AI recommendations, and full model appendix.

---

## 4. Performance Goals and Feasibility

Performance goals are a first-class feature of DES Studio, not an afterthought. A goal specifies a metric, an operator, and a target — for example, `avgWait < 3` or `utilisation < 0.85`. Multiple goals can be defined on the same model.

Once goals are defined, they influence the tool's behaviour across every surface:

- **KPI cards in the Analysis view** show a green border when a goal is met and a red border when it is violated — giving an immediate pass/fail read without requiring the user to compare numbers manually.
- **Parametric sweep charts** colour every data point on the response curve: green when all goals are met at that parameter value (the feasible region), red when at least one goal is violated. This makes the feasibility boundary visually immediate.
- **AI Insights receives the goal gap data directly.** When Suggest Improvements or Sensitivity Analysis runs, the AI knows not just the current KPI values but how far each KPI sits from its target. This directs suggestions toward whatever is preventing feasibility rather than toward general optimisation.
- **2D sweep heatmaps** apply the same colouring logic across the full parameter grid, enabling the identification of minimum-cost or minimum-staffing feasible configurations at a glance.

---

## 5. Template Library

The template library provides 14 pre-built simulation models organised across six domains. Clicking a template in the Templates tab saves a private, editable copy to the modeller's account and opens it with automatic execution enabled — results appear within seconds, so the model can be explored before anything is changed.

Templates are read-only originals; each modeller's copy is fully owned by them. All templates carry domain and metadata fields used by the gallery's domain filter and search, and all templates are validated to produce non-zero throughput on a clean run.

| # | Template Name | Domain | Primary Concept |
|---|---------------|--------|-----------------|
| 1 | M/M/1 Queue | Academic | Single-server benchmark; compare against analytical formula |
| 2 | Call Center | Service Systems | Multi-server queue with RENEGE abandonment |
| 3 | ER Triage | Healthcare | Two-stage priority queue with severity attribute |
| 4 | Fast Food Drive-Through | Service Systems | Three-stage sequential routing |
| 5 | Factory Assembly | Manufacturing | BATCH macro — accumulate parts before processing |
| 6 | Airport Security | Service Systems | Finite queue capacity with balking |
| 7 | Construction Logistics | Logistics | RELEASE macro with state variable counters |
| 8 | Data Center | Technology | Large resource pool (10 servers), light load |
| 9 | Outpatient Clinic | Healthcare | Two-stage RELEASE routing with state tracking |
| 10 | Warehouse Picking | Logistics | BATCH consolidation before processing |
| 11 | Ward Bed Admission | Healthcare | Finite-capacity bed pool with bed-blocking |
| 12 | Bank Branch | Service Systems | PRIORITY queue discipline with customer segmentation |
| 13 | Retail Checkout | Service Systems | Multi-server finite-capacity queue with balking |
| 14 | Port Berth Operations | Logistics | High-utilisation multi-server congestion |

---

## 6. Limitations and Known Constraints

DES Studio is a mature and widely capable tool, but the following limitations apply as of Sprint 55a.

**No entity conveyors or transporters.** Material-handling systems that model the physical movement of entities between locations — conveyor belts, automated guided vehicles, fork-lift routing — are not natively supported. These require continuous spatial modelling that is outside the discrete-event entity-flow paradigm the current engine implements.

**No real-time collaboration.** DES Studio is a single-user tool per model session. Two users editing the same model simultaneously will overwrite each other's changes. There is no presence indicator, conflict resolution, or live cursors. This is a known gap that would require a separate collaboration infrastructure layer.

**Templates are read-only originals.** When a user opens a template, DES Studio creates a private copy. The original template cannot be edited by regular users. Template updates (bug fixes, new capabilities) are applied to the originals and propagate to users who open the template after the update — but do not automatically update copies that were already made.

**AI Insights require a configured LLM API key.** The five AI Insights capabilities (Interpret Results, Suggest Improvements, Sensitivity Analysis, Ask a Question, Compare Runs) depend on a large language model provider configured by the platform administrator. DES Studio deployments without a configured API key will show the AI Insights panel but will be unable to generate responses. Self-hosted deployments require an Anthropic or OpenAI API key set in the platform admin panel.

**AI Apply & Re-run supports numeric field patches only.** The Apply & Re-run feature can automatically apply suggestions that change numeric fields (server count, queue capacity, state variable values). Suggestions requiring structural model changes — adding a new queue, changing routing topology, adding a new event — are presented as manual instructions; the Apply button is disabled for these.

---

## 7. Delivered Since Sprint 45

Sprints 46 through 70 are complete. The following user-visible capabilities were added.

| Sprint | Capability |
|--------|-----------|
| 46 | **AI Apply & Re-run** — structured suggestion cards; "Apply & Re-run" button runs a patched model copy and shows before/after goal compliance without mutating the saved model |
| 47a | **Paste JSON import** — model JSON can be pasted directly from the clipboard in the library header, alongside the existing file-upload import |
| 47 | **Accessibility (WCAG 2.1 AA)** — focus-visible outlines, minimum 11 px text, aria-live regions on AI streaming, scope attributes on table headers, aria-labelledby on modals, improved colour contrast |
| 48 | **Design token system** — unified SPACE, RADIUS, SHADOW, Z-index, TRANS, and TYPO tokens; alpha() utility; consistent across all editor components |
| 49 | **UX quick wins** — Ctrl+S / Cmd+S save shortcut; two-step discard confirmation; dismissible starter guide card; tab badge tooltips showing first validation message |
| 50 | **Feedback & notifications** — toast notification system (success/error/warning/info, auto-dismiss, max 3 visible); save banner replaced by toasts; bulk run selection in history (select-all, bulk archive/export); keyboard shortcuts modal (? key) |
| 51 | **DistPicker redesign** — distribution families (Parametric / Time-varying / From data); sparkline shape preview; inline parameter validation on blur |
| 52 | **Responsive layout** — "More ▾" tab overflow dropdown at compact widths; Execute panel vertical stacking on narrow viewports; admin panel single-column on mobile |
| 53 | **Internal refactoring** — AuthShell and ModelHistoryTab extracted; no user-visible change |
| 54 | **Cost summary in Results view** — total cost, cost per served entity, and served count appear as a dedicated strip in the Analysis view whenever the model uses at least one COST macro |
| 55a | **Internal refactoring** — ModelHealthPanel, ModelDetailHeader, SaveBanner, ModelTabBar, AppNavBar, ModelLibrary, ExperimentControls extracted; no user-visible change |
| 68 | **Model versioning** — explicit milestones with version history panel, create version dialog with notes, structural change detection, run records reference version |
| 69 | **AI debugging** — trace emission for every event fire, model checker for validation errors, event provenance and arbitration trace |
| 70 | **Help Assistant** — in-app contextual help with suggested questions, accessible from any screen via ? button |

## 8. Roadmap (Sprint 71 and Beyond)

Leading candidates for subsequent sprints include:

- **Per-replication entity anomaly aggregation.** Surface entity types and attribute combinations that are consistently anomalous across replications, not just within a single run.
- **Prompt caching for reduced AI latency.** Apply prompt caching to the static model-context portions of AI Insights calls, reducing cost and response time for users who run multiple AI analyses in a session.
- **AI comparison mode with full goal gap awareness.** Extend the Compare Runs narrative to receive goal gap data for both selected runs.
