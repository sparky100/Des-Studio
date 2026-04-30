# Audit Part 3 — Predicate Builder & Condition Input

---

## 1. Structured Predicate Builder

**Exists — partially.** `ConditionBuilder` at `src/ui/editors/index.jsx:458` is a structured, row-based condition editor used exclusively inside `CEventEditor`. It avoids direct free-text input for conditions by composing a condition string from controlled UI elements.

Each clause row (`ConditionBuilder` rows) contains:
- A **token dropdown** — populated from the model's entity types (queue lengths, idle/busy counts), built-in counters (`served`, `reneged`), and custom state variables
- An **operator dropdown** — fixed set: `>`, `>=`, `<`, `<=`, `==`, `!=`
- A **value input** of `type="number"` — numeric only

The composed string is previewed live (`buildConditionStr(rows)`) and stored as a flat string in `ev.condition`.

There is **no free-text condition input surfaced to the user** in the normal flow. However the underlying string is evaluated via `new Function()` — see the Critical section below.

**B-events do not have conditions.** Only C-events have conditions. B-events are purely time-driven (FEL-scheduled).

---

## 2. Type Safety and Operator Filtering

**Partial — value input is typed; operators are not filtered.**

| Aspect | Status |
|---|---|
| Value input forced to `type="number"` | Yes — `editors/index.jsx:571` |
| Token `valueType` metadata defined | Yes — all tokens carry `valueType: 'number'` |
| Operators filtered per `valueType` | **No** — the same 6 operators appear for every token |
| String-type tokens | None — all tokens resolve to numeric quantities |
| Boolean operators | None — no `IS TRUE / IS FALSE` concept |

In practice, type unsafety is not a problem today because every token is numeric. But the `valueType` field on token objects (`conditions.js:94–125`) is defined and populated yet never consumed by the UI — it exists as unused scaffolding. If a non-numeric token (e.g., a string-valued server attribute) were added to the token list, the operator set would not auto-restrict.

The `attr(Type, attrName)` token reads the first idle server's attribute value. In `evalCondition` it is quoted if it is a string (`typeof v === "string" ? \`"${v}"\` : String(v)` at `conditions.js:54`). The ConditionBuilder always renders it alongside numeric operators — so comparing a string attribute with `>` would produce `"fast" > 0` which evaluates to `false` in JavaScript without error. No guard exists.

---

## 3. Compound AND/OR Condition Support

**Supported — flat only, no nested grouping.**

`ConditionBuilder` renders AND/OR toggle buttons between rows (lines `541–552`). The first row has no join connector; each subsequent row has a pill toggle for AND or OR.

Serialisation: `buildConditionStr(rows)` at `editors/index.jsx:420` concatenates clauses as:
```
TOKEN OP VALUE [AND|OR TOKEN OP VALUE ...]
```

Parsing: `parseConditionStr(str, tokens)` at `editors/index.jsx:427` round-trips back to rows using `split(/\b(AND|OR)\b/i)`.

**Limitations:**
- **No parentheses / grouping.** `(A AND B) OR C` cannot be expressed through the builder. It can only be stored if crafted externally (e.g., directly in the database).
- **Mixed AND/OR precedence is undefined.** The flat string `A AND B OR C` is evaluated by JavaScript via `new Function`, which applies standard JS operator precedence (`&&` before `||`). The ConditionBuilder gives no visual indication of this — a user who writes `A AND B OR C` may not realise B and C are grouped together, not A and B.
- **OR is tested** (`conditions.test.js:58`) only for a single OR case. No test covers mixed AND+OR chains.

---

## 4. Manual Priority Field Per Activity Node (C-Events)

**Absent.**

C-events are evaluated in **array-index order** — the order they appear in `model.cEvents[]`. In the engine's Phase C loop (`engine/index.js:124`):
```js
for (const ev of model.cEvents || []) { ... }
```

There is no `priority`, `weight`, or `order` field on any event type. The only way to control C-event evaluation order is to reorder rows in the `CEventEditor`, but there is no drag-to-reorder affordance — only delete-and-recreate. The CEventEditor uses `onChange([...events, blank()])` for add (`editors/index.jsx:604`) and `events.filter((_,idx)=>idx!==i)` for delete. No move-up / move-down buttons exist.

This is a functional gap: in models with multiple competing C-events (e.g., two ASSIGN rules for different server types), evaluation order determines which gets priority, but the user cannot set this explicitly or even see the implied priority numbers in the UI.

---

## 5. Filtered Entity Selection

### Conditional Filter on Entity
The C-event condition system supports filtering by:
- Queue length per type: `queue(Type).length`
- Server availability: `idle(Type).count`, `busy(Type).count`
- Server attribute: `attr(Type, attrName)` — reads from the **first idle server**, not a selected one

There is no filter by individual entity attribute (e.g., "select customer where `patience > 3`"). The ASSIGN macro always picks the first entity by FIFO arrival order (`entities.js:86–88`):
```js
.sort((a, b) => (a.arrivalTime || 0) - (b.arrivalTime || 0))
```
No priority-based selection, no attribute-conditioned selection.

### Queue Rule (Discipline)
`QueueEditor` exposes three discipline options: `FIFO`, `LIFO`, `Priority` (`editors/index.jsx:848–854`). The chosen discipline is stored in `q.discipline`.

**Critical gap: only FIFO is implemented in the engine.** `makeHelpers.waitingOf()` in `entities.js:84–88` always sorts by `arrivalTime` ascending regardless of the queue's discipline setting. `LIFO` and `Priority` are selectable in the UI but have zero effect on simulation behaviour. There is no engine code that reads `q.discipline`.

---

## 6. Model JSON Serialisation

The model is never explicitly serialised to JSON in the app — there is no "Export JSON" or "Import JSON" feature. Serialisation happens implicitly:

**Write path:** `toRow(model, userId)` in `db/models.js:29–43` maps the camelCase model object to Supabase column names. The Supabase JS client serialises the JSONB fields (`entity_types`, `state_variables`, `b_events`, `c_events`, `queues`) via `JSON.stringify` internally.

**Read path:** `norm(r)` in `db/models.js:9–26` maps snake_case column values back to camelCase. Arrays default to `[]` if absent.

**State variable initial values** are parsed via `JSON.parse(sv.initialValue)` in `engine/index.js:22` with a `try/catch` fallback to raw string. This is the only explicit `JSON.parse` call in the codebase.

**No schema versioning.** There is no `schemaVersion` field in the model structure. The `queues` column was added post-launch (as evidenced by the `console.warn` migration hint in `db/models.js:52–57`). Future schema additions will require similar ad-hoc migration notices with no automated handling.

**No model import/export.** A user cannot download a model as JSON, share it outside the app, or import one. Model portability is limited to the Supabase-based sharing mechanism.

---

## CRITICAL: Free-Text Condition / Logic Fields

The following fields accept unvalidated free-text strings that are either directly evaluated as JavaScript or used to construct evaluated expressions. Listed with file and line number.

### Direct simulation-logic free-text inputs

| # | Field | Component | File | Line | Execution path |
|---|---|---|---|---|---|
| 1 | B-event `effect` — custom input | `DropField` (custom mode) | `src/ui/editors/index.jsx` | **144–149** | → `applyEffect()` → macro match or `applyScalar()` → `new Function()` |
| 2 | C-event `effect` — custom input | `DropField` (custom mode) | `src/ui/editors/index.jsx` | **144–149** (shared component, triggered from line **677**) | → `applyEffect()` → `applyScalar()` → `new Function()` |

Both are activated when the user selects "Custom..." (value `__custom__`) from the respective `DropField` dropdowns. The text entered is stored verbatim in `ev.effect` and later executed by the engine.

**How `DropField` activates the free-text input** (`editors/index.jsx:129–153`):
```js
const DropField = ({value, onChange, options, color, placeholder}) => {
  const matched = options.some(o=>o.value===value&&o.value!=='__custom__'&&o.value!=='');
  const [custom, setCustom] = useState(!matched&&!!value);   // LINE 131 — auto-activates if stored value not in list
  ...
  {custom&&(
    <input value={value||''} onChange={e=>onChange(e.target.value)}   // LINE 145
      placeholder={placeholder||'Enter custom value'}
      .../>
  )}
```

Note line 131: `custom` state initialises to `true` whenever a stored effect value is not found in the generated options list. This means **any model stored in the database with a crafted effect string will automatically display in free-text mode** — there is no re-validation against the current option list on load.

### Indirectly evaluated free-text (database-level attack surface)

| # | Field | File | Line | Risk |
|---|---|---|---|---|
| 3 | C-event `condition` string (built by `ConditionBuilder`) | `src/engine/conditions.js` | **76** | String assembled from controlled dropdowns + `type="number"` input, but passed verbatim to `new Function()`. Safe if only UI-authored; unsafe if DB row is crafted directly. |
| 4 | `applyScalar` `VAR = expr` right-hand side | `src/engine/macros.js` | **220** | The right-hand side of `VAR = expr` scalar effects is evaluated via `new Function()`. Can reference other state variables, but also arbitrary JS if the effect string is crafted. |
| 5 | State variable `initialValue` | `src/ui/editors/index.jsx` | **330** | Stored as string, parsed via `JSON.parse()` in `engine/index.js:22`. `JSON.parse('1+1')` throws and falls back to the raw string `"1+1"` (not evaluated). Low risk but unexpected non-numeric values produce string state. |

### Distribution parameter inputs (numeric, low risk)

All distribution parameter inputs (`mean`, `value`, `min`, `max`, `stddev`, `k`, `attr`) are plain `<input>` elements without `type="number"` enforcement (`editors/index.jsx:171`, `241`, `731`; `components.jsx:63`). They are parsed via `parseFloat()` in the distribution samplers, which silently returns `NaN` → `0` for non-numeric input. This produces incorrect simulation results without any error.

---

## Summary

| Feature | Status |
|---|---|
| Structured predicate builder | Exists (`ConditionBuilder`) — C-events only |
| Type safety (operator filtering by token type) | Partial — value is `type="number"`, operators not filtered |
| Compound AND/OR | Flat chains only — no nested grouping / parentheses |
| Priority per C-event | **Absent** — implicit array order, no drag-to-reorder |
| Conditional entity filter (attribute-based) | **Absent** — type-level only, no per-entity attribute filter |
| Queue discipline (LIFO, Priority) | UI options exist but **engine only implements FIFO** |
| Model JSON export/import | **Absent** — Supabase-only persistence |
| Schema versioning | **Absent** |
| Free-text effect inputs with `new Function()` path | **2 direct UI inputs** (B-event effect, C-event effect custom mode) |
| Indirect eval surface (DB-crafted strings) | **3 paths** (condition string, scalar `VAR=expr`, distribution params) |
