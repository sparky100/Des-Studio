# AI Analysis & Optimisation — Options & Assessment

**Date:** 2026-05-15
**Status:** For review

## Current State

### AI Analyser

The AI assistant (`AiAssistantPanel.jsx`, `src/llm/prompts.js`) supports five task types:

| Task | What it does |
|------|-------------|
| Narrative | Plain-English interpretation of KPIs and bottleneck flags |
| Comparison | Side-by-side analysis of two saved runs |
| Sensitivity | Statistical uncertainty assessment (CI width, robust conclusions) |
| Suggestions | Concrete structural changes recommended (current: qualitative only) |
| Query | Conversational answers to user questions with KPI citations |

Performance goals (`{ metric, operator, target, label }`) are already passed into both the Narrative and Suggestion prompts. When goals exist, the Narrative prompt instructs the LLM to assess each goal; the Suggestion prompt instructs it to prioritise goal-achieving changes.

### Sweeps

Two parametric sweeps are available (1D and 2D), supporting five parameter types: entity type counts, queue capacities, B-event distribution params, C-event distribution params, and state variable initial values. Sweeps run up to 50 points with replicated CIs and display as a line chart (1D) or heatmap (2D).

### Gap

The Suggestion task gives qualitative direction ("increase server count") but does not propose specific values, quantify expected improvements, or rank suggestions by impact. Sweeps explore the parameter space manually but do not evaluate results against goals or identify which points satisfy constraints.

---

## Option 1 — Sharpen the AI Suggestion Prompt

### What

Redesign `buildSuggestionPrompt` so the LLM returns **specific, quantified, ranked recommendations** rather than general qualitative advice. The goal is that a modeller can act on the output directly — without needing to interpret or infer what to try next.

### Why the current prompt falls short

The current prompt asks the LLM to "suggest improvements" against a narrative summary of KPIs. This produces responses like *"consider adding more servers"* — directionally correct but not actionable. There is no instruction to propose specific values, no instruction to quantify predicted improvements, and no ranking of suggestions by expected impact.

### Prompt redesign — what it must do

The revised `buildSuggestionPrompt` should instruct the LLM to follow this structure for every suggestion:

**1. Identify the binding constraint**
Determine which metric is farthest from its goal (or most critical if no goals are set). Name it explicitly: *"The binding constraint is avgWait = 4.2 min against a goal of < 3 min."*

**2. Trace the cause**
Link the metric to a root cause using the available data — utilisation, arrival rate, service time, CI width. Example reasoning the LLM should produce: *"Server utilisation is 0.84, which puts the system in the high-variance regime of the M/M/1 curve. Small increases in capacity produce disproportionate wait reductions at this utilisation."*

**3. Propose a specific change**
Name the exact parameter, its current value, and a proposed value or range. Do not use vague language like "increase" without a number. Example: *"Increase Server.count from 2 to 3."*

**4. Predict the effect**
Quantify the expected improvement. The LLM should use queueing theory relationships (Little's Law, M/M/c approximations) or CI-based extrapolation to give a range. Example: *"Based on Little's Law at the current arrival rate, avgWait is expected to fall to approximately 1.8–2.4 min — meeting the < 3 min goal."* If prediction is uncertain, say so explicitly.

**5. State goal impact**
For each suggestion, explicitly state which goals would be met, which would still be missed, and which are unaffected. Example: *"This change meets the avgWait < 3 goal. The served ≥ 20 goal is already met and is unaffected."*

**6. Rank suggestions**
If multiple suggestions are viable, rank them by expected impact on the binding constraint. State the trade-offs between them (cost, complexity, risk).

### Inputs the prompt needs

The prompt already receives model structure, KPIs, CI data, and goals. Two additions would sharpen it further:

- **Per-queue statistics** — `perQueue` (blocking count, balk count per queue) to support bottleneck attribution
- **Per-resource utilisation** — server busy fraction, available from entity summary — to support the utilisation-based reasoning in step 2

Both are available in the engine output and just need to be included in the prompt payload.

### Output format instruction

The prompt should instruct the LLM to use this structure for each suggestion:

```
Suggestion 1 — [parameter name]
  Current: [value]
  Proposed: [value or range]
  Predicted effect: [metric] [direction] from [current] to [predicted range]
  Goal impact: [goal label] → [met / missed / unaffected]
  Confidence: [high / moderate / low] — [one-line reason]
```

This format is consistent regardless of model type and is easy for the modeller to act on. It also gives Claude a clear schema to follow, reducing hallucination risk.

### Files

| File | Change |
|------|--------|
| `src/llm/prompts.js` | Redesign `buildSuggestionPrompt`; extend payload to include `perQueue` and utilisation |
| `src/ui/execute/AiAssistantPanel.jsx` | Pass `perQueue` and utilisation data into the suggestion call |

**Effort:** Small–Medium (prompt engineering + payload extension, no engine changes).

---

## Option 2 — Goal-Driven Constrained Sweep

### What

Extend the existing sweep runner and display to evaluate each sweep point against the model's performance goals, highlighting the feasible region and identifying the best-performing feasible configuration.

### Why the goals are the right foundation

Goals are already stored as `{ metric, operator, target }` in the model. The sweep runner already computes `aggregateStats` per point with CI means for `avgWait`, `avgSvc`, `avgSojourn`, `served`, and `reneged` — exactly the metrics goals reference. The connection is an evaluation and display layer only.

### How it works

**Evaluation:** After each sweep point completes, check every goal against `aggregateStats[metric].mean`:

```
goal: avgWait < 3   →   point.aggregateStats.avgWait.mean < 3   →   feasible / infeasible
goal: served >= 20  →   point.aggregateStats.served.mean >= 20  →   feasible / infeasible
```

A point is feasible if **all** goals are satisfied. If no goals are set, all points are shown as before (no change to current behaviour).

**Objective:** The user selects which metric to optimise within the feasible region (e.g. minimise `totalCost`, maximise `served`). This is a dropdown in the sweep config panel, defaulting to the first goal metric if one exists. The best feasible point is highlighted.

**Display changes:**

- *1D chart:* Add a horizontal threshold line for each goal. Feasible points are highlighted (filled marker); infeasible points are shown dimmed. The best feasible point is marked with a label.
- *2D heatmap:* Infeasible cells are shown with a crosshatch or reduced opacity overlay. A legend explains the feasibility boundary.
- *Summary panel:* Show "X of Y sweep points satisfy all goals" and the parameter value(s) of the best feasible point.

### Relationship to Option 1

Options 1 and 2 reinforce each other. The sharpened AI suggestion (Option 1) tells the modeller which parameter to sweep and what range to try. The goal-driven sweep (Option 2) confirms whether the suggestion achieves the goals and surfaces the optimal value within that range.

### Files

| File | Change |
|------|--------|
| `src/engine/sweep-runner.js` | Add goal evaluation per point; tag each point as feasible/infeasible |
| `src/ui/execute/SweepViews.jsx` | Goal threshold lines on 1D chart; feasibility overlay on 2D heatmap; best-point highlight |
| `src/ui/execute/index.jsx` | Objective metric selector in sweep config; pass goals into sweep runner |

**Effort:** Medium (sweep runner logic is straightforward; display changes are the largest part).

---

## Summary

| Option | Scope | Effort | Value | Dependencies |
|--------|-------|--------|-------|--------------|
| 1 — Sharpen AI suggestions | `prompts.js` + panel | Small–Medium | High — makes suggestions directly actionable | None |
| 2 — Goal-driven sweep | Sweep runner + display | Medium | High — closes the loop between goals and exploration | Goals must be set in model; Option 1 recommended first |

**Recommended sequence:** Implement Option 1 first. A sharper suggestion prompt immediately improves every model analysis with no infrastructure change. Option 2 is most valuable when used after Option 1 — the AI identifies the promising parameter and range, the constrained sweep confirms it and finds the optimum within that range.
