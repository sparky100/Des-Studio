# Sprint 43 — AI Analysis & Goal-Driven Sweep: Capability Guide

**Date:** 2026-05-15
**Status:** Delivered

---

## Overview

Sprint 43 delivers two interconnected capabilities that make DES Studio's analytical intelligence genuinely actionable:

1. **Quantified AI Suggestions** — the suggestion prompt now follows a mandatory 6-step framework and outputs structured, specific, theory-grounded recommendations rather than qualitative advice.
2. **Goal-Driven Sweep** — sweep charts and tables now evaluate every parameter point against the model's performance goals, highlighting the feasible region and the best-performing feasible configuration.

Together these form a two-step analytical workflow:
> *AI identifies the promising parameter and predicted value → constrained sweep confirms it and finds the optimum within that range.*

---

## Part 1 — Quantified AI Suggestions

### What changed

`buildSuggestionPrompt` (`src/llm/prompts.js`) was redesigned from the ground up.

#### Previous behaviour
The prompt asked for "specific structural changes to improve performance" in 150–200 words. The LLM produced responses like *"consider adding more servers"* — directionally correct but not directly actionable.

#### New behaviour
The LLM is instructed to act as a **queueing systems expert** and follow a **6-step framework** for every suggestion, producing output in a mandated schema.

### The 6-step framework

Every suggestion the LLM produces must work through these steps:

| Step | What the LLM must do |
|------|----------------------|
| **1. Binding constraint** | Name the metric farthest from its goal (or most critical). Cite the exact current value and target. |
| **2. Cause** | Trace to root cause using utilisation, arrival rate, service time, queue percentiles, or blocking/balking counts. Name the specific resource or queue responsible. |
| **3. Proposed change** | Name the exact parameter, its current value, and a specific proposed value — never "increase/decrease" without a number. |
| **4. Predicted effect** | Use queueing theory (Little's Law, M/M/c approximations) or CI extrapolation to quantify the expected improvement as a range. State uncertainty explicitly when CIs are wide. |
| **5. Goal impact** | For each suggestion, state which goals would be met, which remain missed, and which are unaffected. |
| **6. Ranking** | If multiple suggestions, rank by expected impact on the binding constraint and explain the trade-offs. |

### Output schema

The LLM is instructed to use this exact format for each suggestion:

```
Suggestion N — [parameter or change]
  Current: [exact value with units/context]
  Proposed: [specific value or range]
  Predicted effect: [metric] [direction] from [current] to ~[predicted range]
  Goal impact: [goal label] → met / still missed / unaffected
  Confidence: high / moderate / low — [one-line reason citing CIs or queueing regime]
```

This schema is consistent regardless of model type and gives the modeller a clear action to take — no interpretation required.

### What data reaches the LLM

The suggestion prompt now includes:

| Data | Source | Purpose |
|------|--------|---------|
| Per-queue wait percentiles (p50/p90/p95/p99) | `results.waitDist` | Pinpoint bottleneck queues |
| Per-resource utilisation + idle counts | `summary.perResource` | Identify overloaded resources |
| Replication CIs (mean, lower, upper, width) | `results.aggregateStats` | Assess statistical confidence |
| Per-queue blocking + balking counts | `results.perQueue` | Diagnose saturation and loss |
| Goal gaps (current vs target, met/missed) | computed from `model.goals` | Focus recommendations on what matters |
| High-load regime flag | computed (utilisation > 0.85) | Trigger non-linear sensitivity warning |

### Goal gap pre-computation

When performance goals are set, the prompt now pre-computes goal gaps:

```json
{
  "metric": "avgWait",
  "label": "avgWait < 3 min",
  "operator": "<",
  "target": 3.0,
  "current": 4.2,
  "gap": 1.2,
  "met": false
}
```

The LLM receives these directly so it doesn't need to infer them from raw KPI values — reducing hallucination risk and ensuring the analysis focuses on unmet goals.

### Narrative prompt improvement

The narrative prompt also gains goal-gap awareness. When goals are set, each goal is assessed in this format:

> `[goal label]: current = [value], target [op] [target] → MET / MISSED (gap: [gap])`

This gives the narrative a clear, factual goals section alongside the interpretive commentary.

### How to get the best results

1. **Set performance goals** before running the model. Even a single goal (e.g. `avgWait < 5`) dramatically sharpens the output — the LLM knows exactly what to optimise for.
2. **Run with replications** (≥5 recommended). The CI data lets the LLM assess confidence and flag when conclusions are statistically unreliable.
3. **Run "Suggest Improvements"** from the AI panel after a completed run. Read the structured output — each suggestion tells you exactly what to change and what result to expect.
4. **Use the sweep to confirm** the AI's proposed value (see Part 2).

---

## Part 2 — Goal-Driven Constrained Sweep

### What changed

`SweepChart` and `Sweep2DGrid` (`src/ui/execute/SweepViews.jsx`) now accept a `goals` prop and evaluate every sweep point against the model's performance goals. The sweep table in `index.jsx` also shows per-row feasibility.

### Feasibility evaluation

A sweep point is **feasible** if every goal is satisfied:

```
goal: avgWait < 3   →  point.aggregateStats["summary.avgWait"].mean < 3  →  feasible
goal: served >= 20  →  point.aggregateStats["summary.served"].mean >= 20  →  feasible
```

All goals must be satisfied for a point to be feasible. If no goals are set, the sweep behaves exactly as before (no change to existing behaviour).

### 1D sweep chart changes

When goals are set:

- A **horizontal threshold line** (amber dashed) is drawn at the goal target value for any goal whose metric matches the displayed KPI.
- **Data points are colour-coded**: green = feasible (all goals met), red = infeasible (at least one goal missed), muted = insufficient data.
- Infeasible points are shown at reduced opacity (0.5).
- The **best feasible point** is marked with a larger dot and a `best` label above it.
- A summary line above the chart shows `X/Y points satisfy all goals`.

### 2D sweep grid changes

When goals are set:

- A summary line shows `X/Y cells satisfy all goals` and the parameter values of the best feasible cell.
- Infeasible cells are shown at 35% opacity with a `✗` prefix on the value.
- The **best feasible cell** is highlighted with a green border and a `★ best` label.
- Hovering shows a tooltip on infeasible cells: *"Infeasible — misses one or more goals"*.

### Sweep table changes

The 1D results table gains a feasibility indicator in the parameter value column:
- `✓` in green — all goals met
- `✗` in red — at least one goal missed
- `·` in muted — no goals set or insufficient data

Infeasible rows are shown at 50% opacity.

### Recommended workflow

1. **Set goals** in the model's Goals editor (e.g. `avgWait < 3`, `served >= 50`).
2. **Run the AI suggestion** — it will tell you which parameter to sweep and roughly what value to target.
3. **Set up a 1D sweep** on the suggested parameter across a range spanning the AI's proposed value.
4. **Run the sweep** — the chart will immediately show which points meet all goals (green dots) and which don't (red dots, dimmed).
5. **Identify the best feasible point** — the chart labels it directly. This is the minimum resource level (or optimal configuration) that satisfies all constraints.
6. **Click that point** in the table and save the run for comparison.

### Example

AI suggestion output:
> *"Increase Server.count from 2 to 3. Predicted effect: avgWait drops from 4.2 to ~1.8–2.4 min, meeting the avgWait < 3 goal."*

Sweep action: sweep `Server.count` from 1 to 5. The chart shows:
- count=1,2: red dots (infeasible — avgWait > 3)
- count=3: green dot labelled `best` (feasible — avgWait ≈ 2.1)
- count=4,5: green dots (feasible — diminishing returns)

The sweep confirms count=3 is the minimum feasible configuration, validating the AI's recommendation.

---

## Files changed

| File | Change |
|------|--------|
| `src/llm/prompts.js` | Redesigned `buildSuggestionPrompt`; added `buildGoalGaps`, `evaluateSweepPointGoals`; improved narrative goal instruction |
| `src/ui/execute/SweepViews.jsx` | `SweepChart` and `Sweep2DGrid` gain `goals` prop, feasibility colouring, threshold lines, best-point annotation |
| `src/ui/execute/index.jsx` | Passes `model.goals` to sweep charts; 1D table gains feasibility indicators |

---

## What's next (Sprint 44 candidates)

- **Sweep objective metric selector** — let the user choose which metric to optimise within the feasible region (currently defaults to the displayed KPI).
- **Goal-driven 2D sweep contour** — draw a feasibility boundary line across the heatmap rather than just dimming infeasible cells.
- **loopConfig and balkCondition engine wiring** — the UI fields added in Sprint 42 need engine-side evaluation.
- **AI comparison mode** — when goals are set, the comparison prompt should also assess both runs against goal gaps.
