# Audit Part 4 — Simulation Engine

## Preliminary: No Python Engine Exists

**There are zero Python files in this repository.** No `.py`, no `requirements.txt`, no `pyproject.toml`, no `Pipfile`, no Jupyter notebooks, no SimPy dependency. The simulation engine is written entirely in JavaScript (ESM modules) and runs in the browser.

The engine entry point is `src/engine/index.js`. All analysis below refers to JavaScript source.

---

## Three-Phase Implementation

**The engine explicitly implements Pidd's Three-Phase method.** Phases A, B, and C are all present as discrete, labelled code blocks inside the `step()` function in `src/engine/index.js`.

### Phase A — Clock Advance
**File:** `src/engine/index.js` **Lines: 98–100**
```js
// Phase A — advance clock
clock = fel[0].scheduledTime;
cycleLog.push({ phase: "A", time: clock, message: `Clock → t=${clock.toFixed(3)}` });
```
Advances the simulation clock to the scheduled time of the first event in the Future Events List (FEL). The FEL is kept sorted in ascending time order (`sort((a,b) => a.scheduledTime - b.scheduledTime)`) after every insertion. Correct Phase A behaviour.

### Phase B — Fire Bound Events
**File:** `src/engine/index.js` **Lines: 102–116**
```js
// Phase B — fire all due events
const due = fel.filter(ev => Math.abs(ev.scheduledTime - clock) < 1e-9);
fel       = fel.filter(ev => Math.abs(ev.scheduledTime - clock) >= 1e-9);
for (const ev of due) { ... fireBEvent(ev, ctx) ... }
```
Removes all events exactly at T_now from the FEL (with floating-point tolerance `< 1e-9`) and fires them. Multiple simultaneous B-events are handled correctly in a single pass. Correct Phase B behaviour.

### Phase C — Conditional Scan
**File:** `src/engine/index.js` **Lines: 120–143**
```js
// Phase C — evaluate conditionals until stable
let cFired = true, cPass = 0;
while (cFired && cPass < 100) {
  cFired = false; cPass++;
  const firedThisPass = new Set();
  for (const ev of model.cEvents || []) {
    if (firedThisPass.has(ev.id)) continue;
    const h = makeHelpers(entities);
    if (!evalCondition(ev.condition, h, state, clock)) continue;
    ...
    firedThisPass.add(ev.id);
    cFired = true;
    ...
  }
  if (!cFired) { /* log "No C-events can fire → Phase A" */ }
}
```
Repeats a full scan of all C-events until a complete pass fires nothing. Each C-event can fire at most once per pass (`firedThisPass` set). Correct high-level structure.

---

## C-Scan Restart Rule — Deviation from Strict Three-Phase

**The restart-from-priority-1 rule is NOT fully implemented as prescribed.**

In Pidd's strict Three-Phase method, when any C-event fires the scan must **immediately restart from the highest-priority C-event** — i.e., break out of the current scan and return to position 0.

In the current implementation the restart happens **only at pass granularity**, not at individual-event granularity:

```js
while (cFired && cPass < 100) {
  cFired = false;
  for (const ev of model.cEvents || []) {   // ← completes the ENTIRE loop
    ...
    cFired = true;                           // ← set, but loop continues to next ev
    // ← no break here — scan continues to ev[i+1], ev[i+2], ...
  }
  // ← restart only happens here, after all C-events evaluated
}
```

**Consequence:** Within a single pass, when C-event at index `i` fires and changes system state (e.g., assigns a server, making another customer now serviceable), C-events at indices `0` through `i-1` are **not re-evaluated in the same pass**. They will only be re-checked on the next outer-`while` iteration. If a higher-index C-event's firing enables a lower-index C-event to fire, the lower-index event is delayed by one full pass before it is retried.

**Practical impact today:** Low, because:
1. There is no priority field — C-events have no declared priority and are evaluated in array order
2. `firedThisPass` prevents double-firing, so a C-event that fires in the middle of a pass cannot be retriggered by a later C-event in the same pass anyway
3. The outer `while` loop compensates by repeating until stable

The deviation would become observable with a model where C-event[3] enables C-event[0] to fire, and the user intended C-event[0] to have strict first-priority. In the current engine, C-event[0] would fire one pass later rather than immediately.

**The 100-pass hard cap** (`cPass < 100` at line 121) silently truncates Phase C with no user warning if the model is unstable. See Part 2 for details.

---

## Resource IDLE/BUSY Tracking

Server resource tracking is correct and consistent across the macro layer.

**Status field** on entity objects (defined in `src/engine/entities.js:24–31`):
- Servers: `"idle"` (pre-created at t=0) or `"busy"` (while serving a customer)
- Customers: `"waiting"`, `"serving"`, `"done"`, `"reneged"`

**State transitions via macros** (`src/engine/macros.js`):

| Macro | Server transition | Customer transition | Line |
|---|---|---|---|
| `ASSIGN(CType, SType)` | `idle → busy`, sets `currentCustId` | `waiting → serving`, sets `serviceStart` | 66–69 |
| `COMPLETE()` | `busy → idle`, deletes `currentCustId` | `serving → done`, sets `completionTime`, `sojournTime` | 100–113 |
| `RELEASE(SType[, queue])` | `busy → idle`, deletes `currentCustId` | `serving → waiting`, preserves `arrivalTime` | 142–151 |
| `RENEGE(ctx)` | — | `waiting → reneged`, sets `renegeTime` | 168–171 |
| `RENEGE_OLDEST(Type)` | — | oldest `waiting → reneged` | 186–191 |

**Query helpers** (`src/engine/entities.js:79–103` via `makeHelpers()`):
- `idleOf(type)` — filters `status === "idle"` (servers)
- `busyOf(type)` — filters `status === "busy"` OR `status === "serving"` (covers both server and customer sides of an active assignment)
- `waitingOf(type)` — filters `status === "waiting"`, sorted by `arrivalTime` ascending (FIFO)

**One structural note:** `makeHelpers(entities)` is called fresh on every C-event evaluation inside the Phase C loop (`index.js:127`), which is correct — it rebuilds the live view of the entity pool after each state change. However, `applyEffect` in `phases.js` also captures `helpers: makeHelpers(entities)` in `makeCtx()` at construction time. The context object passed into macros holds a potentially stale `helpers` snapshot. Within a single `applyEffect` call this is fine (the effect is atomic), but if a macro call updates entities and a downstream part of the same effect string calls `helpers.idleOf()` it reads the pre-mutation snapshot. In practice the effect strings are simple single-macro calls so this is not an issue today.

---

## Queue Discipline Enforcement

**Only FIFO is implemented. LIFO and Priority are UI-only and have no engine effect.**

`waitingOf(type)` in `src/engine/entities.js:84–88` always returns waiting entities sorted by `arrivalTime` ascending — this is FIFO by definition:
```js
waitingOf: (type) =>
  entities
    .filter(e => match(e.type, type) && e.status === "waiting")
    .sort((a, b) => (a.arrivalTime || 0) - (b.arrivalTime || 0)),
```

The `q.discipline` field stored on queue objects is **never read anywhere in the engine**. Confirmed by full-codebase grep: `discipline` appears only in `QueueEditor` (write path) and nowhere in `engine/`.

The ASSIGN macro uses `helpers.waitingOf(cType)[0]` for entity-type selection and a manual `filter(...).sort()` for queue-name selection — both are FIFO. There is no code path that checks queue discipline to alter selection order.

**Impact:** A model configured with LIFO or Priority discipline in the UI will behave identically to FIFO at runtime. No error or warning is issued.

---

## Unit Tests

**5 test files, ~120 test cases.** All use Vitest with `environment: 'node'` (no DOM required).

| File | Tests | What is covered |
|---|---|---|
| `conditions.test.js` | 14 | `evalCondition` — all token types, AND, OR, custom state vars, `attr()`, error recovery, empty string |
| `distributions.test.js` | ~20 | All 6 distributions: Fixed, Uniform, Exponential, Normal, Triangular, Erlang, ServerAttr; `sampleAttrs` legacy and array formats |
| `engine.test.js` | ~30 | `buildEngine` public API; initial state; `step()`; `runAll()` on M/M/1 and two-stage model; phase A/B/C log presence |
| `entities.test.js` | ~15 | `createServerEntities`, `makeHelpers` — FIFO ordering, case-insensitivity, idle/busy/waiting filters |
| `macros.test.js` | ~40 | All 5 macros (ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE, RENEGE_OLDEST) + `applyScalar` |

---

## M/M/1 Benchmark

**An M/M/1 fixture exists in `engine.test.js` but it is not an analytical benchmark.**

The fixture (lines 6–36 of `engine.test.js`) defines a model with:
- Customers arriving at t=0, inter-arrival ~ Exponential(mean=2)
- 1 Server with `serviceTime = Fixed(3)` (deterministic, not exponential)
- ASSIGN → COMPLETE flow

**This is actually an M/D/1 queue (deterministic service), not M/M/1** (which requires exponential service time). The test file names it "M/M/1" but the service distribution is `Fixed`, not `Exponential`.

The tests against this fixture check only qualitative properties:
- `summary.total > 0`
- `summary.served > 0`
- `summary.reneged === 0`
- `sojournTime > 0` for all done customers
- `stages.length === 1` for all done customers
- Log contains phases A, B, C
- `scalars.totalArrived === summary.total`

**There is no comparison against analytical M/M/1 (or M/D/1) theoretical values** such as:
- ρ (utilisation) = λ/μ → should be 0.5/0.333 = ~1.5 (this model is overloaded)
- Mean queue length L = ρ/(1-ρ)
- Mean waiting time W = ρ/(μ(1-ρ))
- Mean sojourn time

**No seeded RNG.** The engine uses `Math.random()` directly (confirmed in `distributions.js:84` and `phases.js:93,136`). There is no seeded RNG option. `engine.test.js:246` acknowledges this with an explicit `test.todo`:
```js
// TODO: engine uses Math.random (no seeded RNG). Two runs will not be identical.
test.todo('two runs with same seed produce identical summary.served');
```
This means:
1. Tests are non-deterministic — a simulation that produces `served=0` on a rare RNG draw would fail
2. Reproducibility of simulation runs (for debugging or comparison) is not supported
3. Variance reduction techniques (common random numbers, antithetic variates) are not possible

---

## Summary

| Aspect | Status |
|---|---|
| Python engine | **Absent** — engine is JavaScript only |
| SimPy or any process-based framework | **Absent** — fully custom implementation |
| Phase A (clock advance) | **Implemented** — `index.js:98` |
| Phase B (fire bound events at T_now) | **Implemented** — `index.js:103–116` |
| Phase C (conditional scan until stable) | **Implemented** — `index.js:120–143` |
| C-scan restart from priority 1 on any fire | **Not strict** — restarts at pass granularity, not event granularity (`index.js:121–142`) |
| Phase C infinite-loop guard | Present — 100-pass cap, but **silent** (no UI warning) |
| Resource IDLE/BUSY tracking | **Correct** — ASSIGN/COMPLETE/RELEASE macros, `idleOf`/`busyOf` helpers |
| Queue discipline FIFO | **Implemented** — `entities.js:86–88` |
| Queue discipline LIFO | **Not implemented** — UI only, engine ignores `q.discipline` |
| Queue discipline Priority | **Not implemented** — UI only, engine ignores `q.discipline` |
| Unit tests | **Present** — 5 files, ~120 tests |
| M/M/1 analytical benchmark | **Absent** — fixture exists but tests are qualitative only, and service distribution is Fixed (M/D/1), not Exponential |
| Seeded / reproducible RNG | **Absent** — `Math.random()` only, noted as `test.todo` |
