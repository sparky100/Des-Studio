# DES Studio — User Guide

Version: 1.6.0 (Sprints 1–55a)

---

## Version History

| Version | Sprints | Summary |
|---------|---------|---------|
| v1.0.0 | 1–30 | Core simulation engine, Three-Phase execution, Forms/Tabs editors, Execute panel, replication runner, parametric sweep |
| v1.1.0 | 31–33 | Preemption (PREEMPT macro), server failures/repair (FAIL/REPAIR), enhanced analytics and run comparison |
| v1.2.0 | 34–40 | Extended distribution library, entity attribute model, BATCH/SPLIT/MATCH/UNBATCH macros, container resource pools (FILL/DRAIN), COST macro, COSEIZE macro |
| v1.3.0 | 41–42 | Visual Designer (drag-and-drop canvas), full UI capability exposure for all model element fields |
| v1.4.0 | 43–44 | AI Insights panel (Interpret Results, Suggest Improvements, Sensitivity Analysis, Ask a Question, Compare Runs), Execution Insights |
| v1.5.0 | 45 | AI prompt grounding — results and model context injected into all AI analysis calls for higher-quality suggestions |
| v1.6.0 | 46–55a | AI Apply & Re-run, Paste JSON import, accessibility (WCAG 2.1 AA), design token system, UX polish (keyboard shortcuts, toasts, DistPicker redesign), responsive layout, cost summary in Results view, god component refactoring |
| v1.7.0 | 57 | Real-time adapter layer — live data source binding for distribution parameters |
| v1.8.0 | 58 | Report generation — Export a professional Word (.docx) report from any completed run |

---

## 1. Introduction

DES Studio is a browser-based discrete-event simulation tool for modellers who need to build, run, and analyse queue-based models without writing code. All model elements are configured through structured editors, a visual canvas, or an AI-assisted generator. Experiments are run directly in the browser; results appear as live animations, event logs, histograms, and statistical summaries.

**Who it is for.** DES Studio targets simulation practitioners — analysts, engineers, operations researchers, and students — who understand queuing concepts (arrivals, service, waiting, resources) and want to move quickly from a scenario description to quantitative results.

---

### 1.1 New to discrete-event simulation? Start here

> **Already familiar with DES?** Skip to [Section 2 — Getting Started](#2-getting-started).

#### What is a queue?

A queue is any place where demand exceeds capacity — even temporarily. Patients waiting for a doctor, jobs waiting for a machine, calls holding for an agent. Queues are the primary source of delay in real systems, and their behaviour is often counterintuitive: a server that is 90% utilised has a wait time roughly nine times longer than one at 50% utilisation. Simulation lets you explore this numerically before committing resources.

#### What is discrete-event simulation?

Discrete-event simulation (DES) models a system by tracking *events* that happen at specific moments in time, rather than continuous differential equations. Examples: a customer arrives, a service ends, a machine fails. The simulation clock jumps from event to event; nothing happens between events, making DES extremely efficient even for complex systems running over months of simulated time.

**Entities** are the objects that flow through the model: customers, jobs, patients, vehicles. Entities arrive, wait in queues, receive service from resources, and depart. **Servers** (resources) are the capacity-limiting elements: agents, machines, beds, lanes.

#### The Three-Phase Method — explained simply

DES Studio uses Pidd's Three-Phase Method:

| Phase | Plain English |
|-------|--------------|
| **A** | Jump the clock to the moment of the next event. |
| **B** | Fire everything scheduled for right now (arrivals, completions, failures). |
| **C** | Check "can anything start now?" — e.g. "patient waiting AND doctor free → start consultation." Keep checking until nothing more can start. |

B handles *scheduled* triggers. C handles *state-driven* triggers. The separation keeps the engine's behaviour predictable and theoretically grounded.

#### When to use simulation vs. analytical formulas

| Situation | Formula sufficient? | Use simulation? |
|-----------|--------------------|-----------------| 
| Single queue, single server, exponential distributions (M/M/1) | Yes | Either |
| Multiple queues, multi-stage routing | No | Yes |
| Priority queues, preemption, balking | No | Yes |
| Time-varying arrivals (rush hours, shift changes) | No | Yes |
| Server failures and repair | No | Yes |
| You need confidence intervals across scenarios | No | Yes |

#### The five-step lifecycle every DES model follows

```
1. ARRIVE     → entity enters a queue          (B-event fires)
2. Wait       → entity sits in queue
3. ASSIGN     → C-event binds entity to server (service starts)
4. [service duration passes]
5. COMPLETE   → entity departs; server freed   (B-event fires)
```

Everything else in DES Studio (priority, multi-stage routing, failures, cost tracking, loop guards) is layered on top of this pattern.

---

**The Three-Phase Method.** DES Studio implements Pidd's Three-Phase Method, a classical approach to discrete-event simulation:

| Phase | What happens |
|-------|--------------|
| A | The simulation clock advances to the time of the next scheduled event. |
| B | All B-Events (Bound events) scheduled for the current clock time fire in sequence. |
| C | All C-Events (Conditional events) are tested repeatedly until none can fire. |

This structure means that B-Events handle time-scheduled actions (arrivals, service completions) while C-Events handle state-triggered actions (start a service when a server is free and a queue is non-empty). You do not need to manage the event calendar directly — DES Studio handles it.

**Modelling workflow.** A typical workflow is:

1. Define entity types, queues, B-Events, and C-Events in the Forms/Tabs editors (or generate a skeleton with the AI Model Generator).
2. Set performance goals so the tool and AI have feasibility targets.
3. Run a single experiment and inspect Live View, Log, Histograms, and Analysis.
4. Use AI Insights to interpret results and get structured improvement suggestions.
5. Run replications for statistical confidence, then sweep a parameter to find the feasible region.
6. Save and share runs.

---

## 2. Getting Started

### Sign-in and anonymous mode

Open DES Studio in a modern browser. You can sign in with a Supabase-authenticated account (email/password or OAuth) or continue in **anonymous mode**, which stores all data in browser local storage. Anonymous models are private to that browser session; they are not backed up remotely. Sign in to unlock cloud saving and public sharing.

### The Model Library

After sign-in (or on first open), DES Studio shows the Model Library with two tabs:

| Tab | Contents |
|-----|----------|
| My Models | Models you own or that have been shared with you. Create blank, import JSON, open, or delete. |
| Templates | Pre-built read-only models. Clicking a template creates a private copy and opens it immediately. |

### Creating a model

Click **New Model** in My Models. Give the model a name and (optionally) a description. DES Studio creates an empty model and opens it in the Model Detail view.

To bring in an existing model definition, use **Import** to upload a `.json` file, or click **Paste JSON** in the library header to paste a model JSON directly from the clipboard. Both routes run the same validation gate before opening the model.

### Three authoring modes

Inside the Model Detail view you can build your model three ways — all editing the same canonical model JSON:

| Mode | Access | Best for |
|------|--------|----------|
| Forms/Tabs editors | Default view; tabs for each element type | Precise, field-by-field editing of every model element |
| AI Model Generator | "Generate with AI" button | Bootstrapping a model from a natural-language scenario description |
| Visual Designer | "Visual Designer" tab | Seeing the model as a flow graph; drag-and-drop topology editing |

---

## 3. Building Your First Model — A Worked Example

This section walks through building a simple GP surgery model to illustrate the complete modelling workflow.

**Scenario.** Patients arrive at a GP surgery with exponentially distributed inter-arrival times, mean 8 minutes. Two GPs are available; each consultation lasts an exponentially distributed time, mean 12 minutes. The surgery session runs for 480 minutes (one working day). We want average patient waiting time to be under 15 minutes.

### Step 1: Create entity types

Open the **Entity Types** tab and create two entities:

- **Patient** — type: `customer`. Patients arrive, wait, and depart.
- **GP** — type: `server`, initial count: `2`. GPs hold the resource that customers compete for.

### Step 2: Create a queue

Open the **Queues** tab and create:

- **Waiting Room** — discipline: `FIFO`, capacity: leave blank (unlimited).

### Step 3: Create B-Events

Open the **B-Events** tab and create two B-Events.

**Patient Arrives**
- Schedule / inter-arrival distribution: `Exponential`, mean: `8`
- Effects: `ARRIVE(Patient)`
- Routing: `Waiting Room` (entity goes to this queue after the event fires)

**GP Consultation**
- This B-event represents the end of a consultation. It is scheduled when a GP begins seeing a patient (via the C-Event below).
- Effects: `COMPLETE(Patient)`, `RELEASE(GP)`
- Distribution: `Exponential`, mean: `12`

### Step 4: Create a C-Event

Open the **C-Events** tab and create:

**Start Consultation**
- Condition: `Waiting Room not empty AND GP idle`
- Effects: `ASSIGN(GP, Waiting Room)`
- cSchedule: `Exponential`, mean: `12` — this schedules the GP Consultation B-Event at the computed completion time

In every Phase C pass, DES Studio tests this condition. When a patient is waiting and a GP is free, the event fires: a patient is taken from the Waiting Room, assigned to a GP, and a completion event is placed in the event calendar.

### Step 5: Set a performance goal

Open the **Performance Goals** tab and add:

- Metric: `avgWait`, queue: `Waiting Room`, operator: `<`, target: `15`

Goals are used by the AI Insights engine and by sweep feasibility colouring. Without goals the tool still runs; goals make AI suggestions more targeted.

### Step 6: Run the model

Open the **Execute** tab and click **Run All** (or use **Auto-run** with the speed slider). DES Studio will run the model to clock time 480.

Switch to **Live View**: you will see animated entity tokens (circles) flowing from the Patient Arrives event into the Waiting Room queue, being picked up by the GP Consultation event, and departing. When both GPs are busy, tokens queue up visually.

### Step 7: Read the results

Switch to **Analysis** view:

- **KPI cards**: overall throughput, mean waiting time, mean time in system.
- **Per-queue stats**: Waiting Room — mean wait, maximum wait, p50/p90/p99 percentiles, mean queue length.
- **Per-resource utilisation**: GP utilisation (fraction of time GPs are busy).
- **Cumulative mean chart**: shows how the running mean of wait time stabilises over the run.

If the goal (avgWait < 15) is met, the goal row shows green. If not, it shows red.

### Step 8: Use AI Insights

Click the **AI Insights** panel and select **Suggest Improvements**. The AI will:

1. Identify the binding constraint (likely: Waiting Room queue length driven by GP utilisation).
2. Diagnose the root cause.
3. Propose a change (e.g., add a third GP or reduce consultation time variability).
4. Predict the effect on wait time.
5. Assess impact on the performance goal.
6. Rank suggestions by expected value.

### Step 9: Run a parametric sweep

Open **Experiments → Parametric Sweep**. Set:

- Parameter: `GP count` (the server count of the GP entity type)
- Range: `1` to `4`, step `1`

Click **Run Sweep**. DES Studio runs the model once per parameter value. The results chart shows average wait time vs. GP count. Points that meet the goal (avgWait < 15) are coloured green; infeasible points are red. The best feasible point is annotated.

---

## 4. Model Elements Reference

### 4.1 Entity Types

Entity types define the actors in your model.

| Field | Description |
|-------|-------------|
| Name | Unique identifier used in macros (e.g., `ARRIVE(Patient)`) |
| Type | `customer` — arrives, waits, is served, departs; `server` — holds resources that customers compete for; `batch` — a group of entities treated as one unit |
| Initial count | For servers: the number of resource units available at time 0 |
| Attributes | Named numeric values carried by each entity instance (e.g., `priority`, `dueDate`) |

### 4.2 Queues

Queues are buffers where customer entities wait.

| Field | Description |
|-------|-------------|
| Name | Unique identifier |
| Discipline | `FIFO` (first in, first out), `LIFO` (last in, first out), `Priority` (by entity attribute), `SPT` (shortest processing time first), `EDD` (earliest due date first) |
| Capacity | Maximum number of entities the queue can hold. Leave blank for unlimited. |
| Overflow destination | If capacity is full, arriving entities go here instead |
| balkCondition | Expression evaluated on arrival; if true the entity balks (does not join) |
| balkProbability | Probability [0,1] that an arriving entity balks regardless of queue state |

### 4.3 B-Events (Bound Events)

B-Events fire at a specific point in simulated time. They are the time-scheduled workhorses: arrivals, service completions, scheduled breakdowns.

| Field | Description |
|-------|-------------|
| Name | Unique identifier |
| Schedule / inter-arrival distribution | Distribution governing when the next occurrence is scheduled |
| Effects | One or more effect macros executed when the event fires (see Section 5) |
| Routing | Queue or C-Event that receives the entity after the event fires |
| Loop guard | Optional: maximum number of times this event can re-schedule itself (prevents infinite arrival loops) |
| Hold effects | Effects applied while the event is "in progress" (between scheduling and firing) |

B-Events support **balking** — if a `balkCondition` or `balkProbability` is set, entities generated by this event may be diverted before entering the system.

### 4.4 C-Events (Conditional Events)

C-Events fire when their condition becomes true during Phase C. They are tested repeatedly until no more can fire in the current pass.

| Field | Description |
|-------|-------------|
| Name | Unique identifier |
| Condition | Boolean expression (e.g., `WaitingRoom.length > 0 AND GP.idle > 0`) |
| Effects | Macros executed when the condition is satisfied |
| cSchedule | Distribution used to schedule a subsequent B-Event when this C-Event fires (e.g., service duration) |
| Priority | Order in which C-Events are tested when multiple could fire simultaneously |

C-Events model resource allocation decisions: they connect queues to servers by testing availability and performing ASSIGN.

### 4.5 State Variables

State variables are model-level counters or flags accessible in conditions and effects.

| Field | Description |
|-------|-------------|
| Name | Unique identifier |
| Type | `integer`, `float`, or `boolean` |
| Initial value | Value at simulation start |

Use state variables to track cumulative counts, implement shift schedules, or create custom flags (e.g., `rushHour = true`). Access them in conditions as plain names; set them with `SET(varName, expr)`.

### 4.6 Performance Goals

Goals define feasibility thresholds for AI suggestions and sweep colouring.

| Field | Description |
|-------|-------------|
| Metric | Statistical measure: `avgWait`, `avgQueueLength`, `utilisation`, `throughput`, `totalCost` |
| Queue / resource | Which queue or resource the metric applies to |
| Operator | `<`, `<=`, `>`, `>=`, `=` |
| Target | Numeric threshold |

### 4.7 Containers

Containers are resource pools with structured fill and drain operations.

| Field | Description |
|-------|-------------|
| Name | Unique identifier |
| Initial level | Starting quantity in the container |
| Capacity | Maximum level |
| FILL macro | Add quantity to the container: `FILL(containerName, amount)` |
| DRAIN macro | Remove quantity: `DRAIN(containerName, amount)` |

Use containers to model inventory, blood bank stocks, fuel reserves, or any depletable shared resource.

---

## 5. Effect Macros Reference

Effect macros are the action vocabulary of DES Studio. They appear in the Effects field of B-Events and C-Events.

| Macro | Syntax | What it does | When to use |
|-------|--------|--------------|-------------|
| ARRIVE | `ARRIVE(entityType)` | Creates a new entity instance of the given type and injects it into the model | The arrival B-Event that generates new customers |
| COMPLETE | `COMPLETE(customerType)` | Marks the entity as served and removes it from active service | End of service B-Event; pairs with RELEASE |
| RELEASE | `RELEASE(serverType)` | Frees one unit of the server resource | End of service, after COMPLETE |
| ASSIGN | `ASSIGN(serverType, queueName)` | Removes the next entity from the queue, binds it to a free server unit | Start-of-service C-Event |
| RENEGE | `RENEGE(queueName)` | Removes a waiting entity from a queue after a timeout (reneging) | Modelling impatient customers |
| BATCH | `BATCH(n, entityType)` | Collects n individual entities of the given type into a single batch entity | Assembly, group boarding, bulk processing |
| UNBATCH | `UNBATCH(queueName)` | Splits a completed batch back into its constituent individual entities, placing each in the named queue | Post-batch processing where individuals must continue separately |
| SPLIT | `SPLIT(n)` | Clones the current entity into n copies, each following independent paths | Parallel processing, order splitting |
| MATCH | `MATCH(typeA, queueA, typeB, queueB, targetQueue)` | Pairs one entity from queueA with one entity from queueB into a combined batch placed in targetQueue | Kitting and assembly where two components must meet |
| COSEIZE | `COSEIZE(queueName, serverType1, serverType2, ...)` | Atomically seizes one entity from the queue and one idle server of each listed type; fails cleanly if any type has no idle server | Multi-resource operations requiring simultaneous capture (e.g. patient needs both a doctor and a room) |
| PREEMPT | `PREEMPT(serverType, custId)` | Interrupts the entity currently in service on the server and replaces it with the higher-priority entity | Emergency/priority override |
| FAIL | `FAIL(serverType)` | Places the server into a failed (unavailable) state | Random breakdowns |
| REPAIR | `REPAIR(serverType)` | Restores the server from failed state back to idle | End of repair B-Event |
| COST | `COST(amount)` | Adds amount to the model's cumulative cost total | Cost-benefit analysis, penalty tracking |
| SET | `SET(varName, expr)` | Sets a state variable to the value of an expression | Shift changes, counters, flags |
| SET_ATTR | `SET_ATTR(attrName, expr)` | Sets an attribute on the current entity instance | Recording arrival time, priority, due date |
| FILL | `FILL(containerName, amount)` | Adds a quantity to the named container (clamped to its capacity) | Inventory replenishment, fuel top-up, stock inflow |
| DRAIN | `DRAIN(containerName, amount)` | Removes a quantity from the named container; only fires when the current level is sufficient | Inventory consumption, kitting where stock must be available |

Multiple macros can be listed in order in the same Effects field; they execute sequentially when the event fires.

---

## 6. Distributions Reference

Distributions control when events occur or how long they last. The distribution picker groups options into three families — **Parametric** (classical statistical distributions with numeric parameters), **Time-varying** (piecewise rate schedules), and **From data** (distributions read from entity attributes). Selecting a family narrows the list to relevant options. A sparkline shape preview appears below the picker when the **Preview** toggle is on, updating reactively as parameters change. Parameter fields validate on blur and show an inline error if a value is out of bounds.

| Distribution | Parameters | Typical use |
|-------------|------------|-------------|
| Exponential | `mean` | Memoryless inter-arrival and service times (M/M/c baseline) |
| Normal | `mean`, `stdDev` | Service times when empirical data is approximately bell-shaped |
| Uniform | `min`, `max` | Service times with known lower and upper bounds, no preference |
| Triangular | `min`, `mode`, `max` | Service time estimates when only three-point estimates are available |
| Erlang | `k`, `mean` | Sum of k exponential phases; more regular than Exponential |
| Constant | `value` | Deterministic fixed duration (use sparingly; removes variability) |
| Deterministic | `value` | Synonym for Constant |
| LogNormal | `mean`, `stdDev` | Right-skewed service times; common in healthcare and IT |
| Weibull | `scale`, `shape` | Equipment lifetime, failure time-to-event |
| PERT | `min`, `mode`, `max` | Like Triangular but smoother; good for project activity durations |
| Poisson | `mean` | Number of arrivals in a fixed interval (not a duration — use carefully) |
| Schedule | `times[]` or `rows[]` | Planned arrivals at absolute clock times; supports per-arrival entity attributes |
| EntityAttr | `attrName` | Duration drawn from an attribute already set on the entity |
| ServerAttr | `attrName` | Duration drawn from an attribute on the assigned server entity |

### 6.1 Schedule distribution — importing a planned arrival file

The **Schedule** distribution is designed for models where arrivals follow a known timetable rather than a statistical process (e.g. booked appointments, shift handovers, elective procedure lists). Instead of entering times by hand, you can upload a CSV file directly.

**How to import:**

1. In the B-Event editor, set the schedule distribution to **Schedule**.
2. Click **↑ Load from CSV** (top-right of the Schedule editor panel).
3. Select a `.csv` file. A preview of the first 5 rows appears immediately — check that columns look correct before confirming.
4. Click **✓ Import N arrivals** to load the data.

**CSV format:** The first column must be `time` (absolute simulation clock time, numeric). Additional columns become entity attributes applied to each arriving entity. A header row is detected automatically.

```csv
time,severity,age
10,3,45
25,1,32
60,2,28
```

Times-only files work too:

```csv
time
10
25
60
```

**Notes:**
- Rows where the `time` value is not a valid number are skipped; the import shows a count of skipped rows.
- Column names in the CSV become entity attribute names — match them to the attribute definitions on the entity type if you want them to flow through routing conditions.
- After import, the editor switches automatically to **Arrival attributes** mode so you can inspect or edit individual rows.
- Optional **Jitter** (Normal or Uniform) can be added after import to introduce random variation around each planned time.

---

## 7. Running Experiments

### 7.1 Single run

Click **Run All** in the Execute panel to run the model from time 0 to the configured end time in one step. Use **Single-step** to advance one event at a time (useful for debugging). **Auto-run** drives the simulation continuously at an adjustable speed, animating Live View in real time.

### 7.2 Replication batch (confidence intervals)

Open **Experiments → Replication Run**. Set the number of replications (typically 30–100) and optionally a different random seed per replication. DES Studio runs all replications in parallel and aggregates results:

- Mean and 95% confidence interval for each KPI
- Outlier detection (replications deviating more than 2σ from the batch mean are flagged)
- Per-replication results available in the run history table

Use replications whenever you need statistical rigour. A single run gives one observation; replications give a distribution of outcomes.

### 7.3 Parametric sweep (1D and 2D)

Open **Experiments → Parametric Sweep**.

**1D sweep:** Choose one model parameter (e.g., server count, arrival rate, mean service time), set a range and step size. DES Studio runs the full replication batch at each parameter value and plots KPI vs. parameter.

**2D sweep:** Choose two parameters, each with its own range. DES Studio runs a grid of experiments and renders a heatmap of the chosen KPI. Feasibility colouring applies: cells meeting all performance goals are green; cells that violate at least one goal are red. The best feasible point is annotated with a marker.

### 7.4 Saving and comparing runs

After any run click **Save Run** (or it saves automatically). Each saved run stores:

- Model snapshot (the exact JSON at run time)
- All result statistics
- Configuration (replications, end time, seed)

Open **Run History** to list, re-open, or delete saved runs. Use the per-row checkboxes (or **Select all**) to select multiple runs for bulk archive or bulk export. Select two runs and click **Compare** to view a side-by-side KPI table and charts. The AI **Compare Runs** feature provides a narrative comparison (see Section 9.5).

### 7.5 Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` / `Cmd+S` | Save the current model |
| `?` | Open the Keyboard Shortcuts reference modal |

Pressing `?` at any time (while focus is outside a text input) opens a modal listing all available shortcuts.

### 7.6 Warmup period and Welch detection

Long-running models may start in an unrealistic empty state. The Analysis view applies **Welch's method** to detect the warmup period automatically: it finds the point in the cumulative mean chart where the running mean stabilises. Statistics reported in the KPI summary exclude data from before the detected warmup cutoff, giving steady-state estimates rather than transient ones.

You can override the warmup period manually by entering a fixed value in the Analysis settings.

---

## 8. Execution Panel Views

### 8.1 Live View

The Live View renders an animated canvas of the model graph while the simulation runs. Entity tokens (small circles coloured by entity type) flow along arcs between queues and events. Queue nodes swell visibly when entities accumulate. Server nodes show idle/busy/failed states with colour coding. Use Live View to:

- Confirm the model topology is wired correctly
- Spot unexpected bottlenecks developing
- Demonstrate the model to stakeholders

### 8.2 Log view

The Log view is a scrollable, searchable event log showing every event that fired during the run. Each row includes:

- Simulation time
- Phase (B or C)
- Event name
- Entity ID
- Description of what happened

Filter by phase (B-only, C-only, or both) to focus on scheduled vs. conditional activity. Search by entity ID or event name. Export the full log as CSV for external analysis.

### 8.3 Histograms

The Histograms view shows a bar chart of waiting time for each queue in the model. The x-axis is waiting time; the y-axis is frequency. Vertical markers indicate the p50, p90, and p99 percentiles. Use histograms to:

- Identify long-tail waiting time distributions
- Check whether a service meets percentile-based SLAs (e.g., 90% of patients wait under 20 minutes)

### 8.4 Entities view

The Entities view is a per-entity lifecycle table. Each row is one entity instance; columns include arrival time, service start time, departure time, time in queue, time in service, and any custom attributes. The table is:

- Sortable by any column
- Filterable by entity type, time range, or attribute value
- Equipped with anomaly detection — rows where wait time or time in system is more than 3σ from the mean are highlighted

Use the Entities view to find individual outlier cases and trace why a specific entity experienced an unusually long wait.

### 8.5 Analysis view

The Analysis view (ResultsWorkspace) is the primary results dashboard. It contains:

| Panel | Contents |
|-------|----------|
| KPI summary | Throughput, mean wait, mean time in system, goal status (green/red border per goal) |
| Per-queue wait stats | Mean, max, p50, p90, p99 for each queue |
| Per-resource utilisation | Fraction of time each server type was busy, with a utilisation bar |
| Cost summary | Total cost, cost per served entity, and served count — shown when the model uses at least one COST macro |
| Cumulative mean chart | Running mean of the primary KPI over simulation time, with warmup cutoff marked |
| Replication CI table | When replications are run: mean ± 95% CI for each KPI |

---

## 9. AI Insights

The AI Insights panel provides five analytical capabilities, all grounded in the current run's results and the model JSON (as of v1.5.0).

### 9.1 Interpret Results (narrative)

Click **Interpret Results** to receive a plain-English narrative of what the simulation found. The output covers:

- Overall system performance (throughput, average wait)
- Which queues are longest, which resources are most utilised
- Whether performance goals are met
- Notable patterns (e.g., queue oscillation, warmup transient)

### 9.2 Suggest Improvements (6-step structured analysis)

Click **Suggest Improvements** for a structured diagnostic. For each suggestion the AI produces:

1. **Binding constraint** — the queue, resource, or event limiting system performance
2. **Root cause** — why the constraint exists (arrival rate vs. capacity mismatch, high variability, etc.)
3. **Proposed change** — a specific, actionable model change (add a server, change a distribution, add a priority rule)
4. **Predicted effect** — quantitative estimate of the improvement (e.g., "expected to reduce mean wait by ~30%")
5. **Goal impact** — whether the change is predicted to bring the model within performance goal thresholds
6. **Ranking** — suggestions ordered by expected value and confidence

### 9.3 Apply & Re-run (what-if verification)

Each suggestion card from **Suggest Improvements** includes an **Apply & Re-run** button. Clicking it creates a temporary copy of the model with the suggested change applied (for example, increasing server count by one), runs the same replication configuration against that copy, and shows a before/after goal compliance table inline in the panel — without touching your saved model. This lets you verify a suggestion's predicted effect before deciding whether to apply it permanently.

Suggestions that require structural changes the tool cannot auto-apply (for example, adding a new queue) show the button as disabled with a note explaining what to change manually.

### 9.4 Sensitivity Analysis

Click **Sensitivity Analysis** to assess how much uncertainty exists in the results. The output includes:

- Width of confidence intervals relative to point estimates
- Parameters where small changes have large KPI effects (high sensitivity)
- Recommendations on replication count if CIs are wide

### 9.5 Ask a Question

Type any question about the model or results in the text box and click **Ask**. Examples:

- "Why is utilisation above 90%?"
- "What would happen if I added a priority queue for urgent patients?"
- "Is the warmup period long enough?"

The AI answers using the current model JSON and results as context.

### 9.6 Compare Runs

Select two saved runs from the Run History and click **Compare Runs**. The AI produces a narrative comparison covering:

- Which run performed better on each KPI
- Whether the difference is statistically meaningful (CI overlap)
- Interpretation of why results differ (different parameters, different model structure)

### 9.7 Best practices for getting good AI suggestions

- **Set performance goals first.** Without goals the AI cannot assess feasibility or rank suggestions by goal impact.
- **Run replications before using AI Insights.** Point estimates from a single run have high variance; the AI's predictions are more reliable when based on CI-validated KPIs.
- **Use descriptive names.** Name your queues and entity types clearly (e.g., "Emergency Waiting Room" not "Q1") — the AI uses these names to produce readable, specific output.
- **Annotate the model description.** A model description explaining the real-world context helps the AI tailor suggestions to the scenario (e.g., "GP surgery, 08:00–16:00, two GPs").
- **Run warmup detection first.** If Welch detection finds a long warmup, extend the run time so the steady-state sample is large enough for reliable statistics.

---

## 10. Visual Designer

The Visual Designer provides a drag-and-drop canvas view of the model. It is accessed via the **Visual Designer** tab in the Model Detail view. All changes made in the Visual Designer are reflected immediately in the Forms/Tabs editors, and vice versa.

### 10.1 Node types

| Node type | Represents | Visual appearance |
|-----------|------------|-------------------|
| Queue | A waiting queue | Rectangle with discipline label |
| B-Event | A bound (time-scheduled) event | Rounded rectangle with clock icon |
| C-Event | A conditional event | Diamond shape |
| Entity Type | A customer or server entity type | Circle with entity name |

### 10.2 Drawing connections

Click and drag from a node's output port to another node's input port to create a connection (edge). Connections represent flow relationships:

| Connection type | From → To | Meaning |
|-----------------|-----------|---------|
| Arrive-to-queue | B-Event → Queue | Entities created by this B-Event enter this queue |
| Queue-to-event | Queue → C-Event | This queue feeds this C-Event's condition |
| Event-to-queue | C/B-Event → Queue | This event routes entities to this queue |
| Entity-to-event | Entity Type → B-Event | This entity type is the subject of the event |

DES Studio validates connections and highlights invalid ports in red.

### 10.3 Node inspector

Click any node to open the **Node Inspector** panel on the right. The inspector shows all editable fields for that element — the same fields available in the Forms/Tabs editor. Changes take effect immediately and are reflected in both the canvas and the structured editor.

### 10.4 Syncing with editors

The Visual Designer and the Forms/Tabs editors share a single canonical model JSON. There is no separate "sync" step — the two views are always in sync. You can switch between them at any time without losing changes.

---

## 11. Sharing and Exporting

### 11.1 Share link and QR code

From the Model Detail view, click **Share**. DES Studio generates a unique shareable URL for the current model (or the current run results snapshot). A QR code is displayed alongside the link. Recipients who open the link can view the model and results in read-only mode without signing in.

To revoke a share link, click **Unshare** — the link will stop resolving.

### 11.2 Export results as JSON or CSV

In the Analysis view or Run History, click **Export**:

- **CSV**: KPI summary table, per-queue stats, per-resource utilisation, and (optionally) the per-entity lifecycle table. Suitable for import into Excel or R.
- **JSON**: Full results object including all raw statistics, replication data, and confidence intervals. Suitable for programmatic processing or archiving.

The event log can also be exported as CSV from the Log view.

### 11.3 Export model as JSON

From the Model Detail view click **Export Model**. DES Studio downloads the model definition as a `.json` file. This file can be imported into any DES Studio instance via **Import** in the Model Library.

### 11.4 Export a simulation report (Word document)

After running a simulation, click **Export Report** in the Execute panel toolbar (next to "Export Results CSV").

DES Studio generates a multi-section Word document (`.docx`) containing:

1. **Cover page** — model name, run label, date, engine version
2. **Executive Summary** — headline KPIs and the primary AI recommendation
3. **Model Description** — AI-generated plain-English description of what the model represents (written for non-technical readers)
4. **Experiment Configuration** — full run parameters (seed, warmup period, run duration, replications, termination mode)
5. **Model Diagram** — a screenshot of the Visual Designer canvas
6. **Simulation Results** — summary statistics, per-queue wait-time percentiles (P50/P90/P95/P99), resource utilisation table, performance goal assessment, and confidence intervals (for multi-replication runs)
7. **Recommendations** — up to three AI-generated structured recommendations (finding → action → expected impact)
8. **Appendix** — full model specification (entity types, queues, events, state variables)

**The report file is generated entirely in your browser — no simulation data is sent to any server during report generation.** The AI narrative and recommendations are fetched from the same LLM proxy used by the AI Insights panel; if the LLM is unavailable the report is still generated without the narrative sections.

The file is saved as `<Model Name> — <Run Label> — Report.docx` and can be opened in Microsoft Word, LibreOffice, or Google Docs.

---

## 12. Common Modelling Patterns

The following patterns cover the most frequently modelled scenarios. Each is available as a template in the Model Library.

| Pattern | Key elements | Notes |
|---------|--------------|-------|
| Single queue / service (M/M/c) | One customer type, one server type, one queue, one arrival B-Event, one start-service C-Event, one completion B-Event | The canonical baseline; validate against M/M/c analytical formula |
| Multi-stage routing | Multiple queues and server types chained; routing configured in each B-Event's Routing field | Ensures entity flows from stage 1 to stage 2 to stage 3 |
| Priority queues | Queue discipline set to `Priority`; entity attribute `priority` set with `SET_ATTR(priority, expr)` on arrival | Higher priority number = served first (configurable) |
| Batching and assembly | `BATCH(n, entityType)` collects n entities; subsequent events fire on the batch | Model group boarding, kitting, bulk transport |
| Entity splitting | `SPLIT(n)` creates n copies from one entity; each copy follows independent downstream paths | Parallel lab tests, order line splitting |
| Resource failures and repair | Failure B-Event uses `FAIL(serverType)`; repair B-Event uses `REPAIR(serverType)` | Set failure inter-arrival and repair time distributions on respective B-Events |
| Time-varying capacity (shift schedules) | Use a `Schedule` distribution on arrival B-Events, or `SET` a state variable to change server count at shift change times | Model morning rush, night shift, seasonal demand |
| Loop guards (recirculation) | B-Event or C-Event routes an entity back to an earlier queue; loop guard field sets maximum re-entries | Model rework loops, retry queues; always set a guard to prevent infinite loops |
| Cost tracking | `COST(amount)` in service and waiting effects; `totalCost` performance goal | Model cost per unit time waiting, cost per service, penalty costs |

---

## 13. Troubleshooting

### Model validation errors

DES Studio validates the model JSON before every run. Common errors:

| Error | Cause | Fix |
|-------|-------|-----|
| "Unknown entity type in ARRIVE" | Macro references an entity type name that does not exist | Check spelling in the macro matches the Entity Types tab exactly |
| "Queue not found in ASSIGN" | ASSIGN references a queue that has not been defined | Create the queue in the Queues tab or correct the name |
| "No B-Event schedules arrivals" | The model has no ARRIVE macro, so no entities enter the system | Ensure at least one B-Event has `ARRIVE(...)` in its effects |
| "Circular routing without loop guard" | An entity can loop indefinitely | Add a loop guard count to the routing B-Event |

### Simulation not progressing

If the simulation clock does not advance (Auto-run shows the same time), check:

- All C-Events have reachable conditions. If a C-Event's condition can never be true (e.g., it references a queue that nothing routes to), Phase C stalls.
- At least one B-Event is scheduled. If all B-Events require a prior ASSIGN before they fire, the system may start empty with no scheduled events.
- The end time is greater than 0.

### High utilisation / long queues

When server utilisation approaches or exceeds 95%, queues grow without bound in finite run time. This is expected queuing behaviour, not a bug. Options:

- Add more server capacity (increase initial count on the server entity type).
- Reduce arrival rate (increase mean inter-arrival time).
- Run a parametric sweep to find the minimum server count that meets your performance goal.

### Unexpected reneging

If entities are disappearing from queues earlier than expected, check:

- `balkCondition` or `balkProbability` on queues — entities may be balking on arrival.
- `RENEGE` macros in B-Events — a timeout may be triggering sooner than intended. Check the distribution mean on the reneging B-Event.

### Phase C truncation warning

If the log shows "Phase C truncated after N iterations", a C-Event condition is remaining true after each firing, causing an infinite loop within a single Phase C pass. This typically means a C-Event is not consuming the entity or resource it checked in its condition. Verify that `ASSIGN` is present in the effects and that it reduces the queue length (or server availability) so the condition eventually becomes false.
