# Audit Part 2 — DAG Designer / Node & Graph Components

## Critical Finding: No Visual Canvas Exists

DES Studio does **not** have a canvas, node-graph, or DAG designer. The "model graph" (relationships between entity types, B-events, C-events, and queues) is captured entirely through structured form editors. There are no drag-and-drop nodes, no edges rendered on a canvas, and no graph layout algorithm. This audit therefore covers the form-based model editors that serve as the structural definition layer.

---

## Node Types and Custom Components

The simulation model has five structural element types, each with a dedicated editor component:

| Element | Editor Component | File |
|---|---|---|
| Entity Types (customers + servers) | `EntityTypeEditor` | `src/ui/editors/index.jsx:265` |
| State Variables | `StateVarEditor` | `src/ui/editors/index.jsx:312` |
| B-Events (bound, scheduled in FEL) | `BEventEditor` | `src/ui/editors/index.jsx:341` |
| C-Events (conditional, Phase C) | `CEventEditor` | `src/ui/editors/index.jsx:595` |
| Queues | `QueueEditor` | `src/ui/editors/index.jsx:789` |

All five editors are fully custom — no third-party graph library is used anywhere in the project.

### Supporting sub-components

| Component | Purpose | Location |
|---|---|---|
| `AttrEditor` | Per-entity attribute definitions with distribution pickers | `editors/index.jsx:187` |
| `DistPicker` | Distribution type + param inputs | `editors/index.jsx:157` |
| `DropField` | Dropdown with optional custom free-text fallback | `editors/index.jsx:129` |
| `ConditionBuilder` | Structured AND/OR clause builder for C-event conditions | `editors/index.jsx:458` |

### Entity schema (`EntityTypeEditor` + `AttrEditor`)

Each entity type has: `id`, `name` (title-cased on blur via `normTypeName`), `role` (`customer` or `server`), `count` (servers only), `attrDefs[]`, and `description`.

`AttrEditor` is nested inside `EntityTypeEditor` and manages per-entity attribute definitions. Each attribute has: `id`, `name`, `dist` (distribution key), and `distParams` (distribution parameters as strings). Attributes are sampled per-arrival for customers and per-server-creation for servers via `sampleAttrs()` in `distributions.js`.

### Event-to-event "edges" (the implicit DAG)

The graph relationships are encoded in data, not rendered visually:

- **B-events → B-events**: Each B-event has a `schedules[]` array. Each schedule row has `{ eventId, dist, distParams, isRenege }`. `eventId` references another B-event's `id`. This is how arrivals chain into service-complete events.
- **C-events → B-events**: Each C-event has a `cSchedules[]` array. Each entry has `{ id, eventId, dist, distParams, useEntityCtx }`. `eventId` references a B-event's `id`.

There is no rendering or validation of these references as a graph — they are raw ID foreign keys stored in JSONB.

---

## Node CRUD

### Create
Each editor exposes an `add()` function triggered by a `+ Add X` button:
- Pushes a blank object with a `Date.now()`-based `id` into the parent array
- Propagates up via `onChange(newArray)` → `setField(field, value)` in `ModelDetail` → marks `dirty = true`

### Update
Each editor has `upd(index, field, value)` which spreads a patch into the array and calls `onChange`. Name normalisation (`normTypeName`) fires on `onBlur` for entity type names only.

### Delete
Each row has a `✕` button that calls `rem(index)`, filtering the item by index from the array.

### Undo / Redo
**None.** There is no undo stack anywhere in the codebase. A deletion is permanent until the user navigates away without saving (which reverts to the last persisted state) or manually re-adds the item. This is a significant UX gap — especially for B-event schedule rows nested two levels deep.

---

## DAG Validation Layer

### Cycle detection
**None.** There is no cycle detection over the event→event reference graph. A B-event that schedules itself (directly or through a chain) will add FEL entries indefinitely. The only guard is `maxCycles = 800` in `buildEngine()` — after 800 Phase A→B→C cycles the engine stops silently. No error or warning is surfaced to the user.

### Disconnected node detection
**None.** Entity types, queues, or state variables that are defined but not referenced by any event are allowed silently. The UI renders them normally.

### Invalid B-event reference detection
**None.** If a B-event schedule or C-event cSchedule references a `eventId` that no longer exists (e.g., the referenced B-event was deleted), the engine silently skips it with `if (!tmpl) continue` in `phases.js:91` and `phases.js:125`. The editor dropdowns still show the stale ID as a blank `— select B-event —` selection (the `<option>` would not match any item), which is a silent data corruption vector.

### Phase C infinite loop guard
`engine/index.js:121` — `while (cFired && cPass < 100)`. If a C-event fires another C-event condition in a cycle, the loop runs up to 100 passes then stops silently. **No warning is logged to the UI log**, and the simulation proceeds as if Phase C is stable.

### Inline validation errors
**None.** There is no field-level validation in any editor. Empty names, empty conditions, and empty effects are all accepted. The engine will silently mishandle them (e.g., `evalCondition` returns `false` on empty string; `applyEffect` is a no-op on empty string).

---

## Canvas State Persistence

There is no canvas — the model data (entity types, events, queues) is persisted to Supabase via `saveModel()` in `db/models.js`. The persistence layer stores everything as JSONB columns on the `des_models` table.

**Save flow:**
1. Any field edit calls `setField(f, v)` in `ModelDetail`, which sets `dirty = true`.
2. A "Save" button appears in the header only when `canEdit && dirty`.
3. Clicking Save calls `overrides.onSave(model)` → `saveModel(model, uid)` → Supabase `upsert`.
4. On success, `setDirty(false)` and `onRefresh()` are called.

**No auto-save.** If a user edits a model and navigates away (`← Back`) without saving, all changes are silently lost. The back button calls `onBack()` which triggers `loadData()` from the database, discarding local state.

**Simulation state** (FEL, clock, entity pool) is entirely in-memory in `engineRef` (`useRef`) in `ExecutePanel`. It is not persisted and is reset on page reload, when `⟳ Reset` is clicked, or when the Execute tab is unmounted.

---

## UI Bugs, TODOs, and Null-Crash Risks

### 1. `DistPicker` in `components.jsx` references undefined `DISTRIBUTIONS`
**File:** `src/ui/shared/components.jsx:49–71`  
`DistPicker` is defined and exported from `components.jsx` but references `DISTRIBUTIONS` which is never imported in that file. If any code ever imports `DistPicker` from `components.jsx` (rather than from `editors/index.jsx` where it is correctly defined with the import), it will throw `ReferenceError: DISTRIBUTIONS is not defined`. The `TOKEN_COLORS` and `tokenColor` constants on lines 76–77 of `components.jsx` are also dead code — they duplicate the definitions in `execute/index.jsx` but are not exported. **Severity: latent crash.**

### 2. Hardcoded `const owner = null` in `ModelCard`
**File:** `src/ui/ModelDetail.jsx:170`  
`const owner=null;` — the owner display block (`Avatar` + name span) always renders empty. The `fmtDate(model.updatedAt)` call formats the updated timestamp from `model.updatedAt` (camelCase), but the `norm()` function in `models.js` populates this as `updatedAt: r.updated_at`. The field name is correct, but `owner` is unconditionally `null` so the avatar column is always invisible. **Severity: cosmetic / dead code.**

### 3. Stale version tag `"v6"` in `ModelDetail` header
**File:** `src/ui/ModelDetail.jsx:62`  
`<Tag label="v6" color={C.purple}/>` is hardcoded. `package.json` reports `v7.0.0`. **Severity: minor cosmetic.**

### 4. `ConditionBuilder` stale initialisation on prop change
**File:** `src/ui/editors/index.jsx:495`  
```js
const [rows, setRows] = useState(()=>parseConditionStr(value, tokens));
```
`useState` initialiser runs only once on mount. `tokens` is rebuilt on every render from `entityTypes`, `stateVariables`, and `queues` props. If the user adds a new entity type while a C-event's condition builder is open, the available tokens in the builder will not update until the component is remounted (tab switch or re-open). Existing row `token` values may reference a type that no longer exists or miss a newly added one. **Severity: moderate UX bug.**

### 5. Duplicate condition options for customer queue lengths
**File:** `src/ui/editors/index.jsx:33–44`  
`conditionOptions()` adds `queue(X).length > 0` and `queue(X).length == 0` for customer types both in the queue-only block (lines 17–22) and again via `custs.forEach` (lines 33–36). Combined with the queue+server block, this results in triplicate entries for any model that has both queues and customer types defined. **Severity: minor UX.**

### 6. `new Function()` eval in condition evaluator and scalar applier
**File:** `src/engine/conditions.js:76`, `src/engine/macros.js:220`  
```js
return !!new Function(`return (${expr})`)();
```
The condition evaluator and the `VAR = expr` scalar effect both use `new Function` (equivalent to `eval`). The input is constructed from model data including custom condition strings typed freely by users via the `DropField` custom input. A user entering a malicious custom effect or condition string in the editor can execute arbitrary JavaScript in their own browser context (self-XSS). In a multi-user model-sharing app (models with `visibility: "public"` are shared with all users), a crafted model could execute code in another user's browser when they open and run it. **Severity: moderate security risk in a shared/multi-user context.**

### 7. No model validation before simulation run
**File:** `src/ui/execute/index.jsx:141–147`  
`initEngine()` calls `buildEngine(model)` unconditionally. There is no pre-flight check for:
- Entity types with empty names (engine will create entities with type `""`)
- B-events with no effect (no-op, not flagged)
- C-events with no condition (evaluates to `false` always, not flagged)
- Schedule `eventId` references pointing to deleted B-events (silently skipped)
**Severity: moderate — leads to confusing simulation results with no feedback.**

### 8. `ModelDetail` model state is not refreshed on `onRefresh`
**File:** `src/ui/ModelDetail.jsx:10–21`  
`model` state is initialised from `modelData` prop via `useState(() => ...)` on mount. When `onRefresh()` is called (e.g., after save), `App.jsx` reloads data from Supabase and re-renders `ModelDetail` with a new `modelData` prop, but the local `model` state is NOT synced from the updated prop — `useState` does not re-run its initialiser when props change. This means after a save+refresh cycle, if the server returned a different value (e.g., a trigger updated `updated_at`), `ModelDetail` still holds the pre-refresh snapshot. **Severity: low — no data loss, but the displayed state can drift from the DB.**

### 9. `doRunAll` / `doStep` interoperability gap
**File:** `src/ui/execute/index.jsx:185–210`  
`doRunAll` creates its own fresh `buildEngine(model)` instance and does **not** assign it to `engineRef.current`. After a `Run All` completes, `mode` is set to `"done"` and the Step button is disabled — but `engineRef.current` still holds the last engine from `initEngine()`. If the user hits Reset after Run All, `initEngine()` will recreate the engine correctly, but there is a window where `engineRef.current` is stale. **Severity: low — guarded by `mode === "done"` disabling Step.**

### 10. Phase C over-iteration silently truncated, no log entry
**File:** `src/engine/index.js:121–143`  
When the Phase C loop hits 100 iterations (`cPass < 100`), it stops without adding any log entry or setting any error state. The UI log shows normal C-phase entries up to the truncation point and then Phase A of the next cycle — the user cannot distinguish a correctly-stabilised Phase C from a silently-truncated one. **Severity: moderate — model defects are invisible.**

### 11. `ModelDetail` stats panel shows Queues count as zero
**File:** `src/ui/ModelDetail.jsx:78–92`  
The MODEL STRUCTURE overview grid shows five stats: Entity Types, State Vars, B-Events, C-Events, Runs. Queues is defined as a first-class data structure (v6 → v7 addition per the schema migration comment in `models.js`), but it is not included in the stats panel. **Severity: cosmetic omission.**

### 12. Missing `stats` field null guard for runs count
**File:** `src/ui/ModelDetail.jsx:85`  
```js
{label:"Runs", value:model.stats?.runs||0, color:C.green}
```
`model.stats` is not populated by `norm()` in `models.js` — it returns undefined always. The `?.` operator prevents a crash but the value is always `0` regardless of actual run history. Run count in the stats panel is always zero. **Severity: cosmetic.**

---

## Summary Table

| Area | Status |
|---|---|
| Visual canvas / node graph | **Absent** — form-based editors only |
| Node types | 5 types: EntityType, StateVar, BEvent, CEvent, Queue |
| Node CRUD | Add / Update / Delete — all present |
| Undo / Redo | **Missing** |
| Entity schema editor | Present (`EntityTypeEditor` + `AttrEditor`) with distribution-sampled attributes |
| DAG cycle detection | **Missing** |
| Disconnected node detection | **Missing** |
| Stale event-ID reference detection | **Missing** |
| Inline validation errors | **Missing** |
| Phase C loop guard | Present but silent (100-pass cap, no UI warning) |
| Canvas / model state persistence | Supabase JSONB save; manual Save button; no auto-save |
| Simulation state persistence | In-memory only; lost on reset/reload |
| Security: `new Function()` eval | Present in condition evaluator and scalar applier |
