# Sprint 58 Plan — Report Generation

**Sprint:** 58  
**Theme:** Professional simulation report export (.docx)  
**Branch:** `sprint-58`  
**Status:** In progress  
**Date:** 2026-05-17

---

## Objective

Enable modellers to export a polished Word (.docx) report from any completed simulation run, suitable for sharing with non-technical stakeholders. The report is generated entirely client-side (docx v9, html2canvas) with LLM-generated narrative and recommendations fetched via the existing proxy.

---

## Deliverables

| ID | Deliverable | File(s) |
|---|---|---|
| F58.1 | Non-streaming LLM helper | `src/llm/apiClient.js` → `callLLMOnce()` |
| F58.2 | Model description prompt builder | `src/llm/prompts.js` → `buildModelDescriptionPrompt()` |
| F58.3 | Recommendations prompt builder + parser | `src/llm/prompts.js` → `buildReportRecommendationsPrompt()`, `parseReportRecommendations()` |
| F58.4 | Canvas export utility | `src/ui/visual-designer/graph.js` → `exportCanvasToPng()`, `getModelImageDataUrl()` |
| F58.5 | Core .docx generator | `src/reports/reportGenerator.js` |
| F58.6 | Reports module barrel | `src/reports/index.js` |
| F58.7 | Execute panel button + handler | `src/ui/execute/index.jsx` |
| F58.8 | Prompt builder tests | `src/llm/__tests__/prompts.test.js` |
| F58.9 | Canvas export tests | `src/ui/visual-designer/__tests__/graph.test.js` |
| F58.10 | Report generator tests | `src/reports/__tests__/reportGenerator.test.js` |

---

## Report Structure (7 Sections)

1. **Cover** — model name, run label, date, engine version  
2. **Executive Summary** — top KPIs table + primary recommendation headline  
3. **Model Description** — LLM-generated plain-English narrative (non-technical)  
4. **Experiment Configuration** — kvTable of seed, warmup, duration, replications, termination mode  
5. **Model Diagram** — React Flow canvas capture (html2canvas) or placeholder  
6. **Simulation Results** — summary stats, per-queue wait percentiles (P50/P90/P95/P99), resource utilisation, goal gap table, CI intervals (if replications > 1)  
7. **Recommendations** — 3 structured LLM blocks (headline, finding, action, expected impact, confidence)  
8. **Appendix** — entity types, queues, bound events, conditional events, state variables

---

## LLM Prompt Specifications

### Prompt 1: Model Description (`buildModelDescriptionPrompt`)
- **System role**: Non-technical report writer; describes the simulation in plain English for business readers
- **Forbidden terms in system prompt**: B-event, C-event, macro, ARRIVE, COMPLETE, ASSIGN, Phase
- **Context injected**: entity types (customers/servers), queues, arrival/service vocabulary, feature flags (cost/shifts/containers/failures/priority), goals
- **Target output**: 120–180 words, single paragraph
- **max_tokens**: 400

### Prompt 2: Recommendations (`buildReportRecommendationsPrompt`)
- **System role**: Simulation analyst producing JSON recommendations
- **Context injected**: KPI summary, goal gaps, per-queue wait distribution, resource utilisation, entity anomalies
- **Output schema**: `[{ priority, headline, finding, action, expectedImpact, confidence }]`
- **max_tokens**: 700

---

## Design Decisions

| Decision | Rationale |
|---|---|
| `Promise.allSettled` for parallel LLM + canvas | Report generates even when LLM or canvas is unavailable |
| `callLLMOnce` (non-streaming) | Report narrative doesn't need streaming; simpler to compose into docx |
| `html2canvas` dynamic import | Avoids SSR/test environment crash; only loaded in browser at export time |
| `docx` v9 | Latest stable; `ImageRun` requires `type: 'png'`; no `#` prefix on hex colours; `PageNumberElement` not `PageNumber` constructor |
| Client-side generation | No server round-trip; no PII leaves the browser |
| Blob download via `URL.createObjectURL` | Standard browser download pattern; no temporary file on server |
| LLM description uses `callLLMOnce` (kind: `model-description`) | Routes through existing proxy — no new API surface |

---

## Acceptance Criteria

- [ ] "Export Report" button appears in Execute panel after a run completes
- [ ] Button is disabled before any run and shows tooltip
- [ ] Button shows "Generating report…" spinner state during generation
- [ ] Downloaded file is a valid `.docx` (not corrupt), opens in Word/LibreOffice
- [ ] File name is `<ModelName> — <RunLabel> — Report.docx`
- [ ] Report includes all 8 sections
- [ ] LLM failure produces report without narrative (fallback to description field)
- [ ] Canvas capture failure produces report with placeholder text
- [ ] All 22 new tests pass
- [ ] Full regression suite passes (0 regressions)

---

## Test Coverage

| File | Tests | Coverage |
|---|---|---|
| `src/llm/__tests__/prompts.test.js` | 13 | buildModelDescriptionPrompt (4), buildReportRecommendationsPrompt (4), parseReportRecommendations (5) |
| `src/ui/visual-designer/__tests__/graph.test.js` | 4 | null canvas, successful capture, html2canvas error, delegate |
| `src/reports/__tests__/reportGenerator.test.js` | 5 | valid Blob, LLM failure, canvas failure, empty model, image inclusion |

---

## Dependencies

- `docx` v9.6.1 (new)
- `html2canvas` v1.4.1 (new)
- Existing: `callModelBuilder` proxy pattern, `buildGoalGaps`, React Flow render
