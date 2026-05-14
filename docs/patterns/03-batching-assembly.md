# Pattern 3: Batching and Assembly (BATCH)

## When to use
Individual items must be consolidated before processing: assembly lines that require N components, warehouse picking that consolidates N orders, or any scenario where a minimum group size must accumulate before work begins.

## Structure

```
Items arrive → [Queue] → BATCH collects N → [batch entity] → (Worker) → Depart
```

## Key macros
| Macro | Role |
|---|---|
| `ARRIVE(Type, QueueName)` | Individual item enters queue |
| `BATCH(QueueName, N)` | Merge N waiting items into one batch entity |
| `ASSIGN(QueueName, ServerType)` | Assign batch to a server |
| `COMPLETE()` | Batch departs (counts as one departure) |

## Minimal template

```
B-events:
  ItemArrival  t=0   ARRIVE(Item, Items)
                 ↳ reschedule self: Exponential(mean)
  WorkDone     t=∞   COMPLETE()

C-events:
  DoBatch  priority=1  condition: queue(Items).length >= N
                        effect:    BATCH(Items, N)

  DoWork   priority=2  condition: queue(Items).length > 0 AND idle(Worker).count > 0
                        effect:    ASSIGN(Items, Worker)
                          ↳ schedule WorkDone: Fixed(processingTime)

Queues:  Items (customerType=Item)
Servers: Worker count=w
```

## Important ordering
The BATCH C-event must have **lower priority number** (fires first) than the ASSIGN C-event. This ensures batches are formed before workers try to seize them. After `BATCH(Items, N)` fires, the N items are merged into a single batch entity that remains in the queue with role `"batch"`. The ASSIGN then picks up the batch entity.

## Notes
- `result.summary.departures` counts batches, not individual items. Multiply by N for throughput.
- Do not put `cSchedules` on the BATCH C-event — scheduling happens on the ASSIGN C-event.
- Batch size N must be a positive integer literal; it cannot be a runtime variable.

## Example templates
- Factory Assembly (`factory`) — 3 parts → 1 product
- Warehouse Picking (`warehouse`) — 5 orders → 1 picking run
