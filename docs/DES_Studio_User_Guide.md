# simmodlr — User Guide

**Version:** 7.7.0  
**Date:** 2026-06-20  
**Sprint baseline:** Sprint 89  
**Audience:** Simulation practitioners, operations analysts, engineering students

---

## Contents

1. [Introduction](#1-introduction)
2. [Prerequisites](#2-prerequisites)
3. [Quick Start](#3-quick-start)
4. [Common Workflows](#4-common-workflows)
   - 4.0 [Download the AI Prompt Pack](#40-download-the-ai-prompt-pack)
   - 4.1 [Browse and filter the library](#41-browse-and-filter-the-library)
   - 4.2 [Build a model from scratch](#42-build-a-model-from-scratch)
   - 4.3 [Generate a model with AI](#43-generate-a-model-with-ai)
   - 4.4 [Run an experiment and read results](#44-run-an-experiment-and-read-results)
   - 4.5 [Compare scenarios with a parametric sweep](#45-compare-scenarios-with-a-parametric-sweep)
   - 4.6 [Share results with stakeholders](#46-share-results-with-stakeholders)
   - 4.7 [Additional features](#47-additional-features)
   - 4.8 [Export results for external analysis](#48-export-results-for-external-analysis)
   - 4.9 [Share a model directly (Access tab)](#49-share-a-model-directly-access-tab)
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

### Step 1 — Log in

Open simmodlr in your browser. Enter your email and password. On sign-in, the **Welcome** dialog appears with four options to get started. Choose an option or click **Skip for now** to go directly to the **Model Library** — your personal list of saved models.

| Welcome option | What it does |
|----------------|-------------|
| **Create a Model** | Opens the New Model dialog — choose to describe, draw, or define your model |
| **Access the Model Library** | Closes the dialog and shows your saved models |
| **Build with AI Tools** | Downloads the AI Prompt Pack for use with Claude, ChatGPT, or any AI assistant |
| **Get Help** | Opens the AI Help Assistant for a guided tour |

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

**When to use this.** You want to use an external AI assistant (Claude, ChatGPT, etc.) to generate a simmodlr model from a plain-English description.

Click the **↓ AI Prompt Pack** button in the Model Library header (next to **+ New Model**). This downloads `simmodlr-ai-prompt-pack.md` — the complete schema reference bundled with a ready-to-paste prompt.

**Workflow:**

1. Open the downloaded file and copy the starter prompt.
2. Paste it into Claude, ChatGPT, or any AI assistant.
3. Replace `[YOUR SYSTEM DESCRIPTION]` with a plain-English description of the system you want to simulate.
4. The AI returns a JSON block. Save it as a `.json` file.
5. In simmodlr, click **+ New Model → Import a file** and select your file.

The same download is available from the **Welcome** dialog → **Build with AI Tools**.

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
    | **Entity Types** | Add one entity type per distinct object class (e.g. "Customer", "Train"). Set attribute names, types (`number / string / boolean`), and default values. For server entity types you can also set a **Weekly Schedule Pattern** (a 24×7 grid editor for repeating capacity), a **Shift Schedule** (time-based or condition-triggered), and shift-change behavior (Delay / Preempt / Suspend). |
   | **Queues** | Add a queue for each waiting point. Set discipline (FIFO, LIFO, PRIORITY, SPT, EDD). Set capacity if finite. |
   | **B-Events** | Add arrival events (with a distribution) and service-completion events. Use the distribution picker to choose Exponential, Uniform, Triangular, Fixed, Erlang, Empirical, or other supported types. |
   | **C-Events** | Define the conditions under which service starts: entity waiting AND server idle. Use the Predicate Builder — a point-and-click condition builder that prevents type mismatches. Each C-Event has an **Activity Type** toggle: **Service (claim resource)** seizes a server entity; **Delay (no resource)** just holds the entity for a sampled time with no server involved (e.g. a recovery period, a fixed processing wait). Picking **Delay** swaps the Effects picker for a single **Source queue** select and auto-writes `DELAY(QueueName)` — see §5.4 for how to configure what happens when the delay ends. |
   | **Schedules** | Create named timetables for time-varying arrival rates. Import rows from CSV or Excel and link timetables to B-Events. |
   | **Model Data** | Add counters you want to track (e.g. total cost, total reneges). Also set the time unit, real-world epoch, and any external data sources. |

   Goals (service-level targets, e.g. "95% of customers wait less than 5 minutes") are set on the **Overview** tab. Results will show green/red against these goals.

4. The **Model Health** button in the Design toolbar lights up whenever there are validation issues. Click it to see all 55 validation rules and fix any blocking errors (red) before running; warnings (amber) let you proceed with a caution banner.
5. Click **Save**.

**Tips:**
- Use descriptive names for entity types (e.g. "Patient" not "Entity1").
- If you use a PRIORITY queue discipline, the entity type needs a `priority` attribute of type `number`.
- B-Events set *when* things happen. C-Events set *what can happen given the current state*. If nothing is happening during a run, check your C-Event conditions.

**Visual Designer.** Click **Draw** in the Design toolbar to open the canvas-based Visual Designer and build or rearrange the same model graphically. Use **Pan** mode to move around the diagram. Use **Select** mode, or Shift/Ctrl-click with a mouse, to select more than one node. Once nodes are selected, the toolbar above the canvas shows how many are selected and lets you clear the selection or delete the selected nodes together. Dragging a selected group moves the whole group and saves the updated layout with the model. Press **Ctrl+D** to duplicate the current selection in place, or **Ctrl+C**/**Ctrl+V** to copy and paste elsewhere on the canvas — duplicates land disconnected, ready to be wired up. If a routing edge belongs to a probabilistic-routing branch (shown with a `%` label), click the edge to select it and an inline input appears so you can change the split without leaving the canvas.

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
- Generated models pass through the same 55 validation rules as manually built ones. Fix any errors shown in Model Health before running.

### 4.4 Run an experiment and read results

**When to use this.** You have a valid model and want statistical results.

1. Click the **Run** tab.
2. Configure the experiment:

   | Setting | Guidance |
   |---------|---------|
   | **Replications** | Use 10–30 for initial exploration, 100+ for published results. More replications = narrower confidence intervals. |
   | **Max sim time** | Set to the time horizon of interest (e.g. one working day = 480 minutes). |
   | **Termination condition** | Leave blank for time-based termination, or enter a condition (e.g. `total_served >= 1000`). |
   | **Seed** | Leave blank for a random seed, or enter a number for reproducible results. |
   | **Schedule** | If the model has multiple timetables (e.g. Weekday, Weekend), select which one to use. |
   | **Purge period** | Optional run-down time after the simulation clock reaches Max sim time. New arrivals stop but the system continues until all queues drain. Useful for end-of-day or shift-end scenarios — set to the longest expected remaining service time. |

3. Click **Run**. The Execute canvas animates entity flow in real time. During execution, the sidebar and header collapse to give maximum canvas space, and a compact run bar appears with **Step**, **Auto Run**, speed, and **Cancel** controls. A **⚠** badge in the run bar shows real-time warnings when utilisation, starvation, or queue capacity thresholds are exceeded — click it to see details.

4. When the run completes, the Results tab shows:

   | Section | What it tells you |
   |---------|------------------|
   | **Key Findings** | Critical issues (saturation, starvation, growing queues) flagged at the top above all other results with actionable improvement suggestions. |
   | **Summary** | Entities arriving, served, and reneged. Average wait, service time, and utilisation. Goal pass/fail. |
   | **Bottlenecks** | Which queues have the longest average waits. Peak queue depth. |
   | **Analysis** | Confidence intervals, Welch warm-up diagnostic, replication-level variance. |
    | **Utilisation (per-shift)** | For server entity types with a weekly schedule pattern, a collapsible **Per-Shift Utilisation** section shows a horizontal bar chart breaking down utilisation by shift (e.g. Mon 08:00–16:00, Tue 16:00–00:00). Each bar shows % busy alongside the number of entities claimed by capacity unit. |
    | **Schedule Adherence** | Each resource card in the Results workspace shows a colour-coded adherence line: green if overall utilisation is within 10 % of the expected schedule utilisation, amber if within 25 %, red if the gap exceeds 25 %. Hover to see the actual utilisation vs. expected values. |
    | **Starvation** | Per-resource time and percentage spent starved — server idle because its queue was empty, not because it was recently freed. High starvation means the server is capacity-constrained on the supply side; consider whether upstream stages need balancing. |
   | **Run Effort** | Replications completed, total sim time, wall-clock duration. |

5. Open the **✦ AI** sidebar (Simulation Assistant) to explore the results:

**How wait time is calculated.** The average wait time includes all entities that spent time in a queue: served entities, reneged entities (those that left the queue before service), and in-progress entities still waiting when the simulation ends. In-progress partial waits are half-weighted (standard DES practice). A separate Little's Law estimate (`L_q / arrival rate`) is computed from the time-averaged queue length and checked against the per-entity average; when the two estimates disagree by more than 5%, the run may be too short for reliable wait-time estimates.

6. Open the **✦ AI** sidebar (Simulation Assistant) to explore the results:
   - Click **Analyse** for a plain-English narrative of the results with structured improvement suggestions.
   - Click **Compare** to compare against a saved historical run.
   - Use the text input to ask specific questions about the results (e.g. "Which queue had the longest wait?").

   The **Export ▾** button sits in the toolbar next to the run controls. Click to open a three-section popover: **Results Data** (Full JSON, Metrics-only JSON, CSV), **AI & Reports** (LLM Bundle, Create Report), and **Reference** (Schema reference showing the JSON structure).

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

**Voice input.** The AI chat dialogs — Help Assistant, Simulation Assistant, and AI Diagnostics — each include a microphone button. Clicking it activates the browser's Speech Recognition API so you can dictate questions or describe changes verbally instead of typing.

**Live warnings during runs.** While a simulation is running in Step or Auto Run mode, a compact **⚠** badge appears in the run bar. This badge monitors real-time conditions — resource utilisation exceeding safe thresholds, server starvation, and queue capacity warnings — and updates as the run progresses. Click the badge to expand a panel showing each active warning with the affected resource or queue and the current value. Warnings are only active during execution and disappear once the run completes. They are designed to help you spot problems early without waiting for the full results analysis.

**Key Findings.** After a run completes, the Results workspace surfaces critical health flags in a **Key Findings** section above all other results. These flags automatically detect:

| Finding | What it flags |
|---------|--------------|
| **Saturation** | A resource is utilised above 90% — demand exceeds near-term capacity. The queue feeding this resource is your primary bottleneck. |
| **Starvation** | A resource has significant idle time because its input queue is empty — indicates an upstream bottleneck or over-capacity. |
| **Growing queues** | Queue depth is increasing at the end of the simulation — the system has not reached steady state and waits are still rising. |
| **Reliability** | Resource downtime (from failure/repair cycles) is materially affecting throughput. |

Each flag includes an actionable suggestion: adding capacity, rebalancing upstream stages, extending simulation time, or addressing reliability. Key Findings replaces the need to scan individual charts for problems — the critical issues are surfaced first.

**Bottom Panel.** The collapsible bottom panel in the Execute view is collapsed by default. Click any tab name (**Log**, **Entities**, **Charts**, **Stage KPIs**) to expand the panel at that tab. The panel has a touch-friendly resize handle along its top edge — drag up or down to adjust the height. The **Step Log** tab shows only the last 50 event entries for readability; during a run this scrolls automatically as new events arrive. Click on an entity in the Entity Table or on the Execute canvas to open the **Entity Inspector** for that entity's full state and history.

**Optimise.** Inside the Simulation Assistant sidebar, click **⚡ Optimise** to run an adaptive batch analysis. The AI analyses results for bottlenecks, quick wins, and investment opportunities. Each suggestion has an **Apply ↗** button that proposes the change to the model with a before/after diff so you can review it before committing.

**Schedule Manager.** The **Schedules** sub-tab under the Design section lets you create named timetables for time-varying arrival patterns. You can import arrival rows from CSV or Excel files (including multi-event imports) and link timetables to B-Events.

**Run tier limits.** The number of replications available per run depends on your account tier: Free accounts can run up to 10 replications; Standard accounts up to 30; Pro accounts up to 100.

**Per-outcome results.** The Results tab shows a Journey Outcomes section that breaks down completed entities by route (COMPLETE, RENEGE, and other terminal outcomes), with average wait time and average time in system reported separately per route.

**Export and run SimPy Python.** Click **⬇ SimPy** in the model header bar (or go to the **Access** tab and click **Export SimPy**) to open the SimPy dialog.

A dialog shows whether the script is **Category 1** (complete) or **Category 2** (partial). For Category 1 models you have two options:

- **Run in Browser** — executes the SimPy script directly in your browser tab via Pyodide (Python compiled to WebAssembly). No Python installation required. A progress bar tracks each replication; when all replications finish the results are loaded into the app and available in the Results workspace alongside any JS-engine runs. The first run downloads Pyodide (~25 MB, cached afterwards); subsequent runs start immediately. Browser runs are saved to your run history with the label `SimPy  DD/MM/YYYY HH:mm` and appear in the history dropdown on the Execute tab. The Results workspace shows enriched KPI cards for SimPy runs: Arrived, Served, Completion Rate, average wait, wait percentiles, average service time, average sojourn, per-resource utilisation, and schedule adherence for weekly-pattern resources.
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

**Weekly Schedule Patterns.** Server entity types can have a repeating weekly schedule that defines capacity at every hour of the week. Click **Weekly Schedule Pattern** to open the 24×7 grid editor. Two modes are available:

| Mode | How it works |
|------|-------------|
| **Absolute capacity** | Enter the exact number of servers for each time slot (e.g. 3 for day shift, 1 for night shift). |
| **Multiplier (0–100%)** | Enter a percentage (0.0–1.0) and a **Base capacity**. The engine calculates actual capacity as `base × multiplier`. For example, base capacity 6 with a multiplier of 0.67 gives 4 staff. This mode integrates with parametric sweeps — set base capacity to `{{nurseCount}}` and sweep over staffing levels. |

The grid editor lets you click-drag to select cells, then apply a capacity value to all selected cells at once. Use **Invert Selection** to quickly toggle between day and night shifts. Add **Exception Dates** for one-off changes like bank holidays.

**Server Skills.** When your model has multiple server types that can perform different tasks, you can use **Skills** to control which servers are eligible for specific activities. For example, in a hospital, only doctors with the "Surgery" skill should be assigned to surgical procedures.

To use skills:

1. **Define skills** — Go to the **State** tab (under Design). Scroll to the **Skills** section. Type a skill name (e.g. "Triage", "Surgery", "X-Ray") and press **Enter** to add it to the model's skill registry. Repeat for each skill your model needs.

2. **Assign skills to servers** — Go to the **Entity Types** tab. Expand a server entity type. If skills are defined, a **Skills** panel appears with checkboxes for each registered skill. Tick the skills this server type possesses. A doctor might have "Surgery" and "Consultation"; a nurse might have "Triage" and "Monitoring".

3. **Use skills in C-Events** — Go to the **C-Events** tab. When you pick an ASSIGN or COSEIZE effect, the dropdown now shows skill-filtered options:
   - `Start service with Doctor (Surgery) and Patient from SurgeryQueue` — only idle doctors with the "Surgery" skill are considered
   - `Seize Doctor[Surgery] + Nurse[Triage] for Patient from ERQueue` — each server type is filtered by its required skill

   The skill name appears in brackets in the effect picker. The engine enforces that only servers possessing the specified skill are matched.

4. **Conditions with skills** — In the Predicate Builder, you can use `idle(Doctor, "Surgery").count` to check how many doctors with the Surgery skill are currently idle. This lets you write conditions like "if a surgery patient is waiting AND a surgeon is available → start operation".

**When to use skills.** Skills are useful when:
- Multiple server types exist but not all can perform every task (e.g. junior vs senior doctors)
- You need to model certification or training requirements (e.g. only certified operators can run certain machines)
- You want to analyse utilisation per skill (the Results workspace shows per-skill utilisation breakdowns)

**Per-instance server skills.** When your server pool needs individual skill assignments — e.g., 4 doctors with different specialisations — switch to Per-instance mode:

1. **Define the skill pool** in Shared mode first: check all skills this server type could possibly have (e.g. Surgery, Consultation, Triage, X-Ray).

2. **Switch to Per-instance mode** — below the skill checkboxes, click the **Per-instance** radio button. This creates your first profile automatically.

3. **Add and configure profiles.** Each profile card has:
   - A **name** (e.g. "Surgeon")
   - **Skill checkboxes** — which skills from the pool this profile grants
   - A **Count** or **Weight** assignment method:
     - **Count** — exactly N servers get this profile (deterministic, good for small pools). Servers are assigned in the order the profiles appear.
     - **Weight** — each server has an X% chance of getting this profile (random, good for large pools)
   - **Remove** button to delete the profile

4. **Profiles are non-exclusive** — a server can match multiple profiles. For example, a count-based "Surgeon" profile gives 2 doctors Surgery + Consultation, while a weight-based "Triage" profile at 100% gives all 4 doctors Triage. A server's final skills = the union of all matched profiles.

5. **Check the counter** below the profile list — it shows count-based total / server count. If it exceeds, a validation error blocks the run (V-SKILL-5).

6. **Remaining servers** (if count-based profiles cover fewer than the pool size) get no instance skills — they fall back to the type-level `skills[]` check.

**Validation.** The engine checks that every skill referenced in an ASSIGN/COSEIZE effect or condition exists in the model's skill registry (V-SKILL-1, V-SKILL-2, V-SKILL-3, V-SKILL-4). If you delete a skill from the registry, any effects or conditions referencing it will show a validation error. The count-based profile check (V-SKILL-5) ensures your assignments don't exceed the server count.

**Validation.** The engine checks that every skill referenced in an ASSIGN/COSEIZE effect or condition exists in the model's skill registry (V-SKILL-1, V-SKILL-2, V-SKILL-3). If you delete a skill from the registry, any effects or conditions referencing it will show a validation error.

**Setting skill requirements on arrival (entity-side).** Instead of hardcoding one skill name per C-Event, you can give arriving entities different skill requirements using a weighted string attribute on the customer type:

1. **Add a string attribute** — In the **Entity Types** tab, expand your customer type. Add an attribute (e.g. `requiredSkill`) with value type **String**.

2. **Choose Weighted mode** — Click the **Weighted** radio button (instead of Static). Add option rows: each row has a value and a relative weight. For example: Surgery weight 40, Consultation weight 30. One option can be set to **no requirement** — entities that get this value will match any idle server.

3. **Read the visual bar** — The bar always fills 100% width. Coloured segments show each option's proportion. Any remaining portion is labelled **No requirement** and produces no skill filter at runtime.

4. **Connect in a C-event** — Go to the **C-Events** tab. When you pick an ASSIGN effect, the dropdown now shows `Start service with Doctor (left-arrow Entity.requiredSkill)` — select this to have the engine read each entity's `requiredSkill` attribute at runtime. The C-event uses `ASSIGN(Queue, Server, Entity.requiredSkill)`.

5. **Falls back cleanly** — If an entity's `requiredSkill` is null or empty, the ASSIGN matches any idle server of that type (no skill filter). If no server with the matching skill is idle, the ASSIGN fails as usual and the C-event will re-evaluate on the next pass.

This means one C-event handles all skill variations — no duplicate C-events per skill name. Combined with schedule-based overrides (see Schedule Manager), you can vary required skills per time slot.

**Routing to the shorter of two queues.** By default, a condition's value field only accepts a fixed number. To compare against another live value instead — "route to whichever queue currently has fewer people waiting" — open the **Condition Builder** on a routing table, C-event condition, or balking condition, add a clause with a number-type variable (e.g. `Number of Patients in Queue A`), and use the small **Number / Dynamic** toggle next to the value field. Switch it to **Dynamic** and a second dropdown appears listing the same queue/server/container values available on the left side — pick `Number of Patients in Queue B` to compare the two directly (`queue(A).length < queue(B).length`). This works anywhere a condition is built: C-event conditions, routing tables, balking conditions, and per-schedule `when` clauses.

**Ending a service when a condition becomes true, not on a timer.** Most services end after a sampled or fixed duration. For services whose length depends on something happening elsewhere in the model (e.g. "the doctor stops when the ward is cleared," not a fixed 20 minutes), add a C-event whose condition checks that state and whose effect picks **FINISH ServerType's current service immediately** from the effect dropdown (`FINISH(ServerType)`). The engine re-checks every condition after each event, so service ends the instant your condition becomes true — no scheduled delay involved. If no server of that type happens to be busy when the condition fires, FINISH simply does nothing.

**Matching only compatible pairs.** MATCH normally pairs whichever entity is at the front of each of two queues — useful when any pairing is acceptable (e.g. drivers and riders). When pairings must satisfy a rule (blood-type compatibility, a required certification matching a request), open the effect builder's MATCH option and fill in the compatibility field, e.g. `Entity.bloodType == Other.bloodType` — `Entity` refers to the candidate from the first queue, `Other` to the candidate from the second. The engine scans both queues for the first pair that satisfies the rule instead of always taking the front two; if no pair qualifies, it waits for the next opportunity.

**Making a service also consume a physical resource.** Some activities need both a member of staff/equipment *and* a limited consumable — a test kit, a dose, a spare part — and should only start when both are available. Rather than modelling this as a separate `DRAIN` alongside `ASSIGN` (which can start the server even when the consumable runs out), open the effect builder, choose an option under **"ASSIGN gated by consumable container"**, and pick which container and how much it consumes. This produces `ASSIGN(Queue, Server, ContainerId:amount)` — the server claim and the container's level check happen together: if the container doesn't have enough, the server is never claimed and the entity keeps waiting, exactly as if the server itself were unavailable. Add a skill requirement in front of the container clause if needed: `ASSIGN(Queue, Server, "Skill", ContainerId:amount)`.

**Sections (large-model organisation).** When a model grows beyond roughly ten queues or twenty events, you can group elements into named *sections* to keep the editors manageable. Open the **Sections** tab (under the Design area) and click **+ Add Section** to create a named, coloured group. Assign queues, entity types, B-events, and C-events to the section using the member checkboxes. For queues that act as handoff points between sections, mark them **IN** (entities arrive from another section) or **OUT** (entities leave to another section).

Once sections are defined:
- Every table editor (Entity Types, Queues, B-Events, C-Events) shows a coloured filter tab strip — click a section name to see only its elements.
- The Visual Designer shows a small coloured dot on each node that belongs to a section.
- Sections are pure metadata: the simulation engine is unchanged and all elements remain part of the same flat model.

### 4.8 Export results for external analysis

**When to use this.** You want to analyse results in an external tool — paste into an LLM (Claude, ChatGPT, Gemini), load into a Python notebook, consume from an R script, or connect from a BI tool.

The unified **Export ▾** popover is available wherever results are present: in the **Execute/Run** panel toolbar, in the **Results** workspace when viewing saved run results, and per-run in **Run History** via the ⋯ (More actions) menu. The popover is disabled until at least one run completes.

| Popover section | Options |
|-----------------|---------|
| **Results Data** | Full model results (.json), Metrics only (.json — KPIs, no time series or entity data), Results table (.csv), Results workbook (.xlsx — multi-sheet Excel with Summary, Replications, and Entity Journeys) |
| **AI & Reports** | LLM Bundle (.md), Create Report… (Senior Management or Technical, HTML or Markdown) |
| **Reference** | Schema reference — opens a modal showing the full `simmodlr.results.v1` JSON structure with a "Copy schema" button |

#### Full JSON export

The JSON export (`simmodlr.results.v1`) contains the complete model metadata, experiment configuration, results summary, time series, wait distributions, and per-replication summaries. A new **entity journeys** section includes every customer entity's full path through the model: arrival time, stage-by-stage wait and service times, and outcome (served, reneged, incomplete).

**Python quick-start with entity journeys:**

```python
import json, pandas as pd
with open("results.json") as f:
    data = json.load(f)
# Per-replication KPIs
reps = pd.json_normalize(data["replications"])
# Per-entity journey data
journeys = pd.json_normalize(data["results"]["entityJourneys"])
# Flatten stages for each entity
all_stages = []
for j in data["results"]["entityJourneys"]:
    for stage in j["stages"]:
        stage["entityId"] = j["entityId"]
        all_stages.append(stage)
stages_df = pd.DataFrame(all_stages)
```

#### Download all chart data

In the **Results** workspace, a **⬇ Download all chart data (.csv)** button appears when chart data is present. It combines every chart series into a single CSV file with section headers (`# Section: Queue Depth — Checkout`). No more clicking each chart individually.

#### LLM Bundle (.md)

The LLM Bundle is a single Markdown file that gives an LLM everything it needs to answer questions about your model and results, with no additional context required.

**Contents of the bundle:**

| Section | What it contains |
|---------|-----------------|
| Preamble | Plain-English description of the Three-Phase DES method and how to read the results |
| Model definition | Entity types and attributes (including weekly schedule patterns), queues and disciplines, B-Event and C-Event logic, performance goals |
| Experiment configuration | Replications, warm-up period, max sim time, seed, schedule |
| Headline KPIs | Average wait, average service time, average sojourn, throughput, renege rate |
| Per-queue wait table | mean, p50, p90, p95, p99 for every queue |
| Per-resource utilisation | Utilisation percentage and busy/idle counts for every server. For schedule-pattern resources: per-shift utilisation breakdown and schedule adherence. |
| Confidence intervals | 95% CI per KPI (present only for multi-replication runs) |
| Goals pass/fail | Each performance goal with its target, actual value, and PASS/FAIL status |
| Replication summary | Seed, served, reneged, and avgWait per replication (for multi-replication runs) |

**How to download:**

1. Complete a run (single replication or multi-replication).
2. In the Execute panel, click **Export ▾** in the toolbar.
3. Click **LLM Bundle (.md)**.
4. A `.md` file downloads to your browser's default download folder.
5. Open your LLM of choice, start a new conversation, and paste the file contents (or upload the file if the LLM supports file upload).
6. Ask any question — for example: *"Which queue has the longest average wait?"* or *"Does this model meet its service-level target?"*

**The Export ▾ button is disabled** (greyed out) until at least one run has been completed for the current model session.

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

### 4.9 Share a model directly (Access tab)

**When to use this.** You want to hand a specific person a link that opens *this model* — not a read-only results dashboard, the actual model in the Model Library — using whatever access they already have (or will be granted).

1. Open the model and go to the **Access** tab.
2. In the **Sharing** section, set visibility: **🔒 Private** (default — only you, plus anyone you've explicitly granted access, can open it) or **🌐 Public** (anyone signed in can open it read-only and fork their own editable copy).
3. To grant a specific collaborator access without making the model public, add them below with **viewer** or **editor** rights.
4. Click **🔗 Copy link**. This copies a URL ending in `#model/<modelId>` to your clipboard — send it by email, chat, or however you'd share any link.

**What the recipient sees when they open the link:**

| Recipient's access | Result |
|---------------------|--------|
| Owner, or granted `editor`/`viewer` | Opens straight into the full model, same as clicking it in their own library. |
| No access yet, but model is public | Opens read-only with a prompt to fork their own editable copy. |
| Not signed in | Taken to sign-in/sign-up first; the link resumes automatically once they're signed in. |
| No access, model not public, or model deleted | Lands on their normal Model Library with no error — the link simply doesn't unlock anything new. |

**This is not the same as the run-results Share link** (§4.6) — that creates a public, anonymous, read-only dashboard for one simulation run and needs no login at all. A model link (`#model/<id>`) only opens the door that your visibility/access settings already allow; it never bypasses login or grants new permissions on its own.

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
| V47 | A Delay activity's follow-on schedule samples the delay from "Server attribute," or the completion B-Event's effect is a bare `ARRIVE(...)` with nothing else | See §5.4 — pick a sampled distribution (Exponential, Fixed, …) instead of "Server attribute," and resolve the delayed entity with `COMPLETE()`, a routing table, or `RELEASE()` instead of (or alongside) `ARRIVE` |

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
| V50: "Weekly schedule pattern requires a startOfWeek epoch" on a server entity type | The entity type has a `schedulePattern.type === 'weekly'` but the model data does not set a `startOfWeek` epoch — the grid editor has no reference point to know which Monday to use | Go to **Model Data** in the Define sub-sections and set a `startOfWeek` epoch (any date works, only the day-of-week matters). The first day of the schedule pattern is the week that contains this epoch. |
| V51: "Weekly schedule pattern has unscheduled hours with no active shift" | The 24×7 grid has cells that are neither off (0) nor covered by any shift schedule row, meaning the server type would have zero capacity for some hours on some days | Open the **Weekly Schedule Pattern** editor for that entity type. Either fill every 1-hour cell with a capacity ≥ 0, or add a shift schedule row that covers the gap. A gap is any hour where the grid is `null` rather than an integer — set it to 0 explicitly if the server should be unavailable then. |
| V52: "Set/Capacity schedule reference targets a non-schedule resource" | A C-Event or effect macro references a schedule by name or ID but the referenced entity type is not a server (its `role !== 'server'`) — only server entity types have schedule patterns | Ensure the `SET` or macro call that references this schedule targets a server entity type. If the resource is not a server, remove the schedule reference. |
| V53: "Schedule pattern capacity exceeds shift capacity at [time]" | A weekly grid cell has a capacity value that is larger than the shift schedule's capacity for the same time window — the grid defines how many *should* be available, the shift defines what staff are *actually* rostered, so grid > shift is a deployment mismatch | Either reduce the grid cell to ≤ the shift's capacity for that hour, or increase the shift's capacity (add more staff) to cover the planned level. |
| V54: "Shift schedule rows overlap and are not merged" | Two shift rows in the same schedule have overlapping time windows — e.g. Row 1: 08:00–16:00 Mon–Fri, Row 2: 12:00–20:00 Mon–Fri — and the editor has not merged them (editor shows a yellow "overlap" badge) | Use the **Merge overlapping shifts** button in the shift schedule editor. The editor combines overlapping rows into a single row covering the union of their time windows with the max capacity. |
| V55: "Per-shift utilisation chart is empty" | A weekly-pattern server entity type ran with zero capacity for all shifts, or the run ended before any shift could complete a service | Check that at least one schedule-pattern cell has capacity > 0 and that the run's `maxSimTime` is long enough for an entity to complete service. The per-shift chart appears only when `perShiftUtil[]` contains at least one entry. |
| V56: "Schedule adherence is N/A" | The server entity type has no `schedulePattern` (it's not a weekly-pattern server) | Schedule adherence is only computed for server entity types with `schedulePattern.type === 'weekly'`. For all other resources the field is omitted. |

### 5.4 "What do I configure for a Delay (no resource) activity, and what happens when it ends?"

**When this applies.** Your C-Event's Activity Type is set to **Delay (no resource)** — used for things like a recovery period, an unsupervised processing wait, or any hold that does not tie up a server entity.

**Two settings to get right:**

1. **"delay via:" on the Schedule Follow-on Event panel.** Pick a sampled distribution — **Exponential**, **Fixed**, **Uniform**, etc. Do **not** pick **Server attribute**: a Delay activity never claims a server, so there is nothing to read an attribute from, and the engine silently falls back to a delay of 1 every time (flagged by validation rule V47, with an amber warning shown directly under the schedule row in the editor).
2. **The completion B-Event's Effect** — what happens to the entity once the delay ends. There are three valid choices, pick based on what actually happens next:

   | If the entity… | Configure the B-Event with… |
   |---|---|
   | …leaves the system entirely (process ends here) | `COMPLETE()` — works correctly even though no server was claimed. |
   | …continues to another queue, and no server is involved anywhere in this entity's journey | A **routing table** (Conditional or Probabilistic routing, set in the B-Event's Routing panel) and **no effect macro at all** — leave Effects empty. The engine treats a delay-held entity the same as one waiting in a queue, so routing alone moves it on. |
   | …continues, and a server *was* genuinely seized earlier in this same entity's journey and is still held through the delay | `RELEASE(ServerType[, TargetQueue])` to free that server now. |

   **Do not** use a bare `ARRIVE(...)` as the only effect on a Delay completion B-Event — `ARRIVE` always creates a brand-new entity and never resolves the one that was delayed, leaving it stuck forever (flagged by V47). `ARRIVE` is fine *combined with* one of the three options above (e.g. to also spawn a log/audit entity), just never alone.

   **Do not** invent a `RELEASE()` for a chain where no server was ever seized — `RELEASE` has no awareness that this entity came from a Delay, so it either does nothing (entity stuck, same problem as bare `ARRIVE`) or, worse, can release an unrelated server's claim on a different entity. If no server is involved, use `COMPLETE()` or a routing table instead.

### 5.5 "How do I limit appointments to N per time period (slot booking)?"

**When this applies.** You need to model a scheduling step where entities are processed in batches — e.g., "3 appointment slots per hour", "5 patients scheduled every 2 hours", "10 trucks loaded per shift".

**How to set it up:**

Conditions have no arithmetic evaluator — `(clock - state.lastSlotTime) >= N` is not valid syntax and throws an error at runtime. Use a recurring timer B-Event plus a boolean flag instead:

1. **Create a state variable** to act as a "ready" flag (e.g., `slotReady`, initial value 0).
2. **Create a self-rescheduling B-Event** (the same way an arrival event reschedules itself) that fires every `slotInterval` minutes with effect `SET(slotReady, 1)`.
3. **Create a C-Event** with Activity Type **Delay (no resource)**. In the Source queue dropdown, pick the queue where entities wait for scheduling.
4. **Set the Slot capacity** field to the maximum number of entities to process per firing (e.g., 3). Leave it blank to drain all waiting entities (default behavior).
5. **Add a condition** that combines:
   - `queue(QueueName).length >= 1` — there are entities waiting
   - `slotReady == 1` — the timer has ticked since the last slot opened
   - Optional calendar constraints: `isWeekday AND hourOfDay >= 9 AND hourOfDay < 17` — only during business hours
6. **Add two effects:** `DELAY(QueueName, N)` and `SET(slotReady, 0)` — drain up to N entities and consume the flag until the next tick.

**Example:** A clinic with 3 appointment slots per hour, weekdays 9am-5pm:

```
Timer B-Event: fires every 60 min, effect: SET(slotReady, 1)
Condition: queue(BookingQueue).length >= 1 AND isWeekday AND hourOfDay >= 9 AND hourOfDay < 17 AND slotReady == 1
Effect: DELAY(BookingQueue, 3), SET(slotReady, 0)
```

The C-Event fires once per hour (when the condition is true), drains up to 3 entities from the queue, and consumes the flag. Remaining entities wait for the next slot.

### 5.6 "How do I make different entity types get different delay times?"

**When this applies.** You need per-entity delay durations — e.g., "General appointments take 30 minutes, Specialist appointments take 60 minutes", "Urban reinforcement takes 10 days, Rural takes 21 days".

**How to set it up:**

1. **Add an attribute** to your customer entity type that stores the delay duration (e.g., `appointmentLength`, valueType: number).
2. **Set the attribute at arrival** using a Categorical distribution or a fixed value per entity type.
3. **In the C-Event's Schedule Follow-on Event panel**, pick **Entity attribute** from the "delay via:" dropdown and enter the attribute name (e.g., `appointmentLength`).
4. **Or use conditional schedules** — add multiple cSchedule rows with `when` predicates that check the entity's type attribute:

```json
"cSchedules": [
  { "when": { "variable": "Entity.appointmentType", "operator": "==", "value": "General" },
    "eventId": "b_done", "dist": "Fixed", "distParams": { "value": "30" }, "useEntityCtx": true },
  { "when": { "variable": "Entity.appointmentType", "operator": "==", "value": "Specialist" },
    "eventId": "b_done", "dist": "Fixed", "distParams": { "value": "60" }, "useEntityCtx": true },
  { "eventId": "b_done", "dist": "Fixed", "distParams": { "value": "45" }, "useEntityCtx": true }
]
```

The engine evaluates `when` predicates in order and uses the first match. The last entry (no `when`) is the fallback for anything unmatched.

### 5.7 "How do I restrict activities to business hours only?"

**When this applies.** You need to model time-of-day or day-of-week constraints — e.g., "appointments only available weekdays 9am-5pm", "maintenance only on weekends", "night shift starts at 10pm".

**How to set it up:**

1. **Set the model's epoch** in Model Settings → State tab → "Real-world start date and time". This anchors simulation time to a real calendar datetime. Without an epoch, calendar variables return defaults (isWeekday=true, hourOfDay=0).
2. **Use calendar variables** in your C-Event conditions:
   - `isWeekday` — boolean, true Monday-Friday
   - `isWeekend` — boolean, true Saturday-Sunday
   - `hourOfDay` — integer 0-23
   - `dayOfWeek` — integer 0-6 (0=Sunday, 1=Monday, ..., 6=Saturday)

**Example:** "Schedule appointments weekdays 9am-5pm only":

```
Condition: queue(BookingQueue).length >= 1 AND isWeekday AND hourOfDay >= 9 AND hourOfDay < 17
```

**Example:** "Weekend maintenance only":

```
Condition: queue(MaintenanceQueue).length >= 1 AND isWeekend
```

**Validation:** If you use calendar variables without setting an epoch, validation rule V-CAL-1 warns that the variables will return defaults. Set the epoch to get real calendar-aware behavior.

### 5.8 Finding what a scheduled B-Event actually does

Each row in a C-Event's **Schedule Follow-on Event** panel shows a one-line, plain-language summary of the linked B-Event's effect right under the schedule preview — e.g. "Releases Nurse · routes 80% → Discharge Queue, 20% → Transfer Queue" or "Entity exits simulation." Macros without a friendly phrase yet (FILL, PREEMPT, FAIL, …) fall back to showing the raw macro call instead of being hidden. Click the bolded B-Event name to jump straight to it in the **B-Events** tab.

The link works the other way too: open a B-Event in the **B-Events** editor, and if any C-Event schedules it as a follow-on, a **"Scheduled by"** link appears — click it to jump back to that C-Event.

---

## 6. Glossary

| Term | Definition |
|------|-----------|
| **B-Event** | A *bound* event: scheduled to fire at a specific time (e.g. an arrival, a service completion). Defined in the B-Events editor. |
| **C-Event** | A *conditional* event: fires when a state condition is true (e.g. "entity waiting AND server idle"). Defined in the C-Events editor using the Predicate Builder. |
| **Confidence interval (CI)** | A between-replication t-confidence interval: the engine computes one mean per replication, then applies Student's t across those replication-level means. Narrower CIs → more reliable results (use more replications). For two-scenario comparison the UI uses paired-t confidence intervals with Bonferroni correction. (Note: `tukeyHSD()` and `oneWayANOVA()` are implemented in the engine but not yet exposed in the UI.) |
| **Entity** | An object that flows through the model: a customer, patient, train, job. |
| **Future Event List (FEL)** | The engine's internal queue of scheduled B-Events, ordered by time. |
| **Macro** | A named effect instruction applied to entities or resources. The full set of 20 supported macros is: `ARRIVE`, `ASSIGN`, `BATCH`, `COMPLETE`, `COSEIZE`, `COST`, `DRAIN`, `FAIL`, `FILL`, `MATCH`, `PREEMPT`, `RELEASE`, `RELEASE_COSEIZED`, `RENEGE`, `RENEGE_OLDEST`, `REPAIR`, `SET`, `SET_ATTR`, `SPLIT`, `UNBATCH`. `RELEASE_COSEIZED([Type1, Type2, ...], QueueName?)` atomically releases all servers seized together by a `COSEIZE` and is the correct way to free co-seized resources without ending the entity's lifecycle — never stack separate `RELEASE(Type)` calls for co-seized types. |
| **MTBF / MTTR** | Mean time between failures / mean time to repair. Used for resource failure modelling. |
| **Predicate Builder** | The point-and-click condition editor for C-Events. Prevents type mismatches; no free-text logic. |
| **Replication** | One independent run of the simulation from start to finish with a unique random seed. |
| **Resource** | A capacity-limited service provider (server, machine, nurse, lane). |
| **Seed** | The starting value for the pseudo-random number generator. The same seed always produces the same sequence of random samples (reproducibility). |
| **Warm-up period** | The initial phase of a run during which the system is reaching steady state. Statistics collected during warm-up are discarded. |
| **LLM Bundle** | A structured Markdown document downloaded from the Export… menu that combines model definition, experiment configuration, and full results into a single file. Designed to be pasted into an LLM (Claude, ChatGPT, Gemini) for custom analysis — contains a preamble explaining the Three-Phase DES method so no additional context is needed. |
| **Results API** | A Supabase Edge Function (`/functions/v1/results-api/`) providing authenticated read-only access to saved run and sweep results via HTTP, for use from Python, R, or BI tools. |
| **SimPy export — Category 1** | A generated `.py` script that requires no manual editing and runs as-is after `pip install simpy`, or directly in the browser via the **Run in Browser** button. Produced when all macros in the model have a direct SimPy equivalent. |
| **SimPy export — Category 2** | A generated `.py` script where one or more macros (RENEGE, BATCH, MATCH, FAIL, REPAIR, PREEMPT, RENEGE_OLDEST, or RELEASE_COSEIZED) have been replaced with annotated `# TODO` stubs. The script runs without errors but the stub sections must be completed manually before results are meaningful. The Run in Browser button is disabled for Category 2 scripts. |
| **Starvation** | The condition where a server is idle because its input queue is empty — demand is too low to keep the server busy, not because the server is busy with another entity. Reported per-resource in the Results workspace as starvation duration and percentage. High starvation indicates upstream bottlenecks or low arrival rates relative to capacity. |
| **Purge period** | An optional run-down phase after the simulation's Max sim time. New arrivals are stopped but the simulation continues until all queued entities are served (or until a configurable extra time limit). Used to model end-of-day or shift-end drain-down. |
| **Schedule Adherence** | A per-resource metric comparing actual utilisation to the expected utilisation implied by the weekly schedule pattern. Shown as a colour-coded badge in resource cards (green ≤ 10 % gap, amber ≤ 25 %, red > 25 %). Only computed for server entity types with `schedulePattern.type === 'weekly'`. |
| **Schedule Pattern** | A repeating 24×7 grid (hours × days of the week) defining the expected capacity of a server entity type at every hour of the week. Set in the Entity Types editor via the **Weekly Schedule Pattern** toggle. The grid interacts with the shift schedule — the shift defines rostered staff, the pattern defines planned deployment. |
| **Per-shift utilisation** | A breakdown of a server entity type's utilisation into separate bars per shift (e.g. Mon Early Shift, Tue Late Shift). Shown as a collapsible horizontal bar chart in the Results workspace. Each bar shows the % busy and the number of entities claimed per capacity unit within that shift's time window. Only available for weekly-pattern server types. |
| **Shift-change behavior** | How a server handles in-progress service when its shift schedule reduces capacity: Delay (finish naturally), Preempt (interrupt and re-queue with remaining time), or Suspend (pause and resume). Set per server entity type in the Entity Types editor. |
| **PRNG stream isolation** | Each stochastic process in the simulation (arrivals, service, reneging, MTBF, MTTR) has its own independent pseudo-random stream derived from the base seed. This means changing the distribution of one process does not alter the random sequence of any other process, making scenario comparisons more controlled. |
