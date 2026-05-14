# Pattern 1: Single-Queue Service (M/M/c)

## When to use
A pool of identical servers draws from one shared queue. Customers are interchangeable and servers are homogeneous (call centre agents, bank tellers, checkout lanes, compute hosts).

## Structure

```
Arrivals → [Queue] → (Server 1)
                   → (Server 2)
                   → (Server c)
```

## Key macros
| Macro | Role |
|---|---|
| `ARRIVE(Type, QueueName)` | Create customer entity and place it in the queue |
| `ASSIGN(QueueName, ServerType)` | Seize the first idle server |
| `COMPLETE()` | Release server and record departure |

## Minimal template

```
B-events:
  Arrival  t=0   ARRIVE(Customer, Queue)
             ↳ reschedule self: Exponential(mean)
  Done     t=∞   COMPLETE()

C-events:
  Serve    condition: queue(Queue).length > 0 AND idle(Server).count > 0
           effect:    ASSIGN(Queue, Server)
             ↳ schedule Done: Exponential(serviceTime)

Queues:   Queue  customerType=Customer  discipline=FIFO
Servers:  Server count=c
```

## Analytical reference (M/M/c)
- Traffic intensity: ρ = λ / (c · μ)
- Erlang-C formula gives P(wait) and mean queue length Lq
- Mean wait in queue: Wq = Lq / λ

## Variants
- **Finite capacity**: set `capacity` on the queue → arriving customers balk when full (see Pattern 5).
- **Priority queue**: set `discipline=PRIORITY` and add a `priority` attr on the customer entity type (see Pattern 6).
- **Abandonment**: add a reneging B-event scheduled at patience time (see Pattern 4).

## Example templates
- M/M/1 Queue (`mm1`)
- Call Center (`call-center`)
- Bank Branch (`bank-branch`)
- Data Center (`data-center`)
- Port Berth Operations (`port-berth`)
