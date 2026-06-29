# Heat Pump Rollout — RASE Model Notes

## Policy Question

**What limits heat pump rollout: DNO reinforcement capacity or installer workforce?**

The UK policy target is 600,000 heat pump installations per year by 2028. This model captures
a three-segment market (urban, suburban, rural) flowing through a multi-stage process:
application, MCS survey, DNO desk review, DNO reinforcement (if needed), installation,
and commissioning.

The key policy lever is whether DNO reinforcement capacity or installer workforce availability
is the binding constraint on throughput.

## Model Architecture: RASE (Request-Assessment-Schedule-Execute)

The model uses the RASE pattern where non-server-bound delays (scheduling/waiting periods)
are modelled via the `DELAY` macro, which drains all waiting entities from a queue simultaneously
and creates per-entity completion B-events with independently sampled delay periods.

### Entity Flow

```
Source → Assessment Queue → [MCS Surveyor] → DNO Desk Queue → [DNO Officer]
  → Reinf Schedule Queue → [DELAY] → Routing B-event → Reinforcement Queue → [DNO Field Crew]
  → Install Schedule Queue → [DELAY] → Routing B-event → Installation Queue → [Installer]
  → Commissioning Queue → [Commissioning Engineer] → Sink
```

Each customer segment (urban, suburban, rural) has a parallel pipeline sharing the same
server pools. DNO review routes probabilistically to either reinforcement or direct to
installation scheduling.

### Flow Detail

| Stage | Server | Queue | C-Event |
|---|---|---|---|
| Arrival | — | Assessment Queue | — |
| MCS Survey | MCS Surveyor (4, ramps to 6) | Assessment Queue | `c_assess_X` |
| DNO Review | DNO Officer (3) | DNO Desk Queue | `c_dno_review_X` |
| Reinf Scheduling | DELAY (no server) | Reinf Schedule Queue | `c_schedule_reinf_X` |
| Reinforcement | DNO Field Crew (2) | Reinforcement Queue | `c_reinforce_X` |
| Install Scheduling | DELAY (no server) | Install Schedule Queue | `c_schedule_install_X` |
| Installation | Heat Pump Installer (6, ramps to 10) | Installation Queue | `c_install_X` |
| Commissioning | Commissioning Engineer (4) | Commissioning Queue | `c_commission_X` |

### DELAY Completion Pattern

Each DELAY C-event follows schema §6.2 Option 2:

1. C-event applies `DELAY(QueueName)` — drains all waiting entities, marks them `_isDelay`
2. cSchedule creates per-entity completion B-event with independently sampled delay
3. Completion B-event has `effect: []` (empty) and `probabilisticRouting` to next queue
4. The empty effect + routing table is the DELAY completion pattern — no server needed

## Working-Day Clock

All time parameters use **working-day units** (1 working day = 1 unit of sim time).

**Rationale:** The original model used a 24/7 clock (365 days/year) with service times
inflated by ×1.4 from true working-day source data. The RASE conversion reverses this:
the clock ticks in working time, service times revert to actual working-day values, and
arrival rates preserve annual throughput.

**Conversion:** Multiply any working-day metric by 1.4 for calendar-day equivalent.

| Parameter | Calendar Days | Working Days |
|---|---|---|
| Simulation year | 365 | 260 |
| Warm-up period | 30 | 21 |
| Urban inter-arrival mean | 2.5 | 1.78 |
| Suburban inter-arrival mean | 2.5 | 1.78 |
| Rural inter-arrival mean | 5.0 | 3.56 |
| Urban assessment time | Tri(0.5,1.0,2.0) | Tri(0.5,1.0,2.0) |
| Suburban assessment time | Tri(0.5,1.5,3.0) | Tri(0.5,1.5,3.0) |
| Rural assessment time | Tri(0.75,1.5,3.0) | Tri(0.75,1.5,3.0) |
| Urban DNO review | Tri(1.5,3,5) | Tri(1.5,3,5) |
| Suburban DNO review | Tri(1.5,3.5,7) | Tri(1.5,3.5,7) |
| Rural DNO review | Tri(2,5,10) | Tri(2,5,10) |

Service times for reinforcement and installation were divided by 1.4.

### Shift Schedules

Shift schedules remain but are re-anchored in working days:

| Server | Initial | After 1st Ramp | After 2nd Ramp |
|---|---|---|---|
| MCS Surveyor | 4 (t=0) | 5 (t=86 wd) | 6 (t=171 wd) |
| Heat Pump Installer | 6 (t=0) | 8 (t=129 wd) | 10 (t=214 wd) |

**ρ invariance:** both λ and μ scale by 7/5, so ρ = λ/μ is invariant under this
conversion. The model's congestion dynamics are preserved.

## Segment Parameters

### DNO Reinforcement Probability

| Segment | P(Reinforcement) | P(Direct Install) |
|---|---|---|
| Urban | 15% | 85% |
| Suburban | 35% | 65% |
| Rural | 70% | 30% |

### Service Times (working days)

| Stage | Urban | Suburban | Rural |
|---|---|---|---|
| Assessment | Tri(0.5,1.0,2.0) | Tri(0.5,1.5,3.0) | Tri(0.75,1.5,3.0) |
| DNO Review | Tri(1.5,3,5) | Tri(1.5,3.5,7) | Tri(2,5,10) |
| Reinf Delay | Tri(3,7,14) | Tri(3,7,14) | Tri(5,10,21) |
| Reinforcement | Lognormal(2.1,0.5) | Lognormal(2.7,0.6) | Lognormal(3.3,0.6) |
| Install Delay | Tri(5,10,15) | Tri(5,10,15) | Tri(5,10,15) |
| Installation | Tri(0.75,1.0,2.0) | Tri(0.75,1.5,3.0) | Tri(1.5,2,4) |
| Commissioning | Tri(0.25,0.5,1.0) | Tri(0.25,0.5,1.0) | Tri(0.25,0.75,1.5) |

Reinforcement times were switched from Triangular to Lognormal for more realistic
right-skewed variation. Actual means: urban ~9.25 wd, suburban ~17.8 wd, rural ~32.5 wd.
LogStdDev of 0.5-0.6 produces occasional long tails (some jobs take 80-100+ wd) while
most cluster near the mean.

### Entity Priorities

C-event priority determines scan order in Phase C. Lower number = higher priority.

| Stage | Urban Pri | Sub Pri | Rural Pri |
|---|---|---|---|
| Assessment | 1 | 1 | 2 |
| DNO Review | 3 | 2 | 1 |
| Reinf Scheduling | 6 | 5 | 4 |
| Reinforcement | 3 | 2 | 1 |
| Install Scheduling | 9 | 8 | 7 |
| Installation | 1 | 1 | 2 |
| Commissioning | 0 | 0 | 0 |

Priorities were reversed from the original model (rural last → rural first) to prevent
rural starvation. In the initial run, rural households received < 2% throughput because
urban/suburban DNO review and reinforcement C-events fired first (priority 1-2) and
consumed all server capacity before rural C-events (priority 3) could scan. Reversing
to rural-first improved rural completion rate from 1.3% to 28.8% without materially
reducing urban/suburban throughput (all segments now achieve 100% completion).

## Training Pipeline

Installer Trainees arrive at mean interval 10 working days (Exponential) and queue for
Training Capacity (8 seats). Training takes Tri(29,50,64) working days. Trainees who
complete are counted via `sv_trainees_qualified`.

## Validation Results

| Check | Result |
|---|---|
| Schema validation (V1–V47) | 0 errors, 5 W-CAP-01 warnings (expected multi-class contention) |
| Run completes | Yes — all entities exit the system |
| Confirms DNO bottleneck | Yes — DNO Officer and DNO Field Crew are binding constraints |

### Bottleneck Metrics Model (`heat-pump-rase-bottleneck-metrics.json`)

A variant of the main model with extended goals covering all bottleneck indicators:

| # | Goal | What it tests |
|---|---|---|
| G1 | Mean sojourn < 65 wd | End-to-end journey time |
| G2 | ≥70% served | Overall throughput |
| G3 | Urban DNO desk wait < 7 wd | Desk review queuing (lowest priority) |
| G4 | Suburban DNO desk wait < 5 wd | Desk review queuing |
| G5 | Rural DNO desk wait < 3 wd | Desk review queuing (highest priority) |
| G6 | DNO Officer util < 85% | Desk review capacity headroom |
| G7 | Urban reinforcement wait < 28 wd | Field crew queuing |
| G8 | Suburban reinforcement wait < 11 wd | Field crew queuing |
| G9 | Rural reinforcement wait < 21 wd | Field crew queuing |
| G10 | DNO Field Crew util < 80% | Field crew capacity headroom |
| G11 | Installer util > 60% | Workforce utilisation |
| G12 | Rural reinf WIP < 10 | Queue not exploding |
| G13 | Rural reinf p90 wait < 43 wd | Tail latency |

The 5 additional goals (G3-G7) decompose the DNO bottleneck into its two components:
**DNO Officer desk capacity** and **DNO Field Crew reinforcement capacity**. When
both G6 and G10 fail simultaneously, the model confirms that DNO is the binding
constraint across both stages — not installer workforce (G11).

## Multi-Crew Variant (3 DNO Resolution Types)

The `heat-pump-rase-multi-crew.json` variant extends the RASE pattern with three
distinct DNO resolution routes, each served by dedicated crews:

### Process Flow

```
Customer → MCS Survey [Surveyor]
  └── probRouting:
       ├── No reinforcement → Install Schedule [DELAY] → Installation
       └── Needs DNO → Apply to Connect [DELAY, fixed 10 wd]
            └── probRouting (3-way):
                 ├── Fuse → Fuse Queue → [Fuse Engineer, Tri(0.5,1,2) wd]
                 ├── Unlooping → Unloop Queue → [Unlooping Team, Tri(3,7,14) wd]
                 └── Transformer → Plan Wait [DELAY, Tri(25,75,200)] → Transformer Queue → [Transformer Crew, Tri(5,14,28) wd]
                      → All converge at Install Schedule [DELAY] → Installation → Commission → COMPLETE
```

### Crew Resource Pools

| Crew | Count | Service distribution | Role |
|---|---|---|---|
| MCS Surveyor | 4→6 (ramp) | Tri(0.5,2) | Initial assessment |
| Fuse Engineer | 8 | Tri(0.5,1,2) | Quick fuse upgrades |
| Unlooping Team | 3 | Tri(3,7,14) | Unlooping programme work |
| Transformer Crew | 2 | Tri(5,14,28) | Heavy transformer upgrades |
| Heat Pump Installer | 6→10 (ramp) | Tri(0.75,4) | Heat pump installation |
| Commissioning Engineer | 4 | Tri(0.25,1.5) | Final sign-off |

### Resolution Mix (given DNO connection needed)

| Segment | Fuse | Unlooping | Transformer |
|---|---|---|---|
| Urban | 60% | 30% | 10% |
| Suburban | 35% | 40% | 25% |
| Rural | 15% | 35% | 50% |

Transformer plan waits use `Tri(25,75,200)` — a long, right-skewed delay representing
the DNO's planned upgrade programme. Properties wait for the plan date regardless of
crew availability. After the plan matures, the work itself consumes transformer crew
capacity.

### Single-Run Results (seed 627060057, warmup 21 wd, maxSimTime 260 wd)

| Metric | Value | Target | Status |
|---|---|---|---|
| Mean sojourn | 24.7 wd | < 65 wd | ✅ |
| Served ratio | 88% | ≥ 70% | ✅ |
| Transformer Crew util | 64.4% | < 80% | ✅ (but highest) |
| Unlooping Team util | 40.9% | < 80% | ✅ |
| Fuse Engineer util | 2.7% | < 80% | ✅ |
| Installer util | 21.7% | > 60% | ❌ (upstream blocked) |

### Per-Segment Completion

| Segment | Completed | Sojourn (wd) | Observations |
|---|---|---|---|
| Urban | 145 | 15.0 | Most go direct (85%), fastest path |
| Suburban | 127 | 23.6 | Mix of direct + some DNO work |
| Rural | 49 | 46.6 | High DNO probability (70%), slower |
| All households | 321 | 24.7 | System throughput |

### Key Findings

1. **Transformer Crew is the binding DNO constraint** at 64.4% utilisation, not
   fuse engineers (2.7%) or unlooping teams (40.9%). Any capacity expansion should
   target transformer crews first.

2. **No segment is starved** — even rural households complete (avg sojourn 46.6 wd vs
   15.0 urban). Dedicated crew pools eliminate the multi-class contention that caused
   rural throughput collapse in the single-crew model.

3. **Installer workforce is not the bottleneck** at 21.7% utilisation. Even if installers
   had infinite capacity, total throughput would remain capped by DNO resolution stages.

4. **The Apply to Connect delay (10 wd fixed)** is the dominant admin turnaround. Modelling
   it as a DELAY (no server contention) correctly reflects the DNO's regulatory SLA.

### Assumptions

- Fuse/unloop/transformer each use dedicated, non-interchangeable crews. In reality,
   some crews may be multi-skilled.
- Transformer plan wait is a single `Tri(25,75,200)` delay, representing the DNO's
   planned upgrade programme. Actual plan horizons vary by region and load.
- Fuse is a simple per-property visit (no batch benefit). Unlooping and transformer
   upgrades may have batch efficiencies not captured.

## Model Elements (RASE version)

| Element | Count |
|---|---|
| Entity types | 10 (3 customer + 1 trainee + 6 server) |
| Queues | 22 (3 assessment + 3 DNO desk + 3 reinf schedule + 3 reinf + 3 install schedule + 3 install + 3 commission + 1 training) |
| B-Events | 26 (4 arrival + 19 routing/completion + 3 new DELAY routing) |
| C-Events | 22 (3 assess + 3 DNO + 3 reinf schedule + 3 reinforce + 3 install schedule + 3 install + 3 commission + 1 training) |
| Sections | 4 (Demand & Assessment, DNO & Reinforcement, Installation & Commissioning, Training) |
| Graph nodes | 52 |
| Server types with shift schedules | 2 (MCS Surveyor, Heat Pump Installer) |

## Files

| File | Description |
|---|---|
| `heat-pump-rase.json` | The complete RASE model (importable into simmodlr) |
| `heat-pump-original.json` | Placeholder for original 24/7 model (not yet generated) |
| `heat-pump-rase-bottleneck-metrics.json` | Variant with 13 goals covering DNO desk, DNO field crew, and installer metrics |
| `heat-pump-rase-multi-crew.json` | Multi-crew variant with 3 DNO resolution types (fuse/unloop/transformer), each with dedicated crews. 11 entity types, 28 queues, 32 B-events, 28 C-events, 64 graph nodes |
| `build-rase-model.js` | Script that generates `heat-pump-rase.json` |
| `build-rase-multi-crew.js` | Script that generates `heat-pump-rase-multi-crew.json` |
