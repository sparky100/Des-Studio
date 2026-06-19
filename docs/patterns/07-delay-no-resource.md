# Pattern 7: Delay (No Resource)

## When to use

An entity must spend time in a stage but occupies **no server or room** during that time. Common examples:

- Post-race recovery before moving to a refreshment area
- Mandatory cooling or curing period (manufacturing)
- Paperwork processing where the entity waits unattended
- Patient in an unmonitored recovery bed
- Any step where "waiting is the work" and no staff or equipment is tied up

If a server *must* be reserved for the duration, use Pattern 1 (Single-Queue Service) with `ASSIGN` instead.

## Structure

```
Arrivals → [Waiting Area] → (Hold — no server) → Exit or next queue
```

## Key macros

| Macro | Role |
|---|---|
| `ARRIVE(Type, QueueName)` | Create entity and place it in the waiting queue |
| `DELAY(QueueName)` | Move entity to "serving" state without claiming any server |
| *(routing on completion B-event)* | Route entity to exit or the next stage |

## How the engine handles it

`DELAY` moves **all** waiting entities into an in-progress state in a single Phase C pass (batch processing). Each entity gets its own independently-sampled completion time from the cSchedule distribution. The completion B-event fires per entity when its delay expires.

**Critical rule:** the completion B-event must have an **empty effect**. Do not add `COMPLETE()` alongside routing — `COMPLETE()` fires before routing and prevents the entity from being routed. The "Exit system" routing branch automatically completes the entity internally.

## Minimal template

```
B-events:
  Arrival      t=0   ARRIVE(Customer, Waiting Area)
                ↳ reschedule self: Exponential(mean=5)
  Delay Done   t=∞   effect: (none)
                ↳ routing: 100% → Exit system

C-events:
  Hold         condition: queue(Waiting Area).length > 0
               effect:    DELAY(Waiting Area)
                ↳ schedule Delay Done: Fixed(5), useEntityCtx: true

Queues:  Waiting Area  customerType=Customer  discipline=FIFO
```

## Routing after the delay

Configure routing on the **Delay Done** B-event (not on the C-event):

| Scenario | Routing setup |
|---|---|
| Entity always exits | 100% → Exit system (leave) |
| Always routes to next stage | 100% → Next Queue |
| Splits (e.g. 90% continue, 10% exit) | Probabilistic: 90% → Next Queue, 10% → Exit system |
| Condition-based (e.g. by attribute) | Conditional routing rows + default |

## What NOT to do

```
✗ WRONG — COMPLETE() blocks routing:
  Delay Done B-event effect: ["COMPLETE()"]
  probabilisticRouting: [{ probability: 0.9, queueName: "Next Queue" }, { probability: 0.1, queueName: null }]
  → COMPLETE() fires first, entity is "done" before routing runs; all routing is silently skipped

✓ CORRECT — empty effect, routing only:
  Delay Done B-event effect: []
  probabilisticRouting: [{ probability: 0.9, queueName: "Next Queue" }, { probability: 0.1, queueName: null }]
```

## Draw designer

Select **"Delay (no resource)"** from the ADD PATTERN dropdown. The pattern drops in:
- A `Waiting Area` queue
- A `Customer Arrival` B-event (Exponential inter-arrival, mean 5)
- A `Hold` C-event with `DELAY(Waiting Area)` and a Fixed(5) cSchedule
- A `Delay Complete` B-event (scheduled follow-on, empty effect, 100% exit routing)

Adjust queue name, entity type, distribution and delay duration before running.

## Differences from single-queue service

| | Single-Queue Service | Delay (No Resource) |
|---|---|---|
| C-event macro | `ASSIGN(Queue, Server)` | `DELAY(Queue)` |
| Server claimed? | Yes — one server busy per entity | No — resource pool untouched |
| Completion B-event effect | `RELEASE(Server)` or `COMPLETE()` | Empty — routing only |
| Resource utilisation reported? | Yes | No (no server to track) |
| Throughput limit | Server count × service rate | Queue capacity only |
