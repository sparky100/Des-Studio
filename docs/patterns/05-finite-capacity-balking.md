# Pattern 5: Finite Capacity and Balking

## When to use
A queue has a physical or policy limit on the number of customers that can wait. Arrivals that find the queue full are turned away (balk). Common in car parks, emergency department waiting rooms, airport security lanes, and any system with bounded waiting space.

## Structure

```
Arrivals → capacity check → [Queue (cap=K)] → (Server) → Depart
                ↓ full
              Balk (entity never created)
```

## How to configure
Set the `capacity` field on the queue definition to a positive integer:

```
Queues:
  WaitingArea  customerType=Customer  capacity=20  discipline=FIFO
```

When the queue is at capacity, `ARRIVE(Customer, WaitingArea)` silently discards the arriving entity. The arrival B-event still reschedules itself, so arrivals continue — they simply balk.

## Key macro
| Macro | Role |
|---|---|
| `ARRIVE(Type, QueueName)` | Creates entity only if `queue.length < capacity`; otherwise discards |

No additional macro is needed. The engine enforces the capacity limit inside `ARRIVE`.

## Metrics
- `result.summary.balked` counts discarded arrivals.
- Effective arrival rate = λ · (1 − P_block) — use balked count to estimate blocking probability.
- Combine with utilisation to size the waiting area for a target blocking probability.

## Multi-stage finite capacity
Each stage can have its own capacity:

```
Queues:
  Stage1  capacity=15   # first bottleneck
  Stage2  capacity=10   # second bottleneck
```

A customer released from stage 1 into stage 2 will balk if stage 2's queue is also full (the customer is discarded at that point).

## Notes
- `capacity=""` (empty string) or `capacity="0"` means unlimited.
- Very small capacities relative to arrival rate produce high blocking and low throughput.
- Capacity limits do not affect customers already in service.

## Example templates
- Airport Security (`airport`) — capacity 15 at each stage
- Ward Bed Admission (`ward-admission`) — Admission cap 5, Ward cap 20
- Retail Checkout (`retail-checkout`) — Waiting area cap 20
