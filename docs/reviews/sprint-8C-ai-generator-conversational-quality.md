# Sprint 8C — AI Model Generator: Conversational Quality & Outcome Presentation

**Status:** ⬜ Ready to start  
**Prerequisite:** None — Sprint 9B is complete. Ready to run.  
**Scope:** `src/llm/`, `src/ui/editors/` (AI tab and DiffPreview only), `docs/`  
**No engine changes. No schema changes. No new dependencies.**

---

## Context for Claude Code

Read `simmodlr_Build_Plan.md` before doing anything else.

Sprint 9B is complete but the build plan still shows it as 🔄 In progress.
Before starting any feature work, update the build plan as follows:

1. Change Sprint 9B status to ✅ Complete with today's date
2. Update the Sprint History table row for Sprint 9B to ✅ Complete
3. Update the Roadmap Snapshot "Visual authoring" row to ✅ Complete
4. Update the mermaid flowchart: change S9B node class from `next` to `done`
5. Add a document history entry for Sprint 9B closure

Then add the Sprint 8C entry to the build plan in the correct position
(after Sprint 9B) per F8C.6 at the end of this session.

The Sprint 8 AI Generated Model tab works correctly at a mechanical level
but has two identified weaknesses that this sprint addresses:

1. **Conversation quality.** The LLM is instructed to ask at most 2
   clarifying questions before producing JSON. In practice it rushes to
   generate a technically valid but domain-shallow model. Users cannot
   verify whether it matches their real system.

2. **Outcome presentation.** `ModelDiffPreview` presents the result in
   schema terms (entity classes added, B-events modified). Users think in
   simulation terms (who arrives, how they flow, how long things take).
   The gap makes "Apply" a leap of faith rather than an informed decision.

This sprint introduces a three-phase elicitation discipline, a plain-English
confirmation step before JSON is generated, a simulation-concept outcome card,
and proactive refinement chips after each build.

---

## Features

| ID | Feature | Files |
|----|---------|-------|
| F8C.1 | Consultant-mode system prompt | `src/llm/model-builder-prompts.js` |
| F8C.2 | Confirmation step in chat panel | `src/ui/editors/index.jsx` |
| F8C.3 | Plain-English outcome card | `src/ui/editors/ModelDiffPreview.jsx` |
| F8C.4 | Proactive refinement chips | `src/ui/editors/index.jsx` |
| F8C.5 | Documentation update | `docs/simmodlr_User_Guide.md`, `docs/simmodlr_Engineering_Spec.md` |
| F8C.6 | Build plan update | `simmodlr_Build_Plan.md` |

**Sequence:** F8C.1 must complete before F8C.2–F8C.4. F8C.2, F8C.3, and
F8C.4 are independent of each other once F8C.1 is done. F8C.5 and F8C.6
run last.

---

## F8C.1 — Consultant-Mode System Prompt

**File:** `src/llm/model-builder-prompts.js`

```
Read src/llm/model-builder-prompts.js in full.
Read src/llm/apiClient.js — understand the callModelBuilder() call signature.
Read tests/llm/model-builder-prompts.test.js — understand the existing tests.

Replace buildModelBuilderSystemPrompt() with a revised version that
structures the LLM behaviour in three explicit phases.

Do NOT change the response JSON envelope keys:
  intent / questions / proposedModel / explanation / suggestions
Add one new valid value for intent: "confirm"

─── PHASE A — DISCOVERY ───────────────────────────────────────────────────────

The LLM asks questions ONE AT A TIME. No fixed cap on questions, but each
must be purposeful — targeted at information that materially affects model
structure. Enforce this question order:

  1. What flows through the system? (defines customer entity type)
  2. How do they arrive — continuously, in batches, or on a schedule?
     (drives B-event distribution choice)
  3. What service stages do they pass through?
     (maps to queue → activity structure)
  4. How many servers or resources are available at each stage?
     (server entity count)
  5. How long does each stage typically take, and how variable is it?
     (service distribution type and parameters)
  6. Is there any priority ordering, or do customers ever give up waiting?
     (queue discipline, reneging)
  7. What outcome are you trying to improve?
     (goals array — waiting time, utilisation, throughput)

After each user answer the LLM either:
  - Asks the next question (intent: "clarify", questions: ["..."], proposedModel: null)
  - OR, when it can describe the full system without ambiguity, moves to Phase B

─── PHASE B — CONFIRMATION ────────────────────────────────────────────────────

When the LLM has enough information to build the model it must NOT generate
JSON immediately. It responds with:
  intent: "confirm"
  questions: null
  proposedModel: null
  explanation: a plain-English summary in exactly this structure:

    "Here is my understanding of your system:

    Arrivals: [entity type name] arrive every [value] [time unit] on average
    ([distribution name] distribution)

    Flow: [stage 1 queue name] → [stage 1 server type, N servers,
    service distribution] → [stage 2 if present] → exit

    Queue discipline: [FIFO / PRIORITY / LIFO] at [stage name]
    [Reneging: entities abandon after ~[N] minutes if this was mentioned]

    Goal: [performance target if stated, or 'not specified']

    Does this accurately describe your system? I'll build the model once
    you confirm, or correct anything that looks wrong."

─── PHASE C — BUILD ───────────────────────────────────────────────────────────

Phase C is triggered only when the user replies affirmatively to the Phase B
confirmation (e.g. "yes", "correct", "looks right", "go ahead").

The LLM generates:
  intent: "build"
  proposedModel: complete model JSON conforming to the schema
  explanation: a concise plain-English model summary (3–5 sentences covering
               arrivals, flow, resources, and key distributions)
  suggestions: array of exactly 3 short refinement question strings that
               probe realistic dimensions the user may not have considered.
               Examples:
                 "Do arrival rates vary at different times of day?"
                 "Should some customers have higher priority than others?"
                 "Is there a maximum time customers will wait before leaving?"

─── CONSTRAINTS (unchanged from Sprint 8) ─────────────────────────────────────

  - Never invent macros not in the schema (ARRIVE, ASSIGN, COMPLETE,
    RELEASE, RENEGE only)
  - Never invent distribution types not in the schema
  - Never add fields not present in the schema
  - All distParams values must be strings (e.g. "5" not 5)
  - Queue names in macros must match the 'name' field exactly (case-sensitive)
  - proposedModel must pass validateModel() structurally

─── WHAT TO REMOVE ────────────────────────────────────────────────────────────

  Remove: the instruction that caps clarifying questions at 2
  Remove: the instruction that auto-injects a build prompt after 10 turns
  Replace both with the Phase A/B/C discipline above.

Update buildModelBuilderUserMessage() only if needed — the phase is implicit
in the conversation history; no new parameters are required.

─── TESTS ─────────────────────────────────────────────────────────────────────

Update tests/llm/model-builder-prompts.test.js:

  New tests to add:
    - System prompt contains the string "PHASE A" as a structural marker
    - System prompt contains the string "PHASE B" as a structural marker
    - System prompt contains the string "PHASE C" as a structural marker
    - System prompt lists "confirm" as a valid intent value
    - System prompt does NOT contain "at most 2 clarifying questions"
      (or equivalent cap language)
    - System prompt specifies suggestions[] in the response format

  Existing tests to preserve:
    - buildModelBuilderUserMessage includes currentModel when non-empty
    - Response format specifies intent / proposedModel / explanation keys
```

**Completion checklist:**
- [ ] `buildModelBuilderSystemPrompt()` restructured with Phase A/B/C
- [ ] `"confirm"` intent value documented in system prompt
- [ ] `suggestions[]` array specified in response format
- [ ] 2-question cap instruction removed
- [ ] Auto-inject-after-10-turns instruction removed
- [ ] Existing tests updated and passing
- [ ] New phase-structure and confirm-intent tests passing

---

## F8C.2 — Confirmation Step in Chat Panel

**File:** `src/ui/editors/index.jsx` (AI Generated Model tab section only)

```
Read src/ui/editors/index.jsx — find the AI Generated Model tab panel.
Read src/llm/model-builder-prompts.js (after F8C.1 is complete).
Read src/ui/shared/tokens.js — use design tokens for all styling.

Extend the chat panel to handle the new "confirm" intent.

─── CURRENT INTENT HANDLING ────────────────────────────────────────────────

  clarify  → assistant bubble with the questions text
  build    → explanation bubble + show ModelDiffPreview
  refine   → explanation bubble + show ModelDiffPreview

─── NEW INTENT HANDLING ─────────────────────────────────────────────────────

  clarify  → unchanged
  confirm  → confirmation bubble (new — specified below)
  build    → unchanged in this task (F8C.3 changes DiffPreview)
  refine   → unchanged in this task

─── CONFIRMATION BUBBLE ─────────────────────────────────────────────────────

Render the explanation field from the LLM "confirm" response as a styled
bubble that is visually distinct from a normal assistant message:
  - Border: 1px solid tokens.teal (or equivalent primary colour token)
  - Background: a subtle tint of that colour (e.g. 8% opacity)
  - Same border-radius and padding as existing assistant bubbles

Below the explanation text, render two inline action buttons:

  [Looks right — build it]
    On click: programmatically send the string "yes" as the next user
    message. This should trigger the same code path as the user typing
    "yes" and pressing Enter — append to conversation history and call
    callModelBuilder().

  [Something's wrong — let me correct it]
    On click: focus the chat textarea input and set its placeholder to
    "Tell me what to correct..."
    Do NOT send any message automatically.

Strip any trailing "Does this accurately describe your system? ..." prompt
text from the LLM explanation before rendering — it is now handled by the
buttons. Strip by removing any sentence that ends with a "?" in the last
paragraph of the explanation string.

─── CONSTRAINTS ─────────────────────────────────────────────────────────────

  - Do not modify the clarify, build, or refine handling in this task
  - Do not modify ModelDiffPreview in this task (that is F8C.3)
  - Do not add new npm dependencies

─── TESTS ───────────────────────────────────────────────────────────────────

Add or update UI tests (tests/ui/editors/ — match existing test file naming):

  - When LLM returns intent "confirm", a confirmation bubble renders in
    the conversation (not a normal assistant bubble)
  - Confirmation bubble contains "Looks right — build it" button
  - Confirmation bubble contains "Something's wrong" button
  - Clicking "Looks right — build it" appends "yes" to conversation and
    calls callModelBuilder (mock the API call)
  - Clicking "Something's wrong" focuses the textarea input
  - Clarify intent still renders a plain assistant bubble (regression)
  - Build intent still shows ModelDiffPreview (regression)
```

**Completion checklist:**
- [ ] `"confirm"` intent renders a styled confirmation bubble
- [ ] Confirmation bubble is visually distinct from normal assistant bubbles
- [ ] "Looks right — build it" auto-sends "yes" via existing send path
- [ ] "Something's wrong" focuses textarea with updated placeholder
- [ ] Trailing question text stripped from LLM explanation before render
- [ ] Clarify and build/refine paths unchanged (regression tests pass)
- [ ] New UI tests passing

---

## F8C.3 — Plain-English Outcome Card

**File:** `src/ui/editors/ModelDiffPreview.jsx`

```
Read src/ui/editors/ModelDiffPreview.jsx in full.
Read src/ui/shared/tokens.js — use design tokens throughout.
Read tests/ui/editors/ — find the existing ModelDiffPreview tests.

The current component leads with a schema-section diff:
  "Entity Classes: 2 added | B-Events: 1 modified | ..."

Replace this with a two-layer presentation.

─── LAYER 1 — SIMULATION SUMMARY CARD (always visible, shown first) ──────────

Parse proposedModel and render a read-only human-readable summary.
Use simulation concepts, not schema terms. Derive all values directly
from proposedModel fields — do NOT use the llmExplanation string for
the data in this layer.

Render the following sections (omit a section if the data is absent):

  WHO ARRIVES
    "[Entity type name] arrive approximately every [inter-arrival mean]
    [timeUnit] ([distribution name] distribution)"
    Derive inter-arrival mean from the arrival B-event's schedule distParams.

  HOW THEY FLOW
    For each stage in order (derive from ARRIVE → queue → ASSIGN → COMPLETE):
      "→ [Queue name] ([discipline]) → [N] [server type]
       (service: [dist name], mean ~[value] [timeUnit])"
    End with "→ exit"
    If reneging is present: append
    "Entities who wait more than ~[N] [timeUnit] without service will leave"

  RESOURCES
    For each server entity type:
      "[Name]: [count] available"

  EXPERIMENT SETTINGS
    "Run: [maxSimTime] [timeUnit]  |  Warm-up: [warmupPeriod]  |
     Replications: [replications]"

  GOALS (only if goals[] is non-empty)
    List each goal's metric and target on a single line each

Above the summary card, render the llmExplanation string (new prop) as a
short italic quote in muted text colour (tokens.textMuted or equivalent).
If llmExplanation is empty or null, omit this element entirely.

─── LAYER 2 — TECHNICAL CHANGES (collapsible, collapsed by default) ──────────

Keep the existing schema-section diff (Added / Modified / Removed / Unchanged)
but wrap it in a collapsible container:
  - Label the toggle: "Show technical changes ▾" / "Hide technical changes ▴"
  - Collapsed by default
  - Expand/collapse is local React state (no prop needed)

─── ACTIONS ──────────────────────────────────────────────────────────────────

Keep the same three action buttons but update labels and behaviour:

  Primary button:    "Apply model"
    Behaviour unchanged — calls existing onApply handler

  Secondary button:  "Refine this"
    Calls new onRefine prop (see below)
    Does NOT close the diff panel automatically — let onRefine handle that

  Tertiary toggle:   "Show technical changes ▾"
    Toggles Layer 2 visibility

─── PROPS CHANGE ─────────────────────────────────────────────────────────────

Add two new optional props:
  llmExplanation: string | null   — the explanation field from LLM response
  onRefine: () => void            — called when "Refine this" is clicked

The caller (index.jsx) must:
  - Pass llmExplanation from the LLM response object
  - Pass onRefine as a handler that closes the diff panel and focuses
    the chat input with placeholder "What would you like to change?"

All existing props (currentModel, proposedModel, onApply, onDiscard)
remain unchanged. onDiscard is NOT removed — keep it for programmatic use.

─── TESTS ────────────────────────────────────────────────────────────────────

Update tests/ui/editors/ (model-diff-preview tests):

  - Summary card renders the customer entity type name
  - Summary card renders the arrival distribution name
  - Summary card renders the queue name and discipline
  - Summary card renders server count
  - llmExplanation renders as italic text above the summary card
  - llmExplanation is absent when prop is null
  - Technical changes section is collapsed by default
  - "Show technical changes" toggle expands the section
  - "Refine this" button calls onRefine callback
  - "Apply model" button calls onApply callback (regression)
  - Existing diff logic (Added/Modified/Removed) still present in Layer 2
    (regression — do not remove the existing diff rendering)
```

**Completion checklist:**
- [ ] Simulation summary card is the primary visible layer
- [ ] Summary correctly derives entity type, arrival rate, queue, service, experiment values from proposedModel
- [ ] `llmExplanation` renders as italic quote above card; absent when null
- [ ] Technical changes section present but collapsed by default
- [ ] "Show technical changes" toggle works
- [ ] "Apply model" label updated, behaviour unchanged
- [ ] "Refine this" button calls `onRefine` prop
- [ ] `llmExplanation` and `onRefine` props added
- [ ] Existing diff rendering preserved in Layer 2
- [ ] All updated tests passing

---

## F8C.4 — Proactive Refinement Chips

**File:** `src/ui/editors/index.jsx` (AI Generated Model tab section only)

```
Read src/ui/editors/index.jsx — find the section that renders
ModelDiffPreview after a build or refine LLM response.
Read src/ui/shared/tokens.js.

After a build or refine response, the LLM now returns a suggestions[]
array of 3 short question strings (added in F8C.1).

Render these as tappable pill chips in the conversation area,
BELOW the confirmation/explanation message bubble and ABOVE or ALONGSIDE
the ModelDiffPreview — whichever fits the existing layout better.
Do NOT render chips inside ModelDiffPreview.

─── VISUAL SPECIFICATION ────────────────────────────────────────────────────

Each chip:
  - Shape: pill (border-radius: 999px)
  - Border: 1px solid [primary teal token]
  - Background: transparent (default)
  - Text: [primary teal token], 12px
  - Padding: 4px 14px
  - On hover: background [primary teal token], text white
  - Cursor: pointer

Chip container:
  - Display: flex, flex-wrap: wrap, gap: 8px
  - Margin-top: 8px below the preceding message bubble

─── BEHAVIOUR ───────────────────────────────────────────────────────────────

  On chip click:
    1. Set the textarea value to the chip text
    2. Immediately submit — same code path as the user typing and
       pressing Enter (append to history, call callModelBuilder)
    3. Remove all chips from the conversation (set chips state to [])

  On manual textarea submit (user types and sends their own message):
    Clear chips state to [] before or after sending

  Chips only appear after intent "build" or "refine" responses.
  Chips do NOT appear after "clarify" or "confirm" responses.
  If suggestions[] is empty or null, render nothing.
  If suggestions[] has fewer than 3 items, render only what is present.

─── CONSTRAINTS ─────────────────────────────────────────────────────────────

  - No new npm dependencies
  - Store chips in React state local to the AI Generator tab component
  - Do not persist chips to Supabase or sessionStorage

─── TESTS ───────────────────────────────────────────────────────────────────

Add UI tests (tests/ui/editors/):

  - 3 chips render after a build response containing 3 suggestions
  - Clicking a chip submits its text as a user message (mock callModelBuilder)
  - All chips disappear after one is clicked
  - Chips disappear after a manual message is sent by the user
  - No chips render after a clarify response
  - No chips render after a confirm response
  - No chips render when suggestions array is empty
  - 1 chip renders correctly when suggestions array has only 1 item
```

**Completion checklist:**
- [ ] Refinement chips render after build/refine responses
- [ ] Chips styled as pills matching token system
- [ ] Clicking a chip submits its text and triggers callModelBuilder
- [ ] Chips cleared after any chip click
- [ ] Chips cleared after manual user send
- [ ] No chips shown after clarify or confirm responses
- [ ] Empty suggestions array renders nothing
- [ ] All UI tests passing

---

## F8C.5 — Documentation Update

**Files:** `docs/simmodlr_User_Guide.md`, `docs/simmodlr_Engineering_Spec.md`

```
Read docs/simmodlr_User_Guide.md in full.
Read docs/simmodlr_Engineering_Spec.md — find the LLM Integration
section (§6 or equivalent) covering the model-builder prompt contract.

Do not modify any sections other than those specified below.
After editing, report exactly which headings were changed.

─── TASK A: UPDATE USER GUIDE ───────────────────────────────────────────────

Find the section covering the AI Model Generator (search for
"AI Model Generator" or "Generate with AI" or "AI Generated Model").

Replace the description of how the AI Generator works with the
following content. Match the document's existing heading levels,
tone, and formatting exactly.

The replacement content should cover:

  WHAT IT DOES (one paragraph)
    The AI Generator helps you build a simulation model through a guided
    conversation. It asks questions about your system one at a time,
    confirms its understanding in plain English before generating anything,
    then presents the result as a readable summary — not raw JSON — so you
    can verify it matches your system before applying it.

  HOW TO USE IT (numbered steps)
    1. Describe your problem
       Open the AI Generator tab and type a sentence or two about what
       you want to simulate. The generator will ask targeted follow-up
       questions one at a time to understand the structure of your system.

    2. Confirm the model
       Once the AI has enough information, it will summarise its
       understanding in plain English — who arrives, how they flow through
       the system, how many resources are available, and what you are
       trying to improve. Review this summary and either confirm it or
       tell the AI what to correct. The model JSON is not generated until
       you confirm.

    3. Review and apply
       The generated model is shown as a plain-English summary covering
       arrivals, flow, resources, and experiment settings. Click
       "Apply model" to load it into the editor, or "Refine this" to
       return to the conversation and make changes. Use the suggestion
       chips below the summary to explore common improvements such as
       time-varying arrivals, priority queuing, or customer abandonment.

  TIPS (match existing tip/note/callout formatting in the document)
    - The more specific you are about arrival rates and service times,
      the more realistic the generated model will be. Round numbers are
      fine — the important thing is the right order of magnitude.
    - You can switch to the Forms/Tabs editor or the Visual Designer at
      any time after applying a generated model to make precise adjustments.
    - Generated models are always validated before being applied.
      The engine will never receive an invalid model from the AI Generator.
    - The AI Generator works best for new models or adding significant new
      elements. For small targeted changes, editing directly in the
      Forms/Tabs editor is usually faster.

─── TASK B: UPDATE ENGINEERING SPEC ─────────────────────────────────────────

Find the section describing the model-builder LLM prompt contract
(the section covering buildModelBuilderSystemPrompt, the response JSON
format, and the three operating modes: Describe→Build, Refine, Explain).

Make the following targeted updates only:

  1. Add "confirm" to the list of valid intent values:
       confirm — The LLM has gathered enough information to build the model
       but is requesting user sign-off before generating JSON.
       proposedModel is null. explanation contains a plain-English summary
       of the system as the LLM understands it. questions is null.

  2. Add suggestions to the response schema table or description:
       suggestions: string[] | null
       Present when intent is "build" or "refine". An array of up to 3
       short refinement question strings that prompt the user to consider
       common model improvements. Null for all other intent values.

  3. Update the operating mode description to reflect the three-phase
     structure. Replace the existing Describe→Build / Refine / Explain
     description with:

       Phase A — Discovery: The LLM asks targeted questions one at a time
       to understand the system structure. No fixed question cap.

       Phase B — Confirmation: When sufficient information has been gathered,
       the LLM produces a plain-English system summary (intent: "confirm")
       and waits for user sign-off before generating any model JSON.

       Phase C — Build: Triggered by user confirmation. The LLM generates
       the complete proposedModel JSON, a plain-English explanation summary,
       and a suggestions array of 3 refinement prompts.

       Refine mode: operates as Phase A/B/C but with the existing model
       included in context. The LLM refines rather than replaces unless
       the user explicitly requests a full rebuild.

       Explain mode: unchanged — the LLM returns a plain-English
       explanation of the selected model element (intent: "clarify",
       no proposedModel).

  4. Remove or update any sentence that describes the clarification
     question cap (e.g. "at most 2 clarifying questions") — this cap
     no longer exists.

Do not modify any other sections of either document.
```

**Completion checklist:**
- [ ] User Guide AI Generator section rewritten with 3-step flow
- [ ] User Guide tips block added matching document style
- [ ] Engineering Spec: `"confirm"` intent added with description
- [ ] Engineering Spec: `suggestions[]` added to response schema
- [ ] Engineering Spec: Phase A/B/C operating mode description added
- [ ] Engineering Spec: question-cap reference removed
- [ ] No other sections of either document modified
- [ ] Changes confirmed by reporting updated heading names

---

## F8C.6 — Build Plan Update

**File:** `simmodlr_Build_Plan.md`

```
Read simmodlr_Build_Plan.md in full before making any changes.

STEP 1: CLOSE SPRINT 9B
-----------------------
Sprint 9B is complete but the build plan still marks it as in progress.
Make these targeted updates before adding the Sprint 8C entry:

  1. Sprint 9B status line:
       Change: 🔄 In progress | Started: 2026-05-06 | Completed: —
       To:     ✅ Complete    | Started: 2026-05-06 | Completed: [today]

  2. Sprint History table — Sprint 9B row:
       Change status to ✅ Complete, add today's date to Completed column.
       Update Notes: F9B.1–F9B.9 all complete. Resource/server editing,
       safe node deletion, connection editing polish, richer node-linked
       validation, palette affordances, browser round-trip hardening,
       bundle review, coherence pass, and entity attribute/DistPicker
       unification complete.

  3. Roadmap Snapshot table — Visual authoring row:
       Change status from 🔄 Current to ✅ Complete.
       Update Summary: Sprint 9 delivered the graph-first authoring model;
       Sprint 9B completed UX hardening, resource editing, safe delete,
       richer validation, palette polish, and entity attribute unification.

  4. Mermaid flowchart:
       Change:  class S9B next;
       To:      class S9B done;

  5. Document history entry for Sprint 9B closure:
       Version: [current version + 0.01]
       Date: [today]
       Change: Sprint 9B complete — Visual Designer UX hardening finished.
       All nine features delivered: resource/server editing, safe node
       deletion, connection editing polish, node-linked validation panel,
       palette affordances, browser round-trip hardening, bundle review,
       coherence pass, and entity attribute/DistPicker unification.

STEP 2: ADD SPRINT 8C ENTRY
----------------------------
Insert Sprint 8C immediately after Sprint 9B in the document.
Match the format of existing sprint entries exactly (heading level,
feature table structure, checklist format, status icons).

  ## Sprint 8C — AI Model Generator: Conversational Quality & Outcome Presentation

  **Goal:** Transform the AI Generator from a technically correct but
  conversationally blunt JSON builder into a consultant-grade guided
  experience with a confirmation step, plain-English outcome presentation,
  and proactive refinement chips.

  **Status:** ✅ Complete
  **Prerequisite:** Sprint 9B complete
  **Files changed:** src/llm/model-builder-prompts.js,
  src/ui/editors/ModelDiffPreview.jsx, src/ui/editors/index.jsx (AI tab only),
  docs/simmodlr_User_Guide.md, docs/simmodlr_Engineering_Spec.md

  Feature table (use this exact content):

  | Feature | Action |
  |---------|--------|
  | F8C.1 — Consultant-mode system prompt | Replace intent-classifier prompt with Phase A/B/C elicitation discipline in model-builder-prompts.js |
  | F8C.2 — Confirmation step in chat panel | Add "confirm" intent handling with styled confirmation bubble and one-click sign-off buttons |
  | F8C.3 — Plain-English outcome card | Replace schema-section diff with simulation-concept summary card as primary view in ModelDiffPreview.jsx |
  | F8C.4 — Proactive refinement chips | Surface 3 targeted refinement suggestion chips after each build/refine response |
  | F8C.5 — Documentation update | Update User Guide AI Generator section and Engineering Spec LLM prompt contract |

  Completion checklist (sprint-level):
    [x] Phase A/B/C prompt structure in buildModelBuilderSystemPrompt()
    [x] "confirm" intent handled in chat panel with styled confirmation bubble
    [x] Simulation summary card replaces schema diff as primary outcome view
    [x] Refinement chips render and submit after build/refine responses
    [x] User Guide AI Generator section updated to reflect new flow
    [x] Engineering Spec LLM prompt contract updated (confirm intent,
        suggestions array, Phase A/B/C description, cap removed)
    [x] All unit and UI tests pass
    [x] npm run build succeeds

STEP 3: DOCUMENT HISTORY ENTRY FOR SPRINT 8C
----------------------------------------------
Add to the document history table (after the Sprint 9B entry from Step 1):
  Version: [Sprint 9B version + 0.01]
  Date: [today]
  Change: Sprint 8C complete — AI Generator conversational quality redesign.
  Three-phase elicitation (Discovery/Confirmation/Build), confirmation bubble
  with one-click sign-off, simulation-concept outcome card replacing schema
  diff view, and proactive refinement chips added. User Guide and Engineering
  Spec updated.

STEP 4: FORWARD ROADMAP (if that table exists)
-----------------------------------------------
Add a row:
  Sprint 8C | AI Generator conversational quality | Improves elicitation
  depth and outcome clarity in the AI Generated Model authoring mode

Do not change any other sprint entries or sections.
Confirm all four steps are complete and report the two new version numbers.
```

**Completion checklist:**
- [ ] Sprint 9B status updated to ✅ Complete with today's date
- [ ] Sprint 9B history row updated
- [ ] Roadmap Snapshot visual authoring row updated to ✅ Complete
- [ ] Mermaid S9B class changed from `next` to `done`
- [ ] Sprint 9B document history entry added
- [ ] Sprint 8C entry added after Sprint 9B in correct format
- [ ] Sprint 8C document history entry added
- [ ] Forward roadmap row added if section exists
- [ ] No other sections modified
- [ ] Both new version numbers confirmed in output
---

## Sprint 8C Completion Gate

Run these in order. Do not declare the sprint complete until all pass.

```bash
# 1. Full test suite
npm test -- --run
# Expected: zero failures

# 2. LLM prompt tests
npm test -- llm
# Must confirm:
#   - Phase A / B / C structural markers present
#   - "confirm" intent present in system prompt
#   - suggestions[] format specified
#   - 2-question cap NOT present

# 3. UI tests
npm test -- ui
# Must confirm:
#   - Confirmation bubble renders on "confirm" intent
#   - "Looks right" button auto-sends "yes"
#   - Simulation summary card renders entity and queue data
#   - Technical changes collapsed by default
#   - "Refine this" calls onRefine
#   - Refinement chips render, submit, and clear correctly

# 4. Production build
npm run build
# Must succeed with no new warnings
```

### Manual verification checklist (run in browser against dev server)

```
1.  Open an existing model → AI Generated Model tab
2.  Type: "I want to model a busy GP surgery"
3.  Verify: LLM asks one question — not a list of questions
4.  Answer each question as it comes (arrival rate, number of GPs,
    consultation time, etc.)
5.  Verify: after 4–7 questions the LLM sends a confirmation bubble
    (teal-bordered, styled differently from normal assistant messages)
6.  Verify: confirmation bubble shows plain-English system summary
    (arrivals / flow / resources / goal)
7.  Verify: "Looks right — build it" and "Something's wrong" buttons
    are present in the confirmation bubble
8.  Click "Looks right — build it"
9.  Verify: model outcome card shows plain-English summary, NOT
    "Entity Classes: N added, B-Events: N modified"
10. Verify: "Show technical changes ▾" toggle is present and collapsed
11. Verify: 3 refinement chip suggestions appear below the outcome card
12. Click a chip — verify it submits and all 3 chips disappear
13. Click "Refine this" — verify chat input is focused with the
    placeholder "What would you like to change?"
14. Click "Apply model" — verify model loads correctly in Forms/Tabs
15. Switch to Forms/Tabs — verify entity types, queues, B-events and
    C-events are present and correct
16. Open Visual Designer — verify graph reflects the applied model
```

---

## Definition of Done

- [ ] All 6 features complete per their individual checklists above
- [ ] Full test suite passes with zero failures (`npm test -- --run`)
- [ ] Production build succeeds (`npm run build`)
- [ ] Manual verification checklist completed in browser
- [ ] `simmodlr_Build_Plan.md` updated with sprint entry and history
- [ ] `docs/simmodlr_User_Guide.md` updated
- [ ] `docs/simmodlr_Engineering_Spec.md` updated
- [ ] No engine, schema, or dependency changes introduced

---

*Sprint designed: 2026-05-22*  
*Designed in: Claude.ai planning session — LLM-assisted model creation options*
