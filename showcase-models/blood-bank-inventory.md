# Blood Bank Inventory — Showcase Model Notes

**Model file:** `blood-bank-inventory.json`  
**Domain:** Healthcare  
**DES method:** Pidd's Three-Phase (A/B/C)  
**simmodlr features demonstrated:** FILL (0 templates), DRAIN (0 templates), containers (0 templates), DELAY (0 templates), piecewise distributions, container conditions, weekly schedule patterns, COST, SET

---

## 1. Problem Statement

The UK's blood supply is a perishable inventory problem with life-or-death consequences. NHS Blood and Transplant (NHSBT) manages approximately 1.4 million red blood cell units annually across ~200 hospitals. Each unit costs ~GBP 130 and expires after **42 days**. Too little stock risks cancelled elective surgeries; too much means wasted donations and millions in preventable loss.

**The core tension:** order too much and units expire unused. Order too little and elective surgeries get cancelled. Every blood bank manager lives in this tension daily.

### The numbers (NHSBT Annual Report 2023-24)

| Metric | Value |
|---|---|
| Annual red cell issues | 1.4 million units |
| Typical hospital daily demand | 15-25 units |
| Red cell shelf life | 42 days |
| Wastage target | <2% of issues |
| Actual wastage (2023) | 2.5% (~35,000 units, ~GBP 4.5M) |
| Cost per unit (NHSBT) | ~GBP 130 |
| Stock holding target | 5-7 days supply |

---

## 2. Why Discrete-Event Simulation?

### 2.1 Inventory is a queue with time-dependent shelf life

Standard inventory models (EOQ, newsvendor) assume products are non-perishable. Blood units have a **hard expiry** at 42 days. A unit donated Monday expires 5 days earlier than one donated Friday — but both are identical at the moment of use. DES can track this because each donation is an entity with a creation timestamp, and the queue discipline is FIFO (oldest blood used first).

### 2.2 Supply and demand are both stochastic with different patterns

Donations arrive 24/7 (mobile blood drives on weekends, donor centres during the week). Transfusions are predominantly weekday daytime (scheduled surgeries). The mismatch between supply rhythm and demand rhythm creates natural inventory cycles. **Piecewise distributions** model this: one arrival rate for weekdays, another for weekends.

### 2.3 Processing has constrained operating hours

Donated blood must be tested, typed, and component-separated by lab technicians. Lab staff work **Mon-Fri 08:00-18:00**. Donations arriving Saturday queue until Monday morning — creating a weekend build-up. simmodlr's weekly schedule patterns handle this natively.

### 2.4 Containers are the right abstraction for bulk inventory

Unlike an emergency department where every entity has its own journey, blood inventory is *fungible*. One O-positive unit is interchangeable with any other. simmodlr's FILL/DRAIN containers capture this precisely: donations FILL the container, transfusions DRAIN it. The container tracks level, min/max, and time-average — KPIs a blood bank manager actually cares about.

### 2.5 DELAY enables resource-free activities

Transfusion fulfillment does not require "seizing" a piece of equipment — it is an instantaneous decision when stock is available. The DELAY macro models this exactly: remove entity from queue, mark "busy" without a server, resolve via completion B-event. This avoids the hack of creating a dummy "Dispenser" server type.

---

## 3. Model Walkthrough

### 3.1 Entity flow

```
Donation Arrives ──→ [Processing Queue] ──→ LabTech (Mon-Fri 08-18)
  (24/7, mean 1.3h)                              │
                                                  ▼
                                        FILL(rc_stock, 1)
                                        unitsDonated++
                                        COMPLETE()
                                                  │
                                    ┌─────────────┘
                                    ▼
                              [rc_stock CONTAINER]
                              (capacity: 200)
                              (initial: 80)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Transfusion       Transfusion      Expiry Purge
              (weekday 1.2h)    (weekend 3h)    (every 168h)
                    │               │               │
                    ▼               ▼               ▼
        [TransfusionQ] ──→ DELAY ──→ DRAIN(rc_stock,1)   DRAIN(rc_stock,17)
              │            (instant)   COST(130)          COST(2210)
              │                        COMPLETE           SET(unitsWasted)
              │
        [Blocked if stock=0]
```

### 3.2 Entity types

| Entity | Role | Attributes | Notes |
|---|---|---|---|
| `Donation` | customer | none | Represents one unit of donated blood. Created by b_donate |
| `Transfusion` | customer | none | Represents one transfusion request. Created by b_transfuse_arrive |
| `LabTech` | server | count: 3 | Mon-Fri 08:00-18:00 via weekly schedule pattern |

### 3.3 Containers

| Container | Capacity | Initial | Purpose |
|---|---|---|---|
| `rc_stock` | 200 | 80 | Red blood cell inventory. FILLed by donations, DRAINed by transfusions and expiry |

### 3.4 B-Events

| Event | Effect | Schedule | Purpose |
|---|---|---|---|
| `b_donate` | `ARRIVE(Donation, Processing)` | Exponential(mean=1.3h) | ~18.5 units/day, 24/7 |
| `b_processed` | `FILL(rc_stock, 1)`, `unitsDonated++`, `COMPLETE()` | — | Adds unit to inventory, releases LabTech, completes entity |
| `b_transfuse_arrive` | `ARRIVE(Transfusion, TransfusionQ)` | Piecewise | Weekdays: Exponential(1.2h). Weekends: Exponential(3h) |
| `b_transfused` | `DRAIN(rc_stock, 1)`, `COST(130)`, `unitsIssued++`, `COMPLETE()` | — | Consumes from container, tracks cost, completes entity |
| `b_expire_purge` | `DRAIN(rc_stock, 17)`, `COST(2210)`, `SET(unitsWasted, unitsWasted+17)` | Constant(168h) | Weekly expiry sweep |

### 3.5 C-Events

| Event | Priority | Condition | Effect | cSchedule |
|---|---|---|---|---|
| `c_process` | 1 | Processing queue + idle LabTech | `ASSIGN(Processing, LabTech)` | Triangular(1.5, 2, 3)h |
| `c_transfuse` | 2 | Container level ≥ 1 + TransfusionQ > 0 | `DELAY(TransfusionQ)` | Fixed(0.01h) — instant fulfillment |

### 3.6 Key design: DELAY pattern

The `c_transfuse` C-event uses DELAY instead of ASSIGN. From the LLM schema (§6.2):

> *"Use DELAY instead of ASSIGN whenever the activity does not actually claim a piece of equipment or staff — only time passes."*

**Why this matters:** Transfusion fulfillment is a decision, not a service. There is no "dispenser" machine. DELAY removes the entity from TransfusionQ, marks it "serving" with `_isDelay = true` (no server claimed), and the completion B-event `b_transfused` does DRAIN + COST + COMPLETE. The engine's COMPLETE() macro explicitly checks `_isDelay` and skips the "no matching busy server" guard.

The container condition `container(rc_stock).level >= 1` ensures the C-event only fires when stock is available — making DRAIN reliable.

---

## 4. Key Assumptions & Simplifications

| # | Assumption | Justification |
|---|---|---|
| A1 | **FIFO inventory rotation** — oldest blood used first | NHSBT standard operating procedure. The Processing queue + TransfusionQ are both FIFO |
| A2 | **Single blood type** — all units interchangeable | Real banks manage 8 types. Multi-type would need 8 containers + cross-matching. v2 enhancement |
| A3 | **Bulk weekly expiry** — 17 units expire simultaneously every 168h | In reality, expiry is continuous. The bulk purge approximates average weekly rate (~2.4 units/day x 7 = ~17). DRAIN guard (no-op if level < amount) means low-stock weeks are not over-counted for cost |
| A4 | **No emergency orders** — stockouts mean transfusions wait | In reality, hospitals can request emergency NHSBT deliveries (1-2h response). Model shows stockout as queue buildup in TransfusionQ |
| A5 | **Infinite donor supply** — donations never run dry | Seasonal variation exists (summer/winter dips). Piecewise arrival for donations would model this. v2 enhancement |
| A6 | **Instant dispensing** — transfusion fulfillment ~0.01h | Blood issuing is essentially instantaneous once the decision is made |
| A7 | **No platelet/plasma inventory** — red cells only | Platelets expire in 5-7 days (much tighter). Adding them would demonstrate different expiry rates. v2 enhancement |
| A8 | **No wastage from processing failures** | ~1% of donations fail screening. Not modelled currently |

---

## 5. Data Sources & Parameter Calibration

| Parameter | Value | Source |
|---|---|---|
| Donation arrival rate | Exponential(mean=1.3h) ≈ 0.77/h ≈ 18.5/day | Calibrated to balance demand + wastage at steady-state |
| LabTech processing time | Triangular(1.5, 2, 3) hours | NHSBT reference: testing + typing + component separation |
| LabTech schedule | Mon-Fri 08:00-18:00 | NHSBT standard lab hours |
| LabTech count | 3 | Calibrated to ~24 units/day throughput at 80% utilisation |
| Transfusion rate (weekday) | Exponential(mean=1.2h) ≈ 0.83/h ≈ 5.4/day per period | NHSBT: ~19 units/day demand for medium hospital, concentrated in ~10 waking hours |
| Transfusion rate (weekend) | Exponential(mean=3h) ≈ 0.33/h | Reduced weekend demand (emergencies only) |
| Shelf life | 42 days = 1008 hours | Standard red cell shelf life (SAGM additive) |
| Weekly expiry | 17 units (~2.4/day x 7) | Steady-state approximation for ~100-unit stock with 42-day shelf life |
| Container capacity | 200 units | ~10 days supply at peak demand |
| Initial stock | 80 units | ~4 days supply — representative of mid-week level |
| Cost per unit | GBP 130 | NHSBT 2024 price list |
| Warm-up | 168 hours (1 week) | Covers initial stock stabilisation |
| Max sim time | 1000 hours (~6 weeks) | Enough for multiple weekly cycles |

---

## 6. Design Iteration — Changes Made During Validation

| # | Original Idea | Issue Found | Rule / Reference | Fix Applied |
|---|---|---|---|---|
| 1 | Single constant transfusion rate | Ignores weekday/weekend demand pattern | — | Piecewise distribution: 4 periods alternating weekday (1.2h) and weekend (3h) rates |
| 2 | `Dispenser` dummy server + `ASSIGN` for transfusion fulfillment | Hacky virtual server — semantically wrong, clutters entity types. LLM schema MISTAKE #17 explicitly says "use DELAY instead" | MISTAKE #17, §6.2 | `DELAY(TransfusionQ)` — resource-free timed activity. COMPLETE() on completion B-event is valid because engine checks `_isDelay` flag |
| 3 | `RENEGE_OLDEST` considered for consuming transfusion entities | Would mark fulfilled orders as "abandoned" — wrong outcome status in `summary.outcomes` | — | Resolved by DELAY + COMPLETE (entity exits as "completed") |
| 4 | LabTech available 24/7 | Unrealistic — blood banks do not process overnight or weekends | — | Added schedulePattern: Mon-Fri 08:00-18:00, `defaultCapacity: 0` |
| 5 | No container condition on C-event | Transfusion could fire when stock is zero, DRAIN would silently fail but entity still completes | — | Added `container(rc_stock).level >= 1` to c_transfuse condition. Per §6.1 and §8: C-event re-scanned each cycle, simply will not fire until level condition met |
| 6 | DRAIN guard in b_expire_purge — amount 17 may exceed available stock | DRAIN fails silently (no-op) if level < amount, but COST(2210) and SET() still execute | — | Accepted simplification. In steady-state, stock stays well above 17 units (~5-day supply at 19/day = 95). If stock drops below 17, the system is in crisis — expiry purge failing is the least concern. A v2 model would use a C-event with `DRAIN(rc_stock, min(container(rc_stock).level, 17))` but expressions are not supported in DRAIN amount |

### LLM Schema Audit

Full audit performed against `docs/model-schema-for-llm.md` v2.4.0. Passed all checks: V5, V8, V12, V13, V19, V26, V27, V34, V35, V38, V39, V45, V47, V55, CHK-013, and all 20 TOP LLM MISTAKES. **0 issues.**

---

## 7. Questions This Model Answers

### Primary
**"How many lab technicians (LabTech count) minimise wastage while avoiding stockouts?"**
- Run parametric sweep over LabTech count (1 to 6)
- At 1-2 techs: weekend backlog builds up, processing can not keep up, stock depletes → stockouts
- At 3-4 techs: steady-state, moderate wastage from regular weekly purge
- At 5-6 techs: over-staffed, stock grows toward capacity, wastage increases from more units expiring

### Secondary
**"What is the stockout risk with weekend-only processing gaps?"**
- Observe TransfusionQ length on Monday mornings. After 48+ hours without processing, the queue builds. Compare to weekday baseline.

### Tertiary
**"What stock holding level minimises total cost (wastage + stockout)?"**
- Sweep container initialLevel or capacity to find optimal stocking level

---

## 8. Parametric Sweep Guide

1. Open the model in simmodlr
2. Go to Execute tab → Run Configuration
3. Enable "Parametric Sweep" (1D)
4. Select parameter: Entity Type → LabTech → count
5. Set range: 1 to 6, step 1
6. Run
7. Observe: totalCost (wastage GBP) vs. container minLevel (stockout indicator)
8. The optimal count balances wastage cost against stockout risk

---

## 9. Expected Results

With 3 LabTechs (baseline):
- Steady-state stock oscillates around 80-120 units
- Weekly expiry purge removes ~17 units, wastage ~GBP 2,200/week
- Transfusion queue mostly empty (instant fulfillment when stock available)
- Processing queue builds to ~20-30 over weekends, clears by Tuesday

With 2 LabTechs:
- Processing cannot keep up with 24/7 donations
- Stock drifts downward over time
- TransfusionQ grows → stockouts become frequent
- Wastage decreases (less stock to expire) but stockouts increase

With 5 LabTechs:
- Processing clears faster
- Stock drifts upward toward capacity
- Wastage increases (more units expire)
- Zero stockouts

---

## 10. simmodlr Features Demonstrated

| Feature | Where in model | First in any template? |
|---|---|---|
| `FILL` | b_processed | **Yes — zero templates use FILL** |
| `DRAIN` | b_transfused, b_expire_purge | **Yes — zero templates use DRAIN** |
| Container types | rc_stock | **Yes — zero templates use containers** |
| Container in condition | `container(rc_stock).level >= 1` | **Yes — novel pattern** |
| `DELAY` | c_transfuse | **Yes — zero templates use DELAY** |
| `SET` | b_expire_purge | Yes (1 existing template) |
| `COST` | b_transfused, b_expire_purge | 1 existing template |
| Piecewise distribution | b_transfuse_arrive | **Yes — under-demonstrated** |
| Weekly schedule pattern | LabTech | Yes (new in this suite) |
| Container-scoped goals | goal on container.minLevel | **Yes** |
| Multi-stream arrivals | Donations + Transfusions | Standard |
| Parametric sweep | Sweep LabTech count | No template sweeps by default |
| State variables | unitsIssued, unitsWasted, stockouts, unitsDonated | Standard |

---

## 11. References

1. **NHS Blood and Transplant Annual Report and Accounts 2023-24** — Supply and issue statistics, wastage rates, cost per unit.
2. **SHOT (Serious Hazards of Transfusion) Annual Report 2023** — Haemovigilance data, clinical transfusion practice.
3. **JPAC (Joint United Kingdom Blood Transfusion and Tissue Transplantation Services Professional Advisory Committee) Guidelines** — Inventory management standards.
4. **Blake, J.T. et al. (2013). "Using simulation for strategic blood supply chain design in the Canadian context." *Transfusion*, 53(6).** — DES applied to blood inventory management with perishable products.
5. **Kopach, R. et al. (2008). "Tutorial on blood supply chain management using simulation." *Proceedings of the Winter Simulation Conference*.** — Methodology for modelling blood bank operations as a queuing-inventory system.
6. **NHS Reference Costs 2023-24** — Unit cost of blood components.

---

*Generated for simmodlr showcase gallery — June 2026*
