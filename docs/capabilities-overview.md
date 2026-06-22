# simmodlr — Capabilities Overview

simmodlr is a professional discrete-event simulation (DES) platform for modellers who need rigorous results without writing code. It implements the **Three-Phase Method (A/B/C)**, a well-established simulation paradigm used across manufacturing, healthcare, logistics, and service design.

---

## Model Authoring — Four Ways to Work

People work differently. simmodlr provides four authoring modes, all working from the same underlying model format:

| Mode | Best for |
|---|---|
| **Forms & Tabs** | Precise, structured entry — entities, queues, events configured step by step |
| **Visual Designer** | Drag-and-drop canvas — see your process as a flow diagram while you build it |
| **AI Model Builder** | Describe the system in plain language; the built-in AI generates a first model to review and refine |
| **External LLM Import** | Share simmodlr's published schema with any external AI (ChatGPT, Claude, Gemini, etc.); import the resulting model JSON directly — especially powerful when you can provide the AI with your own domain documents alongside the schema |

---

## Entity System

Entities carry typed attributes you define:

- **number** — priority levels, counts, sizes (supports `==`, `!=`, `<`, `>`, `<=`, `>=`)
- **string** — categories with optional allowed-value dropdowns (supports `==`, `!=`)
- **boolean** — flags and switches

Attributes can be mutable (modified during processing) or immutable (set at arrival, never changed). Entities track their full journey — arrival time, wait at each stage, outcome — for downstream analysis.

---

## Process Logic — 19 Built-in Macros

The engine vocabulary covers all standard DES patterns without free-text scripting:

| Category | Macros |
|---|---|
| **Core lifecycle** | ARRIVE, SEIZE, COMPLETE, RELEASE, RENEGE |
| **Assembly & grouping** | BATCH, UNBATCH, MATCH, SPLIT |
| **Multi-resource** | COSEIZE |
| **Reliability** | FAIL, REPAIR, PREEMPT |
| **State management** | SET, SET_ATTR, ASSIGN, COST |
| **Inventory / tanks** | FILL, DRAIN |
| **Queue management** | RENEGE_OLDEST |

---

## Queues & Routing

**Six queue disciplines:** FIFO, LIFO, PRIORITY (by numeric attribute), SPT (shortest processing time), EDD (earliest due date), PRIORITY(attrName) (any attribute you choose).

**Three routing modes:** Fixed next queue, conditional routing (first-match predicate), probabilistic routing (weighted random split).

**Queue controls:** Finite capacity with overflow destination, balking probability (entities that never join), patience-based reneging.

---

## Probability Distributions

Ten distribution types for arrivals, service times, and patience: Exponential, Uniform, Normal, Triangular, Fixed (deterministic), Erlang, Empirical (values imported from CSV), Piecewise time-varying (different distributions at different clock times), Schedule (planned arrival times with per-entity attribute overrides — see *Schedules* below), and Entity/Server attribute-driven (sampling from an entity or server's own attribute value).

All sampling uses a seeded PRNG — identical seeds produce identical results, enabling fully reproducible experiments.

---

## Schedules

Where a statistical distribution models a variable arrival pattern, a **Schedule** defines a planned set of arrivals at specific times — closer to how real timetables, appointment systems, or production plans work. A model can hold multiple named schedules (a normal day, a peak day, a stress test) and you select which one to use at run time, making it straightforward to test how the same system copes with different demand patterns without changing the model itself.

---

## Resources & Shift Scheduling

Resources have configurable capacity. Capacity can follow a **shift schedule** — a time-varying plan that adds or removes server instances at specified clock times, making it straightforward to model day/night shifts or staffing changes.

Servers can be configured with **failure distributions** (MTBF, MTTR, failureScope) to simulate equipment breakdowns and repair cycles. Per-unit failures (default) are independent; pool scope models shared-infrastructure outages.

---

## Run, Experiment, and Study

**A Run** executes a single replication. Use it to validate that your model behaves correctly — watch entities on the live canvas, inspect the step log, check intermediate state.

**An Experiment** runs multiple replications across one or more parameter values, pooling results with confidence intervals and testing whether observed differences are statistically significant. Vary server capacity, arrival rate, service time, or any other parameter across a range and see how the system responds.

**Studies** let you compose and compare multiple experiment configurations — building a structured body of evidence for a decision.

---

## Statistical Output

- **Per-queue:** mean length, mean wait, max length, throughput, renege count, confidence intervals
- **Per-resource:** mean utilisation, busy count, failure statistics
- **Per-entity-class:** mean time-in-system, wait and service time histograms
- **Experiment-level:** one-way ANOVA to test whether scenario differences are statistically significant; Tukey HSD post-hoc comparisons to identify which specific pairs differ
- **Cost tracking:** cumulative model-wide cost and per-entity cost via the COST macro

---

## Simulation Assistant & Reporting

The **Simulation Assistant** answers plain-language questions about your model and results — *"Where is the bottleneck?"*, *"What would happen with one more server?"* — with answers grounded directly in the simulation output.

The **Report generator** produces four variants: Senior Management or Technical depth × HTML or Markdown format, covering KPIs, bottleneck identification, queue analysis, and scenario recommendations.

---

## Real-Time Data Integration

Models can connect to live external data sources via the adapter layer. A REST adapter polls an endpoint on a configurable interval, updating arrival rates or service parameters dynamically during a run. Custom adapters can be registered without modifying the engine.
