# Sprint 75 — Persistent AI Sidebar

**Sprint:** 75
**Theme:** Replace scattered overlay AI panels with a single persistent context-aware right sidebar
**Status:** 🔄 In Progress | **Started:** 2026-05-29
**Branch:** `claude/reports-amendments-03l7y`

---

## Goal

All AI assistance in simmodlr currently surfaces through two different patterns that look and behave differently: a full-tab chat experience (Design > Describe) and an overlay panel (Results > Explain). The user experience is inconsistent — the overlay interrupts the workflow, closes on tab change, and is not discoverable from other tabs.

Sprint 75 replaces the overlay with a **persistent right sidebar** that:
- Opens from a toggle button always visible in the tab bar
- Stays open across tab changes
- Shows context-aware default actions (results analysis on results tab, model Q&A on design tabs)
- Uses the same visual language as the rest of the app (inline styles, C tokens)

The Design > Describe full-tab experience is left unchanged — it is a guided model authoring workflow, not an analysis panel.

---

## Scope Guardrails

- Extend existing components; do not rewrite `AiAssistantPanel`, `AiGeneratedModelPanel`, or `ModelDetail` from scratch
- Reuse existing LLM call infrastructure (`callLLMOnce`, `streamNarrative`)
- No new npm dependencies
- Mobile layout unchanged — sidebar hidden entirely on viewportWidth < 720
- Compact layout (720–1024 px) — sidebar available as toggled overlay (does not shift layout)
- `AiGeneratedModelPanel` (Design > Describe tab) remains a full-tab experience; not moved to sidebar
- Existing tests must all pass after each work item

---

## Feature Scope

| ID | Feature | Status | Deliverable |
|---|---|---|---|
| F75.1 | AI toggle button in tab bar | ⬜ | Button at right of tab bar; toggles `aiSidebarOpen`; hidden on mobile |
| F75.2 | Flex-row layout wrapper | ⬜ | Content area becomes flex row: main `flex:1` + sidebar 320px when open |
| F75.3 | AiAssistantPanel sidebar mode | ⬜ | New `sidebar` prop removes fixed positioning; renders as right column |
| F75.4 | Context-aware default view | ⬜ | Sidebar receives `activeTab`; shows Explain/Compare/Refine on results, Q&A elsewhere |
| F75.5 | Design-context model Q&A | ⬜ | `buildModelQueryPrompt(question, model, history)` in `prompts.js`; Q&A flow in sidebar |
| F75.6 | Retire overlay trigger | ⬜ | "Explain" button opens sidebar; `resultsView==="explain"` overlay path removed |
| F75.7 | Compact-layout handling | ⬜ | Compact viewport: sidebar renders as overlay (z-index 60) rather than shifting layout |
| F75.8 | Polish: Esc + persistence | ⬜ | Esc key closes sidebar; `aiSidebarOpen` persists across tab changes |
| F75.9 | Documentation | ⬜ | Build plan, AGENTS.md, closure report |

---

## Architecture

### State — ModelDetail.jsx

```js
const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
```

### Layout — content area

Current:
```jsx
<div style={{flex:1, overflowY:"auto", padding:"clamp(12px,2vw,20px)"}}>
  ...tabs...
</div>
```

After F75.2:
```jsx
<div style={{flex:1, display:"flex", flexDirection:"row", overflow:"hidden"}}>
  <div style={{flex:1, overflowY:"auto", padding:"clamp(12px,2vw,20px)"}}>
    ...tabs...
  </div>
  {aiSidebarOpen && !isMobileLayout && !isCompactLayout && (
    <AiAssistantPanel sidebar activeTab={tab} model={model} results={latestResults} ... />
  )}
  {aiSidebarOpen && !isMobileLayout && isCompactLayout && (
    <AiAssistantPanel overlay activeTab={tab} model={model} results={latestResults} ... />
  )}
</div>
```

### AiAssistantPanel sidebar mode

New `sidebar` prop: when true, renders as:
```js
{
  display: "flex", flexDirection: "column",
  width: 320, borderLeft: `1px solid ${C.border}`,
  background: C.panel, height: "100%", overflow: "hidden"
}
```
No `position: fixed`. Scrollable internally.

### Context-aware default view

```js
// Inside AiAssistantPanel, when no activeKind is set:
const defaultKind = ['results','execute'].includes(activeTab) ? 'explain' : 'query';
```

Results/execute tabs → show Explain Results / Compare / Refine Plan buttons (existing).
All other tabs → show model Q&A text input with placeholder "Ask anything about this model…"

### Design-context Q&A — prompts.js

```js
export function buildModelQueryPrompt(question, model, history = []) {
  // Returns { role:'user', content: ... } message with model context injected
  // Model context: entity types, queues, B-events (names + schedule summary), goals
  // history: prior [{ role, content }] messages for multi-turn
}
```

### AI toggle button — tab bar

Added to the right side of `ModelTabBar` (or directly in ModelDetail next to it):

```jsx
{!isMobileLayout && (
  <button
    onClick={() => setAiSidebarOpen(v => !v)}
    title={aiSidebarOpen ? "Close AI assistant" : "Open AI assistant"}
    style={{
      marginLeft: "auto", padding: "4px 10px",
      background: aiSidebarOpen ? C.accent : "transparent",
      border: `1px solid ${aiSidebarOpen ? C.accent : C.border}`,
      borderRadius: 6, cursor: "pointer", fontFamily: FONT, fontSize: 11,
      color: aiSidebarOpen ? "#fff" : C.muted,
    }}
  >
    ✦ AI
  </button>
)}
```

---

## Files Modified

| File | Change |
|---|---|
| `src/ui/ModelDetail.jsx` | `aiSidebarOpen` state; flex-row layout wrapper; AI toggle button; sidebar + compact wiring; remove `resultsView==="explain"` overlay path; Esc handler |
| `src/ui/execute/AiAssistantPanel.jsx` | `sidebar` prop mode (no fixed positioning, right-column flex); `activeTab` prop for context-aware default view; model Q&A flow |
| `src/llm/prompts.js` | `buildModelQueryPrompt(question, model, history)` |

---

## Verification

1. `npx vitest run` — all existing tests pass
2. Toggle AI button: sidebar opens at 320px right; main content shrinks; button highlighted
3. Navigate between tabs — sidebar stays open
4. On results/execute tab: Explain/Compare/Refine buttons visible by default
5. On design tab: Q&A input visible by default; ask a question and get an answer
6. Esc key closes sidebar
7. Resize to < 720px — sidebar toggle button disappears; sidebar closed
8. Resize to 720–1024px — sidebar renders as overlay (does not shift layout)
9. Click Explain in Results — sidebar opens (not overlay)
