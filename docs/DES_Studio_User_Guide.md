# DES Studio — User Guide

**Version:** 7.0.0  
**Date:** 2026-06-01  
**Sprint baseline:** Sprint 79  
**Audience:** Simulation practitioners, operations analysts, engineering students

---

## Contents

1. [Introduction](#1-introduction)
2. [Prerequisites](#2-prerequisites)
3. [Quick Start](#3-quick-start)
4. [Common Workflows](#4-common-workflows)
   - 4.1 [Build a model from scratch](#41-build-a-model-from-scratch)
   - 4.2 [Generate a model with AI](#42-generate-a-model-with-ai)
   - 4.3 [Run an experiment and read results](#43-run-an-experiment-and-read-results)
   - 4.4 [Compare scenarios with a parametric sweep](#44-compare-scenarios-with-a-parametric-sweep)
   - 4.5 [Share results with stakeholders](#45-share-results-with-stakeholders)
   - 4.6 [Additional features](#46-additional-features)
5. [Troubleshooting](#5-troubleshooting)
6. [Glossary](#6-glossary)

---

## 1. Introduction

DES Studio is a browser-based discrete-event simulation (DES) platform. It lets you build queue-based models, run experiments, and analyse results — without writing code. Everything runs in your browser: there is nothing to install and no server needed for computation.

**The problem it solves.** When demand temporarily exceeds capacity — patients waiting for a doctor, trains waiting for a platform, calls holding for an agent — the resulting delay is often counterintuitive. A resource that is 90% utilised typically produces waits nine times longer than one at 50%. Running a real-world experiment is costly or impossible, so organisations need to test changes on a model first. DES Studio makes that model fast to build and statistically rigorous to run.

**Who it is for.** DES Studio targets:

- **Operations analysts** who need evidence for staffing, capacity, or process-redesign decisions.
- **Engineering students** who are learning DES and want to see theory come alive.
- **Consultants and decision-makers** who need to view, share, or present simulation results without building models themselves.

**What you can do with it:**

| Task | How |
|------|-----|
| Define entities, queues, and service logic | Structured editors (Forms/Tabs), Visual Designer, or AI Generator |
| Encode business rules and routing | Predicate Builder (no code, no free-text logic) |
| Run multiple replications and get confidence intervals | One-click experiment runner |
| Debug live simulation state | Execute canvas with entity animation and step-by-step event log |
| Analyse results | Charts, bottleneck analysis, Welch warm-up test, paired-t confidence intervals with Bonferroni correction |
| Share results | Public link, QR code, embeddable dashboard |

### 1.1 The Three-Phase Method — a brief primer

DES Studio implements Pidd's Three-Phase algorithm. Understanding these three phases helps you build better models.

| Phase | What happens |
|-------|-------------|
| **A — Clock advance** | The simulation clock jumps to the time of the next scheduled event. Nothing happens between events. |
| **B — Bound events** | All events scheduled for this moment fire: arrivals, service completions, machine failures. B-Events are *time-triggered*. |
| **C — Conditional events** | The engine scans C-Events by priority to find anything that *can* now happen given the current state — for example, "patient waiting AND doctor free → start consultation." When one C-Event fires, the scan restarts from the top. C-Events are *state-triggered*. |

B-Events handle "what happens when" and C-Events handle "what can happen now." This separation keeps the engine's behaviour predictable and theoretically grounded.

---

## 2. Prerequisites

### 2.1 Environment

| Requirement | Detail |
|-------------|--------|
| **Browser** | Chrome 120+, Firefox 121+, Edge 120+, or Safari 17+ |
| **JavaScript** | Must be enabled (it is by default in all modern browsers) |
| **Network** | Stable connection required for login, model save, and AI features |
| **Screen** | Minimum 1024 × 768 px; 1440 × 900 px recommended for the Visual Designer |

DES Studio runs entirely in your browser. No local installation is required.

### 2.2 Account

Sign up at the DES Studio URL provided by your organisation. You need:

- A valid email address
- A password (set during sign-up, or via a magic link if your organisation uses that flow)

Anonymous use (models saved to browser storage only, no cloud sync) is available but not recommended for production work.

### 2.3 Environment variables (self-hosted deployments only)

If you are running your own instance, create a `.env.local` file in the project root:

```
VITE_SUPABASE_URL=https://[your-project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]
VITE_ENGINE_VERSION=7.0.0
```

Obtain these values from your Supabase project dashboard.

---

## 3. Quick Start

### Step 1 — Log in

Open DES Studio in your browser. Enter your email and password. You land on the **Model Library** — your personal list of saved models.

### Step 2 — Open a template

Click **Browse Templates** (top-right of the Model Library). Select **Single Queue — M/M/1** and click **Open a copy**. This loads a complete, runnable model with one entity type, one queue, one B-Event (arrivals), and one C-Event (service). You will use this as a learning scaffold.

### Step 3 — Run the model

Click the **Run** tab at the top of the model editor. Verify the settings (1 replication, 1000 simulated time units, no warm-up). Click **Run**. The Execute canvas shows entities flowing through the system. The Bottom Panel shows a live event log.

### Step 4 — Read the results

When the run completes, the Results tab opens automatically. Key things to look at:

- **Summary cards** — total entities served, average wait time, resource utilisation.
- **Bottleneck section** — which queue had the longest wait.
- **Charts** — queue depth over time, wait-time histogram.

### Step 5 — Change one parameter and re-run

Go back to the **Design** tab. In the **B-Events** editor, find the arrival B-Event and change the inter-arrival time distribution mean from `10` to `8` (faster arrivals). Click **Save**. Go to **Run** and click **Run** again. Compare the new results with the previous run using **Run History → Compare**.

You have now completed the core DES Studio loop: build → run → analyse → adjust → re-run.

---

## 4. Common Workflows

### 4.1 Build a model from scratch

**When to use this.** You know your system well enough to define it element by element.

1. From the Model Library, click **New Model**.
2. Give the model a name and description. Click **Create**.
3. Open the **Design** tab. Work through the editor tabs in order:

   | Tab | What to do |
   |-----|-----------|
   | **Entity Types** | Add one entity type per distinct object class (e.g. "Customer", "Train"). Set attribute names, types (`number / string / boolean`), and default values. |
   | **Queues** | Add a queue for each waiting point. Set discipline (FIFO, LIFO, PRIORITY, SPT, EDD). Set capacity if finite. |
   | **B-Events** | Add arrival events (with a distribution) and service-completion events. Use the distribution picker to choose Exponential, Uniform, Triangular, Fixed, Erlang, Empirical, or other supported types. |
   | **C-Events** | Define the conditions under which service starts: entity waiting AND server idle. Use the Predicate Builder — a point-and-click condition builder that prevents type mismatches. |
   | **Schedules** | Create named timetables for time-varying arrival rates. Import rows from CSV or Excel and link timetables to B-Events. |
   | **Model Data** | Add counters you want to track (e.g. total cost, total reneges). Also set the time unit, real-world epoch, and any external data sources. |

   Goals (service-level targets, e.g. "95% of customers wait less than 5 minutes") are set on the **Overview** tab. Results will show green/red against these goals.

4. Watch the **Model Health** panel (bottom of the editor). It runs 38 validation rules continuously and flags errors before you attempt a run. Fix all blocking errors (red) before running; warnings (amber) let you proceed with a caution banner.
5. Click **Save**.

**Tips:**
- Use descriptive names for entity types (e.g. "Patient" not "Entity1").
- If you use a PRIORITY queue discipline, the entity type needs a `priority` attribute of type `number`.
- B-Events set *when* things happen. C-Events set *what can happen given the current state*. If nothing is happening during a run, check your C-Event conditions.

### 4.2 Generate a model with AI

**When to use this.** You have a scenario in mind but do not want to configure every element manually.

1. Open a new model or an existing one. Click the **Design** tab, then select the **Describe** sub-tab.
2. In the AI Generator panel, type a plain-English description of your system. Be specific:

   > "A hospital emergency department with two triage nurses and four doctors. Patients arrive on average every 8 minutes. Triage takes 3–7 minutes; consultation takes 10–25 minutes. High-priority patients are seen before low-priority ones. The target is that 90% of patients are seen within 30 minutes."

3. Click **Generate**. The AI creates a complete `model_json`: entity types, queues, B-Events, C-Events, distributions, and performance goals.
4. Review the generated model in **Forms/Tabs** or the **Visual Designer**. Check:
   - Entity types match your description.
   - Queue disciplines are correct (PRIORITY if you described priority patients).
   - Distribution means are realistic.
5. Click **Apply** to save the generated model. Refine individual elements in the editor.

**Tips:**
- If the result is missing something, use the feedback loop: type what is wrong in the AI panel and click **Refine**. The AI patches the model rather than regenerating from scratch.
- Generated models pass through the same 38 validation rules as manually built ones. Fix any errors shown in Model Health before running.

### 4.3 Run an experiment and read results

**When to use this.** You have a valid model and want statistical results.

1. Click the **Run** tab.
2. Configure the experiment:

   | Setting | Guidance |
   |---------|---------|
   | **Replications** | Use 10–30 for initial exploration, 100+ for published results. More replications = narrower confidence intervals. |
   | **Warm-up period** | Set to approximately the time the system takes to reach steady state (check the Results → Analysis → Welch plot after a first run). 0 is fine for terminating simulations. |
   | **Max sim time** | Set to the time horizon of interest (e.g. one working day = 480 minutes). |
   | **Termination condition** | Leave blank for time-based termination, or enter a condition (e.g. `total_served >= 1000`). |
   | **Seed** | Leave blank for a random seed, or enter a number for reproducible results. |
   | **Schedule** | If the model has multiple timetables (e.g. Weekday, Weekend), select which one to use. |

3. Click **Run**. The Execute canvas animates entity flow in real time. The event log in the Bottom Panel records every event.
4. When the run completes, the Results tab shows:

   | Section | What it tells you |
   |---------|------------------|
   | **Summary** | Entities arriving, served, and reneged. Average wait, service time, and utilisation. Goal pass/fail. |
   | **Bottlenecks** | Which queues have the longest average waits. Peak queue depth. |
   | **Analysis** | Confidence intervals, Welch warm-up diagnostic, replication-level variance. |
   | **Run Effort** | Replications completed, total sim time, wall-clock duration. |

5. Use the **Explain** button to ask the Model Assistant (AI) to narrate the results, identify improvement opportunities, or answer specific questions.

### 4.4 Compare scenarios with a parametric sweep

**When to use this.** You want to know how a KPI changes as you vary one or two parameters (e.g. "How does average wait change as I add servers from 1 to 5?").

1. Go to the **Run** tab. Click **Parametric Sweep**.
2. Choose **1D Sweep** (one parameter) or **2D Sweep** (two parameters simultaneously).
3. For each parameter:
   - Select the element (e.g. a B-Event, a queue, a state variable).
   - Select the field (e.g. `mean` of the inter-arrival distribution).
   - Set the range (min, max, step).
4. Click **Run Sweep**. The engine runs the full replication set for each parameter combination.
5. Results appear as a line chart (1D) or heat map (2D). Each point shows the mean KPI ± 95% CI.
6. Use **Goal Feasibility** to draw the target threshold on the chart and find the minimum parameter value that meets the goal.

### 4.5 Share results with stakeholders

**When to use this.** You need to present or hand off results to someone who will not run the model themselves.

1. Go to **Run History** and open the run you want to share.
2. Click **Create Report**. Choose:
   - **Senior Management** — plain-English narrative, High/Medium/Low confidence language, goal pass/fail summary.
   - **Technical** — full statistical tables, CI values, replication detail.
   - **Format:** HTML (styled, opens in browser) or Markdown (portable, version-controllable).
3. Click **Generate**. The AI writes the narrative sections based on the actual results payload. Download the file or copy the Markdown.
4. Alternatively, click **Share**:
   - **Public link** — anyone with the URL can view the results dashboard (read-only, no login required).
   - **QR code** — present in a meeting; attendees scan to open the live results on their phones.
   - **Embed widget** — paste an `<iframe>` snippet into an internal wiki or dashboard.

### 4.6 Additional features

**Voice input.** The AI chat dialogs — Help Assistant, Model Assistant, and AI Diagnostics — each include a microphone button. Clicking it activates the browser's Speech Recognition API so you can dictate questions or describe changes verbally instead of typing.

**Explore panel.** After a batch run completes, a ✦ Explore button appears in the model header. Clicking it opens an AI panel that analyses the results for bottlenecks, quick wins, and investment opportunities. Each suggestion has an **Apply ↗** button that proposes the change to the model with a before/after diff so you can review it before committing.

**Schedule Manager.** The **Schedules** sub-tab under the Design section lets you create named timetables for time-varying arrival patterns. You can import arrival rows from CSV or Excel files (including multi-event imports) and link timetables to B-Events.

**Run tier limits.** The number of replications available per run depends on your account tier: Free accounts can run up to 10 replications; Standard accounts up to 30; Pro accounts up to 100.

**Per-outcome results.** The Results tab shows a Journey Outcomes section that breaks down completed entities by route (COMPLETE, RENEGE, and other terminal outcomes), with average wait time and average time in system reported separately per route.

---

## 5. Troubleshooting

### 5.1 "Model Health shows errors and the Run button is disabled"

**Cause.** One or more of the 38 pre-run validation rules has found a blocking error. Common examples:

| Error code | Meaning | Fix |
|-----------|---------|-----|
| V1 | Two entity types have the same name | Rename one entity type |
| V3 | An attribute's default value does not match its declared type | Change `defaultValue` or `valueType` to agree |
| V4 | A PRIORITY queue has no entity with a `priority` attribute | Add a `number`-type attribute called `priority` to the entity type using that queue |
| V37 | A resource has `MTBF` set but not `MTTR` (or vice versa) | Set both `MTBF` and `MTTR`, or remove both |
| V38 | A B-Event fires `RELEASE(Server)` immediately before `COMPLETE()` — the `COMPLETE` is silently skipped | Reorder: `COMPLETE()` should come before `RELEASE()` |

Click any error in the Model Health panel to jump directly to the relevant editor tab.

### 5.2 "Entities are entering the queue but never being served"

**Cause.** The C-Event condition that triggers service is always false, or the C-Event has a lower priority than another C-Event that also cannot fire. The Three-Phase C-scan keeps restarting on the highest-priority event and never reaches the service event.

**Diagnosis steps:**

1. Go to the Execute canvas. Click on a stuck entity in the entity table. The **Entity Inspector** panel shows its current state (queue, attributes, last transition time).
2. Go to the **Step Log** (Bottom Panel → Log tab). Look for the C-Event you expect to fire. If it never appears, the condition is never true.
3. Open the **C-Events** editor. Read the condition in the Predicate Builder. Common mistakes:
   - The queue name in the condition does not match the queue where entities are actually waiting.
   - The resource status check uses the wrong resource name.
   - The condition combines `AND` clauses that are mutually exclusive.

**Fix.** Correct the predicate in the Predicate Builder. During a stepped run, the **Entity Inspector** panel shows each entity's current attributes and queue position, which helps you verify whether the condition should be firing for a specific entity.

### 5.3 "The AI model generator produced a model that doesn't match my description"

**Cause.** AI generation is probabilistic. Complex or ambiguous descriptions produce less accurate results. Long descriptions with many simultaneous constraints are harder to satisfy.

**Fix steps:**

1. Use the **Refine** input in the AI panel to describe what is wrong specifically:
   > "The generated model has only one queue. I need two queues: one for triage and one for consultation."
2. If the result is still incorrect, switch to Forms/Tabs and fix the elements manually. The AI-generated skeleton is usually a good starting point even if imperfect.
3. For complex models, describe one subsystem at a time rather than the entire scenario in one prompt.

**Additional common issues:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Run completes instantly with zero entities served | Max sim time is too short, or arrival B-Event has no distribution set | Increase max sim time; verify B-Event has a distribution |
| Phase C truncation warning appears | C-Event conditions are cycling (firing repeatedly) > 500 times per clock tick | Add a guard condition or simplify the C-Event predicate |
| Report generation is blank | Results payload is very large; LLM timeout | Reduce replication count; try Markdown format instead of HTML |
| "Supabase auth failed" on load | `.env.local` credentials missing or expired | Regenerate the anon key in Supabase Dashboard and update `.env.local` |

---

## 6. Glossary

| Term | Definition |
|------|-----------|
| **B-Event** | A *bound* event: scheduled to fire at a specific time (e.g. an arrival, a service completion). Defined in the B-Events editor. |
| **C-Event** | A *conditional* event: fires when a state condition is true (e.g. "entity waiting AND server idle"). Defined in the C-Events editor using the Predicate Builder. |
| **Confidence interval (CI)** | A between-replication t-confidence interval: the engine computes one mean per replication, then applies Student's t across those replication-level means. Narrower CIs → more reliable results (use more replications). For two-scenario comparison the UI uses paired-t confidence intervals with Bonferroni correction. (Note: `tukeyHSD()` and `oneWayANOVA()` are implemented in the engine but not yet exposed in the UI.) |
| **Entity** | An object that flows through the model: a customer, patient, train, job. |
| **Future Event List (FEL)** | The engine's internal queue of scheduled B-Events, ordered by time. |
| **Macro** | A named effect instruction applied to entities or resources. The full set of 19 supported macros is: `ARRIVE`, `ASSIGN`, `BATCH`, `COMPLETE`, `COSEIZE`, `COST`, `DRAIN`, `FAIL`, `FILL`, `MATCH`, `PREEMPT`, `RELEASE`, `RENEGE`, `RENEGE_OLDEST`, `REPAIR`, `SET`, `SET_ATTR`, `SPLIT`, `UNBATCH`. |
| **MTBF / MTTR** | Mean time between failures / mean time to repair. Used for resource failure modelling. |
| **Predicate Builder** | The point-and-click condition editor for C-Events. Prevents type mismatches; no free-text logic. |
| **Replication** | One independent run of the simulation from start to finish with a unique random seed. |
| **Resource** | A capacity-limited service provider (server, machine, nurse, lane). |
| **Seed** | The starting value for the pseudo-random number generator. The same seed always produces the same sequence of random samples (reproducibility). |
| **Warm-up period** | The initial phase of a run during which the system is reaching steady state. Statistics collected during warm-up are discarded. |
