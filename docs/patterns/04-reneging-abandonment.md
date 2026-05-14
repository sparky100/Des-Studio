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

## Example templates
- Call Center (`call-center`) — callers abandon after 10 time units
