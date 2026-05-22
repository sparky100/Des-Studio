# Sprint 8C Closure Report — AI Generator Conversational Quality

**Sprint:** 8C (Rectification)
**Theme:** Three-phase conversation discipline, plain-English outcome presentation, proactive refinement chips
**Date closed:** —
**Status:** 🔄 In progress

---

## Delivered scope

| # | Item | Status | Notes |
|---|------|--------|-------|
| 8C-1 | Remove 2-question cap; add 7-question Phase A sequence; enforce Phase B format | ⬜ | `src/llm/model-builder-prompts.js` |
| 8C-2 | Add 6 missing prompt tests | ⬜ | `tests/llm/model-builder-prompts.test.js` |
| 8C-3 | Enhance `SimulationSummaryCard` with flow path, resources, goals | ⬜ | `src/ui/editors/ModelDiffPreview.jsx` |
| 8C-4 | Add 3 missing `ModelDiffPreview` tests | ⬜ | `tests/ui/editors/model-diff-preview.test.jsx` |
| 8C-5 | Fix chip border colour, background, border-radius, hover state | ⬜ | `src/ui/editors/AiGeneratedModelPanel.jsx` |
| 8C-6 | Add 2 missing `AiGeneratedModelPanel` chip edge-case tests | ⬜ | `tests/ui/editors/ai-generated-model-panel.test.jsx` |
| 8C-7 | Correct build plan Sprint 8C entry | ⬜ | `docs/DES_Studio_Build_Plan.md` |

Items already correctly implemented (carried forward from prior pass):

| # | Item | Status | Notes |
|---|------|--------|-------|
| F8C.2 | Confirmation bubble (`ConfirmBubble`, "Looks right / Something's wrong") | ✅ Complete | `src/ui/editors/AiGeneratedModelPanel.jsx` — fully implemented and tested |
| F8C.4 (behavior) | Refinement chips render/clear/submit correctly | ✅ Complete | Tests passing; only styling gap remains (8C-5) |
| F8C.5 | User Guide §2.X and Engineering Spec §6.10 | ✅ Complete | Written to spec |

---

## Key design decisions

*(To be completed when sprint closes)*

---

## Files changed

| File | Change |
|------|--------|
| `src/llm/model-builder-prompts.js` | Remove 2-question cap; add 7-question sequence; enforce Phase B format; fix user message instruction |
| `src/ui/editors/ModelDiffPreview.jsx` | Expand `SimulationSummaryCard` with WHO ARRIVES, HOW THEY FLOW, RESOURCES, GOALS sections |
| `src/ui/editors/AiGeneratedModelPanel.jsx` | Fix chip border (`C.accent`), background (`transparent`), `borderRadius` (`999`), hover state |
| `tests/llm/model-builder-prompts.test.js` | Add 6 prompt tests: PHASE A/B/C markers, confirm intent, no-cap assertion, suggestions[] |
| `tests/ui/editors/model-diff-preview.test.jsx` | Add 3 tests: WHO ARRIVES sentence, null llmExplanation omitted, RESOURCES per-server |
| `tests/ui/editors/ai-generated-model-panel.test.jsx` | Add 2 tests: no chips on confirm intent, single-item chip array |
| `docs/DES_Studio_Build_Plan.md` | Correct Sprint 8C status; add document history entry |

---

## Test summary

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| `tests/llm/model-builder-prompts.test.js` | — tests passing | — | +6 |
| `tests/ui/editors/model-diff-preview.test.jsx` | — tests passing | — | +3 |
| `tests/ui/editors/ai-generated-model-panel.test.jsx` | — tests passing | — | +2 |
| Full suite | — | — | +11 |

*(To be completed with actual counts when sprint closes)*

---

## Acceptance criteria review

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| AC-1 | System prompt instructs LLM to ask ONE question at a time with no cap | ⬜ | |
| AC-2 | System prompt includes 7-question ordered Phase A sequence | ⬜ | |
| AC-3 | System prompt enforces "Here is my understanding" Phase B format | ⬜ | |
| AC-4 | `buildModelBuilderUserMessage` does not contain "at most 2 questions" | ⬜ | |
| AC-5 | `SimulationSummaryCard` renders WHO ARRIVES as a full sentence | ⬜ | |
| AC-6 | `SimulationSummaryCard` renders HOW THEY FLOW with per-stage detail | ⬜ | |
| AC-7 | `SimulationSummaryCard` renders RESOURCES per server type with count | ⬜ | |
| AC-8 | `SimulationSummaryCard` renders GOALS when present; omits when absent | ⬜ | |
| AC-9 | Chips use `C.accent` border, transparent background, fill on hover | ⬜ | |
| AC-10 | All 6 prompt tests pass | ⬜ | |
| AC-11 | All 3 ModelDiffPreview tests pass | ⬜ | |
| AC-12 | All 2 AiGeneratedModelPanel tests pass | ⬜ | |
| AC-13 | All existing tests continue to pass | ⬜ | |

---

## Evidence of new AI route working

*(To be completed at close — attach or describe manual verification results)*

Manual verification checklist from `sprint-8c-plan.md`:

```
[ ] 1. Blank model → AI Generator tab
[ ] 2. Type: "I want to model a busy GP surgery"
[ ] 3. LLM asks exactly ONE question (not a list)
[ ] 4. Answer each question in turn; count questions asked
[ ] 5. After 4–7 questions: confirmation bubble appears (teal-bordered)
[ ] 6. Confirmation bubble shows "Here is my understanding of your system:"
         with Arrivals / Flow / Queue discipline / Goal sections
[ ] 7. Click "Looks right — build it"
[ ] 8. Outcome card shows WHO ARRIVES sentence with distribution
[ ] 9. Outcome card shows HOW THEY FLOW with per-stage routing
[ ] 10. Outcome card shows RESOURCES with server count
[ ] 11. 3 refinement chips appear with accent-coloured pill border
[ ] 12. Hover a chip — background fills with accent colour
[ ] 13. Click a chip — submits text; all chips disappear
[ ] 14. Click "Refine this" — textarea focused
[ ] 15. Click "Apply model" — model loads correctly
[ ] 16. Switch to Forms/Tabs — entity types, queues, B-events, C-events present
```

---

## Out of scope (deferred)

- Engine or schema changes
- New npm dependencies
- Any Sprint 67 or later sprint work

---

## Follow-on items

*(To be completed at close)*

---

*Closure template created: 2026-05-22*
