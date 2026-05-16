# Sprint 43 — Quantified AI Suggestions + Goal-Driven Sweep
**Sprint:** 43 — Quantified AI Suggestions + Goal-Driven Sweep
**Branch:** sprint-43 (merged)
**Date:** 2026-05-15

## Objective
AI suggestions were qualitative and vague. Sweep charts showed parameter sensitivity but had no awareness of model performance goals, leaving users to manually determine which parameter values produced acceptable results. This sprint reformulates AI suggestions using a structured six-step reasoning framework and overlays feasibility information on all sweep visualisations based on user-defined model goals.

## Background
The AI assistant built in earlier sprints generated free-text suggestions such as "consider adding more servers," which gave no actionable indication of what change to make, by how much, or what improvement to expect. Users had no way to set performance targets (e.g., "p90 wait time < 5 minutes") and have the system report whether those targets were met. The 1D sweep table, SweepChart, and Sweep2DGrid all showed raw metric values but provided no feasibility overlay. Without this, users running parameter sweeps had to read numbers manually and apply their own goal thresholds.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S43.1 | Redesign buildSuggestionPrompt() — 6-step framework, mandated output schema, 800 max_tokens | src/llm/prompts.js |
| S43.2 | New buildGoalGaps() function — pre-computes goal gap data with CI awareness | src/llm/prompts.js |
| S43.3 | New evaluateSweepPointGoals() exported function — evaluates a sweep point against model goals | src/llm/prompts.js |
| S43.4 | SweepChart goals prop — threshold lines, green/red point colouring, best-point annotation, summary line | src/ui/execute/SweepViews.jsx |
| S43.5 | Sweep2DGrid goals prop — infeasible cell dimming, best feasible cell highlight | src/ui/execute/SweepViews.jsx |
| S43.6 | 1D sweep table feasibility indicators per row; index.jsx passes model.goals to components | src/ui/execute/SweepViews.jsx, src/ui/execute/index.jsx |

## Acceptance Criteria
- buildSuggestionPrompt() produces prompts that follow the 6-step structure: binding constraint identification, cause analysis, proposed change, predicted effect, goal impact, ranking
- The prompt output schema is declared in the prompt text (mandated JSON structure for the LLM to follow)
- buildGoalGaps() returns an array of { metric, current, target, gap, met } objects; uses CI lower/upper bounds from aggregateStats when available
- evaluateSweepPointGoals(sweepPoint, goals) returns { feasible: boolean, gaps: [...] } and is exported for use outside prompts.js
- SweepChart renders amber dashed threshold lines at goal target values; feasible points are green, infeasible points are red; the best feasible point is annotated; a summary line reads "X/Y points satisfy all goals"
- Sweep2DGrid renders infeasible cells at 35% opacity with ✗ prefix on cell values; the best feasible cell has a green border and "★ best" label
- 1D sweep table shows ✓ or ✗ per row; infeasible rows render at 50% opacity
- index.jsx passes model.goals to SweepChart, Sweep2DGrid, and the 1D sweep table
- Narrative prompt is updated to include goal gap context in MET/MISSED format

## Dependencies
- Model schema must support a goals array (prior sprint or data model work)
- aggregateStats confidence intervals must be available on sweep results (engine output)
- SweepChart and Sweep2DGrid must already exist in SweepViews.jsx
- src/llm/prompts.js must export buildSuggestionPrompt and buildNarrativePrompt
