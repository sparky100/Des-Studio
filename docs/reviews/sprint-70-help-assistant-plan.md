# Sprint 70 — Help Assistant: In-App Conversational Support

**Status:** ⬜ Not started  
**Prerequisite:** Sprint 8C complete (LLM integration), Sprint 23 complete (UI workflow shell)  
**Scope:** `src/ui/`, `src/llm/`, `docs/`  
**No engine changes. No schema changes. No new dependencies.**

---

## Context

DES Studio users currently have no in-app help beyond the Keyboard Shortcuts modal. When users have questions about:
- How to use DES Studio features
- DES modelling concepts (queues, events, distributions)
- Best practices for their specific model

They must leave the application and search external documentation.

This sprint adds a **Help Assistant** — a conversational panel available from every view via the `?` button in the navigation bar. The assistant answers questions grounded in DES Studio's documentation and the user's current model context.

---

## Features

| ID | Feature | Files |
|---|---|---|
| F70.1 | Help Assistant panel component | `src/ui/HelpAssistant.jsx` |
| F70.2 | `?` button in AppNavBar | `src/ui/AppNavBar.jsx` |
| F70.3 | Help Assistant LLM prompt | `src/llm/help-assistant-prompt.js` |
| F70.4 | Documentation grounding index | `docs/help-knowledge-base.json` |
| F70.5 | Suggested questions logic | `src/ui/HelpAssistant.jsx` (internal) |
| F70.6 | Integration in App.jsx | `src/App.jsx` |
| F70.7 | Documentation update | `docs/DES_Studio_User_Guide.md` |
| F70.8 | Build plan update | `docs/DES_Studio_Build_Plan.md` |

**Sequence:** F70.3 (prompt) and F70.4 (knowledge base) must complete before F70.1 (panel). F70.2, F70.5, F70.6 are independent once F70.1 is done. F70.7 and F70.8 run last.

---

## F70.1 — Help Assistant Panel Component

**File:** `src/ui/HelpAssistant.jsx`

```
Read src/ui/shared/tokens.js — use design tokens throughout.
Read src/ui/shared/components.jsx — reuse Bubble, Field, Btn, SH components.
Read src/llm/apiClient.js — understand callLLMOnce() function.
Read src/llm/help-assistant-prompt.js (after F70.3 is complete).

Create a conversational panel component with the following structure:

┌─────────────────────────────────────────────────────────────┐
│  Help Assistant                                      [×]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Suggested questions:                                │   │
│  │ [How do I set up an exponential...?]                │   │
│  │ [What is the difference between...]                 │   │
│  │ [How many replications should I run...?]            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ YOU: How do I set up an exponential distribution?   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ AI: To set up an exponential inter-arrival...       │   │
│  │ [continues, streamed response]                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Follow-up question...                         [Send]│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ─── CONTEXT OBJECT ────────────────────────────────────────│
│                                                             │
│ The context passed to the LLM includes:                     │
│ {                                                           │
│   workflowMode: "Designing" | "Running" | "Analyzing",      │
│   currentTab: string,                                       │
│   modelSummary: {                                           │
│     entityCount: number,                                    │
│     queueCount: number,                                     │
│     bEventCount: number,                                    │
│     cEventCount: number,                                    │
│     hasValidationErrors: boolean,                           │
│     hasValidationWarnings: boolean                          │
│   } | null,                                                 │
│   currentView: "library" | "model-detail"                   │
│ }                                                           │
│                                                             │
│ Workflow mode derivation:                                   │
│   - "Designing": visual, entities, queues, bevents, cevents │
│   - "Running": execute                                      │
│   - "Analyzing": results, history, validate                 │
│   - "library": my, templates, public, community             │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ STATE:                                                      │
│                                                             │
│ - conversationHistory: Array<{                              │
│     role: "user" | "assistant",                             │
│     content: string                                         │
│   }>                                                        │
│ - suggestedQuestions: string[] (3-4 questions)              │
│ - isLoading: boolean                                        │
│ - currentResponse: string (streamed)                        │
│ - error: string | null                                      │
│                                                             │
│ ─── SUGGESTED QUESTIONS LOGIC ─────────────────────────────│
│                                                             │
│ Derive suggested questions based on currentTab:             │
│                                                             │
│   "my" | "templates" | "public" (Model Library):            │
│     - "How do I create a new model?"                        │
│     - "What templates are available?"                       │
│     - "How do I import a model from a file?"                │
│                                                             │
│   "visual" (Visual Designer):                               │
│     - "How do I add a new queue?"                           │
│     - "What do the different node colours mean?"            │
│     - "How do I connect two nodes?"                         │
│                                                             │
│   "entities" (Entity Types):                                │
│     - "What is an entity type?"                             │
│     - "How do I add attributes to an entity?"               │
│     - "What does the 'mutable' flag do?"                    │
│                                                             │
│   "queues" (Queues):                                        │
│     - "What is queue discipline?"                           │
│     - "When should I use PRIORITY vs FIFO?"                 │
│     - "What happens when a queue reaches capacity?"         │
│                                                             │
│   "bevents" (B-Events):                                     │
│     - "What is a B-Event?"                                  │
│     - "How do I set up exponential arrivals?"               │
│     - "What distributions are available?"                   │
│                                                             │
│   "cevents" (C-Events):                                     │
│     - "What is a C-Event?"                                  │
│     - "How do I write a condition?"                         │
│     - "What is the difference between B and C events?"      │
│                                                             │
│   "execute" (Run panel):                                    │
│     - "How many replications should I run?"                 │
│     - "What is a warm-up period?"                           │
│     - "Why is my queue growing without bound?"              │
│                                                             │
│   "results" (Results workspace):                            │
│     - "How do I interpret confidence intervals?"            │
│     - "What does utilisation > 100% mean?"                  │
│     - "How do I compare two scenarios?"                     │
│                                                             │
│   "history" (Run History):                                  │
│     - "How do I archive a run?"                             │
│     - "Can I export run history?"                           │
│     - "How do I label runs for comparison?"                 │
│                                                             │
│   "validate" (Model Health):                                │
│     - "What does a validation error mean?"                  │
│     - "How do I fix 'missing Source node'?"                 │
│     - "Why am I getting a Phase C truncation warning?"      │
│                                                             │
│   Default (overview or unknown):                            │
│     - "How do I get started building a model?"              │
│     - "What is the Three-Phase Method?"                     │
│     - "Where can I find example models?"                    │
│                                                             │
│ ─── SUBMIT QUESTION ───────────────────────────────────────│
│                                                             │
│ When user submits a question (click chip or press Enter):   │
│                                                             │
│ 1. Append { role: "user", content: question } to history    │
│ 2. Set isLoading = true                                     │
│ 3. Build messages array for LLM:                            │
│    [                                                        │
│      { role: "system", content: systemPrompt },             │
│      ...conversationHistory.slice(-10),                     │
│      {                                                      │
│        role: "user",                                        │
│        content: buildHelpUserMessage(question, context)     │
│      }                                                      │
│    ]                                                        │
│ 4. Call callLLMOnce(prompt)                                 │
│ 5. Stream response token-by-token (if streaming supported)  │
│    OR display full response on complete                     │
│ 6. Append { role: "assistant", content: response }          │
│ 7. Set isLoading = false                                    │
│                                                             │
│ ─── CONTEXT OBJECT ────────────────────────────────────────│
│                                                             │
│ The context passed to the LLM includes:                     │
│ {                                                           │
│   currentTab: string,                                       │
│   modelSummary: {                                           │
│     entityCount: number,                                    │
│     queueCount: number,                                     │
│     bEventCount: number,                                    │
│     cEventCount: number,                                    │
│     hasValidationErrors: boolean,                           │
│     hasValidationWarnings: boolean                          │
│   } | null,                                                 │
│   currentView: "library" | "model-detail"                   │
│ }                                                           │
│                                                             │
│ ─── STYLING ───────────────────────────────────────────────│
│                                                             │
│ - Panel slides in from right (or appears as modal on mobile)│
│ - Width: 480px on desktop, 100% on mobile                   │
│ - Height: 100% of viewport                                  │
│ - Background: C.surface                                     │
│ - Border-left: 1px solid C.border                           │
│ - Conversation area: scrollable, flex: 1                    │
│ - Input area: fixed at bottom                               │
│ - Use tokens.js for all colours, spacing, typography        │
│                                                             │
│ ─── CONSTRAINTS ───────────────────────────────────────────│
│                                                             │
│ - No new npm dependencies                                   │
│ - Use existing LLM proxy (callLLMOnce)                      │
│ - Conversation history persists across panel close/reopen   │
│ - History resets only on page refresh                       │
│ - Do not send full model JSON to LLM (only summary)         │
│ - Maximum 10 conversation turns sent to LLM                 │
│                                                             │
│ ─── TESTS ─────────────────────────────────────────────────│
│                                                             │
│ Add UI tests (tests/ui/help-assistant.test.jsx):            │
│                                                             │
│   - Panel renders when isOpen = true                        │
│   - Panel does not render when isOpen = false               │
│   - Close button calls onClose callback                     │
│   - 3-4 suggested questions render based on currentTab      │
│   - Clicking a suggested question submits it                │
│   - User message appears in conversation after submit       │
│   - Assistant response appears after LLM returns            │
│   - Loading indicator shows while isLoading = true          │
│   - Error message displays if LLM call fails                │
│   - Conversation history persists after close/reopen        │
│   - Conversation history resets on page refresh             │
│   - Input field focuses after panel opens                   │
│   - Enter key submits question                              │
│                                                             │
```

**Completion checklist:**
- [ ] `HelpAssistant.jsx` created with full panel UI
- [ ] Suggested questions logic implemented per currentTab
- [ ] Conversation history state management
- [ ] LLM integration via `callLLMOnce()`
- [ ] Context object built from currentModel + currentTab
- [ ] Streaming response display (if supported) or full response
- [ ] Panel styling matches design tokens
- [ ] Close button and keyboard dismissal (Esc key)
- [ ] All 12 UI tests passing

---

## F70.2 — `?` Button in AppNavBar

**File:** `src/ui/AppNavBar.jsx`

```
Read src/ui/AppNavBar.jsx in full.
Read src/ui/HelpAssistant.jsx (after F70.1 is complete).

Add a "?" button to the navigation bar that opens the Help Assistant.

┌─────────────────────────────────────────────────────────────┐
│ CURRENT STRUCTURE:                                          │
│                                                             │
│ [DES STUDIO logo]  [flex spacer]  [avatar] [Settings]       │
│ [Admin if isAdmin] [Sign Out]                               │
│                                                             │
│ ─── CHANGE ─────────────────────────────────────────────────│
│                                                             │
│ Add "?" button between avatar and Settings button:          │
│                                                             │
│ [DES STUDIO logo]  [flex spacer]  [avatar] [?] [Settings]   │
│ [Admin if isAdmin] [Sign Out]                               │
│                                                             │
│ ─── BEHAVIOUR ─────────────────────────────────────────────│
│                                                             │
│ - Button label: "?"                                         │
│ - aria-label: "Help"                                        │
│ - onClick: opens HelpAssistant panel                        │
│ - Tooltip on hover: "Help"                                  │
│                                                             │
│ ─── STYLING ───────────────────────────────────────────────│
│                                                             │
│ Match existing button style (Settings, Admin, Sign Out):    │
│ - background: "#ffffff08"                                   │
│ - border: `1px solid ${C.border}`                           │
│ - borderRadius: 5                                           │
│ - color: C.muted                                            │
│ - fontFamily: FONT                                          │
│ - fontSize: 11                                              │
│ - padding: "5px 12px"                                       │
│ - cursor: "pointer"                                         │
│ - fontWeight: 600                                           │
│                                                             │
│ ─── INTEGRATION ───────────────────────────────────────────│
│                                                             │
│ App.jsx manages the Help Assistant open/close state:        │
│ - const [helpOpen, setHelpOpen] = useState(false)           │
│ - Pass onHelpOpen={() => setHelpOpen(true)} to AppNavBar    │
│ - Render <HelpAssistant isOpen={helpOpen} ... /> in App.jsx │
│                                                             │
│ ─── KEYBOARD SHORTCUTS ────────────────────────────────────│
│                                                             │
│ The existing "?" keyboard shortcut currently opens          │
│ KeyboardShortcutsModal. Update this behaviour:              │
│                                                             │
│ - "?" key now opens HelpAssistant panel                     │
│ - KeyboardShortcutsModal is removed OR                      │
│ - Keyboard shortcuts become a section inside HelpAssistant  │
│                                                             │
│ Recommendation: Move keyboard shortcuts into HelpAssistant  │
│ as a static section. When user types "?" or clicks button,  │
│ show suggested questions first. Add a chip:                 │
│ "📋 View keyboard shortcuts" that expands that section.     │
│                                                             │
│ ─── TESTS ─────────────────────────────────────────────────│
│                                                             │
│ Add UI tests (tests/ui/app-nav-bar.test.jsx):               │
│                                                             │
│   - "?" button renders in navigation bar                    │
│   - "?" button has aria-label "Help"                        │
│   - Clicking "?" button calls onHelpOpen callback           │
│   - "?" keyboard shortcut opens HelpAssistant (not modal)   │
│                                                             │
```

**Completion checklist:**
- [ ] `?` button added to AppNavBar
- [ ] Button styled to match existing nav buttons
- [ ] onClick calls onHelpOpen prop
- [ ] App.jsx manages helpOpen state
- [ ] HelpAssistant rendered in App.jsx
- [ ] "?" keyboard shortcut opens HelpAssistant
- [ ] KeyboardShortcutsModal removed or integrated
- [ ] All UI tests passing

---

## F70.3 — Help Assistant LLM Prompt

**File:** `src/llm/help-assistant-prompt.js`

```
Read src/llm/model-builder-prompts.js — understand prompt structure.
Read src/llm/apiClient.js — understand callLLMOnce() call signature.
Read docs/DES_Studio_User_Guide.md — extract key sections.
Read docs/DES_Studio_Engineering_Spec.md — extract LLM schema section.

Create a system prompt that grounds the LLM in DES Studio knowledge.

┌─────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT STRUCTURE:                                    │
│                                                             │
│ 1. ROLE AND SCOPE                                           │
│    "You are the DES Studio Help Assistant. You answer       │
│    questions about how to use DES Studio and about discrete-│
│    event simulation modelling concepts. You are helpful,    │
│    concise, and practical. You ground your answers in the   │
│    documentation provided below."                           │
│                                                             │
│ 2. KNOWLEDGE BASE — USER GUIDE EXCERPTS                     │
│    Embed key sections from DES_Studio_User_Guide.md:        │
│    - Getting started                                        │
│    - Entity Types                                           │
│    - Queues and disciplines                                 │
│    - B-Events and C-Events                                  │
│    - Distributions                                          │
│    - Running simulations                                    │
│    - Understanding results                                  │
│    - Tips and best practices                                │
│                                                             │
│ 3. KNOWLEDGE BASE — ENGINEERING SPEC EXCERPTS               │
│    Embed key concepts from DES_Studio_Engineering_Spec.md:  │
│    - Three-Phase Method overview                            │
│    - Model JSON schema summary                              │
│    - Macro vocabulary (ARRIVE, ASSIGN, COMPLETE, etc.)      │
│    - Distribution types and parameters                      │
│    - Validation rules                                       │
│                                                             │
│ 4. KNOWLEDGE BASE — LLM SCHEMA                              │
│    Embed the LLM response format from contracts.js or       │
│    model-builder-prompts.js showing supported macros,       │
│    distributions, and model structure.                      │
│                                                             │
│ 5. CONTEXT HANDLING                                         │
│    "The user may provide context about their current model  │
│    (entity count, queue count, validation state, current    │
│    view). Use this context to tailor your answer. For       │
│    example, if the user has validation errors, suggest how  │
│    to fix them. If they are on the Execute tab, focus on    │
│    run-related guidance."                                   │
│                                                             │
│ 6. RESPONSE STYLE                                           │
│    - Keep answers concise (3-5 sentences for simple questions)│
│    - Use bullet points for step-by-step instructions        │
│    - Include concrete examples where helpful                │
│    - Reference specific tabs, buttons, and fields by name   │
│    - If a question is outside your scope (e.g. "How do I    │
│      install Python?"), politely explain you can only help  │
│      with DES Studio and DES modelling                      │
│                                                             │
│ 7. SCOPE BOUNDARIES                                         │
│    - You answer questions about HOW TO USE DES Studio       │
│    - You answer questions about DES MODELLING CONCEPTS      │
│    - You do NOT analyse specific simulation results (that   │
│      is the AI Insights panel's role in the Execute view)   │
│    - You do NOT modify the user's model (that is the AI     │
│      Generated Model tab's role)                            │
│    - You do NOT provide technical support for browser,      │
│      network, or account issues                             │
│                                                             │
│ 8. EXAMPLE Q&A PAIRS                                        │
│    Include 5-10 example questions and model answers:        │
│    - "How do I set up exponential arrivals?"                │
│    - "What is the difference between B and C events?"       │
│    - "How many replications should I run?"                  │
│    - "Why is my queue growing without bound?"               │
│    - "How do I model priority queuing?"                     │
│                                                             │
│ ─── TESTS ─────────────────────────────────────────────────│
│                                                             │
│ Add tests (tests/llm/help-assistant-prompt.test.js):        │
│                                                             │
│   - buildHelpAssistantSystemPrompt() returns a string       │
│   - Prompt contains "DES Studio Help Assistant"             │
│   - Prompt contains User Guide excerpts                     │
│   - Prompt contains Engineering Spec excerpts               │
│   - Prompt contains LLM schema (macros, distributions)      │
│   - Prompt contains scope boundaries                        │
│   - Prompt contains example Q&A pairs                       │
│   - buildHelpUserMessage() includes currentModel context    │
│   - buildHelpUserMessage() includes currentTab context      │
│                                                             │
```

**Completion checklist:**
- [ ] `help-assistant-prompt.js` created
- [ ] System prompt includes role and scope
- [ ] User Guide key sections embedded
- [ ] Engineering Spec key concepts embedded
- [ ] LLM schema (macros, distributions) embedded
- [ ] Context handling instructions included
- [ ] Response style guidelines specified
- [ ] Scope boundaries defined
- [ ] Example Q&A pairs included
- [ ] `buildHelpUserMessage()` function created
- [ ] All prompt tests passing

---

## F70.4 — Documentation Grounding Index

**File:** `docs/help-knowledge-base.json`

```
Create a JSON file that extracts and indexes key documentation
sections for embedding in the LLM prompt.

┌─────────────────────────────────────────────────────────────┐
│ STRUCTURE:                                                  │
│                                                             │
│ {                                                           │
│   "version": "1.0",                                         │
│   "generatedAt": "2026-05-22",                              │
│   "sections": {                                             │
│     "userGuide": {                                          │
│       "gettingStarted": "...",                              │
│       "entityTypes": "...",                                 │
│       "queues": "...",                                      │
│       "bEvents": "...",                                     │
│       "cEvents": "...",                                     │
│       "distributions": "...",                               │
│       "runningSimulations": "...",                          │
│       "results": "...",                                     │
│       "tips": "..."                                         │
│     },                                                      │
│     "engineeringSpec": {                                    │
│       "threePhaseMethod": "...",                            │
│       "modelSchema": "...",                                 │
│       "macros": "...",                                      │
│       "distributions": "...",                               │
│       "validation": "..."                                   │
│     },                                                      │
│     "llmSchema": {                                          │
│       "bEventMacros": ["ARRIVE", "ASSIGN", ...],            │
│       "cEventMacros": ["ASSIGN", "BATCH", ...],             │
│       "distributions": ["exponential", "uniform", ...],     │
│       "modelSections": ["entityTypes", "queues", ...]       │
│     }                                                       │
│   }                                                         │
│ }                                                           │
│                                                             │
│ ─── GENERATION SCRIPT (OPTIONAL) ──────────────────────────│
│                                                             │
│ Create a Node script (scripts/generate-help-kb.js) that:    │
│ 1. Reads docs/DES_Studio_User_Guide.md                      │
│ 2. Reads docs/DES_Studio_Engineering_Spec.md                │
│ 3. Extracts relevant sections by heading match              │
│ 4. Writes docs/help-knowledge-base.json                     │
│                                                             │
│ Run manually when documentation is updated.                 │
│                                                             │
│ ─── CONSTRAINTS ───────────────────────────────────────────│
│                                                             │
│ - Keep total JSON size under 50KB (LLM token limits)        │
│ - Use concise excerpts, not full sections                   │
│ - Prioritise frequently-asked topics                        │
│ - Update when User Guide or Engineering Spec changes        │
│                                                             │
```

**Completion checklist:**
- [ ] `help-knowledge-base.json` created
- [ ] User Guide sections extracted
- [ ] Engineering Spec sections extracted
- [ ] LLM schema included
- [ ] Total size under 50KB
- [ ] Optional: generation script created
- [ ] Documented how to regenerate when docs change

---

## F70.5 — Suggested Questions Logic

**File:** `src/ui/HelpAssistant.jsx` (internal logic)

```
Implement the suggested questions derivation logic described
in F70.1. This is internal component logic, not a separate file.

┌─────────────────────────────────────────────────────────────┐
│ IMPLEMENTATION:                                             │
│                                                             │
│ function getSuggestedQuestions(currentTab, currentView) {   │
│   const questionsByTab = {                                  │
│     my: [...],                                              │
│     templates: [...],                                       │
│     public: [...],                                          │
│     visual: [...],                                          │
│     entities: [...],                                        │
│     queues: [...],                                          │
│     bevents: [...],                                         │
│     cevents: [...],                                         │
│     execute: [...],                                         │
│     results: [...],                                         │
│     history: [...],                                         │
│     validate: [...],                                        │
│     overview: [...]                                         │
│   };                                                        │
│                                                             │
│   const questions = questionsByTab[currentTab]              │
│     || questionsByTab.overview;                             │
│                                                             │
│   // If model has validation errors, prioritise:            │
│   if (validation?.errors?.length > 0) {                     │
│     return [                                                │
│       "How do I fix validation errors?",                    │
│       ...questions.slice(0, 2)                              │
│     ];                                                      │
│   }                                                         │
│                                                             │
│   return questions.slice(0, 4);                             │
│ }                                                           │
│                                                             │
│ ─── TESTS ─────────────────────────────────────────────────│
│                                                             │
│ Add unit tests (tests/ui/help-assistant.test.jsx):          │
│                                                             │
│   - getSuggestedQuestions returns 3-4 questions             │
│   - Different tabs return different questions               │
│   - Validation errors prioritise fix-related questions      │
│   - Unknown tab returns default questions                   │
│                                                             │
```

**Completion checklist:**
- [ ] `getSuggestedQuestions()` function implemented
- [ ] All tabs covered with relevant questions
- [ ] Validation error detection alters suggestions
- [ ] Returns 3-4 questions maximum
- [ ] Tests passing

---

## F70.6 — Integration in App.jsx

**File:** `src/App.jsx`

```
Read src/App.jsx — find state management and modal rendering.
Read src/ui/HelpAssistant.jsx (after F70.1 is complete).

┌─────────────────────────────────────────────────────────────┐
│ STATE ADDITIONS:                                            │
│                                                             │
│ const [helpOpen, setHelpOpen] = useState(false);            │
│                                                             │
│ ─── HANDLERS:                                               │
│                                                             │
│ const handleHelpOpen = useCallback(() => setHelpOpen(true), []);│
│ const handleHelpClose = useCallback(() => setHelpOpen(false), []);│
│                                                             │
│ ─── PASS TO APPNAVBAR:                                      │
│                                                             │
│ <AppNavBar                                                  │
│   profile={profile}                                         │
│   isAdmin={isAdmin}                                         │
│   isAdminActive={showAdmin}                                 │
│   onHelpOpen={handleHelpOpen}                               │
│   onSettings={() => setShowSettings(true)}                  │
│   onAdmin={() => { setShowAdmin(true); setOpenId(null); }}  │
│   onSignOut={signOut}                                       │
│ />                                                          │
│                                                             │
│ ─── RENDER HELP ASSISTANT:                                  │
│                                                             │
│ {helpOpen && (                                              │
│   <HelpAssistant                                            │
│     isOpen={helpOpen}                                       │
│     onClose={handleHelpClose}                               │
│     currentModel={openId ? models.find(m => m.id === openId)│
│       : null}                                               │
│     currentTab={openId ? tab : libraryTab}                  │
│     validation={openId ? validation : null}                 │
│   />                                                        │
│ )}                                                          │
│                                                             │
│ ─── KEYBOARD SHORTCUT:                                      │
│                                                             │
│ Update the existing "?" key handler in App.jsx:             │
│                                                             │
│ useEffect(() => {                                           │
│   const onKey = e => {                                      │
│     if (e.key === "?" && !e.ctrlKey && !e.metaKey           │
│       && !["INPUT","TEXTAREA","SELECT"]                     │
│         .includes(document.activeElement?.tagName)) {       │
│       e.preventDefault();                                   │
│       setHelpOpen(v => !v);  // was: setShowKeyboard...     │
│     }                                                       │
│   };                                                        │
│   window.addEventListener("keydown", onKey);                │
│   return () => window.removeEventListener("keydown", onKey);│
│ }, []);                                                     │
│                                                             │
│ ─── TESTS ─────────────────────────────────────────────────│
│                                                             │
│ Add integration tests (tests/ui/app.test.jsx):              │
│                                                             │
│   - "?" keyboard shortcut opens HelpAssistant               │
│   - HelpAssistant receives currentModel when model open     │
│   - HelpAssistant receives currentTab correctly             │
│   - Closing HelpAssistant calls onClose                     │
│                                                             │
```

**Completion checklist:**
- [ ] `helpOpen` state added
- [ ] `handleHelpOpen` and `handleHelpClose` handlers added
- [ ] `onHelpOpen` passed to AppNavBar
- [ ] HelpAssistant rendered conditionally
- [ ] currentModel, currentTab, validation passed as props
- [ ] "?" keyboard shortcut updated
- [ ] KeyboardShortcutsModal removed or integrated
- [ ] Integration tests passing

---

## F70.7 — Documentation Update

**Files:** `docs/DES_Studio_User_Guide.md`

```
Read docs/DES_Studio_User_Guide.md in full.

Add a new section §2.X covering the Help Assistant.

┌─────────────────────────────────────────────────────────────┐
│ NEW SECTION: §2.X — Help Assistant                          │
│                                                             │
│ Insert after §2.W — AI Generated Model (or equivalent).     │
│                                                             │
│ Content:                                                    │
│                                                             │
│ ## Help Assistant                                           │
│                                                             │
│ The Help Assistant is a conversational panel that answers   │
│ questions about DES Studio at any point during your         │
│ session. It is available from every view via the **?**      │
│ button in the navigation bar.                               │
│                                                             │
│ ### Opening the panel                                       │
│                                                             │
│ Click the **?** button (top right of the navigation bar)    │
│ to open the Help Assistant drawer. Click **×** or click     │
│ **?** again to close it.                                    │
│                                                             │
│ ### Asking a question                                       │
│                                                             │
│ Type your question in the input field and press **Enter**   │
│ or click **Send**. The assistant streams a response         │
│ grounded in DES Studio's documentation and your current     │
│ model context.                                              │
│                                                             │
│ Example questions:                                          │
│ - "How do I set up an exponential inter-arrival             │
│   distribution?"                                            │
│ - "What is the difference between a B-Event and a           │
│   C-Event?"                                                 │
│ - "How many replications should I run for reliable          │
│   results?"                                                 │
│ - "Why is my queue growing without bound?"                  │
│ - "How do I model a 90/10 patient triage split?"            │
│                                                             │
│ ### Suggested questions                                     │
│                                                             │
│ When you open the panel, 3–4 suggested questions relevant   │
│ to your current view are shown as clickable chips. Click    │
│ any chip to submit that question immediately.               │
│                                                             │
│ ### Follow-up questions                                     │
│                                                             │
│ The assistant retains the conversation within the current   │
│ session, so you can ask follow-up questions without         │
│ repeating context. The history is cleared when you close    │
│ and re-open the panel.                                      │
│                                                             │
│ ### Relationship to AI Insights                             │
│                                                             │
│ The Help Assistant answers questions about **how to use     │
│ DES Studio** and **modelling concepts**. The AI Insights    │
│ panel (available in the Execute view after a run)           │
│ analyses **your specific simulation results** —             │
│ interpreting KPIs, suggesting model improvements, and       │
│ comparing runs. The two panels serve different purposes     │
│ and are independent.                                        │
│                                                             │
│ ─── DOCUMENT HISTORY ──────────────────────────────────────│
│                                                             │
│ Add a version history entry:                                │
│ Version: [current + 0.01]                                   │
│ Date: [today]                                               │
│ Change: Added §2.X — Help Assistant.                        │
│                                                             │
```

**Completion checklist:**
- [ ] §2.X added to User Guide
- [ ] Opening the panel documented
- [ ] Asking a question documented
- [ ] Suggested questions documented
- [ ] Follow-up questions documented
- [ ] Relationship to AI Insights clarified
- [ ] Version history updated

---

## F70.8 — Build Plan Update

**File:** `docs/DES_Studio_Build_Plan.md`

```
Read docs/DES_Studio_Build_Plan.md in full.

┌─────────────────────────────────────────────────────────────┐
│ STEP 1: UPDATE MERMAID FLOWCHART                            │
│                                                             │
│ Add Sprint 70 after Sprint 69:                              │
│                                                             │
│   S33 --> S69["Sprint 69<br/>AI Model Debugging"]           │
│   S69 --> S70["Sprint 70<br/>Help Assistant"]               │
│   S70 --> S71["Sprint 71<br/>Next..."]                      │
│                                                             │
│ class S69,S70,S71 next;  (or done after completion)         │
│                                                             │
│ ─── STEP 2: UPDATE ROADMAP SNAPSHOT ───────────────────────│
│                                                             │
│ Add row:                                                    │
│ | In-app help and support | ⬜ Not started | Sprint 70:     │
│ | Help Assistant panel, suggested questions, documentation │
│ | grounding, LLM integration. |                            │
│                                                             │
│ ─── STEP 3: ADD SPRINT 70 ENTRY ───────────────────────────│
│                                                             │
│ Insert after Sprint 69 in Sprint History table:             │
│                                                             │
│ | Sprint 70 | ⬜ Not started | TBD | Help Assistant —       │
│ | In-app conversational support. | TBD (TBD) | N/A | N/A | │
│                                                             │
│ ─── STEP 4: DOCUMENT HISTORY ──────────────────────────────│
│                                                             │
│ Add entry:                                                  │
│ Version: [current + 0.01]                                   │
│ Date: [today]                                               │
│ Change: Added Sprint 70 — Help Assistant entry.             │
│                                                             │
```

**Completion checklist:**
- [ ] Mermaid flowchart updated with S70
- [ ] Roadmap Snapshot updated
- [ ] Sprint 70 entry added to Sprint History
- [ ] Document history updated
- [ ] No other sections modified

---

## Sprint 70 Completion Gate

Run these in order. Do not declare the sprint complete until all pass.

```bash
# 1. Full test suite
npm test -- --run
# Expected: zero failures

# 2. Help Assistant prompt tests
npm test -- help-assistant-prompt
# Must confirm:
#   - System prompt contains role and scope
#   - User Guide excerpts present
#   - Engineering Spec excerpts present
#   - LLM schema (macros, distributions) present
#   - Scope boundaries defined
#   - Example Q&A pairs present

# 3. Help Assistant UI tests
npm test -- help-assistant
# Must confirm:
#   - Panel renders when isOpen = true
#   - Suggested questions render based on currentTab
#   - Clicking chip submits question
#   - Conversation history displays correctly
#   - Loading indicator shows while isLoading
#   - Error message displays on LLM failure
#   - Close button works
#   - Conversation clears after close/reopen

# 4. AppNavBar tests
npm test -- app-nav-bar
# Must confirm:
#   - "?" button renders
#   - Clicking calls onHelpOpen
#   - "?" keyboard shortcut opens HelpAssistant

# 5. Production build
npm run build
# Must succeed with no new warnings
```

### Manual verification checklist (run in browser against dev server)

```
1.  Open DES Studio, sign in
2.  Verify "?" button visible in top-right navigation bar
3.  Click "?" — Help Assistant panel slides in from right
4.  Verify 3-4 suggested questions shown as chips
5.  Click a suggested question — submits and shows response
6.  Type a custom question in input field, press Enter
7.  Verify response streams or appears after LLM returns
8.  Ask a follow-up question — verify context retained
9.  Close panel (click × or ? button)
10. Re-open panel — verify conversation history cleared
11. Open a model, switch to different tabs (entities, queues,
    bevents, cevents, execute, results)
12. Verify suggested questions change based on current tab
13. Introduce a validation error, open Help Assistant
14. Verify "How do I fix validation errors?" appears first
15. Ask a question outside scope (e.g. "How do I install Python?")
16. Verify assistant politely explains scope boundary
17. Press "?" keyboard shortcut — verify panel toggles
18. Verify no KeyboardShortcutsModal appears (or integrated)
```

---

## Definition of Done

- [ ] All 8 features complete per their individual checklists above
- [ ] Full test suite passes with zero failures (`npm test -- --run`)
- [ ] Production build succeeds (`npm run build`)
- [ ] Manual verification checklist completed in browser
- [ ] `docs/DES_Studio_Build_Plan.md` updated with sprint entry and history
- [ ] `docs/DES_Studio_User_Guide.md` §2.X added
- [ ] `docs/help-knowledge-base.json` created
- [ ] No engine, schema, or dependency changes introduced

---

*Session date: 2026-05-22*  
*Sprint created from user specification: Help Assistant conversational panel*
