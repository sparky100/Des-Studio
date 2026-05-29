# Sprint 75 — Persistent AI Sidebar: Closure Report

**Sprint:** 75
**Theme:** Replace scattered overlay AI panels with a single persistent context-aware right sidebar
**Status:** ✅ Complete | **Completed:** 2026-05-29
**Branch:** `claude/reports-amendments-03l7y`

---

## Goal

All AI assistance previously surfaced through two inconsistent patterns: a full-tab chat experience (Design > Describe) and a fixed-position overlay panel (Results > Explain). The overlay closed on tab change, was not reachable from design tabs, and had a different visual treatment to everything else. Sprint 75 replaces the overlay with a persistent right sidebar that stays open across tab changes and adapts its content to the active tab.

---

## Delivered Features

### F75.1 — AI toggle button in tab bar

A `✦ AI` button sits at the right end of the mode selector bar in `ModelTabBar`. It highlights when the sidebar is open, has no label text on mobile (hidden entirely via `onToggleAiSidebar = null`), and is the single entry point to the sidebar from any tab.

**File:** `src/ui/ModelTabBar.jsx`

---

### F75.2 — Flex-row layout wrapper

The content area in `ModelDetail` changed from a single scrollable `div` to a flex-row container. The main content takes `flex:1` and remains fully scrollable. The sidebar occupies the rightmost 320px and does not scroll the outer container.

**File:** `src/ui/ModelDetail.jsx`

---

### F75.3 — AiAssistantPanel sidebar mode

`AiAssistantPanel` gains a `sidebar` prop. When true:
- No `position: fixed` — renders as a right-column flex child
- `borderLeft` replaces `border` + `borderRadius`
- Inner content is scrollable via `flex:1, overflowY:'auto'` wrapper
- Removes the 380px fixed width of the overlay

**File:** `src/ui/execute/AiAssistantPanel.jsx`

---

### F75.4 — Context-aware default view

`AiAssistantPanel` accepts a new `activeTab` prop. When in sidebar mode:

| Active tab | Default content |
|---|---|
| `results`, `execute` | Explain results / Compare / Refine Plan buttons |
| Any other tab | Model Q&A input ("Ask about this model") |

The Explain/Compare/Refine section and Refine Plan section are conditionally rendered based on `isResultsContext = ['results','execute'].includes(activeTab)`.

**File:** `src/ui/execute/AiAssistantPanel.jsx`

---

### F75.5 — Design-context model Q&A

New `buildModelQueryPrompt(question, model, history)` in `prompts.js` produces a `{ kind, messages, max_tokens }` prompt object. The system message includes entity types, resources, queues, B-event names, and performance goals extracted from the model definition. History is sliced to the last 8 exchanges for context.

In the sidebar (non-results context), a text input at the top sends questions via `runModelQuery` → `streamNarrative`. Responses stream into the shared `conversationHistory` chat display as `YOU` / `AI` bubbles — identical to the existing results Q&A display.

**File:** `src/llm/prompts.js`, `src/ui/execute/AiAssistantPanel.jsx`

---

### F75.6 — Retire overlay trigger

The `resultsView==="explain"` block that rendered `AiAssistantPanel` as a fixed overlay was removed from `ModelDetail`. `openResultsForRun` now maps `nextSubtab === "explain"` to `setAiSidebarOpen(true)` + `setResultsView("summary")`, so clicking Explain in the run history opens the sidebar instead of the overlay.

**File:** `src/ui/ModelDetail.jsx`

---

### F75.7 — Compact-layout handling

On viewports 720–1024px (`isCompactLayout`), the sidebar is passed `overlay={true}` instead of `sidebar={true}`. It renders as a fixed 380px panel on the right rather than shifting the layout, preserving readability at intermediate screen sizes.

**File:** `src/ui/ModelDetail.jsx`

---

### F75.8 — Esc dismiss + mobile auto-close

- `useEffect` on mount attaches a `keydown` listener; `Escape` calls `setAiSidebarOpen(false)`
- Second `useEffect` watches `isMobileLayout`; closes sidebar if viewport drops below 720px
- Toggle button is passed as `null` on mobile so it doesn't render

**File:** `src/ui/ModelDetail.jsx`

---

## Tests

| Suite | Result |
|---|---|
| `src/llm/__tests__/` (prompts) | 13/13 ✅ |
| `src/reports/__tests__/` | 13/13 ✅ |
| Full suite pre-existing failures | 40 (unchanged — engine and old UI regressions unrelated to this sprint) |

No new test failures introduced.

---

## Schema / Contract Changes

None. No model JSON fields added or changed.

---

## Architecture Notes

- `AiGeneratedModelPanel` (Design > Describe tab) is unchanged — it remains a full-tab guided authoring experience, not moved to the sidebar.
- The sidebar reuses all existing LLM infrastructure: `streamNarrative`, `callLLMOnce`, `SuggestionCard`, `RefinementCard`.
- `buildModelQueryPrompt` returns `{ kind:'model_query', messages, max_tokens:400 }` — identical shape to all other prompt builders; no apiClient changes needed.

---

## Exit Gate

- [x] `✦ AI` button visible in mode bar on desktop; hidden on mobile
- [x] Sidebar opens at 320px right; main content shrinks naturally
- [x] Sidebar stays open when switching tabs
- [x] Results/execute tabs: Explain / Compare / Refine Plan visible by default
- [x] Design tabs: "Ask about this model" Q&A input visible by default
- [x] Model Q&A: question sent, answer streams into chat bubbles
- [x] Clicking Explain in run history opens sidebar (not overlay)
- [x] Esc closes sidebar
- [x] Viewport < 720px: toggle button disappears, sidebar closes
- [x] Viewport 720–1024px: sidebar renders as overlay
- [x] 26/26 LLM + report tests pass; no new failures
