# Sprint 69 Plan — UI–Engine Capability Parity

**Sprint:** 69
**Theme:** Surface engine-only capabilities in the UI and AI assistant
**Date planned:** 2026-05-21
**Branch:** `main`

---

## Objectives

1. Expose the SPT, EDD, and PRIORITY(attrName) queue disciplines in the UI — they are implemented in the engine but invisible to modellers
2. Give COSEIZE and MATCH structured editor forms — the only two macros with zero UI presence
3. Sync the AI model-builder prompt macro lists with the actual engine capability so the AI can generate models using FILL, DRAIN, and RENEGE_OLDEST

---

## Background

A capability audit (2026-05-21) found three categories of engine–UI gap:

| Gap | Impact |
|-----|--------|
| SPT, EDD, PRIORITY(attrName) not in discipline dropdown | Modellers cannot set these disciplines without hand-editing raw JSON |
| COSEIZE and MATCH have no UI entry point | No discovery, no syntax help, no validation — these are the only two macros that are fully invisible |
| FILL, DRAIN, RENEGE_OLDEST absent from AI prompt macro lists | AI model builder cannot generate models that use containers or queue-eviction patterns |

This sprint delivers the UI-Capability Parity Rule (AGENTS.md §3b) for these specific gaps.

---

## Design Principles

| Principle | Rationale |
|-----------|-----------|
| Structured forms over free text | COSEIZE and MATCH need multi-argument structured entry — a single free-text line is error-prone |
| Discipline dropdown shows only what the engine honours | SPT/EDD/PRIORITY(attrName) are confirmed implemented; adding them is safe |
| Prompt list is the authoritative source for AI generation | model-builder-prompts.js must match the engine, not lag it |
| Plain-English first | Follow §7.11 — label actions in plain English with technical syntax in helper text |

---

## Scope

| # | Item | Area | Files |
|---|------|------|-------|
| 69-1 | Queue discipline dropdown — add SPT, EDD, PRIORITY(attrName) | UI | `src/ui/editors/QueueEditor.jsx`, `src/ui/visual-designer/VisualNodeInspector.jsx` |
| 69-2 | COSEIZE structured form in CEventEditor | UI | `src/ui/editors/CEventEditor.jsx`, `src/ui/editors/helpers.jsx` |
| 69-3 | MATCH structured form in CEventEditor | UI | `src/ui/editors/CEventEditor.jsx`, `src/ui/editors/helpers.jsx` |
| 69-4 | AI macro list sync — add FILL, DRAIN, RENEGE_OLDEST | AI | `src/llm/model-builder-prompts.js` |
| 69-5 | Tests — discipline rendering, COSEIZE/MATCH form, AI list | Tests | `tests/ui/editors/`, `tests/llm/` |
| 69-6 | Full regression — all tests pass, build succeeds | CI | — |
| 69-7 | Documentation — AGENTS.md, User Guide, model-schema-for-llm.md | Docs | `AGENTS.md`, `docs/DES_Studio_User_Guide.md`, `docs/model-schema-for-llm.md` |

---

## Detailed Design

### 69-1: Queue Discipline Dropdown Expansion

**Files:** `src/ui/editors/QueueEditor.jsx` (lines 68–74), `src/ui/visual-designer/VisualNodeInspector.jsx` (lines 103–107)

Add three new `<option>` entries to both discipline dropdowns:

```jsx
<option value="FIFO">FIFO — first in, first out</option>
<option value="LIFO">LIFO — last in, first out</option>
<option value="Priority">Priority — lowest number served first</option>
<option value="SPT">SPT — shortest job first</option>
<option value="EDD">EDD — earliest due date first</option>
<option value="PRIORITY(attrName)">Custom priority attribute</option>
```

For `PRIORITY(attrName)`: when this option is selected, show an additional text input labelled **"Priority attribute name"** where the modeller enters the attribute name. The editor writes `PRIORITY(attrName)` into the discipline field using the typed value.

Helper text per discipline (shown below the dropdown when selected):

| Discipline | Helper text |
|---|---|
| SPT | Serves the entity with the shortest expected processing time first. Requires a `serviceTime` attribute on the entity type. |
| EDD | Serves the entity with the earliest due date first. Requires a `dueDate` attribute on the entity type. |
| PRIORITY(attrName) | Serves the entity with the lowest value of the named attribute first. Attribute must be type `number`. |

**Validation:** If SPT or EDD is selected but the entity type has no matching attribute (`serviceTime` or `dueDate` respectively), surface a V4-style warning on save. Do not block the run — the engine handles the fallback — but make the missing attribute visible.

---

### 69-2: COSEIZE Structured Form

**Context:** COSEIZE atomically seizes one customer from a queue and multiple server types simultaneously. It is the correct macro for scenarios like surgical suites (operating room + anaesthetist + surgeon). Its syntax is:

```
COSEIZE(QueueName, ServerType1, ServerType2, ...)
```

**UI placement:** In `CEventEditor.jsx`, when the effect macro is set to `COSEIZE`, replace the free-text effect field with a structured form.

**Form layout:**

```
Customer queue:    [ dropdown — all defined queues ]

Servers to seize:
  [ dropdown — server entity types ]  [ ✕ remove ]
  [ dropdown — server entity types ]  [ ✕ remove ]
  [ + Add server ]

↓ generated effect (read-only preview):
  COSEIZE(QueueName, Nurse, Surgeon)
```

**Rules:**
- Minimum 1 server type (COSEIZE requires at least one)
- Server types must be unique within the list (no duplicate seizure)
- The effect string is generated from the form and written to `b.effect` — modellers never type it
- The form reads `entityTypes.filter(et => et.role === 'server')` to populate server dropdowns

**cSchedules:** COSEIZE, like ASSIGN, schedules B-events for service completion. The existing cSchedules UI (rows with B-event selector + DistPicker) applies unchanged.

---

### 69-3: MATCH Structured Form

**Context:** MATCH pairs one entity from each of two queues into a combined batch in a target queue. Its syntax is:

```
MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue)
```

**UI placement:** In `CEventEditor.jsx`, when the effect macro is `MATCH`, replace the free-text field with a structured form.

**Form layout:**

```
First party:
  Entity type:  [ dropdown — customer entity types ]
  From queue:   [ dropdown — queues matching selected type ]

Second party:
  Entity type:  [ dropdown — customer entity types ]
  From queue:   [ dropdown — queues matching selected type ]

Paired entities go to:
  [ dropdown — all defined queues ]

↓ generated effect (read-only preview):
  MATCH(Order, OrderQueue, Item, ItemQueue, PairingQueue)
```

**Rules:**
- TypeA and TypeB must be different entity types
- QueueA and QueueB must be different queues
- TargetQueue can be any defined queue (including QueueA or QueueB)
- The condition for a MATCH C-event should have `queue(QueueA).length > 0 AND queue(QueueB).length > 0` — the form can suggest this automatically when the effect is set

---

### 69-4: AI Macro List Sync

**File:** `src/llm/model-builder-prompts.js` (lines 2–4)

Current state:
```javascript
const B_EVENT_MACROS = ["ARRIVE", "ASSIGN", "COMPLETE", "RELEASE", "RENEGE", "UNBATCH",
  "PREEMPT", "FAIL", "REPAIR", "SPLIT", "SET", "SET_ATTR", "COST"];
const C_EVENT_MACROS = ["ASSIGN", "BATCH", "COSEIZE", "MATCH", "SET", "SET_ATTR", "COST"];
```

Updated state:
```javascript
const B_EVENT_MACROS = ["ARRIVE", "ASSIGN", "COMPLETE", "RELEASE", "RENEGE", "UNBATCH",
  "PREEMPT", "FAIL", "REPAIR", "SPLIT", "SET", "SET_ATTR", "COST",
  "FILL", "DRAIN", "RENEGE_OLDEST"];
const C_EVENT_MACROS = ["ASSIGN", "BATCH", "COSEIZE", "MATCH", "SET", "SET_ATTR", "COST",
  "FILL", "DRAIN"];
```

Add descriptions for the three new B-event macros in the `=== ADVANCED MACROS ===` section of `buildModelBuilderSystemPrompt()`:

```
"FILL(containerId, amount) — Add amount to a declared container level. Container must be in containerTypes. Use for inventory restocking, tank filling, buffer replenishment.",
"DRAIN(containerId, amount) — Remove amount from a container level. Guard: level must be >= amount (no-op if insufficient). Use for consumption, withdrawal, discharge.",
"RENEGE_OLDEST(EntityType) — Remove the oldest waiting entity of a given type from its queue. Use to enforce queue-length caps or eviction policies.",
```

Also add a container types instruction to the system prompt (alongside the existing entity types rule):

```
"Container types: id (used in FILL/DRAIN macros), capacity (optional, > 0), initialLevel (optional, >= 0). Declare in model containerTypes[] when using FILL or DRAIN.",
```

---

### 69-5: Tests

**Queue discipline tests** (`tests/ui/editors/QueueEditor.test.jsx`):
- SPT, EDD, PRIORITY(attrName) appear in discipline dropdown
- Selecting PRIORITY(attrName) reveals the attribute name input
- Effect string is written as `PRIORITY(myAttr)` when attribute name is `myAttr`
- Helper text renders for each new discipline

**COSEIZE form tests** (`tests/ui/editors/CEventEditor.test.jsx`):
- Selecting COSEIZE effect replaces free-text with structured form
- Server dropdown is populated from server entity types only
- Adding a second server type adds a new row
- Generated effect string matches `COSEIZE(Queue, Srv1, Srv2)`
- Removing a server type updates the preview

**MATCH form tests** (`tests/ui/editors/CEventEditor.test.jsx`):
- Selecting MATCH effect renders the two-party form
- TypeA and TypeB dropdowns are populated with customer entity types
- Queue dropdowns filter to queues matching the selected entity type
- Generated effect string matches `MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue)`

**AI prompt tests** (`tests/llm/model-builder-prompts.test.js`):
- `B_EVENT_MACROS` includes FILL, DRAIN, RENEGE_OLDEST
- `C_EVENT_MACROS` includes FILL, DRAIN
- System prompt includes container types instruction
- System prompt includes FILL, DRAIN, RENEGE_OLDEST in advanced macro section

---

### 69-6: Regression

- `npm test` — all existing tests pass
- `npm run build` — production build succeeds
- Visual check: QueueEditor discipline dropdown renders all six options
- Visual check: COSEIZE form generates correct effect string
- Visual check: MATCH form generates correct effect string

---

### 69-7: Documentation

**`AGENTS.md` §6 — Queue Discipline Rules**

Add SPT, EDD, and PRIORITY(attrName) to the discipline table and remove the "current state" note that marks LIFO and PRIORITY as unimplemented (they are implemented).

Updated table:

| Discipline | Entity Selection Rule | Tiebreaker | UI Exposed |
|---|---|---|---|
| `FIFO` | Smallest `arrivalTime` | — | Yes |
| `LIFO` | Largest `arrivalTime` | — | Yes |
| `PRIORITY` | Smallest `Entity.priority` value | FIFO | Yes |
| `SPT` | Smallest `serviceTime` attribute value | FIFO | Yes (Sprint 69) |
| `EDD` | Smallest `dueDate` attribute value | FIFO | Yes (Sprint 69) |
| `PRIORITY(attrName)` | Smallest value of named attribute | FIFO | Yes (Sprint 69) |

**`AGENTS.md` §3b — UI-Capability Parity Rule**

Add COSEIZE and MATCH to the confirmed-parity list. Remove them from any "engine-only" notes.

**`docs/DES_Studio_User_Guide.md`**

Add a new section: **Advanced Queue Disciplines**

Cover SPT, EDD, and PRIORITY(attrName) with:
- Plain-English explanation of when each is useful
- What attribute the entity type must carry
- A worked example for each (e.g. EDD for deadline-driven production, SPT for throughput maximisation)

Add a new section: **Multi-Resource Seizure (COSEIZE)**

Cover:
- What COSEIZE does in plain English ("Reserve a team of resources at the same time")
- When to use it (surgical suites, multi-skill workstations, crew dispatch)
- How to configure it via the new form
- What happens if one of the resources is unavailable (clean failure, entity stays in queue)

Add a new section: **Entity Pairing (MATCH)**

Cover:
- What MATCH does ("Join two types of entity — one from each queue — into a pair")
- When to use it (order + inventory matching, two-party scheduling)
- How to configure it via the new form

**`docs/model-schema-for-llm.md`**

Already updated in the preceding session to include SPT, EDD, PRIORITY(attrName) in §3, COSEIZE and MATCH in §6, and FILL/DRAIN in the AI prompt guidance. No further changes required this sprint.

---

## Implementation Guardrails

- Do not change how the engine resolves discipline values — it already handles SPT, EDD, PRIORITY(attrName) correctly
- Do not introduce free-text effect fields for COSEIZE or MATCH — the structured form is the only entry point
- COSEIZE and MATCH remain valid as free-text if typed directly (the macro engine accepts them) — the form generates valid syntax, it does not gate the engine
- Do not modify the existing ASSIGN structured form — COSEIZE and MATCH are separate macro selections
- FILL and DRAIN can remain in both B-event and C-event effect dropdowns; the engine accepts both phases
- Follow §7.10 and §7.11 UI rules throughout — inline styles from tokens.js, plain-English labels

---

## Exit Gate

- All new and existing tests pass (`npm test`)
- Production build succeeds (`npm run build`)
- SPT, EDD, PRIORITY(attrName) selectable in QueueEditor and VisualNodeInspector
- COSEIZE form generates correct effect string and is validated on save
- MATCH form generates correct effect string and is validated on save
- `B_EVENT_MACROS` and `C_EVENT_MACROS` in model-builder-prompts.js include FILL, DRAIN, RENEGE_OLDEST
- AGENTS.md §6 queue discipline table updated
- User Guide sections added for advanced disciplines, COSEIZE, and MATCH
