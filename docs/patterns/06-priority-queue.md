# Pattern 6: Priority Queue

## When to use
Not all customers are equal. Urgent patients skip the queue ahead of routine ones; premium bank customers are served before standard ones. The priority discipline re-orders the queue by a numeric attribute rather than arrival time.

## Structure

```
Arrivals (with priority attr) → [Queue  discipline=PRIORITY] → (Server) → Depart
  priority 1 (highest urgency) served before priority 5 (lowest)
```

## Configuration steps

### 1. Add a `priority` attribute to the customer entity type

```
EntityType: Customer
  attrDefs:
    - name: priority
      valueType: number
      defaultValue: 3
      dist: Uniform   distParams: { min: 1, max: 5 }
```

The `dist` field samples the priority at arrival. Use `Fixed` for deterministic tiers, `Uniform` for a spread, or any supported distribution.

### 2. Set the queue discipline to `PRIORITY`

```
Queues:
  Queue  customerType=Customer  discipline=PRIORITY
```

### 3. Use `ASSIGN(QueueName, ServerType)` as normal

The engine automatically selects the highest-priority (lowest numeric value) waiting customer. Ties are broken by arrival time (FIFO within tier).

## Sorting rule
`priority 1 < priority 2 < … < priority N`
Lower number = higher urgency = served first.

## Mixed disciplines across stages
You can use different disciplines at different stages:

```
Queues:
  Intake      discipline=FIFO      # arrival order at first stage
  Treatment   discipline=PRIORITY  # urgency-based at second stage
```

The customer's `priority` attribute persists through all stages.

## Notes
- If the `priority` attribute is absent or non-numeric it defaults to `Infinity` (served last).
- On its own, `PRIORITY` is a **non-preemptive** discipline: a customer already in service is not interrupted. For preemptive priority see the next section.
- Combining `PRIORITY` with finite capacity (Pattern 5) is valid — high-priority customers still balk if the queue is full.

## Preemptive priority (interrupt lower-priority service)

When an urgent arrival should take a server from a less urgent job already in service — a trauma code taking a doctor from a routine consultation — use the preempt-and-assign form of `ASSIGN` (Sprint 99):

```
Queues:
  Urgent   customerType=Patient  discipline=PRIORITY(priority)

C-Event: Serve Urgent   priority=0
  condition: queue(Urgent).length > 0
  effect:    ASSIGN(Urgent, Doctor, PREEMPT)
```

In the effect builder: **ASSIGN** → tick **May interrupt a lower-priority job (PREEMPT)**.

- An idle server is used first (exactly a plain ASSIGN). Otherwise a busy server whose job ranks **strictly below** the head of the queue is interrupted and handed to the head in the same firing.
- Rank is the queue's discipline key (`PRIORITY(attr)`, `PRIORITY`, `SPT`, `EDD`; lower = more urgent). To rank by an attribute when the queue is FIFO — e.g. a separate queue per class — add it as a criterion: `ASSIGN(TraumaQueue, Doctor, PREEMPT, PRIORITY(priority))`. Equal rank never interrupts.
- Victim: the lowest-ranked job in service (ties: least service so far). `LONGEST` / `SHORTEST` pick by service so far instead.
- The interrupted job re-queues; its pending completion is cancelled and the service it already had counts as service, not wait. Policy: `RESUME` (default, remaining time), `RESTART`, `RESAMPLE`, or `DROP:Queue` (join another queue instead).
- Anti-thrash: `MAX:n` (interrupt a job at most n times), `MINSERVICE:t` (don't interrupt a job with less than t of service).
- No counter of jobs in service and no gating "preempt" event are needed. A hand-built `PREEMPT(ServerType)` in a C-event whose condition doesn't check `idle(ServerType)` can interrupt a job while a server is idle — validation V81 warns.
- SimPy export does not translate this form (it warns; the script waits for an idle server).

## Analytical reference
Non-preemptive M/M/1 with two classes (λ1, λ2, common μ, ρ = ρ1 + ρ2): Wq,1 = W0 / (1 − ρ1), Wq,2 = W0 / ((1 − ρ1)(1 − ρ)), with W0 = (λ1 + λ2)/μ².

Preemptive-resume M/M/1, two classes: T1 = 1 / (μ − λ1) = (1/μ) / (1 − ρ1); T2 = (1/μ) / (1 − ρ1) + ((λ1 + λ2)/μ²) / ((1 − ρ1)(1 − ρ)). With λ1 = 0.3, λ2 = 0.4, μ = 1: T1 = 1.429, T2 = 4.762 — checked by `tests/benchmarks/preemptive-priority.test.js` (±5%).

## Example templates
- ER Triage (`er-triage`) — Treatment queue is PRIORITY
- Priority ED with Balking (`priority-ed-balking`) — trauma codes use `ASSIGN(TraumaQueue, Doctor, PREEMPT, PRIORITY(priority))`
- Bank Branch (`bank-branch`) — Premium vs Standard customers
