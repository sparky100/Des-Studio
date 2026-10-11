# World Oil Network: Flow Model with Tanker Fleet and Storage

Model file: `oil-network-fleet-storage.json`
Requires: Flow schema **v2.8.0 or later** (uses `quantityAttr`, `ASSIGN … SCAN`, `DRAIN_PARTIAL`, state variables on the right-hand side of conditions, carried server claims, and `turnaroundDist`).
Companion: the Loop system dynamics model (`world-oil-system-loop-model-v4.json`) covers prices, investment and demand over decades. This Flow model tests whether oil can physically move, and what breaks when it can't.

---

## 1. Purpose and scope

A toy physical oil network for **scenario analysis of disruptions**, starting with a closure of the Strait of Hormuz. It answers:

- How long until a closure reaches refineries and consumers, and where?
- How much is lost (unmet demand, shut-in production) versus only delayed?
- What limits recovery: crude, tankers or refinery capacity?

It is a toy: volumes are rounded, the network has 3 sources, 1 chokepoint with a bypass, 8 routes, 3 refining hubs and 3 markets. Treat outputs as mechanisms and orders of magnitude, not forecasts.

**Units:** time in days, volume in Mb (million barrels). One entity is one cargo.

---

## 2. Structure at a glance

```
Production (3 sources, 8 streams)
   │  each stream: cargo of fixed size for its tanker type
   ▼
Loading queue (6 queues)  ── storage limit ──► balk = shut-in production
   │  COSEIZE berth + tanker
   ▼
[Gulf only] Hormuz Queue ──(closed)──► Bypass Pipeline Queue ──► (reopened) back to Hormuz
   │  ASSIGN Hormuz Transit Lane (tanker still held)
   ▼
Voyage (DELAY, tanker held) ──► arrival: RELEASE tanker ──► tanker turnaround (empty return voyage)
   ▼
Hub crude queue (one per hub) ── ASSIGN refinery unit by grade (SCAN)
   ▼
Refined: FILL product stock with volume × 1.03, COMPLETE
   ▼
Market: daily DRAIN_PARTIAL(products, demand, unmet)
```

Sections (swimlanes): Production and Loading, Chokepoints, Shipping and Fleet, Refining, Markets.

---

## 3. Entity: Crude Cargo

| Attribute | Type | Meaning |
|---|---|---|
| `grade` | string | `sour` or `sweet`; matched to refinery unit skills |
| `route` | string | `gulf_asia`, `gulf_us`, `gulf_eur`, `waf_asia`, `waf_eur`, `us_asia`, `us_eur`, `us_dom` |
| `volume` | number | Mb per cargo (2, 1 or 0.7); the model's `quantityAttr` |
| `pumpDays` | number | bypass pumping time = `volume` × 0.4 |
| `refineDays` | number | refining time = `volume` × 2 (one unit = 0.5 Mb/day) |

All attributes are set at arrival with `SET_ATTR`.

---

## 4. Production streams

Each stream is an `ARRIVE` B-event with exponential inter-arrival times.

| Stream (B-event) | Grade | Tanker | Mb/cargo | Cargoes/day | Mb/day | Loading queue |
|---|---|---|---|---|---|---|
| Gulf to Asia Cargo Produced | sour | Gulf VLCC | 2 | 4.9 | 9.8 | Gulf VLCC Loading Queue |
| Gulf to US Gulf Coast Cargo Produced | sour | Gulf VLCC | 2 | 0.7 | 1.4 | Gulf VLCC Loading Queue |
| Gulf to Europe Cargo Produced | sour | Suezmax | 1 | 2.8 | 2.8 | Gulf Suezmax Loading Queue |
| West Africa to Asia Cargo Produced | sweet | Atlantic VLCC | 2 | 1.0 | 2.0 | West Africa VLCC Loading Queue |
| West Africa to Europe Cargo Produced | sweet | Suezmax | 1 | 2.0 | 2.0 | West Africa Suezmax Loading Queue |
| US Gulf Coast to Asia Cargo Produced | sweet | Atlantic VLCC | 2 | 0.6 | 1.2 | US Gulf Coast VLCC Loading Queue |
| US Gulf Coast to Europe Cargo Produced | sweet | Aframax | 0.7 | 2.571 | 1.8 | US Gulf Coast Aframax Loading Queue |
| US domestic Cargo Produced | sweet | none (pipeline) | 2 | 1.5 | 3.0 | US Domestic Pipeline |

Totals: Gulf 14 Mb/day, West Africa 4, US Gulf Coast 6 (24 Mb/day, about 16 cargoes/day).

---

## 5. Loading and storage

- **Loading** (`Load …` C-events): `COSEIZE(<loading queue>, <berth>, <tanker type>)` takes a berth and a tanker together. Loading takes Triangular(0.8, 1, 1.5) days.
- **After loading** (`Gulf Cargo Loaded`, `West Africa Cargo Loaded`, `US Gulf Coast Cargo Loaded`): `RELEASE_COSEIZED([<berth>])` frees only the berth. The cargo keeps its tanker (a carried claim) until discharge.
- **Berths:** Gulf Terminal Berth 14, West Africa Terminal Berth 5, US Gulf Coast Terminal Berth 5 (utilisation about 0.66–0.70).

**Storage limit (shut-in).** Each loading queue has a `balkCondition`: when its length reaches the storage state variable, newly produced cargoes balk. A balked cargo is production that could not be stored and is shut in; it appears in `summary.balked` and `balkedQuantity`.

| Loading queue | Storage state variable | Cargoes | Mb |
|---|---|---|---|
| Gulf VLCC Loading Queue | `storageGulfVlcc` | 56 | 112 |
| Gulf Suezmax Loading Queue | `storageGulfSuezmax` | 28 | 28 |
| West Africa VLCC Loading Queue | `storageWafVlcc` | 12 | 24 |
| West Africa Suezmax Loading Queue | `storageWafSuezmax` | 26 | 26 |
| US Gulf Coast VLCC Loading Queue | `storageUsVlcc` | 12 | 24 |
| US Gulf Coast Aframax Loading Queue | `storageUsAframax` | 26 | 18 |

Limits are set at about 10 days of each stream, and never below about twice the peak queue seen in baseline runs, so the baseline should not shut in.

---

## 6. Tanker fleet

Four server types. Each tanker is held from loading to discharge. On release it enters **turnaround** (its empty return voyage) and is unavailable for that time.

| Tanker type | Count | Cargo | Routes | Turnaround (return voyage) | Committed (design) |
|---|---|---|---|---|---|
| Gulf VLCC | 320 | 2 Mb | Gulf to Asia, Gulf to US Gulf Coast | Triangular(18, 20, 30) | ~83% |
| Atlantic VLCC | 145 | 2 Mb | West Africa to Asia, US Gulf Coast to Asia | Triangular(28, 35, 48) | ~83% |
| Suezmax | 240 | 1 Mb | Gulf to Europe (via Suez), West Africa to Europe | Triangular(12, 18, 30) | ~84% |
| Aframax | 105 | 0.7 Mb | US Gulf Coast to Europe | Triangular(14, 16, 19) | ~83% |

"Committed" includes turnaround. Results report `utilisation` (loaded or waiting plus turnaround), `busyUtilisation` (with a cargo only), `turnaroundFraction` and `turnaroundCount`. In time-series charts, `byType[].busy` counts tankers in turnaround as busy.

---

## 7. Chokepoints and the Hormuz closure

- **Transit Hormuz:** `ASSIGN(Hormuz Queue, Hormuz Transit Lane)`, 7 lanes, 0.5 days each, only while `hormuzOpen == 1`. The cargo keeps its tanker during transit.
- **Diversion:** `Gulf Cargo Loaded` routes to `Bypass Pipeline Queue` only when `hormuzOpen == 0` **and** more than 6 cargoes are waiting at Hormuz; otherwise to `Hormuz Queue`.
- **Pump via Bypass:** 2 `Bypass Pipeline` units, pumping time `EntityAttr(pumpDays)` (about 5 Mb/day in total). Simplification: the cargo keeps its tanker.
- **Return to Hormuz:** once the strait reopens, cargoes still waiting for the bypass go back to `Hormuz Queue` (`DELAY` 0.1 day). After a long closure this produces a large wave at Hormuz.
- **Close Hormuz / Reopen Hormuz** (C-events, priority 0):
  - `clock >= closureStart AND clock < closureEnd AND closureEnabled == 1 AND hormuzOpen == 1` → `SET(hormuzOpen, 0)`
  - `clock >= closureEnd AND hormuzOpen == 0` → `SET(hormuzOpen, 1)`

---

## 8. Voyages

`DELAY` on each voyage queue while the cargo still holds its tanker. On arrival, `RELEASE(<tanker type>, <hub crude queue>)` frees the tanker into turnaround and hands the cargo to the hub.

| Voyage queue | Laden days (Triangular) | Tanker | Destination |
|---|---|---|---|
| Gulf to Asia Voyage | 18, 20, 24 | Gulf VLCC | Asia Crude Queue |
| Gulf to Europe Voyage | 20, 24, 30 | Suezmax | Europe Crude Queue |
| Gulf to US Gulf Coast Voyage | 35, 40, 45 | Gulf VLCC | US Gulf Coast Crude Queue |
| West Africa to Europe Voyage | 12, 14, 17 | Suezmax | Europe Crude Queue |
| West Africa to Asia Voyage | 28, 32, 36 | Atlantic VLCC | Asia Crude Queue |
| US Gulf Coast to Europe Voyage | 14, 16, 19 | Aframax | Europe Crude Queue |
| US Gulf Coast to Asia Voyage | 40, 45, 50 | Atlantic VLCC | Asia Crude Queue |
| US Domestic Pipeline | 2, 3, 4 | none | US Gulf Coast Crude Queue |

---

## 9. Refining

One crude queue per hub. Each hub has one refinery unit type whose instances carry a `sour` or `sweet` skill via `skillProfiles`. `ASSIGN(<hub> Crude Queue, <hub> Refinery Unit, Entity.grade, SCAN)` runs the first waiting cargo whose grade has a free unit, so one grade never blocks the other. Refining time is `EntityAttr(refineDays)`.

| Hub | Sour units | Sweet units | Sour crude (Mb/day) | Sweet crude (Mb/day) | Design utilisation |
|---|---|---|---|---|---|
| Asia | 24 | 8 | 9.8 | 3.2 | 0.82 / 0.80 |
| Europe | 7 | 9 | 2.8 | 3.8 | 0.80 / 0.84 |
| US Gulf Coast | 4 | 8 | 1.4 | 3.0 | 0.70 / 0.75 |

On completion: `FILL(<hub products>, Entity.volume * 1.03)` (processing gain 1.03) and `COMPLETE()`.

---

## 10. Markets

Lost-sales demand: one daily `DRAIN_PARTIAL(<products>, <demand>, <unmet>)` per market. The unmet container is **cumulative unmet volume**, so its final value is the total shortfall.

| Market | Product stock (container) | Initial / capacity (Mb) | Demand (Mb/day) | Starts on day | Unmet container |
|---|---|---|---|---|---|
| Asia | `ct_asia_products` | 130 / 600 | 13.12 | 30 | `ct_asia_unmet` |
| Europe | `ct_europe_products` | 66 / 350 | 6.66 | 30 | `ct_europe_unmet` |
| US Gulf Coast | `ct_us_products` | 44 / 250 | 4.44 | 45 | `ct_us_unmet` |

Demand starts late so the supply chain can fill first. Product output exceeds demand by only about 0.27 (Asia), 0.14 (Europe) and 0.09 (US) Mb/day, so the network has little slack. Output above a container's capacity is silently discarded (not reported).

---

## 11. Parameters (state variables)

| Name | Default | Meaning |
|---|---|---|
| `closureEnabled` | 0 | 1 closes Hormuz between `closureStart` and `closureEnd` |
| `closureStart` | 100 | Day the closure starts |
| `closureEnd` | 130 | Day the strait reopens (duration = end − start; no arithmetic in conditions) |
| `hormuzOpen` | 1 | Set by the model; do not change |
| `storageGulfVlcc` … `storageUsAframax` | see §5 | Terminal storage, in cargoes; lower values mean earlier shut-in |

Experiment overrides are recorded in `experiment.parameterOverrides` and in the results snapshot.

**Run defaults:** 300 days, 60-day warm-up, 10 replications, seed 492153378 (reference seed).

---

## 12. Goals

| Goal | Metric | Target |
|---|---|---|
| Asia cumulative unmet demand under 10 Mb | `container.maxLevel` on `ct_asia_unmet` | < 10 |
| Europe cumulative unmet demand under 10 Mb | `container.maxLevel` on `ct_europe_unmet` | < 10 |
| US Gulf Coast cumulative unmet demand under 10 Mb | `container.maxLevel` on `ct_us_unmet` | < 10 |
| Gulf VLCC fleet below 95% committed | `resource.utilisation` on Gulf VLCC | < 0.95 |
| Asia refinery units below 90% utilisation | `resource.utilisation` on Asia Refinery Unit | < 0.9 |

Container goals are judged on the mean across replications. Check `lowestMin` / `highestMax` and per-replication values for the spread.

---

## 13. How to run a scenario

1. **Baseline:** defaults (`closureEnabled = 0`).
2. **Hormuz closure:** set `closureEnabled = 1`; adjust `closureStart` / `closureEnd`.
3. **Use the same seed for both** (common random numbers), so only the closure differs.
4. **Look at:**
   - `ct_asia_unmet`, `ct_europe_unmet`, `ct_us_unmet`: final value = lost demand (Mb).
   - `summary.balked` / `balkedQuantity`: shut-in production (Mb).
   - Loading queue peaks (`max_queue_length_by_queue`): crude stranded onshore waiting for tankers.
   - Hormuz Queue and Bypass Pipeline Queue over time: closure and return wave.
   - Tanker `utilisation` vs `busyUtilisation`: tankers tied up vs carrying.
   - Hub crude queues and product stocks over time (`byContainer`): when the shortage arrives and clears.
5. Report the **spread across replications**, not just the mean. Outcomes for Asia vary widely.

Other levers: tanker counts (fleet size), `Hormuz Transit Lane` count (partial closure), berth counts, storage variables, refinery unit counts and their `skillProfiles`.

---

## 14. Results (reference runs)

Reference settings: seed 492153378, 10 replications, 300 days, 60-day warm-up. Closure: `closureEnabled = 1`, days 100 to 130. The full expected values are in `oil-network-reference-expected.json`.

| | Baseline | Closure |
|---|---|---|
| Served volume (mean per replication) | 5,732.4 Mb | 5,714.5 Mb (−17.9 Mb) |
| Shut-in production (`balkedQuantity`, mean) | 0 | **23.8 Mb**: Gulf VLCC 13.6, West Africa Suezmax 10.2 |
| Shut-in by replication | all 0 | 39, 0, 0, 44, 149, 0, 4, 0, 0, 2 |
| Asia unmet demand (mean) | 0 | **48.8 Mb** (~4 days of Asia demand) |
| Asia unmet by replication | all 0 | 75.5, 81.1, 0, 34.3, 83.2, 53.6, 87.3, 71.6, 1.5, 0 |
| Europe / US unmet | 0 | 0 |
| Asia product stock, lowest (any replication) | 29.1 Mb | 0 |
| Europe product stock, lowest (any replication) | 67.2 Mb | 36.8 Mb |
| Gulf VLCC loading queue, peak | 7 | 56 (storage limit) |
| West Africa Suezmax loading queue, peak | 13 | 26 (storage limit) |
| Hormuz / bypass queue, peak | 6 / 0 | 187 / 184 |
| Asia crude queue, peak | 13 | 68 |
| Gulf VLCC committed (busy with cargo) | 82% (43%) | 86% (47%) |
| Goals met | 5 of 5 | 4 of 5 (Asia unmet fails) |

**Findings**
1. **Asia is short in 7 of 10 replications** (34 to 87 Mb); 3 are barely touched. The outcome depends on Asia's stock when the gap arrives, about 3 weeks after the closure starts. Report the spread, not just the mean.
2. **Tankers, not just crude, are the bottleneck.** Cargoes waiting at Hormuz hold their VLCCs; the Gulf VLCC fleet runs out and Gulf crude fills terminal storage (56 cargoes) and is shut in.
3. **The disruption spreads to West Africa through the shared Suezmax fleet.** West African production is shut in (10.2 Mb mean) although West Africa does not use Hormuz. Europe's stock dips to 36.8 Mb at worst but holds for a 30-day closure.
4. **The baseline is identical with or without storage limits** (served 38,446 cargoes, 411,468 events), so the limits do not bind in normal operation.
5. **Asia's unmet demand is unchanged by the storage limits** (same per-replication values as the unlimited-storage version). Shut-in hits later cargoes, which would have arrived after Asia's shortage had already happened. The limits change how much is lost overall, not when Asia runs short.
6. **Recovery completes within the run.** Delayed crude arrives in a wave (Asia crude queue peaks at 68), and Asia's stock ends above its pre-closure level.

## 15. Known limitations

1. **Return voyages are averaged per tanker type.** Turnaround is set per server type, so each fleet's return time is a weighted average of its routes, and the two VLCC fleets never swap between basins. Engine idea: let turnaround read an entity attribute (for example `ballastDays`).
2. **Tankers re-enter the Gulf during a closure.** A Gulf VLCC finishing its return voyage is available at Gulf berths even while the strait is shut, which slightly understates the shortage.
3. **Bypass cargoes keep their tanker.** In reality, crude pumped to Yanbu or Fujairah is loaded onto other tankers outside the strait.
4. **No prices.** No demand response, rerouting by cost or freight rates. Those belong in the Loop model.
5. **Fixed grades and yields.** Sour/sweet only, a single processing gain of 1.03, and no product split.
6. **Surplus product is discarded silently** when a container is full.
7. **Demand starts late** (days 30 and 45) to avoid a startup shortage; statistics start after a 60-day warm-up.
8. **The volumes are toy figures,** not calibrated to real flows or fleets.

---

## 16. Performance

Reference runs on a phone: about 41,000 events and 435,000 C-event scans per replication (10.6 scans per event), 11.9 s (baseline) and 12.3 s (closure) for 10 replications, about 29–30 µs per event. The same model took 444 s before two engine performance fixes (a 34× speed-up with identical results). A 50-replication run measured about 67 µs per event; it is still open whether that is the device throttling or something that accumulates across replications.

## 17. Version history

| Version (file) | Change |
|---|---|
| `oil-network-toy*.json` | 4 Mb lots, per-grade queues, backlog containers, daily status tick (schema v2.6) |
| `oil-network-toy-vlcc.json` | 2 Mb (VLCC) grain, 365 days |
| `oil-network-fleet.json` | Tanker fleet with carried claims and turnaround, mixed volumes (`quantityAttr`), one queue per hub with `SCAN`, `DRAIN_PARTIAL` demand, clock-based closure (schema v2.8) |
| `oil-network-fleet-storage.json` | Terminal storage limits with balking (shut-in production) and storage state variables; 300-day default; reference seed 492153378; `storageUsVlcc` raised from 8 to 12 so the baseline never shuts in |

---

## 18. Next steps

1. Sweep closure length to find when Europe tips into shortage through the Suezmax fleet (see 2).
2. Sweep `closureEnd` (for example 110, 130, 160, 190) to find when Europe tips into shortage via the Suezmax fleet.
3. Fix limitations 1 and 2 (per-route return voyages; no Gulf re-entry while closed).
4. Calibrate volumes, fleet sizes and storage against real data. Then couple to Loop: Loop sets demand and production rates, and Flow returns realised deliveries and shortfalls.

---

## 19. What the model demonstrates (Flow feature map)

| Flow feature | Where in the model | What it shows |
|---|---|---|
| `COSEIZE` with two server types | `Load …` C-events: berth + tanker | Atomic multi-resource start |
| `RELEASE_COSEIZED` (subset) | `… Cargo Loaded`: frees the berth only | Partial release, keeping a carried claim |
| Carried claims | Cargo holds its tanker through Hormuz, the bypass and the voyage | A server held across later stages |
| `RELEASE(type, queue)` with entity context | `… Voyage Arrives` | Releases this cargo's own tanker |
| `turnaroundDist` | Gulf VLCC, Atlantic VLCC, Suezmax, Aframax | Empty return voyage; `utilisation` vs `busyUtilisation` |
| `quantityAttr` | `volume` on Crude Cargo | Volume results (`servedQuantity`, `balkedQuantity`, `quantityProcessed`, outcome quantities) |
| `EntityAttr` service time | Bypass (`pumpDays`), refining (`refineDays`) | Durations that scale with cargo size |
| `ASSIGN … Entity.grade, SCAN` + `skillProfiles` | One crude queue per hub | Mixed grades in one queue without blocking |
| State variable on a condition's right-hand side | `Close Hormuz` / `Reopen Hormuz` (`clock >= closureStart`), storage `balkCondition` | Clock- and parameter-driven logic with no tick events |
| `balkCondition` on queues | All 6 loading queues | Finite storage; balks reported as shut-in, with `balk:` outcomes |
| Compound routing condition | `Gulf Cargo Loaded` (queue length AND `hormuzOpen == 0`) | Conditional diversion |
| Conditional routing on a string attribute | Loaded, transit and bypass events route by `Entity.route` | Data-driven routing |
| `DELAY` with routing completion | Voyages, return from bypass | Resource-free holding, with or without a carried claim |
| `DRAIN_PARTIAL` with shortfall | Daily market demand | Lost-sales demand and cumulative unmet volume |
| `FILL` with an expression | `FILL(products, Entity.volume * 1.03)` | Volume-dependent stock changes |
| `SET` in a C-event | Closure and reopening | Scenario switches |
| Experiment parameter overrides | `closureEnabled`, storage variables | Recorded in `parameterOverrides` and the snapshot |
| `byContainer` time series, `goalOutcomes`, container aggregation | Results | Shortage timing; pass/fail with mean-of-replications values |
| Sections | 5 swimlanes | Large-model organisation |

## 20. Reference results file

`oil-network-reference-expected.json` holds the expected baseline and closure results for the reference settings: runtime counts, summary, container stats, per-replication unmet, shut-in and served volume, queue peaks, resource utilisation, outcomes, goal outcomes and activity counts.

**Comparison rules**
- **Exact:** runtime counts, served/total/balked counts, activity counts, queue peaks and the per-replication arrays. The engine is deterministic for a fixed seed.
- **Floating point:** all other numbers must be within 1e-6 relative.
- **Performance:** informational only (device-dependent). On the same device, µs per event at 300 days should be within 1.3× of a 100-day run.
- **Intentional changes:** re-run both scenarios and replace the file in the same commit, noting why.
