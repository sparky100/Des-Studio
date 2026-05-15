# Sprint 37 — Closure Report

**Sprint:** 37 — AI Model Builder Enhancements
**Completed:** 2026-05-15
**Branch:** `claude/review-sprints-31-33-0R5Mx`

## Delivered Scope

| Item | Description | Result |
|------|-------------|--------|
| S37.1 | Template catalogue in system prompt (all 16 templates) | ✅ Done |
| S37.2 | `intent: "template"` + `templateId` in response schema; UI badge | ✅ Done |
| S37.3 | Full macro vocabulary — 16 macros with usage notes | ✅ Done |
| S37.4 | Distribution selection guide + Schedule dist normalisation | ✅ Done |
| S37.5 | `max_tokens` 4000 → 8000 | ✅ Done |
| S37.6 | Retry loop 1 → 3 with cumulative error history | ✅ Done |

## Detail

### S37.1 — Template catalogue

Added a 16-row catalogue to the system prompt, one row per template:
```
id:call-center | "Call Center" (Service Systems) | Multi-server with abandonment | macros: ARRIVE ASSIGN COMPLETE RENEGE | use when: Phone queues where callers abandon if wait too long
```
The prompt instructs the LLM to check the catalogue before building from scratch and to set `intent: "template"` when a match is found.

### S37.2 — Template intent

Added `intent: "template"` to the response schema. When returned by the LLM:
- `templateId` identifies which template was used as the base
- `proposedModel` contains the fully adapted model JSON
- UI shows "Based on template: `<templateId>`" in the flow-description system bubble

### S37.3 — Macro vocabulary

The prompt previously listed 7 macros. Now covers all 16:

| Added | Usage note |
|-------|-----------|
| PREEMPT | Interrupt service; entity re-queues with remaining time |
| FAIL / REPAIR | Machine breakdown/MTBF-MTTR modelling |
| SPLIT | Entity cloning for parallel sub-tasks |
| COSEIZE | Atomic multi-resource seizure (surgical suites, workstations) |
| MATCH | Two-party entity synchronisation (order+item) |
| SET / SET_ATTR | Safe arithmetic expressions over state vars and entity attrs |
| COST | Per-entity cost accumulation to summary.totalCost |

B-event and C-event permitted macro lists updated accordingly.

### S37.4 — Distribution guide + Schedule normalisation

Added an 8-entry "Distribution Selection Guide" section to the system prompt explaining when to use each distribution with examples. Includes Schedule with the `times[]` pattern.

`AiGeneratedModelPanel.jsx` fixes:
- Added `schedule`/`plan` aliases to `DIST_NAMES`
- `normalizeDistribution` now excludes `times` (array) and `jitterParams` (nested object) from the `numericString` conversion that would corrupt them

### S37.5 — max_tokens 8000

Changed `callModelBuilder` in `apiClient.js` from `maxTokens: 4000` to `maxTokens: 8000`. Removes the compression pressure that caused complex models to be truncated or structural errors introduced.

### S37.6 — Three retries with cumulative history

The validation retry loop now runs up to 3 times (previously 1). Each retry appends:
1. The cumulative error list to the user turn
2. The LLM's retry response to the assistant turn

This gives the LLM full context of what it has already tried, reducing cascading fix-breaks-something-else failures.

## Files changed

| File | Change |
|------|--------|
| `src/llm/model-builder-prompts.js` | Template catalogue, 16-macro vocabulary, distribution guide, `intent:template` schema |
| `src/llm/apiClient.js` | `maxTokens` 4000 → 8000 |
| `src/ui/editors/AiGeneratedModelPanel.jsx` | Schedule dist aliases; `times`/`jitterParams` normalisation fix; 3-retry loop; template badge |
| `tests/llm/model-builder-prompts.test.js` | Updated and expanded (17 tests) |
| `tests/ui/editors/ai-generated-model-panel.test.jsx` | 3 new tests (retry loop, template intent, Schedule normalisation) |
| `docs/reviews/sprint-37-plan.md` | Sprint plan |
| `docs/reviews/sprint-37-closure-report.md` | This document |

## Test results

```
tests/llm/model-builder-prompts.test.js          17/17 pass
tests/ui/editors/ai-generated-model-panel.test.jsx 19/19 pass
Full suite: 1143/1143 pass
```
