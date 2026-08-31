# Bike Shop Model — How It Works

**Model file:** `bike-shop.json`

Three shared staff run a full hire lifecycle, three other counter transactions, and a full repair lifecycle. These notes explain the structure, the reasoning behind the trickier design choices, and what's still a placeholder.

## 1. The transaction streams

| Stream | Queue(s) | Staff time | Character |
|---|---|---|---|
| Checkout (hire) | Hire Queue | Triangular(3, 5, 8) min | Quick, protected |
| Check-in (return) | Return Queue | Triangular(2, 4, 6) min | Quick, protected |
| Purchase | Purchase Queue | Triangular(3, 6, 10) min | Quick, protected |
| Repair drop-off | Repair Drop-off Queue | Triangular(2, 3, 5) min | Quick, protected |
| Repair work | Repair Queue | Lognormal(mean ≈45 min, long tail) | Slow, variable, **not** protected |
| Pickup | Pickup Queue | Triangular(2, 3, 5) min | Quick, protected |

Arrivals: a new hire request every **Uniform(60, 240) min** (mean 150 min ≈ 2.5 hr — deliberately infrequent compared to the other streams; this replaced an earlier Exponential(mean 15) assumption), a new Purchase customer every ~12 min on average (Exponential), a new repair job every ~40 min on average (Exponential). Check-in has no independent arrival — see §1a. All rates/durations are placeholders — swap in real footfall data when you have it.

## 1a. Hire lifecycle and bike inventory

Hire and Return are **not** independent streams — a check-in only ever happens because an earlier checkout led to it. This is modelled as a single entity, `HireJob`, moved through stages via `RELEASE`, the same pattern used for the repair job:

1. **Checkout** (`Hire Queue`): `c_assign_hire` uses `ASSIGN`'s consumable-gated form — `ASSIGN(Hire Queue, Staff, BikesAvailable:1)` — which atomically seizes a staff member *and* takes one bike out of a container, `BikesAvailable` (capacity 15, starting at level 5). If the pool's empty, neither happens; the queue also balks (`balkCondition: container(BikesAvailable).level == 0`) so a customer arriving to a fully-depleted pool leaves immediately rather than queueing for a bike that isn't there. The container's capacity (15) is headroom above the real fleet, not the fleet size itself — every checkout's `DRAIN` is matched by exactly one later `FILL` on check-in, so in practice the level never exceeds the starting 5 unless the fleet is expanded some other way.
2. **Out On Hire** (`Out On Hire Queue`): once checkout finishes, `RELEASE(Staff, Out On Hire Queue)` frees the staff member and moves the *same* job here. It's immediately seized by a dummy resource, `OnHire` (count 15 — comfortable headroom above the real 5-bike cap, no longer tied 1:1 to the fleet size; it never actually constrains anything, since a job can't reach this stage without having already drained `BikesAvailable`), purely to produce a random rental duration (Uniform 60–480 min, i.e. 1–8 hours — a placeholder for real rental-length data).
3. **Check-in** (`Return Queue`): when the rental period ends, `RELEASE(OnHire, Return Queue)` moves the job here. `c_assign_return` (renamed "Serve Check-in") seizes a staff member for the check-in transaction, and on completion `FILL(BikesAvailable, 1)` puts the bike back in the pool before `COMPLETE()`.

A goal (`container.minLevel > 0`) flags if the pool ever fully empties out during a run — worth checking closely, though with hire requests now averaging one every 2.5 hours the 5-bike pool drains far more slowly than it would under a busier arrival pattern.

## 2. Why repair is one entity moved through stages

A repair job isn't one continuous piece of work. The customer hands the bike over (quick, a couple of minutes) and leaves; the bike itself then queues separately for the real repair, which can take much longer and doesn't need the customer present. Modelling this as a single undifferentiated "repair customer" transaction would have made the customer's own wait time indistinguishable from the bike's backend processing time in any aggregate report — so the job moves through distinct stages via `RELEASE(ServerType, NextQueueName)`, which hands the *same* entity on to the next queue without ending its journey:

1. **Drop-off finishes** → `RELEASE(Staff, Repair Queue)` frees the staff member and moves the job into the Repair Queue.
2. **Repair Queue**: waits, gets repaired (Lognormal duration, preemptable — see §3), then `RELEASE(Staff, Travel Queue)`. This is the moment the shop notifies the customer their bike is ready.
3. **Travel Queue**: seized by a dummy resource, `TimeAway` (count 100 — a large placeholder standing in for "unlimited," not a real constraint) purely to generate a short random delay (Uniform 15–90 min) representing the time between notification and the customer physically arriving. Then `RELEASE(TimeAway, Pickup Queue)`.
4. **Pickup Queue**: one more quick staff transaction, then the job completes and leaves the system.

Earlier iterations of this model tried an independent random return time starting at drop-off (so the customer could show up before the bike was even ready), using Flow's fork/join primitives (`SPLIT`/`JOIN`) to let the bike and customer proceed on separate parallel clocks and reunite later. That was dropped once it became clear real customers are *notified* when the bike is ready rather than guessing a return time independently — so the "travel back" delay only ever starts after repair completes, which is a simple sequential stage, not a parallel branch needing a rendezvous.

## 3. Priority and preemption

Every stream except actual repair work has an entity attribute `taskPriority`:
- `2` while queueing/being served for Hire, Return, Purchase, Repair drop-off, or Pickup — **protected**.
- `1` only while a bike is actually being repaired — **preemptable**.

This is implemented as five separate priority-0 C-events, one per protected queue (`c_preempt_for_hire`, `c_preempt_for_return`, `c_preempt_for_purchase`, `c_preempt_for_repair_dropoff`, `c_preempt_for_pickup`), each guarded by that queue having someone waiting AND both staff busy AND `repairsInProgress > 0`. Whichever one fires calls `PREEMPT(Staff, PRIORITY(taskPriority))`, which always targets whichever busy server is serving the lowest-priority job — i.e. a repair, never another quick transaction — and, in the same effect, decrements `repairsInProgress` right away, so the interrupted job stops counting as "in progress" the instant it's preempted rather than waiting on a completion event that will never fire for that attempt. The interrupted repair re-queues (with its remaining time, per Flow's engine — this specific mechanic isn't fully documented in the schema, so it's worth spot-checking a few individual repair jobs in a real run to confirm behaviour matches expectation).

A state variable, `repairsInProgress`, tracks how many staff are currently doing actual repair work — incremented in `c_start_repair_work`, decremented on natural completion in `b_repair_done` and on preemption in each `c_preempt_for_*` event — so the preempt logic only fires when there's genuinely a repair to interrupt; it won't mistakenly preempt one quick transaction to make room for another.

C-event firing order (lower number = fires first): preempt checks (0) → checkout (1) → send customer out on hire (2) → check-in (3) → Purchase (4) → Repair drop-off (5) → send customer travelling back (6) → Pickup (7) → start repair work (8, last resort).

## 4. Reporting — read the right metric

Flow has two families of wait metrics:
- `summary.avgWait` **can** be scoped to a single queue.
- `summary.avgSojourn` / `summary.avgTimeInSystem` **cannot** — they're system-wide, blended across every entity type in the model.

Because a repair job's full lifecycle (drop-off → repair → travel → pickup) can span hours, any system-wide "time in system" figure will be dominated by that, not by what a hire/return/purchase customer actually experiences. Use the per-queue goals instead:

- **Customer-facing drop-off wait** (Repair Drop-off Queue) — target < 5 min
- **Backend repair job wait** (Repair Queue) — target < 30 min
- **Customer-facing pickup wait** (Pickup Queue) — target < 5 min
- **Staff utilisation** — target < 90%

## 5. Staffing

Original 2-staff design was over capacity: at the time, total demand across all five streams (including ~45 min average per repair, and hire arrivals averaging ~15 min) worked out to roughly 146.5 staff-minutes of work per hour, against 120 available — about 22% overloaded, which is why the Repair Queue was backing up and staff were pinned at 100%. Moved to **3 staff**, giving 180 min/hr capacity.

Since then, the hire arrival rate changed from Exponential(mean 15 min) to **Uniform(60, 240) min** (mean 150 min) — hire requests now arrive roughly 10x less often. Recomputed against the model's actual configured distributions:

| Stream | Arrival rate | Mean service | Demand (staff-min/hr) |
|---|---|---|---|
| Checkout | 0.4/hr (Uniform 60–240 min) | 5.33 min | ≈2.1 |
| Check-in | 0.4/hr (mirrors checkout throughput) | 4.0 min | ≈1.6 |
| Purchase | 5/hr (Exponential mean 12) | 6.33 min | ≈31.7 |
| Repair drop-off | 1.5/hr (Exponential mean 40) | 3.33 min | ≈5.0 |
| Repair work | 1.5/hr (mirrors drop-off throughput) | ≈45 min | ≈67.5 |
| Pickup | 1.5/hr (mirrors drop-off throughput) | 3.33 min | ≈5.0 |
| **Total** | | | **≈113 min/hr** |

Against 3 staff × 60 = 180 staff-min/hr capacity, that's **≈63% utilisation** — a wider margin than the ~81% the model was originally sized for, and comfortably inside the < 90% goal. Purchase and repair work together now drive ~88% of total staff demand; hire/return combined is under 4%. Worth revisiting whether 3 staff is still the right level given this much slack, or whether the hire arrival rate deserves a second look — a 10x drop from the original ~15 min average may be a deliberate reflection of real footfall, or may want re-checking against actual shop numbers.

## 6. Known placeholders / things to revisit

- All arrival rates and service time distributions are estimates, not real data — replace once you have actual shop numbers, including the hire arrival rate (currently Uniform(60, 240) min, averaging one hire every 2.5 hours).
- `maxSimTime` is set to 2400 minutes (5 eight-hour days), left over from an earlier design where the return delay could run to hours; now that it's a short (15–90 min) post-notification travel delay, a shorter horizon would likely do — worth revisiting.
- Balking is modelled for Hire Queue only (`balkCondition: container(BikesAvailable).level == 0`) — a customer arriving to a fully-depleted pool leaves immediately rather than queueing. No other queue balks, and no reneging (patience-based abandonment) is modelled anywhere — everyone who does join a queue waits however long it takes.
- `BikesAvailable` capacity (15) and `OnHire` count (15) both exceed the actual 5-bike starting fleet, giving headroom rather than acting as a hard binding cap — worth double-checking neither number needs to track the real fleet size more tightly if bikes are ever added or removed mid-run.
- Staff utilisation (§5) has fallen well below the 90% target now that hire arrivals are this infrequent — worth deciding whether to keep 3 staff, or revisit the staffing level and the hire arrival assumption together.

## Files

| File | Description |
|---|---|
| `bike-shop.json` | The complete model (importable into simmodlr) |
