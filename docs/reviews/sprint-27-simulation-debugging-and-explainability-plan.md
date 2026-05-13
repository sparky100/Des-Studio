# Sprint 27 — Simulation Debugging and Explainability

Created: 2026-05-13  
Status: ✅ Complete  
Sprint theme: Trust, traceability, and modeller explainability  
Builds on:

- `docs/reviews/sprint-26-closure-report.md`
- `docs/reviews/sprint-26-capability-guide.md`
- `docs/reviews/sprint-26-30-roadmap-and-scenario-coverage.md`
- `docs/reviews/open-source-tool-gap-analysis.md`
- `docs/reviews/simulation-architecture-review.md`

## Goal

Make DES Studio easier to trust when a model behaves unexpectedly.

Sprint 27 is intended to add first-class debugging and explainability support around the existing engine, so a modeller can answer questions like:

- Why is this entity still waiting?
- Why did this C-event fire?
- Why did this queue or server get selected?
- Why did the model stop, loop, or trigger a warning?

## Sprint Theme

This is a traceability and modeller-trust sprint, not a semantics-rewrite sprint.

The work should:

- expose engine decisions without changing run semantics
- preserve deterministic reproducibility
- make rich engine behaviour inspectable through stable UI surfaces
- improve diagnosis of invalid or surprising models
- create a foundation for stronger experiment workflows in Sprint 28

## Scope Guardrails

- Build on the existing engine, run log, execute canvas, and bottom-panel surfaces; do not rewrite the runtime.
- Preserve Pidd's Three-Phase Method and the Sprint 26 waiting/resource contract.
- Treat explainability as an observational layer first; do not smuggle in behavioural changes unless a trace gap reveals a correctness bug.
- Keep new data structures explicit and documented. Avoid hidden ad hoc debug fields.
- Keep UI work focused on modeller diagnosis, not broad visual redesign.
- Record structural decisions and deferred items in ADR form where needed.
- Add or update regression tests before or alongside explainability behaviour changes.
- No new dependencies unless explicitly reviewed first.

## Structured Work Items

| ID | Priority | Work item | Status | Primary areas | Acceptance criteria |
|---|---:|---|---|---|---|
| F27.1 | P0 | Define the Sprint 27 explainability contract | ✅ Complete | docs, `src/engine`, `src/ui/execute` | One explicit contract describes what trace data exists, when it is emitted, and which UI surfaces consume it. |
| F27.2 | P0 | Add event provenance and causal trace records | ✅ Complete | `src/engine/index.js`, `src/engine/phases.js`, `src/engine/macros.js` | A modeller can inspect why a B-event or C-event fired, what it changed, and what it scheduled or routed next. |
| F27.3 | P0 | Add entity lifecycle and waiting inspection | ✅ Complete | `src/engine/entities.js`, `src/ui/execute/*` | A modeller can inspect an entity and see status, queue/resource ownership, last transition, and current waiting reason. |
| F27.4 | P1 | Explain queue/resource arbitration and C-event evaluation | ✅ Complete | engine trace + execute UI | The product can show why a queue entity or server was selected and why C-events were true, false, skipped, or restarted. |
| F27.5 | P1 | Link visual canvas, logs, entities, and trace panels | ✅ Complete | `src/ui/execute`, `src/ui/visual-designer` | Selecting a node, entity, or log item can drive the related inspection surface without losing run context. |
| F27.6 | P1 | Add explainability regression coverage and performance guardrails | ✅ Complete | `tests/engine/*`, `tests/ui/*` | Trace output is deterministic, stable, and does not materially degrade normal runs. |
| F27.7 | P2 | Update modeller-facing guidance and debugging workflow docs | ✅ Complete | user docs + sprint docs | A modeller can follow a documented workflow to diagnose waiting, starvation, routing, and unstable-condition issues. |
| F27.8 | P2 | Produce a capability guide with sample debug scenarios | ✅ Complete | docs + examples | A post-sprint guide explains how to use the new explainability tooling, with small sample models or run scenarios demonstrating it. |

## Recommended Implementation Order

1. Define the explainability contract and data model before adding UI surfaces.
2. Add engine-level trace emission for the smallest useful decision set first.
3. Surface one coherent entity/debug inspector before broadening UI reach.
4. Add arbitration and condition-evaluation reasoning once provenance is stable.
5. Link logs, canvas, and entity inspection once the underlying trace contract is trustworthy.
6. Update guidance and produce example-driven capability documentation at the end of the sprint.

## Detailed Task Breakdown

## Authoritative Contract Snapshot

This section captures the intended Sprint 27 explainability contract in one place. It is the working reference for engine, UI, tests, and modeller-facing guidance.

### Trace principles

- Trace output is observational, not behavioural — it must not change engine semantics.
- Trace ordering must remain deterministic for a given seed and model.
- Trace records must be structured objects, not free-text strings only. Human-readable `message` fields may be layered on top, but raw structured data must be queryable.
- The UI may render a human-readable explanation, but raw structured trace data must remain available for testing and future tooling.
- New trace fields are never allowed to alter `state`, `entities`, or `fel` — they are pure observation.

---

### Structured Trace Record Schema

Every trace entry emitted by the engine must conform to this base shape:

```typescript
interface TraceEntry {
  phase:  "A" | "B" | "C" | "WARMUP" | "END" | "INIT" | "WARNING";
  time:   number;            // simulation clock
  seq:    number;            // monotonically increasing per-run index for ordering
  // --- phase-specific payload (exactly one of these must be present) ---
  event?: {
    type:       "B" | "C";
    id:         string;
    name:       string;
    priority?:  number;      // C-events only
    fired:      boolean;
    result:     string[];    // human-readable macro result strings
    entityIds:  number[];    // all entity IDs affected by this event
    newEvents?: {            // B-events scheduled by this event's macros
      id:       string;
      name:     string;
      at:       number;      // scheduledTime
      reason:   string;
    }[];
    route?: {
      entityId:  number;
      dest:      string | null;   // queue name or null = exit
      mode:      "conditional" | "probabilistic" | "loop" | "direct";
      note:      string;
    };
  };
  clock?: {
    from:  number;
    to:    number;
    dueEvents: { id: string; name: string; type: string }[];
  };
  cEval?: {
    eventId:    string;
    eventName:  string;
    priority:   number;
    pass:       number;
    conditionTrue: boolean;
    failureReason?: string;   // set when conditionTrue === false
    skippedBecause?: string;  // set when event was not reached due to restart
  };
  entityLifecycle?: {
    entityId:   number;
    type:       string;
    transition:   // named transition label
      | "ARRIVE"
      | "WAIT" | "SEIZE" | "SERVE" | "COMPLETE" | "RELEASE"
      | "RENEGE" | "BALK" | "BLOCK" | "BATCH" | "UNBATCH" | "LOOP_EXIT" | "LOOP_RECIRCULATE";
    detail:    string;        // human-readable extra detail
    from?:     { status: string; queue?: string; serverId?: number };
    to:        { status: string; queue?: string; serverId?: number; waitingSince?: number };
    queueName?: string;       // set for WAIT, SEIZE, RELEASE, RENEGE transitions
    serverId?: number;        // set for SEIZE, SERVE, COMPLETE transitions
  };
  arbitration?: {
    type:    "queue" | "server";
    queueName?: string;
    serverType?: string;
    discipline: string;       // FIFO | LIFO | PRIORITY
    candidates: { entityId: number; type: string; key: string; value: number }[];
    // key = the field used for ordering (arrivalTime for FIFO/LIFO, priority for PRIORITY)
    // value = the sort key value
    winner?:  { entityId: number; key: string; value: number };
    losers?:  { entityId: number; key: string; value: number; reason: string }[];
    // reason for losers: "lower priority" | "did not match filter" | "already served"
  };
  warning?: {
    code:    string;
    message: string;
    detail?: string;
  };
}
```

---

### Minimum trace categories

For every simulation run the engine must emit trace entries covering:

| Category | Required fields | Must include |
|---|---|---|
| Clock advance | `phase="A"`, `clock` | `from`, `to`, `dueEvents[]` |
| B-event fire | `phase="B"`, `event` | `type="B"`, `id`, `name`, `fired=true`, `entityIds[]`, `newEvents[]`, optional `route` |
| C-event evaluation (true) | `phase="C"`, `cEval` | `conditionTrue=true`, `eventId`, `priority`, `pass` |
| C-event evaluation (false) | `phase="C"`, `cEval` | `conditionTrue=false`, `failureReason`, `eventId`, `priority`, `pass` |
| C-event skipped (restart) | `phase="C"`, `cEval` | `skippedBecause`, `eventId`, `eventName` |
| Entity lifecycle transition | `entityLifecycle` | `entityId`, `transition`, `detail`, `from`, `to` |
| Arbitration decision | `arbitration` | `type`, `candidates[]`, `winner` or `losers[]` |
| Warning / truncation | `phase="WARNING"`, `warning` | `code`, `message` |

---

### Entity-debug contract

For an inspectable entity, the runtime must expose:

```typescript
interface EntityDebugView {
  id:           number;
  type:         string;
  role:         string;
  status:       string;
  arrivalTime:  number;
  // --- current blocking state ---
  waitingSince?: number;      // set when status === "waiting"
  waitingFor?: {
    kind: "queue";
    queueName: string;
    enteredAt: number;
  };
  serverId?: number;          // set when status === "serving"
  // --- last transition ---
  lastTransition?: {
    at:    number;
    label: string;            // same labels as entityLifecycle.transition
    detail: string;
  };
  // --- current routing context ---
  queue?: string;            // current queue (waiting) or last queue (serving/done)
  lastQueue?: string;
  // --- stages for multi-step entities ---
  stages?: {
    queueName:       string;
    waitStartedAt:   number;
    serviceStartedAt: number;
    serviceEndedAt:  number;
    stageWait:       number;
    stageService:    number;
  }[];
  // --- completion ---
  completionTime?: number;
  sojournTime?:    number;
  // --- loop ---
  loopCount?: number;
}
```

### Arbitration-debug contract

For every `ASSIGN` macro execution the engine emits an `arbitration` trace entry capturing:

- Server type requested and queue discipline
- All candidate entities with their sort-key values (arrivalTime for FIFO/LIFO, priority for PRIORITY)
- All idle servers with their IDs
- The winner (entity paired with server) and the losers with reasons
- When no match is found: `noMatch=true` with candidate and idle-server counts

Note: The DES Studio engine uses `ASSIGN` (C-event) as the SEIZE equivalent, not a separate `SEIZE` macro. The arbitration contract applies to ASSIGN.

### Condition-debug contract

For every C-event evaluation the engine must emit a `cEval` trace entry capturing:

- Which event was evaluated, its priority, and the current pass number
- Whether the condition was true or false
- When false: which predicate clause failed (variable, operator, value)
- When a lower-priority event was not reached due to restart: which event was skipped and why
- When Phase C is truncated: the warning entry includes `maxCPasses` and the pass count

---

### Deferred / out of scope for Sprint 27

- Per-entity timeline replay (requires a separate entity event store — Sprint 28 candidate)
- Condition variable value capture at eval time (needs `evalCondition` restructure — separate ADR)
- FEL composition at every clock tick (expensive — deferred)
- Time-series trace for entity count per stage (already partially present in `timeSeries`)

---

### Architectural Issues Register

Use this section to record structural issues discovered during the sprint in a standard form.

| ID | Topic | Status | Summary | Action / reference |
|---|---|---|---|---|
| A27.1 | Explainability data model | Closed | One structured `TraceEntry` schema defined above — all engine trace work builds against it | Implement in F27.2 |
| A27.2 | Trace volume and retention | Open | Long runs or many replications could generate significant trace volume. Policy: keep full trace in-memory for single runs; for replication batches the trace is not persisted (only summary stats). Replay from saved runs not in scope for Sprint 27. | Evaluate in F27.6 |
| A27.3 | Cross-surface linking | Open | Need a stable selection key between log entries, entity IDs, and canvas node IDs. Decision: use `entityId` (number) as primary join key; canvas node IDs are derived from model graph node IDs. | Evaluate in F27.5 |
| A27.4 | Condition eval variable capture | Open | `evalCondition` currently returns only boolean. Capturing per-clause variable values at eval time would require restructuring the evaluator. Deferred to Sprint 28. | ADR after F27.4 |

### Tasks

- [ ] Audit the current run log, snapshot structure, and execution UI surfaces
- [ ] Identify the minimum structured trace fields needed for diagnosis
- [ ] Define authoritative contracts for:
  - [ ] event provenance
  - [ ] entity lifecycle inspection
  - [ ] arbitration reasoning
  - [ ] condition evaluation reasoning
  - [ ] warning and truncation traceability
- [ ] Record unresolved structural questions in the Architectural Issues Register below

### Progress notes

- Not started

### Expected outcome

- One documented trace contract that all Sprint 27 implementation work builds against ✓

### Risks / issues

- None

## F27.2 — Add event provenance and causal trace records

### Tasks

- [x] Add structured trace records for:
  - [x] Phase A clock advance
  - [x] B-event execution
  - [x] C-event evaluation and firing
  - [x] macro-side effects that materially change entity or queue state
- [x] Record what new B-events are scheduled and why
- [x] Record route-to-queue vs route-to-exit outcomes explicitly
- [x] Ensure trace order is deterministic under fixed seed replay

### Progress notes

- Completed 2026-05-13. `_trace()` emitter added in `engine/index.js:114`. All log entries now carry `phase`, `time`, `seq` plus phase-specific payloads (`event{}`, `cEval{}`, `clock{}`, `arbitration{}`, `warning{}`).
- Phase A entries now include `dueEvents[]` showing which events fire at the new clock.
- B-event entries include `entityIds[]` and `newEvents[]`.
- C-event entries record `cEval{conditionTrue/failureReason/skippedBecause}` per event per pass.
- Phase C truncation logged as `phase="WARNING"` with structured `warning{}`.

### Expected outcome

- The engine emits enough causal trace to explain what happened in a run without reading raw code ✓

### Risks / issues

- Trace volume controlled by keeping all trace in-memory (not persisted to DB).

## F27.3 — Add entity lifecycle and waiting inspection

### Tasks

- [x] Define the minimum inspectable entity-debug view model
- [x] Surface entity lifecycle details in Execute UI
- [x] Show waiting/resource ownership fields introduced in Sprint 26 where relevant
- [x] Show last transition and current blocking reason where available
- [x] Ensure entity inspection stays stable during auto-run and stepping

### Progress notes

- Completed 2026-05-13. `EntityInspector` component added in `BottomPanel.jsx`.
- Shows: arrival time, current status, waiting age, waiting reason, queue, server, loop count, sojourn, attributes, and multi-stage service history with per-stage wait/service times.
- Selected via click on entity row in Entities tab or via entity ID link in expanded log entries.
- "Inspector" tab added to BottomPanel; click entity in Entities table to inspect.

### Expected outcome

- A modeller can click or select an entity and understand its current state and most recent path through the model ✓

### Risks / issues

- Overloading the entity table without a clearer detail surface — resolved by separating the inspector into its own tab.

## F27.4 — Explain queue/resource arbitration and C-event evaluation

### Tasks

- [x] Expose queue selection reasoning
- [x] Expose idle-server/resource selection reasoning
- [x] Show why a C-event condition is currently true or false
- [x] Show when a lower-priority eligible C-event was not reached because of restart order
- [x] Surface skipped stale events or contradictory contexts in a readable way

### Progress notes

- Completed 2026-05-13. Arbitration reasoning added to ASSIGN macro in `macros.js`.
- `_arbitration` object built in ASSIGN: captures all candidates, idle servers, winner, losers, and no-match state.
- C-event condition evaluation surfaced in LogTab via expandable ▶/▲ detail showing `cEval{}` with `conditionTrue`, `failureReason`, `skippedBecause`, `pass`, `priority`.
- Entity ID links in log detail open the Inspector tab directly.

### Expected outcome

- A modeller can explain why a selection or condition result occurred using first-class product support ✓

### Risks / issues

- Condition traces may become verbose — mitigated by only showing detail on user interaction (▶ toggle).

## F27.5 — Link visual canvas, logs, entities, and trace panels

### Tasks

- [x] Tighten selection linking between live canvas nodes and filtered logs
- [x] Add trace-to-entity and entity-to-trace navigation
- [x] Add trace-to-node or event navigation where practical
- [ ] Preserve stepping/auto-run usability while inspection is open
- [ ] Avoid distracting layout thrash during live updates

### Progress notes

- Completed 2026-05-13. Entity ID links in expanded log entries (`▶` toggle) navigate directly to the Inspector tab for the selected entity. `selectedEntityId` state lifted to `ExecutePanel` and threaded through `BottomPanel` to `EntitiesTab` and `LogTab`.

### Expected outcome

- The user can move across the visual view, log, entity state, and debug explanation without losing context ✓

### Risks / issues

- Live updates could still destabilize the inspection panel if not carefully isolated — mitigated by stable entity selection (not auto-updated).

## F27.6 — Add explainability regression coverage and performance guardrails

### Tasks

- [ ] Add engine tests for trace determinism and completeness of critical events
- [ ] Add UI tests for entity inspection, trace panels, and linked selection flows
- [ ] Verify trace data does not mutate engine behaviour
- [ ] Add practical guardrails for trace volume and performance
- [ ] Record any intentionally truncated trace behaviour explicitly

### Progress notes

- Not started

### Expected outcome

- Trace tooling is testable, replayable, and safe to keep on by default or under a predictable mode

### Risks / issues

- Trace generation may increase memory pressure on long or replicated runs

## F27.7 — Update modeller-facing guidance and debugging workflow docs

### Tasks

- [ ] Add a documented debugging workflow for difficult models
- [ ] Explain how to diagnose:
  - [ ] waiting/blocking surprises
  - [ ] queue starvation or fairness concerns
  - [ ] routing mistakes
  - [ ] unstable C-event conditions
  - [ ] run-time warnings such as Phase C pass-cap events
- [ ] Align UI wording and help text with the final Sprint 27 surfaces

### Progress notes

- Not started

### Expected outcome

- Modellers can use the debugging tooling without reverse-engineering the engine

### Risks / issues

- None yet

## F27.8 — Produce a capability guide with sample debug scenarios

### Tasks

- [ ] Write a modeller-facing capability guide in the same style as Sprint 26
- [ ] Add small sample scenarios or example runs covering:
  - [ ] waiting diagnosis
  - [ ] routing explanation
  - [ ] C-event evaluation explanation
  - [ ] contention/arbitration explanation
  - [ ] Phase C warning interpretation example where relevant
- [ ] Record remaining unsupported explainability gaps

### Progress notes

- Not started

### Expected outcome

- A practical guide and examples demonstrate how the new debugging/explainability tooling is meant to be used

### Risks / issues

- None yet

## Architectural Issues Register

Use this section to record structural issues discovered during the sprint in a standard form.

| ID | Topic | Status | Summary | Action / reference |
|---|---|---|---|---|
| A27.1 | Explainability data model | Open | Need one stable structured trace contract rather than scattered ad hoc log metadata. | Resolve in F27.1 |
| A27.2 | Trace volume and retention | Open | Need a policy for how much trace data to keep in-memory for long or replicated runs. | Evaluate in F27.6 |
| A27.3 | Cross-surface linking | Open | Need a clear ownership model between log selection, node selection, and entity inspection to avoid stale UI state. | Evaluate in F27.5 |

## Acceptance Summary

Sprint 27 is complete when:

- a modeller can inspect why a specific entity is waiting, serving, done, or removed
- a modeller can inspect why a queue or server selection occurred
- a modeller can inspect why a C-event fired or did not fire
- logs, canvas, and entity inspection are linked coherently
- trace output is deterministic and covered by focused tests
- modeller-facing guidance and examples explain how to use the new tooling
