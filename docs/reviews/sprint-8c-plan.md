# Sprint 8C Implementation Plan — AI Generator Conversational Quality

**Sprint:** 8C (Rectification)
**Theme:** Complete the three-phase conversation discipline and outcome presentation features originally specified in `sprint-8C-ai-generator-conversational-quality.md`
**Assessment date:** 2026-05-22
**Branch:** `main`

---

## Assessment Summary

Sprint 8C was marked ✅ Complete in the build plan, but a code review against the original requirements document reveals three features are partially or incorrectly implemented. The build plan and test record need correction.

| Feature | Status | Gap |
|---------|--------|-----|
| F8C.1 — Consultant-mode system prompt | ⚠️ Partial | 2-question cap not removed; 7-question Phase A sequence absent; Phase B format not enforced |
| F8C.2 — Confirmation step in chat panel | ✅ Complete | Minor wording difference in placeholder only |
| F8C.3 — Plain-English outcome card | ⚠️ Partial | `SimulationSummaryCard` exists but is simpler than specified; no flow path, no goals section |
| F8C.4 — Proactive refinement chips | ⚠️ Partial | Behavior complete; chip styling deviates (border colour, background, no hover) |
| F8C.5 — Documentation | ✅ Complete | User Guide §2.X and Engineering Spec §6.10 are written to spec |
| F8C.6 — Build plan | ⚠️ Partial | Sprint 8C marked complete incorrectly; tests counted at 37 but 6 required prompt tests are absent |

**Test gaps:**
The 6 F8C.1 prompt tests specified in the requirements are missing from `tests/llm/model-builder-prompts.test.js`. Two F8C.4 UI tests are missing from `tests/ui/editors/ai-generated-model-panel.test.jsx`. Three F8C.3 UI tests are missing from `tests/ui/editors/model-diff-preview.test.jsx`.

---

## Scope

| # | Item | File(s) |
|---|------|---------|
| 8C-1 | Remove 2-question cap from Phase A; add 7-question ordered sequence; enforce Phase B format | `src/llm/model-builder-prompts.js` |
| 8C-2 | Add 6 missing prompt tests | `tests/llm/model-builder-prompts.test.js` |
| 8C-3 | Enhance `SimulationSummaryCard` with flow path, resources, and goals sections | `src/ui/editors/ModelDiffPreview.jsx` |
| 8C-4 | Add 3 missing `ModelDiffPreview` UI tests | `tests/ui/editors/model-diff-preview.test.jsx` |
| 8C-5 | Fix chip border colour, background, and add hover state | `src/ui/editors/AiGeneratedModelPanel.jsx` |
| 8C-6 | Add 2 missing `AiGeneratedModelPanel` UI tests | `tests/ui/editors/ai-generated-model-panel.test.jsx` |
| 8C-7 | Correct Sprint 8C build plan entry and add document history row | `docs/DES_Studio_Build_Plan.md` |

---

## Detailed Implementation

### 8C-1 — Fix `buildModelBuilderSystemPrompt()` Phase A

**File:** `src/llm/model-builder-prompts.js`

**Current state (line 112):**
```
Phase A — Discover: If the user's request is missing genuinely critical structural information... ask AT MOST 2 focused questions in a single turn.
```

**Required change — replace the `=== THREE-PHASE CONVERSATION DISCIPLINE ===` block with:**

```
=== THREE-PHASE CONVERSATION DISCIPLINE ===
Phase A — Discover: Ask ONE question at a time. No fixed cap on questions, but each must be
purposeful — targeted at information that materially affects model structure. Follow this
question order, stopping as soon as you have enough to describe the system:
  1. What flows through the system? (defines customer entity type)
  2. How do they arrive — continuously, in batches, or on a schedule? (drives B-event distribution)
  3. What service stages do they pass through? (maps to queue → activity structure)
  4. How many servers or resources are available at each stage? (server entity count)
  5. How long does each stage typically take, and how variable is it? (service distribution)
  6. Is there any priority ordering, or do customers ever give up waiting? (queue discipline, reneging)
  7. What outcome are you trying to improve? (goals — waiting time, utilisation, throughput)
After each user answer: ask the next question (intent: clarify, questions: ["..."], proposedModel: null),
OR move to Phase B when you can describe the full system without ambiguity.

Phase B — Confirm: When you have enough information, do NOT generate JSON. Respond with:
  intent: "confirm", questions: null, proposedModel: null
  explanation formatted as:
    "Here is my understanding of your system:

    Arrivals: [entity type name] arrive every [value] [time unit] on average ([distribution name] distribution)

    Flow: [stage 1 queue name] → [stage 1 server type, N servers, service distribution] → [stage 2 if present] → exit
    [Reneging: entities abandon after ~[N] [timeUnit] if this was mentioned]

    Queue discipline: [FIFO / PRIORITY / LIFO] at [stage name]

    Goal: [performance target if stated, or 'not specified']

    Does this accurately describe your system? I'll build the model once you confirm."

Phase C — Generate: Triggered only when the user replies affirmatively ("yes", "correct", "looks right",
"go ahead", "build it"). Generate:
  intent: "build", proposedModel: complete model JSON, explanation: 3–5 sentence plain-English summary,
  suggestions: array of exactly 3 short refinement question strings.
Never skip Phase B for a new build request. For refine requests where the change is a simple addition,
Phase B is optional.
After any build or refine response include suggestions[] with 2–3 actionable refinement ideas for this
specific model. Do not include suggestions after clarify or confirm responses.
```

**Also fix `buildModelBuilderUserMessage()` (line 163):**

Remove "ask at most 2 questions" from the instruction string. The full instruction for a new model (no current model) should read:

```
Follow the three-phase conversation discipline from the system prompt. For well-known scenarios
(post office, bank, clinic, call centre) or requests that include enough structural detail, skip
Phase A and go straight to Phase B: return intent: confirm with a plain-English summary. Only use
Phase A (intent: clarify) if critical structure is genuinely ambiguous — and then ask ONE question
at a time. Do NOT generate proposedModel until the user confirms.
```

**Completion checklist:**
- [ ] "AT MOST 2 focused questions" removed from system prompt
- [ ] One-at-a-time, no-cap Phase A instruction present
- [ ] 7-question ordered sequence present
- [ ] Phase B explanation format enforced with the "Here is my understanding" template
- [ ] "ask at most 2 questions" removed from `buildModelBuilderUserMessage`
- [ ] "ask ONE question" present in user message instruction

---

### 8C-2 — Add missing prompt tests

**File:** `tests/llm/model-builder-prompts.test.js`

Add the following six tests inside the existing `describe("model builder prompts", ...)` block:

```js
it("contains PHASE A as a structural marker", () => {
  const prompt = buildModelBuilderSystemPrompt();
  expect(prompt).toMatch(/PHASE A/);
});

it("contains PHASE B as a structural marker", () => {
  const prompt = buildModelBuilderSystemPrompt();
  expect(prompt).toMatch(/PHASE B/);
});

it("contains PHASE C as a structural marker", () => {
  const prompt = buildModelBuilderSystemPrompt();
  expect(prompt).toMatch(/PHASE C/);
});

it("lists confirm as a valid intent value in the system prompt", () => {
  const prompt = buildModelBuilderSystemPrompt();
  expect(prompt).toMatch(/intent.*confirm/i);
});

it("does NOT contain a fixed cap on clarifying questions", () => {
  const prompt = buildModelBuilderSystemPrompt();
  expect(prompt).not.toMatch(/at most 2/i);
  expect(prompt).not.toMatch(/at most two/i);
});

it("specifies suggestions array in response format", () => {
  const prompt = buildModelBuilderSystemPrompt();
  expect(prompt).toMatch(/suggestions/i);
  expect(prompt).toMatch(/refinement/i);
});
```

**Completion checklist:**
- [ ] 6 new tests added and passing
- [ ] All existing tests still pass

---

### 8C-3 — Enhance `SimulationSummaryCard`

**File:** `src/ui/editors/ModelDiffPreview.jsx`

The current `deriveSimulationSummary` function returns `{ entityName, arrivalText, queueText, serverText, experimentText }`. These are displayed as flat rows.

**Required change:** Expand to match the spec's layer structure. Replace `deriveSimulationSummary` and `SimulationSummaryCard` with the following:

**`deriveSimulationSummary` additions:**

1. **WHO ARRIVES** (replace current `arrivalText` with a full sentence):
   - Derive: entity type name, mean inter-arrival, time unit, distribution name
   - Format: `"[entity name] arrive approximately every [mean] time units ([dist] distribution)"`
   - Source: bEvents where effect contains ARRIVE; schedules[0].dist and schedules[0].distParams.mean

2. **HOW THEY FLOW** (new section, replaces simple `queueText`):
   - For each queue: `"→ [queue name] ([discipline]) → [N] [server type] (service: [dist], mean ~[value] time units)"`
   - End with `"→ exit"`
   - Reneging: if any bEvent has RENEGE effect, append: `"Entities who wait more than ~[N] time units without service will leave"`
   - Derive server and service distribution by matching queue.customerType → ASSIGN C-event → cSchedule dist
   - Fallback to "service time not specified" if no matching C-event

3. **RESOURCES** (rename `serverText` to individual lines):
   - For each server entity type: `"[name]: [count] available"`

4. **GOALS** (new section):
   - Source: `proposedModel.goals` or `proposedModel.experimentDefaults.goals` array
   - If present and non-empty, render each goal's metric and target
   - If absent, omit section entirely

5. **EXPERIMENT SETTINGS** (keep current `experimentText` format)

**`SimulationSummaryCard` layout:**

Render sections in this order with labelled rows:
- WHO ARRIVES (if arrivalText)
- HOW THEY FLOW (if flowLines.length)
- RESOURCES (if resourceLines.length)
- EXPERIMENT (if experimentText)
- GOALS (if goals.length)

Each section has a small heading label in muted text, then content below.

**Completion checklist:**
- [ ] WHO ARRIVES renders as a full sentence with entity name, mean, and distribution
- [ ] HOW THEY FLOW renders per-stage flow path
- [ ] Reneging annotation appears when a RENEGE B-event exists
- [ ] RESOURCES renders per-server-type with count
- [ ] GOALS section appears when goals are present and is absent when not
- [ ] EXPERIMENT SETTINGS unchanged
- [ ] Existing tests still pass

---

### 8C-4 — Add missing `ModelDiffPreview` tests

**File:** `tests/ui/editors/model-diff-preview.test.jsx`

Add the following three tests:

```js
it("renders WHO ARRIVES sentence with entity name and distribution", () => {
  const proposed = {
    entityTypes: [{ id: "cust", name: "Patient", role: "customer", attrDefs: [] }],
    stateVariables: [],
    bEvents: [{
      id: "arrive",
      name: "Patient Arrival",
      scheduledTime: "0",
      effect: "ARRIVE(Patient, Waiting)",
      schedules: [{ eventId: "arrive", dist: "Exponential", distParams: { mean: "8" } }],
    }],
    cEvents: [],
    queues: [{ id: "q", name: "Waiting Room", discipline: "FIFO" }],
  };

  render(<ModelDiffPreview currentModel={baseModel} proposedModel={proposed} onApply={vi.fn()} onDiscard={vi.fn()} />);

  expect(screen.getByText(/patient.*arrive.*8.*exponential/i)).toBeInTheDocument();
});

it("omits llmExplanation element when prop is null", () => {
  const proposed = { ...baseModel };

  render(
    <ModelDiffPreview
      currentModel={baseModel}
      proposedModel={proposed}
      onApply={vi.fn()}
      onDiscard={vi.fn()}
      llmExplanation={null}
    />
  );

  expect(screen.queryByText(/simple post office/i)).not.toBeInTheDocument();
});

it("renders RESOURCES section with per-server count", () => {
  const proposed = {
    ...baseModel,
    entityTypes: [
      { id: "cust", name: "Customer", role: "customer", attrDefs: [] },
      { id: "srv", name: "Clerk", role: "server", count: 3, attrDefs: [] },
    ],
  };

  render(<ModelDiffPreview currentModel={baseModel} proposedModel={proposed} onApply={vi.fn()} onDiscard={vi.fn()} />);

  expect(screen.getByText(/Clerk.*3|3.*Clerk/i)).toBeInTheDocument();
});
```

**Completion checklist:**
- [ ] 3 new tests added and passing
- [ ] All existing tests still pass

---

### 8C-5 — Fix refinement chip styling

**File:** `src/ui/editors/AiGeneratedModelPanel.jsx`

**Current `RefinementChips` button style:**
```js
background: C.surface,
border: `1px solid ${C.border}`,
borderRadius: 20,
```

**Required style:**
```js
background: "transparent",
border: `1px solid ${C.accent}`,
borderRadius: 999,
```

**Hover state:** Add via `onMouseEnter`/`onMouseLeave` React state or via a small inline style toggle:
```js
const [hovered, setHovered] = useState(null);
// Per button:
onMouseEnter={() => setHovered(index)}
onMouseLeave={() => setHovered(null)}
style={{
  ...,
  background: hovered === index ? C.accent : "transparent",
  color: hovered === index ? C.bg : C.accent,
}}
```

**Completion checklist:**
- [ ] Border colour updated to `C.accent`
- [ ] Background updated to `"transparent"`
- [ ] `borderRadius` updated to `999`
- [ ] Hover: background fills to `C.accent`, text changes to `C.bg`

---

### 8C-6 — Add missing `AiGeneratedModelPanel` tests

**File:** `tests/ui/editors/ai-generated-model-panel.test.jsx`

Add the following two tests inside the `describe("F8C.4 — proactive refinement chips", ...)` block:

```js
it("renders no chips after a confirm response", async () => {
  mockCallModelBuilder.mockResolvedValue({
    intent: "confirm",
    explanation: "I will build a post office.",
    proposedModel: null,
    suggestions: ["Add a second clerk"],
  });

  render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build it" } });
  fireEvent.click(screen.getByRole("button", { name: /send/i }));

  await waitFor(() => expect(screen.getByLabelText(/model confirmation/i)).toBeInTheDocument());
  expect(screen.queryByText(/Add a second clerk/i)).not.toBeInTheDocument();
});

it("renders a single chip when suggestions array has 1 item", async () => {
  mockCallModelBuilder.mockResolvedValue({
    intent: "build",
    explanation: "Built a model.",
    proposedModel: { ...model },
    suggestions: ["Only one suggestion"],
  });

  render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build" } });
  fireEvent.click(screen.getByRole("button", { name: /send/i }));

  await waitFor(() => expect(screen.getByText(/Only one suggestion/i)).toBeInTheDocument());
  expect(screen.getAllByRole("button").filter(b => b.textContent === "Only one suggestion")).toHaveLength(1);
});
```

**Completion checklist:**
- [ ] 2 new tests added and passing
- [ ] All existing tests still pass

---

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-1 | System prompt instructs LLM to ask ONE question at a time with no cap |
| AC-2 | System prompt includes 7-question ordered Phase A sequence |
| AC-3 | System prompt enforces the "Here is my understanding" Phase B format |
| AC-4 | `buildModelBuilderUserMessage` does not contain "at most 2 questions" |
| AC-5 | `SimulationSummaryCard` renders WHO ARRIVES as a full sentence |
| AC-6 | `SimulationSummaryCard` renders HOW THEY FLOW with per-stage detail |
| AC-7 | `SimulationSummaryCard` renders RESOURCES per server type with count |
| AC-8 | `SimulationSummaryCard` renders GOALS when present; omits section when absent |
| AC-9 | Refinement chips use `C.accent` border, transparent background, and fill on hover |
| AC-10 | All 6 prompt tests pass (PHASE A/B/C markers, confirm intent, no cap, suggestions[]) |
| AC-11 | All 3 ModelDiffPreview tests pass (WHO ARRIVES sentence, null llmExplanation, resources) |
| AC-12 | All 2 AiGeneratedModelPanel tests pass (no chips on confirm, single chip) |
| AC-13 | All existing tests continue to pass |

---

## Exit Gate

```bash
# 1. Full test suite
npm test -- --run
# Expected: zero failures

# 2. Prompt tests — must confirm Phase A/B/C markers and no cap
npm test -- llm

# 3. UI tests — confirm all F8C assertions
npm test -- ui/editors

# 4. Production build
npm run build
```

### Manual verification

```
1. Open a blank model → AI Generator tab
2. Type: "I want to model a busy GP surgery"
3. Verify: LLM asks exactly ONE question (not a list)
4. Answer each question in turn
5. Verify: after a few questions the LLM sends a confirmation bubble
   (teal-bordered, "Here is my understanding of your system:" header)
6. Verify confirmation bubble shows: Arrivals / Flow / Queue discipline / Goal
7. Click "Looks right — build it"
8. Verify outcome card shows WHO ARRIVES sentence, HOW THEY FLOW detail, RESOURCES per server
9. Verify 3 refinement chips appear with accent-coloured pill styling
10. Hover a chip — verify background fills with accent colour
11. Click a chip — verify it submits and all chips disappear
12. Click "Refine this" — verify textarea is focused
13. Click "Apply model" — verify model loads correctly
```

---

## Files to Change

| File | Change |
|------|--------|
| `src/llm/model-builder-prompts.js` | Remove 2-question cap; add 7-question sequence; enforce Phase B format; fix user message instruction |
| `src/ui/editors/ModelDiffPreview.jsx` | Expand `SimulationSummaryCard` with WHO ARRIVES, HOW THEY FLOW, RESOURCES, GOALS |
| `src/ui/editors/AiGeneratedModelPanel.jsx` | Fix chip border, background, border-radius, hover state |
| `tests/llm/model-builder-prompts.test.js` | Add 6 prompt tests |
| `tests/ui/editors/model-diff-preview.test.jsx` | Add 3 simulation summary card tests |
| `tests/ui/editors/ai-generated-model-panel.test.jsx` | Add 2 chip edge-case tests |
| `docs/DES_Studio_Build_Plan.md` | Correct Sprint 8C status; add document history entry |

---

## Out of Scope

- Engine, schema, or simulation changes
- New npm dependencies
- Rework of F8C.2 (ConfirmBubble — already correctly implemented)
- Rework of F8C.5 (documentation — already correctly written to spec)
- Any Sprint 67 work

---

*Plan written: 2026-05-22*
*Based on: code review of `src/llm/model-builder-prompts.js`, `src/ui/editors/AiGeneratedModelPanel.jsx`, `src/ui/editors/ModelDiffPreview.jsx`, and all three test files against `docs/reviews/sprint-8C-ai-generator-conversational-quality.md`*
