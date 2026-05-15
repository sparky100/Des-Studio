# Sprint 37 — Plan

**Sprint:** 37 — AI Model Builder Enhancements
**Branch:** `claude/review-sprints-31-33-0R5Mx`
**Date:** 2026-05-15

## Objective

Improve the AI model creation capability to produce better first-attempt models, surface the template library, expose the full macro vocabulary, and be more resilient to validation errors.

## Background

The AI model builder (introduced in an early sprint) has accumulated several gaps:
- 16 curated templates exist but the AI prompt never mentions them — the LLM always builds from scratch
- 9 macros added in Sprints 31–36 (PREEMPT, FAIL, REPAIR, SPLIT, COSEIZE, MATCH, SET, SET_ATTR, COST) are absent from the prompt; the Schedule distribution is also missing
- `max_tokens: 4000` truncates complex models
- The single-retry validation loop often fails to converge
- No distribution selection guidance means the LLM picks distributions arbitrarily

## Scope

| ID | Item | File(s) |
|----|------|---------|
| S37.1 | Template catalogue in system prompt | `model-builder-prompts.js` |
| S37.2 | `intent: "template"` response type + UI badge | `model-builder-prompts.js`, `AiGeneratedModelPanel.jsx` |
| S37.3 | Full macro vocabulary (16 macros) | `model-builder-prompts.js` |
| S37.4 | Distribution selection guide + Schedule dist | `model-builder-prompts.js`, `AiGeneratedModelPanel.jsx` |
| S37.5 | max_tokens 4000 → 8000 | `apiClient.js` |
| S37.6 | Retry loop: 1 → 3 with cumulative error history | `AiGeneratedModelPanel.jsx` |

## Acceptance criteria

- [ ] System prompt contains all 16 macros with usage notes
- [ ] System prompt contains the 16-template catalogue with IDs, domains, scenario types, and "when to use"
- [ ] Response schema includes `templateId` field; UI shows "Based on [Template]" badge when set
- [ ] Schedule distribution normalised correctly in `unwrapProposedModel` (times array preserved)
- [ ] `callModelBuilder` uses `maxTokens: 8000`
- [ ] Validation retry loop runs up to 3 times; each retry includes cumulative error list
- [ ] All existing tests pass; new tests cover each change
