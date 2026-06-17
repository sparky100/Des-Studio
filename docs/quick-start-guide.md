# Getting Started with simmodlr

**simmodlr** is a browser-based discrete-event simulation tool. You describe entities (customers, jobs, patients), the queues they wait in, and the events that move them through your system — no code required.

---

## Core Concepts in 60 Seconds

| Term | What it means |
|---|---|
| **Entity** | The "things" moving through your system — a customer, a job, a patient. Each belongs to an *entity class* you define, with whatever attributes you need (priority, type, size). |
| **Queue** | Where entities wait. Disciplines include first-in/first-out, last-in, priority, shortest job first, earliest due date, or any attribute you choose. |
| **B-Event** | A scheduled, time-triggered event. Arrivals and completions are B-Events. |
| **C-Event** | A conditional event that fires whenever its condition becomes true — typically "a server is idle AND the queue is non-empty." |
| **Resource** | A server or piece of equipment that entities seize during processing. |

---

## Four Ways to Build a Model

People work differently. simmodlr supports four authoring approaches, all producing the same model format so you can mix and match:

**1. Forms & Tabs** — Step-by-step structured entry. Define entity types, queues, events, and distributions through dedicated editors. Good for precise control and iterative refinement.

**2. Visual Designer** — Drag-and-drop canvas. Draw your process as a flow diagram; nodes and connections translate directly into the simulation model. Good for communicating structure to stakeholders.

**3. AI Model Builder** — Describe the system in plain language inside simmodlr; the built-in AI generates a first model for you to review, adjust, and run. Good for rapid prototyping from a problem description.

**4. External LLM Import** — simmodlr publishes its full model schema. You can paste that schema into any external AI (ChatGPT, Claude, Gemini, or similar), ask it to build a model, and import the resulting JSON directly. This is particularly powerful when you already have detailed domain knowledge in a document you can share with the AI alongside the schema.

---

## Step 1 — Build Your Model

Regardless of whether you use the Visual Designer, type a description for the AI to interpret, paste the schema into an external LLM, or fill in the forms directly — this is what you are defining:

**Entities** — the things that move through your system. Give each class a name (*Customer*, *Job*, *Patient*) and the attributes it carries: `priority` (number), `type` (string with allowed values), `urgent` (boolean). Attributes can be mutable (changed during processing) or fixed at arrival.

**Queues** — where entities wait. Choose a discipline: FIFO, LIFO, priority-based, shortest job first, earliest due date, or any attribute you define. Optionally set a capacity limit, overflow destination, or balking probability.

**Activities** — where processing happens. Each activity has a resource (a server or machine with a defined capacity), a service time distribution, and the condition that must hold before service can start — *"server is IDLE AND queue length ≥ 1"* — built without writing code using the Predicate Builder.

**Sources and Sinks** — where entities enter and leave. A Source has an arrival distribution (or a Schedule); a Sink records throughput and time-in-system.

**Routing** — how entities move between stages. Fixed next-step, conditional (first-match predicate), or probabilistic (weighted split).

The Visual Designer shows all of this as a flow diagram as you build. Forms & Tabs give you fine-grained control over each element. AI modes generate the structure for you to review. The underlying model is the same either way.

---

## Step 2 — Run

Click **Run** to execute a single replication. Watch entities move through the system on the Execute canvas, inspect the step log, and check entity state mid-run.

Use a single run to verify the model behaves as expected before investing time in a full experiment.

---

## Step 3 — Experiment

Once the model is validated, move to an **Experiment** (or **Study**). Experiments let you test what happens when you vary a parameter — server capacity, inter-arrival rate, batch size — across a defined range. simmodlr runs multiple replications for each parameter value, averages the results with confidence intervals, and surfaces where differences are statistically significant.

This is where simulation earns its value: not one answer, but a map of how the system responds to change.

---

## Step 4 — Read Results and Use the Simulation Assistant

Key outputs per resource and queue:

- **Utilisation** — average fraction of time in use
- **Mean queue length** and **mean wait time**
- **Throughput** — entities served per time unit
- **Renege / abandonment count** — entities that left before being served

The **Simulation Assistant** lets you ask plain-language questions about your results: *"Which queue is the main bottleneck?"*, *"What happens to utilisation if I add a second server?"* Answers are grounded in the actual run data.

Use the **Report** button to generate a formatted summary (Senior Management or Technical depth, HTML or Markdown).
