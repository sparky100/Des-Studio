# Pattern 4: Reneging and Abandonment (RENEGE)

## When to use
Customers waiting in queue leave if not served within their patience time. Common in call centres, A&E departments, and any service where customers have a maximum tolerable wait.

## Structure

```
Arrival → [Queue] → (Server) → Complete
              ↓ (patience timer expires)
           RENEGE → customer exits
```

## Key macros
| Macro | Role |
|---|---|
| `ARRIVE(Type, QueueName)` | Place customer in queue AND schedule patience timer |
| `RENEGE(ctx)` | Remove the waiting customer; marks status `"reneged"` |
| `ASSIGN(QueueName, ServerType)` | If served before timer fires, seize server |
| `COMPLETE()` | Normal departure |

## How reneging is wired

The patience timer is a second schedule entry on the **ARRIVE B-event**:

```
B-events:
  Arrival  t=0  effect: ARRIVE(Customer, Queue)
    schedules:
      - eventId: b_arrive   dist: Exponential(mean)          # next arrival
      - eventId: b_renege   dist: Fixed(patienceTime)        # patience timer
        isRenege: true                                        # marks it as renege timer

  Renege   t=∞  effect: RENEGE(ctx)    # ctx resolves to the current customer
  Done     t=∞  effect: COMPLETE()
```

The `isRenege: true` flag tells the engine to bind the timer to the arriving customer. When the timer fires, `RENEGE(ctx)` checks whether the customer is still waiting — if they have already been served, the event is a no-op.

## Metrics
- `result.summary.reneged` counts customers who abandoned.
- Effective throughput = served / (served + reneged)
- Mean patience can be varied to model different service-level scenarios.

## Notes
- Only customers with status `"waiting"` can renege. A customer already in service is safe.
- The patience distribution is independent of arrival rate — model each separately.
- Renege timers are cancellable by the engine if the customer is served first; no manual cleanup needed.

## Zero-wiring alternative: queue-level `renegeDist`

Instead of hand-authoring a renege B-event and threading its `eventId` into every event that feeds a queue, set `renegeDist`/`renegeDistParams` directly on the Queue:

```json
{ "id": "q_wait", "name": "Queue", "customerType": "Customer", "discipline": "FIFO",
  "renegeDist": "Fixed", "renegeDistParams": { "value": "patienceTime" } }
```

The engine automatically schedules a patience timer the moment any entity joins this queue — via `ARRIVE`, `RELEASE`, routing, or batch/split — with no `RENEGE(ctx)` B-event or `schedules[].eventId` wiring required. Use this when every path into a queue should share the same patience distribution. The manual `schedules[{isRenege:true}]` pattern above remains valid and can coexist on the same model — use it when only certain paths into a queue need a renege timer, or when the trigger is conditional rather than purely distribution-based.

## Example templates
- Call Center (`call-center`) — callers abandon after 10 time units
