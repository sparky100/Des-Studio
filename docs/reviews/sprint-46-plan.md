# Sprint 46 — AI Apply & Verify Loop

## Goal

Close the AI suggestion loop so that each structured suggestion can be applied to a copy of the model, re-run through the simulation engine, and show before/after goal compliance inline in the AI panel — without mutating the user's model.

## Background

The "Suggest model changes" button streams plain-text qualitative advice ("consider adding more servers"). This sprint upgrades the prompt to return structured JSON, parses it into suggestion cards, and wires an "Apply & Re-run" button that patches a model copy, runs replications, and shows before/after metrics.

## Tasks

| ID | Task | File |
|---|---|---|
| S46.1 | Sprint plan document | docs/reviews/sprint-46-plan.md |
| S46.2a | Add `buildGoalGaps(model, aggregateStats)` | src/llm/prompts.js |
| S46.2b | Upgrade `buildSuggestionPrompt` — 6-step CoT system prompt, JSON schema output, goalGaps in payload | src/llm/prompts.js |
| S46.2c | Add `parseSuggestionResponse(text)` — extract JSON from markdown fences, fallback to plain text | src/llm/prompts.js |
| S46.2d | Add `applySuggestionPatch(model, change)` — deep-clone + apply entityTypeCount / queueCapacity / stateVariable | src/llm/prompts.js |
| S46.3 | `runWithPatch` callback in ExecutePanel, pass as `onRunWithPatch` to AiAssistantPanel | src/ui/execute/index.jsx |
| S46.4 | Structured suggestion UI in AiAssistantPanel — suggestion cards, Apply & Re-run button, before/after table | src/ui/execute/AiAssistantPanel.jsx |
| S46.5 | 13 new tests covering all new exported functions | tests/llm/prompts.test.js |

## Acceptance Criteria

- `buildGoalGaps` correctly computes met/missed status and gap for all goal operators.
- `buildSuggestionPrompt` system prompt contains the 6-step chain-of-thought and instructs the LLM to output a ```json block.
- `parseSuggestionResponse` extracts suggestions from JSON fences; falls back to `{ analysis: text, suggestions: [] }` on failure.
- `applySuggestionPatch` returns a deep clone with the correct field changed; unknown target returns original model unchanged; does not mutate.
- `runWithPatch` resolves with `{ aggregateStats, summary }` using the same experiment config, no DB write.
- AiAssistantPanel renders suggestion cards when `parsedSuggestion` is set; "Apply & Re-run" triggers patch + re-run + before/after table.
- All existing tests pass; 13 new Sprint 46 tests pass.

## Design Decisions

- No permanent model mutation — the patch run is "what-if" only.
- `applySuggestionPatch` uses `JSON.parse(JSON.stringify(model))` for deep clone — no new dependencies.
- `change.type === "manual"` means the LLM proposed a structural change that cannot be auto-applied; the button is disabled and a note is shown.
- Verify results keyed by suggestion `rank` (integer), stored in component state only.
- The before/after comparison table shows model goals only, comparing baseline `aggregateStats` to post-patch `aggregateStats`.

## Non-Goals

- No permanent save of patched model.
- No diff view of model structure.
- No multi-step patch chains.
