# Sprint 58 Closure Report — Report Generation

**Sprint:** 58  
**Theme:** Professional simulation report export (.docx)  
**Branch:** `sprint-58`  
**Status:** Complete  
**Closed:** 2026-05-17

---

## Scope Delivered

| Item | Status | Notes |
|---|---|---|
| F58.1 `callLLMOnce()` non-streaming LLM helper | ✅ Delivered | `src/llm/apiClient.js` |
| F58.2 `buildModelDescriptionPrompt()` | ✅ Delivered | `src/llm/prompts.js` |
| F58.3 `buildReportRecommendationsPrompt()` + `parseReportRecommendations()` | ✅ Delivered | `src/llm/prompts.js` |
| F58.4 `exportCanvasToPng()` / `getModelImageDataUrl()` | ✅ Delivered | `src/ui/visual-designer/graph.js` |
| F58.5 Core `.docx` generator (`generateReport`) | ✅ Delivered | `src/reports/reportGenerator.js` |
| F58.6 Reports module barrel | ✅ Delivered | `src/reports/index.js` |
| F58.7 Execute panel button + handler | ✅ Delivered | `src/ui/execute/index.jsx` |
| F58.8 Prompt builder tests (13 tests) | ✅ Delivered | `src/llm/__tests__/prompts.test.js` |
| F58.9 Canvas export tests (4 tests) | ✅ Delivered | `src/ui/visual-designer/__tests__/graph.test.js` |
| F58.10 Report generator tests (5 tests) | ✅ Delivered | `src/reports/__tests__/reportGenerator.test.js` |
| Sprint plan document | ✅ Delivered | `docs/reviews/sprint-58-plan.md` |
| Sprint closure report | ✅ Delivered | this file |
| AGENTS.md updated | ✅ Delivered | Sprint tracking, tech stack, repo structure |
| Engineering Spec v1.2 | ✅ Delivered | Added §2.5 (real-time adapters) and §2.6 (report generation) |
| User Guide v1.7 | ✅ Delivered | Version history row + §11.4 "Export a simulation report" |
| TDZ fix — ModelDetail.jsx | ✅ Delivered | `_ur.current` assignment moved after `save` declaration; `saveError` inline alert added |
| ai-model-apply-save test fix | ✅ Delivered | Exact string match `"Design"` replaces ambiguous regex |

---

## Bug Fixes Included

### TDZ — `Cannot access 'save' before initialization`

**Root cause:** `_ur.current = {undo, redo, save}` appeared at line 353, before the `const save = async () => {}` declaration at line 365. JavaScript `const` bindings are hoisted but not initialised (TDZ), so every render threw a `ReferenceError`.

**Fix:** Removed the premature assignment; added `_ur.current = {undo, redo, save}` immediately after the `save` declaration. Also added `saveError` state and an inline `role="alert"` element so save failures are visible even without a `ToastProvider`.

### ai-model-apply-save selector ambiguity

**Root cause:** `/design/i` matched three buttons ("Design", "Open Design", "Open AI Designer"). Testing Library throws when `getByRole` finds multiple matches.

**Fix:** Changed to exact string match `{ name: "Design" }`.

---

## Test Results

| Suite | Tests | Result |
|---|---|---|
| `src/llm/__tests__/prompts.test.js` | 13 | ✅ Pass |
| `src/ui/visual-designer/__tests__/graph.test.js` | 4 | ✅ Pass |
| `src/reports/__tests__/reportGenerator.test.js` | 5 | ✅ Pass |
| `tests/ui/editors/unsaved-warning.test.jsx` | 6 | ✅ Pass |
| `tests/ui/editors/ai-model-apply-save.test.jsx` | 1 | ✅ Pass |
| Engine suites (6 files) | 216 | ✅ Pass |
| Execute panel tests | 22 | ✅ Pass |
| **Total** | **~454** | **✅ All pass** |

---

## Design Decisions Made

| Decision | Rationale |
|---|---|
| `Promise.allSettled` for LLM + canvas | Report always completes even when LLM is offline or canvas capture fails |
| `docx` v9 (not earlier) | Latest stable — `ImageRun` API requires `type: 'png'`; `PageNumberElement` not constructor |
| No `#` prefix on hex colours | `docx` v9 rejects CSS-style hex strings |
| Dynamic import of `html2canvas` | Prevents crash in Node/test environments; only loads in browser at export time |
| Client-side generation only | No PII leaves the browser; no server-side dependency |
| Inline `role="alert"` for save errors | Persists for screen reader accessibility; toast auto-dismisses |

---

## Backwards Compatibility

- All existing `buildEngine()` callers unaffected (new `registry` parameter defaults to `nullRegistry`)
- All existing prompt functions (`buildNarrativePrompt`, etc.) unaffected
- Execute panel CSV export and JSON export unchanged
- `getModelImageDataUrl()` added alongside existing graph.js exports; no renames

---

## Dependencies Added

| Package | Version | Purpose |
|---|---|---|
| `docx` | ^9.6.1 | Word document generation |
| `html2canvas` | ^1.4.1 | React Flow canvas → PNG capture |

---

## Not Delivered (Deferred)

- **Calibrated Batch UI** — confirmed not previously implemented; will be addressed in Sprint 59
- **Rolling/async adapter mode** (`runAllAsync`) — deferred to Sprint 59 (real-time rolling mode)
- **Custom report templates** — potential future enhancement
