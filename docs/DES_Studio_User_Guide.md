# DES Studio — User Guide

Version: 1.23.0 (Sprints 1–77)

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
| v1.9.0 | 62–65 | Real-world clock (epoch), planned data import (CSV/XLSX/scheduleFeed), conditional service times (`when`), actuals tracking (plan vs actual deviation) |
| v1.10.0 | 66 | Visual Designer badges, Execute Panel UX (Animate/Speed to Setup, Export consolidation, Entity Details rename, Log guard, chart formatting) |
| v1.11.0 | 67 | AI Assistant simplified — single "Explain Results" button merges narrative, sensitivity, and suggestions; "Run with this change" replaces "Apply & Re-run"; results update automatically after applying a suggestion |
| v1.13.0 | 68 | Model versioning — explicit milestones, version history panel, create version dialog with notes, structural change detection, run records reference version |
| v1.12.0 | 68 | Run History redesign — grouped action pills, More menu, replication count badge, average served per replication; Experiments vs Studies clarified; report export uses model snapshot from run record; "Save this change to model" for AI suggestions |
| v1.14.0 | 69 | AI debugging — trace emission for every event fire, model checker for validation errors, event provenance and arbitration trace, entity inspector panel, canvas node overlays |
| v1.15.0 | 69 | Magic-link model import — encode any model JSON as a URL; opening the link shows a pre-flight preview with validation status, then saves to your library with one click |
| v1.16.0 | 70 | Help Assistant — in-app contextual help with suggested questions, accessible from any screen via ? button; documentation accuracy fixes (RENEGE_OLDEST macro, ServerAttr/EntityAttr distributions, SPT/EDD queue disciplines) |
| v1.17.0 | 70 | Macro syntax corrections — fixed COMPLETE(), ASSIGN(QueueName, ServerType), RENEGE(ctx), BATCH(QueueName, N), PREEMPT(ServerType), SPLIT(EntityType, N, TargetQueue); added missing v1.14.0 version entry |
| v1.18.0 | 71 | In-app Feedback widget and About panel — toolbar Feedback button (speech-bubble icon) opens a Supabase-backed submission form; Info button (ⓘ icon) opens the About panel showing version and contact details; Supabase `feedback` table with RLS policies for authenticated and anonymous submission |
| v1.19.0 | 71 | Results workflow refinement — Results now groups Summary, Log, Entities, History, and Explain; run comparison moved into Results → History; saved run records retain chart/log payloads; default run names use `Model Name DD/MM/YYYY HH:mm` |
| v1.20.0 | 73 | Schedule Manager — timetable data separated from core model. New **Schedules** tab in the model editor to view, create, edit, and delete named timetables (e.g. Weekday, Weekend, Engineering blockade). Schedule selector dropdown in the Execute panel when a model has more than one schedule. CSV export of schedule rows. Model JSON export re-inlines schedule rows for portability. |
| v1.21.0 | 74–76 | Report redesign — Senior Management and Technical report variants in HTML and Markdown format. Improvements: entity name used in KPI labels (e.g. "Trains served" not "Entities served"); served/reneged counts shown as integers; per-stage wait and service time breakdown for multi-stage models; angled x-axis labels in queue wait chart; wrapped labels in resource utilisation chart; Scope & Methodology section (arrival pattern, warm-up, replications, performance goals); intro paragraph before results; goal status summary in executive summary. |
| v1.22.0 | 75–76 | Model Assistant — AI panel renamed from "AI Assistant" to "Model Assistant". Now persists as a sidebar across tab navigation. Clicking **Explain Results**, **Compare Runs**, or **Refine Plan** opens a focused view showing only that action (not all three at once). On mobile devices, action buttons open a full-screen overlay. Diagnostics panel: "Diagnose with AI" renamed to **Diagnose**; section heading "AI Diagnosis" renamed to **Diagnosis**. |
| v1.23.0 | 77 | **Results view** — Unified chart panels (all charts use the same bordered card with two-row header; long queue names wrap to two lines instead of truncating mid-word). Customers Arriving card added to the KPI summary. For multi-replication runs, Customers Arriving and Customers Served display as e.g. `11000 — 1100 per run`. Section order: Summary → Bottlenecks → Analysis → Run Effort. **Export Results** and **Create Report** buttons added after Analyse in the Results tab. **Run History** — Share link removed from the ⋯ menu. **Create Report** button added next to Explain. **View model at this run** now works correctly (model snapshot saved on every run). **Reproduce** fixed for multi-replication runs and timetable models. **Reports** — Senior Management report executive summary is always written in plain English by the AI (the technical model description field is no longer used). Queue chart labels strip verbose suffixes (e.g. shows "Cathcart Newton Neilston" not "Cathcart Newton Neilston Approach Queue"). Confidence is shown as High/Medium/Low instead of a CI table in the management report. **Validation** — V38 warning: writing `RELEASE(Server)` immediately before `COMPLETE()` in the same B-event silently skips completion; the engine now warns before the run. |

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
3. Run a single experiment and inspect Live View, Log, Histograms, and Results.
4. Use Results → Explain to interpret the outcome and ask follow-up questions.
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
| Templates | Pre-built read-only models. Clicking a template creates a private copy and opens it immediately. See the [Template Models Guide](Template%20Models%20Guide.md) for a full catalogue with model walkthroughs. |

### Creating a model

Click **+ New Model** in the My Models tab to open the new model dialog. Enter a name (required) and an optional description — a good description helps the AI tailor suggestions to your scenario.

Then choose a starting point from the five options presented:

| Option | What it does | Best for |
|--------|-------------|----------|
| **Draw** | Opens the Visual Designer canvas with an empty model | Modellers who prefer to sketch the flow graph first |
| **Use a template** | Opens the template browser; selecting a template creates a private copy and opens it immediately | Starting from a proven pattern (M/M/c, ER triage, call centre, etc.) — see the Templates tab for the full catalogue |
| **Import a file** | Opens a file picker for `.json` model files | Loading a model exported from another DES Studio instance or received as a file |
| **Paste model** | Opens a text area to paste model JSON | Quickly importing a model shared as text (e.g. from a colleague, a Claude conversation, or an AI-generated magic link) |
| **Describe** | Opens the AI Model Generator | Bootstrapping a model from a plain-English scenario description — the AI asks targeted follow-up questions, then generates the model structure |

All five options create a new model record owned by you. The name you entered in the dialog is always applied to the new model. Descriptions are optional but recommended — the AI reads them to contextualise suggestions.

> **Templates tab.** The Templates tab in the Model Library is a separate read-only catalogue. Clicking a template card there also creates a private copy and opens it immediately — it is equivalent to choosing **Use a template** from the New Model dialog.

### Three authoring modes

Inside the Model Detail view you can build your model three ways — all editing the same canonical model JSON:

| Mode | Access | Best for |
|------|--------|----------|
| Forms/Tabs editors | Default view; tabs for each element type | Precise, field-by-field editing of every model element |
| AI Model Generator | "Describe" panel | Bootstrapping a model from a natural-language scenario description |
| Visual Designer | "Visual Designer" tab | Seeing the model as a flow graph; drag-and-drop topology editing |

### 2.X AI Model Generator

The AI Generator helps you build a simulation model through a guided conversation. It asks questions about your system one at a time, confirms its understanding in plain English before generating anything, then presents the result as a readable summary — not raw JSON — so you can verify it matches your system before applying it.

#### How to use it

**1. Describe your problem**

Open the AI Generator tab and type a sentence or two about what you want to simulate. The generator will ask targeted follow-up questions one at a time to understand the structure of your system.

**2. Confirm the model**

Once the AI has enough information, it will summarise its understanding in plain English — who arrives, how they flow through the system, how many resources are available, and what you are trying to improve. Review this summary and either confirm it or tell the AI what to correct. The model JSON is not generated until you confirm.

**3. Review and apply**

The generated model is shown as a plain-English summary covering arrivals, flow, resources, and experiment settings. Click **Apply model** to load it into the editor, or **Refine this** to return to the conversation and make changes. Use the suggestion chips below the summary to explore common improvements such as time-varying arrivals, priority queuing, or customer abandonment.

#### Tips

- The more specific you are about arrival rates and service times, the more realistic the generated model will be. Round numbers are fine — the important thing is the right order of magnitude.
- You can switch to the Forms/Tabs editor or the Visual Designer at any time after applying a generated model to make precise adjustments.
- Generated models are always validated before being applied. The engine will never receive an invalid model from the AI Generator.
- The AI Generator works best for new models or adding significant new elements. For small targeted changes, editing directly in the Forms/Tabs editor is usually faster.

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

Goals are used by the Explain panel and by sweep feasibility colouring. Without goals the tool still runs; goals make AI suggestions more targeted.

### Step 6: Run the model

Open the **Execute** tab and click **Run All** (or use **Auto-run** with the speed slider). DES Studio will run the model to clock time 480.

Switch to **Live View**: you will see animated entity tokens (circles) flowing from the Patient Arrives event into the Waiting Room queue, being picked up by the GP Consultation event, and departing. When both GPs are busy, tokens queue up visually.

### Step 7: Read the results

Switch to **Results**:

- **KPI cards**: overall throughput, mean waiting time, mean time in system.
- **Per-queue stats**: Waiting Room — mean wait, maximum wait, p50/p90/p99 percentiles, mean queue length.
- **Per-resource utilisation**: GP utilisation (fraction of time GPs are busy).
- **Cumulative mean chart**: shows how the running mean of wait time stabilises over the run.

If the goal (avgWait < 15) is met, the goal row shows green. If not, it shows red.

### Step 8: Use Explain

Open **Results → Explain**. The AI will:

1. Summarise what happened in plain English.
2. Highlight reliability issues such as wide confidence intervals or too few repeated runs.
3. Point to likely bottlenecks and practical next changes.
4. Answer follow-up questions about this run in the same panel.

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
| cSchedule | Distribution used to schedule a subsequent B-Event when this C-Event fires (e.g., service duration). Multiple cSchedule entries are supported for attribute-conditional routing (see §6.3). |
| Priority | Order in which C-Events are tested when multiple could fire simultaneously |

C-Events model resource allocation decisions: they connect queues to servers by testing availability and performing ASSIGN.

### 4.4a Attribute-conditional service times

A C-event can carry multiple **cSchedule** entries, each with an optional **When** condition. This allows the service duration distribution to depend on the arriving entity's attributes — for example, routing hip-replacement patients to a different duration distribution than knee-replacement patients.

**How it works:**
1. In the C-Event editor, open the cSchedule panel and click **+ Add scheduled event**.
2. Select the B-event that signals completion (e.g. `Hip Complete`).
3. Enable the **Only fire when entity attribute matches** checkbox and build the condition (e.g. `Entity.surgery_type == hip`).
4. Add another cSchedule entry for `knee`, and a final entry without a condition as the fallback.

**First-match semantics:** the engine evaluates cSchedule entries in order. The first entry whose condition is satisfied (or that has no condition) is scheduled; all remaining entries are skipped.

**Fallback:** an entry without a condition at the end of the list acts as the default — it fires for any entity that didn't match the earlier conditions. Omitting the fallback triggers a V29 warning (entities that don't match any condition receive no service).

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
| COMPLETE | `COMPLETE()` | Marks the entity as served and removes it from active service. **Also releases the server automatically** — no preceding `RELEASE()` is needed on a terminal B-event. | Final B-Event when service ends and entity exits the system |
| RELEASE | `RELEASE(ServerType, NextQueue)` | Frees the server and moves the entity to the next queue (intermediate stage). **Do not follow with `COMPLETE()` in the same effect** — `RELEASE` sets the entity to `"waiting"` state so `COMPLETE` will silently skip (V38 warning). | Intermediate stage handoff — not the final stage |
| ASSIGN | `ASSIGN(QueueName, ServerType)` | Removes the next entity from the queue, binds it to a free server unit | Start-of-service C-Event |
| RENEGE | `RENEGE(ctx)` | Removes a waiting entity from a queue after a timeout (reneging) | Modelling impatient customers |
| RENEGE_OLDEST | `RENEGE_OLDEST(entityType)` | Removes the oldest entity of the specified type from its queue | Max-queue-length policies, timeout eviction |
| BATCH | `BATCH(QueueName, N)` | Collects N individual entities from the named queue into a single batch entity | Assembly, group boarding, bulk processing |
| UNBATCH | `UNBATCH(queueName)` | Splits a completed batch back into its constituent individual entities, placing each in the named queue | Post-batch processing where individuals must continue separately |
| SPLIT | `SPLIT(EntityType, N, TargetQueue)` | Creates N−1 clones of the current entity of the given type and places them in TargetQueue | Parallel processing, order splitting |
| MATCH | `MATCH(typeA, queueA, typeB, queueB, targetQueue)` | Pairs one entity from queueA with one entity from queueB into a combined batch placed in targetQueue | Kitting and assembly where two components must meet |
| COSEIZE | `COSEIZE(queueName, serverType1, serverType2, ...)` | Atomically seizes one entity from the queue and one idle server of each listed type; fails cleanly if any type has no idle server | Multi-resource operations requiring simultaneous capture (e.g. patient needs both a doctor and a room) |
| PREEMPT | `PREEMPT(ServerType)` | Interrupts the entity currently in service on the server and replaces it with the higher-priority entity | Emergency/priority override |
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

**Parametric** — classical distributions with numeric parameters:

| Distribution | Parameters | Typical use |
|-------------|------------|-------------|
| Fixed | `value` | Deterministic fixed duration (removes variability) |
| Exponential | `mean` | Memoryless inter-arrival and service times (M/M/c baseline) |
| Uniform | `min`, `max` | Service times with known lower and upper bounds, no preference |
| Normal | `mean`, `stdDev` | Service times when empirical data is approximately bell-shaped |
| Triangular | `min`, `mode`, `max` | Service time estimates when only three-point estimates are available |
| Erlang | `k`, `mean` | Sum of k exponential phases; more regular than Exponential |

**Time-varying** — rate or schedule driven:

| Distribution | Parameters | Typical use |
|-------------|------------|-------------|
| Piecewise | `segments[]` | Arrival rates that change at defined time breakpoints |
| Schedule | `times[]` or `rows[]` | Planned arrivals at absolute clock times; supports per-arrival entity attributes |

**From data** — durations drawn from entity or server attributes:

| Distribution | Parameters | Typical use |
|-------------|------------|-------------|
| Empirical | `values[]` | Sample-driven distribution; draws from an uploaded dataset |
| EntityAttr | `attrName` | Duration drawn from an attribute already set on the entity |
| ServerAttr | `attrName` | Duration drawn from an attribute on the assigned server entity |

### 6.1 Schedule distribution — importing a planned arrival file

The **Schedule** distribution is designed for models where arrivals follow a known timetable rather than a statistical process (e.g. booked appointments, shift handovers, elective procedure lists). Instead of entering times by hand, you can upload a CSV file directly.

**How to import:**

1. In the B-Event editor, set the schedule distribution to **Schedule**.
2. Click **↑ Load plan** (top-right of the Schedule editor panel).
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

### 6.1b Importing a planned arrival file from Excel (XLSX)

In addition to CSV, the Schedule editor accepts Excel files (`.xlsx`, `.xls`, `.ods`).

**How to import:**

1. In the B-Event editor, set the schedule distribution to **Schedule**.
2. Click **↑ Load plan** — the file picker accepts `.csv`, `.xlsx`, `.xls`, and `.ods`.
3. Select your Excel file. DES Studio reads the first sheet by default and converts it to the same internal format as a CSV import.
4. A preview of the first 5 rows appears — check that columns look correct before confirming.
5. Click **✓ Import N arrivals** to load the data.

**Column format** is identical to CSV (see §6.1): the first column must be `time`, and any additional columns become entity attributes. The first row is treated as a header if the first cell is not a number.

### 6.1c Importing a schedule from a live REST endpoint (scheduleFeed)

For use cases where the arrival plan is managed in an external system (e.g. an operating theatre booking system, an appointment platform, or an airline gate manifest), DES Studio can fetch the schedule directly before each run.

**Setup:**

1. Open the model **Model Data** tab.
2. In the **Data Sources** section, click **+ Add source**.
3. Set the type to **scheduleFeed** and complete the fields:

| Field | What to enter |
|-------|--------------|
| URL | The HTTPS endpoint that returns the JSON schedule |
| Auth header / secret | e.g. `Authorization` / `{{env.HIS_TOKEN}}` — the token value is entered at session time; it is never stored in the model |
| Entity type | Name of the entity type that arrives (e.g. `Patient`) |
| Target B-event ID | The ID of the B-event whose schedule will be populated (e.g. `b_patient_arrives`) |
| Time field | Dot-notation path to the start-time field in each activity object (default: `time`) |
| Attribute map | JSON object mapping API field paths to entity attribute names (e.g. `{ "patientName": "entityId", "surgeryType": "surgery_type" }`) |

4. Save the model. When a run is started, DES Studio fetches the feed, converts timestamps using the model epoch, and injects the resulting rows into the target B-event — no manual import step required.

**`entityId` — naming individual entities.** If the attribute map includes `"someField": "entityId"`, the value from the API (e.g. the patient's name) becomes the entity's display name in the simulation UI and run results. This is how you track named individuals through the model.

**What the plan provides vs what the model provides:**

| Source | Provides |
|--------|----------|
| Schedule feed | Who arrives, when they arrive, their attributes (e.g. surgery type) |
| Model distributions | How long service takes (sampled at run time from calibrated distributions conditioned on entity attributes) |

Planned durations from the feed are deliberately ignored — service time is always derived from the model's calibrated distributions. This preserves the simulation's ability to explore "what if we were faster/slower" scenarios independently of the actual plan.

### 6.1d Receiving actual times from a live system (actualsStream)

Once a simulation is running against a pre-loaded schedule, an `actualsStream` data source can push actual start times from the live system and adjust the simulation in real time.

**How it works:**
1. A WebSocket endpoint (e.g. from your booking or theatre system) sends messages as each procedure actually starts.
2. DES Studio matches the `entityId` in the message to pre-scheduled FEL entries and reschedules them to the actual time.
3. When the entity arrives (at the actual time), the system remembers the planned time and records the deviation.
4. The generated report includes a "Plan vs Actual" section showing average deviation in time units.

**Setup:**
1. Open the model **Model Data** tab and, in the **Data Sources** section, click **+ Add source**.
2. Set the type to **actualsStream**.
3. Enter the WebSocket URL (starting with `wss://`) and optional auth credentials.

**Expected message format:**
```json
{ "entityId": "Alice",  "actualTime": "2026-05-18T09:05:00" }
```

`actualTime` may be a sim-time number, `HH:MM` string, or ISO 8601 datetime (requires epoch to be set).

**Plan vs Actual report section:** when the report is exported after a run that used planned data with actuals, the "Simulation Results" section includes average plan deviation (positive = ran late, negative = ran early).

### 6.2 Model settings — time unit and simulation start time

Two model-level fields in the **Model Data** tab control how DES Studio labels and anchors simulation time.

**Time unit** (`timeUnit`): Sets the label for one simulation time unit (e.g. `minutes`, `hours`, `seconds`). The label appears in the UI, in AI analysis text, and in exported reports. It does not affect engine calculations — it is purely a display annotation.

#### Simulation start time (epoch)

The **Simulation start time** field (`epoch`) maps simulation time t=0 to a specific real-world calendar date and time. It is optional, but when set it unlocks several capabilities.

**What it is.** Entering `2026-05-18T08:00:00` means "when the simulation clock reads 0, the real-world time is Monday 18 May 2026, 08:00." From that anchor, DES Studio can convert any simulation time to a wall-clock time and vice versa.

**How to set it.** Open the **Model Data** tab for the model. Below the Time unit field, use the date/time picker to set the epoch. The value is stored in the model JSON as an ISO 8601 string (e.g. `"2026-05-18T08:00:00"`).

**What it enables:**

1. **Report cover period line.** The generated report cover page shows the simulated period in plain English: e.g. "Period: Mon 18 May 08:00 → 16:00" (for a 480-minute run starting at 08:00).
2. **Experiment controls.** The run setup panel displays real-world start and end times alongside the numeric duration, making it easier to confirm the run covers the intended shift or day.
3. **CSV timestamp import.** When loading a planned-arrival CSV (see §6.1), the `time` column may contain real timestamps — either `HH:MM` format (e.g. `08:30`) or full ISO 8601 (e.g. `2026-05-18T10:45:00`) — instead of numeric simulation-time offsets. DES Studio converts each timestamp to a simulation-time offset using the epoch and time unit. Without an epoch, rows with timestamp-format times are skipped and a warning is shown.

**Notes:**
- The epoch field is optional. Models without it behave exactly as before — all times are treated as plain numeric offsets and no wall-clock conversion is applied.
- The epoch is required if you intend to import a CSV where the `time` column contains `HH:MM` or ISO 8601 timestamps rather than numeric values.

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

### 7.3 Saved Experiments

Open the **Experiments** tab to save named run configurations — warm-up period, replication count, seed, termination mode, and parameter overrides. Each saved experiment captures your current Execute panel settings so you can quickly reload and re-run them later. When you run a saved experiment, results are saved to run history.

### 7.4 Parametric Studies (1D and 2D)

Open the **Studies** tab.

**1D sweep:** Choose one model parameter (e.g., server count, arrival rate, mean service time), set a range and step size. DES Studio runs the full replication batch at each parameter value and plots KPI vs. parameter.

**2D sweep:** Choose two parameters, each with its own range. DES Studio runs a grid of experiments and renders a heatmap of the chosen KPI. Feasibility colouring applies: cells meeting all performance goals are green; cells that violate at least one goal are red. The best feasible point is annotated with a marker.

> **Note:** Study results are shown in charts and tables but are not saved to run history. Use saved Experiments if you need to persist run results.

### 7.5 Results History

Open **Results → History** to list, re-open, compare, archive, or delete saved runs. The table shows:

| Column | Content |
|--------|---------|
| Date / Time | When the run completed |
| Label | Click to edit the run name |
| Runs | Replication count — highlighted when > 1 |
| Avg Served | Average entities served per replication (total shown in tooltip for multi-replication runs) |
| Reneged | Entities that left before service |
| Avg Wait | Mean waiting time with a confidence badge (RAG-coloured percentage based on CI width) |
| Tags | Click to add or remove tags |
| Actions | Primary buttons and More menu |

**Row actions:**
- **View Results** — opens the Results workspace for that run (only when results data exists)
- **Explain** — opens the Explain sub-tab with that run's context
- **⋯ (More)** — dropdown with Reproduce, Share, Archive/Unarchive, and Delete

**Bulk actions:** Select runs using checkboxes (or **Select all**) to archive, unarchive, delete, or export selected runs as CSV.

Select exactly two runs and click **Compare selected** to view a side-by-side KPI comparison table.

### 7.6 Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` / `Cmd+S` | Save the current model |
| `?` | Open the Help Assistant |

Pressing `?` at any time (while focus is outside a text input) opens the Help Assistant panel with context-aware suggested questions.

### 7.7 Warmup period and Welch detection

Long-running models may start in an unrealistic empty state. The Results view applies **Welch's method** to detect the warmup period automatically: it finds the point in the cumulative mean chart where the running mean stabilises. Statistics reported in the KPI summary exclude data from before the detected warmup cutoff, giving steady-state estimates rather than transient ones.

You can override the warmup period manually by entering a fixed value in the Run setup settings.

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

> **During execution:** The Log menu button is disabled while a run is in progress. The bottom-panel event log remains visible during execution. The Log view becomes available in the menu again once the run completes.

### 8.3 Histograms

The Histograms view shows a bar chart of waiting time for each queue in the model. The x-axis is waiting time; the y-axis is frequency. Vertical markers indicate the p50, p90, and p99 percentiles. Use histograms to:

- Identify long-tail waiting time distributions
- Check whether a service meets percentile-based SLAs (e.g., 90% of patients wait under 20 minutes)

### 8.4 Entity Details view

The Entity Details view is a per-entity lifecycle table. Each row is one entity instance; columns include arrival time, service start time, departure time, time in queue, time in service, and any custom attributes. The table is:

- Sortable by any column
- Filterable by entity type, time range, or attribute value
- Equipped with anomaly detection — rows where wait time or time in system is more than 3σ from the mean are highlighted

Use the Entity Details view to find individual outlier cases and trace why a specific entity experienced an unusually long wait.

### 8.5 Results view

The Results view (`ResultsWorkspace`) is the primary results dashboard. It contains:

| Panel | Contents |
|-------|----------|
| KPI summary | Throughput, mean wait, mean time in system, goal status (green/red border per goal) |
| Per-queue wait stats | Mean, max, p50, p90, p99 for each queue |
| Per-resource utilisation | Fraction of time each server type was busy, with a utilisation bar |
| Cost summary | Total cost, cost per served entity, and served count — shown when the model uses at least one COST macro |
| Cumulative mean chart | Running mean of the primary KPI over simulation time, with warmup cutoff marked |
| Replication CI table | When replications are run: mean ± 95% CI for each KPI |

---

## 9. Explain Results

The Explain panel lives inside **Results** and is grounded in the current run's results and the model JSON.

### 9.1 Explain Results

Click **Results → Explain** to receive a plain-English analysis of your simulation results. The output covers three sections:

**What Happened** — overall system performance, which queues are longest, which resources are most utilised, whether performance goals are met, and notable patterns.

**How Reliable** — confidence interval widths, which conclusions are robust enough to act on, and whether more replications are needed.

**What to Change** — 1-3 specific, actionable recommendations with exact parameter names, current values, proposed values, and predicted effects.

### 9.2 Apply a Suggested Change

When the AI suggests a change that can be auto-applied (for example, increasing server count), a **Run with this change** button appears on the suggestion card. Clicking it runs a new simulation with the suggested change applied to a temporary copy of your model, then shows a before/after comparison table inline — without touching your saved model. This lets you verify the effect before deciding whether to apply it permanently.

After the comparison table appears, a **Save this change to model** button lets you make the change permanent. Clicking it applies the suggested parameter change to your current model definition. You must then click **Save** in the model editor to persist the change to the database.

Suggestions that require structural changes the tool cannot auto-apply (for example, adding a new queue) show the button as disabled with a note explaining what to change manually.

### 9.3 Ask a Question

Type any question about the model or results in the text box and click **Ask**. Examples:

- "Why is utilisation above 90%?"
- "What would happen if I added a priority queue for urgent patients?"
- "Is the warmup period long enough?"

The AI answers using the current model JSON and results as context.

### 9.4 Compare Runs

Run comparison is available from **Results → History**. Select exactly two saved runs and click **Compare selected** to view the side-by-side KPI comparison table.

### 9.5 Best practices for getting good AI suggestions

- **Set performance goals first.** Without goals the AI cannot assess feasibility or rank suggestions by goal impact.
- **Run replications before using Explain.** Point estimates from a single run have high variance; the AI's predictions are more reliable when based on CI-validated KPIs.
- **Use descriptive names.** Name your queues and entity types clearly (e.g., "Emergency Waiting Room" not "Q1") — the AI uses these names to produce readable, specific output.
- **Annotate the model description.** A model description explaining the real-world context helps the AI tailor suggestions to the scenario (e.g., "GP surgery, 08:00–16:00, two GPs").
- **Run warmup detection first.** If Welch detection finds a long warmup, extend the run time so the steady-state sample is large enough for reliable statistics.

---

## 9a. Help Assistant

The Help Assistant provides contextual, in-app guidance accessible from any screen via the `?` button in the toolbar. Unlike the Explain panel (which analyses run results), the Help Assistant answers questions about how to use DES Studio itself.

**How to use it.** Click the `?` button in the toolbar to open the Help Assistant panel. Type your question or click one of the suggested questions that appear based on your current screen.

**What it covers:**
- Model element definitions (entity types, queues, B-events, C-events, state variables, containers)
- Effect macro usage and syntax
- Distribution selection guidance (which distribution for which scenario)
- Validation error explanations (plain-English meanings of V1–V29, W-CAP-01, W-CAP-02)
- Experiment setup (warmup period, replications, parametric sweeps)
- Results interpretation (KPI meanings, confidence intervals, goal feasibility)

**Suggested questions by context:**
| Current screen | Suggested questions |
|----------------|---------------------|
| Entity Types tab | "What's the difference between customer and server entities?", "When should I use attributes?" |
| B-Event editor | "What does ARRIVE do?", "How do I set up reneging?" |
| Distribution picker | "Which distribution should I choose for arrivals?", "What's the difference between Triangular and Normal?" |
| Validation errors present | "What does V8 mean?", "How do I fix 'no arrival source'?" |
| Execute panel | "What is warmup period?", "How many replications should I run?" |

**Keyboard shortcut.** Press `?` at any time (when focus is not in a text input) to open the Help Assistant.

---

## 9b. Toolbar Utility Buttons

Three utility buttons sit on the right side of the toolbar, to the left of the **Settings** and **Sign Out** controls:

| Button | Icon | What it does |
|--------|------|-------------|
| **Feedback** | Speech-bubble (◻) | Opens the Feedback widget — submit a bug report, feature request, question, or general comment directly to the DES Studio team |
| **About** | Info circle (ⓘ) | Opens the About panel — shows the app version, copyright, contact address, and the Three-Phase method attribution |
| **Help** | `?` | Opens the Help Assistant (see §9a) |

### Submitting feedback

Click the speech-bubble icon (labelled **Submit feedback**) to open the Feedback widget. The widget is accessible from any screen — you do not need to be in a model to use it.

**Steps:**
1. Choose a category: **Bug Report**, **Feature Request**, **Question**, or **Other** — click the pill to select it.
2. Type your message in the text box (minimum 10 characters, maximum 2000).
3. Click **Send Feedback**. A character counter below the text box shows how many characters you have used.

On successful submission you will see a confirmation message: *"Thank you — your feedback has been received."* The widget does not close automatically — click **Close** when you are ready.

If the submission fails (for example due to a network error), an error message appears and you can try again.

**What is sent.** Each submission records: your chosen category, your message, your app version, the page you were on when you opened the widget, your browser user-agent string, and your user ID if you are signed in. Anonymous users can also submit feedback — in that case no user ID is included.

**Keyboard.** Press `Escape` to close the widget without submitting.

### About panel

Click the info-circle icon (labelled **About DES Studio**) to view the About panel. It shows:
- App name and version (e.g. `v7.0.0`)
- Copyright notice
- Contact address: [support@simmodlr.app](mailto:support@simmodlr.app)
- Method attribution: Three-Phase Simulation approach (Tocher/Pidd)

Press `Escape` or click **×** to close.

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

### 10.4 Node badges

Node cards display small badge chips when advanced configuration is present:

| Badge | Appears on | Meaning |
|-------|------------|---------|
| `when` (amber) | ACTIVITY nodes | At least one service-time schedule has an attribute-based condition (`when` predicate). Click the badge to open the node inspector and view the conditional routing. |
| `feed` (cyan) | SOURCE nodes | A live schedule feed (scheduleFeed data source) is configured to inject arrivals into this event before each run. Click the badge to open the node inspector. |

Badges are read-only indicators — they do not modify the model. No badge is shown when no advanced configuration is present.

### 10.5 Syncing with editors

The Visual Designer and the Forms/Tabs editors share a single canonical model JSON. There is no separate "sync" step — the two views are always in sync. You can switch between them at any time without losing changes.

### 10.6 Run configuration (Setup tab)

Controls that affect how a run executes are in the **Setup tab**, not the Execute menu:

| Control | Purpose |
|---------|---------|
| **Animate** toggle | Enable/disable live entity animation during the run. Disabling animation speeds up long runs significantly. |
| **Collect time-series** checkbox | Record per-step metric snapshots during the run (required for cumulative mean charts). Disable for maximum speed on large models. |
| **Speed** slider | Control animation playback rate (0.5× – 10×) when Animate is enabled. |

These are set before starting a run. They cannot be changed mid-run.

---

## 11. Exporting

### 11.1 Export results data

In the Execute panel Results area, click **Export Data**. A short dropdown opens:

| Format | Contents |
|--------|----------|
| **JSON** | Full results object including all raw statistics, replication data, and confidence intervals. Suitable for programmatic processing or archiving. |
| **CSV** | KPI summary table, per-queue stats, per-resource utilisation, and the per-entity lifecycle table. Suitable for import into Excel or R. |

Click the format you want to download it immediately. The event log can also be exported as CSV from the Log view.

### 11.2 Export model as JSON

From the Model Detail view click **Export Model**. DES Studio downloads the model definition as a `.json` file. This file can be imported into any DES Studio instance via **Import** in the Model Library.

### 11.3 Create a simulation report

In the Execute panel Results area, click **Create Report**. A modal dialog opens with two choices:

**Senior Management Report** — written for non-technical stakeholders. Contains:
1. What was modelled (AI-generated plain-English description)
2. Key results — headline KPIs formatted as per-run averages
3. Analysis — "What Happened" and "What to Change" sections
4. Recommended actions — three prioritised actions with finding, proposed change, and expected impact

**Technical Report** — everything in the Senior Management Report, plus:
5. Statistical confidence analysis — per-metric confidence interval table (mean, 95% lower/upper, half-width, n replications)
6. Model specification — entity types, queues, arrival events, conditional events, state variables, performance goals
7. Experiment configuration — warmup period, max time, replications, seed, termination mode
8. Run provenance — run ID, run label, date, engine version, PRNG algorithm, base seed

**Format options:** Each report type is available as **HTML** (self-contained, suitable for printing or PDF export via the browser) or **Markdown** (portable plain text that renders natively in Notion, GitHub, Confluence, and Obsidian; charts are replaced by formatted tables).

**Number formatting:** All numeric results are shown to at most 1 decimal place. Financial values are expressed in plain English — for example *£1.24 million*, *£45.34 thousand*, or *£123.00*. For multi-replication runs, all figures are per-run averages, not totals.

**The report uses the model snapshot stored with the run record**, not the current model definition. This ensures the report accurately describes what was actually simulated, even if the model has been edited since the run.

**The report file is generated entirely in your browser — no simulation data is sent to any server during report generation.** The AI narrative and recommendations are fetched from the same LLM proxy used by the Explain panel; if the LLM is unavailable the report is still generated without the AI-generated sections.

Files are saved as `<Model Name> — <Run Label> — Senior Management Report.html` (or `.md` / `Technical Report.*`).

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

## Model Versioning

DES Studio supports first-class model versioning. For a full guide see `docs/sprint-68-model-versioning-guide.md`.

### Named versions

Open a model you own, go to the **Versions** tab, and click **+ Create version**. Each version stores a full snapshot of the model. You can:
- **Diff** any past version against the current model
- **Restore** a past version into the editor (marks the model as modified — save manually to persist)

### Scenario baselines

In the **Overview** tab, click **Save as scenario baseline** to fork the model with a provenance link. The new model shows a "Forked from…" badge in its Overview.

### Run snapshot diffs

In **Results → History**, click **⋯ → View model at this run** to see how the model differed from its current state at the time of that run.

---

## 14. Magic-Link Model Import

DES Studio supports a **magic-link** import flow: an external tool (for example, a Claude conversation or a custom script) can generate a model JSON and produce a URL that, when opened, pre-loads the model into a review dialog before saving it to your library.

### URL format

```
https://<app-url>/#import?m=<base64url-encoded-model-json>
```

The `m` parameter is the model JSON encoded as a URL-safe base64url string (standard RFC 4648 base64url, no padding).

### Generating a magic link

Use the `encodeModelToLink` helper in `src/utils/importLink.js`:

```js
import { encodeModelToLink } from './src/utils/importLink.js';

const url = encodeModelToLink(modelJson, 'https://your-des-studio-domain.com');
// → https://your-des-studio-domain.com/#import?m=eyJuYW1lIjoiLi4uIn0
```

When prompting an LLM to generate a model, append this instruction:

> "After generating the JSON, encode it as base64url (no padding, URL-safe characters) and output the full import URL:  
> `https://<app-url>/#import?m=<encoded-json>`"

### What happens when a magic link is opened

1. **Import Preview** — The app decodes the model, validates it, and shows a summary card with:
   - Entity types (name and role)
   - Queues (name and discipline)
   - Experiment defaults (max sim time, warmup, replications)
   - Validation status (green "passed" or amber warning list)

2. **Signed-in users** — A **Save to my models** button saves the model immediately to the library and opens the editor.

3. **Signed-out users** — A **Sign in to save** button stores the model in `sessionStorage` and navigates to the sign-in form. After sign-in the preview is restored automatically.  
   A **Continue without saving — copy JSON** link reveals the raw JSON with a copy button for users who do not want to create an account.

4. **Validation warnings** — The import is never blocked by validation errors; warnings are shown so the modeller can fix them in the editor before running.

### Zero-auth entry point

Magic links work regardless of authentication state. Sharing a link with a colleague lets them preview the model without needing an account first.

### Security considerations

- Magic links encode the full model JSON client-side — no server round-trip is made until the user clicks **Save**.
- Never embed credentials (API keys, passwords) in a model JSON shared via magic link.
- The `sessionStorage` key (`des.pendingImport`) is cleared immediately after the model is restored post sign-in.

---

## 15. Schedule Manager (Timetables)

The **Schedules** tab in the model editor lets you manage named timetables independently from the core DES logic. This is most useful for models that run against real operational data — for example, a station model with hundreds of train-movement rows.

### Why schedules are separate

Timetable data is stored separately from the model's DES logic so that:
- The core model (entity types, queues, arrival events, service events) stays small and loads quickly
- You can maintain multiple timetables for the same model (weekday, weekend, engineering blockade) and switch between them at run time
- Editing a timetable does not create a new model version

### Accessing the Schedule Manager

Open a model, then click the **Schedules** tab (between C-Events and State Variables in the editor tab bar).

### Schedule list view

The list shows all schedules for this model:

| Column | Meaning |
|---|---|
| ★ | Default schedule — used when no explicit selection is made in the Execute panel |
| Name | User-defined name (e.g. "Weekday May 2026", "Weekend May 2026") |
| Rows | Total number of arrival rows across all events in this schedule |
| Used by | Which B-Events reference this schedule |

Click a schedule name to open the detail view. Click **+ New Schedule** to create a new one.

### Schedule detail view

The detail view shows all arrival rows in a paginated table (50 rows per page). Columns depend on the data your schedule contains (e.g. time, train ID, platform group, route).

**Times** are shown in `HH:MM` format (converted from simulation minutes).

**CSV export** — click **Export CSV** to download all rows for editing in a spreadsheet tool. After editing, create a new schedule via the import flow.

### Creating a schedule

Click **+ New Schedule**, enter a name and optional description, then save. The new schedule starts empty. To populate it with data, use the CSV import flow (the schedule editor accepts pasted JSON or CSV data depending on your model's schedule format).

### Setting a default schedule

In the schedule list, click **Set as default** (★) next to the schedule you want to use by default. The default schedule is pre-selected in the Execute panel.

### Deleting a schedule

Click the delete button (✕) next to a schedule in the list. You cannot delete the only schedule for a model; at least one must remain. If a B-Event references the deleted schedule, it will produce zero arrivals until a new schedule is linked.

### Selecting a schedule before running

When a model has **more than one schedule**, a **Timetable:** dropdown appears in the Execute panel above the Run button. Select the schedule you want to use for this run before clicking Run.

The selected schedule is passed to the simulation engine; arrivals fire at the times defined in that schedule.

### Exporting a model with schedules

When you export a model as JSON (**Export Model** in the toolbar), schedule rows are automatically re-inlined into the exported JSON. The exported file is self-contained and can be imported into another DES Studio instance without needing the original schedule records.

### Typical workflow — multiple timetables

1. Create the core model (entity types, queues, arrival events) with a placeholder schedule
2. Import your weekday timetable data as the **Default** schedule
3. Import your weekend timetable as a second schedule named "Weekend"
4. Run with the weekday schedule; note the results
5. Switch to the weekend schedule in the Execute panel; run again
6. Compare the two runs in the **Results → History** view
