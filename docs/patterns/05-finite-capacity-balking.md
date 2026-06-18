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
Capacity, balking probability, and conditional balking are all fields on the queue definition itself:

```
Queues:
  WaitingArea  customerType=Customer  capacity=20  discipline=FIFO
               balkProbability=0.1
               balkCondition={ variable: "Queue.WaitingArea.length", operator: ">=", value: 18 }
```

When the queue is at capacity, or the balk check rejects the entity, the join is refused — if `overflowDestination` is set the entity is rerouted there (recursively re-checked against that queue's own capacity/balk rules), otherwise it exits the system. This check is enforced **uniformly, no matter how the entity reaches the queue** — `ARRIVE`, `RELEASE`, conditional/probabilistic routing, batch/split, and preemption re-queue are all checked the same way, not just the initial arrival.

## Key fields
| Field (on the Queue) | Role |
|---|---|
| `capacity` | Entity may join only if `queue.length < capacity`; otherwise blocked |
| `overflowDestination` | Where a blocked/balked entity is rerouted; if unset, it exits the system |
| `balkProbability` | Probability (0–1) the entity declines to join even when capacity allows it |
| `balkCondition` | Predicate object `{ variable, operator, value }`, e.g. testing `Queue.<name>.length` |

No macro configuration is needed — the engine enforces capacity and balking for every queue join automatically.

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

A customer released from stage 1 into stage 2 will balk if stage 2's queue is also full — the capacity/balk check is configured on the queue itself and applies the same way regardless of whether the entity arrives via `ARRIVE`, `RELEASE`, routing, or batch/split.

## Notes
- `capacity=""` (empty string) or `capacity="0"` means unlimited.
- Very small capacities relative to arrival rate produce high blocking and low throughput.
- Capacity limits do not affect customers already in service.

## Example templates
- Airport Security (`airport`) — capacity 15 at each stage
- Ward Bed Admission (`ward-admission`) — Admission cap 5, Ward cap 20
- Retail Checkout (`retail-checkout`) — Waiting area cap 20
