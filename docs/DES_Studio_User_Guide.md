# DES Studio User Guide

*Draft help documentation for new users.*

DES Studio is a browser-based discrete-event simulation modelling application. It helps you define, run, compare, and export simulation models without writing code.

The application is designed for modellers who understand queues, entities, resources, arrivals, service activities, and event-based simulation. DES Studio uses Pidd's Three-Phase Method:

- Phase A advances the simulation clock.
- Phase B fires scheduled events at the current time.
- Phase C repeatedly checks conditional events until no more can fire.

You do not need to write simulation logic manually. Models are built through structured editors, pickers, and validated form controls.

## 1. Main Areas Of The Application

DES Studio has two main working areas:

| Area | Purpose |
|---|---|
| Model Library | Create, import, open, share, and delete models. |
| Model Detail | Edit a selected model, run experiments, review history, and export results. |

When you sign in, DES Studio opens the Model Library.

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

For a first walkthrough, choose `Create sample M/M/1 model`. It gives you a working model with exponential arrivals, one server, a FIFO queue, and an execute-ready configuration.

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
| Queues | Define waiting lines and queue disciplines. |
| Execute | Run the simulation, replications, and view live results. |
| History | Review and export previous runs. |
| Access | Owner-only sharing and visibility controls. |

If you edit a model, a `Save` button appears. Use it to persist your changes. If you try to leave with unsaved changes, DES Studio warns you before discarding them.

Undo and redo are available while editing.

## 5. Core Modelling Concepts

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

### B-Events

B-Events are scheduled events. They happen at a known simulation time.

Common B-Event examples:

- A customer arrives.
- A service activity completes.
- A reneging timeout occurs.
- A time-varying arrival rate changes.
- A resource shift changes capacity.

B-Events can schedule future B-Events using distributions.

### C-Events

C-Events are conditional events. They fire when their condition is true.

Common C-Event examples:

- If a customer is waiting and a server is idle, start service.
- If a queue has capacity and a blocked entity exists, move the entity forward.

C-Events have explicit priorities. Lower numbers fire first. After any C-Event fires, DES Studio restarts the C-Event scan from the highest priority event, following the Three-Phase Method.

### State Variables

State variables store model-level numeric values. They are useful for counters, flags represented numerically, thresholds, or values used in conditions.

## 6. Distributions

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

## 7. Building A Simple Queueing Model

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

## 8. Running A Model

Use the `Execute` tab to run simulations.

Depending on the model and current application version, the Execute tab may include:

- Single-run controls.
- Replication controls.
- Seed input or random seed controls.
- Warm-up period.
- Maximum simulation time.
- Live visual view.
- Step log.
- Entity table.
- Summary statistics.
- Confidence interval results.
- AI-generated results insights.

### Seeds

A seed controls the random stream. Use a fixed seed when you need reproducible results. Randomize the seed when you want a new independent run.

### Warm-up

Warm-up lets the model run for an initial period before statistics are collected. This helps reduce startup bias in steady-state simulations.

### Replications

Replications run the same model multiple times with different seeds. DES Studio summarizes the results and can calculate confidence intervals for key measures.

## 9. Understanding Results

DES Studio can show several result views:

| View | Purpose |
|---|---|
| Visual View | Shows the current system state, including queues, entities, and servers. |
| Step Log | Shows phase-tagged simulation events with clock times. |
| Entity Table | Shows entity status during or after a run. |
| Summary | Shows totals and averages such as arrived, served, reneged, wait time, and service time. |
| Confidence Intervals | Summarizes replication uncertainty. |
| AI Insights | Provides plain-language interpretation of completed run results. |

The Step Log is useful when checking whether the model behaves as intended. It can reveal when arrivals, completions, C-Events, rate changes, or shift changes occur.

## 10. Run History

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

## 11. Importing And Exporting

### Export a model

Use `Export JSON` from the Model Detail header. DES Studio exports the current model as a JSON file.

If the model contains validation errors, DES Studio asks you to confirm before exporting.

### Import a model

Use `Import JSON` from the Model Library. Imported models are saved as private models owned by you.

DES Studio validates imported models. Blocking validation errors prevent the import.

### Export run results

Use result export controls in the Execute or History areas. JSON is best when you want complete structured data. CSV is best when you want to analyze rows in a spreadsheet.

## 12. Sharing And Access

Model owners can control visibility and access.

| Setting | Meaning |
|---|---|
| Private | Only the owner and explicitly shared users can access the model. |
| Public | Other authenticated users can see the model in the Public Library. |
| Viewer | A shared user can view the model. |
| Editor | A shared user can edit the model. |

Public model runs by non-owners use a fork. This means the original public model is not changed by another user's execution or run history.

## 13. Validation Messages

DES Studio validates models before running and during key import/apply workflows.

Validation messages are shown near the affected editor tab where possible.

Blocking errors prevent execution. Examples include:

- Empty or duplicate entity type names.
- Duplicate attributes within an entity type.
- Distribution parameters outside valid bounds.
- Conditions that reference undefined variables or attributes.
- Priority queues without a numeric priority attribute.

Warnings do not always prevent execution, but they indicate something worth checking. For example, a normal distribution with a mean too close to its standard deviation may create many negative samples that need clamping.

## 14. Dynamic Modelling Features

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

## 15. AI Features

DES Studio includes AI-assisted results interpretation through a server-side LLM proxy. AI analysis is advisory and does not change the model or engine.

AI result features may include:

- KPI narrative.
- Scenario comparison.
- Sensitivity commentary.

Do not enter secrets or API keys into the browser. Provider credentials are handled server-side.

AI-assisted model creation is part of the planned roadmap. If an AI Generated Model tab is visible in your version, treat proposed model changes as drafts and review validation results before applying them.

## 16. Practical Tips

- Start with the sample M/M/1 model to learn the workflow.
- Build small models first, then add complexity.
- Use fixed seeds while debugging.
- Use the Step Log to check event order.
- Use validation messages before assuming a model is wrong.
- Run multiple replications before trusting averages.
- Export JSON before making large structural changes.
- Keep names consistent, especially queue names, entity type names, and event names.

## 17. Glossary

| Term | Meaning |
|---|---|
| DES | Discrete-event simulation. |
| Entity | An object moving through or supporting the system, such as a customer or server. |
| Queue | A waiting line for entities. |
| B-Event | A scheduled event that fires at a known simulation time. |
| C-Event | A conditional event that fires when its condition is true. |
| FEL | Future Event List, the ordered list of scheduled events. |
| Seed | A number used to make random sampling reproducible. |
| Warm-up | Initial simulation period excluded from statistics. |
| Replication | One independent run of the same model. |
| Confidence interval | A range describing uncertainty across replications. |
| Fork | A private copy of a public model made for another user's run or edit workflow. |

## 18. Where To Go Next

For a new user, the recommended learning path is:

1. Create the sample M/M/1 model.
2. Run it once from the Execute tab.
3. Review the Step Log and Entity Table.
4. Change the arrival or service distribution.
5. Run several replications.
6. Export the results.
7. Create a blank model for your own system.

For deeper reference material, see:

- `README.md` for project setup and roadmap status.
- `CLAUDE.md` or `AGENTS.md` for architectural rules.
- `docs/addition1_entity_model.md` for the model schema and distribution details.
- `docs/DES_Studio_Build_Plan.md` for roadmap and sprint history.
