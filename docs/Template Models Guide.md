# DES Studio Template Models

These templates are pre-built simulation models you can run instantly. Click a template in the **Templates** tab of your library, and it saves a copy to your account and opens it with auto-execute. Results appear in seconds.

Each template teaches a different modelling concept — from a single queue through to multi-stage routing, batching, and state tracking.

---

## 1. M/M/1 Queue

**Concept:** The classic single-server queue — the "Hello World" of simulation.

Jobs arrive at a single server on average every 1.11 time units (rate 0.9). Service takes 1 time unit on average. The server is busy 90% of the time.

**What to watch:** The queue grows and shrinks. Average wait time should be around 9 time units. This is the benchmark model; compare it against the analytical formula.

**Entity types:** Customer (arriving), Server (1)

**Distribution:** Exponential for both arrival and service

---

## 2. Call Center

**Concept:** Multi-server queue with abandonment.

Calls arrive every 0.67 time units. 3 agents handle calls with average service time 2.5 time units. Callers who wait longer than 10 time units abandon (the `RENEGE` macro).

**What to watch:** The queue grows when all 3 agents are busy. Abandoned callers leave without service. Compare abandonment rate against agent count.

**Entity types:** Caller (arriving), Agent (3)

**Macro:** `RENEGE` for caller abandonment

---

## 3. ER Triage

**Concept:** Two-stage process with priority queue.

Patients arrive at an emergency room every 2 time units. Stage 1: triage by a nurse (2 nurses, uniform 2–5 min). Stage 2: treatment by a doctor (3 doctors, triangular 5–20 min). The Treatment queue uses **PRIORITY** discipline — patients with lower `severity` attribute jump the line.

**What to watch:** The Treatment queue uses priority ordering. Patients with higher severity (lower number) get seen first even if they arrived later.

**Entity types:** Patient (arriving, with `severity` attribute), Nurse (2), Doctor (3)

**Attribute:** `severity` — manual integer, lower = more urgent

**Discipline:** PRIORITY on Treatment queue

---

## 4. Fast Food Drive-Through

**Concept:** Three-stage sequential routing.

Customers pass through Order → Payment → Pickup. 1 cashier handles order and payment. 2 kitchen staff handle pickup. Each stage is a separate queue.

**What to watch:** Queues build at different rates. The cashier is a bottleneck (handles 2 of 3 stages). Cycle time = time from arrival to pickup.

**Entity types:** Customer (arriving), Cashier (1), Kitchen (2)

**Stages:** Order → Payment → Pickup (3 queues, 3 C-Events)

**Distributions:** Uniform for all service times

---

## 5. Factory Assembly

**Concept:** Batching — accumulate entities before processing.

Parts arrive every 2 time units. Work must accumulate 3 parts in the queue before assembly begins. 2 workers assemble each batch in a fixed 2 time units. Uses the `BATCH` macro.

**What to watch:** Nothing happens until 3 parts are queued. Assembly processes all 3 together. Compare individual vs batched throughput.

**Entity types:** Part (arriving), Worker (2)

**Macro:** `BATCH(Parts, 3)` — waits for 3 parts, picks them as one batch

**Distribution:** Fixed (2.0) for assembly time

---

## 6. Airport Security

**Concept:** Finite queue capacity with balking.

Passengers arrive every 1 time unit. Stage 1: document check by 2 officers (triangular 0.5–2 min). Stage 2: baggage scan by 3 scanners (triangular 1–4 min). Each queue is capped at 15 — when full, arriving passengers balk (leave immediately).

**What to watch:** When queues hit capacity 15, new arrivals are lost. Scanner queue backs up faster since it's the slower stage. Balking rate is a key metric.

**Entity types:** Passenger (arriving), Officer (2), Scanner (3)

**Queue capacity:** 15 on both queues — models finite waiting space

---

## 7. Construction Logistics

**Concept:** Two-stage routing with `RELEASE` macro and state variables.

Trucks arrive every 2.5 time units. Stage 1: loading by 2 loaders (triangular 3–8 min). Stage 2: weighing by 1 scale (uniform 1.5–3 min). The `RELEASE` macro routes the truck from Loader to the Weigh queue. State variables `trucksLoaded` and `trucksWeighed` track cumulative counts.

**What to watch:** The effect string `RELEASE(Loader, Weigh); trucksLoaded++` releases the server and routes the entity to the "Weigh" queue in one action. State variables increment each time. The scale is the bottleneck (1 vs 2 loaders).

**Entity types:** Truck (arriving), Loader (2), Scale (1)

**Macro:** `RELEASE(ResourceName, TargetQueueName)` for multi-stage routing

**State variables:** `trucksLoaded`, `trucksWeighed` — visible in the Step Log

---

## 8. Data Center

**Concept:** Large resource pool with 10 servers.

Compute jobs arrive every 2 minutes. 10 host servers process them with triangular 5–15 minute processing time. Pure multi-server pool — no multi-stage routing.

**What to watch:** With 10 hosts and 2 min arrivals, the system should be lightly loaded. Average wait time near zero. Demonstrates that more servers = less queueing.

**Entity types:** Job (arriving), Host (10)

**Distribution:** Triangular (5, 8, 15) for processing time

---

## 9. Outpatient Clinic

**Concept:** Two-stage clinic with `RELEASE` routing.

Patients arrive every 5 minutes. Stage 1: check-in with 2 receptionists (uniform 2–4 min). Stage 2: consultation with 4 doctors (triangular 8–25 min). `RELEASE(Receptionist, Consultation)` routes patients between stages. State variable `checkedIn` tracks throughput.

**What to watch:** Doctors are the bottleneck (long service time). Check-in is fast. Compare time-in-system for patients who get quick check-in vs. long consultation.

**Entity types:** Patient (arriving), Receptionist (2), Doctor (4)

**Macro:** `RELEASE(Receptionist, Consultation)` — frees receptionist, sends patient to Consultation queue

**State variable:** `checkedIn` increments on check-in completion

---

## 10. Warehouse Picking

**Concept:** Batch-then-process pipeline.

Orders arrive every 3 minutes. When 5 orders accumulate, `BATCH(Order, 5)` consolidates them. 3 pickers process each batch in a fixed 8 minutes. State variable `batchesPicked` counts completed batches.

**What to watch:** Orders queue until 5 accumulate. The `BATCH` C-Event fires as soon as `queue(Order).length >= 5`, consolidating them instantly. Pickers then process batch by batch.

**Entity types:** Order (arriving), Picker (3)

**Macro:** `BATCH(Order, 5)` for order consolidation, `COMPLETE()` for batch completion

**Distribution:** Fixed (8.0) for picking time

---

## Macro Quick Reference

| Macro | Phase | Purpose |
|---|---|---|
| `ARRIVE(EntityType)` | B-Event | Creates a new entity and places it in the matching queue |
| `COMPLETE()` | B-Event | Frees the resource, records statistics, entity departs |
| `RELEASE(Resource, TargetQueue)` | B-Event | Frees the resource and routes the entity to another queue |
| `ASSIGN(QueueName, ResourceType)` | C-Event | Seizes a resource for an entity, schedules completion |
| `RENEGE(EntityType)` | B-Event | Removes the oldest waiting entity from queue (abandonment) |
| `BATCH(QueueName, Count)` | C-Event | Accumulates N entities into one batch |
| `;` chaining | Any | Separate multiple actions, e.g. `RELEASE(Loader, Weigh); trucksLoaded++` |

---

## What to Look For in Results

Each template's **Step Log** shows every event in order with clock timestamps. The **Entity Table** shows individual entity status. Key metrics appear in the **Stats** panel (departure count, average wait, average service time).

- **M/M/1, Data Center** — simple throughput benchmarks
- **Call Center** — compare abandonment rate vs service level
- **ER Triage** — priority inversion (high-severity patient overtakes lower)
- **Fast Food, Construction, Outpatient** — cycle time through multi-stage systems
- **Factory, Warehouse** — batching efficiency (throughput vs unbatched)
- **Airport** — balking rate at finite-capacity queues
