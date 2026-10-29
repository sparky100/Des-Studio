# Flow — User Guide

**Version:** 8.0.0  
**Date:** 2026-10-29  
**App version:** Flow 0.9.0 (beta)  
**Baseline:** everything merged up to PR #613 — published models, the Evidence tab, sections in Draw and Run, the docked Run inspector, Auto Run "Pause when…" conditions and the Flow MCP 0.6 for desktop AI apps  
**Audience:** Simulation practitioners, operations analysts, engineering students

Flow is the discrete-event simulation app in the simmodlr family. Older documents call it DES Studio or simmodlr.

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
   - 4.10 [Share a model with non-modellers (Business view)](#410-share-a-model-with-non-modellers-business-view)
   - 4.11 [Publish a model for anyone to run](#411-publish-a-model-for-anyone-to-run)
   - 4.12 [Record evidence and assumptions](#412-record-evidence-and-assumptions)
   - 4.13 [Organise a large model into sections](#413-organise-a-large-model-into-sections)
   - 4.14 [Build and run models from a desktop AI app (Flow MCP)](#414-build-and-run-models-from-a-desktop-ai-app-flow-mcp)
5. [Troubleshooting](#5-troubleshooting)
6. [Glossary](#6-glossary)

---

## 1. Introduction

Flow is a browser-based discrete-event simulation (DES) platform. It lets you build queue-based models, run experiments, and analyse results — without writing code. Everything runs in your browser: there is nothing to install and no server needed for computation.

**The problem it solves.** When demand temporarily exceeds capacity — patients waiting for a doctor, trains waiting for a platform, calls holding for an agent — the resulting delay is often counterintuitive. A resource that is 90% utilised typically produces waits nine times longer than one at 50%. Running a real-world experiment is costly or impossible, so organisations need to test changes on a model first. Flow makes that model fast to build and statistically rigorous to run.

**Who it is for.** Flow targets:

- **Operations analysts** who need evidence for staffing, capacity, or process-redesign decisions.
- **Engineering students** who are learning DES and want to see theory come alive.
- **Consultants and decision-makers** who need to view, share, or present simulation results without building models themselves.

**What you can do with it:**

| Task | How |
|------|-----|
| Define entities, queues, and service logic | **Define** editors, **Draw** (Visual Designer), or **Describe** (AI Generator) |
| Encode business rules and routing | Predicate Builder (no code, no free-text logic) |
| Run multiple replications and get confidence intervals | One-click experiment runner |
| Debug live simulation state | Run canvas with entity animation, a docked inspector, a step-by-step event log and "Pause when…" conditions |
| Analyse results | Charts, bottleneck analysis, Welch warm-up test, paired-t confidence intervals, ANOVA and Tukey HSD for three or more scenarios |
| Record where the numbers come from | **Evidence** tab: evidence, assumptions and coverage, attached to elements and parameters |
| Share results | A public link to one run's results dashboard |
| Publish a model | A public page anyone can open and run in their own browser, no account needed |
| Export model as Python code | **Access → Export SimPy** — downloads a runnable `.py` file or runs it in the browser |
| Work from a desktop AI app | **Connect AI app** — the Flow MCP lets Claude Desktop, Claude Code and other MCP apps build, check and run models |

### 1.1 The Three-Phase Method — a brief primer

Flow implements Pidd's Three-Phase algorithm. Understanding these three phases helps you build better models.

| Phase | What happens |
|-------|-------------|
| **A — Clock advance** | The simulation clock jumps to the time of the next scheduled event. Nothing happens between events. |
| **B — Bound events** | All events scheduled for this moment fire: arrivals, service completions, machine failures. Bound Events are *time-triggered*. |
| **C — Conditional events** | The engine scans Conditional Events by priority to find anything that *can* now happen given the current state — for example, "patient waiting AND doctor free → start consultation." When one Conditional Event fires, the scan restarts from the top. Conditional Events are *state-triggered*. |

Bound Events handle "what happens when" and Conditional Events handle "what can happen now." This separation keeps the engine's behaviour predictable and theoretically grounded.

---

## 2. Prerequisites

### 2.1 Environment

| Requirement | Detail |
|-------------|--------|
| **Browser** | Chrome 120+, Firefox 121+, Edge 120+, or Safari 17+ |
| **JavaScript** | Must be enabled (it is by default in all modern browsers) |
| **Network** | Stable connection required for login, model save, and AI features |
| **Screen** | Minimum 1024 × 768 px; 1440 × 900 px recommended for the Visual Designer |

Flow runs entirely in your browser. No local installation is required.

### 2.2 Account

Sign up at the Flow URL provided by your organisation. You need:

- A valid email address
- A password (set during sign-up, or via a magic link if your organisation uses that flow)

Anonymous use (models saved to browser storage only, no cloud sync) is available but not recommended for production work. Publishing, Experiments, saved Studies and collaborator sharing need an account.

You do not need an account to open a **published** model (§4.11): the **Explore published** gallery and each model's public page work signed out.

### 2.3 Environment variables (self-hosted deployments only)

If you are running your own instance, create a `.env.local` file in the project root:

```
VITE_SUPABASE_URL=https://[your-project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]
VITE_ENGINE_VERSION=55a
# Optional: show the experimental Data Sources tab
VITE_ENABLE_DATA_SOURCES_TAB=false
```

Obtain these values from your Supabase project dashboard.

---

## 3. Quick Start

### Step 1 — Log in

Open Flow in your browser. Enter your email and password. On sign-in, the **Welcome** dialog appears with four options to get started. Choose an option or click **Skip for now** to go directly to the **Model Library** — your personal list of saved models.

| Welcome option | What it does |
|----------------|-------------|
| **Create a Model** | Opens the New Model dialog — choose to describe, draw, or define your model |
| **Access the Model Library** | Closes the dialog and shows your saved models |
| **Build with AI Tools** | Downloads the AI Prompt Pack for use with Claude, ChatGPT, or any AI assistant |
| **Get Help** | Opens the AI Help Assistant for a guided tour |

### Step 2 — Open a template

In the Model Library, open the **Templates** tab. Search or filter by domain, then click the **M/M/1 Queue** card. Flow opens a copy of the template as a new model: one entity type, one queue, one Bound Event (arrivals) and one Conditional Event (service). You will use this as a learning scaffold.

### Step 3 — Run the model

Click **Run** in the mode bar at the top of the model. The settings summary next to **🎛 Adjust parameters** shows the number of runs, run length and warm-up; click **⚙ Setup** to change them. Then:

- **Step** advances one event cycle at a time, and **Auto Run** keeps stepping at the speed you set. Both animate entities on the Run canvas.
- **⚡ Batch Run** runs every replication at full speed without animation.

The bottom panel (Step Log, Entity Details, Charts and more) starts collapsed; click a tab name to open it.

### Step 4 — Read the results

When a batch run finishes, a summary appears on the Run tab. Click **View Results →** (or **Results** in the mode bar) for the full Results workspace. Key things to look at:

- **Summary cards** — total entities served, average wait time, resource utilisation.
- **Bottleneck section** — which queue had the longest wait.
- **Charts** — queue depth over time, wait-time histogram.

### Step 5 — Change one parameter and re-run

Go to **Design**, click **Define**, then select **Bound Events**. Find the arrival Bound Event and lower the inter-arrival mean (faster arrivals). Click **Save** in the header. Go to **Run** and click **⚡ Batch Run** again. To compare the two runs, open **Results → History**, tick both runs and click **Compare selected**.

For a quick what-if that you do not want to save, use **🎛 Adjust parameters** on the Run tab instead of editing the model.

You have now completed the core Flow loop: build → run → analyse → adjust → re-run.

---

## 4. Common Workflows

### 4.0 Download the AI Prompt Pack

**When to use this.** You want to use an external AI chat (Claude, ChatGPT, etc.) to generate a Flow model from a plain-English description, and you will paste the result back yourself.

Click **↓ AI Prompt Pack** in the Model Library header. This downloads `flow-ai-prompt-pack.md`: the complete schema reference bundled with a ready-to-paste prompt.

**Workflow:**

1. Open the downloaded file and copy the starter prompt.
2. Paste it into Claude, ChatGPT, or any AI assistant.
3. Replace `[YOUR SYSTEM DESCRIPTION]` with a plain-English description of the system you want to simulate.
4. The AI returns a JSON block. Save it as a `.json` file.
5. In Flow, click **+ New Model → Import a file** and select your file (or **Paste model** to paste the JSON).

The same download is available from the **Welcome** dialog → **Build with AI Tools**.

If you use Claude Desktop, Claude Code, Cursor or another app that supports MCP, **Connect AI app** is usually the better route: the assistant can then validate, run and fix the model itself before you import it. See §4.14.

### 4.1 Browse and filter the library

**When to use this.** Your model list has grown and you need to locate a specific model, compare a set of related models, or discover models shared publicly by other users.

The Model Library has four tabs: **My Models**, **Templates**, **Public Library** and **Community**. The header also has **Explore published** (the public gallery of published models, §4.11), **↓ AI Prompt Pack** (§4.0), **Connect AI app** (§4.14) and **+ New Model**.

The **Templates** tab has its own search box, domain filter chips and a **Patterns Guide**; click a template card to open a copy of it. The My Models, Public Library and Community tabs each include a toolbar above the grid with the following controls:

| Control | What it does |
|---------|-------------|
| **Search bar** | Filters by name and description as you type. Press ✕ to clear. |
| **Sort dropdown** | Orders results by Last modified (default), Name A→Z, Most runs, or Version. |
| **Tag chips** | Appear when any model in the current tab has tags. Click a chip to show only models with that tag; click again to deselect. Multiple chips use OR logic — models matching *any* selected tag are shown. Click **Clear tags** to reset. |

**Clicking a tag chip on a model card** also activates that tag as a filter, so you can drill in from any card without opening a separate filter panel.

**No results after filtering?** A "No models match your filters" message appears with a **Clear filters** button that resets search and tags in one click.

**Adding tags to your models.** On your own model cards in **My Models**, type into the **+ tag** field and press Enter; click a tag's ✕ to remove it. Give models descriptive tags (e.g. `healthcare`, `queueing`, `high-priority`) to make them easy to find later.

**Card badges.** A card shows visibility, a health chip (green no issues, amber warnings, red errors), the run count, the latest version (**V{n}**) and, for scenario copies, **Scenario** or the number of scenarios based on it.

### 4.2 Build a model from scratch

**When to use this.** You know your system well enough to define it element by element.

1. From the Model Library, click **+ New Model**. The dialog offers:

   | Option | What it does |
   |--------|-------------|
   | **Model assistant** (recommended) | Name the model, then build it in conversation with the AI on the **Describe** tab (§4.3) |
   | **Draw** | Name the model, then start on the Draw canvas with a starter flow already placed |
   | **Use a template** | Opens the Templates tab |
   | **Import a file** | Upload a `.json` model; it keeps its name |
   | **Paste model** | Paste model JSON from the clipboard; it keeps its name |

2. For a model built by hand, choose **Draw**, give it a name and an optional description, and continue.
3. In **Design**, the toolbar has these buttons:

   | Button | What it does |
   |--------|-------------|
   | **Draw** | Opens the canvas-based Visual Designer. Build and rearrange your model graphically. |
   | **Describe** | Opens the AI Generator. Describe your system in plain English and let the AI create a first draft. |
   | **Define** | Opens the structured editors. A second bar appears below with the sub-sections listed next. |
   | **Model Health** | Appears when there are validation issues. Shows errors (red, must fix) and warnings (amber, proceed with caution). |
   | **View definition** | Opens a printable, plain-language document describing the whole model. |

   When **Define** is active, select each sub-section in the bar below it:

   | Define sub-section | What to do |
   |--------------------|-----------|
   | **Entity Types** | Add one entity type per distinct object class (e.g. "Customer", "Train"). Set attribute names, types (`number / string / boolean`), and default values. For server entity types you can also set a **Weekly Schedule Pattern** (a 24×7 grid editor for repeating capacity), a **Shift Schedule** (time-based or condition-triggered), and shift-change behavior (Delay / Preempt / Suspend). |
   | **Queues** | Add a queue for each waiting point. Set discipline (FIFO, LIFO, PRIORITY, SPT, EDD). Set capacity if finite. |
   | **Model Data** | Declare small named building blocks that other parts of the model reference by name: Skills (server capabilities for skill-based routing), Containers (tanks/buffers — capacity and initial level are also adjustable and sweepable from the Run tab, Scenario Manager, and Access-tab curation, not just here), Distances (travel time between queues), and State Variables (counters, switches and tracked values such as total cost). |
   | **Bound Events** | Add arrival events (with a distribution) and service-completion events. Use the distribution picker to choose Exponential, Uniform, Triangular, Fixed, Erlang, Empirical, or other supported types. |
   | **Conditional Events** | Define the conditions under which service starts: entity waiting AND server idle. Use the Predicate Builder — a point-and-click condition builder that prevents type mismatches. Each Conditional Event has an **Activity Type** toggle: **Service (claim resource)** seizes a server entity; **Delay (no resource)** just holds the entity for a sampled time with no server involved (e.g. a recovery period, a fixed processing wait). Picking **Delay** swaps the Effects picker for a single **Source queue** select and auto-writes `DELAY(QueueName)` — see §5.4 for how to configure what happens when the delay ends. |
   | **Sections** | Group elements into named, described sections (§4.13). |
   | **Time & Schedules** | Set the time unit and real-world epoch, and create named timetables for time-varying arrival rates. Import timetable rows from CSV or Excel and link them to Bound Events. |
   | **Goals** | Service-level targets, e.g. "95% of customers wait less than 5 minutes". Results show each goal as met or not met, and sweeps colour feasible points. |
   | **Evidence** | Record the evidence and assumptions behind the model and attach them to elements and parameters (§4.12). |
   | **Data Sources** | Hidden by default while external-data integration is reviewed. Existing source configurations and models are preserved. |

4. The **Model Health** button in the Design toolbar appears whenever there are validation issues. Click it to see each issue with its rule code; click an issue to jump to the editor that fixes it. Errors (red) block running; warnings (amber) let you run with a caution.
5. Click **Save** in the header (or press Ctrl+S). **↩ Undo** and **↪ Redo** in the header step through your edits.

**Tips:**
- Use descriptive names for entity types (e.g. "Patient" not "Entity1").
- If you use a PRIORITY queue discipline, the entity type needs a `priority` attribute of type `number`.
- Bound Events set *when* things happen. Conditional Events set *what can happen given the current state*. If nothing is happening during a run, check your Conditional Event conditions.

**Visual Designer.** Click **Draw** in the Design toolbar to open the canvas-based Visual Designer and build or rearrange the same model graphically. Nodes carry at-a-glance design detail — a Source or Activity's distribution label, a Queue's discipline and capacity badge, an edge's "N routes" badge for multi-way splits, and (for balking/reneging or advanced activity types) a status badge — and Containers get their own dedicated canvas node showing capacity and level. You can edit a node's description inline in the inspector without switching tabs, and widen or narrow the inspector by dragging its left edge (or focusing the edge and using ←/→; double-click resets it) — the width is remembered. A time-varying (piecewise) distribution lists its periods collapsed to one-line summaries such as `t=480 · Exponential(mean=9)`; click a period, or **Expand all**, to edit it. Any "Edit in the X tab" pointer is a clickable jump link that opens the right Define tab with the exact card already expanded. Rework/loop-back connections route through a dedicated lane below the main flow so they don't cross over unrelated nodes. The inspector also has an **Evidence** block for the selected queue, activity or container: how well it is backed, how many of its parameters are backed, the records attached, and an **Open in Evidence tab** link (§4.12). Use **Pan** mode to move around the diagram. Use **Select** mode, or Shift/Ctrl-click with a mouse, to select more than one node; Shift/Ctrl-click a selected node to remove it from the selection again — this works the same whether the nodes were selected one by one or with a box-drag. Once nodes are selected, the toolbar above the canvas shows how many are selected and lets you clear the selection or delete the selected nodes together. Dragging a selected group moves the whole group and saves the updated layout with the model. Press **Ctrl+D** to duplicate the current selection in place, or **Ctrl+C**/**Ctrl+V** to copy and paste elsewhere on the canvas — duplicates land disconnected, ready to be wired up. While dragging a single node, dashed **alignment guides** appear whenever the node's edges or centre line up with another node's — release while a guide is showing and the node snaps exactly into alignment. Placement is otherwise free — nodes don't snap to a background grid, so the alignment snap is the only snap. (For aligning several nodes at once, select them and use the toolbar's align/distribute tools instead.) Moving and arranging nodes never changes model logic — only positions. If a structural canvas edit would overwrite an advanced effect that only the Define editors can express (such as co-seizing several servers), the canvas refuses with a message pointing you at the right editor rather than silently simplifying your model.

**Multiple routes from one activity.** Drawing a second connection out of an activity to a different queue (or to a sink) automatically splits the traffic evenly between the routes — two connections split 50/50, three split evenly three ways, and so on — so the model stays runnable even before you fine-tune it. Click any one of an activity's outgoing connections to open its routing dialog: switch between **Probabilistic routing** (set a % split per branch) and **Conditional routing** (route based on entity attributes, using the same Condition Builder as elsewhere in the app), add or remove branches, and retarget a branch to a different queue or "Exit system." A running total at the bottom shows a green check when the percentages add up to 100%, or a red warning if they don't. The dialog also opens automatically right after you draw a new branch, so you can adjust the split immediately.

### 4.3 Generate a model with AI

**When to use this.** You have a scenario in mind but do not want to configure every element manually.

1. Choose **Model assistant** in the New Model dialog, or open an existing model and click **Design → Describe**.
2. In the **Describe** conversation, type a plain-English description of your system (or use the microphone button). Be specific:

   > "A hospital emergency department with two triage nurses and four doctors. Patients arrive on average every 8 minutes. Triage takes 3–7 minutes; consultation takes 10–25 minutes. High-priority patients are seen before low-priority ones. The target is that 90% of patients are seen within 30 minutes."

3. Press Enter to send (Shift+Enter for a new line). The assistant asks about anything it needs, one question at a time, and then shows what it understood. Confirm it, or correct it, and it builds the model.
4. Click **Review proposal** (the **Proposal** pane on a narrow screen). The proposal lists every element as added, removed, modified or unchanged. Check:
   - Entity types match your description.
   - Queue disciplines are correct (PRIORITY if you described priority patients).
   - Distribution means are realistic.
5. Choose **Apply model** (or **Apply & Save All**) to take the whole proposal, **Apply Selected** to take only the elements you ticked, **Refine this** to ask for changes, or **Discard**.

**Tips:**
- To change an existing model, describe the change ("add a second doctor to triage"). The assistant edits the current model rather than starting again.
- Generated models pass the same validation as hand-built ones. Fix any errors shown in Model Health before running.
- When you apply a proposal, Flow adds any **assumptions** the assistant recorded to the Evidence tab (§4.12). It never adds evidence from the assistant, because the assistant has no sources, and it never overwrites records you already have.

### 4.4 Run an experiment and read results

**When to use this.** You have a valid model and want statistical results.

1. Click **Run** in the mode bar. The Run tab has three views: **Run** (the canvas and run controls), **Experiments** (saved run configurations) and **Studies** (sweeps and other multi-point studies, §4.5).
2. Click **⚙ Setup** to open **Run setup**. Your settings are kept as the model's experiment defaults:

   | Setting | Guidance |
   |---------|---------|
   | **Run name** | Optional label for the saved run (e.g. "Baseline"). |
   | **Ignore early results** | Warm-up period. Statistics from this initial stretch are discarded. After a batch run, **Suggest a value** runs the Welch warm-up test and offers **Use this suggestion**. |
   | **Number of runs** | Replications. Use 10–30 for initial exploration and more for decisions. More runs give narrower confidence intervals. Your plan sets the maximum (see **Run limits** in §4.7). |
   | **Random starting point** | The seed. Use the same seed for reproducible results, or **Randomise**. |
   | **When should the run stop?** | **Run for** a run duration (e.g. one working day = 480 minutes), or **Stop when this becomes true** for a condition. |
   | **Extra options** | **Show entity movement (Step and Auto Run)**; **Keep chart data during the run** (turn off to save memory on long runs); **Let in-flight entities complete** (the purge period: after the run length, new arrivals stop and entities already in the system finish); **Force event trace** (only offered when a large run turned the trace off). |
   | **Archive detail** | How much of each saved run is stored: **Minimal**, **Standard** or **Full**. Full keeps the event-by-event log. |
   | **Timetable** | Shown when the model has more than one named timetable (e.g. Weekday, Weekend). Pick the one to use. |

   **Check Model** runs structural checks on the model before you start, and **⟳ Reset** puts the simulation back to time zero.

3. Start the run. The Run canvas opens at roughly the same pan and zoom you last had on the Draw canvas for this model, so the layout doesn't shrink when you switch screens (falls back to fitting the whole model if you haven't drawn it yet, or on another device). The canvas fills the available window height by default — drag its bottom edge to resize manually. A one-line **run readiness** strip above the canvas summarises "Ready to run" or "Needs attention" plus any advisory count; click **Details ▸** to see the full breakdown (a genuine blocking issue always shows full detail automatically). To *watch* entities move through the system, use **Step** (one event cycle per click) or **Auto Run** (continuous, with a speed slider) — coloured dots travel the edges as entities arrive, get served, route between stages, and complete. Nodes carry their own live status too: Activity nodes flash when service starts and hold a busy/idle/failed border colour; Source nodes show a running arrival count; and balking or reneging is animated rather than silent — distinctly coloured tokens, a running "N balked"/"N reneged" count on the Sink, and a pulse on the affected Queue. **⚡ Batch Run** computes the full replication set at maximum speed *without* animation; a summary appears on the Run tab and **View Results →** opens the Results workspace. If the run would break a plan limit, the button shows the number of blockers instead. During execution, the sidebar and header collapse to give maximum canvas space, and a compact run bar appears with **Step**, **Auto Run**, speed, and **Cancel** controls. A **⚠** badge in the run bar shows real-time warnings when utilisation, starvation, or queue capacity thresholds are exceeded — click it to see details.

   Want Auto Run to stop by itself when something interesting happens? Click **⏸ Pause when…** next to the speed slider (it is in the run bar too) and add one or more conditions: **an entity enters a queue**, **a queue reaches a length** (at least N waiting), or **simulation time reaches** a value. Auto Run checks the conditions after every event cycle and stops on the first one that becomes true, with a banner saying what happened and when, so you can inspect the canvas, the Step Log and the node inspector at that moment. Press **Auto Run** again to carry on. A condition that is already true when you start waits for the next change: a queue-length condition fires again only after the queue drops below N and climbs back, and a time condition fires once. Conditions are saved in your browser for each model; they do not change the model and do not affect Batch Run.

   Want to try a different value before you run — say, one more server, or a longer arrival gap — without setting up a Named Scenario or a saved Experiment first? Click **🎛 Adjust parameters** next to the run settings summary. It opens the same searchable parameter browser used elsewhere in Flow; pick a parameter, type a new value, and it applies to every run (Step, Auto Run, or Batch Run) until you reset it or switch models. Nothing is saved — the change lives only in your browser tab for this visit. If you decide the change is worth keeping, **Save as Experiment…** carries it straight into a named, reusable Experiment.

   **Watching a run.** Click a queue, activity, container or section card on the Run canvas to open it in the **inspector** docked beside the canvas (described under **Node inspector** in §4.7). The **Switches** readout on the canvas shows state variables as ON/OFF or values, and flashes when one changes. With sections defined, the **Detail | Sections** switch at the top left of the canvas swaps the detailed nodes for one live card per section (§4.13).

4. When the run completes, **Results → Summary** shows:

   | Section | What it tells you |
   |---------|------------------|
   | **Key Findings** | Critical issues (saturation, starvation, growing queues) flagged at the top above all other results with actionable improvement suggestions, reported as per-run averages rather than raw batch totals. |
   | **Summary** | Entities arriving, served, reneged, and **balked** (declined to join a queue on arrival — now tracked as its own live-KPI tile with a full outcome record, rather than simply vanishing). Average wait, service time, and utilisation. Goal pass/fail. |
   | **Bottlenecks** | Which queues have the longest average waits. Peak queue depth. |
   | **Activity Throughput** | Per-activity completion counts, so you can see which process step — not just which resource — is driving overall throughput. |
   | **Interruptions** | Per-resource preemption counts, useful alongside Starvation and Schedule Adherence for diagnosing failure/priority-preemption models. |
   | **Queue Rejections** | Balked and blocked counts broken down per queue, so you can see exactly where in the flow entities are being turned away or declining to join. |
   | **Skill Utilisation** | Per-skill utilisation across every server instance offering that skill — correctly aggregated across multi-replication batch runs — useful for spotting a scarce skill as the real bottleneck. |
   | **Analysis** | Confidence intervals, Welch warm-up diagnostic, replication-level variance. |
    | **Utilisation (per-shift)** | For server entity types with a weekly schedule pattern, a collapsible **Per-Shift Utilisation** section shows a horizontal bar chart breaking down utilisation by shift (e.g. Mon 08:00–16:00, Tue 16:00–00:00). Each bar shows % busy alongside the number of entities claimed by capacity unit. |
    | **Schedule Adherence** | Each resource card in the Results workspace shows a colour-coded adherence line: green if overall utilisation is within 10 % of the expected schedule utilisation, amber if within 25 %, red if the gap exceeds 25 %. Hover to see the actual utilisation vs. expected values. |
    | **Starvation** | Per-resource time and percentage spent starved — server idle because its queue was empty, not because it was recently freed. High starvation means the server is capacity-constrained on the supply side; consider whether upstream stages need balancing. |
   | **Run Effort** | Replications completed, total sim time, wall-clock duration. |

   The Results workspace has four views: **Summary**, **Log**, **Entities** and **History** (every saved run: label, tag, archive, compare, explain, share, export). With sections defined, Summary also has a **Sections** block with per-section figures and entity pathways across sections.

   The Run tab's **Live Metrics** bottom-panel tab has collapsible sections (Queues, Servers, Journey Outcomes, Journey Paths, Sections, B-Events, C-Events); the app remembers which you collapsed.

**How wait time is calculated.** The average wait time includes all entities that spent time in a queue: served entities, reneged entities (those that left the queue before service), and in-progress entities still waiting when the simulation ends. In-progress partial waits are half-weighted (standard DES practice). A separate Little's Law estimate (`L_q / arrival rate`) is computed from the time-averaged queue length and checked against the per-entity average; when the two estimates disagree by more than 5%, the run may be too short for reliable wait-time estimates.

5. Click **✨ Simulation Assistant** in the mode bar to explore the results:
   - Click **Analyse** for a plain-English narrative of the results with structured improvement suggestions.
   - Click **Compare** to compare against a saved historical run.
   - **Refine Plan** (only when the model has a timetable) suggests timetable changes.
   - Use the text input to ask specific questions about the results (e.g. "Which queue had the longest wait?").

   The **Export ▾** button sits in the toolbar next to the run controls. Click to open a three-section popover: **Results Data** (Full JSON, Metrics-only JSON, CSV), **AI & Reports** (LLM Bundle, Create Report), and **Reference** (Schema reference showing the JSON structure).

### 4.5 Compare scenarios with a parametric sweep

**When to use this.** You want to know how a KPI changes as you vary one or two parameters (e.g. "How does average wait change as I add servers from 1 to 5?").

1. Go to **Run** and click **Studies**.
2. Choose the kind of study:

   | Mode | What it does |
   |------|-------------|
   | **1D Sweep** | Varies one parameter over a range (min, max, step) |
   | **2D Sweep** | Varies two parameters over a grid (capped at 50 points) |
   | **Sampled** | Samples a set number of points across ranges for several parameters, and ranks which parameters matter most (**Sensitivity**) |
   | **Sequential** | Starts from a saved Experiment or a point from an earlier Study and narrows the ranges around it |

3. Pick each parameter from the searchable browser (servers, capacities, distribution parameters, state-variable starting values, container levels…) and set its range. Give the study a name, and optionally an **Objective** and **Direction** (minimise or maximise a KPI).
4. Run the study. The engine runs the full replication set for each point.
5. Results appear as a line chart (1D), a heat map (2D) or a ranked table. Each point shows the mean KPI with its 95% CI; with goals set, points that miss a goal are marked red. Pick two points to compare them as scenarios; on a Sampled or Sequential study, **Promote to Experiment** keeps a point's settings.
6. When signed in, every completed study is saved and listed under **Past studies** so you can **Load** it again. The Simulation Assistant can also propose a study; it opens here pre-filled for you to review.

**Experiments.** **Run → Experiments** holds named, reusable run configurations: parameter overrides plus run settings. **+ New Experiment** creates one; each saved experiment can be **Load**ed (to run on the canvas), **Run**, **Edit**ed or **Clone**d. **Save as Experiment…** in **🎛 Adjust parameters** starts one from your current ad-hoc changes.

**Named scenarios (Overview tab).** A sweep varies a parameter over a *range*; when you instead have a handful of *discrete alternatives* to compare — "current staffing" vs. "double clerk staffing" vs. "add a second counter" — use the **Named Scenarios** panel on the model's **Overview** tab:

1. Click **+ New Scenario**. Give it a descriptive name, then add one or more parameter changes via **+ Choose parameter** — a searchable, category-grouped browser; picking a setting pre-fills its current value ready to override. Optionally set a seed and replication count.
2. Saved scenarios appear as a list with checkboxes. Tick the scenarios to compare — you can include **Base model (current parameters)** as one of the groups.
3. Click **Compare selected**. Each group is run fresh in your browser. With exactly 2 groups you get the paired-t comparison table (mean difference with confidence interval per KPI). With 3 or more groups you get a one-way ANOVA significance test plus Tukey HSD pairwise comparisons, so you can see not just *whether* the alternatives differ but *which pairs* differ.

Scenarios store only the parameter changes, not a copy of the model, so they always run against the model's latest version. Comparison runs are computed on demand and are not saved to the run history.

### 4.6 Share results with stakeholders

**When to use this.** You need to present or hand off results to someone who will not run the model themselves.

1. Go to **Results → History** and find the run you want to share.
2. Click **Create Report** on the run (or **Export ▾ → Create Report…** anywhere results are shown). Choose:
   - **Senior Management Report** — results and recommendations in plain English, with goal pass/fail.
   - **Technical** — full statistical tables, CI values, replication detail.
   - **Format:** HTML (styled, opens in a browser) or Markdown (portable, version-controllable).
3. The report downloads. It is built from the run's own results and its saved model snapshot; recommendations and the model description are written by the AI. When the model records evidence or assumptions, the report includes an **Evidence and assumptions** section.
4. To share the live results instead, open the run's **⋯** menu and choose **🔗 Create share link**. Anyone with the link can view that run's results dashboard, read-only, without signing in. **✕ Unshare** turns the link off.

To let people run the model themselves, see §4.10 (collaborators with an account) and §4.11 (anyone, by publishing).

### 4.7 Additional features

**Voice input.** The AI chat dialogs — Help Assistant, Simulation Assistant, and AI Diagnostics — each include a microphone button. Clicking it activates the browser's Speech Recognition API so you can dictate questions or describe changes verbally instead of typing.

**Run assistant.** On the Run tab, open **✨ Simulation Assistant** and choose **Design** for model questions,
**Diagnose** to investigate a completed run, or **Debug** for a conversation about
the run trace. In the side panel, compact overlay and phone view, the title,
close button and mode controls stay above the scrolling content. Scroll the
active mode to read longer findings or conversations. Diagnose and Debug need
a completed run; switching back to Design retains your unsent model question.

**Live warnings during runs.** While a simulation is running in Step or Auto Run mode, a compact **⚠** badge appears in the run bar. This badge monitors real-time conditions — resource utilisation exceeding safe thresholds, server starvation, and queue capacity warnings — and updates as the run progresses. Click the badge to expand a panel showing each active warning with the affected resource or queue and the current value. Warnings are only active during execution and disappear once the run completes. They are designed to help you spot problems early without waiting for the full results analysis.

**Key Findings.** After a run completes, the Results workspace surfaces critical health flags in a **Key Findings** section above all other results. These flags automatically detect:

| Finding | What it flags |
|---------|--------------|
| **Saturation** | A resource is utilised above 90% — demand exceeds near-term capacity. The queue feeding this resource is your primary bottleneck. |
| **Starvation** | A resource has significant idle time because its input queue is empty — indicates an upstream bottleneck or over-capacity. |
| **Growing queues** | Queue depth is increasing at the end of the simulation — the system has not reached steady state and waits are still rising. |
| **Reliability** | Resource downtime (from failure/repair cycles) is materially affecting throughput. |

Each flag includes an actionable suggestion: adding capacity, rebalancing upstream stages, extending simulation time, or addressing reliability. Key Findings replaces the need to scan individual charts for problems — the critical issues are surfaced first.

**Node inspector.** Click a queue, activity, container or section card on the Run canvas to open its inspector beside the canvas, the same way the Draw inspector works: it never covers the page header or the Simulation Assistant. Widen or narrow it by dragging its left edge (or focusing the edge and using ←/→; double-click resets it) — the width is remembered. Before the run has started, an activity's inspector says there is no live data yet. Queue, delay and resourced activity inspectors share one layout: summary cards (for a queue: waiting, capacity, longest and average wait; for a delay: how many are held, longest and average time), a fill or utilisation bar where it applies, and one card per entity or server. Click any underlined entity id to open that entity in the bottom panel's **Entity Details** tab. On a phone-sized screen the inspector sits over the right of the canvas instead.

**Bottom Panel.** The collapsible bottom panel on the Run tab is collapsed by default, keeping the canvas maximised. Its tabs are **Step Log**, **Entity Details**, **Resources**, **Charts**, **Live Metrics**, **State Variables** (current values plus a history of each change and the event that made it, for single runs) and **Future Events** (the Future Event List). Click any tab name to expand the panel at that tab — your expand/collapse choice is remembered for next time. The panel has a touch-friendly resize handle along its bottom edge — drag down to make it taller and up to make it shorter. The **Step Log** tab shows only the last 50 event entries for readability; during a run this scrolls automatically as new events arrive. Click on an entity in the Entity Table or on the Run canvas to open the **Entity Inspector** for that entity's full state and history.

**Optimise.** Inside the Simulation Assistant (in Design, Run or Results), click **⚡ Optimise** to run an adaptive batch analysis: Flow adds replications in rounds until the 95% confidence interval is within ±5% of the mean or your plan's replication limit is reached, then the AI reports bottlenecks, quick wins and investment opportunities. Each suggestion has an **Apply ↗** button that proposes the change to the model with a before/after diff so you can review it before committing.

**Schedule Manager.** **Define → Time & Schedules** lets you create named timetables for time-varying arrival patterns. You can import arrival rows from CSV or Excel files (including multi-event imports) and link timetables to Bound Events.

**Run limits.** Each plan has limits on a single run: the number of runs (replications), the run length and the estimated amount of work (condition checks per replication). Limits come in three tiers. The defaults are: Free, 10 runs and a run length of 10,000; Standard, 30 runs and 50,000; Pro, 500 runs and 200,000. Which tier each plan gets, and the limits themselves, are set by your administrator (out of the box a Pro plan gets the Standard tier, and Enterprise or Pro Plus gets the Pro tier). The run readiness strip explains any limit a run would break before you start. A published model's visitors get their own limit of 30 runs and a run length of 200,000, because their runs use their own computer (§4.11).

**Per-outcome results.** The Results tab shows a Journey Outcomes section that breaks down completed entities by route (COMPLETE, RENEGE, and other terminal outcomes), with average wait time and average time in system reported separately per route.

**Export and run SimPy Python.** Go to the **Access** tab and click **Export SimPy** (owners only) to open the SimPy dialog.

A dialog shows whether the script is **Category 1** (complete) or **Category 2** (partial). For Category 1 models you have two options:

- **Run in Browser** — executes the SimPy script directly in your browser tab via Pyodide (Python compiled to WebAssembly). No Python installation required. A progress bar tracks each replication; when all replications finish the results are loaded into the app and available in the Results workspace alongside any JS-engine runs. The first run downloads Pyodide (~25 MB, cached afterwards); subsequent runs start immediately. Browser runs are saved to your run history with the label `SimPy  DD/MM/YYYY HH:mm` and appear in **Results → History**. The Results workspace shows enriched KPI cards for SimPy runs: Arrived, Served, Completion Rate, average wait, wait percentiles, average service time, average sojourn, per-resource utilisation, and schedule adherence for weekly-pattern resources.
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

1. **Define skills** — Go to **Define → Model Data**. Scroll to the **Skills** section. Type a skill name (e.g. "Triage", "Surgery", "X-Ray") and press **Enter** to add it to the model's skill registry. Repeat for each skill your model needs.

2. **Assign skills to servers** — Go to the **Entity Types** tab. Expand a server entity type. If skills are defined, a **Skills** panel appears with checkboxes for each registered skill. Tick the skills this server type possesses. A doctor might have "Surgery" and "Consultation"; a nurse might have "Triage" and "Monitoring".

3. **Use skills in Conditional Events** — Go to the **Conditional Events** tab. When you pick an ASSIGN or COSEIZE effect, the dropdown now shows skill-filtered options:
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

**Setting skill requirements on arrival (entity-side).** Instead of hardcoding one skill name per Conditional Event, you can give arriving entities different skill requirements using a weighted string attribute on the customer type:

1. **Add a string attribute** — In the **Entity Types** tab, expand your customer type. Add an attribute (e.g. `requiredSkill`) with value type **String**.

2. **Choose Weighted mode** — Click the **Weighted** radio button (instead of Static). Add option rows: each row has a value and a relative weight. For example: Surgery weight 40, Consultation weight 30. One option can be set to **no requirement** — entities that get this value will match any idle server.

3. **Read the visual bar** — The bar always fills 100% width. Coloured segments show each option's proportion. Any remaining portion is labelled **No requirement** and produces no skill filter at runtime.

4. **Connect in a Conditional event** — Go to the **Conditional Events** tab. When you pick an ASSIGN effect, the dropdown now shows `Start service with Doctor (left-arrow Entity.requiredSkill)` — select this to have the engine read each entity's `requiredSkill` attribute at runtime. The Conditional event uses `ASSIGN(Queue, Server, Entity.requiredSkill)`.

5. **Falls back cleanly** — If an entity's `requiredSkill` is null or empty, the ASSIGN matches any idle server of that type (no skill filter). If no server with the matching skill is idle, the ASSIGN fails as usual and the Conditional event will re-evaluate on the next pass.

This means one Conditional event handles all skill variations — no duplicate Conditional events per skill name. Combined with schedule-based overrides (see Schedule Manager), you can vary required skills per time slot.

**Routing to the shorter of two queues.** By default, a condition's value field only accepts a fixed number. To compare against another live value instead — "route to whichever queue currently has fewer people waiting" — open the **Condition Builder** on a routing table, Conditional event condition, or balking condition, add a clause with a number-type variable (e.g. `Number of Patients in Queue A`), and use the small **Number / Dynamic** toggle next to the value field. Switch it to **Dynamic** and a second dropdown appears listing the same queue/server/container values available on the left side — pick `Number of Patients in Queue B` to compare the two directly (`queue(A).length < queue(B).length`). This works anywhere a condition is built: Conditional event conditions, routing tables, balking conditions, and per-schedule `when` clauses.

**Ending a service when a condition becomes true, not on a timer.** Most services end after a sampled or fixed duration. For services whose length depends on something happening elsewhere in the model (e.g. "the doctor stops when the ward is cleared," not a fixed 20 minutes), add a Conditional event whose condition checks that state and whose effect picks **FINISH ServerType's current service immediately** from the effect dropdown (`FINISH(ServerType)`). The engine re-checks every condition after each event, so service ends the instant your condition becomes true — no scheduled delay involved. If no server of that type happens to be busy when the condition fires, FINISH simply does nothing. If more than one server of that type is busy, the "by criterion" composer lets you target a specific one — by a priority attribute, or by whoever's been in service longest/shortest — instead of always finishing whichever one happens to be first; the same criterion picker is available for PREEMPT.

**Letting urgent work interrupt less urgent work (preemptive priority).** By default, a priority queue only decides who is served *next*; a job already in service is never interrupted. To let an urgent arrival take a server from a less urgent job when none is free (a trauma case taking a doctor from a routine consultation):

1. Give the waiting queue a ranking discipline — **PRIORITY(attr)** on an urgency attribute (lower value = more urgent), or PRIORITY, SPT or EDD.
2. On the Conditional event that serves that queue, open the effect builder, choose **ASSIGN**, pick the queue and server type, and tick **May interrupt a lower-priority job (PREEMPT)**.
3. Optionally set **Rank by** (an entity attribute, instead of the queue's discipline), **Interrupted job** (*resumes with its remaining time* — the default; *restarts its full time*; *gets a new sampled time*; or *goes to another queue*), and **max per job** (the most times one job can be interrupted).
4. The condition only needs `queue(Q).length > 0` — no counter of jobs in service and no separate "preempt" event.

The effect reads e.g. `ASSIGN(TraumaQueue, Doctor, PREEMPT, PRIORITY(priority))`. An idle server is always used first. Otherwise the busy server whose job ranks lowest — strictly below the front of the queue — is interrupted and goes straight to the waiting job; jobs of equal rank never interrupt each other. The interrupted job goes back to its queue, its original completion is cancelled, and the service it already received counts as service, not waiting time. The Visual Designer inspector shows the setting as a **Preemption** row. Model Health warns (V81) if the queue doesn't rank jobs (so nothing would ever be interrupted), if the rank attribute is missing, or if a Conditional event fires a plain `PREEMPT` without checking that no server is idle. The **Priority ED with Balking** template shows the pattern. SimPy export translates this form to `simpy.PreemptiveResource` (see the SimPy export guide for what differs).

**Matching only compatible pairs.** MATCH normally pairs whichever entity is at the front of each of two queues — useful when any pairing is acceptable (e.g. drivers and riders). When pairings must satisfy a rule (blood-type compatibility, a required certification matching a request), open the effect builder's MATCH option and fill in the compatibility field, e.g. `Entity.bloodType == Other.bloodType` — `Entity` refers to the candidate from the first queue, `Other` to the candidate from the second. The engine scans both queues for the first pair that satisfies the rule instead of always taking the front two; if no pair qualifies, it waits for the next opportunity.

**Making a service also consume a physical resource.** Some activities need both a member of staff/equipment *and* a limited consumable — a test kit, a dose, a spare part — and should only start when both are available. Rather than modelling this as a separate `DRAIN` alongside `ASSIGN` (which can start the server even when the consumable runs out), open the effect builder, choose an option under **"ASSIGN gated by consumable container"**, and pick which container and how much it consumes. This produces `ASSIGN(Queue, Server, ContainerId:amount)` — the server claim and the container's level check happen together: if the container doesn't have enough, the server is never claimed and the entity keeps waiting, exactly as if the server itself were unavailable. Add a skill requirement in front of the container clause if needed: `ASSIGN(Queue, Server, "Skill", ContainerId:amount)`.

**Reusing attributes and skills across similar entity types.** When several entity types are variations on a common theme — several patient sub-types that all need the same base intake attributes, or several nurse grades that all share a base skill set plus their own specialty — you can avoid redeclaring the shared fields on every type. In the **Entity Types** tab, expand a type and use the **"Inherits from"** dropdown to pick another entity type of the same role. The child type's attributes, skills, and skill profiles are combined with its parent's at run time — if the child declares its own attribute or skill with the same name as the parent's, the child's own definition wins; everything else is inherited unchanged. This only works between two customer types or two server types (not across the two), a type can't inherit from itself, and inheritance chains can't loop back on themselves — the editor won't offer a choice that would create either problem, and the engine's validation catches it if one somehow gets set anyway. If the types don't actually share much, or the overlap is a one-off coincidence, it's simpler to just leave them independent.

**Catching routing mistakes in a multi-stage process.** When a customer type is meant to move through a fixed sequence of stages — Triage before Treatment before Discharge, or an approval pathway with a set order — you can declare that order and get a warning if a routing change accidentally sends entities backward through it. In the **Entity Types** tab, expand a customer type, open **Required Sequence**, and add the queues in the order they should be visited (use the ↑/↓ buttons to reorder, ✕ to remove). This doesn't change how the simulation runs — the engine still routes entities exactly as your Conditional events and routing tables say — it's purely a design-time check: after each edit, validation retraces how this entity type actually flows through the model and flags any routing step that jumps back to an earlier stage than declared. A copy-paste mistake in a routing table (accidentally pointing a completion event at Triage instead of Discharge) shows up immediately instead of silently corrupting your flow statistics. Intentional rework loops (send back for re-treatment, escalate and retry) are not blocked — the warning just asks you to confirm that a particular backward step is on purpose.

**Modelling travel time between locations.** When part of a process involves physically moving something — a courier between a warehouse and a customer, ground crew between gates, a delivery vehicle between depots — you can make that leg's duration reflect an actual distance and speed instead of picking an arbitrary fixed or random time. Open the **Model Data** tab and add a **Distance** between the two queues involved (they don't need to be adjacent in your model — one entry covers travel in either direction). Then, on the Conditional event that starts that leg, pick **Distance** as the schedule's delay distribution: choose the from/to queues, whether the speed comes from the assigned server or the arriving entity, and which numeric attribute holds the speed value. The engine computes duration as distance ÷ speed at the moment the leg starts. If you later add more legs, or forget to declare a distance for a pair you're using, validation warns you rather than silently running with a zero-length leg. See the built-in **"Courier Ground Transport"** template (Logistics) for a working two-leg example.

**Sections (large-model organisation).** Group a large model into named, described sections and view them as cards in Draw and Run. See §4.13.

### 4.8 Export results for external analysis

**When to use this.** You want to analyse results in an external tool — paste into an LLM (Claude, ChatGPT, Gemini), load into a Python notebook, consume from an R script, or connect from a BI tool.

The unified **Export ▾** popover is available wherever results are present: on the **Run** tab toolbar, in the **Results** workspace when viewing saved run results, and per-run in **Results → History** (**Export results ▾**). The popover is disabled until at least one run completes.

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
| Model definition | Entity types and attributes (including weekly schedule patterns), queues and disciplines, Bound Event and Conditional Event logic, performance goals |
| Experiment configuration | Replications, warm-up period, max sim time, seed, schedule |
| Headline KPIs | Average wait, average service time, average sojourn, throughput, renege rate |
| Per-queue wait table | mean, p50, p90, p95, p99 for every queue |
| Per-resource utilisation | Utilisation percentage and busy/idle counts for every server. For schedule-pattern resources: per-shift utilisation breakdown and schedule adherence. |
| Confidence intervals | 95% CI per KPI (present only for multi-replication runs) |
| Goals pass/fail | Each performance goal with its target, actual value, and PASS/FAIL status |
| Replication summary | Seed, served, reneged, and avgWait per replication (for multi-replication runs) |

**How to download:**

1. Complete a run (single replication or multi-replication).
2. On the Run tab (or in Results), click **Export ▾** in the toolbar.
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

**Note on event log availability.** At the default storage level the event log is condensed to a 4-field summary (`logSummary`). Full event-by-event logs are only retained when the run's **Archive detail** is set to **Full** in **Run → ⚙ Setup** (`resultDetailLevel = "full"`). The API response includes a `_trimmed_fields` array listing any fields that were condensed.

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
| Owner | Opens the full model editor, including the owner-only **Access** and **Versions** tabs. |
| Granted `editor` | Opens the full model editor, without the owner-only Access and Versions tabs. |
| Granted `viewer` | Opens the simplified **Business view** — not the editor. See §4.10. |
| No access yet, but model is public | Opens read-only with a prompt to fork their own editable copy. |
| Not signed in | Taken to sign-in/sign-up first; the link resumes automatically once they're signed in. |
| No access, model not public, or model deleted | Lands on their normal Model Library with no error — the link simply doesn't unlock anything new. |

**This is not the same as the run-results Share link** (§4.6) — that creates a public, anonymous, read-only dashboard for one simulation run and needs no login at all. A model link (`#model/<id>`) only opens the door that your visibility/access settings already allow; it never bypasses login or grants new permissions on its own.

### 4.10 Share a model with non-modellers (Business view)

**When to use this.** You want a business stakeholder — someone who will never build a model — to *explore* your model of their domain: open it, adjust a few meaningful settings, run it, and see the results. The Business view gives them exactly that, without ever showing them the modelling environment.

**Owner setup:**

1. Open the model and go to the **Access** tab.
2. Under **Collaborators**, add the stakeholder with **viewer** rights (they need a Flow account).
3. In the **Business view** section below, click **+ Add adjustable setting** and pick from the searchable browser — parameters are grouped by category (staffing & capacity, arrivals, service times, queues, starting values) with a filter box, and the list offers the same parameters available to sweeps.
4. For each exposed setting you can add a plain-English **business label** (e.g. "Number of tellers" instead of the technical parameter name) and an optional **min**/**max** to keep adjustments within a sensible range.
5. Click **Save**, then send them the model link (**🔗 Copy link**, §4.9).

**What the viewer sees.** A single page with the model's name and description, the settings you exposed (as bounded number inputs showing the model's standard value, with per-setting reset), and a **Run** button. Running executes the full replication set in *their* browser using your saved experiment defaults (replication count capped by their account tier) and shows the same KPI summary cards as the Results workspace — averages with confidence indicators. Their changes apply to a temporary in-memory copy: nothing they do modifies or saves to your model, and each viewer run is thrown away when they leave the page.

**Current limits:**

- Viewer runs are not saved anywhere — there is no shared record of what a viewer tried. Re-running is cheap, but results can't be revisited later.
- No animated "watch it run" canvas yet — viewers get KPI results only.
- If a setting you exposed is later removed or renamed in the model, it is flagged to you in the Business view section (with a warning) and silently hidden from viewers until you fix or remove it.
- If the model has validation errors, viewers see a friendly "this model can't be run right now" message rather than the run controls — only you (or an editor) can fix the model.


### 4.11 Publish a model for anyone to run

**When to use this.** You want anyone with a link, including people without a Flow account, to read about your model, run it in their own browser, change a few settings you chose, and see the results. Publishing is separate from the model's Private/Public visibility (§4.9) and from Business view collaborators (§4.10); those keep working as before.

**Setting up (owner, signed in):**

1. Open the model and go to **Access → Publish**. Click **Set up publishing**.
2. Under **What the public sees**, fill in the **Title** (required), a **One-line summary** for the gallery card, a **Description** (what the model is for, what it assumes, how to read its results), a **Category**, a **Licence** and an optional **Cover image URL**.
3. Under **The release**, choose **Which version the public sees**: a saved version from the Versions tab, or **Snapshot the model as it is now** (taken when you publish). Add **Release notes** if you like.
4. Under **Provenance**, choose whether to **Show the evidence and assumption register on the public page** (§4.12). The panel shows how much of the model is currently evidenced.
5. **Can a visitor run it?** tells you whether a visitor's run at the model's default settings fits the published-model limits (up to 30 runs and a run length of 200,000), or warns that it is heavy. Visitors run with the model's own experiment defaults: number of runs, run length, warm-up and seed. To change them, change the experiment defaults and save a new version.
6. Under **What a visitor can change**, tick the parameters visitors may adjust and give each an optional **Visitor label**, **Minimum** and **Maximum**. These are separate from the Business view settings.
7. Tick **I understand this model becomes publicly readable** and click **Publish**. **Copy public link** copies the page's address (`…#/published/<model id>`).

Publishing is blocked while the model has errors in Model Health. A warning appears if the model reads live data sources, which visitors cannot reach.

**After publishing.** The public page shows the release you published. Editing the model, or changing any publish setting, does not change the public page until you click **Publish again**. The published definition and its timetable rows stay frozen until then, even if you edit or delete the working model's timetable.

| Button | What it does |
|--------|-------------|
| **Save settings** | Saves your changes as the next release without publishing them |
| **Publish again** | Replaces the public release with your current settings |
| **Withdraw** | Takes the public page down; it then looks exactly like a page that never existed |
| **Unpublish** | Returns the model to draft. The page stops working and your settings are kept |
| **Remove publish settings** | Deletes the publication entirely. The model itself is untouched |

**Your other published models** lists the rest of your publications with their status, each with a **Withdraw** button.

**What visitors see.** The **Explore published** gallery (Model Library header, or `#/published`) lists every published model with search and a category filter, no account needed. A model's page shows its title, summary, category, author, publication date and release, then:

- **The model**: a read-only diagram.
- **Run it**: **Run this model** opens the run panel with the settings you exposed, each with its standard value and your bounds. **Run the simulation** runs the replications in the visitor's browser; nothing is sent to you and nothing changes your model or run history. Afterwards the visitor sees the full Results view (per-section numbers, pathways, queue and resource tables, charts and statistics) and can **Download report** as HTML. Public pages never call an AI service.
- **What this model is**: your description.
- **How it's organised**: the sections and their descriptions, when the model has sections.
- **Where the numbers come from** and **The register**: the coverage figure and the evidence and assumptions, when you chose to include them.

**Open in Flow** in the page header opens the model in the app. A visitor can open it there only if they have access to the model itself (it is Public, or they are a collaborator); otherwise they land in their own library.

Publishing makes the simulation definition readable by anyone with the link. External data-source configuration is left out of the published copy; public runs use the released values and never refresh external data.

### 4.12 Record evidence and assumptions

**When to use this.** You want to show where your numbers and logic come from, see which parts of the model rest on nothing but judgement, and carry that record into reports and the public page.

Open **Design → Define → Evidence**. The header shows how many elements and parameters are evidenced, assumption only, or unbacked. There are three views:

| View | What it holds |
|------|--------------|
| **Evidence** | Records with a source. Each has a **Name**, **Type** (Data, Literature, Expert judgement or Anecdote), **Source**, **Strength** (Low, Medium or High), **Date captured**, **Last verified** and a **Description**. |
| **Assumptions** | Statements the model relies on without a source. Each has a **Name**, the **Assumption** text, a **Confidence** (Low, Medium or High) and a **Contested (stakeholders disagree)** tick box. |
| **Coverage** | Every element and parameter that can be backed, with its status: **Evidenced**, **Assumption only** or **Unbacked**. Filter with **Show**, and attach a record to any row directly. |

**Adding and attaching.** Click **Add evidence** or **Add assumption**, fill in the fields, then under **Attached to** pick what the record backs and click **Attach**. You can attach a record to a whole element (an entity type, queue, Bound or Conditional event, state variable, container, schedule, goal or distance) or to one of its parameters, such as an arrival event's mean or a server type's count. One record can back several things. **Remove** detaches it; **Delete** removes the record and its attachments.

**Where it shows up:**

- **Draw inspector.** Selecting a queue, activity or container shows an **Evidence** block: its status, how many of its parameters are backed, the records attached, and **Open in Evidence tab**.
- **Model Health.** Evidence produces warnings only, so a model always still runs. They appear only once a model has evidence or assumptions:

  | Code | Warning |
  |------|---------|
  | V-BACK-01 | A link points at a record, element or parameter that no longer exists (fix with **Coverage → Remove broken links**) |
  | V-BACK-02 | A record backs nothing |
  | V-BACK-03 | Evidence was last verified more than 12 months ago |
  | V-BACK-04 | A contested assumption sets an arrival or capacity parameter |
  | V-BACK-05 | Arrival or capacity parameters have no evidence or assumption (reported once) |

- **Reports.** Generated reports include an **Evidence and assumptions** section when the model has records.
- **Published page.** Optional; see §4.11.
- **AI.** When you apply a proposal from **Describe**, Flow adds the assumptions it recorded but never evidence, and never overwrites your records. The Flow MCP can add records for you from sources you name (§4.14).

Evidence and assumptions are saved with the model and travel with exports and versions.

### 4.13 Organise a large model into sections

**When to use this.** A model has grown beyond about ten queues or twenty events, and you want to group it into stages ("Triage", "Treatment", "Discharge") that you and your readers can see at a glance.

**Defining sections.** Open **Design → Define → Sections** and click **+ Add Section**. Give each section a name, a **description** (up to 500 characters: what happens there, in a sentence or two) and a colour, then tick its members under **Queues**, **Entity Types**, **B-Events** and **C-Events**. An element belongs to at most one section: ticking it in a second section moves it, and the list says which section it is currently in. Model Health warns (V82) about older models that still have an element in two sections.

Once sections exist, the Entity Types, Queues, Bound Events and Conditional Events editors show a coloured filter strip so you can see one section at a time.

**In Draw.** The **Detail | Sections** switch at the top left of the canvas changes the view:

- **Detail** shows every queue and activity. The **Outlines** button shows or hides a coloured box around each section's nodes. A rework loop that stays inside one section is drawn on a lane inside that section's box (the box grows to fit it) and labelled with the activity and its loop limit, for example "↻ Review (up to 3×)"; loops that leave the section use the shared lane below the diagram.
- **Sections** shows one card per populated section with its name, its description on hover and what it holds (for example "2 queues · 3 activities · 1 exit"), arranged left to right in the order entities move through the process. Ungrouped nodes stay visible. There is one arrow per pair of stages, labelled with how many graph links it stands for (not customers or probabilities); links back to an earlier stage are dashed return arrows (↩) on the lane below.
- The **▾** chevron beside a section's name turns just that section into a card. **Show detail** on a card, or a double-click, returns it to its nodes at their exact positions.

Layout reset and dragging are unavailable while sections are shown as cards; switch to Detail to arrange nodes. Search and Model Health navigation reveal the right section. Your choice of view is remembered for each model in this browser, and read-only viewers can switch views too.

**In Run.** The same **Detail | Sections** switch shows one live card per section: customers in it now, how many have entered and left, the average time of those who have finished a stay so far, and its busiest resource. Arrows between cards show how many customers have moved between sections. The numbers use the same definitions as the **Sections** block in Results. Clicking a card opens it in the inspector with the section's description and the same live numbers; The **▸** chevron on a card (or a double-click) expands just that section to its detailed nodes, and the other sections stay as cards, so the canvas can mix the two. Choosing **Detail** shows every section in detail again, and choosing **Sections** collapses them all back to cards. In Detail view, loops are drawn as dashed amber lines with the same labels as in Draw.

**Elsewhere.** Results show per-section figures and entity pathways across sections; the published page lists the sections and their descriptions; the Simulation Assistant can explain them.

Sections are only a way of organising and showing the model. The simulation engine ignores them, and every element stays part of the same model.

### 4.14 Build and run models from a desktop AI app (Flow MCP)

**When to use this.** You use Claude Desktop, Claude Code, Cursor, VS Code or another app that supports the Model Context Protocol (MCP), and you want the assistant to build a model, check it, run it and fix it before it reaches Flow.

**Install.** In the Model Library header, click **Connect AI app**:

- **Claude Desktop:** click **↓ Download flow.mcpb**, double-click the file (or drag it onto Claude Desktop) and choose **Install**.
- **Other MCP apps:** click **↓ Download flow-mcp.mjs** (it needs Node.js 20 or later) and add it to the app's MCP settings with the file's full path. For Claude Code: `claude mcp add flow -- node /path/to/flow-mcp.mjs`.

Everything runs on your computer. Model files are plain JSON in one folder (by default **Documents/Flow models**), and the assistant never needs your Flow sign-in. Each time it starts, the server checks Flow's website for a newer version; if there is one, the assistant tells you, and you update by downloading again from **Connect AI app**. Nothing about you or your models is sent.

**Use.** Just ask, for example: "Build me a Flow model of a GP surgery: patients arrive about every 4 minutes, a nurse triages them, then one of 3 GPs sees them for about 10 minutes." The assistant reads Flow's modelling method, asks you about anything it needs one question at a time, drafts the model, validates it, runs it, checks the results make sense and saves it. Ask it to open the model in Flow: your browser shows a preview and you choose **Save to my models**. You can also import the file yourself with **+ New Model → Import a file**.

**Changing a model you already have.** Export it from **Access → Export Model** into the models folder, then ask the assistant to work on it. When it opens the result in Flow, the preview offers **Update "<your model>"**: Flow saves the current model as a version first, then replaces it. You can still choose **Save as a new model**. Only the owner or an editor gets the update option.

**What it can do (Flow MCP 0.6):** read the modelling guide and schema; list, read, validate, save and edit model files; run replications with confidence intervals; compare two versions on the same random numbers; show results over time; sweep one parameter; trace a single run; open a model in Flow; report evidence coverage (`flow_evidence_coverage`); and add named evidence or assumptions and attach them to elements or parameters (`flow_record_evidence`). It records evidence only from sources you name, and reports an unknown or ambiguous element rather than guessing.

See `mcp/README.md` for the full tool list.

---

## 5. Troubleshooting

### 5.1 "Model Health shows errors and the Run button is disabled"

**Cause.** A validation rule has found a blocking error. Common examples:

| Error code | Meaning | Fix |
|-----------|---------|-----|
| V1 | Two entity types have the same name | Rename one entity type |
| V3 | An attribute's default value does not match its declared type | Change `defaultValue` or `valueType` to agree |
| V4 | A PRIORITY queue has no entity with a `priority` attribute | Add a `number`-type attribute called `priority` to the entity type using that queue |
| V37 | A resource has `MTBF` set but not `MTTR` (or vice versa) | Set both `MTBF` and `MTTR`, or remove both |
| V38 | A Bound Event fires `RELEASE(Server)` immediately before `COMPLETE()` — the `COMPLETE` is silently skipped | Reorder: `COMPLETE()` should come before `RELEASE()` |
| V47 | A Delay activity's follow-on schedule samples the delay from "Server attribute," or the completion Bound Event's effect is a bare `ARRIVE(...)` with nothing else | See §5.4 — pick a sampled distribution (Exponential, Fixed, …) instead of "Server attribute," and resolve the delayed entity with `COMPLETE()`, a routing table, or `RELEASE()` instead of (or alongside) `ARRIVE` |

Click any error in the Model Health panel to jump directly to the relevant editor tab.

### 5.2 "Entities are entering the queue but never being served"

**Cause.** The Conditional Event condition that triggers service is always false, or the Conditional Event has a lower priority than another Conditional Event that also cannot fire. The Three-Phase C-scan keeps restarting on the highest-priority event and never reaches the service event.

**Diagnosis steps:**

1. Go to the Run canvas. Click on a stuck entity in the entity table. The **Entity Inspector** panel shows its current state (queue, attributes, last transition time).
2. Go to the **Step Log** (Bottom Panel → Log tab). Look for the Conditional Event you expect to fire. If it never appears, the condition is never true.
3. Open the **Conditional Events** editor. Read the condition in the Predicate Builder. Common mistakes:
   - The queue name in the condition does not match the queue where entities are actually waiting.
   - The resource status check uses the wrong resource name.
   - The condition combines `AND` clauses that are mutually exclusive.

**Fix.** Correct the predicate in the Predicate Builder. During a stepped run, the **Entity Inspector** panel shows each entity's current attributes and queue position, which helps you verify whether the condition should be firing for a specific entity.

### 5.3 "The AI model generator produced a model that doesn't match my description"

**Cause.** AI generation is probabilistic. Complex or ambiguous descriptions produce less accurate results. Long descriptions with many simultaneous constraints are harder to satisfy.

**Fix steps:**

1. Click **Refine this** on the proposal (or keep typing in the Describe conversation) and say specifically what is wrong:
   > "The generated model has only one queue. I need two queues: one for triage and one for consultation."
2. If the result is still incorrect, use **Apply Selected** to take only the parts that are right, then fix the rest in **Define** or **Draw**. The AI-generated skeleton is usually a good starting point even if imperfect.
3. For complex models, describe one subsystem at a time rather than the entire scenario in one prompt.

**Additional common issues:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Run completes instantly with zero entities served | Max sim time is too short, or arrival Bound Event has no distribution set | Increase max sim time; verify Bound Event has a distribution |
| Phase C truncation warning appears | Conditional Event conditions are cycling (firing repeatedly) > 500 times per clock tick | Add a guard condition or simplify the Conditional Event predicate |
| Report generation is blank | Results payload is very large; LLM timeout | Reduce replication count; try Markdown format instead of HTML |
| "Supabase auth failed" on load | `.env.local` credentials missing or expired | Regenerate the anon key in Supabase Dashboard and update `.env.local` |
| LLM Bundle is missing confidence intervals | The run used only one replication | Run with ≥ 2 replications — the CI section is omitted for single-replication runs because there is no between-replication variance to report |
| **Export ▾** is greyed out | No run has been completed in the current session | Complete at least one run, then the button becomes available |
| The Evidence tab shows broken links | A record is attached to an element or parameter you have since deleted or renamed | Open **Evidence → Coverage** and click **Remove broken links** (Model Health reports these as V-BACK-01) |
| V50: "Weekly schedule pattern requires a startOfWeek epoch" on a server entity type | The entity type has a `schedulePattern.type === 'weekly'` but the model data does not set a `startOfWeek` epoch — the grid editor has no reference point to know which Monday to use | Go to **Time & Schedules** in the Define sub-sections and set a `startOfWeek` epoch (any date works, only the day-of-week matters). The first day of the schedule pattern is the week that contains this epoch. |
| V51: "Weekly schedule pattern has unscheduled hours with no active shift" | The 24×7 grid has cells that are neither off (0) nor covered by any shift schedule row, meaning the server type would have zero capacity for some hours on some days | Open the **Weekly Schedule Pattern** editor for that entity type. Either fill every 1-hour cell with a capacity ≥ 0, or add a shift schedule row that covers the gap. A gap is any hour where the grid is `null` rather than an integer — set it to 0 explicitly if the server should be unavailable then. |
| V52: "Set/Capacity schedule reference targets a non-schedule resource" | A Conditional Event or effect macro references a schedule by name or ID but the referenced entity type is not a server (its `role !== 'server'`) — only server entity types have schedule patterns | Ensure the `SET` or macro call that references this schedule targets a server entity type. If the resource is not a server, remove the schedule reference. |
| V53: "Schedule pattern capacity exceeds shift capacity at [time]" | A weekly grid cell has a capacity value that is larger than the shift schedule's capacity for the same time window — the grid defines how many *should* be available, the shift defines what staff are *actually* rostered, so grid > shift is a deployment mismatch | Either reduce the grid cell to ≤ the shift's capacity for that hour, or increase the shift's capacity (add more staff) to cover the planned level. |
| V54: "Shift schedule rows overlap and are not merged" | Two shift rows in the same schedule have overlapping time windows — e.g. Row 1: 08:00–16:00 Mon–Fri, Row 2: 12:00–20:00 Mon–Fri — and the editor has not merged them (editor shows a yellow "overlap" badge) | Use the **Merge overlapping shifts** button in the shift schedule editor. The editor combines overlapping rows into a single row covering the union of their time windows with the max capacity. |
| V55: "Per-shift utilisation chart is empty" | A weekly-pattern server entity type ran with zero capacity for all shifts, or the run ended before any shift could complete a service | Check that at least one schedule-pattern cell has capacity > 0 and that the run's `maxSimTime` is long enough for an entity to complete service. The per-shift chart appears only when `perShiftUtil[]` contains at least one entry. |
| V56: "Schedule adherence is N/A" | The server entity type has no `schedulePattern` (it's not a weekly-pattern server) | Schedule adherence is only computed for server entity types with `schedulePattern.type === 'weekly'`. For all other resources the field is omitted. |

### 5.4 "What do I configure for a Delay (no resource) activity, and what happens when it ends?"

**When this applies.** Your Conditional Event's Activity Type is set to **Delay (no resource)** — used for things like a recovery period, an unsupervised processing wait, or any hold that does not tie up a server entity.

**Two settings to get right:**

1. **"delay via:" on the Schedule Follow-on Event panel.** Pick a sampled distribution — **Exponential**, **Fixed**, **Uniform**, etc. Do **not** pick **Server attribute**: a Delay activity never claims a server, so there is nothing to read an attribute from, and the engine silently falls back to a delay of 1 every time (flagged by validation rule V47, with an amber warning shown directly under the schedule row in the editor).
2. **The completion Bound Event's Effect** — what happens to the entity once the delay ends. There are three valid choices, pick based on what actually happens next:

   | If the entity… | Configure the Bound Event with… |
   |---|---|
   | …leaves the system entirely (process ends here) | `COMPLETE()` — works correctly even though no server was claimed. |
   | …continues to another queue, and no server is involved anywhere in this entity's journey | A **routing table** (Conditional or Probabilistic routing, set in the Bound Event's Routing panel) and **no effect macro at all** — leave Effects empty. The engine treats a delay-held entity the same as one waiting in a queue, so routing alone moves it on. |
   | …continues, and a server *was* genuinely seized earlier in this same entity's journey and is still held through the delay | `RELEASE(ServerType[, TargetQueue])` to free that server now. |

   **Do not** use a bare `ARRIVE(...)` as the only effect on a Delay completion Bound Event — `ARRIVE` always creates a brand-new entity and never resolves the one that was delayed, leaving it stuck forever (flagged by V47). `ARRIVE` is fine *combined with* one of the three options above (e.g. to also spawn a log/audit entity), just never alone.

   **Do not** invent a `RELEASE()` for a chain where no server was ever seized — `RELEASE` has no awareness that this entity came from a Delay, so it either does nothing (entity stuck, same problem as bare `ARRIVE`) or, worse, can release an unrelated server's claim on a different entity. If no server is involved, use `COMPLETE()` or a routing table instead.

### 5.5 "How do I limit appointments to N per time period (slot booking)?"

**When this applies.** You need to model a scheduling step where entities are processed in batches — e.g., "3 appointment slots per hour", "5 patients scheduled every 2 hours", "10 trucks loaded per shift".

**How to set it up:**

Conditions have no arithmetic evaluator — `(clock - state.lastSlotTime) >= N` is not valid syntax and throws an error at runtime. Use a recurring timer Bound Event plus a boolean flag instead:

1. **Create a state variable** to act as a "ready" flag (e.g., `slotReady`, initial value 0).
2. **Create a self-rescheduling Bound Event** (the same way an arrival event reschedules itself) that fires every `slotInterval` minutes with effect `SET(slotReady, 1)`.
3. **Create a Conditional Event** with Activity Type **Delay (no resource)**. In the Source queue dropdown, pick the queue where entities wait for scheduling.
4. **Set the Slot capacity** field to the maximum number of entities to process per firing (e.g., 3). Leave it blank to drain all waiting entities (default behavior).
5. **Add a condition** that combines:
   - `queue(QueueName).length >= 1` — there are entities waiting
   - `slotReady == 1` — the timer has ticked since the last slot opened
   - Optional calendar constraints: `isWeekday AND hourOfDay >= 9 AND hourOfDay < 17` — only during business hours
6. **Add two effects:** `DELAY(QueueName, N)` and `SET(slotReady, 0)` — drain up to N entities and consume the flag until the next tick.

**Example:** A clinic with 3 appointment slots per hour, weekdays 9am-5pm:

```
Timer Bound Event: fires every 60 min, effect: SET(slotReady, 1)
Condition: queue(BookingQueue).length >= 1 AND isWeekday AND hourOfDay >= 9 AND hourOfDay < 17 AND slotReady == 1
Effect: DELAY(BookingQueue, 3), SET(slotReady, 0)
```

The Conditional Event fires once per hour (when the condition is true), drains up to 3 entities from the queue, and consumes the flag. Remaining entities wait for the next slot.

### 5.6 "How do I make different entity types get different delay times?"

**When this applies.** You need per-entity delay durations — e.g., "General appointments take 30 minutes, Specialist appointments take 60 minutes", "Urban reinforcement takes 10 days, Rural takes 21 days".

**How to set it up:**

1. **Add an attribute** to your customer entity type that stores the delay duration (e.g., `appointmentLength`, valueType: number).
2. **Set the attribute at arrival** using a Categorical distribution or a fixed value per entity type.
3. **In the Conditional Event's Schedule Follow-on Event panel**, pick **Entity attribute** from the "delay via:" dropdown and enter the attribute name (e.g., `appointmentLength`).
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

1. **Set the model's epoch** in the Time & Schedules tab → "Real-world start date/time". This anchors simulation time to a real calendar datetime. Without an epoch, calendar variables return defaults (isWeekday=true, hourOfDay=0).
2. **Use calendar variables** in your Conditional Event conditions:
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

### 5.8 Finding what a scheduled Bound Event actually does

Each row in a Conditional Event's **Schedule Follow-on Event** panel shows a one-line, plain-language summary of the linked Bound Event's effect right under the schedule preview — e.g. "Releases Nurse · routes 80% → Discharge Queue, 20% → Transfer Queue" or "Entity exits simulation." Macros without a friendly phrase yet (FILL, PREEMPT, FAIL, …) fall back to showing the raw macro call instead of being hidden. Click the bolded Bound Event name to jump straight to it in the **Bound Events** tab.

The link works the other way too: open a Bound Event in the **Bound Events** editor, and if any Conditional Event schedules it as a follow-on, a **"Scheduled by"** link appears — click it to jump back to that Conditional Event.

---

## 6. Glossary

| Term | Definition |
|------|-----------|
| **Bound Event** | Also called a "B-Event" in classic three-phase DES. Scheduled to fire at a specific time (e.g. an arrival, a service completion). Defined in the Bound Events editor. |
| **Conditional Event** | Also called a "C-Event" in classic three-phase DES. Fires when a state condition is true (e.g. "entity waiting AND server idle"). Defined in the Conditional Events editor using the Predicate Builder. |
| **Confidence interval (CI)** | A between-replication t-confidence interval: the engine computes one mean per replication, then applies Student's t across those replication-level means. Narrower CIs → more reliable results (use more replications). Comparing two scenarios uses a paired-t confidence interval on the difference; comparing three or more uses a one-way ANOVA with Tukey HSD pairwise comparisons. |
| **Entity** | An object that flows through the model: a customer, patient, train, job. |
| **Entity Family / Inheritance** | An entity type can set "Inherits from" to another entity type of the same role, picking up its attributes, skills, and skill profiles at run time (child definitions override the parent's by name). Set in the Entity Types editor. |
| **Future Event List (FEL)** | The engine's internal queue of scheduled Bound Events, ordered by time. |
| **Macro** | A named effect instruction applied to entities or resources. The supported macros are: `ARRIVE`, `ASSIGN`, `BATCH`, `CANCEL`, `COMPLETE`, `COSEIZE`, `COST`, `DELAY`, `DRAIN`, `DRAIN_PARTIAL`, `FAIL`, `FILL`, `FINISH`, `JOIN`, `MATCH`, `PREEMPT`, `RELEASE`, `RELEASE_COSEIZED`, `RENEGE`, `RENEGE_OLDEST`, `REPAIR`, `ROUND_ROBIN`, `SET`, `SET_ATTR`, `SPLIT`, `UNBATCH`. `RELEASE_COSEIZED([Type1, Type2, ...], QueueName?)` atomically releases all servers seized together by a `COSEIZE` and is the correct way to free co-seized resources without ending the entity's lifecycle — never stack separate `RELEASE(Type)` calls for co-seized types. |
| **MTBF / MTTR** | Mean time between failures / mean time to repair. Used for resource failure modelling. |
| **Preemptive priority** | A higher-priority job takes a server from a lower-priority job in service rather than waiting for one to free up. Modelled with `ASSIGN(Queue, ServerType, PREEMPT, …)` — the ASSIGN option **May interrupt a lower-priority job (PREEMPT)**. The interrupted job resumes with its remaining time by default. |
| **Predicate Builder** | The point-and-click condition editor for Conditional Events. Prevents type mismatches; no free-text logic. |
| **Replication** | One independent run of the simulation from start to finish with a unique random seed. |
| **Resource** | A capacity-limited service provider (server, machine, nurse, lane). |
| **Seed** | The starting value for the pseudo-random number generator. The same seed always produces the same sequence of random samples (reproducibility). |
| **Warm-up period** | The initial phase of a run during which the system is reaching steady state. Statistics collected during warm-up are discarded. |
| **LLM Bundle** | A structured Markdown document downloaded from the Export… menu that combines model definition, experiment configuration, and full results into a single file. Designed to be pasted into an LLM (Claude, ChatGPT, Gemini) for custom analysis — contains a preamble explaining the Three-Phase DES method so no additional context is needed. |
| **Results API** | A Supabase Edge Function (`/functions/v1/results-api/`) providing authenticated read-only access to saved run and sweep results via HTTP, for use from Python, R, or BI tools. |
| **SimPy export — Category 1** | A generated `.py` script that requires no manual editing and runs as-is after `pip install simpy`, or directly in the browser via the **Run in Browser** button. Produced when all macros in the model have a direct SimPy equivalent. |
| **SimPy export — Category 2** | A generated `.py` script where one or more macros (RENEGE, BATCH, MATCH, FAIL, REPAIR, PREEMPT, FINISH, RENEGE_OLDEST, RELEASE_COSEIZED, or JOIN) have been replaced with annotated `# TODO` stubs. The script runs without errors but the stub sections must be completed manually before results are meaningful. The Run in Browser button is disabled for Category 2 scripts. |
| **Starvation** | The condition where a server is idle because its input queue is empty — demand is too low to keep the server busy, not because the server is busy with another entity. Reported per-resource in the Results workspace as starvation duration and percentage. High starvation indicates upstream bottlenecks or low arrival rates relative to capacity. |
| **Purge period** | An optional run-down phase after the simulation's Max sim time. New arrivals are stopped but the simulation continues until all queued entities are served (or until a configurable extra time limit). Used to model end-of-day or shift-end drain-down. |
| **Schedule Adherence** | A per-resource metric comparing actual utilisation to the expected utilisation implied by the weekly schedule pattern. Shown as a colour-coded badge in resource cards (green ≤ 10 % gap, amber ≤ 25 %, red > 25 %). Only computed for server entity types with `schedulePattern.type === 'weekly'`. |
| **Schedule Pattern** | A repeating 24×7 grid (hours × days of the week) defining the expected capacity of a server entity type at every hour of the week. Set in the Entity Types editor via the **Weekly Schedule Pattern** toggle. The grid interacts with the shift schedule — the shift defines rostered staff, the pattern defines planned deployment. |
| **Required Sequence** | An ordered list of queues a customer entity type is expected to visit, set in the Entity Types editor's **Required Sequence** panel. Design-time only — validation warns if routing ever sends this entity type backward through the declared stages, but the engine does not otherwise enforce the order. |
| **Distance** | A named, undirected travel distance between two queues, set in the **Model Data** tab. Consumed by picking **Distance** as a Conditional event schedule's delay distribution, which computes duration as distance ÷ a speed attribute read from the assigned server or arriving entity. |
| **Model Data (tab)** | The Model Detail tab holding small named building blocks that other parts of the model reference by name — Skills (server capabilities), Containers (tanks/buffers), Distances (travel time between queues), and State Variables (counters, gates, tracked values). |
| **Time & Schedules (tab)** | The Model Detail tab holding simulation time configuration (time unit, real-world epoch) and named schedules for time-varying arrival rates. |
| **Data Sources (tab)** | An experimental Model Detail tab, hidden by default. Developers can restore it with `VITE_ENABLE_DATA_SOURCES_TAB=true` and restart the development server or rebuild the app. Existing configurations and run behaviour are preserved. |
| **Per-shift utilisation** | A breakdown of a server entity type's utilisation into separate bars per shift (e.g. Mon Early Shift, Tue Late Shift). Shown as a collapsible horizontal bar chart in the Results workspace. Each bar shows the % busy and the number of entities claimed per capacity unit within that shift's time window. Only available for weekly-pattern server types. |
| **Shift-change behavior** | How a server handles in-progress service when its shift schedule reduces capacity: Delay (finish naturally), Preempt (interrupt and re-queue with remaining time), or Suspend (pause and resume). Set per server entity type in the Entity Types editor. |
| **PRNG stream isolation** | Each stochastic process in the simulation (arrivals, service, reneging, MTBF, MTTR) has its own independent pseudo-random stream derived from the base seed. This means changing the distribution of one process does not alter the random sequence of any other process, making scenario comparisons more controlled. |
| **Evidence** | A record of where a number or a piece of logic comes from: name, type (Data, Literature, Expert judgement or Anecdote), source, strength (Low, Medium, High), date captured and last verified. Kept on the **Evidence** tab and attached to elements or parameters. |
| **Assumption** | A statement the model relies on without a source, with a confidence level. It can be marked **contested** when stakeholders disagree. |
| **Coverage** | For every element and parameter that can be backed, whether it is **Evidenced**, **Assumption only** or **Unbacked**. Shown on the Evidence tab, in the Draw inspector and on a published model's page. |
| **Published model** | A frozen release of a model with its own public page, which anyone can open and run in their own browser without an account. Set up in **Access → Publish**. |
| **Section** | A named, described group of elements used to organise a large model. Each element belongs to at most one section. Sections change how the model is shown, never how it runs. |
| **Flow MCP** | A small local server that lets desktop AI apps (Claude Desktop, Claude Code, Cursor and others) build, validate, run and record evidence on Flow model files. Downloaded from **Connect AI app**. |
| **State variables readout** | A strip on the Run canvas listing state variables as pills — `0` shows **OFF**, `1` shows **ON**, any other number shows its value with precision that follows its size (two decimals below 1, one decimal from 1 to 10, whole numbers with thousands separators from 10 up). A pill flashes when its value changes, so a switch trip (e.g. a gate flipping from open to closed) is easy to spot. Hide individual variables from this readout using **Show on run canvas** in the Model Data → State Variables editor. |
