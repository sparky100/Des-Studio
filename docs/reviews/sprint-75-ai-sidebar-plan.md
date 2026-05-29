# Sprint 75 — Persistent AI Sidebar

**Sprint:** 75  
**Theme:** Unified, context-aware AI assistant panel  
**Status:** ⬜ Planned | **Created:** 2026-05-29  
**Branch:** `claude/sprint-75-ai-sidebar`

---

## Goal

Replace the floating Results-tab-only AI overlay with a collapsible right sidebar that is accessible from every tab. The panel adapts its available actions to the current context (design vs. results), uses a consistent chat-bubble presentation, and degrades gracefully on mobile.

---

## Background and Motivation

The app currently has two separate AI surfaces that look and behave differently:

| Surface | Location | Style | Trigger |
|---------|----------|-------|---------|
| **Describe** (`ai` tab) | Full-width tab in Design mode | Conversational chat, multi-turn | Top-level tab |
| **Explain / Compare / Refine Plan** | Results sub-tab only | 380px floating overlay, `pre-wrap` text block | Buttons in Results sub-tab bar |

Problems:
- A modeller cannot ask the AI a question while they are authoring (B-events, C-events, queues) without switching to the Describe tab, which resets their context.
- The floating overlay breaks the reading flow of the results view and is not dismissible from the keyboard.
- The response area renders streaming text as a monolithic `pre-wrap` block; the existing conversation history (`conversationHistory` state) is buried and the YOU/AI label style is inconsistent with the Describe panel.
- On the Results tab, three separate trigger buttons (Explain, Compare, Refine Plan) are visually disconnected from the panel they open.

---

## Scope Guardrails

- Do not change the LLM prompt logic, `streamNarrative`, `callLLMOnce`, or any `src/llm/` files.
- Do not move the `AiGeneratedModelPanel` (Describe tab) — it stays as a full-page tab. The sidebar is a complement, not a replacement.
- Preserve all existing Explain, Compare, and Refine Plan functionality — only the presentation changes.
- The sidebar must not break the existing layout on the visual designer (`visual` tab) where canvas space is at a premium; it should be closeable and its state should not affect canvas sizing.
- Mobile (< 720px): sidebar is not rendered (already excluded from mobile tab list per Sprint navigation fix).
- No new LLM dependencies; no new npm packages.

---

## Structured Work Items

| ID | Priority | Work item | Status | Files |
|---|---:|---|---|---|
| F75.1 | P0 | Add AI sidebar toggle to ModelDetail toolbar | ⬜ | `ModelDetail.jsx` |
| F75.2 | P0 | Sidebar layout: right panel alongside main content | ⬜ | `ModelDetail.jsx` |
| F75.3 | P0 | Context-aware panel header and action set | ⬜ | `AiAssistantPanel.jsx` |
| F75.4 | P1 | Chat-bubble rendering for conversation history | ⬜ | `AiAssistantPanel.jsx` |
| F75.5 | P1 | Results context: wire Explain / Compare / Refine into sidebar | ⬜ | `ModelDetail.jsx`, `AiAssistantPanel.jsx` |
| F75.6 | P1 | Design context: question-answering about model structure | ⬜ | `AiAssistantPanel.jsx`, `src/llm/prompts.js` |
| F75.7 | P2 | Remove standalone AI buttons from Results sub-tab bar | ⬜ | `ModelDetail.jsx` |
| F75.8 | P2 | Sidebar width, collapse animation, keyboard dismiss (Esc) | ⬜ | `ModelDetail.jsx`, `AiAssistantPanel.jsx` |
| F75.9 | P2 | Update build plan and docs | ⬜ | `docs/DES_Studio_Build_Plan.md` |

---

## Detailed Design

### F75.1 — AI sidebar toggle

Add a persistent "AI" button to the right end of the `ModelTabBar` (or to the `ModelDetailHeader`). It should:
- Be visible on every tab except mobile
- Show an active/filled state when the sidebar is open
- Toggle `aiSidebarOpen` boolean state in `ModelDetail`

```jsx
// Candidate location: ModelDetail.jsx, near ModelTabBar render
<button
  onClick={() => setAiSidebarOpen(o => !o)}
  aria-label={aiSidebarOpen ? "Close AI assistant" : "Open AI assistant"}
  style={{ /* pill button, right side of tab bar */ }}
>
  AI {aiSidebarOpen ? "▸" : "▾"}
</button>
```

State to add to `ModelDetail.jsx` (~line 523):
```js
const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
```

---

### F75.2 — Sidebar layout

Change the main content wrapper from a single scrolling div to a flex row:

```jsx
// Before (line ~967):
<div style={{flex:1, overflowY:"auto", padding:"clamp(12px,2vw,20px)"}}>
  {/* tab content */}
</div>

// After:
<div style={{flex:1, display:"flex", overflow:"hidden"}}>
  <div style={{flex:1, overflowY:"auto", padding:"clamp(12px,2vw,20px)"}}>
    {/* tab content — unchanged */}
  </div>
  {aiSidebarOpen && !isMobileLayout && (
    <AiAssistantPanel
      sidebar
      activeTab={tab}
      model={model}
      results={latestResults}
      /* ...all existing props... */
      onClose={() => setAiSidebarOpen(false)}
    />
  )}
</div>
```

The sidebar renders as a fixed-width right column (`320px`), not a floating overlay. The main content shrinks naturally.

---

### F75.3 — Context-aware panel

`AiAssistantPanel` receives `activeTab` prop. The panel header and available actions change based on context:

| `activeTab` group | Panel title | Available actions |
|---|---|---|
| `results` | "AI Analysis" | Explain, Compare, Refine Plan, Ask a question |
| `bevents`, `cevents`, `queues`, `entities`, `schedules` | "AI Help" | Ask a question about the model |
| `execute` | "AI Analysis" | Explain (if results exist), Ask a question |
| `overview`, `ai`, other | "AI Assistant" | Ask a question |

The `triggerAction` prop remains for backwards compat (history tab "Explain this run" still works).

---

### F75.4 — Chat-bubble rendering

Replace the monolithic `pre-wrap` response area with a message list:

```jsx
// Each message in conversationHistory rendered as a bubble:
<div style={{
  alignSelf: entry.role === "user" ? "flex-end" : "flex-start",
  background: entry.role === "user" ? C.accent + "22" : C.surface,
  border: `1px solid ${entry.role === "user" ? C.accent + "44" : C.border}`,
  borderRadius: 10,
  padding: "8px 12px",
  maxWidth: "88%",
  fontSize: 12,
  lineHeight: 1.7,
  fontFamily: FONT,
  color: C.text,
  whiteSpace: "pre-wrap",
}}>
  {entry.content}
</div>
```

The streaming response token accumulates in the same bubble area (last message slot) while `status === "streaming"`.

---

### F75.5 — Results context wiring

When `activeTab === "results"` and `latestResults` is available, the sidebar shows the three action buttons (Explain, Compare, Refine Plan) above the chat area. Clicking them fires the same `runPrompt` / `handleRefinePlan` functions as today.

Remove the duplicate buttons from the Results sub-tab bar (F75.7) once F75.5 is confirmed working.

---

### F75.6 — Design context: model Q&A

When on a design tab, the "Ask a question" input is the primary interface. Questions are answered using a lightweight "model context" prompt that includes the current model structure (entity types, queues, B-events, C-events). Reuse `buildResultsQueryPrompt` pattern but with model JSON instead of results as context.

New function in `src/llm/prompts.js`:
```js
export function buildModelQueryPrompt(question, model, conversationHistory = []) { ... }
```

---

### F75.7 — Remove standalone Results-tab buttons

After F75.5 is confirmed, remove the three `<Btn>` elements (Explain, Compare, Refine Plan) from the Results sub-tab bar (ModelDetail.jsx lines ~1236–1247). The `← Run` button stays.

---

### F75.8 — Polish

- Sidebar width: `320px` on compact layout, `360px` on desktop (`isCompactLayout` from existing hook)
- CSS transition: `width 0.2s ease` or animate via `maxWidth` from `0 → 360px`
- `Esc` key closes sidebar when focus is inside it (add `onKeyDown` on sidebar container)
- `aria-label="AI assistant"` already present on `<aside>` in `AiAssistantPanel`

---

## Files Modified

| File | Change |
|---|---|
| `src/ui/ModelDetail.jsx` | `aiSidebarOpen` state; toggle button; flex-row layout wrapper; pass `activeTab` + `sidebar` prop to panel; remove Results overlay trigger; remove Results sub-tab AI buttons |
| `src/ui/execute/AiAssistantPanel.jsx` | `sidebar` render mode (fixed width column, not overlay); `activeTab` prop; context-aware title/actions; chat-bubble message rendering; model Q&A mode |
| `src/llm/prompts.js` | `buildModelQueryPrompt(question, model, history)` for design-context questions |
| `docs/DES_Studio_Build_Plan.md` | Add Sprint 73 entry |

---

## Exit Gate

- [ ] AI toggle button visible and keyboard-accessible on every non-mobile tab
- [ ] Sidebar opens/closes without layout jank; main content area reflows cleanly
- [ ] Explain, Compare, Refine Plan all work from sidebar on Results tab
- [ ] "Ask a question" works on both results and design tabs
- [ ] Conversation history renders as bubbles; streaming token appears in-bubble
- [ ] Sidebar does not appear on mobile (< 720px)
- [ ] Esc key closes sidebar when open
- [ ] Existing Results overlay path removed; no console errors
- [ ] `npx vitest run` passes with no regressions
- [ ] Build plan updated
