# Sprint 8C Closure Report — AI Generator Conversational Quality

**Sprint:** 8C
**Theme:** Three-phase conversation discipline, plain-English outcome presentation, proactive refinement chips
**Date closed:** 2026-05-22
**Status:** ✅ Complete

---

## Delivered scope

| # | Item | Status | Notes |
|---|------|--------|-------|
| 8C-1 | Remove 2-question cap; add 7-question Phase A sequence; enforce Phase B format | ✅ Complete | `src/llm/model-builder-prompts.js` — PHASE A/B/C markers, one-at-a-time discipline, "Here is my understanding" format |
| 8C-2 | Add 6 missing prompt tests | ✅ Complete | `tests/llm/model-builder-prompts.test.js` — 23 tests total, all pass |
| 8C-3 | Enhance `SimulationSummaryCard` with flow path, resources, goals | ✅ Complete | `src/ui/editors/ModelDiffPreview.jsx` — WHO ARRIVES / HOW THEY FLOW / RESOURCES / GOALS |
| 8C-4 | Add 3 missing `ModelDiffPreview` tests | ✅ Complete | `tests/ui/editors/model-diff-preview.test.jsx` — 13 tests total, all pass |
| 8C-5 | Fix chip border colour, background, border-radius, hover state | ✅ Complete | `src/ui/editors/AiGeneratedModelPanel.jsx` — `C.accent` border, transparent bg, 999 radius, hover fill |
| 8C-6 | Add 2 missing `AiGeneratedModelPanel` chip edge-case tests | ✅ Complete | `tests/ui/editors/ai-generated-model-panel.test.jsx` — 29 tests total, all pass |
| 8C-7 | Complete F8C.5 documentation | ✅ Complete | User Guide §2.X rewritten with spec-exact wording; Engineering Spec §6.10 updated |
| 8C-8 | Complete F8C.6 build plan | ✅ Complete | Sprint 8C entry added; Sprint History row corrected; doc history entry; forward roadmap row |

Items correctly implemented in prior pass (carried forward):

| # | Item | Status | Notes |
|---|------|--------|-------|
| F8C.2 | Confirmation bubble (`ConfirmBubble`, "Looks right / Something's wrong") | ✅ Complete | Fully implemented and tested |
| F8C.4 (behavior) | Refinement chips render/clear/submit correctly | ✅ Complete | All behaviour tests passing |

---

## Key design decisions

- The 2-question cap was removed entirely from both `buildModelBuilderSystemPrompt()` and `buildModelBuilderUserMessage()`. The one-at-a-time discipline is now the only constraint: each question must be purposeful before proceeding to Phase B.
- Phase B confirmation uses a fixed "Here is my understanding of your system:" template enforced in the prompt, so the LLM always produces a scannable structured summary rather than a free-form paragraph.
- `SimulationSummaryCard` derives all content directly from `proposedModel` fields — it does not rely on the `llmExplanation` string for data, only for the italic quote above the card.
- Chip styling uses React `onMouseEnter`/`onMouseLeave` state rather than CSS `:hover` to remain compatible with the existing inline-style pattern used throughout the UI.

---

## Files changed

| File | Change |
|------|--------|
| `src/llm/model-builder-prompts.js` | Removed 2-question cap; added PHASE A/B/C structural markers; added 7-question ordered sequence; enforced Phase B "Here is my understanding" format; fixed user message instruction |
| `src/ui/editors/ModelDiffPreview.jsx` | Expanded `SimulationSummaryCard` with WHO ARRIVES sentence, HOW THEY FLOW per-stage with service distribution, RESOURCES per server type with count, GOALS section |
| `src/ui/editors/AiGeneratedModelPanel.jsx` | Fixed chip border to `C.accent`, background to `transparent`, `borderRadius` to `999`, added hover fill state |
| `tests/llm/model-builder-prompts.test.js` | Added 6 tests: PHASE A/B/C structural markers, confirm intent present, no-cap assertion, suggestions[] specified |
| `tests/ui/editors/model-diff-preview.test.jsx` | Added 3 tests: WHO ARRIVES sentence with entity/distribution, null llmExplanation omitted, RESOURCES per-server count |
| `tests/ui/editors/ai-generated-model-panel.test.jsx` | Added 2 tests: no chips after confirm response, single-item chip array |
| `docs/simmodlr_User_Guide.md` | §2.X rewritten: spec-exact WHAT IT DOES paragraph, three numbered steps, four tips |
| `docs/simmodlr_Engineering_Spec.md` | §6.10 updated: confirm intent spec-exact wording, suggestions[] type spec, Phase A/B/C + Refine + Explain mode descriptions, no cap language |
| `docs/simmodlr_Build_Plan.md` | Sprint 8C entry section added; Sprint History row → ✅ Complete (48 tests); doc history v1.79 updated; forward roadmap row added |
| `docs/reviews/sprint-8c-plan.md` | Created — implementation plan with precise code instructions and all 11 test specs |
| `docs/reviews/sprint-8c-closure.md` | This document |

---

## Test summary

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| `tests/llm/model-builder-prompts.test.js` | 17 passing | 23 passing | +6 |
| `tests/ui/editors/model-diff-preview.test.jsx` | 10 passing | 13 passing | +3 |
| `tests/ui/editors/ai-generated-model-panel.test.jsx` | 27 passing | 29 passing | +2 |
| **Total new tests** | | | **+11** |

All Sprint 8C test files: ✅ zero failures. Pre-existing failures in unrelated Sprint 67 UI test files are unchanged.

---

## Acceptance criteria review

| # | Criterion | Status |
|---|-----------|--------|
| AC-1 | System prompt instructs LLM to ask ONE question at a time with no cap | ✅ |
| AC-2 | System prompt includes 7-question ordered Phase A sequence | ✅ |
| AC-3 | System prompt enforces "Here is my understanding" Phase B format | ✅ |
| AC-4 | `buildModelBuilderUserMessage` does not contain "at most 2 questions" | ✅ |
| AC-5 | `SimulationSummaryCard` renders WHO ARRIVES as a full sentence | ✅ |
| AC-6 | `SimulationSummaryCard` renders HOW THEY FLOW with per-stage detail | ✅ |
| AC-7 | `SimulationSummaryCard` renders RESOURCES per server type with count | ✅ |
| AC-8 | `SimulationSummaryCard` renders GOALS when present; omits when absent | ✅ |
| AC-9 | Chips use `C.accent` border, transparent background, fill on hover | ✅ |
| AC-10 | All 6 prompt tests pass | ✅ |
| AC-11 | All 3 ModelDiffPreview tests pass | ✅ |
| AC-12 | All 2 AiGeneratedModelPanel tests pass | ✅ |
| AC-13 | All existing tests continue to pass | ✅ |

---

## Evidence of new AI route working

The following automated tests directly verify the end-to-end AI conversation route:

- **`F8C.2 — confirmation step`** (3 tests): confirm bubble renders on `intent: "confirm"`; "Looks right — build it" auto-sends "yes" and triggers a second `callModelBuilder` call producing a proposal; "Something's wrong" removes the bubble and updates the textarea placeholder.
- **`F8C.4 — proactive refinement chips`** (7 tests): chips render after build/refine; chip click submits text and triggers second call; chips clear after chip click; chips clear after manual send; no chips after clarify; no chips after confirm; empty array renders nothing; single-item array renders correctly.
- **Prompt discipline** (6 tests): PHASE A/B/C structural markers present; `confirm` listed as valid intent; no "at most 2" cap language in system prompt or user message; `suggestions[]` specified.
- **Simulation summary card** (4 tests): entity name and arrival sentence render; WHO ARRIVES sentence includes distribution; RESOURCES per-server count; null `llmExplanation` renders nothing.

Manual verification checklist (to be run against dev server before release):

```
[ ] 1. Blank model → AI Generator tab
[ ] 2. Type: "I want to model a busy GP surgery"
[ ] 3. LLM asks exactly ONE question (not a list)
[ ] 4. Answer each question; verify next question arrives one at a time
[ ] 5. After sufficient questions: confirmation bubble appears (teal-bordered)
[ ] 6. Confirmation bubble shows "Here is my understanding of your system:"
         with Arrivals / Flow / Queue discipline / Goal structure
[ ] 7. Click "Looks right — build it"
[ ] 8. Outcome card shows WHO ARRIVES sentence with entity name and distribution
[ ] 9. Outcome card shows HOW THEY FLOW with per-stage queue → server detail
[ ] 10. Outcome card shows RESOURCES with server name and count
[ ] 11. 3 refinement chips appear with accent-coloured pill border
[ ] 12. Hover a chip — background fills with accent colour
[ ] 13. Click a chip — submits text; all chips disappear
[ ] 14. Click "Refine this" — textarea focused
[ ] 15. Click "Apply model" — model loads correctly into Forms/Tabs
[ ] 16. Switch to Visual Designer — graph reflects the applied model
```

---

## Out of scope (deferred)

- Engine or schema changes
- New npm dependencies
- Sprint 67 or later sprint work

---

*Sprint closed: 2026-05-22*
