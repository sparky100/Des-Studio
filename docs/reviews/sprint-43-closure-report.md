# Sprint 43 — Closure Report
**Sprint:** 43 — Quantified AI Suggestions + Goal-Driven Sweep
**Completed:** 2026-05-15
**Branch:** sprint-43 (merged)

## Delivered Scope
| Item | Description | Result |
|------|-------------|--------|
| S43.1 | buildSuggestionPrompt() redesigned with 6-step framework and mandated output schema | ✅ Done |
| S43.2 | buildGoalGaps() pre-computation function with CI awareness | ✅ Done |
| S43.3 | evaluateSweepPointGoals() exported function | ✅ Done |
| S43.4 | SweepChart goal threshold lines, feasibility colouring, best-point annotation, summary line | ✅ Done |
| S43.5 | Sweep2DGrid infeasible cell dimming and best feasible cell highlight | ✅ Done |
| S43.6 | 1D sweep table feasibility indicators; index.jsx goal prop wiring | ✅ Done |

## Detail

### S43.1 — buildSuggestionPrompt() Redesign
**Problem:** Qualitative suggestions ("consider adding more servers") were not actionable. The LLM had no structured framework for reasoning about model improvement.

**What was built:** buildSuggestionPrompt() in src/llm/prompts.js was rewritten around a six-step chain-of-thought framework embedded in the system instruction: (1) identify the binding constraint, (2) diagnose the cause, (3) state the proposed change with a concrete value, (4) predict the quantitative effect, (5) assess goal impact, (6) rank suggestions by expected improvement. A JSON output schema was mandated in the prompt so the response can be parsed by the UI. max_tokens was set to 800 to prevent runaway cost while permitting detailed multi-suggestion output.

**Files changed:** src/llm/prompts.js

**Key design decisions:** The six-step structure was chosen because DES models have a clear bottleneck-and-throughput causal structure. Steps 1–2 force the LLM to reason about constraint theory before proposing changes, which eliminated the qualitative suggestions observed in earlier testing.

### S43.2 — buildGoalGaps()
**Problem:** The AI prompt had no structured access to goal compliance state. The narrative prompt could not distinguish a model 5% over target from one 200% over target.

**What was built:** buildGoalGaps(model, aggregateStats) pre-computes a { metric, current, target, gap, met } object for each entry in model.goals. When aggregateStats provides confidence intervals, the function uses the CI lower bound for metrics where lower is better (wait times, sojourn) and the CI upper bound for metrics where higher is better (throughput, utilisation) — applying a conservative posture for goal compliance determination.

**Files changed:** src/llm/prompts.js

### S43.3 — evaluateSweepPointGoals()
**Problem:** Sweep views had no mechanism to test a specific parameter combination's results against model goals.

**What was built:** evaluateSweepPointGoals(sweepPoint, goals) evaluates a single sweep result object against the goals array and returns { feasible, gaps } where feasible is true only if every goal is met. The function is exported so SweepViews.jsx can call it independently of the prompt-building pipeline.

**Files changed:** src/llm/prompts.js

### S43.4 — SweepChart Goal Overlays
**Problem:** SweepChart showed sensitivity curves but users could not see at a glance which parameter values satisfied their performance targets.

**What was built:** SweepChart received a goals prop. For each goal that matches the chart's displayed metric, an amber dashed horizontal threshold line is rendered at the target value. Each data point is coloured green (feasible) or red (infeasible) using evaluateSweepPointGoals. The best feasible point (closest to target while meeting all goals) is annotated with a label. A summary line below the chart reads "X/Y points satisfy all goals."

**Files changed:** src/ui/execute/SweepViews.jsx

### S43.5 — Sweep2DGrid Goal Overlays
**Problem:** 2D grid cells showed raw metric values with no feasibility context.

**What was built:** Sweep2DGrid received a goals prop. Infeasible cells render at 35% opacity and their value is prefixed with ✗. The best feasible cell (highest combined goal compliance score) is highlighted with a green border and labelled "★ best."

**Files changed:** src/ui/execute/SweepViews.jsx

### S43.6 — 1D Sweep Table and index.jsx Wiring
**Problem:** The 1D sweep results table had no per-row feasibility indication.

**What was built:** Each row in the 1D sweep table was extended with a ✓/✗ feasibility indicator. Infeasible rows render at 50% opacity. index.jsx was updated to pass model.goals to SweepChart, Sweep2DGrid, and the table component.

**Files changed:** src/ui/execute/SweepViews.jsx, src/ui/execute/index.jsx

**Narrative prompt:** buildNarrativePrompt() was updated to include the goal gaps pre-computed by buildGoalGaps(), formatted as a MET/MISSED table so the LLM can reference goal compliance in its narrative output.

## Test Results
Existing prompt and sweep tests passed. No new test files were required for this sprint. A capability document was written at docs/sprint-43-ai-capability-guide.md describing the new suggestion format and sweep feasibility features for modellers.

## What's Next
Sprint 44 targets the raw execution panel experience. With goal-aware KPI data now available from the engine, the sprint will surface wait-time distributions as histograms, restructure the log viewer with search and filtering, and add sortable entity lifecycle tables — converting the panel from a debug console into an analysis workspace.
