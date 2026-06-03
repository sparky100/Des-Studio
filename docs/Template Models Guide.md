# simmodlr — Template Models Guide

Templates are pre-built simulation models available in the **Templates** tab of your library. Clicking a template saves a private copy to your account and opens it with auto-execute enabled. Results appear within seconds, so you can explore the model before modifying anything.

Each template teaches a different modelling concept — from a single queue through to failure analysis, priority escalation, and cost optimisation.

---

## Version History

| Version | Release | Changes |
|---|---|---|
| v1.0 | Initial release | Core templates: M/M/1, Call Center, ER Triage, Fast Food, Factory, Airport, Construction, Data Center, Outpatient, Warehouse, Ward Bed, Bank Branch, Retail, Port Berth |
| v1.1 | Sprint 42 | Loop Guard added to `loopConfig` on entity types; `balkCondition` expression field added to queues. ER Triage updated to use `balkCondition`. |
| v1.2 | Sprint 45 | Three new templates added: Machine Shop with Failures (FAIL/REPAIR macros, MTBF/MTTR), Priority Emergency Department with Triage Escalation (balkCondition, loopConfig Loop Guard, SET_ATTR), Cost-Optimised Call Centre (COST macro, totalCost goal, AI sweep feasibility). |
| v1.3 | Sprints 62-66 | Appointment Clinic added: showcases Schedule distribution with per-arrival `rows[]` attributes, real-world clock (epoch/timeUnit), attribute-conditional routing at RELEASE, and `cSchedule.when` service-time branching. |

---

## 1. M/M/1 Queue

**Concept:** The classic single-server queue — the "Hello World" of simulation.

Jobs arrive at a single server on average every 1.11 time units (rate 0.9). Service takes 1 time unit on average. The server is busy 90% of the time.

**What to watch:** The queue grows and shrinks. Average wait time should be around 9 time units. This is the benchmark model; compare it against the analytical M/M/1 formula W = ρ / (μ − λ).

**Entity types:** Customer (arriving), Server (1)

**Distribution:** Exponential for both arrival and service

---

## 2. Call Center

**Concept:** Multi-server queue with abandonment.

Calls arrive every 0.67 time units. 3 agents handle calls with average service time 2.5 time units. Callers who wait longer than 10 time units abandon using the `RENEGE` macro.

**What to watch:** The queue grows when all 3 agents are busy. Abandoned callers leave without service. Compare abandonment rate against agent count — try reducing to 2 agents and observe the spike in abandonment.

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

## 11. Ward Bed Admission

**Concept:** Two-stage hospital admission with bed capacity constraints.

Patients arrive and undergo assessment by 2 nurses (triangular 3–8 min), then queue for one of 10 ward beds (uniform 12–48 hour stay). When the ward is full, patients queue in the Admission area — this is "bed-blocking." State variables `admissions` and `bedBlocks` track throughput and blocking events.

**What to watch:** The Admission queue has capacity 5 — when full, new arrivals are lost. The Ward queue has capacity 20. Bed-blocking occurs when all 10 beds are occupied and assessed patients must wait. Compare admission rate against bed turnover.

**Entity types:** Patient (arriving), Nurse (2), Bed (10)

**Macro:** `RELEASE(Nurse, Ward)` for multi-stage routing; `COMPLETE()` for discharge

**State variables:** `admissions` (total admitted), `bedBlocks` (patients blocked waiting for bed)

**Queue capacity:** Admission cap 5, Ward cap 20 — models finite waiting space

---

## 12. Bank Branch

**Concept:** Multi-server priority queue with customer segmentation.

Customers arrive every 3 minutes and queue for 4 tellers. Each customer has a `priority` attribute (Uniform 1–5) — lower values are served first. Premium customers (priority 1–2) jump ahead of standard customers (priority 3–5) in the queue.

**What to watch:** The queue uses PRIORITY discipline. Customers with lower priority numbers are served first even if they arrived later. Watch for priority inversion — a high-priority customer arriving after several low-priority customers will be served ahead of them.

**Entity types:** Customer (arriving, with `priority` attribute), Teller (4)

**Attribute:** `priority` — Uniform(1, 5), lower = served first

**Discipline:** PRIORITY on the main queue

**Distribution:** Exponential arrivals (mean 3 min), Uniform service (3–8 min)

---

## 13. Retail Checkout

**Concept:** Multi-server finite-capacity queue with balking.

Shoppers arrive every 1.5 minutes and queue for 6 checkout lanes. The waiting area has capacity 20 — when full, new shoppers balk (leave without shopping). Service time varies by basket size (triangular 2–5–15 min).

**What to watch:** When the waiting area reaches 20, new arrivals are lost. The balking rate is a key metric — high balking suggests more checkouts are needed. Compare throughput against balking rate to find the optimal number of lanes.

**Entity types:** Shopper (arriving), Checkout (6)

**Queue capacity:** 20 on the waiting area — models finite waiting space

**Distribution:** Exponential arrivals (mean 1.5 min), Triangular service (2, 5, 15 min)

---

## 14. Port Berth Operations

**Concept:** Multi-server high-utilisation queue with congestion.

Vessels arrive every 8 hours and queue for one of 3 berths. Unloading takes 4–16 hours (triangular). With arrival rate close to service capacity, utilisation is around 83% — demonstrating congestion and berth capacity planning.

**What to watch:** With 3 berths and high utilisation, the queue grows during peak arrival periods. Average waiting time is sensitive to small changes in arrival rate or service time. State variable `vesselsDeparted` tracks throughput.

**Entity types:** Vessel (arriving), Berth (3)

**Distribution:** Exponential arrivals (mean 8 h), Triangular unloading (4, 8, 16 h)

**Key metric:** Utilisation ~83%; average wait time sensitive to arrival rate changes

---

## 15. Machine Shop with Failures (NEW — v1.2)

**Concept:** Equipment failures, repair cycles, and server downtime analysis using `FAIL` and `REPAIR` macros with MTBF/MTTR parameters.

A machine shop processes machining jobs on 4 CNC machines. Jobs arrive exponentially (mean 3 min). Machining time is triangular (4–8–14 min). Machines do not run indefinitely — each machine has a mean time between failures (MTBF) of 120 min and a mean time to repair (MTTR) of 20 min. When a machine fails, the `FAIL` macro fires as a B-Event: it sets the machine's status to `failed` and re-queues any job that was mid-service (with its remaining service time preserved). A repair technician (1 Technician resource) then begins the repair cycle. When repair completes, the `REPAIR` macro restores the machine to `idle` status and it re-enters the pool.

The model also uses `PREEMPT` to allow urgent jobs (flagged with `urgent = 1`) to interrupt a running machine and push the displaced job back to the front of the Machining queue with remaining service time intact.

**What to watch:** Track `machineDowntime` (sum of time all 4 machines spend in `failed` status) and `avgWaitDuringFailure` (queue length spike when machines are down). With MTBF 120 and MTTR 20, each machine is available roughly 85% of the time — so the effective capacity is 3.4 machines, not 4. Downtime has a nonlinear effect on queue wait; small reductions in MTTR produce large wait-time improvements.

**Entity types:** Job (arriving, with `urgent` attribute), Machine (4), Technician (1)

**Macros used:**
- `ARRIVE(Job)` — exponential inter-arrival, mean 3 min
- `ASSIGN(Machining, Machine)` — seizes a machine, schedules completion
- `FAIL(Machine)` — B-Event fires at MTBF interval; sets machine status to `failed`, re-queues interrupted job
- `REPAIR(Machine)` — B-Event fires after MTTR; restores machine to `idle`
- `PREEMPT(Machine)` — C-Event for urgent jobs; interrupts current job, records remaining service time
- `COMPLETE()` — job departs, machine freed

**Entity type fields:** `mtbf = 120`, `mttr = 20` on the Machine entity type (Sprint 42 fields)

**State variables:** `machineDowntime`, `repairCount`, `preemptedJobs`

**Key metric:** Effective throughput capacity = server count × availability = 4 × (MTBF / (MTBF + MTTR)). Vary MTTR from 10 to 40 to see downtime impact on average wait.

---

## 16. Priority Emergency Department with Triage Escalation (NEW — v1.2)

**Concept:** Demonstrates `balkCondition` expression, `loopConfig` Loop Guard for recirculation control, PRIORITY queue discipline, and `SET_ATTR` to update entity attributes mid-simulation.

Patients arrive at an emergency department every 2.5 minutes. Each patient starts with a `severity` attribute drawn from Uniform(1, 5) — lower = more urgent. There are 2 triage nurses and 5 treatment doctors.

**Triage stage:** Nurses assess patients (uniform 1–3 min) and may escalate severity. The triage completion effect uses `SET_ATTR(severity, newSeverity); RELEASE(Nurse, Treatment)` — the `SET_ATTR` macro writes the updated severity onto the entity before routing it to the Treatment queue. The Treatment queue uses **PRIORITY** discipline on the `severity` attribute, so a newly escalated patient jumps ahead of waiting lower-severity patients immediately.

**Balking with expression:** The Triage queue uses a `balkCondition` expression: `queue(Triage).length > 10 AND entity.severity > 3`. Non-urgent patients (severity 4–5) balk when the triage queue exceeds 10. Urgent patients (severity 1–2) never balk — they will always wait.

**Loop Guard — follow-up recirculation:** Some patients require a follow-up consultation after initial treatment. The `loopConfig` on the Patient entity type is set to `{ maxLoops: 3, onExceed: "exit" }`. After treatment, a random subset of patients (30%) are routed back to the Treatment queue for follow-up. The Loop Guard ensures no patient recirculates more than 3 times, preventing infinite loops. Patients who hit the limit exit with a `loopLimitReached = 1` attribute.

**What to watch:** Observe how `SET_ATTR` mid-flight changes queue ordering dynamically. Watch the Triage queue length — non-urgent patients balk when it exceeds 10, providing natural load shedding. Check `loopLimitReached` count in the Stats panel to see how many patients hit the recirculation cap.

**Entity types:** Patient (arriving, with `severity` attribute), Nurse (2), Doctor (5)

**Macros used:**
- `ARRIVE(Patient)` — exponential arrivals, mean 2.5 min
- `ASSIGN(Triage, Nurse)` — seizes nurse for triage
- `SET_ATTR(severity, newSeverity)` — updates severity attribute after triage assessment
- `RELEASE(Nurse, Treatment)` — frees nurse, routes patient to Treatment queue
- `ASSIGN(Treatment, Doctor)` — seizes doctor; Treatment queue is PRIORITY on `severity`
- `COMPLETE()` — patient departs or recirculates

**Queue fields:**
- `balkCondition: "queue(Triage).length > 10 AND entity.severity > 3"` on Triage queue (Sprint 42)
- Discipline: PRIORITY (on `severity`) on Treatment queue

**Entity type fields:** `loopConfig: { maxLoops: 3, onExceed: "exit" }` on Patient entity type (Sprint 42 Loop Guard)

**State variables:** `triageCompleted`, `treatmentsCompleted`, `balkCount`, `loopLimitReached`, `escalations`

**Key metric:** Compare wait time for severity-1 vs severity-5 patients. Observe that `SET_ATTR` mid-flight re-orders the Treatment queue dynamically — escalated patients move forward.

---

## 17. Cost-Optimised Call Centre (NEW — v1.2)

**Concept:** Demonstrates the `COST` macro, `totalCost` simulation goal, and AI-assisted Parametric Sweep with goal feasibility for finding the minimum-cost staffing configuration.

A call centre runs three tiers of agents with different hourly costs: Junior agents (cost $18/h), Senior agents (cost $28/h), and Specialist agents (cost $45/h). Callers arrive exponentially (mean 1.5 min). Junior agents handle standard calls (triangular 3–7 min). Senior agents handle escalated calls (uniform 5–12 min). Specialists handle complex cases (triangular 8–20 min). Escalation is 20% of calls from Junior, and 15% from Senior.

The `COST` macro fires on each `COMPLETE()` event and on each `RENEGE()` event. For completions, it records `agentHourlyCost × serviceDuration / 60` into the entity's cost field. For renegements (callers who abandon after waiting > 8 min), it records a fixed penalty cost of $15 per lost call. The simulation accumulates `totalCost` across all events.

**Goals:** The model defines two simulation goals:
- `avgWait < 2 minutes` (service-level goal)
- `totalCost` is minimised (cost goal — used by the AI sweep)

When you run the model, the **goal-aware KPI cards** immediately show whether `avgWait < 2` is satisfied (green tick) or not (red cross), alongside the current `totalCost`.

**Using the AI sweep:** Click **Parametric Sweep** and set sweep ranges for Junior count (1–6), Senior count (1–4), and Specialist count (1–3). Enable **Goal Feasibility** mode. The AI sweep engine evaluates each configuration, filters to only configurations where `avgWait < 2` is met (feasible), and then ranks the feasible configurations by `totalCost` ascending. The result is the minimum-cost staffing mix that still meets the service-level constraint.

**What to watch:** Without the cost goal, you might over-staff to easily meet wait targets. The `totalCost` goal forces the sweep to find configurations that are both effective and efficient. A typical run reveals that 3 Junior + 2 Senior + 1 Specialist meets the wait goal at lower cost than 4 Junior + 3 Senior + 0 Specialist.

**Entity types:** Caller (arriving), JuniorAgent (variable), SeniorAgent (variable), Specialist (variable)

**Macros used:**
- `ARRIVE(Caller)` — exponential arrivals, mean 1.5 min
- `ASSIGN(JuniorQueue, JuniorAgent)` — seizes junior agent
- `RELEASE(JuniorAgent, SeniorQueue)` — escalation routing (20% of calls)
- `RENEGE(Caller)` — abandonment after 8 min wait; triggers COST penalty
- `COST(agentHourlyCost × serviceDuration / 60)` — records service cost per entity
- `COMPLETE()` — caller departs

**Simulation goals:** `avgWait < 2` (feasibility constraint), `totalCost` minimised (optimisation objective)

**State variables:** `totalCost`, `abandonedCalls`, `escalatedToSenior`, `escalatedToSpecialist`

**Key metric:** Cost per satisfied call = totalCost / (departures − abandonedCalls). Use the Parametric Sweep in Goal Feasibility mode to find the staffing mix that minimises this ratio.

---

## 18. Appointment Clinic (NEW — v1.3)

**Concept:** Demonstrates Schedule distribution with per-arrival attributes, real-world clock, attribute-conditional routing at RELEASE, and `cSchedule.when` service-time branching — all four major features from Sprints 62-66 working together.

A GP morning clinic runs 15 pre-scheduled patient appointments at 15-minute intervals from 08:00 to 11:30. Unlike the Outpatient Clinic template (which uses random exponential arrivals), every patient in this model arrives at a known planned time. Each appointment carries two attributes baked into the schedule: `severity` (1 = acute, 2 = semi-urgent, 3 = routine) and `type` (Urgent or Routine). 2 clinicians serve all stages.

**Patient flow:**
1. Patients arrive at the Appointments queue at their scheduled time, carrying severity and type from the schedule rows.
2. A clinician performs a brief assessment (Fixed 5 min).
3. On assessment completion, conditional routing fires:
   - `severity ≤ 2` → Urgent Care queue
   - `severity = 3` → Standard Care queue
4. Urgent Care service time uses `cSchedule.when` branching:
   - `severity == 1` → Fixed 8 min (acute)
   - default → Fixed 15 min (semi-urgent)
5. Standard Care → Exponential mean 25 min.

**Real-world clock:** The model sets `epoch: "2026-05-19T08:00:00"` and `timeUnit: "minutes"`. Simulation time 0 = 08:00, time 15 = 08:15, etc. All times in the event log and Entity Details tab display as wall-clock timestamps.

**Schedule with rows[]:** The arrival B-Event uses a `Schedule` distribution with `rows[]` instead of `times[]`. Each row carries both a `time` and an `attrs` object — the `severity` and `type` values are automatically applied to the arriving patient entity, overriding the default sampled values. You can replace the built-in rows by importing `sample-appointment-schedule.csv` via the **↑ Load plan** button on the Schedule distribution.

**What to watch:** Observe the event log — arrival times display as wall-clock times (08:00, 08:15, …). In the Entity Details tab, each patient shows their severity and type attributes. Check the queue flow: severity-1 and severity-2 patients route to Urgent Care, severity-3 to Standard Care. Severity-1 patients complete in ~8 min, severity-2 in ~15 min, severity-3 patients vary (Exponential).

Try modifying the schedule rows to add a no-show (remove a row) or a late arrival (change a time value) to see how the Schedule distribution handles gaps and out-of-order arrivals.

**Entity types:** Patient (arriving, with `severity` and `type` attributes), Clinician (2)

**Macros used:**
- `ARRIVE(Patient, Appointments)` — Schedule distribution with `rows[]`, epoch 2026-05-19T08:00
- `ASSIGN(Appointments, Clinician)` — begins 5-minute assessment
- `RELEASE(Clinician, Standard Care)` — frees clinician; conditional routing overrides destination
- `ASSIGN(Urgent Care, Clinician)` — begins urgent care; `cSchedule.when` selects service time
- `ASSIGN(Standard Care, Clinician)` — begins standard care; Exponential mean 25 min
- `COMPLETE()` — patient departs

**Key features demonstrated:**
- `distParams.rows[]` — per-arrival attribute injection from schedule
- `epoch` + `timeUnit` — wall-clock time display throughout the UI
- `bEvent.routing` — attribute-conditional routing at RELEASE (first-match semantics)
- `cSchedule.when` — attribute-conditional service time branching (first-match semantics)

**Companion file:** `sample-appointment-schedule.csv` in the repository root contains the same 15 rows (time, severity, type) and can be imported via **↑ Load plan** to experiment with the CSV import workflow.

---

## Using Templates with AI Insights

Every template is designed to work immediately with simmodlr's AI Insights panel. Here is the recommended workflow:

**Step 1 — Open and auto-run.** Click a template in the Templates tab. The model opens and runs automatically. Results populate within seconds. Do not change anything yet — look at the baseline results first.

**Step 2 — Open AI Insights.** Click the **AI Insights** button in the top-right toolbar. The panel analyses the current simulation results, including queue lengths, utilisation rates, wait times, and any goal outcomes.

**Step 3 — Use "Suggest Improvements".** Click **Suggest Improvements** in the AI Insights panel. The AI reads the current KPIs and returns structured recommendations, for example: "The Machining queue has average length 8.3 — this is above the target threshold. Consider increasing Machine count from 4 to 5 or reducing mean service time." Each suggestion is actionable and references the specific entity types and parameters in the model.

**Step 4 — Run a Parametric Sweep.** Click **Parametric Sweep** and choose one or two parameters to vary (for example: number of servers, arrival rate, service time distribution mean). Set the sweep range and step size. Enable **Goal Feasibility** if the model has defined goals (such as `avgWait < 2`). The sweep runs all configurations and presents results as a table and heatmap. Feasible configurations (goals met) are highlighted in green.

**Step 5 — Check goal-aware KPI cards.** When a model has goals configured, the Stats panel shows KPI cards with pass/fail indicators. A green tick means the goal is currently met; a red cross means it is not. These update instantly when you change parameter values manually, giving immediate feedback without needing to re-run the full sweep.

**Templates best suited to AI Insights:**
- **Cost-Optimised Call Centre** — use the sweep with Goal Feasibility to find minimum-cost staffing
- **Machine Shop with Failures** — use Suggest Improvements to get MTTR reduction recommendations
- **Priority ED with Triage Escalation** — use the sweep to find the doctor count where `loopLimitReached` drops below 5%
- **Call Center** — use Suggest Improvements to balance agent count against abandonment rate

---

## Extending Templates

When you open a template, simmodlr saves a **private copy** to your account. The original template is unchanged. You own the copy and can modify it freely.

**How to customise your copy:**

1. **Change entity counts.** Select an entity type in the canvas and edit the Count field. For example, increase Machine count from 4 to 6 in the Machine Shop template to see the effect on downtime.

2. **Change distribution parameters.** Click a queue or event node and edit the distribution. Switch from Exponential to Triangular, or adjust the mean. All changes take effect on the next run.

3. **Add or edit goals.** Open the Goals panel and add a goal expression such as `avgWait < 1.5` or define a `totalCost` objective. Once a goal is set, the KPI cards and sweep feasibility mode activate.

4. **Add state variables.** Open the State Variables panel and define new counters or accumulators. Reference them in effect strings using standard JavaScript-style expressions: `myCounter++` or `totalCost += serviceCost`.

5. **Add new queues and stages.** Drag a new Queue node onto the canvas, connect it to an entity type and resource, and write the C-Event condition and B-Event effect. Use `RELEASE(OldResource, NewQueue)` in the effect to chain stages.

6. **Rename and save.** Give your modified model a descriptive name. It is stored in **My Models** and can be shared or exported.

**Tip:** Use a template as a starting scaffold rather than building from scratch. The macro wiring, state variables, and queue structure are already in place — you only need to adjust the parameters that matter for your scenario.

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
| `PREEMPT(ServerType)` | C-Event | Interrupts busy servers; re-queues entity with remaining service |
| `FAIL(ServerType)` | B-Event | Sets matching servers to failed status; re-queues busy entities |
| `REPAIR(ServerType)` | B-Event | Restores failed servers to idle status |
| `SPLIT(EntityType, N, TargetQueue)` | B/C-Event | Creates N-1 clones of context entity |
| `COSEIZE(Queue, ServerType1, ...)` | C-Event | Atomically seizes multiple server types simultaneously |
| `MATCH(TypeA, QueueA, TypeB, QueueB, Output)` | C-Event | Pairs entities from two queues into one batch |
| `SET_ATTR(AttrName, Value)` | B/C-Event | Updates an attribute on the current entity mid-simulation |
| `COST(Expression)` | B-Event | Records a cost amount against the current entity; accumulates into totalCost |
| `SET(VarName, Value)` | Any | Sets a state variable to a given value |
| `;` chaining | Any | Separate multiple actions, e.g. `RELEASE(Loader, Weigh); trucksLoaded++` |

---

## What to Look For in Results

Each template's **Step Log** shows every event in order with clock timestamps. The **Entity Table** shows individual entity status. Key metrics appear in the **Stats** panel (departure count, average wait, average service time, goal pass/fail).

- **M/M/1, Data Center** — simple throughput benchmarks; compare against analytical formulas
- **Call Center** — compare abandonment rate vs service level; baseline for Cost-Optimised version
- **ER Triage** — priority inversion (high-severity patient overtakes lower)
- **Fast Food, Construction, Outpatient** — cycle time through multi-stage systems
- **Factory, Warehouse** — batching efficiency (throughput vs unbatched)
- **Airport, Retail** — balking rate at finite-capacity queues
- **Ward Bed Admission** — bed-blocking rate (patients waiting for beds)
- **Bank Branch** — priority queue behaviour (premium customers served first)
- **Port Berth Operations** — congestion at high utilisation (83%)
- **Machine Shop with Failures** — downtime analysis; MTBF/MTTR sensitivity; preemption impact
- **Priority ED with Triage Escalation** — mid-flight attribute update via SET_ATTR; Loop Guard recirculation cap; dynamic priority reordering
- **Cost-Optimised Call Centre** — cost goal with Parametric Sweep feasibility; minimum-cost staffing configuration
