# simmodlr — Template Model Definitions

*Analysis of all 10 pre-built template models. Documents entity types, events, effects, conditions, queues, and identified issues.*

---

## 1. M/M/1 Queue

**Description:** Classic single-server queue with exponential arrivals (rate 0.9) and exponential service (rate 1.0). Utilisation 90%.

### Entity Types

| Name | Role | Count | Attributes |
|---|---|---|---|
| Customer | customer | — | (none) |
| Server | server | 1 | (none) |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Customer | Customer | FIFO | Unlimited |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Arrival | `ARRIVE(Customer)` | Reschedules itself via Exponential(mean=1.111) |
| Complete | `COMPLETE()` | (none — scheduled dynamically by C-Event) |

### C-Events

| Event | Priority | Condition | Effect | Schedules |
|---|---|---|---|---|
| Seize | 1 | `queue(Customer).length > 0 AND idle(Server).count > 0` | `ASSIGN(Customer, Server)` | Exponential(mean=1) → Complete |

### Flow

```
Source ──arrival──> [Customer Queue] ──seize──> [Server Activity] ──complete──> Sink
```

- ARRIVE places entity in Customer queue (matched by customerType).
- C-Event checks queue non-empty AND server idle → ASSIGN takes entity, sets server busy.
- Service time sampled (Exponential mean=1), schedules Complete B-Event.
- COMPLETE releases server, records stats, marks entity done.

### Verdict: ✅ Correct

---

## 2. Call Center

**Description:** Multi-server call centre with 3 agents, exponential arrivals (rate 1.5), exponential service (rate 0.4), and caller abandonment after 10 time units.

### Entity Types

| Name | Role | Count |
|---|---|---|
| Caller | customer | — |
| Agent | server | 3 |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Caller | Caller | FIFO | Unlimited |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Arrival | `ARRIVE(Caller)` | Exponential(mean=0.667) → Arrival; Fixed(value=10, isRenege) → Abandonment Timer |
| Complete | `COMPLETE()` | (none — scheduled dynamically) |
| Abandonment Timer | `RENEGE(ctx)` | (none — scheduled dynamically per-entity by Arrival) |

### C-Events

| Event | Priority | Condition | Effect | Schedules |
|---|---|---|---|---|
| Assign Agent | 1 | `queue(Caller).length > 0 AND idle(Agent).count > 0` | `ASSIGN(Caller, Agent)` | Exponential(mean=2.5) → Complete |

### Flow

```
Source ──arrival──> [Caller Queue] ──seize──> [Agent Activity] ──complete──> Sink
```

### ✅ Fix Applied: Per-entity RENEGE scheduling

**Problem:** The "Abandonment Timer" B-Event was scheduled once at t=9999 with no recurrence. `RENEGE(Caller)` parsed "Caller" as an entity ID (NaN), so abandonment never fired.

**Fix:** 
1. Changed `RENEGE(Caller)` to `RENEGE(ctx)` — the `ctx` keyword uses the FEL context customer ID.
2. Added per-entity renege scheduling to the ARRIVE event's schedules: each arrival schedules an Abandonment Timer with a Fixed(10) patience delay and `isRenege: true` flag. When the ARRIVE fires, the engine identifies the newest waiting entity (the one just arrived) and schedules a renege event bound to that entity.

**Result:** Each caller that waits longer than 10 time units is reneged (abandoned).

---

## 3. ER Triage

**Description:** Two-stage emergency room. Patients arrive, see a triage nurse (2 nurses), then queue for a doctor (3 doctors). Priority queue for treatment.

### Entity Types

| Name | Role | Count | Attributes |
|---|---|---|---|
| Patient | customer | — | priority: number (default 3, mutable) |
| Nurse | server | 2 | (none) |
| Doctor | server | 3 | (none) |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Patient | Patient | FIFO | Unlimited |
| Treatment | *(missing)* | PRIORITY | Unlimited |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Arrival | `ARRIVE(Patient)` | Exponential(mean=2) → Arrival (recurrence) |
| Triage Done | `RELEASE(Nurse, Treatment)` | (none — scheduled dynamically) |
| Treatment Done | `COMPLETE()` | (none — scheduled dynamically) |

### C-Events

| Event | Prio | Condition | Effect | Schedules |
|---|---|---|---|---|
| Start Triage | 1 | `queue(Patient).length > 0 AND idle(Nurse).count > 0` | `ASSIGN(Patient, Nurse)` | Uniform(min=2, max=5) → Triage Done |
| Start Treatment | 2 | `queue(Treatment).length > 0 AND idle(Doctor).count > 0` | `ASSIGN(Treatment, Doctor)` | Triangular(min=5, mode=10, max=20) → Treatment Done |

### Flow

```
Source ──arrival──> [Patient Queue FIFO]
                        │ c_triage (ASSIGN → Nurse)
                        ▼
                   [Triage Activity] ──triage_done──> RELEASE(Nurse, Treatment)
                                                           │
                                                           ▼
                                                   [Treatment Queue PRIORITY]
                                                           │ c_treat (ASSIGN → Doctor)
                                                           ▼
                                                   [Treatment Activity] ──treatment_done──> COMPLETE → Sink
```

- Patient queue (FIFO): first-come-first-served for triage. ✓
- Treatment queue (PRIORITY): higher acuity (lower priority number = higher priority) treated first. ✓
- `RELEASE(Nurse, Treatment)` correctly routes the entity to the Treatment queue with the Nurse becoming idle.

### ⚠️ Issue: Treatment queue missing `customerType`

The Treatment queue definition is:
```js
{ id: "q_treatment", name: "Treatment", capacity: "", discipline: "PRIORITY" }
```

It has no `customerType` field. The Patient queue has `customerType: "Patient"`. This may affect queue-display logic and validation. The Treatment queue should have `customerType: "Patient"` to match the entities it holds.

---

## 4. Fast Food Drive-Through

**Description:** Three-stage drive-through: Order → Payment → Pickup. 1 cashier, 2 kitchen staff.

### Entity Types

| Name | Role | Count |
|---|---|---|
| Customer | customer | — |
| Cashier | server | 1 |
| Kitchen | server | 2 |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Order | Customer | FIFO | Unlimited |
| Payment | Customer | FIFO | Unlimited |
| Pickup | Customer | FIFO | Unlimited |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Arrival | `ARRIVE(Customer)` | Exponential(mean=1.5) → Arrival |
| Order Taken | `RELEASE(Cashier, Payment)` | (none — scheduled dynamically) |
| Payment Done | `RELEASE(Cashier, Pickup)` | (none — scheduled dynamically) |
| Pickup Done | `COMPLETE()` | (none — scheduled dynamically) |

### C-Events

| Event | Prio | Condition | Effect | Schedules |
|---|---|---|---|---|
| Take Order | 1 | `queue(Order).length > 0 AND idle(Cashier).count > 0` | `ASSIGN(Customer, Cashier)` | Uniform(0.5, 1.5) → Order Taken |
| Take Payment | 2 | `queue(Payment).length > 0 AND idle(Cashier).count > 0` | `ASSIGN(Customer, Cashier)` | Uniform(0.3, 0.8) → Payment Done |
| Serve Food | 3 | `queue(Pickup).length > 0 AND idle(Kitchen).count > 0` | `ASSIGN(Customer, Kitchen)` | Uniform(1, 3) → Pickup Done |

### Flow (fixed — three-stage routing)

```
Source ──arrival──> [Order Queue]
                        │ c_order: ASSIGN(Customer, Cashier)
                        ▼
                   [Cashier: Take Order] ──order_done──> RELEASE(Cashier, Payment)
                                                              │
                                                              ▼
                                                         [Payment Queue]
                                                              │ c_pay: ASSIGN(Customer, Cashier)
                                                              ▼
                                                         [Cashier: Take Payment] ──pay_done──> RELEASE(Cashier, Pickup)
                                                                                                    │
                                                                                                    ▼
                                                                                               [Pickup Queue]
                                                                                                    │ c_pickup: ASSIGN(Customer, Kitchen)
                                                                                                    ▼
                                                                                               [Kitchen: Serve Food] ──pickup_done──> COMPLETE()
                                                                                                                                         │
                                                                                                                                         ▼
                                                                                                                                       Sink
```

### ✅ Fix Applied: RELEASE routing

**Problem:** All three intermediate B-Events used `COMPLETE()`, marking the entity done after the first stage.

**Fix:** 
- Changed `b_order_done` to `RELEASE(Cashier, Payment)` — routes entity to Payment queue.
- Changed `b_pay_done` to `RELEASE(Cashier, Pickup)` — routes entity to Pickup queue.
- Kept `b_pickup_done` as `COMPLETE()` — final stage terminates.
- Added `customerType: "Customer"` to all three queues.

**Result:** Customer flows Order → Payment → Pickup across all three stages.

---

## 5. Factory Assembly

**Description:** Assembly line where 3 parts are batched into 1 product. 2 workers.

### Entity Types

| Name | Role | Count |
|---|---|---|
| Part | customer | — |
| Worker | server | 2 |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Parts | Part | FIFO | Unlimited |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Part Arrival | `ARRIVE(Part)` | Exponential(mean=2) → Part Arrival |
| Assembly Done | `COMPLETE()` | (none — scheduled dynamically) |

### C-Events

| Event | Prio | Condition | Effect | Schedules |
|---|---|---|---|---|
| Assemble Product | 1 | `queue(Parts).length >= 3 AND idle(Worker).count > 0` | `BATCH(Parts, 3)` | Fixed(value=2) → Assembly Done |

### Flow

```
Source ──arrival──> [Parts Queue] ──BATCH(3)──> [Worker Activity] ──complete──> Sink
```

- BATCH accumulates 3 parts from queue, creates a single batch entity (`role: "batch"`, `batch.children` containing the 3 parts).
- Assembly done marks the batch entity as complete. Individual parts are not unbatched — the product stays as a single unit.

### Verdict: ✅ Correct (for BATCH demonstration)

For a full BATCH→UNBATCH demonstration, an UNBATCH B-Event could be added after assembly, but as a simple batch assembly demo this is correct.

---

## 6. Airport Security

**Description:** Two-stage security screening with limited queue capacity. Document check (2 officers) then baggage scan (3 scanners). Queue capacity 15 at each stage causes balking.

### Entity Types

| Name | Role | Count |
|---|---|---|
| Passenger | customer | — |
| Officer | server | 2 |
| Scanner | server | 3 |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Documents | *(missing)* | FIFO | 15 |
| Scanner | *(missing)* | FIFO | 15 |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Arrival | `ARRIVE(Passenger)` | Exponential(mean=1) → Arrival |
| Document Check Done | `COMPLETE()` | (none — scheduled dynamically) |
| Scan Done | `COMPLETE()` | (none — scheduled dynamically) |

### C-Events

| Event | Prio | Condition | Effect | Schedules |
|---|---|---|---|---|
| Check Documents | 1 | `queue(Documents).length > 0 AND idle(Officer).count > 0` | `ASSIGN(Passenger, Officer)` | Triangular(0.5, 1, 2) → Document Check Done |
| Scan Baggage | 2 | `queue(Scanner).length > 0 AND idle(Scanner).count > 0` | `ASSIGN(Passenger, Scanner)` | Triangular(1, 2, 4) → Scan Done |

### ❌ Issue: Two-stage flow broken — both B-Events use COMPLETE()

Same problem as Fast Food. `COMPLETE()` marks the entity as done after the document check stage. The entity never reaches the Scanner queue. The c_scan C-Event never fires.

**Fix needed:** The Document Check Done B-Event should use `RELEASE(Officer, Scanner)` to route the passenger to the Scanner queue. Only the Scan Done B-Event should use COMPLETE().

Also, both queues are missing `customerType` fields.

---

## 7. Construction Logistics

**Description:** Truck hauling operation with 2 loaders, 1 weigh station, and state variable tracking.

### Entity Types

| Name | Role | Count |
|---|---|---|
| Truck | customer | — |
| Loader | server | 2 |
| Scale | server | 1 |

### State Variables

| Name | Initial Value |
|---|---|
| trucksLoaded | 0 |
| trucksWeighed | 0 |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Truck | Truck | FIFO | Unlimited |
| Weigh | *(missing)* | FIFO | Unlimited |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Truck Arrival | `ARRIVE(Truck)` | Exponential(mean=2.5) → Truck Arrival |
| Load Done | `RELEASE(Loader, Weigh); trucksLoaded++` | (none — scheduled dynamically) |
| Weigh Done | `COMPLETE(); trucksWeighed++` | (none — scheduled dynamically) |

### C-Events

| Event | Prio | Condition | Effect | Schedules |
|---|---|---|---|---|
| Start Loading | 1 | `queue(Truck).length > 0 AND idle(Loader).count > 0` | `ASSIGN(Truck, Loader)` | Triangular(3, 5, 8) → Load Done |
| Start Weighing | 2 | `queue(Weigh).length > 0 AND idle(Scale).count > 0` | `ASSIGN(Weigh, Scale)` | Uniform(1.5, 3) → Weigh Done |

### Flow

```
Source ──arrival──> [Truck Queue]
                        │ c_load: ASSIGN(Truck, Loader)
                        ▼
                   [Loader Activity] ──load_done──> RELEASE(Loader, Weigh); trucksLoaded++
                                                        │
                                                        ▼
                                                   [Weigh Queue]
                                                        │ c_weigh: ASSIGN(Weigh, Scale)
                                                        ▼
                                                   [Scale Activity] ──weigh_done──> COMPLETE(); trucksWeighed++
                                                                                         │
                                                                                         ▼
                                                                                       Sink
```

- Compound effects (`RELEASE(...); var++`) work correctly via the semicolon parser in `applyEffect()`.
- RELEASE routes entity to the named queue ("Weigh"), matching the queue definition.
- State variables track cumulative counts.

### Verdict: ✅ Correct

This is the structurally best template — it demonstrates proper multi-stage routing with RELEASE and state variable tracking.

---

## 8. Data Center

**Description:** Compute cluster with 10 servers. Jobs arrive every 2 min, processed in Triangular(5,8,15) min.

### Entity Types

| Name | Role | Count |
|---|---|---|
| Job | customer | — |
| Host | server | 10 |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Job | Job | FIFO | Unlimited |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Job Arrival | `ARRIVE(Job)` | Exponential(mean=2) → Job Arrival |
| Process Done | `COMPLETE()` | (none — scheduled dynamically) |

### C-Events

| Event | Prio | Condition | Effect | Schedules |
|---|---|---|---|---|
| Process Job | 1 | `queue(Job).length > 0 AND idle(Host).count > 0` | `ASSIGN(Job, Host)` | Triangular(5, 8, 15) → Process Done |

### Verdict: ✅ Correct

Straightforward multi-server pool. 10 Hosts with capacity > 1. No routing needed — single-stage.

---

## 9. Outpatient Clinic

**Description:** Two-stage clinic: check-in with receptionist (2), then consultation with doctor (4). Patients arrive every 5 min.

### Entity Types

| Name | Role | Count |
|---|---|---|
| Patient | customer | — |
| Receptionist | server | 2 |
| Doctor | server | 4 |

### State Variables

| Name | Initial Value |
|---|---|
| checkedIn | 0 |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Patient | Patient | FIFO | Unlimited |
| Consultation | *(missing)* | FIFO | Unlimited |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Arrival | `ARRIVE(Patient)` | Exponential(mean=5) → Arrival |
| Check-in Done | `RELEASE(Receptionist, Consultation); checkedIn++` | (none — scheduled dynamically) |
| Consultation Done | `COMPLETE()` | (none — scheduled dynamically) |

### C-Events

| Event | Prio | Condition | Effect | Schedules |
|---|---|---|---|---|
| Start Check-in | 1 | `queue(Patient).length > 0 AND idle(Receptionist).count > 0` | `ASSIGN(Patient, Receptionist)` | Uniform(2, 4) → Check-in Done |
| Start Consultation | 2 | `queue(Consultation).length > 0 AND idle(Doctor).count > 0` | `ASSIGN(Consultation, Doctor)` | Triangular(8, 15, 25) → Consultation Done |

### Flow

```
Source ──arrival──> [Patient Queue FIFO]
                        │ c_checkin: ASSIGN(Patient, Receptionist)
                        ▼
                   [Check-in Activity] ──checkin_done──> RELEASE(Receptionist, Consultation); checkedIn++
                                                              │
                                                              ▼
                                                     [Consultation Queue FIFO]
                                                              │ c_consult: ASSIGN(Consultation, Doctor)
                                                              ▼
                                                     [Consultation Activity] ──consult_done──> COMPLETE()
                                                                                                    │
                                                                                                    ▼
                                                                                                  Sink
```

### Verdict: ✅ Correct

Proper two-stage RELEASE routing with state variable tracking. Same pattern as Construction Logistics.

### ⚠️ Minor: Consultation queue missing `customerType`

Should have `customerType: "Patient"` for consistency and display purposes.

---

## 10. Warehouse Picking

**Description:** Orders arrive every 3 min, batched into groups of 5, then picked by 3 workers (8 min per batch). Demonstrates BATCH macro for order consolidation.

### Entity Types

| Name | Role | Count |
|---|---|---|
| Order | customer | — |
| Picker | server | 3 |

### State Variables

| Name | Initial Value |
|---|---|
| batchesPicked | 0 |

### Queues

| Queue Name | Customer Type | Discipline | Capacity |
|---|---|---|---|
| Order | Order | FIFO | Unlimited |

### B-Events

| Event | Effect | Schedules |
|---|---|---|
| Order Arrival | `ARRIVE(Order)` | Exponential(mean=3) → Order Arrival |
| Pick Done | `COMPLETE(); batchesPicked++` | (none — scheduled dynamically) |

### C-Events

| Event | Prio | Condition | Effect | Schedules |
|---|---|---|---|---|
| Batch Orders | 1 | `queue(Order).length >= 5` | `BATCH(Order, 5)` | (none) |
| Pick Batch | 2 | `queue(Order).length > 0 AND idle(Picker).count > 0` | `ASSIGN(Order, Picker)` | Fixed(value=8) → Pick Done |

### ⚠️ Issue: Potential batch entity handling in ASSIGN

When `BATCH(Order, 5)` fires, it creates a batch entity (role: `"batch"`, type preserved from child). This batch entity is placed into the Order queue. The c_pick C-Event then checks `queue(Order).length > 0` — this should see the batch entity in the queue.

However, `ASSIGN(Order, Picker)` picks an entity from the queue. The queue discipline is FIFO. The batch entity may or may not be selected correctly depending on how the ASSIGN macro handles entities with role `"batch"` vs `"customer"`.

**This needs manual testing to confirm the flow works end-to-end.**

---

## Summary of Issues

| Template | Severity | Issue |
|---|---|---|
| Call Center | **Medium** | RENEGE event never fires per-entity — abandonment doesn't work |
| ER Triage | **Low** | Treatment queue missing `customerType: "Patient"` |
| Fast Food | **High** | Three-stage flow broken — all COMPLETE(), no RELEASE routing |
| Airport Security | **High** | Two-stage flow broken — all COMPLETE(), no RELEASE routing |
| Construction Logistics | ✅ None | Correct RELEASE routing pattern |
| Outpatient Clinic | **Low** | Consultation queue missing `customerType: "Patient"` |
| Warehouse | **Medium** | Batch entity handling in ASSIGN needs verification |

### Recurring Patterns

1. **COMPLETE() used where RELEASE() is needed** (Fast Food, Airport Security) — multi-stage flows terminate at first stage. Fix: use `RELEASE(resource, nextQueue)` for intermediate stages, only COMPLETE() on final stage.

2. **Missing `customerType` on queues** (ER Triage Treatment queue, Fast Food all queues, Airport Security both queues, Construction Weigh queue, Outpatient Consultation queue) — while entities routed via RELEASE may work without it, display and validation logic may be affected.

3. **Call Center abandonment non-functional** — RENEGE event is a one-shot at t=9999 with no recurrence or per-entity scheduling.

---

## Recommended Fixes

### Fast Food Drive-Through

Replace the Order Taken and Payment Done B-Event effects with RELEASE:

```js
// Current (broken)
{ id: "b_order_done", effect: "COMPLETE()" }
{ id: "b_pay_done",   effect: "COMPLETE()" }
{ id: "b_pickup_done",effect: "COMPLETE()" }

// Fixed
{ id: "b_order_done",  effect: "RELEASE(Cashier, Payment)",    schedules: [] }
{ id: "b_pay_done",    effect: "RELEASE(Cashier, Pickup)",     schedules: [] }
{ id: "b_pickup_done", effect: "COMPLETE()",                   schedules: [] }
```

### Airport Security

Replace the Document Check Done B-Event effect with RELEASE:

```js
// Current (broken)
{ id: "b_doc_done",  effect: "COMPLETE()" }
{ id: "b_scan_done", effect: "COMPLETE()" }

// Fixed
{ id: "b_doc_done",  effect: "RELEASE(Officer, Scanner)", schedules: [] }
{ id: "b_scan_done", effect: "COMPLETE()",                schedules: [] }
```

### Call Center

Add per-entity RENEGE scheduling. The ARRIVE effect or queue definition needs to schedule the Abandonment Timer with a patience delay for each entity that joins the queue. This may require engine-level changes to the queue-data model (automatic renege scheduling on queue join).

### Queue customerType

Add `customerType: "Patient"` to ER Triage Treatment queue and Outpatient Consultation queue. Add `customerType: "Customer"` to Fast Food queues. Add `customerType: "Passenger"` to Airport Security queues. Add `customerType: "Truck"` to Construction Weigh queue.
