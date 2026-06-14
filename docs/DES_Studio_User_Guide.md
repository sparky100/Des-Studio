# simmodlr — User Guide

**Version:** 7.4.0  
**Date:** 2026-06-11  
**Sprint baseline:** Sprint 85  
**Audience:** Simulation practitioners, operations analysts, engineering students

---

## Contents

1. [Introduction](#1-introduction)
2. [Prerequisites](#2-prerequisites)
3. [Quick Start](#3-quick-start)
4. [Common Workflows](#4-common-workflows)
   - 4.0 [Browse and filter the library](#40-browse-and-filter-the-library)
   - 4.1 [Build a model from scratch](#41-build-a-model-from-scratch)
   - 4.2 [Generate a model with AI](#42-generate-a-model-with-ai)
   - 4.3 [Run an experiment and read results](#43-run-an-experiment-and-read-results)
   - 4.4 [Compare scenarios with a parametric sweep](#44-compare-scenarios-with-a-parametric-sweep)
   - 4.5 [Share results with stakeholders](#45-share-results-with-stakeholders)
   - 4.6 [Additional features](#46-additional-features)
   - 4.7 [Export results for external analysis](#47-export-results-for-external-analysis)
5. [Troubleshooting](#5-troubleshooting)
6. [Glossary](#6-glossary)

---

## 1. Introduction

simmodlr is a browser-based discrete-event simulation (DES) platform. It lets you build queue-based models, run experiments, and analyse results — without writing code. Everything runs in your browser: there is nothing to install and no server needed for computation.

**The problem it solves.** When demand temporarily exceeds capacity — patients waiting for a doctor, trains waiting for a platform, calls holding for an agent — the resulting delay is often counterintuitive. A resource that is 90% utilised typically produces waits nine times longer than one at 50%. Running a real-world experiment is costly or impossible, so organisations need to test changes on a model first. simmodlr makes that model fast to build and statistically rigorous to run.

**Who it is for.** simmodlr targets:

- **Operations analysts** who need evidence for staffing, capacity, or process-redesign decisions.
- **Engineering students** who are learning DES and want to see theory come alive.
- **Consultants and decision-makers** who need to view, share, or present simulation results without building models themselves.

**What you can do with it:**

| Task | How |
|------|-----|
| Define entities, queues, and service logic | **Define** editors, **Draw** (Visual Designer), or **Describe** (AI Generator) |
| Encode business rules and routing | Predicate Builder (no code, no free-text logic) |
| Run multiple replications and get confidence intervals | One-click experiment runner |
| Debug live simulation state | Execute canvas with entity animation and step-by-step event log |
| Analyse results | Charts, bottleneck analysis, Welch warm-up test, paired-t confidence intervals with Bonferroni correction |
| Share results | Public link, QR code, embeddable dashboard |
| Export model as Python code | **⬇ SimPy** button in the header, or **Access → Export SimPy** — downloads a runnable `.py` file |

### 1.1 The Three-Phase Method — a brief primer

simmodlr implements Pidd's Three-Phase algorithm. Understanding these three phases helps you build better models.

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

simmodlr runs entirely in your browser. No local installation is required.

### 2.2 Account

Sign up at the simmodlr URL provided by your organisation. You need:

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

### Step 1 — Log in and choose how to start

Open simmodlr in your browser. Enter your email and password. After signing in, a **Welcome dialog** appears asking how you would like to get started. It presents four options:

| Option | What happens |
|--------|-------------|
| **Create a Model** | Opens the New Model dialog where you choose to describe, draw, or define your model. |
| **Access the Model Library** | Closes the dialog and opens your model library so you can browse your own models, public models, and templates. |
| **Build with AI Tools** | Downloads the **simmodlr AI Prompt Pack** — the full schema spec with a ready-to-paste prompt you can give to any external AI assistant (Claude, ChatGPT, etc.) to generate a model JSON file, then import it back. |
| **Get Help** | Opens the AI Help Assistant for a guided introduction to simmodlr. |

Click **Skip for now** (or press **Escape**) to go straight to your Model Library.

> **Note:** This dialog appears once each time you sign in. It does not reappear if you refresh the page.

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

Go back to the **Design** tab. Click **Define**, then select **B-Events**. Find the arrival B-Event and change the inter-arrival time distribution mean from `10` to `8` (faster arrivals). Click **Save**. Go to **Run** and click **Run** again. Compare the new results with the previous run using **Run History → Compare**.

You have now completed the core simmodlr loop: build → run → analyse → adjust → re-run.

---

## 4. Common Workflows

### 4.0 Download the AI Prompt Pack

**When to use this.** You want to use an external AI assistant (Claude, ChatGPT, Gemini, etc.) to help you design a model, then import the result into simmodlr.

Click **↓ AI Prompt Pack** in the top-right of the Model Library header (next to **+ New Model**). This downloads `simmodlr-ai-prompt-pack.md` — a Markdown file containing:

1. **How to use it** — step-by-step instructions for pasting into an AI assistant.
2. **A starter prompt** — copy and fill in `[YOUR SYSTEM DESCRIPTION]`.
3. **The full schema reference** — the authoritative simmodlr model JSON spec used internally by the AI Generator.

Once the AI produces a JSON response, save it as a `.json` file and import it via **+ New Model → Import a file**.

> **Tip:** The same Prompt Pack is available from the Welcome dialog under **Build with AI Tools** when you first sign in.

### 4.1 Browse and filter the library

**When to use this.** Your model list has grown and you need to locate a specific model, compare a set of related models, or discover models shared publicly by other users.

The Model Library has four tabs — **My Models**, **Templates**, **Public Library**, and **Community**. The My Models, Public Library, and Community tabs each include a toolbar above the grid with the following controls:

| Control | What it does |
|---------|-------------|
| **Search bar** | Filters by name and description as you type. Press ✕ to clear. |
| **Sort dropdown** | Orders results by Last modified (default), Name A→Z, Most runs, or Version. |
| **Tag chips** | Appear when any model in the current tab has tags. Click a chip to show only models with that tag; click again to deselect. Multiple chips use OR logic — models matching *any* selected tag are shown. Click **Clear tags** to reset. |

**Clicking a tag chip on a model card** also activates that tag as a filter, so you can drill in from any card without opening a separate filter panel.

**No results after filtering?** A "No models match your filters" message appears with a **Clear filters** button that resets search and tags in one click.

**Adding tags to your models.** Tags are set in the model's settings panel inside the model editor. Give models descriptive tags (e.g. `healthcare`, `queueing`, `high-priority`) to make them easy to find later.

### 4.2 Build a model from scratch

**When to use this.** You know your system well enough to define it element by element.

1. From the Model Library, click **New Model**.
2. Give the model a name and description. Click **Create**.
3. Open the **Design** tab. The Design toolbar has four buttons:

   | Button | What it does |
   |--------|-------------|
   | **Draw** | Opens the canvas-based Visual Designer. Build and rearrange your model graphically. |
   | **Describe** | Opens the AI Generator. Describe your system in plain English and let the AI create a first draft. |
   | **Define** | Opens the structured editors. A second bar appears below with six sub-sections — work through them in order: |
   | **Model Health** | Appears when there are validation issues. Shows errors (red, must fix) and warnings (amber, proceed with caution). |

   When **Define** is active, select each sub-section in the bar below it:

   | Define sub-section | What to do |
   |--------------------|-----------|
   | **Entity Types** | Add one entity type per distinct object class (e.g. "Customer", "Train"). Set attribute names, types (`number / string / boolean`), and default values. |
   | **Queues** | Add a queue for each waiting point. Set discipline (FIFO, LIFO, PRIORITY, SPT, EDD). Set capacity if finite. |
   | **B-Events** | Add arrival events (with a distribution) and service-completion events. Use the distribution picker to choose Exponential, Uniform, Triangular, Fixed, Erlang, Empirical, or other supported types. |
   | **C-Events** | Define the conditions under which service starts: entity waiting AND server idle. Use the Predicate Builder — a point-and-click condition builder that prevents type mismatches. |
   | **Schedules** | Create named timetables for time-varying arrival rates. Import rows from CSV or Excel and link timetables to B-Events. |
   | **Model Data** | Add counters you want to track (e.g. total cost, total reneges). Also set the time unit, real-world epoch, and any external data sources. |

   Goals (service-level targets, e.g. "95% of customers wait less than 5 minutes") are set on the **Overview** tab. Results will show green/red against these goals.

4. The **Model Health** button in the Design toolbar lights up whenever there are validation issues. Click it to see all 38 validation rules and fix any blocking errors (red) before running; warnings (amber) let you proceed with a caution banner.
5. Click **Save**.

**Tips:**
- Use descriptive names for entity types (e.g. "Patient" not "Entity1").
- If you use a PRIORITY queue discipline, the entity type needs a `priority` attribute of type `number`.
- B-Events set *when* things happen. C-Events set *what can happen given the current state*. If nothing is happening during a run, check your C-Event conditions.

**Visual Designer.** Click **Draw** in the Design toolbar to open the canvas-based Visual Designer and build or rearrange the same model graphically. Use **Pan** mode to move around the diagram. Use **Select** mode, or Shift/Ctrl-click with a mouse, to select more than one node. Once nodes are selected, the toolbar above the canvas shows how many are selected and lets you clear the selection or delete the selected nodes together. Dragging a selected group moves the whole group and saves the updated layout with the model.

### 4.3 Generate a model with AI

**When to use this.** You have a scenario in mind but do not want to configure every element manually.

1. Open a new model or an existing one. Click the **Design** tab, then click **Describe**.
2. In the AI Generator panel, type a plain-English description of your system. Be specific:

   > "A hospital emergency department with two triage nurses and four doctors. Patients arrive on average every 8 minutes. Triage takes 3–7 minutes; consultation takes 10–25 minutes. High-priority patients are seen before low-priority ones. The target is that 90% of patients are seen within 30 minutes."

3. Click **Generate**. The AI creates a complete `model_json`: entity types, queues, B-Events, C-Events, distributions, and performance goals.
4. Review the generated model using **Define** (structured editors) or **Draw** (Visual Designer). Check:
   - Entity types match your description.
   - Queue disciplines are correct (PRIORITY if you described priority patients).
   - Distribution means are realistic.
5. Click **Apply** to save the generated model. Refine individual elements in the editor.

**Tips:**
- If the result is missing something, use the feedback loop: type what is wrong in the AI panel and click **Refine**. The AI patches the model rather than regenerating from scratch.
- Generated models pass through the same 38 validation rules as manually built ones. Fix any errors shown in Model Health before running.

### 4.4 Run an experiment and read results

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
   | **Purge period** | Optional run-down time after the simulation clock reaches Max sim time. New arrivals stop but the system continues until all queues drain. Useful for end-of-day or shift-end scenarios — set to the longest expected remaining service time. |

3. Click **Run**. The Execute canvas animates entity flow in real time. The event log in the Bottom Panel records every event.
4. When the run completes, the Results tab shows:

   | Section | What it tells you |
   |---------|------------------|
   | **Summary** | Entities arriving, served, and reneged. Average wait, service time, and utilisation. Goal pass/fail. |
   | **Bottlenecks** | Which queues have the longest average waits. Peak queue depth. |
   | **Analysis** | Confidence intervals, Welch warm-up diagnostic, replication-level variance. |
   | **Starvation** | Per-resource time and percentage spent starved — server idle because its queue was empty, not because it was recently freed. High starvation means the server is capacity-constrained on the supply side; consider whether upstream stages need balancing. |
   | **Run Effort** | Replications completed, total sim time, wall-clock duration. |

5. Open the **✦ AI** sidebar (Model Assistant) to explore the results:

**How wait time is calculated.** The average wait time includes all entities that spent time in a queue: served entities, reneged entities (those that left the queue before service), and in-progress entities still waiting when the simulation ends. In-progress partial waits are half-weighted (standard DES practice). A separate Little's Law estimate (`L_q / arrival rate`) is computed from the time-averaged queue length and checked against the per-entity average; when the two estimates disagree by more than 5%, the run may be too short for reliable wait-time estimates.

6. Open the **✦ AI** sidebar (Model Assistant) to explore the results:
   - Click **Analyse** for a plain-English narrative of the results with structured improvement suggestions.
   - Click **Compare** to compare against a saved historical run.
   - Use the text input to ask specific questions about the results (e.g. "Which queue had the longest wait?").

### 4.5 Compare scenarios with a parametric sweep

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

### 4.6 Share results with stakeholders

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

### 4.7 Additional features

**Voice input.** The AI chat dialogs — Help Assistant, Model Assistant, and AI Diagnostics — each include a microphone button. Clicking it activates the browser's Speech Recognition API so you can dictate questions or describe changes verbally instead of typing.

**Explore panel.** After a batch run completes, a ✦ Explore button appears in the model header. Clicking it opens an AI panel that analyses the results for bottlenecks, quick wins, and investment opportunities. Each suggestion has an **Apply ↗** button that proposes the change to the model with a before/after diff so you can review it before committing.

**Schedule Manager.** The **Schedules** sub-tab under the Design section lets you create named timetables for time-varying arrival patterns. You can import arrival rows from CSV or Excel files (including multi-event imports) and link timetables to B-Events.

**Run tier limits.** The number of replications available per run depends on your account tier: Free accounts can run up to 10 replications; Standard accounts up to 30; Pro accounts up to 100.

**Per-outcome results.** The Results tab shows a Journey Outcomes section that breaks down completed entities by route (COMPLETE, RENEGE, and other terminal outcomes), with average wait time and average time in system reported separately per route.

**Export and run SimPy Python.** Click **⬇ SimPy** in the model header bar (or go to the **Access** tab and click **Export SimPy**) to open the SimPy dialog.

A dialog shows whether the script is **Category 1** (complete) or **Category 2** (partial). For Category 1 models you have two options:

- **Run in Browser** — executes the SimPy script directly in your browser tab via Pyodide (Python compiled to WebAssembly). No Python installation required. A progress bar tracks each replication; when all replications finish the results are loaded into the app and available in the Results workspace alongside any JS-engine runs. The first run downloads Pyodide (~25 MB, cached afterwards); subsequent runs start immediately. Browser runs are saved to your run history with the label `SimPy  DD/MM/YYYY HH:mm` and appear in the history dropdown on the Execute tab. The Results workspace shows enriched KPI cards for SimPy runs: Arrived, Served, Completion Rate, average wait, wait percentiles, average service time, average sojourn, and per-resource utilisation.
- **Download .py** — saves the script as `<model-name>_simpy.py` to run locally with `python your_model_simpy.py` after `pip install simpy`.

Category 2 scripts contain macros that need manual completion. The **Run in Browser** button is disabled for Category 2 models — download the script and complete the `# TODO` sections first.

The browser-run results include enriched metrics not shown in the downloaded script's text output: wait-time percentiles (P50/P90/P99), mean service time, and per-resource utilisation — the same fields shown by the JS engine results workspace.

See the full help guide at `docs/user/simpy-export.md`.

**Shift-change behavior.** When a server's shift schedule reduces capacity mid-simulation, you can choose how in-progress service is handled. In the Entity Types editor, each server with a shift schedule has a **Shift change** setting:

| Mode | Behaviour |
|------|-----------|
| **Delay** (default) | Capacity reduction takes effect once current service finishes naturally. |
| **Preempt** | In-progress service is interrupted immediately; the entity re-queues with its remaining service time. |
| **Suspend** | In-progress service is paused and resumes when capacity is next available. |

**Sections (large-model organisation).** When a model grows beyond roughly ten queues or twenty events, you can group elements into named *sections* to keep the editors manageable. Open the **Sections** tab (under the Design area) and click **+ Add Section** to create a named, coloured group. Assign queues, entity types, B-events, and C-events to the section using the member checkboxes. For queues that act as handoff points between sections, mark them **IN** (entities arrive from another section) or **OUT** (entities leave to another section).

Once sections are defined:
- Every table editor (Entity Types, Queues, B-Events, C-Events) shows a coloured filter tab strip — click a section name to see only its elements.
- The Visual Designer shows a small coloured dot on each node that belongs to a section.
- Sections are pure metadata: the simulation engine is unchanged and all elements remain part of the same flat model.

### 4.8 Export results for external analysis

**When to use this.** You want to analyse results in an external tool — paste into an LLM (Claude, ChatGPT, Gemini), load into a Python notebook, consume from an R script, or connect from a BI tool.

#### LLM Bundle (.md)

The LLM Bundle is a single Markdown file that gives an LLM everything it needs to answer questions about your model and results, with no additional context required.

**Contents of the bundle:**

| Section | What it contains |
|---------|-----------------|
| Preamble | Plain-English description of the Three-Phase DES method and how to read the results |
| Model definition | Entity types and attributes, queues and disciplines, B-Event and C-Event logic, performance goals |
| Experiment configuration | Replications, warm-up period, max sim time, seed, schedule |
| Headline KPIs | Average wait, average service time, average sojourn, throughput, renege rate |
| Per-queue wait table | mean, p50, p90, p95, p99 for every queue |
| Per-resource utilisation | Utilisation percentage and busy/idle counts for every server |
| Confidence intervals | 95% CI per KPI (present only for multi-replication runs) |
| Goals pass/fail | Each performance goal with its target, actual value, and PASS/FAIL status |
| Replication summary | Seed, served, reneged, and avgWait per replication (for multi-replication runs) |

**Token estimate:** 1,500–2,500 words (2,000–3,300 tokens) for a fully populated model — fits within any current LLM context window.

**How to download:**

1. Complete a run (single replication or multi-replication).
2. In the Execute panel, click **Export…** in the toolbar.
3. Select **LLM Bundle (.md)** from the menu.
4. A `.md` file downloads to your browser's default download folder.
5. Open your LLM of choice, start a new conversation, and paste the file contents (or upload the file if the LLM supports file upload).
6. Ask any question — for example: *"Which queue has the longest average wait?"* or *"Does this model meet its service-level target?"*

**The bundle is disabled** (greyed out in the Export… menu) until at least one run has been completed for the current model session.

#### Results API (programmatic access)

For Python, R, or BI tool access to saved run results, the Results API provides authenticated REST endpoints.

**Available routes:**

| Route | Returns |
|-------|---------|
| `GET /functions/v1/results-api/runs/:runId` | Full result for one run: metadata + `results_json` payload |
| `GET /functions/v1/results-api/runs?modelId=:modelId` | List of all runs for a model (summary columns only, no `results_json`) |
| `GET /functions/v1/results-api/sweeps/:sweepId` | Full sweep result: config + per-point results array |

**Authentication:** Pass your Supabase JWT as a `Bearer` token in the `Authorization` header. Alternatively, append `?shareToken=<token>` to `GET /runs/:runId` for publicly shared runs (no login required).

**Python quick-start:**

```python
import requests, pandas as pd

headers = {"Authorization": "Bearer YOUR_JWT_TOKEN"}
base = "https://YOUR_PROJECT.supabase.co/functions/v1/results-api"

run = requests.get(f"{base}/runs/RUN_ID", headers=headers).json()
reps = pd.json_normalize(run["results"]["replications"])
print(reps[["replicationIndex", "seed", "summary.avgWait", "summary.served"]])
```

**R quick-start:**

```r
library(jsonlite)
run <- fromJSON(
  "https://YOUR_PROJECT.supabase.co/functions/v1/results-api/runs/RUN_ID",
  headers = c(Authorization = "Bearer YOUR_JWT_TOKEN"),
  simplifyDataFrame = TRUE
)
run$results$replications[, c("replicationIndex", "seed")]
```

**Note on event log availability.** At the default storage level the event log is condensed to a 4-field summary (`logSummary`). Full event-by-event logs are only retained when `resultDetailLevel = "full"` is requested at run time (no UI control exists for this setting in the current release). The API response includes a `_trimmed_fields` array listing any fields that were condensed.

Full API reference: `docs/architecture/results-api-design.md`.

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
| LLM Bundle is missing confidence intervals | The run used only one replication | Run with ≥ 2 replications — the CI section is omitted for single-replication runs because there is no between-replication variance to report |
| LLM Bundle option is greyed out in Export… | No run has been completed in the current session | Complete at least one run, then the option becomes available |

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
| **LLM Bundle** | A structured Markdown document downloaded from the Export… menu that combines model definition, experiment configuration, and full results into a single file. Designed to be pasted into an LLM (Claude, ChatGPT, Gemini) for custom analysis — contains a preamble explaining the Three-Phase DES method so no additional context is needed. |
| **Results API** | A Supabase Edge Function (`/functions/v1/results-api/`) providing authenticated read-only access to saved run and sweep results via HTTP, for use from Python, R, or BI tools. |
| **SimPy export — Category 1** | A generated `.py` script that requires no manual editing and runs as-is after `pip install simpy`, or directly in the browser via the **Run in Browser** button. Produced when all macros in the model have a direct SimPy equivalent. |
| **SimPy export — Category 2** | A generated `.py` script where one or more macros (RENEGE, BATCH, MATCH, FAIL, REPAIR, PREEMPT, or RENEGE_OLDEST) have been replaced with annotated `# TODO` stubs. The script runs without errors but the stub sections must be completed manually before results are meaningful. The Run in Browser button is disabled for Category 2 scripts. |
| **Starvation** | The condition where a server is idle because its input queue is empty — demand is too low to keep the server busy, not because the server is busy with another entity. Reported per-resource in the Results workspace as starvation duration and percentage. High starvation indicates upstream bottlenecks or low arrival rates relative to capacity. |
| **Purge period** | An optional run-down phase after the simulation's Max sim time. New arrivals are stopped but the simulation continues until all queued entities are served (or until a configurable extra time limit). Used to model end-of-day or shift-end drain-down. |
| **Shift-change behavior** | How a server handles in-progress service when its shift schedule reduces capacity: Delay (finish naturally), Preempt (interrupt and re-queue with remaining time), or Suspend (pause and resume). Set per server entity type in the Entity Types editor. |
| **PRNG stream isolation** | Each stochastic process in the simulation (arrivals, service, reneging, MTBF, MTTR) has its own independent pseudo-random stream derived from the base seed. This means changing the distribution of one process does not alter the random sequence of any other process, making scenario comparisons more controlled. |
