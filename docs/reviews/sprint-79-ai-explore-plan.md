# Sprint 79 — ✦ Explore: AI-Powered Adaptive Batch Analysis

**Sprint:** 79
**Theme:** One-click statistical exploration with LLM-synthesised improvement opportunities
**Status:** ✅ Complete | **Completed:** 2026-05-31
**Branch:** `claude/ai-agent-batch-design-iAp3V`
**Owner:** parkinsonsj@gmail.com

---

## Goal

Enable modellers to trigger an autonomous AI agent from any design view that:
1. Runs the model in progressively larger batches until 95% CI relative half-width drops below 5% of the mean (or the plan tier limit is reached)
2. Saves results to the existing `simulation_runs` table
3. Streams an LLM-generated opportunity report identifying bottlenecks, quick wins, and investment opportunities

The feature is accessible via a `✦ Explore` button in the model header, visible whenever the model is free of validation errors.

---

## Scope Guardrails

- No new Supabase migrations or `model_json` schema changes
- Engine layer (`adaptive-batch.js`) is pure JS — zero React, zero DOM
- All DB calls delegated to `db/models.js` wrappers; none in UI components
- Styling via `tokens.js` exclusively — no hardcoded colours or CSS classes
- One LLM call per user trigger (uses existing `streamNarrative` / `llm-proxy` path)
- Tier limits enforced at the engine layer via `RUN_ADMISSION_TIERS`

---

## Architecture

```
ModelDetailHeader  ← ✦ Explore button (exploreVisible prop)
        │
        ▼ (setShowExplorePanel)
ModelDetail
        │
        ▼ (conditional render)
AdaptiveBatchPanel (modal)
        │
        ├─ runAdaptiveBatch()        ← engine/adaptive-batch.js (pure JS)
        │     │  uses runReplications() + confidenceInterval95()
        │     └─ { finalReps, converged, ci, results, roundHistory }
        │
        ├─ summarizeReplicationResults() + makeBatchResult()
        │
        ├─ onSave(result, config)    ← saveSimulationRun() in ModelDetail
        │
        ├─ buildBatchAnalysisPrompt() ← llm/prompts.js
        │
        └─ streamNarrative()        ← llm/apiClient.js
              └─ onSaveInsights(runId, {summary})
```

---

## Adaptive Batch Algorithm

```
tierMax  = RUN_ADMISSION_TIERS[tier].maxReplications  (10/30/100)
initial  = min(5, tierMax)
step     = max(5, floor(tierMax/5))

round 1: run `initial` reps, seeds [baseSeed .. baseSeed + initial - 1]
round N: run `step` more reps, seeds offset by accumulated total
         accumulate all results, compute CI over full pool
         stop if relativeHalfWidth < targetRelativeCI (5%)
         stop if totalReps >= tierMax
```

Seeds are globally non-overlapping across rounds (validated by test 3).

---

## Feature Scope

| ID | Feature | Status | Files |
|---|---|---|---|
| F79.1 | Adaptive batch engine | ✅ | `src/engine/adaptive-batch.js` (new) |
| F79.2 | LLM opportunity prompt | ✅ | `src/llm/prompts.js` (append `buildBatchAnalysisPrompt`); `src/llm/contracts.js` (add `BATCH_ANALYSIS`) |
| F79.3 | Explore modal panel | ✅ | `src/ui/execute/AdaptiveBatchPanel.jsx` (new) |
| F79.4 | Header button | ✅ | `src/ui/ModelDetailHeader.jsx` (add `onExplore`, `exploreVisible` props) |
| F79.5 | ModelDetail wiring | ✅ | `src/ui/ModelDetail.jsx` (imports, state, computed values, modal render) |
| F79.6 | Tests | ✅ | `tests/engine/adaptive-batch.test.js` (new, 3 tests) |
| F79.7 | Documentation | ✅ | `docs/DES_Studio_Build_Plan.md` (Sprint 79 entry); `docs/reviews/sprint-79-ai-explore-plan.md` (this file) |

---

## LLM Prompt Structure

`buildBatchAnalysisPrompt` produces a structured four-section output:

```
### Bottlenecks
Top 3 bottlenecks ranked by impact — queue/resource name, metric, reason.

### Quick Wins
3 improvements achievable without new resources (scheduling, routing, priority).

### Investment Opportunities
2 structural improvements; quantified where CI data supports it.

### Confidence Summary
Statistical robustness statement citing CI, replication count, and caveats.
```

`max_tokens: 800` · `kind: "batch_analysis"` · streamed via SSE

---

## UI Behaviour

**Running phase:**
- Progress bar filling to `totalReps / tierMax`
- Live text: `N / M replications — CI ±X.X%`
- Cancel button (AbortController)

**Analysing phase:**
- Convergence badge: green `✓ Confidence achieved: ±X.X% with N replications` or amber `⚠ Tier limit reached`
- Streaming LLM text with blinking cursor `▌`
- `aria-live="polite"` on streaming container

**Done phase:**
- Full analysis text
- `View Results` button → navigates to Results › Summary tab
- `Close` button

**Cancelled / Error phases:**
- Shows partial info if any rounds completed
- Error card with message

---

## Acceptance Criteria

- [x] `✦ Explore` button visible in Overview, Design, Run modes when model has no errors
- [x] Button absent / not rendered when model has validation errors
- [x] Progress bar and CI% update live during each round
- [x] Free tier: caps at 10 reps; "tier limit reached" shown if CI not achieved
- [x] Standard tier: caps at 30 reps
- [x] Pro tier: caps at 100 reps
- [x] Cancel terminates workers and transitions to cancelled state
- [x] Results saved to `simulation_runs` with label `✦ Explore (N reps)`
- [x] `ai_insights` populated after analysis completes
- [x] `View Results` navigates to Results › Summary tab after save
- [x] 3 engine tests pass: convergence, tier cap, seed uniqueness

---

## Test Evidence

```
✓ tests/engine/adaptive-batch.test.js  (3 tests) 1086ms
  ✓ runAdaptiveBatch > accumulates results across rounds and reports final CI
  ✓ runAdaptiveBatch > respects tier max replications
  ✓ runAdaptiveBatch > uses non-overlapping seeds across rounds
```
