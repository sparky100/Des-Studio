# Sprint 37 — Closure Report

**Sprint:** 37 — AI Model Builder Enhancements
**Completed:** 2026-05-15
**Branch:** `claude/review-sprints-31-33-0R5Mx`

## Delivered Scope

| Item | Description | Result |
|------|-------------|--------|
| S37.1 | Template catalogue in system prompt — all 16 templates with ID, domain, scenario, key macros, "when to use" | ✅ Done |
| S37.2 | `intent: "template"` response type; `templateId` field in schema; "Based on template: X" badge in UI | ✅ Done |
| S37.3 | Full macro vocabulary: 16 macros (ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE, BATCH, UNBATCH, SPLIT, COSEIZE, MATCH, PREEMPT, FAIL, REPAIR, SET, SET_ATTR, COST) | ✅ Done |
| S37.4 | Distribution selection guide (10 distributions with "when to use" notes); Schedule distribution normalised correctly in `unwrapProposedModel` | ✅ Done |
| S37.5 | `callModelBuilder` `maxTokens` raised from 4000 → 8000 | ✅ Done |
| S37.6 | Validation retry loop raised from 1 → 3; each retry appends cumulative error list as user turn + prior LLM response as assistant turn | ✅ Done |

## Detail

### S37.1 — Template catalogue

`TEMPLATE_CATALOGUE` constant added to `model-builder-prompts.js` with 16 entries: `mm1`, `mm-c`, `er-triage`, `call-center`, `surgical-suite`, `factory`, `warehouse`, `supply-chain`, `bank`, `airport-check-in`, `pharmacy`, `it-helpdesk`, `restaurant`, `outpatient-clinic`, `road-construction`, `data-center`. Each entry includes `id`, `name`, `domain`, `scenario`, `macros[]`, and `when` guidance. The `buildModelBuilderUserMessage` instruction now directs the LLM to "Check the template catalogue first" for new model requests.

### S37.2 — Template intent and badge

Response schema extended with `intent: "build|refine|clarify|template"` and `templateId` (optional string). When the LLM returns `intent: "template"` and a `templateId`, the UI chat renders `"Based on template: <id>\n\n"` prepended to the flow description bubble.

### S37.3 — Full macro vocabulary

`B_EVENT_MACROS` and `C_EVENT_MACROS` in the system prompt now include all macros added in Sprints 31–36. The prompt includes usage signatures, parameter descriptions, and example snippets for PREEMPT, FAIL, REPAIR, SPLIT, COSEIZE, MATCH, SET, SET_ATTR, and COST.

### S37.4 — Distribution guide and Schedule normalisation

Distribution selection guide added to the system prompt covering Exponential, Normal, Uniform, Triangular, Erlang, LogNormal, Piecewise, Empirical, Fixed, and Schedule. The `unwrapProposedModel` normaliser in `AiGeneratedModelPanel.jsx` was updated to exclude `times` (array) and `jitterParams` (object) from the `numericString` conversion loop, preventing corruption of Schedule distribution parameters.

### S37.6 — Retry loop

`MAX_RETRIES = 3` replaces the single-retry pattern. Each attempt appends the error summary as a user turn and the prior LLM response as an assistant turn before calling `callModelBuilder` again, giving the model full context of what went wrong.

## Files changed

| File | Change |
|------|--------|
| `src/llm/model-builder-prompts.js` | Complete rewrite: `TEMPLATE_CATALOGUE`, full macro vocabulary, distribution guide, template intent in schema |
| `src/llm/apiClient.js` | `maxTokens: 4000` → `maxTokens: 8000` |
| `src/ui/editors/AiGeneratedModelPanel.jsx` | Retry loop 1→3, Schedule `distParams` preservation, template badge |
| `tests/llm/model-builder-prompts.test.js` | Updated to 17 tests covering new macros, distribution guide, all 16 template IDs, template intent |
| `tests/ui/editors/ai-generated-model-panel.test.jsx` | 3 new tests: 3-retry loop, template badge, Schedule times preservation |

## Test results

```
tests/llm/model-builder-prompts.test.js              17/17 pass
tests/ui/editors/ai-generated-model-panel.test.jsx   new 3/3 pass
Full suite: 1129/1129 pass
```

## Acceptance criteria — final status

- [x] System prompt contains all 16 macros with usage notes
- [x] System prompt contains the 16-template catalogue with IDs, domains, scenario types, and "when to use"
- [x] Response schema includes `templateId` field; UI shows "Based on [Template]" badge when set
- [x] Schedule distribution `distParams.times` array preserved after normalisation
- [x] `callModelBuilder` uses `maxTokens: 8000`
- [x] Validation retry loop runs up to 3 times; each retry includes cumulative error list
- [x] All existing tests pass; new tests cover each change
