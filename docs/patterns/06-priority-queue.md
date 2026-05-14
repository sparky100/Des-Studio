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
- Priority is a **non-preemptive** discipline: a customer already in service is not interrupted.
- Combining `PRIORITY` with finite capacity (Pattern 5) is valid — high-priority customers still balk if the queue is full.

## Analytical reference
For M/M/c/PRIORITY with two classes (λ1, λ2, μ1, μ2):
- Class-1 mean wait: W1 = ρ1 / (μ1 · (1 − ρ1))
- Class-2 experiences extra delay from class-1 preemption; simulation is typically easier than closed-form.

## Example templates
- ER Triage (`er-triage`) — Treatment queue is PRIORITY
- Bank Branch (`bank-branch`) — Premium vs Standard customers
