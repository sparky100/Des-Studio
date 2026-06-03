# simmodlr — Help Assistant Sprint Specification

*Document type: Sprint Specification + Claude Code Prompts*
*Created: 2026-05-22*
*Prerequisite: Read `docs/simmodlr_Build_Plan.md` to determine the correct sprint number
before executing any prompt. The sprint number used throughout this document is
referred to as **Sprint N**. Claude Code must replace every occurrence of `Sprint N`
and `SN` with the actual next sprint number found in the live build plan.*

---

## 1. Goal

Add a **Contextual Help Assistant** to simmodlr — a persistent, conversational
panel that allows users to ask natural-language questions about the tool and receive
grounded, specific answers at any point during their session.

This is **separate** from the existing AI Insights panel (which is scoped to
results analysis and requires a completed run). The Help Assistant is available
in every view and answers questions about how to use simmodlr, what modelling
constructs mean, and how to diagnose common problems.

---

## 2. Design Principles

1. **Always available.** Accessible via a `?` icon in the global navigation bar,
   regardless of whether a model has been run.
2. **Context-aware.** The current UI view and a lightweight model summary are
   injected into every prompt, enabling grounded answers without the user needing
   to explain their situation.
3. **Grounded in authoritative documentation.** A condensed reference covering
   simmodlr's macros, distributions, queue disciplines, experiment controls,
   and the Three-Phase concept is embedded in the system prompt.
4. **Reuses existing LLM infrastructure.** All calls route through the existing
   `llm-proxy` Supabase Edge Function with `kind: "help"` — no new backend work.
5. **Does not touch the engine or model state.** Read-only and advisory throughout.

---

## 3. Feature Breakdown

| Feature ID | Feature | Audit Status | Action |
|---|---|---|---|
| FSN.1 | Help panel UI shell | ✗ Absent | New component `src/ui/help/HelpPanel.jsx` |
| FSN.2 | `buildHelpPrompt` function | ✗ Absent | New export in `src/llm/prompts.js` |
| FSN.3 | Context injection (view + model summary) | ✗ Absent | New helper `src/ui/help/helpContext.js` |
| FSN.4 | Suggested questions | ✗ Absent | Curated set per view, rendered in panel |
| FSN.5 | `llm-proxy` kind routing | ~ Extend | Add `"help"` to accepted `kind` values |
| FSN.6 | User Guide help tests | ✗ Absent | Unit tests for prompt builder and context helper |

---

## 4. Architecture

### 4.1 Where it lives

```
src/
  ui/
    help/
      HelpPanel.jsx          — drawer component (new)
      helpContext.js         — builds lightweight context object (new)
      suggestedQuestions.js  — curated question sets keyed by view (new)
  llm/
    prompts.js               — add buildHelpPrompt() (extend existing)
```

The `?` toggle button is added to the existing global nav bar in `src/App.jsx`
or the equivalent top-level layout component. The panel renders as a right-side
drawer, 340px wide, using the same pattern as the AI Insights panel.

### 4.2 Context object shape

```js
// helpContext.js — buildHelpContext(currentView, model)
{
  currentView: "editor" | "execute" | "visual-designer" | "library",
  modelSummary: {
    name: string,
    entityTypeCount: number,
    queueCount: number,
    bEventCount: number,
    cEventCount: number,
    hasRun: boolean          // true if at least one saved run exists for this model
  }
}
```

`model` may be `null` (e.g. when the user is in the library view with no model
open). The helper must handle this gracefully — produce a partial context object
with `modelSummary: null`.

### 4.3 Prompt structure — `buildHelpPrompt`

```js
// src/llm/prompts.js — new export
buildHelpPrompt(question, helpContext)
```

**System prompt** (fixed, embedded at build time — not fetched at runtime):

```
You are a helpful assistant embedded in simmodlr, a browser-based
discrete-event simulation tool implementing Pidd's Three-Phase Approach.

Answer questions about how to use simmodlr accurately and concisely
(100–200 words unless a longer explanation is clearly needed).
Base your answers on the reference material below.
If the user's question is outside the scope of simmodlr, say so briefly
and redirect them to the relevant section.

--- simmodlr REFERENCE ---

CORE CONCEPTS
- Three-Phase simulation: Phase A advances the clock to the next B-Event time.
  Phase B fires all B-Events (bound, time-scheduled). Phase C scans all C-Events
  (conditional) and fires those whose condition is satisfied, repeating until no
  C-Event fires in a full pass.
- Entity types: customers (arrive, wait, are served) or servers (provide service).
- Queues: hold customer entities awaiting a C-Event condition. Disciplines: FIFO,
  LIFO, Priority (by attribute), Random.
- B-Events: time-scheduled. Used for arrivals (ARRIVE macro) and scheduled
  completions.
- C-Events: conditional. Fire when their condition is true (e.g. server idle AND
  queue non-empty). Used for service start (ASSIGN, COMPLETE macros).

MACROS
- ARRIVE(entityType, queue, interArrivalDist, count): creates an entity of the
  given type, places it in the named queue, and schedules the next arrival.
- ASSIGN(serverType, customerQueue, serverQueue): seizes an idle server and
  assigns it to the next customer. Begins service.
- COMPLETE(serverType, customerQueue, serviceDist): ends service, releases the
  server, removes the customer from the model.
- RELEASE(entityType, targetQueue): moves an entity to a named downstream queue,
  enabling multi-stage routing.
- RENEGE(entityType, queue, maxWait): removes a customer who has waited longer
  than maxWait without being served.

DISTRIBUTIONS
Supported: Exponential(mean), Normal(mean, sd), Uniform(min, max),
Triangular(min, mode, max), Erlang(k, mean), LogNormal(mean, sd),
Deterministic(value), Empirical(CSV upload).
All distributions are sampled from a seeded RNG for reproducibility.

EXPERIMENT CONTROLS
- Warm-up period: simulation time before statistics are collected (steady-state
  estimation). Welch's method can auto-detect the required warm-up length.
- Run duration: total simulated time, or condition-based termination.
- Replications: N independent runs with different seeds. Results shown as
  mean ± 95% CI.
- Parametric sweep: vary one or two model parameters across a range and plot
  KPI response.

RESULTS & KPIs
Key metrics: mean wait time per queue, resource utilisation, throughput,
renege rate, mean time in system. Confidence intervals use the t-distribution.
The Analysis view shows per-queue and per-resource breakdowns. The Histograms
view shows wait-time distributions.

AI INSIGHTS (results analysis — separate from this help assistant)
Available after a run: Interpret Results, Suggest Improvements, Sensitivity
Analysis, Compare Runs, Ask a Question.

VISUAL DESIGNER
Drag-and-drop canvas (React Flow). Node types: Source (B-Event), Queue,
Activity (C-Event), Sink. Changes sync bidirectionally with the Forms/Tabs
editors. Connection rules: Source → Queue, Queue → Activity, Activity → Queue
or Sink.

COMMON PROBLEMS
- Queue growing without bound: server utilisation likely above ~85%. Add servers
  or reduce inter-arrival rate.
- Warmup transient: extend run duration and enable warmup detection.
- Wide confidence intervals: increase replication count (aim for CI half-width
  < 5% of mean).
- RENEGE not firing: check maxWait value relative to service time and arrival
  rate.
--- END REFERENCE ---
```

**User message** includes the question and the serialised context object:

```
Current view: {context.currentView}
Model: {context.modelSummary ? JSON.stringify(context.modelSummary) : "No model open"}

Question: {question}
```

### 4.4 Suggested questions

Defined in `suggestedQuestions.js` as a map keyed by `currentView`:

```js
export const SUGGESTED_QUESTIONS = {
  library: [
    "How do I create my first model?",
    "What is the Three-Phase simulation method?",
    "Can I import a model from a JSON file?",
  ],
  editor: [
    "How do I add an inter-arrival distribution?",
    "What is the difference between a B-Event and a C-Event?",
    "How do I configure multi-stage routing?",
    "When should I use RENEGE?",
  ],
  execute: [
    "How many replications should I run?",
    "How do I interpret the confidence intervals?",
    "What does a high utilisation value mean?",
    "How does the warm-up period affect my results?",
  ],
  "visual-designer": [
    "How do I connect a queue to an activity?",
    "What does the Source node represent?",
    "Why is a connection shown in red?",
    "How do I add a new queue to the canvas?",
  ],
};
```

### 4.5 llm-proxy extension

The `llm-proxy` Edge Function must accept `kind: "help"`. Add `"help"` to the
allowed `kind` values alongside the existing `"narrative"`, `"suggestions"`,
`"sensitivity"`, `"comparison"`, `"query"`, and `"build"` values.

No change to routing logic is required — `"help"` uses the same provider/model
selection as other kinds. Rate limit: same as existing (10 requests per user per
hour).

---

## 5. UI Specification

### 5.1 Toggle button

- Location: global navigation bar (top right), rendered as a `?` icon button.
- `aria-label="Help"`.
- Renders at all times, in all views.
- Clicking toggles the `HelpPanel` open/closed.
- When the panel is open, the icon is highlighted (active state using the
  existing design token for active nav items).

### 5.2 HelpPanel drawer

- Width: 340px, fixed, right-aligned.
- Full viewport height.
- When open: existing page content shrinks to fill remaining width (same
  flex-shrink pattern as AI Insights panel — do not replicate layout logic,
  reuse the same mechanism if already abstracted).
- Panel header: "Help" with a `×` close button (`aria-label="Close help panel"`).
- Panel body: three sections stacked vertically:
  1. **Question input** — text input with placeholder *"Ask a question about
     simmodlr…"* and a **Send** button. Keyboard: Enter submits.
  2. **Suggested questions** — 3–4 chips/buttons rendered from
     `SUGGESTED_QUESTIONS[currentView]`. Clicking a chip populates the input
     and submits immediately.
  3. **Response area** — scrollable, streaming token display. Shows placeholder
     text *"Ask a question to get started."* before first interaction.
     Shows a loading spinner before the first token arrives.
     Shows an amber error banner if the stream fails.
     **Copy** button appears after stream completes.

### 5.3 State management

The `HelpPanel` maintains its own local state:
- `isOpen: boolean`
- `inputValue: string`
- `isLoading: boolean`
- `responseText: string`
- `error: string | null`
- `conversationHistory: [{role, content}]` — retained for the session to allow
  follow-up questions; cleared when panel is closed and re-opened.

---

## 6. Implementation Prompts for Claude Code

Each prompt is designed to complete in under 2 minutes. Run them sequentially.
**Before starting FSN.1, read the live `docs/simmodlr_Build_Plan.md` to
confirm the correct sprint number and replace all `SN` references below.**

---

### Prompt FSN.1 — Help Panel UI Shell

```
Task FSN.1 of Sprint N — Help Assistant.

Read these files before writing code:
  - CLAUDE.md
  - src/App.jsx (or top-level layout component — find the nav bar)
  - src/ui/execute/index.jsx (to understand the AI Insights panel pattern)
  - src/ui/shared/components.jsx (shared UI primitives)

Create src/ui/help/HelpPanel.jsx (new file):
  - Drawer component, 340px wide, right-aligned, full viewport height.
  - Props: { isOpen, onClose, currentView, modelSummary }
  - Header: "Help" text + × close button (aria-label="Close help panel").
  - Body section 1: text input (placeholder "Ask a question about simmodlr…")
    + Send button. Enter key submits. Input and button disabled while loading.
  - Body section 2: suggested questions area — receives suggestedQuestions prop
    (string[]). Renders each as a clickable chip. Clicking populates and submits.
  - Body section 3: scrollable response area. Shows placeholder "Ask a question
    to get started." when responseText is empty. Shows spinner when isLoading.
    Shows amber error banner when error is set. Shows response text when present.
    Shows Copy button after first response completes (copies responseText to
    clipboard).
  - All LLM call logic is stubbed (onSubmit calls a prop function for now).
  - No LLM calls in this task.

Create src/ui/help/suggestedQuestions.js (new file):
  - Export SUGGESTED_QUESTIONS object keyed by currentView with 3–4 questions each.
  - Views: "library", "editor", "execute", "visual-designer".
  - See sprint spec for question content.

Add ? toggle button to the global nav bar in App.jsx (or equivalent):
  - Position: top right of nav bar.
  - aria-label="Help".
  - Clicking toggles helpPanelOpen state (add useState to App.jsx).
  - Pass isOpen, onClose, currentView, modelSummary, and suggestedQuestions
    derived from SUGGESTED_QUESTIONS[currentView] to HelpPanel.
  - currentView should reflect the currently active route/tab — derive from
    existing routing state.

Do not implement LLM calls. Do not modify the engine.

Testing:
  - UI test: ? button renders in nav bar.
  - UI test: clicking ? opens HelpPanel; clicking × closes it.
  - UI test: clicking a suggested question chip populates the input.
  - UI test: Send button and input are disabled when isLoading=true.
```

**Completion checklist:**
- [ ] `HelpPanel.jsx` created
- [ ] `suggestedQuestions.js` created
- [ ] `?` button in nav bar toggles panel
- [ ] Suggested questions render and populate input on click
- [ ] Disabled states work correctly
- [ ] UI tests pass
- [ ] `npm run build` succeeds

---

### Prompt FSN.2 — buildHelpPrompt and helpContext

```
Task FSN.2 of Sprint N — Help Assistant.

Read these files before writing code:
  - src/llm/prompts.js
  - src/llm/contracts.js (if present — provider-neutral contract)

Create src/ui/help/helpContext.js (new file):
  Export buildHelpContext(currentView, model):
    - currentView: string — one of "library", "editor", "execute",
      "visual-designer"
    - model: the current model_json object, or null if no model is open
    - Returns:
      {
        currentView,
        modelSummary: model ? {
          name: model.name,
          entityTypeCount: Object.keys(model.entityTypes || {}).length,
          queueCount: Object.keys(model.queues || {}).length,
          bEventCount: (model.bEvents || []).length,
          cEventCount: (model.cEvents || []).length,
          hasRun: false   // placeholder; wire to actual run history in FSN.3
        } : null
      }
    - Must never throw — wrap in try/catch and return { currentView,
      modelSummary: null } on any error.

Add to src/llm/prompts.js (do not rewrite the file — add the new export only):
  Export buildHelpPrompt(question, helpContext):
    - Returns a messages array in the provider-neutral format established by
      contracts.js (or plain { system, userMessage } if contracts.js is absent).
    - System prompt: embed the full simmodlr reference text from the sprint
      specification. The reference is hardcoded in prompts.js — it is NOT
      fetched at runtime.
    - User message: includes currentView, serialised modelSummary (or
      "No model open"), and the question.
    - question must be trimmed and must not be empty; throw if empty.

Testing:
  - Unit test: buildHelpContext with a valid model returns correct counts.
  - Unit test: buildHelpContext with model=null returns { currentView,
    modelSummary: null }.
  - Unit test: buildHelpContext never throws (pass malformed model object).
  - Unit test: buildHelpPrompt returns a system prompt containing the string
    "Three-Phase".
  - Unit test: buildHelpPrompt throws when question is empty or whitespace only.
```

**Completion checklist:**
- [ ] `helpContext.js` created
- [ ] `buildHelpContext` handles null model
- [ ] `buildHelpContext` never throws
- [ ] `buildHelpPrompt` added to `prompts.js`
- [ ] System prompt contains full reference text
- [ ] All unit tests pass

---

### Prompt FSN.3 — Wire LLM calls into HelpPanel

```
Task FSN.3 of Sprint N — Help Assistant.

Read these files before writing code:
  - src/ui/help/HelpPanel.jsx         (from FSN.1)
  - src/ui/help/helpContext.js        (from FSN.2)
  - src/llm/prompts.js                (updated in FSN.2)
  - src/llm/apiClient.js              (existing streamNarrative pattern)
  - src/App.jsx

Wire LLM calls into HelpPanel.jsx:
  - Import buildHelpContext and buildHelpPrompt.
  - On submit (Send button or Enter or chip click):
    1. Build context: buildHelpContext(currentView, modelSummary)
    2. Build prompt: buildHelpPrompt(inputValue, context)
    3. Call streamNarrative (or equivalent) using the help prompt.
       Pass kind: "help" in the request payload.
    4. Display streaming tokens in the response area.
    5. After stream completes, append the exchange to conversationHistory
       (for follow-up context in subsequent questions in the same session).
    6. On error, display amber error banner "Help unavailable — try again."

Conversation history:
  - Keep up to the last 6 turns (3 user + 3 assistant) to avoid token bloat.
  - Clear history when the panel is closed and re-opened.
  - Pass prior turns to buildHelpPrompt as an optional third argument; update
    buildHelpPrompt to prepend them before the current question in the messages
    array.

Update src/ui/help/helpContext.js:
  - buildHelpContext now accepts a third argument: hasRun (boolean).
  - Wire hasRun from the run history state in App.jsx when constructing context
    (true if the current model has at least one saved run).

Update llm-proxy (supabase/functions/llm-proxy/index.ts):
  - Add "help" to the allowed kind values list.
  - No other changes to routing or provider selection.

Testing:
  - Unit test: onSubmit sets isLoading=true and clears error.
  - Unit test: stream error sets error state and clears isLoading.
  - Unit test: conversation history is truncated at 6 turns.
  - Manual: open Help panel, ask "What is a C-Event?" — verify streamed response
    references conditional events and the Three-Phase loop.
  - Manual: ask a follow-up question without re-opening the panel — verify
    prior context is retained.
```

**Completion checklist:**
- [ ] Submit wires through to `llm-proxy` with `kind: "help"`
- [ ] Streaming tokens appear progressively
- [ ] Error banner shown on failure
- [ ] Conversation history retained within session and cleared on close
- [ ] `hasRun` correctly injected into context
- [ ] `llm-proxy` accepts `"help"` kind
- [ ] Unit tests pass
- [ ] Manual verification complete
- [ ] `npm test -- --run` passes
- [ ] `npm run build` succeeds

---

## 7. Completion Gate

```bash
npm test -- --run                        # Zero failures
npm test -- help                         # Help prompt and context tests pass
npm run build                            # Succeeds

# Manual checks:
# 1. Open simmodlr — confirm ? button visible in nav bar in all views
# 2. Click ? — confirm panel opens with suggested questions for current view
# 3. Navigate to a different view — confirm suggested questions update
# 4. Ask "How do I configure a warm-up period?" — confirm streamed response
#    references warm-up and experiment controls
# 5. Ask a follow-up "What value should I use?" — confirm prior context retained
# 6. Close and re-open panel — confirm conversation history cleared
# 7. Disconnect network, ask a question — confirm amber error banner appears
# 8. Keyboard only: Tab to ? button, Enter to open, Tab to input, type question,
#    Enter to submit — full flow accessible without mouse
```

---

## 8. Build Plan Update Instructions

After all three prompts complete and the completion gate passes, Claude Code must
update `docs/simmodlr_Build_Plan.md` as follows:

1. **Document History table** — add a new row:
   ```
   | {version+1} | {date} | Sprint N complete — Help Assistant.
   HelpPanel.jsx, helpContext.js, suggestedQuestions.js added.
   buildHelpPrompt added to prompts.js. llm-proxy extended with "help" kind.
   {N tests} passing. |
   ```

2. **Sprint History table** — add a new row:
   ```
   | Sprint N | ✅ Complete | {date} | Help Assistant |
   {test count} | N/A | Success | HelpPanel, buildHelpPrompt,
   suggestedQuestions, helpContext. llm-proxy extended. |
   ```

3. **Direction of Travel table** — add or update a row:
   ```
   | In-product help | ✅ Complete | Sprint N adds conversational Help Assistant
   panel, grounded in simmodlr documentation, available from all views. |
   ```

4. **User Guide reference** — add a note in the sprint completion notes:
   ```
   User Guide section 11 (Help Assistant) should be added to
   simmodlr_User_Guide.md in a follow-on documentation pass.
   ```

---

## 9. User Guide Addendum

The following section should be appended to `docs/simmodlr_User_Guide.md`
after Sprint N completes. Claude Code should add it as **Section 11** (or the
next available section number).

```markdown
## 11. Help Assistant

The Help Assistant is a conversational panel that answers questions about
simmodlr at any point during your session. It is available from every view
via the **?** button in the navigation bar.

### 11.1 Opening the panel

Click the **?** button (top right of the navigation bar) to open the Help
Assistant drawer. Click **×** or click **?** again to close it.

### 11.2 Asking a question

Type your question in the input field and press **Enter** or click **Send**.
The assistant streams a response grounded in simmodlr's documentation and
your current model context.

Example questions:
- "How do I set up an exponential inter-arrival distribution?"
- "What is the difference between a B-Event and a C-Event?"
- "How many replications should I run for reliable results?"
- "Why is my queue growing without bound?"
- "How do I model a 90/10 patient triage split?"

### 11.3 Suggested questions

When you open the panel, 3–4 suggested questions relevant to your current
view are shown as clickable chips. Click any chip to submit that question
immediately.

### 11.4 Follow-up questions

The assistant retains the conversation within the current session, so you can
ask follow-up questions without repeating context. The history is cleared when
you close and re-open the panel.

### 11.5 Relationship to AI Insights

The Help Assistant answers questions about **how to use simmodlr** and
**modelling concepts**. The AI Insights panel (available in the Execute view
after a run) analyses **your specific simulation results** — interpreting
KPIs, suggesting model improvements, and comparing runs. The two panels
serve different purposes and are independent.
```

---

*End of sprint specification.*
*Replace all occurrences of `Sprint N` and `SN` with the actual sprint number
before executing any Claude Code prompt.*
