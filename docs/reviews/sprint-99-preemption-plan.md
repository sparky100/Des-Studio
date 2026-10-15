# Sprint 99 — Preemption: Correct Interrupted Service, Then Preempt-and-Assign

**Sprint:** 99
**Theme:** Make interrupted service (PREEMPT, FAIL, automatic breakdowns, shift changes) correct
and measurable, then add preemption that needs no hand-built scaffolding.
**Status:** Phase 1 and 2 shipped (PR #571); Phase 3 implemented
**Owner:** parkinsonsj@gmail.com
**Supersedes:** `docs/decisions/ADR-014-preemption-and-interruption-deferral.md` (Sprint 26
deferral). PREEMPT has since shipped (Sprints 32, 41, 97); this sprint settles the open
questions ADR-014 listed: scheduled-completion invalidation, metric treatment, and fairness/ordering.

---

## Where PREEMPT stands

`PREEMPT(ServerType[, Criterion])` is a macro fired from an event's effect. It:

1. picks a busy server of the type. With no criterion it takes the first; otherwise
   `PRIORITY(attr)` (lowest value) or `LONGEST`/`SHORTEST` elapsed service (Sprint 97);
2. records the job's remaining time (`_remainingService`), frees the server and any co-seized
   servers, and re-queues the job without balking (`preemptCustomer`, `entities.js`). A server
   carried from an earlier stage is just dropped and the job's current stage continues;
3. when the job is next served, the remaining time replaces a fresh sample (preemptive-resume).

FAIL, automatic MTBF/MTTR breakdowns and shift-close capacity retirement all use the same
`preemptCustomer` path. FIFO orders by original arrival time, so an interrupted job resumes
ahead of later arrivals, which is the standard preemptive-resume convention.

## Problems found (reproduced on the engine, 2026-10)

One server. A low-priority job needing 10 units starts at t=0. A high-priority job needing
2 units arrives at t=5 and preempts it.

| t | What happens |
|---|---|
| 0 | low job starts; completion scheduled for t=10 |
| 5 | low job preempted, 5 remaining; high job served until t=7 |
| 7 | low job resumes; completion scheduled for t=12 |
| **10** | **the stale t=10 completion ends the low job** (8 units of service, not 10) |
| 12 | the correct completion is skipped |

1. **Stale completions.** Nothing cancels the interrupted job's pending completion. The only
   guard is "is the job serving?", which is true again by t=10. The rest of that completion
   event (`SET(counter, counter-1)`, `COST(…)`) also runs on a stale firing, so counters that
   track work in progress drift. The Priority ED template's `traumaInService` is one.
2. **Wait and service metrics.** The stage record measures wait as `serviceStart − stage start`
   and service as `end − serviceStart`. After an interruption `serviceStart` is the resume time,
   so service delivered before the interruption is counted as wait. In the run above the low
   job's wait reads 7 (it queued for 2) and its service 3 (it received 10).
3. **Remaining time silently lost.** The remaining time is only known when the completion was
   scheduled with `useEntityCtx: true`, and it's only honoured for sampled distributions.
   `EntityAttr`, `ServerAttr`, `Distance` and missing-context cases resume with a fresh full
   duration instead.
4. **No conditional or atomic preemption.** PREEMPT interrupts even when a server is idle, or
   when the job in service outranks the one that triggered it. The freed server goes to
   whichever C-event fires next, not necessarily the job that caused the preemption. Templates
   need a counter, a gating C-event at priority 0 and careful C-event ordering to avoid
   thrashing (the same job bumped repeatedly).
5. **Over-stated validation.** The capability register lists "Preemptive priority ✓ —
   Benchmark 6", but Benchmark 6 never uses PREEMPT; it is a non-preemptive priority queue.
   There is no analytic check of preemptive priority.

## Decisions

- **Correctness fixes apply to every model.** Wait/service figures for models that preempt,
  fail servers or close shifts mid-service will change to the correct values; stale completions
  stop firing. Called out in the release notes.
- **Preempt-and-assign is an option on ASSIGN** (`ASSIGN(Q, Server, PREEMPT[, Criterion])`),
  not a new macro: it is "seize a server for this queue", with the extra power to take one.
- **The new form only interrupts a job that ranks below the one waiting.** Plain `PREEMPT(...)`
  keeps its current unconditional behaviour, so existing models are unchanged.

## Phase 1 — Correct interrupted service (this PR)

| # | Change | Where |
|---|---|---|
| 1a | **Service epoch.** Each interruption (`preemptCustomer`, non-carried) and FINISH bumps `cust._serviceEpoch`. Service completions scheduled from a C-event are stamped with the epoch at scheduling time. A B-event whose stamp no longer matches is skipped whole (no effects, not counted as an activity firing), like the existing renege guard. | `entities.js`, `macros.js`, `phases.js` |
| 1b | **Interval-correct metrics.** On interruption the service delivered so far is kept as a segment (`cust._serviceSegments`). The stage record carries `serviceSegments` and `interruptions`; `stageWait`/`stageService` move those segments from wait to service. Summary statistics read stages through shared `stageWaitAfterWarmup` / `stageServiceAfterWarmup` helpers (warm-up truncation still applies per interval). | `macros.js` (`buildStageRecord`), `index.js`, `SweepViews.jsx` |
| 1c | **Remaining time always known.** When a C-event schedules a service completion for an entity, its due time is recorded (`cust._serviceDueAt`). Remaining time is `due − now`, and the next service uses it for every distribution type, including 0 when the interruption fell exactly at the due time. | `phases.js`, `entities.js` |
| 1d | **Analytic benchmark.** Two-class M/M/1 with preemptive-resume priority (λ₁ = 0.3, λ₂ = 0.4, μ = 1): expected time in system T₁ = 1/(1−ρ₁) = 1.429 and T₂ = 1/(1−ρ₁) + (λ₁+λ₂)/μ² / ((1−ρ₁)(1−ρ)) = 4.762. Their arrival-weighted mean is 3.333 = 1/(1−ρ), as it must be. Soak tier, ±5%. Relabel Benchmark 6 as non-preemptive; correct the capability register; mark ADR-014 superseded; refresh the Priority ED template's out-of-date limitations. | `tests/benchmarks/`, docs |

**Tests.** The t=0/5/7/10/12 scenario above (low job gets exactly 10 units, finishes at 12,
wait 2, service 10, one interruption, counter decremented once). The same for FAIL and an
automatic breakdown. `EntityAttr` service resumes with its remaining time. Metrics with
warm-up truncation across an interruption. The new benchmark. Reference check (World Oil
Network) unchanged: it never interrupts service.

## Phase 2 — Preempt-and-assign (implemented)

`ASSIGN(Queue, ServerType, PREEMPT[, Criterion][, Policy])`:

1. If a server of the type is idle, behave exactly like `ASSIGN(Queue, ServerType)`.
2. Otherwise choose a victim among busy servers by `Criterion` (default: the waiting job's
   queue discipline attribute, i.e. `PRIORITY(attr)` for a PRIORITY queue, else `SHORTEST`).
3. Only interrupt when the victim ranks strictly below the head of `Queue` under that criterion.
4. Interrupt it (Phase 1 semantics) and give **that** server to the head of `Queue` in the same
   firing, so no other C-event can take it.

`Policy` decides what happens to the displaced job: `RESUME` (default), `RESTART` (same duration
again), `RESAMPLE` (new sample) or `DROP:<Queue>` (send it to another queue, e.g. rework).
Anti-thrash controls are options on the same ASSIGN, not entity-type fields, so they sit with the
activity that preempts and need no schema change: `MAX:n` (a job is interrupted at most n times)
and `MINSERVICE:t` (a job with less than t of service so far is left alone; checked whenever the
activity is next tried, i.e. after any event).

**As built** (`src/engine/preemptAssign.js`):
- **Default victim:** the lowest-ranked job in service; a tie goes to the job with the least service so far (least work lost).
- **Default criterion:** the queue's discipline key — `PRIORITY(attr)`, `PRIORITY`, `SPT` or `EDD`. A FIFO/LIFO queue ranks nothing, so without a `PRIORITY(attr)` criterion it never interrupts; V81 warns about this.
- **Excluded combinations:** no skill, `ANY` or container clause.
- **Carried claims:** a server held from an earlier stage is never taken.

**Validation (V81):**
- unknown or repeated options;
- a queue that doesn't rank jobs;
- a rank attribute missing from the queue's entity type;
- an unknown DROP queue;
- a C-event firing plain `PREEMPT(Type)` without checking `idle(Type)`.

**Rename propagation:** `DROP:<Queue>` follows queue renames.

**Benchmark:** the preemptive-priority benchmark runs both forms against the same analytic values.

**SimPy export:** warned that the form was not translated; Phase 3 maps it to `PreemptiveResource`.

**UI:**
- **Effect builder:**
  - the ASSIGN composer's "May interrupt a lower-priority job" option, with **Rank by**, **Interrupted job** and max-per-job controls;
  - a ready-made suggestion for queues whose discipline ranks jobs.
- **Visual Designer:**
  - a `preempts` badge on the activity;
  - an inspector "Preemption" summary (rank, policy, limits);
  - the activity sublabel names only the server; it used to list every ASSIGN argument;
  - priority 0 is shown as 0, not 1.
- **Run canvas:** a "↯ N taken" count on the preempting activity's card, from the new `snap.preemptTakes`.
- **Results:** the entity detail's stage cards show "Interrupted N×"; entity journeys export `interruptions`.
- **Shared macro parser:** keeps nested calls (`PRIORITY(sev)`, `min(a, b)`) inside their argument. Before, a nested call ended the outer call early.

**AI prompt pack:** the schema doc (v2.10.0) gains:
- the preempt-and-assign row;
- a worked "Preemptive priority" pattern;
- TOP LLM MISTAKES #29;
- V81;
- corrected avgWait/avgSvc wording.

The model-builder rule 16 and the results-analysis prompt are updated, and `docs-reflect-engine.test.js` guards all three sources. Validation warns when PREEMPT can fire with an idle server, and when
a criterion's attribute doesn't exist on the queue's entity type. The ASSIGN composer gets a
"may interrupt a lower-priority job" option. The Priority ED template is rewritten to use it,
dropping its counter and gating C-event.

## Phase 3 — SimPy, trace and the declarative setting (implemented)

| Item | Outcome |
|---|---|
| **SimPy export** | `ASSIGN … PREEMPT` → `simpy.PreemptiveResource`. Every request on it carries the job's rank (`_rank` over the rank attribute), and only the preempting activity requests with `preempt=True`, so SimPy interrupts a strictly lower-ranked user, as the engine does. Each service on the resource catches `simpy.Interrupt` and continues per policy (RESUME / RESTART / RESAMPLE / DROP). Validated by running the generated script under SimPy 4.1 against the analytic two-class M/M/1: T₁ 1.432 (1.429), T₂ 4.780 (4.762) over 30 replications. Warns about MAX/MINSERVICE, LONGEST/SHORTEST, COSEIZE on a preemptive resource, and re-queue ordering. Plain `PREEMPT(Type)` stays a stub. |
| **Trace** | Preemption arbitration records carry: victim, beneficiary, ranks, policy (and drop queue), remaining time, and *why*. Examples of why: "lowest-ranked of 2 lower-ranked in service, 1 protected by MAX/MINSERVICE"; for plain PREEMPT, "chosen by PRIORITY(x) among 3 busy". B-events now record arbitration too, so a PREEMPT fired from a B-event is traced. The Run tab's log shows a dedicated preemption line. Closes the Sprint 97 backlog item. |
| **Declarative activity setting** | **Not built.** The ASSIGN composer's "May interrupt a lower-priority job" option already is the declarative surface: it writes `ASSIGN(…, PREEMPT, …)`, and the Visual Designer shows it as a `preempts` badge and an inspector summary. A separate activity field compiled to the same ASSIGN would be a second source of truth for one behaviour and a new model_json field to keep in sync. |

Also in this round: the CI-only failure of `tests/ui/model-detail-draw-jump.test.jsx`. The Draw panel is lazy-loaded under Suspense, which hides the rendered tree while a chunk loads, so the test now waits with `findBy*`.
