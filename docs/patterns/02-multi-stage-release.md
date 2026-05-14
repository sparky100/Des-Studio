# Pattern 2: Multi-Stage Sequential Routing (RELEASE)

## When to use
Customers move through two or more service stages in sequence. Each stage has its own server pool and queue. After stage N the customer is released into stage N+1's queue — they do not depart.

## Structure

```
Arrivals → [Queue A] → (Server A) → [Queue B] → (Server B) → Depart
                        ↑RELEASE                  ↑COMPLETE
```

## Key macros
| Macro | Role |
|---|---|
| `ARRIVE(Type, QueueA)` | Enter first queue |
| `ASSIGN(QueueA, ServerA)` | Seize stage-A server |
| `RELEASE(ServerA, QueueB)` | Free server, move customer to next queue |
| `ASSIGN(QueueB, ServerB)` | Seize stage-B server |
| `COMPLETE()` | Final departure |

## Minimal template (2-stage)

```
B-events:
  Arrival      t=0   ARRIVE(Customer, Stage1)
                 ↳ reschedule self
  Stage1Done   t=∞   RELEASE(Server1, Stage2)
  Stage2Done   t=∞   COMPLETE()

C-events:
  StartStage1  condition: queue(Stage1).length > 0 AND idle(Server1).count > 0
               effect:    ASSIGN(Stage1, Server1)
                 ↳ schedule Stage1Done

  StartStage2  condition: queue(Stage2).length > 0 AND idle(Server2).count > 0
               effect:    ASSIGN(Stage2, Server2)
                 ↳ schedule Stage2Done

Queues:  Stage1 (customerType=Customer), Stage2 (customerType=Customer)
Servers: Server1 count=m, Server2 count=n
```

## Notes
- `RELEASE(ServerType, TargetQueue)` frees the server AND sets the customer's queue field to `TargetQueue`. The next C-event condition must reference `TargetQueue` by name.
- The second C-event has priority > first so it fires before new arrivals seize stage-2 resources.
- State variables (counters) can be incremented inside the `RELEASE` effect: `RELEASE(Server1, Stage2); stageCount++`

## Example templates
- ER Triage (`er-triage`) — Triage → Treatment
- Outpatient Clinic (`outpatient-clinic`) — Check-in → Consultation
- Fast Food Drive-Through (`fast-food`) — Order → Payment → Pickup (three stages)
- Construction Logistics (`construction`) — Loading → Weighing
- Ward Bed Admission (`ward-admission`) — Assessment → Ward
- Airport Security (`airport`) — Documents → Baggage scan
