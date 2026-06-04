# Sprint 80 — SimPy Export

**Status:** Implemented  
**Branch:** `claude/third-party-interop-assessment-L9iJh`  
**Scope:** Option A from the Sprint 80 third-party interoperability assessment — SimPy export only.

---

## Goal

Provide a one-click export of any DES Studio (simmodlr) model as a runnable SimPy
Python simulation script, with no round-trip import, no new npm dependencies, and
no breaking changes to existing functionality.

---

## Deliverables

| File | Status | Description |
|---|---|---|
| `src/engine/simpy-export.js` | ✅ | Core export engine — pure function, no UI deps |
| `src/ui/editors/SimPyExportModal.jsx` | ✅ | Modal: completeness card, TODO macro list, download button |
| `src/ui/ModelDetailHeader.jsx` | ✅ | Added `onExportSimPy` prop; renders "⬇ SimPy" button |
| `src/ui/ModelDetail.jsx` | ✅ | Wires handler, renders modal, adds Export SimPy row in Access tab |
| `tests/engine/simpy-export.test.js` | ✅ | Vitest suite — 50+ assertions across all export paths |
| `docs/user/simpy-export.md` | ✅ | User-facing documentation |
| `docs/reviews/sprint-80-simpy-export.md` | ✅ | This file |

---

## Architecture

### Engine (`src/engine/simpy-export.js`)

Public API:
```js
exportToSimPy(model)
// → { script: string, category: 1 | 2, todoMacros: string[] }
```

**Category 1:** all macros have a full SimPy translation. Script runs as-is.  
**Category 2:** one or more macros in `TODO_MACRO_SET` are detected. Each is
replaced with an annotated `# TODO` stub showing the idiomatic SimPy pattern.
All models produce at least a Category 2 script — the export never fails.

**TODO_MACRO_SET:** `RENEGE`, `BATCH`, `RENEGE_OLDEST`, `MATCH`, `FAIL`, `REPAIR`, `PREEMPT`

### Script generation pipeline

```
model
  ↓ collectTodoMacros()     — scan all effects for TODO macros
  ↓ buildScript()
      ├─ header docstring
      ├─ imports
      ├─ configuration constants (from experimentDefaults)
      ├─ distribution samplers (_exp, _uniform, _normal, _triangular, _fixed, _erlang, _lognormal)
      ├─ state variables (module-level Python vars)
      ├─ entity @dataclasses (one per customer entity type)
      ├─ Stats class
      ├─ arrival generators (B-events with ARRIVE)
      ├─ service monitor + service generators (C-events with ASSIGN or COSEIZE)
      ├─ shift schedule processes (servers with shiftSchedule)
      ├─ TODO stubs (category 2 only)
      ├─ run_replication(seed)
      └─ __main__ block (replication loop + summary stats)
```

### C-event → B-event connection

Service routing is resolved via `cSchedules[0].eventId` → B-event lookup, with
a heuristic fallback (single B-event with `COMPLETE()` and no schedule).
The completion B-event's routing table (`routing`, `probabilisticRouting`,
`defaultQueueName`) generates the post-service routing block.

### Multi-resource seize (COSEIZE)

Translated to `simpy.AllOf(env, [req0, req1, ...])` so all resources are seized
simultaneously before service begins. Resources are released in a `finally` block.

### DRAIN semantic note

DES Studio `DRAIN` fails immediately if level < amount (guard semantics).
SimPy `Container.get()` blocks. Noted in the generated script with an explicit
comment and documented in user docs. Not classified as a TODO macro because the
script remains runnable.

---

## UI flow

1. User clicks **⬇ SimPy** in the header bar (always visible) **or** clicks
   **Export SimPy** in the Access tab → Export section.
2. `SimPyExportModal` opens, calls `exportToSimPy(model)` on mount.
3. Modal shows:
   - **Category badge** (green = complete, amber = partial)
   - Description of what needs manual work (category 2 only)
   - Amber chips listing each TODO macro
   - Output filename
   - `pip install simpy` hint
4. **Download .py** triggers `downloadTextFile()` and closes the modal.

Filename convention: `{slugifyResultName(model.name)}_simpy.py`

---

## Testing

**Test file:** `tests/engine/simpy-export.test.js`

Coverage:
- Return shape
- Category 1 / Category 2 classification
- TODO macro detection and sorting
- Script header (model name, category label, TODO list)
- Configuration constants (with and without experimentDefaults)
- Arrival process generation (function name, distribution, entity class, store put)
- Service process generation (monitor + serve function, all distribution types)
- COSEIZE → simpy.AllOf
- Entity @dataclass generation (customer vs. server types)
- Resource capacity (explicit count, default 1)
- Queue store generation (unbounded and bounded)
- Container generation + DRAIN note
- State variable declaration and reset
- run_replication structure (env.run, return dict)
- Main block (__main__ guard, replication loop, summary)
- TODO stubs (RENEGE, BATCH, FAIL present / absent in category 1)
- Multi-stage routing via defaultQueueName
- Empty model edge case

---

## Design decisions

| Decision | Rationale |
|---|---|
| Pure string generation, no Python AST | Zero new dependencies; Python AST libs are not available in the browser |
| No "cannot export" category | Every model produces a script; this prevents dead ends for the user |
| DRAIN not in TODO set | Semantic difference is small and documented; script is still runnable |
| Header button always visible | SimPy export is a read-only operation — no canEdit guard needed |
| Modal calls exportToSimPy on mount | Keeps the computation out of the event handler for responsiveness |

---

## Macro support matrix

| Macro | Category | Notes |
|---|---|---|
| ARRIVE | 1 | Arrival generator with inter-arrival dist |
| ASSIGN | 1 | Service monitor + service generator |
| COSEIZE | 1 | simpy.AllOf for simultaneous multi-resource seize |
| COMPLETE | 1 | Entity exit; stats.served |
| RELEASE | 1 | Route entity to target queue |
| FILL | 1 | Container.put() |
| DRAIN | 1* | Container.get(); semantic note included |
| SPLIT | 1 | Handled in routing block |
| SET | 1 | Module-level global assignment |
| SET_ATTR | 1 | `setattr(entity, ...)` |
| COST | 1 | `stats.total_cost +=` |
| UNBATCH | 1 | Put each sub-entity to target store |
| RENEGE | 2 | `yield req \| env.timeout(patience)` — stub provided |
| BATCH | 2 | Accumulate N entities — stub provided |
| RENEGE_OLDEST | 2 | Pop from store.items — stub provided |
| MATCH | 2 | Pair from two stores — stub provided |
| FAIL | 2 | `resource._capacity = 0` — stub provided |
| REPAIR | 2 | Restore capacity — stub provided |
| PREEMPT | 2 | simpy.PreemptiveResource — stub provided |

\* DRAIN semantic divergence documented; script is runnable.

---

## Out of scope (this sprint)

- BPMN 2.0 XML import (Option B — separate sprint)
- Arena/Simul8 CSV import (Option C — separate sprint)
- Round-trip import of SimPy scripts
- SimPy → DES Studio model conversion
- SimPy version compatibility below 4.x
