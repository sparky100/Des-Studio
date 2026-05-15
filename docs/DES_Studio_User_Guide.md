# DES Studio User Guide

*Draft help documentation for new users.*

DES Studio is a browser-based discrete-event simulation modelling application. It helps you define, run, compare, and export simulation models without writing code.

The application is designed for modellers who understand queues, entities, resources, arrivals, service activities, and event-based simulation. DES Studio uses Pidd's Three-Phase Method:

- Phase A advances the simulation clock.
- Phase B fires scheduled events at the current time.
- Phase C repeatedly checks conditional events until no more can fire.

You do not need to write simulation logic manually. Models are built through structured editors, a visual graph canvas, and validated form controls.

## 1. Main Areas Of The Application

DES Studio has two main working areas:

| Area | Purpose |
|---|---|
| Model Library | Create, import, open, share, and delete models. |
| Model Detail | Edit a selected model, run experiments, review history, and export results. |

When you sign in, DES Studio opens the Model Library. If you are not signed in, DES Studio works in anonymous mode using browser local storage. Your models and run history are saved locally and are specific to that browser.

## 2. Model Library

The Model Library shows the models you can access.

### My Models

`My Models` contains models you own or models that have been shared with you.

From here you can:

- Create a blank model.
- Create the sample M/M/1 queue model.
- Import a DES Studio JSON model.
- Open an existing model.
- Delete a model that you own.

### Templates

The `Templates` tab contains pre-built simulation models covering common scenarios. Templates are read-only — clicking one creates a new private model from the template definition and opens it in the Execute tab for immediate use.

Available templates:

| Template | Description |
|---|---|
| M/M/1 Queue | Single-server queue with exponential arrivals and service. |
| Call Center | Multi-agent call centre with queuing and abandonment. |
| ER Triage | Emergency department with triage levels and priority queues. |
| Fast Food Restaurant | Kitchen and service counter with parallel cook stations. |
| Factory Assembly | Production line with component batching. |
| Airport Security | Security screening with multiple lanes and finite queue capacity. |
| Construction Logistics | Material delivery and crane allocation. |
| Data Center | Server rack processing with cooling constraints. |
| Outpatient Clinic | Multi-stage clinic flow with doctor and nurse resources. |
| Warehouse Picking | Order picking and packing with batch consolidation. |
| Ward Bed Admission | Hospital admission with bed capacity constraints and bed-blocking. |
| Bank Branch | Multi-server priority queue with customer segmentation. |
| Retail Checkout | Multi-server finite-capacity queue with balking. |
| Port Berth Operations | Multi-server high-utilisation queue with congestion. |

### Public Library

`Public Library` shows public models owned by other users.

When you open a public model that you do not own, DES Studio creates a private fork before running it. This protects the original model and keeps your run history separate from the owner's run history.

## 3. Creating Your First Model

If your library is empty, the first-run panel offers three choices:

| Option | When to use it |
|---|---|
| Create blank model | Start from scratch. |
| Create sample M/M/1 model | Learn from a runnable single-server queue. |
| Import JSON | Load an exported DES Studio model. |

For a first walkthrough, choose `Create sample M/M/1 model` or open a template from the Templates tab. These give you a working model with exponential arrivals, one server, a FIFO queue, and an execute-ready configuration.

## 4. Model Detail Tabs

Opening a model takes you to the Model Detail view. This view is organized into tabs.

| Tab | What it is for |
|---|---|
| AI Generated Model | Experimental or planned AI-assisted model authoring, depending on the deployed version. |
| Overview | Model name, description, high-level structure, and run count. |
| Entity Types | Define customers, servers, and their attributes. |
| State Vars | Define model-level numeric state variables. |
| B-Events | Define scheduled events such as arrivals and completions. |
| C-Events | Define conditional events such as seizing a server when a queue is non-empty. |
| Queues | Define waiting lines, queue disciplines, finite capacity, and overflow routing. |
| Visual Designer | Graph-based visual model authoring with a draggable node palette. |
| Execute | Run the simulation, replications, and view live results. |
| History | Review and export previous runs. |
| Access | Owner-only sharing and visibility controls. |

If you edit a model, a `Save` button appears. Use it to persist your changes. If you try to leave with unsaved changes, DES Studio warns you before discarding them.

Undo and redo are available while editing.

## 5. Visual Designer

The Visual Designer tab provides a graph-based authoring canvas alongside the Forms/Tabs editors. Models can be built using either approach — changes in one mode are reflected in the other.

### Node Palette

The left sidebar contains a palette of four node types:

| Node Type | Colour | Purpose |
|---|---|---|
| Source | Green | Entity arrival point. Configures entity type, target queue, and inter-arrival distribution. |
| Queue | Teal | Waiting line for entities. Configures name, entity type, discipline, capacity, and overflow. |
| Activity | Purple | Service or processing step. Configures condition, entity filter, server type, and service time. |
| Sink | Red | Entity exit point. Configures terminal macro (COMPLETE or RENEGE). |

Nodes can be clicked (adds at default position) or dragged from the palette onto the canvas.

### Connections

Drag from one node's output handle to another node's input handle to create a connection. Edge types include:

| Edge Type | Style | Meaning |
|---|---|---|
| Arrival | Solid | Source to Queue. |
| Condition | Solid | Queue to Activity. |
| Routing | Solid | Activity to Queue (with optional condition labels). |
| Terminal | Solid | Activity to Sink. |
| Overflow | Solid with label | Queue to overflow destination when queue is full. |
| Loop / rework | Amber dashed | Activity back to an earlier Queue for rework passes. |

Right-click an edge to delete it.

### Node Inspector

Clicking a node opens an inspector panel on the right side with fields specific to that node type. The inspector allows editing of all model parameters associated with the node — entity types, distributions, conditions, server types, and queue configuration.

### Validation

A validation checklist below the palette shows any canonical model errors or warnings. Clicking a validation item highlights the affected node on the canvas.

## 6. Core Modelling Concepts

### Entity Types

Entity types describe the things that move through or support the system.

Common examples:

- `Customer`
- `Patient`
- `Job`
- `Server`
- `Nurse`
- `Machine`

An entity type can include attributes, such as priority, category, service requirement, or any other value needed by the model.

### Queues

Queues hold waiting entities.

DES Studio supports queue discipline in the engine. Typical disciplines include:

| Discipline | Meaning |
|---|---|
| FIFO | First in, first out. |
| LIFO | Last in, first out. |
| PRIORITY | Lowest numeric priority value is selected first, with FIFO as a tie-breaker. |

Only use `PRIORITY` when the relevant entity type has a numeric priority attribute.

**Finite queue capacity:** Queues can be configured with a maximum capacity. When a queue reaches its capacity limit, arriving entities are blocked and routed to an overflow destination (another queue or system exit).

**Balking:** Arrival B-Events can be configured with a balking condition or probability. When the condition is true (or a random sample falls below the probability threshold), the entity declines to join the queue and is routed to the overflow destination instead. Balking count is recorded per queue.

**Overflow routing:** Both blocking (finite capacity) and balking use a shared `overflowDestination` field on the Queue definition. Overflow entities can be directed to another queue or exit the system entirely.

### B-Events

B-Events are scheduled events. They happen at a known simulation time.

Common B-Event examples:

- A customer arrives.
- A service activity completes.
- A reneging timeout occurs.
- A time-varying arrival rate changes.
- A resource shift changes capacity.
- A batch of entities is unbatched (UNBATCH).

B-Events can schedule future B-Events using distributions.

### C-Events

C-Events are conditional events. They fire when their condition is true.

Common C-Example examples:

- If a customer is waiting and a server is idle, start service.
- If a queue has capacity and a blocked entity exists, move the entity forward.
- If enough entities are waiting in a queue, form them into a batch (BATCH).

C-Events have explicit priorities. Lower numbers fire first. After any C-Event fires, DES Studio restarts the C-Event scan from the highest priority event, following the Three-Phase Method.

### Batching (BATCH / UNBATCH)

BATCH is a C-Event macro that accumulates entities from a queue into a batch group. When enough entities have accumulated, a single batch entity is created with the accumulated entities stored in its `batch.children` array. The batch entity uses the accumulated children as a single unit for downstream processing.

UNBATCH is a B-Event macro that restores the original child entities from a batch. The children are placed into a target queue as independent entities, and the parent batch entity is marked as complete.

Batching is useful for assembly operations, kitting, and order consolidation.

### Recirculation (Rework Loops)

DES Studio supports controlled recirculation through back-edges. Entity movement through a loop is governed by:

- **Entity.loopCount:** An auto-maintained attribute counting how many times an entity has passed through the loop.
- **maxLoopCount:** A configurable limit on the number of recirculations allowed.
- **exitQueueName:** The queue where the entity is routed when the loop limit is reached. If no exit queue is configured, the entity is marked as done.

Loops are visible in the Visual Designer as amber dashed edges labelled with the maximum loop count.

### State Variables

State variables store model-level numeric values. They are useful for counters, flags represented numerically, thresholds, or values used in conditions.

### Conditional Routing

B-Event RELEASE macro schedule rows can include a routing table with conditions and destination queues. When a RELEASE fires, conditions are evaluated in order; the first match determines the entity's destination. A `defaultQueueName` provides a fallback if no condition matches.

Probabilistic routing using weighted random branch selection (with seeded RNG) is also supported. Probabilities are configured on the RELEASE schedule row.

### Multi-Server Resource Pooling

Resources (servers) can have a capacity greater than 1. A resource with capacity N can serve up to N entities concurrently. The engine tracks idle and busy counts per resource type. The Predicate Builder exposes `idleCount` and `busyCount` for all resources.

### Waiting and resource ownership

Recent engine work makes waiting and service ownership more explicit.

- A queued entity is not just "somehow waiting". It is explicitly recorded as waiting for a named queue.
- When a server claims an entity, the relationship is mirrored on both sides: the entity knows which server is serving it, and the server knows which entity it is serving.
- When the entity is released, completes, reneges, or exits the system, that ownership is cleared.

In practice, this means:

- queue routing, release, recirculation, and batching flows behave more consistently
- stale timers are less likely to mutate entities that already moved on
- debugging run behaviour is easier because queue/service ownership is more deliberate

DES Studio still does **not** support first-class preemption or interruption. A busy resource does not yet pause one entity to serve another higher-priority one mid-service.

### Resource Preemption and Breakdowns

DES Studio supports resource preemption and breakdown/repair cycles for modelling real-world resource reliability.

**Preemption:** The `PREEMPT(ServerType)` macro interrupts busy servers of the specified type. The interrupted entity is re-queued with its remaining service time preserved (`_remainingService`). When the entity is re-seized, it resumes with the remaining service time instead of resampling a new duration.

**Breakdowns and Repair:** The `FAIL(ServerType)` macro sets all matching servers to a `failed` status. Failed servers are excluded from idle/busy counts and cannot be seized. The `REPAIR(ServerType)` macro restores failed servers to `idle` status.

**MTBF/MTTR Scheduling:** Server entity types can define `mtbfDist` (mean time between failures) and `mttrDist` (mean time to repair) distributions. The engine automatically schedules recurring FAILURE and REPAIR events in the Future Event List.

**Remaining Service Time:** When a server is preempted or fails, the remaining service time is calculated as `scheduledDuration - (clock - serviceStart)`. This value is preserved on the entity and used when the entity is re-seized, ensuring accurate service time accounting.

**Visualization:** Failed servers are shown as red dots on Activity nodes in the Execute canvas, with a warning badge indicating the failure count.

### Advanced Scheduling Macros

DES Studio includes three advanced scheduling macros for complex resource coordination:

**SPLIT(EntityType, N, TargetQueue):** Creates N-1 clones of the context entity, all placed in the target queue. The original entity is marked as the parent (`_splitParent = true`) with a `_splitChildren` array tracking clone IDs. Each clone carries `_splitFrom` (parent ID) and `_splitIndex` (clone number). Useful for modelling inspection splitting, copy operations, or parallel processing paths.

**COSEIZE(Queue, ServerType1, ServerType2, ...):** Atomically seizes one customer and multiple server types simultaneously. All server types must have at least one idle server available; if any type is fully busy, the COSEIZE fails entirely (no partial seizure). Useful for modelling operations requiring multiple coordinated resources, such as surgeries requiring a surgeon and anesthetist.

**MATCH(TypeA, QueueA, TypeB, QueueB, OutputQueue):** Pairs one entity of TypeA from QueueA with one entity of TypeB from QueueB, routing both to the OutputQueue. Entity types are validated against the typeA/typeB parameters — only matching entities are selected. Useful for modelling assembly operations where two different component types must be paired.

### Queue Disciplines

In addition to FIFO, LIFO, and PRIORITY, DES Studio supports three attribute-based queue disciplines:

| Discipline | Selection Rule | Use Case |
|---|---|---|
| SPT | Shortest processing time first (based on entity service time attribute) | Minimise average wait time |
| EDD | Earliest due date first (based on entity due date attribute) | Meet deadlines, minimise lateness |
| PRIORITY(attrName) | Lowest numeric value of the specified attribute first | Custom priority ordering |

For SPT and EDD, the entity type must have a numeric attribute named `serviceTime` or `dueDate` respectively. For PRIORITY(attrName), specify the attribute name in parentheses, e.g. `PRIORITY(urgency)`.

### WIP Time-Average Metric

DES Studio tracks the time-average Work-In-Progress (WIP) metric using Little's Law. The `avgWIP` value is exposed in the run summary and represents the average number of entities in the system over the observation period (after warm-up, if configured).

Little's Law validation: `avgWIP ≈ λ × avgSojourn` should hold within 15% for stable queueing models, where λ is the effective arrival rate and avgSojourn is the average time entities spend in the system.

### Clock Token in Conditions

The `clock` variable is available in the Condition Builder for writing time-based logic. For example, `clock > 100` can be used to trigger events only after a certain simulation time, or `clock < 50 AND queue(Queue).length > 0` to apply different behaviour during an initial period.

### Live Queue-Depth Time-Plot

When detailed output is enabled, the Execute canvas Charts tab includes a live queue-depth time-plot showing one line per queue, colour-coded with a legend. This reuses the existing `_timeSeries[]` data collected during simulation runs and helps visualise queue dynamics over time.

### Histogram and ANOVA Analysis

DES Studio includes statistical utilities for analysing simulation output:

**Histograms:** Equal-width and Freedman-Diaconis automatic bin selection are available for wait time and service time distributions. Histograms show the shape of the distribution and can be compared across replications or scenarios.

**One-Way ANOVA:** Analysis of variance with Tukey HSD post-hoc testing is available for comparing means across multiple scenarios or replications. The ANOVA F-test determines whether there are statistically significant differences between group means, and Tukey HSD identifies which specific pairs differ.

## 7. Distributions

Distributions control random durations and samples, such as inter-arrival time, service time, patience time, or time-varying rate bands.

Supported distribution types include:

| Distribution | Typical use |
|---|---|
| Fixed | Deterministic duration. |
| Exponential | Inter-arrival or service time in queueing models. |
| Uniform | Duration between a minimum and maximum. |
| Normal | Duration around a mean with variation. |
| Triangular | Duration with minimum, most likely, and maximum values. |
| Lognormal | Positive skewed durations. |
| Empirical | Sampling from imported or entered observed values. |
| Piecewise/time-varying | Different distribution behavior by simulation time band. |

All simulation sampling is seedable. Re-running the same model with the same seed should produce the same result.

## 8. Building A Simple Queueing Model

This example describes the usual structure for a single-server queue.

### Step 1: Define entity types

Create:

- A customer entity type, such as `Customer`.
- A server entity type, such as `Server`, with a count of `1`.

### Step 2: Define a queue

Create a queue for waiting customers.

For a basic model:

- Name: `Customer`
- Discipline: `FIFO`

### Step 3: Define an arrival B-Event

Create a B-Event for arrivals.

The arrival event usually:

- Creates a new customer.
- Places the customer in the customer queue.
- Schedules the next arrival using an inter-arrival distribution.

### Step 4: Define a completion B-Event

Create a B-Event for service completion.

The completion event usually:

- Releases the server.
- Records service and waiting statistics.
- Routes the customer out of the system or to the next stage.

### Step 5: Define a service-start C-Event

Create a C-Event that checks whether:

- The customer queue has at least one waiting customer.
- A server is idle.

When the condition is true, the C-Event starts service and schedules a completion event using a service-time distribution.

### Step 6: Validate and run

Open the `Execute` tab and run the model. DES Studio validates the model before execution. Blocking validation errors must be fixed before a run can start.

## 9. Running A Model

Use the `Execute` tab to run simulations.

Depending on the model and current application version, the Execute tab may include:

- Single-run controls.
- Replication controls.
- Seed input or random seed controls.
- Warm-up period.
- Maximum simulation time.
- Live visual canvas (topology-derived flow view).
- Global KPI stats bar with configurable metrics.
- Bottom panel with tabs: Step Log, Entity Table, Stage KPIs, and Charts.
- Step-through mode (one Phase A/B/C cycle at a time).
- Speed slider (0.5x to 10x animation speed).
- Summary statistics.
- Confidence interval results.
- AI-generated results insights.

When opening a template model, the Execute tab loads automatically with the simulation ready to run.

### Seeds

A seed controls the random stream. Use a fixed seed when you need reproducible results. Randomize the seed when you want a new independent run.

### Warm-up

Warm-up lets the model run for an initial period before statistics are collected. This helps reduce startup bias in steady-state simulations.

### Replications

Replications run the same model multiple times with different seeds. DES Studio summarizes the results and can calculate confidence intervals for key measures.

### Execute Canvas

When a model has `model_json.graph` layout metadata (set via the Visual Designer), the Execute tab shows the simulation flow as an interactive canvas. Each node type renders live state:

- **Source node:** Next arrival countdown with pulse animation on arrival.
- **Queue node:** Depth badge showing current waiting count and capacity. Entity token dots (coloured by type). Optional live sparkline of queue depth history.
- **Activity node:** Server pool dot-grid with busy/idle states, utilisation percentage, and completion signal.
- **Sink node:** Total served count and throughput rate.

Entity tokens animate along edges when routing events fire. Animation can be toggled off.

### Stage KPIs

The Stage KPIs tab in the bottom panel shows live per-queue and per-server performance metrics:

- **Queue rows:** Queue name, current depth, mean wait, max wait, total arrivals, reneged count.
- **Server rows:** Server type, capacity, busy count, utilisation %, mean service time, completions.

Event fire counts (how many times each B-Event and C-Event fired) are shown in a separate table above.

## 10. Understanding Results

DES Studio can show several result views:

| View | Purpose |
|---|---|
| Visual View | Shows the current system state, including queues, entities, and servers. |
| Step Log | Shows phase-tagged simulation events with clock times. |
| Entity Table | Shows entity status during or after a run. |
| Stage KPIs | Live per-queue and per-server performance metrics and event fire counts. |
| Charts | Queue depth and server utilisation time-series charts (when detailed output is enabled). |
| Summary | Shows totals and averages such as arrived, served, reneged, wait time, and service time. |
| Confidence Intervals | Summarizes replication uncertainty. |
| AI Insights | Provides plain-language interpretation of completed run results. |

The Step Log is useful when checking whether the model behaves as intended. It can reveal when arrivals, completions, C-Events, rate changes, or shift changes occur.

## 11. Run History

The `History` tab shows recent runs for the selected model.

Run history can include:

- Run label.
- Date and time.
- Seed.
- Number of replications.
- Warm-up period.
- Maximum simulation time.
- Arrivals, completions, and reneges.
- Average wait and service measures.
- Duration.

You can export run history as JSON or CSV.

## 12. Importing And Exporting

### Export a model

Use `Export JSON` from the Model Detail header. DES Studio exports the current model as a JSON file.

If the model contains validation errors, DES Studio asks you to confirm before exporting.

### Import a model

Use `Import JSON` from the Model Library. Imported models are saved as private models owned by you.

DES Studio validates imported models. Blocking validation errors prevent the import.

### Export run results

Use result export controls in the Execute or History areas. JSON is best when you want complete structured data. CSV is best when you want to analyze rows in a spreadsheet.

## 13. Sharing And Access

Model owners can control visibility and access.

| Setting | Meaning |
|---|---|
| Private | Only the owner and explicitly shared users can access the model. |
| Public | Other authenticated users can see the model in the Public Library. |
| Viewer | A shared user can view the model. |
| Editor | A shared user can edit the model. |

Public model runs by non-owners use a fork. This means the original public model is not changed by another user's execution or run history.

## 14. Validation Messages

DES Studio validates models before running and during key import/apply workflows.

Validation messages are shown near the affected editor tab where possible. In the Visual Designer, clicking a validation item highlights the affected node on the canvas.

Blocking errors prevent execution. Examples include:

- Empty or duplicate entity type names.
- Duplicate attributes within an entity type.
- Distribution parameters outside valid bounds.
- Conditions that reference undefined variables or attributes.
- Priority queues without a numeric priority attribute.
- Finite queue capacity overflow destination referencing a non-existent queue.
- BATCH macro with size less than 2.
- UNBATCH referencing a non-existent queue.
- Loop guard maxLoopCount less than 1.
- Resource capacity less than 1 or non-integer.

Warnings do not always prevent execution, but they indicate something worth checking. For example, a normal distribution with a mean too close to its standard deviation may create many negative samples that need clamping.

Validation currently focuses on model structure and supported patterns. Some waiting/resource behaviours are enforced by engine lifecycle rules rather than separate validation errors. As Sprint 26 closes out, the user-facing guidance and sample models will be the main reference for those behaviours.

## 15. Dynamic Modelling Features

Recent versions of DES Studio support dynamic behaviour over simulation time.

### Time-varying arrivals

Arrival behavior can change by time band. This is useful for systems where demand varies by time of day or operating period.

For example:

| Time band | Arrival pattern |
|---|---|
| 0 to 120 | Low arrival rate |
| 120 to 360 | Peak arrival rate |
| 360 to 480 | Lower arrival rate |

DES Studio records rate-change markers in the run log so you can inspect when these changes occur.

### Resource shift schedules

Resource capacity can change over time. This is useful for modelling staff shifts, machine availability, or scheduled capacity changes.

When capacity increases, DES Studio adds idle resource instances. When capacity decreases, idle excess instances can be retired. Busy excess instances finish their current work and may produce warnings depending on the scenario.

### Finite queues and balking

Queues can be configured with a maximum capacity. When full, arriving entities are blocked and routed to an overflow destination (another queue or system exit). Arrival B-Events can also be configured with balking — entities may probabilistically or conditionally decline to join a queue, with overflow routing applied. Blocking and balking counts are recorded per queue in the results summary.

### Overflow routing

Blocked (queue full) or balking (declined to join) entities are sent to the configured overflow destination — either another queue for further processing, or system exit. Overflow routing reuses the same routing infrastructure as conditional routing.

### Recirculation and rework loops

Entities can be routed through rework loops for multi-pass processing. Each entity tracks its loop count automatically. Configurable limits prevent infinite loops, and entities exceeding the limit are routed to an exit queue or marked as done. The Visual Designer shows loop edges as amber dashed lines.

### Time-series output

When detailed output is enabled, the engine records queue depth and resource utilisation at each clock advance. The Charts tab in the Execute bottom panel renders time-series line charts for each queue and server type. A waiting time histogram shows per-queue wait distributions with p50, p90, p95, and p99 percentile markers.

## 16. AI Features

DES Studio includes AI-assisted model creation and results interpretation through a server-side LLM proxy. AI analysis is advisory and does not change the model or engine.

### AI-Generated Model Authoring

The AI Generated Model tab allows you to describe a simulation model in natural language. The AI generates a structured model proposal that can be reviewed, partially applied, or edited before saving.

When the AI proposal contains validation errors, the system attempts one automatic retry with error feedback. If issues cannot be resolved, the retry explanation is shown in the conversation history alongside any unfixable issues displayed as a notice.

### Results-Informed Refinement

When refining a model through the AI, the system can incorporate run results (KPI data such as arrivals, completions, wait times, and utilisation) to suggest targeted improvements for identified bottlenecks.

### Suggest Model Changes

After a completed run, the AI Assistant in the Execute panel includes a "Suggest model changes" button. This sends the current model structure and KPI data to the LLM, which recommends structural changes to improve performance. Suggestions are displayed as narrative text in the AI Assistant panel.

### Results Insights

AI result features may include:

- KPI narrative.
- Scenario comparison.
- Sensitivity commentary.

Do not enter secrets or API keys into the browser. Provider credentials are handled server-side.

## 17. Practical Tips

- Start with the sample M/M/1 model or a template to learn the workflow.
- Use the Visual Designer for graph-based editing — it shows the flow structure visually.
- Use the Forms/Tabs editors for precise configuration of conditions, distributions, and routing.
- Build small models first, then add complexity.
- Use fixed seeds while debugging.
- Use the Step Log to check event order.
- Use validation messages before assuming a model is wrong.
- Run multiple replications before trusting averages.
- Export JSON before making large structural changes.
- Keep names consistent, especially queue names, entity type names, and event names.
- Configure finite queue capacity and overflow routing for realistic system behaviour.
- Use BATCH/UNBATCH for assembly operations where multiple components form a single product.
- Use rework loops for inspection/rework processes, with maxLoopCount set appropriately.
- Use PREEMPT for modelling high-priority interruptions of ongoing service.
- Use FAIL/REPAIR with MTBF/MTTR distributions for resource reliability modelling.
- Use COSEIZE when an operation requires multiple resources simultaneously (e.g., surgeon + anesthetist).
- Use SPLIT for parallel processing paths or inspection splitting.
- Use MATCH for pairing different entity types from separate queues.
- Use SPT/EDD queue disciplines to optimise for wait time or deadline adherence.
- Check the WIP time-average metric against Little's Law (avgWIP ≈ λ × avgSojourn) for model validation.

## 18. Glossary

| Term | Meaning |
|---|---|
| ANOVA | Analysis of variance — statistical test for comparing means across multiple groups. |
| Balking | An entity declining to join a queue based on a condition or probability. |
| Batch | A group of entities accumulated and processed as a single unit (BATCH macro). |
| B-Event | A scheduled event that fires at a known simulation time. |
| C-Event | A conditional event that fires when its condition is true. |
| Confidence interval | A range describing uncertainty across replications. |
| COSEIZE | Macro that atomically seizes multiple server types simultaneously. |
| DES | Discrete-event simulation. |
| EDD | Earliest Due Date — queue discipline selecting entities with the earliest due date first. |
| Entity | An object moving through or supporting the system, such as a customer or server. |
| FAIL | Macro that sets matching servers to failed status, re-queuing busy entities. |
| FEL | Future Event List, the ordered list of scheduled events. |
| Fork | A private copy of a public model made for another user's run or edit workflow. |
| Histogram | Distribution visualization showing frequency of values across bins. |
| Little's Law | Relationship: avgWIP = λ × avgSojourn — used to validate model consistency. |
| Loop count | The number of times an entity has passed through a rework cycle (Entity.loopCount). |
| MATCH | Macro that pairs entities from two queues into a batch entity. |
| MTBF | Mean Time Between Failures — average time between resource breakdowns. |
| MTTR | Mean Time To Repair — average time to restore a failed resource. |
| Overflow | Routing of a blocked or balking entity to an alternative queue or system exit. |
| Preemption | Interrupting a busy server to serve a higher-priority entity (PREEMPT macro). |
| Queue | A waiting line for entities. |
| Recirculation | Routing an entity back through an earlier stage for rework or multi-pass processing. |
| REPAIR | Macro that restores failed servers to idle status. |
| Replication | One independent run of the same model. |
| Seed | A number used to make random sampling reproducible. |
| SPT | Shortest Processing Time — queue discipline selecting entities with shortest service time first. |
| SPLIT | Macro that creates N-1 clones of a context entity for parallel processing. |
| Template | A pre-built simulation model used as a starting point. |
| Tukey HSD | Post-hoc test following ANOVA to identify which specific group pairs differ. |
| Unbatch | The process of restoring individual entities from a batch group (UNBATCH macro). |
| Warm-up | Initial simulation period excluded from statistics. |
| WIP | Work-In-Progress — time-average number of entities in the system (avgWIP). |

## 19. Where To Go Next

For a new user, the recommended learning path is:

1. Browse the Templates tab and open a model that matches your domain.
2. Run it once from the Execute tab.
3. Review the Step Log, Entity Table, and Stage KPIs.
4. Open the Visual Designer to see the model flow visually.
5. Change the arrival or service distribution using the Forms/Tabs editors.
6. Run several replications.
7. Export the results.
8. Create a blank model for your own system.

For deeper reference material, see:

- `README.md` for project setup and roadmap status.
- `AGENTS.md` for architectural rules and the complete sprint history.
- `docs/addition1_entity_model.md` for the model schema and distribution details.
- `docs/DES_Studio_Build_Plan.md` for roadmap and sprint history.
- `docs/Template Models Guide.md` for detailed explanations of all 14 template models.
- `docs/patterns/` for reusable modelling pattern references (6 patterns).
- `docs/archived/` for superseded historical documents (reference only).
