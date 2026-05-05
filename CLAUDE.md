# DES Studio — CLAUDE.md
*Architectural contract for all Claude Code sessions. Read this file in full before writing any code.*
*Last updated: 2026-05-05 | Reflects: Sprint 9A visual designer preflight + ADR-010 + Known Issues*

---

## 1. Project Purpose

DES Studio is a browser-based discrete-event simulation (DES) modelling tool implementing **Pidd's Three-Phase Method (A/B/C)**. Modellers define entity types, queues, B-Events, and C-Events using structured editors, run single or parallel replications, and view results in real time.

The tool is backed by Supabase for authentication, model storage, and run history.

**Target user:** A simulation modeller who understands DES concepts. The UI must never require them to write code or logic strings — all model logic is built through structured pickers and the Predicate Builder.

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Frontend framework | React | 18.3.1 | Functional components only. No class components. |
| Build tool | Vite | 5.4.0 | ESM throughout |
| Language | JavaScript (JSX) + incremental TypeScript | — | Existing JS/JSX remains valid. TypeScript is allowed for domain/schema boundaries under ADR-009. No linter currently installed. |
| Styling | Inline style objects | — | No CSS classes. No CSS framework. Tokens in `ui/shared/tokens.js` |
| Database / auth | Supabase JS client | 2.45.0 | PostgreSQL backend. Auth via Supabase Auth. |
| Test runner | Vitest | 1.6.0 | Engine layer only. Node environment. |
| Canvas / DAG | Form-based editors | — | ADR-010 accepts `@xyflow/react`; visual canvas implementation starts in Sprint 9. |

**Do not introduce new dependencies without flagging them first.** The dependency list is intentionally minimal.

---

## 3. Repository Structure

```
project root
├── CLAUDE.md                        ← this file
├── docs/
│   ├── addition1_entity_model.md   ← READ for Sprints 1–3 (entity schema, macros, distributions)
│   └── decisions/                  ← Architectural Decision Records (ADRs)
│       └── ADR-001-auth-model.md   ← Multi-user auth and public model rules
├── src/
│   ├── engine/                      ← Pure JS Three-Phase DES engine. No React. No DOM.
│   │   ├── index.js                 ← Main loop: Phase A, B, C
│   │   ├── phases.js                ← fireBEvent(), fireCEvent()
│   │   ├── entities.js              ← Entity pool, queue discipline, waitingOf()
│   │   ├── distributions.js         ← Sampler functions
│   │   ├── conditions.js            ← Condition evaluator (currently uses new Function — MUST BE REPLACED)
│   │   └── macros.js                ← ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE
│   ├── ui/
│   │   ├── editors/                 ← EntityTypeEditor, BEventEditor, CEventEditor, QueueEditor
│   │   │   └── index.jsx
│   │   ├── execute/                 ← Run panel, VisualView, StepLog, EntityTable
│   │   │   └── index.jsx
│   │   └── shared/
│   │       ├── tokens.js            ← Style tokens (colours, spacing, typography)
│   │       └── components.jsx       ← Shared UI components (DistPicker — has latent bug, see §9)
│   ├── db/
│   │   ├── models.js                ← Supabase CRUD wrappers
│   │   └── supabase.js              ← Client singleton
│   └── App.jsx                      ← Auth listener + model library shell only. No sim logic.
├── tests/                           ← All tests. Mirrors src/ structure.
│   ├── engine/                      ← Engine unit tests (~120 existing + new)
│   │   ├── three-phase.test.js      ← Phase A/B/C, restart rule (node env)
│   │   ├── distributions.test.js    ← Samplers, seeded RNG reproducibility
│   │   ├── macros.test.js           ← ARRIVE, SEIZE, COMPLETE, ASSIGN, RENEGE
│   │   ├── conditions.test.js       ← Safe evaluator, all operator types
│   │   ├── entities.test.js         ← Queue disciplines: FIFO, LIFO, PRIORITY
│   │   └── mm1_benchmark.js         ← M/M/1 correctness gate (run manually)
│   ├── ui/                          ← UI tests (jsdom env — Sprint 2 onwards)
│   │   ├── editors/                 ← One file per editor component
│   │   ├── execute/                 ← Execute panel tests
│   │   └── shared/                  ← Predicate Builder, DistPicker tests
│   ├── db/                          ← DB wrapper tests (mocked Supabase — Sprint 3)
│   │   └── models.test.js
│   └── setup.js                     ← Global setup: jsdom config, Supabase mock
└── .env.local                       ← Not committed. See §7 for required vars.
```

**Architecture rules that must never be violated:**
- `src/engine/` has zero React imports and zero DOM access. It is pure JavaScript.
- `src/ui/` components never import engine internals directly, except `buildEngine()` which is called only from `execute/index.jsx`.
- All Supabase access goes through `src/db/models.js` or `src/db/supabase.js`. Never query Supabase directly from a UI component.
- `tokens.js` is the single source of truth for all colours, spacing, and font sizes. Never hardcode style values.
- TypeScript is permitted incrementally for shared contracts and low-risk modules. Do not start a broad conversion without an explicit migration task.

---

## 3a. Build-On Rule — Read Before Changing

This project has an **existing working application**. Claude Code must never rewrite a working component from scratch. The correct approach for every task is:

1. **READ** the target file and show the relevant current code
2. **IDENTIFY** what already works and must be preserved
3. **EXTEND or FIX** only what the audit says is wrong
4. **CONFIRM** the change is minimal — not a rewrite

If Claude Code finds itself rewriting a file that the audit marked as working (✓), stop and flag it. The correct action is always extension or targeted fix.

**Working components that must not be replaced — only extended:**

| File | What works | What is wrong |
|---|---|---|
| `src/engine/index.js` | Three-Phase A/B/C loop structure | C-scan restart granularity (fix in place) |
| `src/engine/macros.js` | All five macros correct | Nothing — preserve entirely |
| `src/engine/entities.js` | FIFO discipline correct | LIFO/Priority never read (extend waitingOf) |
| `src/engine/conditions.js` | Condition evaluation structure | new Function() call (replace with safe eval) |
| `src/engine/distributions.js` | All sampler functions | Math.random() (add seeded RNG) |
| `src/ui/editors/index.jsx` | All five editors work | Operator filtering, priority field, token staleness |
| `src/ui/execute/index.jsx` | VisualView, StepLog, EntityTable, run history | No validation, no seed field, silent truncation |
| `src/db/models.js` | Multi-user CRUD wrappers | User-scoped model/run queries, run stats, result persistence, owner-guarded delete |
| `src/App.jsx` | Auth listener, model library shell | Back button discards silently (Sprint 2) |
| `tests/` | ~120 engine tests passing | UI and DB layers untested |

---

## 4. Three-Phase Method — Mandatory Implementation Rules

This is the most critical section. Every engine change must be validated against these rules.

### 4.1 The Required Loop Structure

```javascript
// CORRECT Three-Phase loop — this is the law
while (fel.length > 0 && !terminationConditionMet()) {

  // PHASE A — Clock advance
  const T_now = fel[0].scheduledTime;

  // PHASE B — Fire all B-Events at T_now (deterministic)
  const bEventsNow = fel.filter(e => Math.abs(e.scheduledTime - T_now) < 1e-9);
  for (const bEvent of bEventsNow) {
    removeFEL(bEvent);
    fireBEvent(bEvent, state);
  }

  // PHASE C — Iterative conditional scan with restart rule
  let cFired = true;
  let passCount = 0;
  while (cFired) {
    cFired = false;
    passCount++;
    if (passCount > MAX_C_PASSES) {
      logWarning('Phase C truncated after ' + MAX_C_PASSES + ' passes');
      break;  // ← must surface warning to UI, not silently discard
    }
    for (const cEvent of sortedByPriority(cEvents)) {
      if (conditionIsTrue(cEvent, state)) {
        fireCEvent(cEvent, state);
        cFired = true;
        break;  // ← RESTART from top of for-loop — THIS IS THE RESTART RULE
      }
    }
  }
}
```

### 4.2 Rules That Must Never Be Violated

- **The restart rule is non-negotiable.** When a C-Event fires, the scan must `break` and restart from Priority 1. Completing the full C-Event list before restarting is incorrect and produces priority inversion.
- **Phase C truncation must be visible.** When `MAX_C_PASSES` is hit, a warning banner must appear in the UI and a log entry must be written. Silent truncation is a correctness bug. The cap is currently 100 — raise to 500 and make it configurable.
- **Phase B fires all events at `T_now`.** Use floating-point tolerance `< 1e-9` when comparing scheduled times. Do not advance the clock mid-Phase-B.
- **The FEL is sorted at all times.** New B-Events are inserted in scheduled-time order. Never append to the end.
- **The engine is stateless between calls.** `buildEngine(model, seed, maxCycles)` constructs a fresh state object. No module-level mutable state.

### 4.3 C-Event Priority

- Priority is an explicit integer field on each C-Event, set by the modeller in the editor.
- Lower integer = higher priority. Priority 1 fires before Priority 2.
- Priority must be displayed and editable in the UI — the current implicit array-order approach is not acceptable.
- Drag-to-reorder is the target UX for priority assignment.

---

## 5. Entity & Action Vocabulary

**Full specification:** `docs/addition1_entity_model.md` — read this before any Sprint 1–3 work.

### 5.1 The Five Permitted Macros

| Macro | Phase | Purpose |
|---|---|---|
| `ARRIVE` | B-Event | Creates entity, places in queue, schedules next arrival |
| `SEIZE` | C-Event | Removes entity from queue, assigns to resource, schedules COMPLETE |
| `COMPLETE` | B-Event | Releases resource, records stats, routes entity to next node |
| `ASSIGN` | B or C | Modifies a mutable entity attribute or user-defined state variable |
| `RENEGE` | B-Event | Removes entity from queue after patience timeout, routes to Sink |

**These five macros are the complete and closed set.** No other macros may be added without updating `docs/addition1_entity_model.md` first.

### 5.1a Sprint 8B — Model Definition Coherence Rules

The modeller-facing UI must describe actions in DES language, not as raw macro programming. Macro strings may remain the current internal representation, but dropdowns and AI proposal summaries should use clear labels such as:

- `Add Patient to Triage Queue` for internal `ARRIVE(Patient, Triage Queue)`
- `Start Triage with Triage Nurse` for internal `ASSIGN(Triage Queue, Triage Nurse)`
- `Schedule Triage Complete` for C-event follow-on schedules
- `Complete Patient Journey` or `Finish Service` for internal `COMPLETE()`

Rules:

- Prefer explicit `ARRIVE(CustomerType, QueueName)` over legacy `ARRIVE(CustomerType)` in all new UI and AI-generated models.
- Queue names may contain spaces. Engine macros, condition evaluation, validation, and dropdown-generated values must support names such as `Triage Queue`.
- Each queue should declare the customer/entity type it accepts via `customerType`; ARRIVE dropdown options must respect that binding.
- A service-start C-event must have both a queue-availability condition and a server-availability condition: `queue(QueueName).length > 0 AND idle(ServerType).count > 0`.
- A service-start C-event must assign from the queue or customer to the server and schedule a follow-on completion B-event.
- `COMPLETE()` is a Phase B follow-on event that completes the currently scheduled customer/server service context. It should not be placed in the initial FEL for normal service completion.
- Never expose the word `template` to users for follow-on completion or reneging B-events. Use `scheduled follow-on` where a category label is needed.
- Multi-stage routing is a first-class modelling requirement. Sprint 8B must establish a tested two-stage reference model before visual designer work proceeds.

### 5.2 Prohibited Action Patterns

```javascript
// PROHIBITED — any of these in conditions.js, macros.js, or any editor
new Function(effectString)()   // XSS risk — audit finding C1
eval(effectString)             // XSS risk
Function(effectString)()       // XSS risk — any variant

// The 'Custom...' option in DropField feeds new Function() — REMOVE IT ENTIRELY
// Do not recreate a free-text escape hatch under any name
```

### 5.3 Condition Evaluation

All conditions are evaluated by a **safe expression evaluator** — never by `new Function()` or `eval()`. The evaluator receives a parsed predicate JSON object (as defined in `docs/addition1_entity_model.md` Section 4) and resolves variable references against the live simulation state object.

```javascript
// CORRECT — safe evaluator pattern
function evaluateCondition(predicate, state) {
  const value = resolveVariable(predicate.variable, state); // dot-notation lookup
  return applyOperator(value, predicate.operator, predicate.value);
}

// NEVER pass strings to execution
function evaluateCondition(conditionString, state) {
  return new Function('state', conditionString)(state); // PROHIBITED
}
```

---

## 6. Queue Discipline Rules

Queue discipline is enforced **in the engine** on every SEIZE call. It is not a UI-only configuration.

| Discipline | Entity Selection Rule | Tiebreaker |
|---|---|---|
| `FIFO` | Smallest `arrivalTime` among candidates | — |
| `LIFO` | Largest `arrivalTime` among candidates | — |
| `PRIORITY` | Smallest `Entity.priority` attribute value | FIFO on equal priority |

**Current state (audit finding C2):** The engine ignores `q.discipline` entirely. `waitingOf()` in `entities.js` always sorts by `arrivalTime` ascending (FIFO). LIFO and PRIORITY must be implemented before either option appears in the UI.

**Rule:** If LIFO or PRIORITY is not yet implemented, remove it from the `QueueEditor` dropdown. Never show a UI option that the engine does not honour.

---

## 7. Model Definition UI

The model editor is the primary surface through which modellers interact with DES Studio. It is a **tab-based, form-driven interface** — not a visual DAG canvas (that is a future sprint). Every element of a simulation model is defined through dedicated editor components, each with its own create / update / delete workflow.

This section documents what exists, the rules for working on each editor, and the target state for editors that are incomplete.

### 7.1 Editor Architecture

All editors live in `src/ui/editors/index.jsx`. They are tab-based panels within the `ModelDetail` view. Each editor is responsible for one model element type and follows the same structural pattern:

```
ModelDetail (parent)
├── Tab: Entity Types    → EntityTypeEditor + AttrEditor
├── Tab: State Variables → StateVarEditor
├── Tab: B-Events        → BEventEditor
├── Tab: C-Events        → CEventEditor + ConditionBuilder
├── Tab: Queues          → QueueEditor
└── Tab: Execute         → execute/index.jsx (run panel)
```

**Editor rules that apply to all tabs:**

- Every editor reads from and writes to `model_json` in Supabase via `src/db/models.js`. No editor stores local-only state that is not persisted.
- Save is currently manual — the modeller clicks Save. The UI shows a `saveStatus` banner (saving / saved / error). This must be preserved; do not remove the banner.
- The Back button currently discards unsaved changes silently. This is a known defect — it must warn the user before navigating away. Do not add new navigation without this guard.
- Inline validation on save is absent — empty names, blank conditions, and malformed schedules are accepted silently. All editors must be updated to validate before persisting (see Section 8, validation rules V1–V11).
- No editor may introduce a free-text field for simulation logic. All logic entry uses structured pickers and the Predicate Builder only.

### 7.2 Entity Type Editor (`EntityTypeEditor` + `AttrEditor`)

**What exists:** Working. Modellers can define entity classes with typed attributes. The `AttrEditor` sub-component handles individual attribute rows.

**What it must do:**
- Allow the modeller to create, rename, and delete Entity Classes.
- For each Entity Class, allow the modeller to add, edit, and remove attributes.
- Each attribute must have: name (string, unique within class), valueType (number | string | boolean), defaultValue (must match valueType), optional allowedValues list (string only), mutable flag (boolean).
- Deleting an Entity Class that is referenced by a C-Event condition or entity filter must warn the modeller that dependent conditions will become invalid, and must trigger re-validation.

**Known gaps:**
- `valueType` metadata is defined on tokens but never read by the UI (audit finding). Operator filtering in the Predicate Builder depends on this — fix in Sprint 2.
- No warning on deletion of a referenced entity class.

**Data written to `model_json`:** Conforms to the Entity Class schema in `docs/addition1_entity_model.md` Section 2.

### 7.3 State Variable Editor (`StateVarEditor`)

**What exists:** Working. Modellers can define user-level numeric state variables.

**What it must do:**
- Allow the modeller to create, rename, and delete user-defined state variables.
- Each variable must have: name (unique, no collision with `Resource` or `Queue` namespace), valueType (number only for user-defined vars), initialValue (number), resetOnWarmup flag (boolean, defaults true).
- Deleting a state variable referenced in a C-Event condition must warn and invalidate the affected conditions.

**Known gaps:**
- No deletion reference check.
- No namespace collision validation against `Resource.*` and `Queue.*` (V10).

### 7.4 B-Event Editor (`BEventEditor`)

**What exists:** Working. Modellers define B-Events with schedule rows.

**What it must do:**
- Allow the modeller to create, rename, and delete B-Events.
- Each B-Event has an ordered list of schedule rows. Each schedule row specifies: a macro action (from the permitted vocabulary — ARRIVE, COMPLETE, ASSIGN, RENEGE), the target resource/queue/variable depending on the macro, and a delay distribution (selected via `DistPicker`).
- B-Event names must be unique within the model.
- Deleting a B-Event must detect and warn about any C-Event schedules that reference it by ID (audit finding C6 — stale references currently become silent no-ops).

**Known gaps:**
- No stale reference detection on deletion (C6) — fix in Sprint 1 Task 5.
- `DistPicker` has a latent `ReferenceError` due to a missing import in `components.jsx` (C11) — fix in Sprint 1 Task 6.
- Distribution parameter inputs lack `type="number"` (C10) — fix in Sprint 1 Task 5.

### 7.5 C-Event Editor (`CEventEditor` + `ConditionBuilder`)

**What exists:** Working structure. `CEventEditor` manages C-Events with condition rows and action schedules. `ConditionBuilder` provides a token + operator + value row UI.

**What it must do:**
- Allow the modeller to create, rename, and delete C-Events.
- Each C-Event has: an explicit integer priority field (1 = highest), a condition built using the Predicate Builder, and an ordered list of action schedule rows.
- Priority must be displayed as an explicit numbered field — not inferred from array order. The modeller must be able to drag to reorder C-Events, with priority numbers updating automatically.
- The condition must use the Predicate Builder exclusively — no free-text entry permitted.
- Compound AND/OR conditions must be supported with explicit precedence display.

**Known gaps (all are Sprint 1 or Sprint 2 work):**
- Per-C-event priority field is absent — currently implicit array order with no drag-to-reorder (audit finding). Fix in Sprint 2.
- AND/OR compound clauses are flat chains only — no nested grouping, mixed precedence undefined to user. Fix in Sprint 2.
- Operator filtering by token `valueType` is not enforced — all tokens treated as numeric. Fix in Sprint 2.
- Attribute-based entity filter is absent — type-level only, no "select entity where attr > N". Fix in Sprint 2.
- `ConditionBuilder` token list goes stale after prop change (C8) — adding entity types while the C-Event editor is open does not refresh available tokens. Fix in Sprint 2.

### 7.6 Queue Editor (`QueueEditor`)

**What exists:** Working. Modellers can create, rename, and delete queues. FIFO / LIFO / Priority discipline options are shown.

**What it must do:**
- Allow the modeller to create, rename, and delete Queue nodes.
- Each Queue has: a name, a discipline (FIFO | LIFO | PRIORITY).
- The discipline dropdown must only show options the engine actually implements. Until LIFO and PRIORITY are implemented in the engine (Sprint 1 Task 3), only FIFO may appear in this dropdown.

**Known gaps:**
- LIFO and Priority are shown in the dropdown but the engine ignores `q.discipline` entirely (C2). Remove these options until the engine implements them (Sprint 1 Task 3).

### 7.7 Distribution Picker (`DistPicker`)

**What exists:** Partially. The `DistPicker` component is referenced in `components.jsx` but has a latent `ReferenceError` — it references `DISTRIBUTIONS` which is never imported. It will crash on render.

**What it must do:**
- Render as a two-step picker: first select distribution type from a dropdown, then display parameter inputs appropriate for that type.
- Parameter inputs must use `type="number"` for all numeric parameters.
- Must include a "Import from CSV" option that triggers file selection, parses the CSV in the browser, lets the modeller select a column, and stores the extracted values array in the distribution object (see CLAUDE.md Section 7.3 and `docs/addition1_entity_model.md` Section 6.3).
- The picker must be usable anywhere a Distribution is required: B-Event schedule rows, Source node inter-arrival configuration, RENEGE patience time.
- The distribution registry in `distributions.js` drives the picker — the picker reads registered types to build its dropdown. Adding a new distribution type to the registry automatically makes it available in the picker.

**Known gaps:**
- Latent `ReferenceError` — missing import of `DISTRIBUTIONS` (C11). Fix in Sprint 1 Task 6 before any other DistPicker work.
- `type="number"` missing on parameter inputs (C10). Fix in Sprint 1 Task 5.
- CSV import not yet implemented. Sprint 2 feature.

### 7.8 Execute Panel (`execute/index.jsx`)

**What exists:** Working. The execute panel provides: a Run button, a VisualView (server bays, queue lanes, entity tokens), a StepLog (phase-tagged event log with clock timestamps), an EntityTable (entity status), and a run history tab showing last 20 runs.

**What it must do:**
- Validate the model (V1–V11) before calling `buildEngine()`. Block Run if validation fails. Surface errors inline in the relevant editor tab, not only in the execute panel.
- Accept a seed input field — the modeller can set or randomise the seed. The seed is stored with the run record.
- Display the Phase C truncation warning if the cap is hit during a run.
- The stats panel overview tab currently always shows Runs count as 0 (`model.stats` never populated). This must be fixed so that completed runs update the stats count.
- The VisualView, StepLog, and EntityTable are working and must not be broken by any Sprint 1 changes.

**Known gaps:**
- No pre-run validation (C5) — fix in Sprint 1 Task 5.
- No seed field — fix in Sprint 1 Task 4.
- Silent Phase C truncation (C4) — fix in Sprint 1 Task 6.
- Stats panel always shows 0 runs (C9 adjacent) — fix in Sprint 2.

### 7.9 Model Library (`App.jsx` + `ModelCard`)

**What exists:** Working. `App.jsx` manages the model library listing. `ModelCard` displays each model with title and owner avatar.

**Known gaps:**
- `const owner = null` hardcoded in `ModelCard` — avatar always blank (audit finding). Fix in Sprint 2.
- Version tag hardcoded as `"v6"` in `ModelDetail` — package is v7.0.0. Fix in Sprint 2.

### 7.10 UI Rules — Applies to All Editor Work

These rules apply to every change made to any component in `src/ui/`:

```
✓  All logic entry through structured pickers and Predicate Builder — no free-text fields
✓  All style values from tokens.js — no hardcoded colours, spacing, or font sizes
✓  Save status banner (saving / saved / error) preserved on all model-mutating operations
✓  Navigation away from unsaved changes must prompt the user first
✓  Validation errors surfaced inline in the editor tab where the error lives
✓  Distribution Picker used wherever a Distribution is required — no ad-hoc inputs
✓  Queue discipline dropdown shows only options implemented by the engine
✓  C-Event priority is an explicit integer field — never implicit array order
✗  No class components
✗  No CSS classes — inline style objects only
✗  No direct Supabase queries in UI components — use src/db/models.js
✗  No engine imports in UI components except buildEngine() in execute/index.jsx
```

---

---

## 8. Pre-Run Model Validation

All validation runs before `buildEngine()` is called. Validation failures block the run and surface errors inline in the editor panel — not as console logs, not as toasts only.

### Blocking Errors (run prevented)

| Code | Rule |
|---|---|
| V1 | Every Entity Class has a unique, non-empty name |
| V2 | Every attribute name is unique within its Entity Class |
| V3 | Every `defaultValue` matches its declared `valueType` |
| V4 | PRIORITY queue discipline requires a numeric `priority` attribute on the entity class |
| V5 | All distribution parameters are within valid bounds |
| V6 | No B-Event schedule references a deleted or non-existent event ID |
| V7 | Every Activity node has exactly one incoming and one outgoing edge |
| V8 | Model contains at least one Source node and one Sink node |
| V9 | No C-Event condition references an undefined variable or attribute |
| V10 | No attribute name collides with built-in namespaces (`Resource`, `Queue`) |

### Warnings (run proceeds, banner shown)

| Code | Rule |
|---|---|
| V11 | Normal distribution where `mean < 2 × stdDev` — frequent negative sample clamping likely |
| V12 | Phase C pass cap was hit in the previous run — model may have an unstable C-scan |

---


## 9. Probability Distributions
The distribution system is **open and extensible**. New distribution types can be added without modifying the engine core. The currently supported distributions are documented in `docs/addition1_entity_model.md` Section 6 — that list is a snapshot of what is implemented, not a closed specification.

### 9.1 Currently Supported Distributions

| Type | Key Parameters | Notes |
|---|---|---|
| `exponential` | `rate` (λ > 0) | Primary inter-arrival distribution |
| `uniform` | `min`, `max` | `max > min` enforced at validation |
| `normal` | `mean`, `stdDev` | Negative samples clamped to 0 for durations |
| `triangular` | `min`, `mode`, `max` | `min ≤ mode ≤ max` enforced |
| `fixed` | `value` | Deterministic. Used for M/D/1 benchmarks. |
| `lognormal` | `logMean`, `logStdDev` | Negative samples clamped to 0 |
| `empirical` | `values[]` | Samples uniformly from inline list |

### 9.2 Distribution Architecture — Extensibility Rules

The sampler in `distributions.js` must use a **registry pattern**, not a switch statement or if-else chain. Every distribution is registered as a named handler. Adding a new distribution type requires only adding a new entry to the registry — no changes to the engine, the macro layer, or the validation framework.

```javascript
// CORRECT — registry pattern
const distributionRegistry = {};

function registerDistribution(type, { validate, sample, describe }) {
  distributionRegistry[type] = { validate, sample, describe };
}

function sampleDistribution(dist, rng) {
  const handler = distributionRegistry[dist.type];
  if (!handler) throw new ModelError(`Unknown distribution type: '${dist.type}'`);
  return handler.sample(dist, rng);
}

// Adding a new distribution requires only this — no engine changes
registerDistribution('weibull', {
  validate: (d) => { /* check shape > 0, scale > 0 */ },
  sample:   (d, rng) => d.scale * Math.pow(-Math.log(1 - rng()), 1 / d.shape),
  describe: (d) => `Weibull(shape=${d.shape}, scale=${d.scale})`
});
```

```javascript
// PROHIBITED — closed switch statement that requires engine changes to extend
function sampleDistribution(dist, rng) {
  switch (dist.type) {
    case 'exponential': return ...
    case 'uniform':     return ...
    // Adding a new type here requires touching this function — prohibited pattern
  }
}
```

### 9.3 CSV-Imported Empirical Distributions

The engine supports empirical distributions built from imported CSV data. This is a first-class distribution type, not a workaround.

**How it works:**
1. The modeller uploads a CSV file via the Distribution Picker UI.
2. The UI parses the CSV, extracts the numeric column, and stores the values array in the model JSON — identical to the inline `empirical` type.
3. The model JSON also stores the original filename as `sourceFile` for display purposes only. The engine never reads the filename.
4. At runtime, the engine samples from the stored values array using the seeded PRNG — no file access occurs at run time.

```json
{
  "type": "empirical",
  "values": [4.2, 6.1, 7.8, 8.3, 12.0, 15.4],
  "sourceFile": "service_times_jan2026.csv",
  "column": "duration_minutes"
}
```

**Validation rules for CSV-imported distributions:**
- `values` array must be non-empty after parsing.
- All values must be finite numbers. Non-numeric rows are skipped with a count reported to the user.
- If more than 10% of rows are skipped, a warning is shown before the model is saved.
- The CSV is parsed and values extracted at import time — the CSV file itself is never stored in Supabase or sent to the engine.

**UI requirements:**
- The Distribution Picker must offer a "Import from CSV" option alongside the standard distribution types.
- After import, the picker shows a summary: filename, column selected, row count, min, max, mean.
- The modeller can re-import (replacing the values array) or clear the import and choose a parametric distribution instead.

### 9.4 Adding a New Distribution Type — Checklist

When implementing a new distribution (parametric or custom), follow this sequence:

- [ ] Register it in `distributions.js` using `registerDistribution()` — no other files change in the engine
- [ ] Add its parameter schema to the Distribution JSON Schema in `docs/addition1_entity_model.md` Section 6.1
- [ ] Add its validation logic as the `validate` function in the registry entry
- [ ] Add it to the Distribution Picker UI dropdown
- [ ] Write a unit test confirming the sampler produces the correct theoretical mean over 10,000 samples (within 2%)
- [ ] If it can produce negative values for durations, confirm clamping behaviour is tested

### Seeded RNG — Non-Negotiable

```javascript
// PROHIBITED in all simulation code
Math.random()

// REQUIRED — seeded PRNG passed into buildEngine()
// Use mulberry32 or xorshift128 — simple, fast, seedable
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// buildEngine signature
function buildEngine(model, seed, maxCycles = 500) { ... }
```

**Every replication uses a unique integer seed.** The seed is stored with the run record in Supabase. A run replayed with the same seed must produce bit-identical results.

---


## 10. Known Issues

### 10.1 Audit Tracker

These are open defects from the audit. Do not work around them — fix them.

| # | Severity | File | Issue | Sprint |
|---|---|---|---|---|
| C1 | **Critical** | `conditions.js:76`, `macros.js:220` | `new Function()` eval on effect strings — XSS on public models | Sprint 1 ✓ |
| C2 | **Critical** | `entities.js:84–88` | LIFO and Priority queue disciplines ignored by engine | Sprint 1 ✓ |
| C3 | **High** | `engine/index.js:121–142` | C-scan restart is pass-granularity not event-granularity | Sprint 1 ✓ |
| C4 | **High** | `engine/index.js:121` | Phase C truncation at 100 passes is silent — no warning | Sprint 1 ✓ |
| C5 | **High** | `execute/index.jsx:141–147` | No pre-run model validation — invalid models run silently | Sprint 1 ✓ |
| C6 | **Medium** | `phases.js:91,125` | Stale B-Event references after deletion become silent no-ops | Sprint 1 ✓ |
| C7 | **Medium** | `distributions.js:84` | No seeded RNG — `Math.random()` throughout | Sprint 1 ✓ |
| C8 | **Low** | `editors/index.jsx:495` | ConditionBuilder token list stale after prop change | Sprint 2 |
| C9 | **Low** | `db/models.js:127` | Resolved in Sprint 5: `avg_service_time` now stores `summary.avgSvc`; `results_json.summary` keeps service/sojourn details | Sprint 5 ✓ |
| C10 | **Low** | `editors/index.jsx:171,241,731` | Distribution parameter inputs missing `type="number"` | Sprint 1 ✓ |
| C11 | **Low** | `components.jsx` | `DistPicker` references `DISTRIBUTIONS` which is never imported — latent `ReferenceError` | Sprint 1 ✓ |
| G1 | **Medium** | `engine/macros.js:121–132` | Queue discipline lookup uses entity type name match — silently falls back to FIFO if queue name ≠ type name | Sprint 2 |
| G2 | **Medium** | `conditions.js:154`, `macros.js:272` | `waitingOf()` called without discipline in `evalCondition` and RENEGE macro — always FIFO regardless of configuration | Sprint 2 |
| G3 | **Low** | `engine/index.js:127` | `firedThisPass` Set in Phase C is dead code — set is reset each pass and break fires before it can have effect | Sprint 2 |
| G4 | **Low** | `engine/distributions.js:98,108` | `mulberry32(0)` default in `sample()` / `sampleAttrs()` silently uses seed 0 when `rng` is omitted rather than erroring | Sprint 2 |

---

## 11. Coding Conventions

### JavaScript / JSX / TypeScript

```javascript
// Component names: PascalCase
export const ModelCard = ({ model }) => { ... }

// File locations: kebab-case folders, index.jsx entry points
// src/ui/editors/index.jsx  ✓
// src/ui/editors/Editors.jsx ✗

// No comments unless the WHY is non-obvious
// Code should be self-explanatory from naming

// TypeScript is allowed incrementally under ADR-009
// Prefer first TS work at domain/schema boundaries, not large UI conversions
// No ESLint currently — this will be added in Sprint 2
```

### Styling

```javascript
// CORRECT — inline style objects using tokens
import { colours, spacing, typography } from '../shared/tokens.js';
const style = { backgroundColor: colours.surface, padding: spacing.md };

// PROHIBITED — hardcoded values anywhere
const style = { backgroundColor: '#ffffff', padding: '16px' };

// PROHIBITED — CSS classes
<div className="card-container">
```

### Engine Functions

```javascript
// Engine functions are pure — same inputs always produce same outputs
// No side effects. No module-level mutable state.
function fireBEvent(event, state) {
  // Returns new state or mutates state object — never touches DOM or React
}

// UI components never reach into engine internals
// The ONLY permitted bridge is:
import { buildEngine } from '../../engine/index.js'; // in execute/index.jsx only
```

---

## 12. Testing Strategy

Testing is split into four layers. Each layer has a defined scope, tooling, and a completion gate that must pass before the relevant sprint is declared done. The current codebase has strong engine coverage (~120 tests) and zero UI or DB coverage — this imbalance must be corrected sprint by sprint.

### 12.1 Current Test Coverage State

| Layer | Files | Tests | Environment | Status |
|---|---|---|---|---|
| Engine (Three-Phase logic) | 5 | ~120 | Node | ✓ Good coverage |
| UI components | 0 | 0 | None configured | ✗ Must be added Sprint 1 |
| DB / Supabase wrappers | 0 | 0 | None | ✗ Must be added Sprint 2 |
| Integration (end-to-end) | 0 | 0 | None | ✗ Target Sprint 3 |

**The test runner (`vite.config.js`) is currently set to `environment: 'node'`.** DOM tests will fail silently or error. The first task of UI test setup is switching to `jsdom` or `happy-dom` for UI test files while preserving `node` for engine tests.

### 12.2 Test File Structure

All tests live in `tests/`. Subdirectories mirror the `src/` structure:

```
tests/
├── engine/
│   ├── three-phase.test.js       ← Phase A/B/C loop correctness, restart rule
│   ├── distributions.test.js     ← Sampler correctness, seeded RNG reproducibility
│   ├── macros.test.js            ← ARRIVE, SEIZE, COMPLETE, ASSIGN, RENEGE
│   ├── conditions.test.js        ← Safe evaluator, all operator types
│   ├── entities.test.js          ← Queue disciplines: FIFO, LIFO, PRIORITY
│   └── mm1_benchmark.js          ← M/M/1 correctness gate (not a unit test — run manually)
├── ui/
│   ├── editors/
│   │   ├── entity-type-editor.test.jsx   ← EntityTypeEditor render and interactions
│   │   ├── b-event-editor.test.jsx        ← BEventEditor, deletion reference guard
│   │   ├── c-event-editor.test.jsx        ← CEventEditor, priority field, ConditionBuilder
│   │   ├── queue-editor.test.jsx          ← QueueEditor, discipline dropdown state
│   │   └── dist-picker.test.jsx           ← DistPicker, CSV import, registry sourcing
│   ├── execute/
│   │   └── execute-panel.test.jsx         ← Validation block, seed field, run flow
│   └── shared/
│       └── predicate-builder.test.jsx     ← Type safety, operator filtering, compound clauses
├── db/
│   └── models.test.js            ← CRUD wrappers, user_id filtering (mocked Supabase)
└── setup.js                      ← Global test setup: jsdom, mocks, test utilities
```

**Naming convention:** Test files use the same name as the file under test with `.test.js` or `.test.jsx` suffix. A test file for `src/ui/editors/index.jsx` lives at `tests/ui/editors/entity-type-editor.test.jsx` — split by component, not mirroring the monolithic `index.jsx`.

### 12.3 Test Environment Configuration

Two environments are needed. Configure in `vite.config.js`:

```javascript
// vite.config.js
export default defineConfig({
  test: {
    // Engine tests: node environment (fast, no DOM needed)
    // UI tests: jsdom environment (React rendering, DOM APIs)
    environment: 'node',         // default
    environmentMatchGlobs: [
      ['tests/ui/**', 'jsdom'],  // UI tests get jsdom
    ],
    globals: true,
    setupFiles: ['tests/setup.js'],
  }
});
```

```javascript
// tests/setup.js
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Clean up React renders after each test
afterEach(cleanup);

// Mock Supabase client — never hit real DB in tests
vi.mock('../src/db/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }
}));
```

**Required packages — add to `devDependencies`:**

```bash
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

These are the only new test dependencies permitted. Do not add Playwright, Cypress, or any other framework without an ADR.

### 12.4 Engine Tests — Rules and Required Coverage

Engine tests run in the `node` environment. They are pure JavaScript — no React, no DOM.

**Rules:**
- Every engine test must pass a fixed seed to `buildEngine()`. Tests using `Math.random()` are invalid and must be rewritten.
- Engine tests must be deterministic — the same test run in any order must produce the same result.
- Tests must not import from `src/ui/` or `src/db/`. Engine is pure and isolated.

**Required test cases by file:**

`three-phase.test.js` — must include:
```javascript
// The restart rule — this is the most critical engine test
test('C-scan restarts from Priority 1 when a lower-priority C-Event fires first', () => {
  // Model: two C-Events
  // C-Event Priority 2 fires first (condition true), changes state so Priority 1 becomes true
  // Correct: Priority 1 fires on restart, then Priority 2 fires again
  // Incorrect (current bug): Priority 2 fires, scan continues to end, Priority 1 missed this pass
});

test('Phase B fires all events at T_now before Phase C begins', () => { ... });
test('Phase A advances clock to next FEL event', () => { ... });
test('Engine terminates when FEL is empty', () => { ... });
test('Phase C truncation warning fires after MAX_C_PASSES', () => { ... });
```

`distributions.test.js` — must include:
```javascript
test('exponential sampler produces correct mean over 10,000 samples (within 2%)', () => { ... });
test('fixed distribution always returns its configured value', () => { ... });
test('normal distribution clamps negative samples to 0', () => { ... });
test('same seed produces identical sample sequence', () => {
  const rng1 = mulberry32(42);
  const rng2 = mulberry32(42);
  // 100 samples from each must be identical
});
test('different seeds produce different sequences', () => { ... });
test('empirical sampler only returns values from the provided array', () => { ... });
test('CSV-imported empirical distribution behaves identically to inline empirical', () => { ... });
```

`conditions.test.js` — must include:
```javascript
test('safe evaluator handles == operator for numbers', () => { ... });
test('safe evaluator handles < > <= >= for numbers', () => { ... });
test('safe evaluator handles == != for strings', () => { ... });
test('safe evaluator handles == != for booleans', () => { ... });
test('safe evaluator resolves Entity.attributeName from state', () => { ... });
test('safe evaluator resolves Resource.<id>.status from state', () => { ... });
test('safe evaluator resolves Queue.<id>.length from state', () => { ... });
test('safe evaluator handles AND compound predicate', () => { ... });
test('safe evaluator handles OR compound predicate', () => { ... });
test('safe evaluator throws on unknown variable reference', () => { ... });
// Security tests
test('evaluator does not execute strings as code', () => {
  // Pass a predicate where variable = "process.exit" — must not execute
});
```

`entities.test.js` — must include:
```javascript
test('FIFO: selects entity with smallest arrivalTime', () => { ... });
test('LIFO: selects entity with largest arrivalTime', () => { ... });
test('PRIORITY: selects entity with smallest priority attribute', () => { ... });
test('PRIORITY: uses FIFO as tiebreaker on equal priority values', () => { ... });
test('entity filter excludes non-matching entities before queue rule is applied', () => { ... });
```

### 12.5 UI Tests — Rules and Required Coverage

UI tests run in the `jsdom` environment using `@testing-library/react`. They test component behaviour — what a modeller sees and can do — not implementation details.

**Rules:**
- Test behaviour, not implementation. Query by role, label, or text — never by CSS class or component internals.
- Supabase is always mocked (see `setup.js`). UI tests never hit a real database.
- Do not test that a specific function was called (spy-based testing). Test that the UI shows the right result.
- Each test file covers one component or one user workflow.

**Pattern for all UI tests:**

```javascript
// tests/ui/editors/queue-editor.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueueEditor } from '../../../src/ui/editors/index.jsx';

describe('QueueEditor', () => {
  test('renders FIFO as the only discipline option when engine lacks LIFO/Priority', async () => {
    render(<QueueEditor model={mockModel} onSave={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /discipline/i });
    expect(screen.queryByRole('option', { name: /lifo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /priority/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /fifo/i })).toBeInTheDocument();
  });
});
```

**Required UI test cases by component:**

`entity-type-editor.test.jsx`:
- [ ] Renders existing entity classes from model
- [ ] Adding an entity class with a valid name calls save
- [ ] Attempting to save with an empty name shows inline error, does not save
- [ ] Adding a duplicate entity class name shows inline error
- [ ] Attribute `valueType` dropdown shows `number`, `string`, `boolean` only
- [ ] Default value input validates against selected `valueType`
- [ ] Deleting an entity class that is referenced in a C-Event shows a warning dialog

`b-event-editor.test.jsx`:
- [ ] Renders existing B-Events from model
- [ ] Deleting a B-Event that is referenced in a C-Event schedule shows warning (audit C6)
- [ ] Distribution parameter inputs are `type="number"` (audit C10)
- [ ] Empty name is rejected with inline error

`c-event-editor.test.jsx`:
- [ ] Renders C-Events in priority order
- [ ] Priority field is visible and editable as an integer
- [ ] Predicate Builder is rendered for condition entry — no free-text field present
- [ ] `Custom...` option does not appear anywhere in the condition editor (audit C1)

`predicate-builder.test.jsx` — the most important UI tests:
- [ ] Variable picker lists entity attributes, resource vars, queue vars, user vars
- [ ] Selecting a `number` variable shows `== != < > <= >=` operators only
- [ ] Selecting a `string` variable shows `== !=` operators only
- [ ] Selecting a `boolean` variable shows `== !=` operators only
- [ ] Value input renders as number input for `number` variables
- [ ] Value input renders as dropdown when `allowedValues` is set
- [ ] Value input renders as toggle for `boolean` variables
- [ ] Type-mismatched predicate cannot be constructed through the UI
- [ ] AND/OR compound clause can be added and serialises to nested JSON
- [ ] No `<textarea>` or `<input type="text">` is present for condition logic entry

`dist-picker.test.jsx`:
- [ ] All registered distribution types appear in the dropdown
- [ ] Selecting `exponential` shows a `rate` input with `type="number"`
- [ ] Selecting `normal` shows `mean` and `stdDev` inputs with `type="number"`
- [ ] Invalid parameter (rate = -1) shows inline error
- [ ] "Import from CSV" option is present
- [ ] CSV import shows summary (row count, min, max, mean) before confirming
- [ ] Picker does not contain a hardcoded type list — it reads from the registry

`execute-panel.test.jsx`:
- [ ] Run button is disabled when model has validation errors
- [ ] Validation errors are shown inline in the relevant editor tab, not only in execute panel
- [ ] Seed field is present and accepts integer input
- [ ] Phase C truncation warning is visible when cap is hit (mock engine to trigger cap)
- [ ] VisualView, StepLog, and EntityTable render without crashing on a valid completed run

### 12.6 DB Layer Tests — Rules and Required Coverage

DB tests mock the Supabase client and verify that CRUD wrappers apply the correct filters, never exposing cross-user data.

```javascript
// tests/db/models.test.js
import { getModels, saveModel } from '../../src/db/models.js';
import { supabase } from '../../src/db/supabase.js'; // mocked in setup.js

describe('getModels', () => {
  test('filters by user_id — never returns other users models', async () => {
    await getModels('user-123');
    expect(supabase.from().select().eq)
      .toHaveBeenCalledWith('user_id', 'user-123');
  });

  test('does not call eq with is_public when fetching own models', async () => { ... });
});

describe('saveModel', () => {
  test('always includes user_id in INSERT payload', async () => { ... });
  test('preserves is_public flag on PATCH — does not overwrite', async () => { ... });
});
```

**Required DB test cases:**
- [ ] `getModels()` always filters by `user_id`
- [ ] `getPublicModels()` filters by `is_public = true` only — no `user_id` filter
- [ ] `saveModel()` INSERT always includes `user_id`
- [ ] `updateModel()` PATCH preserves `is_public` — does not silently default it
- [ ] `deleteModel()` does not execute without a model `id` (guard against accidental table wipe)
- [ ] `saveRun()` INSERT always includes the owning `model_id`

### 12.7 The M/M/1 Correctness Benchmark

The M/M/1 benchmark is not a unit test. It is a correctness gate run manually after any engine change. It must exist at `tests/engine/mm1_benchmark.js`.

```javascript
// tests/engine/mm1_benchmark.js
// Usage: node tests/engine/mm1_benchmark.js
// Pass criteria: simulated mean wait within 5% of analytical value

const LAMBDA = 0.9;   // arrival rate
const MU = 1.0;       // service rate
const RHO = LAMBDA / MU;                          // utilisation = 0.9
const ANALYTICAL_MEAN_WAIT = RHO / (MU * (1 - RHO)); // = 9.0 time units
const N_ARRIVALS = 10000;
const TOLERANCE = 0.05; // 5%

// Build and run the M/M/1 model using buildEngine()
// Compare simulated mean wait against ANALYTICAL_MEAN_WAIT
// Exit 0 if within tolerance, exit 1 if not
```

**Sprint 1 is not complete until this benchmark exits 0.**

### 12.8 Completion Gates by Sprint

These are the minimum test requirements before a sprint can be declared done. Claude Code must run all gates and report pass/fail before closing a sprint.

| Sprint | Gate | Command |
|---|---|---|
| Sprint 1 | All existing engine tests pass | `npm test` |
| Sprint 1 | C-scan restart unit test passes | `npm test -- three-phase` |
| Sprint 1 | Seeded RNG reproducibility test passes | `npm test -- distributions` |
| Sprint 1 | Condition evaluator has no `new Function()` path | `npm test -- conditions` |
| Sprint 1 | Queue discipline tests pass (FIFO, LIFO, PRIORITY) | `npm test -- entities` |
| Sprint 1 | M/M/1 benchmark exits 0 | `node tests/engine/mm1_benchmark.js` |
| Sprint 2 | UI test environment configured (jsdom) | `npm test -- ui` (no failures) |
| Sprint 2 | DistPicker renders without ReferenceError | `npm test -- dist-picker` |
| Sprint 2 | Predicate Builder type-safety tests pass | `npm test -- predicate-builder` |
| Sprint 2 | No free-text field test passes (no `Custom...` option) | `npm test -- c-event-editor` |
| Sprint 3 | DB layer tests pass (user_id filtering) | `npm test -- db` |
| Sprint 3 | Execute panel validation block test passes | `npm test -- execute-panel` |
| All sprints | Full test suite passes with zero failures | `npm test -- --run` |
| All sprints | Production build succeeds | `npm run build` |

### 12.9 What Must Never Be Tested

- Do not write tests that assert a specific internal function was called (implementation testing). Test outcomes.
- Do not write tests that depend on specific Supabase response timing. All Supabase calls are mocked.
- Do not write tests for the visual appearance of components (pixel dimensions, exact colours). Test presence, absence, and user-reachable behaviour.
- Do not write tests that require a running dev server. All tests are offline.
- Do not test the Three-Phase engine through the UI. Engine correctness is tested at the engine layer. UI tests mock `buildEngine()`.

---

## 13. Commands

```bash
# Development
npm run dev                          # Vite dev server (localhost:5173)

# Testing — engine layer (node environment)
npm test                             # Watch mode — all tests
npm test -- --run                    # Single pass, no watch
npm test -- three-phase              # Run three-phase tests only
npm test -- distributions            # Run distribution tests only
npm test -- conditions               # Run condition evaluator tests only
npm test -- entities                 # Run entity/queue discipline tests only

# Testing — UI layer (jsdom environment — Sprint 2 onwards)
npm test -- ui                       # All UI tests
npm test -- predicate-builder        # Predicate Builder tests only
npm test -- dist-picker              # Distribution Picker tests only
npm test -- c-event-editor           # C-Event editor tests only
npm test -- execute-panel            # Execute panel tests only
npm test -- model-export model-import results-export
npm test -- accessibility delete-model onboarding

# Testing — DB layer (mocked Supabase — Sprint 3 onwards)
npm test -- db                       # All DB wrapper tests

# Correctness gate — run manually after any engine change
node tests/engine/mm1_benchmark.js
# Pass: exits 0, prints simulated vs analytical mean wait within 5%
# Fail: exits 1, prints actual % error

# Build
npm run build                        # Production build — must pass before sprint complete
npm run preview                      # Preview production build locally
```

---

## 14. Environment Variables

Required in `.env.local` (not committed — never commit secrets):

```
VITE_SUPABASE_URL=https://[project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=[anon-key]
```

A `.env.example` file must exist in the project root with these keys and placeholder values. If it does not exist, create it before any other work.

---

## 15. Database Schema

Key tables in Supabase. Do not change column names without updating `src/db/models.js`.

| Table | Key Columns | Notes |
|---|---|---|
| `models` | `id`, `name`, `user_id`, `model_json`, `is_public`, `created_at` | `model_json` is JSONB — full model stored here |
| `runs` | `id`, `model_id`, `seed`, `replications`, `max_simulation_time`, `results_json`, `created_at` | Sprint 4 persists one row per replication batch. `batch_id` is stored in `results_json.batch_id` because no committed schema column exists. |
| `profiles` | `id`, `username`, `avatar_url` | Linked to Supabase Auth `auth.users` |

**Schema rules:**
- Never add columns without adding a corresponding entry to the relevant CRUD wrapper in `src/db/models.js`.
- `model_json` must always conform to the entity schema defined in `docs/addition1_entity_model.md`. Do not store ad-hoc fields.
- `avg_service_time` maps engine `summary.avgSvc`; `results_json.summary` remains the source of detailed service/sojourn metrics.

---

## 16. Authentication & Multi-User Rules

DES Studio is a **multi-user application**. Authentication is managed by Supabase Auth. The existing implementation is working and must be fully preserved across all sprints. No auth-related code may be simplified, removed, or bypassed without an explicit ADR (see Section 15).

### 16.1 What Exists and Must Not Be Broken

- **`src/App.jsx`** manages the Supabase auth session listener. It is the single source of truth for the current authenticated user. No other component fetches the session independently.
- **`src/db/supabase.js`** exports the single Supabase client instance. Never create a second client instance anywhere in the codebase.
- **`profiles` table** is linked to `auth.users` via `id`. It stores `username` and `avatar_url`. Do not drop, rename, or alter any column without an ADR.
- **`models` table** has a `user_id` column. Every model belongs to exactly one user. This column must be present on every INSERT and every LIST query must filter by it.
- **`is_public` boolean** on `models` controls whether other authenticated users can view (but not edit) a model. This flag must be preserved on every model update.

### 16.2 Data Isolation Rules — Never Violate These

```javascript
// CORRECT — list only the current user's models
const { data } = await supabase
  .from('models')
  .select('*')
  .eq('user_id', session.user.id);

// CORRECT — list public models from all users
const { data } = await supabase
  .from('models')
  .select('*')
  .eq('is_public', true);

// PROHIBITED — returns all models from all users, breaking data isolation
const { data } = await supabase
  .from('models')
  .select('*');
```

- Every INSERT into `models` must set `user_id` to `session.user.id`. Never omit this field.
- Every INSERT into `runs` must reference a `model_id` owned by the current user. Never insert a run against another user's model.
- `is_public` must never be overwritten silently — patch operations on other fields must explicitly preserve it.
- Frontend filtering is required for correct UX, but it is **not** the security boundary. Supabase Row Level Security (RLS) is the enforcement layer. Do not disable or work around RLS policies.

### 16.3 Auth State in Components

- Components that require authentication must read the session from `App.jsx` via context or props — never by calling `supabase.auth.getSession()` directly inside a component.
- If a component renders before auth resolves, it must show a loading state — not an empty or broken UI.
- Navigation away from an unsaved model must warn the user before discarding changes, regardless of auth state.
- If a session expires mid-session, the user must be redirected to login — not shown an unexplained error.

### 16.4 The XSS Risk on Public Models (Audit Finding C1)

The `new Function()` eval in `conditions.js` is a **security vulnerability, not just a correctness issue**, specifically because models can be marked `is_public = true` and viewed by other authenticated users. A crafted public model can execute arbitrary JavaScript in any viewer's browser.

This is why Task 1 of Sprint 1 (removing `new Function()`) is classified as a security fix and must be completed before any other work. The multi-user sharing model makes this exploitable in production.

### 16.5 Public Model Execution Rules (ADR-002: Fork Model)

**Rule:** When a non-owner user initiates a run on a public model, the UI MUST first create a private copy (fork) of that model for the user. All subsequent simulation runs will be associated with this forked model.

**Rule:** Forked models are entirely owned by the user who initiated the run.

**Rule:** Simulation run records for forked models appear exclusively in the runner's history and can be deleted by the runner.

**Rule:** The original public model's run history and metrics MUST NOT be affected by non-owner executions via the fork mechanism.

---

## 17. Architectural Decision Records (ADRs)

An ADR is a short document that records a significant architectural choice — what was decided, why, what alternatives were rejected, and what consequences follow. ADRs are the answer to the question: *"Why does the code work this way?"*

### 17.1 When to Create an ADR

Create an ADR whenever a decision meets any of these criteria:

- It affects how multiple parts of the system interact (auth, engine, DB, UI)
- It would be difficult or expensive to reverse later
- A reasonable developer could have made a different choice
- It was explicitly discussed and rejected an alternative
- It resolves a question marked as "open" or "deferred" in CLAUDE.md

**You do not need an ADR for:** implementation details within a single file, choice of variable names, which utility library to use for a minor task.

### 17.2 ADR File Format

All ADRs live in `docs/decisions/`. File naming: `ADR-NNN-short-title.md` where NNN is a zero-padded sequence number.

```markdown
# ADR-NNN: [Short title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Superseded by ADR-NNN
**Sprint:** [Sprint number when decided]

## Context
[What situation or question prompted this decision?
 What constraints existed? What was unclear?]

## Decision
[What was decided, stated plainly in 1–3 sentences.]

## Alternatives Considered
[What other approaches were evaluated and why were they rejected?]

## Consequences
### Positive
- [What does this enable or improve?]

### Negative
- [What does this constrain or make harder?]

### Rules added to CLAUDE.md
- [List any new rules added to CLAUDE.md as a result of this decision]

## Open Questions
[Anything not yet resolved that a future ADR should address]
```

### 17.3 How ADRs Interact With CLAUDE.md

CLAUDE.md contains the **rules**. ADRs contain the **reasoning**. The relationship is:

- When a decision produces a new rule, the rule goes into CLAUDE.md and the ADR is referenced in the relevant section.
- When a rule in CLAUDE.md is questioned or needs to change, a new ADR is written first, then CLAUDE.md is updated to reflect it.
- Claude Code must never change an architectural rule in CLAUDE.md without an ADR being created in the same commit.

### 17.4 How to Trigger an ADR During a Claude Code Session

If Claude Code encounters a situation where a reasonable implementation choice conflicts with CLAUDE.md, or where CLAUDE.md is silent on something important, it must stop and flag it:

```
ARCHITECTURAL DECISION REQUIRED

I have reached a point where I need to make a choice that is not
covered by CLAUDE.md or that conflicts with an existing rule.

Question: [state the specific question]
Option A: [describe first approach and its tradeoffs]
Option B: [describe second approach and its tradeoffs]
My recommendation: [state which option and why]

Please confirm your decision. I will then:
1. Create docs/decisions/ADR-NNN-[title].md recording the decision
2. Update CLAUDE.md with any new rules it produces
3. Proceed with implementation
```

This prevents silent architectural drift — the most common way AI-assisted projects accumulate hidden technical debt.

### 17.5 ADR Register

| ADR | Title | Status | Sprint | CLAUDE.md Sections Affected |
|---|---|---|---|---|
| ADR-001 | Multi-user auth model and public model rules | Accepted | Pre-Sprint 1 | §16 |
| ADR-002 | Public model run permissions | Accepted | Sprint 3 | §16.5 |
| ADR-003 | Safe expression evaluator strategy (C1 fix) | Accepted | Sprint 1 | §5.2, §18 |
| ADR-004 | mulberry32 as the seeded PRNG (C7 fix) | Accepted | Sprint 1 | §9, §18 |
| ADR-005 | Queue discipline lookup by entity type name | Accepted — interim | Sprint 1/2 | §6, §10 |
| ADR-006 | Replication runner architecture | Accepted | Sprint 4 | §21 |
| ADR-007 | Three authoring modes over one canonical model | Accepted | Sprint 6 planning | §21 |
| ADR-008 | Platform roles and user settings, with SaaS/LLM follow-ons | Accepted | Sprint 7A | §21 |
| ADR-009 | Reassess JavaScript-only implementation and TypeScript adoption | Accepted | Sprint 7A | §2, §21 |

---

### 17.6 Key Decisions — Sprint 1

These decisions were made during Sprint 1 and must not be reversed without a new ADR.
Full ADR files: `docs/decisions/ADR-003`, `ADR-004`, `ADR-005`.

### ADR-003 — Safe evaluator strategy (Sprint 1)

`new Function()` was replaced with hand-written pure-JS parsers: `safeEvalExpr()` for condition strings, `safeArithmetic()` for arithmetic, `evaluatePredicate()` for JSON predicates.
- **Rationale:** zero new dependencies; closed grammar (no exponentiation or function calls needed); auditable for public model security.
- **Consequence:** extending the expression language requires modifying the parsers directly.

### ADR-004 — mulberry32 as PRNG (Sprint 1)

`mulberry32` selected over `xorshift128`. Both are seedable and fast; mulberry32 is simpler code. All call sites use the `rng` function interface so PRNG substitution is mechanical if a future sprint requires split-mix or crypto quality.
- **Consequence:** parallel reproducibility not guaranteed with this PRNG — revisit if split-stream replication is needed.

### ADR-005 — Queue discipline lookup by entity type name (Sprint 1)

SEIZE macro resolves queue discipline by matching `model.queues` against the customer entity type name. This avoids a model schema change (adding `queueId` to C-event actions).
- **Consequence:** a queue named differently from the entity type it serves silently falls back to FIFO. Sprint 2 must formalise queue-to-event binding via `queueId`. See G1/G2 in Known Issues.

---

## 18. Prohibited Patterns — Never Do These

Read this section before every coding task.

```
SECURITY
✗  new Function(str)()         — XSS on public models. Use safe evaluator.
✗  eval(str)                   — same risk, any variant
✗  innerHTML = userContent     — XSS. Use textContent or React rendering.

AUTHENTICATION & DATA ISOLATION
✗  supabase.from('models').select('*') with no user_id or is_public filter
   — exposes all users' models. Always filter by user_id or is_public.
✗  supabase.auth.getSession() inside a component
   — read session from App.jsx context only.
✗  Second Supabase client instance
   — use the singleton from src/db/supabase.js only.
✗  INSERT to models without user_id = session.user.id
   — model would be orphaned and invisible to the owner.
✗  Patch operation that overwrites is_public silently
   — preserve the flag unless the user explicitly changed it.

SIMULATION CORRECTNESS
✗  Math.random()               — non-reproducible. Use seeded PRNG.
✗  C-Event scan without break  — completing full scan before restart violates Three-Phase.
✗  Silent Phase C truncation   — must log and show UI warning.
✗  Warm-up enforced in UI only — engine must reset stats collectors at T_warmup.
✗  q.discipline not read       — queue discipline must be read by engine on every SEIZE.

ARCHITECTURE
✗  Supabase query in UI component  — all DB access through src/db/models.js only.
✗  React import in src/engine/     — engine is pure JS. Zero framework imports.
✗  engine import outside execute/  — buildEngine() called only from execute/index.jsx.
✗  Hardcoded style values          — all values from tokens.js.
✗  Free-text condition field       — all logic via Predicate Builder. No exceptions.
✗  'Custom...' escape hatch        — removed. Do not recreate under any name.
✗  Architectural rule change without ADR — create docs/decisions/ADR-NNN.md first.

UI / UX
✗  LIFO or Priority in QueueEditor dropdown if engine does not implement it.
✗  Validation errors in console.log only — must be visible in the editor UI.
✗  Back button discards changes silently — must warn user before navigation.
✗  Component renders broken UI before auth resolves — show loading state.
```

---

## 19. Reference Documents

| Document | Location | Read when |
|---|---|---|
| Entity model, action vocabulary, distributions, validation rules | `docs/addition1_entity_model.md` | **Every Sprint 1, 2, 3 session** |
| Multi-user auth and public model rules | `docs/decisions/ADR-001-auth-model.md` | When modifying any DB query, auth flow, or model sharing feature |
| Public model run permissions (open) | `docs/decisions/ADR-002-public-model-runs.md` | Sprint 3 — before building run history or replication features |
| Safe evaluator strategy | `docs/decisions/ADR-003-safe-evaluator-strategy.md` | Before any change to condition evaluation or expression parsing |
| Seeded PRNG choice | `docs/decisions/ADR-004-mulberry32-prng.md` | Before changing the RNG or adding sampling call sites |
| Queue discipline lookup (interim) | `docs/decisions/ADR-005-queue-discipline-lookup.md` | Sprint 2 Task 1 — must be read before touching SEIZE or waitingOf |
| Platform roles and user settings, with SaaS/LLM follow-ons | `docs/decisions/ADR-008-platform-roles-saas-llm-configuration.md` | Before adding admin features, user settings, tenancy/workspace logic, or LLM provider configuration |
| Incremental TypeScript adoption | `docs/decisions/ADR-009-typescript-reassessment.md` | Before adding TypeScript tooling or beginning schema-heavy/domain-boundary refactors |
| Build plan with sprint features and prompts | `docs/DES_Studio_Build_Plan.md` | Start of every sprint — read current sprint section |
| Full codebase audit findings | `docs/AUDIT.md` | When investigating a known issue — check audit ref before changing |

---

## 20. Sprint History

| Sprint | Status | Completed | Description | Tests | M/M/1 |
|---|---|---|---|---|---|
| Sprint 1 | ✅ Complete | 2026-05-03 | Engine safety and correctness hardening | 182 passing | 1.48% error |
| Sprint 2 | ✅ Complete | 2026-05-03 | UI editor completeness | 215 passing | N/A |
| Sprint 3 | ✅ Complete | 2026-05-04 | Experiment controls: warm-up, termination, fork model | 272 passing | 1.48% error |
| Sprint 4 | ✅ Complete | 2026-05-04 | Replication & Results: workers, batches, CI dashboard | 294 passing | CI contains 9.0 |
| Sprint 5 | ✅ Complete | 2026-05-04 | Polish, Export & Production | 334 passing | CI contains 9.0 |
| Sprint 6 | ✅ Complete | 2026-05-04 | LLM Integration & Results Analysis | 343 passing | N/A |
| Sprint 7A | ✅ Complete | 2026-05-05 | Platform Foundation: Roles, Settings & TypeScript | Docs only | N/A |
| Sprint 7B | ✅ Complete | 2026-05-05 | Platform Foundation Implementation | 33 focused | N/A |
| Sprint 7 | ✅ Complete | 2026-05-05 | Dynamic Distributions & Time-Varying Resources | 369 passing | N/A |
| Sprint 8A | ✅ Complete | 2026-05-05 | LLM Provider Architecture Preflight | 22 focused | N/A |

---

## 21. Current Sprint

**Sprint 9A — Visual Designer Architecture Preflight**

Goal: Lock the Visual Designer canvas, graph metadata, round-trip, and inspector reuse decisions before Sprint 9 coding.

**Status:** Sprint 9 implementation is in progress. ADR-010 is accepted and guides all Visual Designer work.

### Sprint 9A Accepted Decisions

- Use `@xyflow/react` for the Visual Designer canvas. Do not use the older `reactflow` package name.
- Allow `@xyflow/react/dist/style.css` as a narrow vendor-CSS exception. DES Studio-owned styles still use inline token-driven style objects.
- Persist `model_json.graph` only as optional layout metadata: positions, viewport, and graph metadata version.
- Do not persist graph topology as a second model. Derive edges from canonical DES model logic.
- Visual Designer edits canonical `model_json`; Forms/Tabs and AI Generated Model remain first-class authoring modes over the same data.
- If graph metadata is missing or stale, regenerate it from canonical model data.
- Initial node mapping:
  - Source: arrival B-event with `ARRIVE(CustomerType, QueueName)`
  - Queue: `queues[]`
  - Activity: service-start C-event plus scheduled completion B-event
  - Sink: terminal completion/routing outcome, initially derived rather than a new engine schema element
- Visual node inspectors should reuse small editor building blocks where practical: `DistPicker`, `ConditionBuilder`, `EntityFilterBuilder`, queue/customer/resource option helpers.
- Do not embed full `BEventEditor` or `CEventEditor` panels inside a node inspector.
- Do not implement the retired split-pane SVG hybrid designer or `FlowDiagramSVG` bridge.

### Sprint 9 Implementation Notes

- First implementation slice adds dependency-free graph derivation in `src/ui/visual-designer/graph.js`.
- Visual Designer shell is exposed as a `ModelDetail` tab and now renders the derived graph through an editable `@xyflow/react` canvas, with node/edge summaries retained below it for verification.
- The initial Sprint 9 implementation is review/test-first, not final UX polish: button-based node creation, draggable layout persistence, conservative connection creation, and a compact inspector are implemented.
- Visual Designer mutations must update canonical `model_json` first. Graph edges remain derived; `model_json.graph` stores layout metadata only.
- Deferred UX refinement includes drag-from-palette creation, richer validation panels, delete workflows, and advanced distribution/resource editing from the canvas inspector.
- Graph topology is derived from canonical model logic:
  - `ARRIVE(Customer, Queue)` creates Source → Queue.
  - C-event queue conditions and `ASSIGN(Queue, Server)` create Queue → Activity.
  - scheduled B-event `RELEASE(Server, Queue)` creates Activity → Queue.
  - scheduled B-event `COMPLETE()` or `RENEGE()` creates Activity → Sink.
- `graphLayoutFromDerivedGraph()` serializes layout metadata without derived edges.
- `model_json.graph` is preserved by model export/apply paths when present.
- Keep this helper pure and testable; do not import React, DOM, Supabase, or engine internals.

### Recently Completed — Sprint 8B

Sprint 8B completed on 2026-05-05.

- `validateModel()` recognises ARRIVE/COMPLETE effects from manual and generated models without false V8 warnings.
- Queue names with spaces work in macros, condition strings, validation, and generated dropdown values.
- Queue `customerType` is used to filter ARRIVE options so servers or wrong customer types cannot be added to incompatible queues.
- User-facing labels avoid raw macro vocabulary where possible and never show `template`.
- AI proposals produce service-start C-events with queue-size and idle-server conditions.
- A two-stage Patient -> Queue 1 -> Service 1 -> Queue 2 -> Service 2 -> Complete reference model is added as a regression gate.
- Remaining observation polish completed: clearer queue/entity/B-event/C-event wording, visible in-panel dirty/save state, concise server resource count on model cards, and friendly proposal modification summaries instead of raw JSON blocks.

### Recently Completed — Sprint 8

Sprint 8 implementation pass completed on 2026-05-05, but manual verification exposed model-definition coherence blockers that are now Sprint 8B.

- Added AI Generated Model tab, model-builder prompts, non-streaming provider-neutral model-builder calls, structured diff preview, validation-before-apply, partial section apply, and direct Apply & Save actions.
- Sprint 8 files include `src/ui/editors/AiGeneratedModelPanel.jsx`, `src/ui/editors/ModelDiffPreview.jsx`, `src/llm/model-builder-prompts.js`, and `src/llm/apiClient.js`.

### Recently Completed — Sprint 8A

Sprint 8A completed on 2026-05-05.

- Added `src/llm/contracts.js` for provider-neutral LLM requests.
- Preserved `streamNarrative()` while changing browser calls to send `kind`, `messages`, `maxTokens`, `stream`, and `responseFormat`.
- Refactored `supabase/functions/llm-proxy/index.ts` so provider and model selection are server-side.
- Added server-side config path: `LLM_PROVIDER`, `LLM_MODEL`, and `ANTHROPIC_MODEL`; `ANTHROPIC_API_KEY` remains server-only.
- Kept legacy Sprint 6 proxy payload compatibility for rollout.
- Focused tests passed: `npm test -- llm execute-panel`; typecheck passed.

### Recently Completed — Sprint 7

Sprint 7 completed on 2026-05-05.

- Added piecewise time-varying distributions with clock-aware sampling.
- Added `RATE_CHANGE` and `SHIFT_CHANGE` B-event markers.
- Added server shift schedules using server instance scaling.
- Extended validation, typed contracts, editor controls, and schema docs.
- Added focused engine and UI tests for time-varying distributions and shift schedules.

### Recently Completed — Sprint 7A

Sprint 7A completed on 2026-05-05.

- Accepted ADR-008 for near-term platform roles and durable user settings.
- `profiles.role` is the platform-role source of truth with initial roles `user` and `admin`.
- Model-level owner/editor/viewer access remains separate from platform roles.
- Durable user preferences should use a dedicated `user_settings` table.
- SaaS tenancy/workspaces and LLM provider switching are explicitly deferred follow-on architecture decisions.
- Accepted ADR-009: TypeScript is allowed incrementally, starting with schema/domain contracts rather than broad UI conversion.

### Recently Completed — Sprint 7B

Sprint 7B completed on 2026-05-05.

- Added Supabase migration for `profiles.role`, `is_platform_admin()`, and `user_settings`.
- Added owner-only `user_settings` RLS policies and updated timestamp trigger.
- Added `fetchUserSettings()` and `saveUserSettings()` DB wrappers.
- Normalized profile roles in the DB layer and exposed `isAdmin` without changing model permissions.
- Added TypeScript tooling, `npm run typecheck`, and first typed contracts for model JSON, run/result payloads, and user settings.
- Focused tests passed: `npm test -- db onboarding model-export contracts`.

### Previously Completed — Sprint 6

Sprint 6 completed on 2026-05-04.

- Added a collapsible AI Insights panel to the Execute view.
- Added prompt builders for KPI narrative, scenario comparison, and sensitivity commentary.
- Added a streaming LLM API client with cancellation, error fallback, and safe plain-text rendering.
- Added local Supabase Edge Function source for `llm-proxy`.
- Deployed `llm-proxy` to Supabase project `znkknldzdfajcrpabtmg`.
- Stored `ANTHROPIC_API_KEY` as a Supabase Edge Function secret.
- Installed the Supabase CLI as a local dev dependency.
- Added LLM prompt tests and Execute panel AI tests.

### Sprint 7A Completion Gate

```text
git diff --check -> succeeds
No product code changed
```

### Sprint 6 Completion Gate

```text
npm test       -> 32 files, 343 tests passed
npm test -- llm execute-panel -> 2 files, 14 tests passed
npm run build  -> succeeds
```

### Recent Architectural Decisions

- Use a bounded Web Worker pool rather than one worker per replication.
- Use local runner callbacks for same-browser live progress; persist final batch results to Supabase.
- Store one run row per replication batch with per-replication results and aggregate CI in `results_json`.
- Provide cancellation for active replication batches.
- See `docs/decisions/ADR-006-replication-runner-architecture.md`.
- No committed schema file confirms `simulation_runs` cascade on model delete; carry this as a data integrity risk until the next schema migration.
- ADR-008 is accepted: `profiles.role` stores platform roles (`user`, `admin`) and durable user settings belong in a dedicated `user_settings` table.
- ADR-009 is accepted: TypeScript may be introduced incrementally for shared contracts/domain boundaries. Existing JavaScript remains valid.
- Sprint 7B implemented the accepted ADR-008/ADR-009 foundation before dynamic distributions.
- Sprint 8A keeps provider and model choice server-side; browser code should use the neutral LLM request contract rather than provider-specific fields.

### Future-Claude Notes

- Sprint 6 LLM analysis is implemented in `src/ui/execute/index.jsx`, `src/llm/prompts.js`, `src/llm/apiClient.js`, and `supabase/functions/llm-proxy/index.ts`.
- Do not introduce client-side LLM API keys. `ANTHROPIC_API_KEY` belongs only in Supabase Edge Function secrets.
- `llm-proxy` is deployed to Supabase project `znkknldzdfajcrpabtmg`.
- Treat Anthropic as the first provider implementation behind `llm-proxy`, not as a browser-facing contract.
- Sprint 8 model-builder calls should use `src/llm/contracts.js` and the provider-neutral proxy request shape.
- Sprint 8 implementation files are `src/ui/editors/AiGeneratedModelPanel.jsx`, `src/ui/editors/ModelDiffPreview.jsx`, `src/llm/model-builder-prompts.js`, and `src/llm/apiClient.js`.
- Do not add local-only user settings that would need to follow a user across devices. Use the ADR-008 `user_settings` direction.
- Do not add tenant/workspace assumptions ad hoc. SaaS tenancy is not part of Sprint 7A and needs a later explicit schema/RLS planning pass.
- Execute panel is an MVP surface. Execute UX redesign is not part of Sprint 7A; keep it as a later design/refinement sprint.
- Sprint 8 may use or extend the typed contracts, but broad TypeScript conversion remains out of scope.
- ADR-007 establishes the product architecture for model creation: Forms/Tabs, AI Generated Model, and Visual Designer are three authoring modes over one canonical `model_json`.
- Do not build the old split-pane SVG hybrid visual designer as a bridge phase; plan the visual designer as the final graph-first authoring surface.
- Keep model import/export validation compatible with the current model JSON shape and the first-run M/M/1 sample in `src/App.jsx`.
- `deleteModel(id, userId)` is intentionally owner-guarded via `owner_id`; keep destructive model actions user-scoped.
- `ModelCard` behaves as a keyboard-reachable model selector with a nested delete action; preserve event isolation between select and delete.

### New Commands Or Environment Variables

- No new environment variables were introduced in Sprint 5.
- Useful Sprint 5 verification commands:
  - `npm test -- model-export model-import results-export`
  - `npm test -- accessibility delete-model onboarding`
  - `npm test`
  - `npm run build`
- Useful Sprint 6 verification commands:
  - `npm test -- llm execute-panel`
  - `npm test`
  - `npm run build`
- Useful Sprint 8A verification commands:
  - `npm test -- llm execute-panel`
  - `npm run typecheck`
  - `npm run build`
- Useful Sprint 8 verification commands:
  - `npm test -- llm ai-generated-model-panel model-diff-preview accessibility execute-panel`
  - `npm test`
  - `npm run typecheck`
  - `npm run build`

Server-side LLM deployment variables:

```text
ANTHROPIC_API_KEY
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

---

## 22. Historical Test Issues

### 22.1 Vitest "JS Heap Out of Memory" Error

**Issue:** Historical issue: the comprehensive `npm test` command (and `npm test -- engine`) previously failed with "JS heap out of memory" errors and "Worker terminated due to reaching memory limit" messages from Vitest.

**Symptoms:**
*   All individual test files, when run in isolation or in smaller groups (e.g., `npm test -- db`, `npm test -- ui`), pass successfully with zero failures.
*   The error occurs during the aggregation or concurrent execution phase of the full test suite, specifically affecting Vitest worker threads.
*   The test runner reports "Unhandled Errors" and exits with a non-zero code.

**Debugging Attempts:**
*   Implemented `vi.clearAllMocks()` in `tests/setup.js` to prevent mock call history accumulation.
*   Modified `vite.config.js` to configure Vitest worker `poolOptions` (e.g., `execArgv` for `--max-old-space-size`, `singleThread`). These attempts resulted in new configuration errors (`ERR_WORKER_INVALID_EXEC_ARGV`, `RangeError: options.minThreads and options.maxThreads must not conflict`).
*   Attempted to disable multi-threading in Vitest (`threads: false`) in `vite.config.js`, which also resulted in Vitest failing to run any tests.
*   Attempted to apply `NODE_OPTIONS=--max-old-space-size=4096` directly to `npm test` command (using PowerShell syntax: `$env:NODE_OPTIONS="--max-old-space-size=4096"; npm test`). This also did not resolve the issue, with the error persisting.

**Status:** Resolved 2026-05-04. The root cause was not Vitest configuration: two open-ended seeded engine tests ran `buildEngine(...).runAll()` without a simulation time bound. Because the engine records full snapshots in the log and arrivals keep growing the entity pool, those tests exhausted worker memory during collection/execution. The fix bounded those test runs with `maxSimTime = 50` and moved stale top-level `runAll()` calls into `beforeAll()`.

**Impact:** Full test suite execution is reliable again. Latest verification after Sprint 5: `npm test` passes 31 test files / 334 tests with zero unhandled worker errors.

---

*End of CLAUDE.md — if any section contradicts a prompt given during a session, this file takes precedence. Flag the contradiction rather than resolving it silently.*
