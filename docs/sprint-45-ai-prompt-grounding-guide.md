# Sprint 45 — AI Prompt Grounding: Capability Guide

**Date:** 2026-05-15
**Status:** Delivered

---

## Overview

Sprint 45 systematically closes the gap between the model's actual capabilities and the data available to the AI analysis layer. The prompts previously had full visibility into KPI summaries and goal gaps but were blind to most of the model's structural richness — server failure models, loop guards, balking rules, event definitions, state variables, cost data, and entity anomalies.

After Sprint 45, every prompt the AI receives reflects the full model as the modeller has configured it.

---

## What changed

### 1 — Enriched KPI payload (`buildKpis`)

The following fields from `getSummary()` are now included in every prompt that uses `buildKpis`:

| Field | Description | When present |
|-------|-------------|--------------|
| `maxSojourn` | Maximum entity sojourn time across all completions | Always |
| `avgWIP` | Time-averaged work-in-progress (Little's Law numerator) | Always |
| `totalCost` | Total accumulated COST macro charges | When non-zero |
| `costPerServed` | Total cost / served count | When non-zero |
| `containerLevels` | Per-container min/max/avg/final level | When containers are defined |
| `warning_phaseCTruncated` | Flag when Phase C was truncated (simulation under pressure) | When truncated |
| `warnings` | Runtime warnings from the engine | When warnings exist |

**Why it matters:** The AI could previously ignore cost, WIP, and container bottlenecks entirely because it had no data on them. With `avgWIP`, the AI can apply Little's Law validation checks. With `totalCost`, it can comment on cost efficiency and goal gaps where `totalCost < X` is a target.

---

### 2 — Server failure model and shift schedule in entity types

Server entity types now include their failure and availability configuration in both the suggestion and narrative prompts:

```json
{
  "name": "CNC Machine",
  "role": "server",
  "count": 3,
  "failureModel": {
    "mtbfDist": "Exponential",
    "mtbfParams": { "mean": 60 },
    "mttrDist": "Exponential",
    "mttrParams": { "mean": 10 }
  },
  "shiftSchedule": "2 period(s)"
}
```

**Why it matters:** Without this, the AI would suggest increasing server count when the real problem is 14% downtime from the failure model (MTTF=60, MTTR=10 → availability ≈ 85.7%). The AI can now reason: *"effective capacity = count × availability"* and propose MTTR reduction as an alternative to adding servers. The shift schedule flag tells the AI that throughput is time-varying.

---

### 3 — Queue overflow destination

Queue entries now include `overflowDestination` when set:

```json
{
  "name": "Triage",
  "discipline": "FIFO",
  "capacity": 10,
  "overflowDestination": "Waiting Room"
}
```

**Why it matters:** The AI can now identify overflow chains and reason about whether the overflow destination is creating a secondary bottleneck.

---

### 4 — B-event digest

A compact B-event summary is now included in the suggestion prompt. For each B-event:

```json
{
  "name": "Patient Arrives",
  "effectTypes": ["ARRIVE"],
  "routing": "fixed",
  "defaultQueue": "Triage",
  "balkMode": "probability:0.15",
  "loopGuard": "max 3x → Discharge",
  "arrivalStreams": 2,
  "hasReneging": true,
  "fireCount": 847
}
```

| Field | What it tells the AI |
|-------|---------------------|
| `effectTypes` | What this event does (ARRIVE/COMPLETE/RELEASE/SET_ATTR/COST etc.) |
| `routing` | Whether routing is fixed/conditional/probabilistic |
| `balkMode` | Whether balking is by probability or condition, and the probability value |
| `loopGuard` | Maximum recirculation count and exit destination |
| `arrivalStreams` | Number of inter-arrival distributions (multi-stream arrivals) |
| `hasReneging` | Whether renege schedules are attached to this event |
| `fireCount` | How many times this event fired (from engine snapshot) |

**Why it matters:** Before Sprint 45, the AI had no knowledge of event structure. It couldn't suggest changes to routing probabilities, loop guard limits, balk thresholds, or arrival rates because it didn't know these constructs existed in the model. Now it can make suggestions like:
- *"Reduce balkProbability on 'Patient Arrives' from 0.15 to 0.05"*
- *"Increase loopConfig.maxLoopCount on 'Re-examine' from 3 to 5"*
- *"The probabilistic routing on 'Nurse Treats' sends 30% to Discharge — consider increasing this to 40% to reduce Recovery queue load"*

---

### 5 — C-event digest

A compact C-event summary is included, listing each conditional event's name, effects, and priority:

```json
{
  "name": "Escalate Priority",
  "effectTypes": ["SET_ATTR"],
  "priority": 1
}
```

**Why it matters:** The AI now knows which state-driven behaviours exist. It can reason about whether C-event ordering (priority) may be creating unexpected interactions and can suggest adding or modifying conditional triggers.

---

### 6 — State variables in suggestion and narrative prompts

State variables were previously only available in `buildResultsQueryPrompt`. They are now included in both `buildSuggestionPrompt` and `buildNarrativePrompt`:

```json
[
  { "name": "shiftActive", "initialValue": 1 },
  { "name": "queueLimit", "initialValue": 20 }
]
```

**Why it matters:** State variables often control routing conditions, service rates, or capacity switches. The AI can now suggest:
- *"Increase queueLimit from 20 to 30 to reduce blocking"*
- *"The shiftActive variable suggests a time-varying capacity model — ensure the warmup period covers at least one full shift cycle"*

---

### 7 — Entity anomaly digest

When `results.entitySummary` is available and the model ran with entity tracking enabled, the suggestion prompt now includes a pre-computed anomaly digest:

```json
{
  "anomalyCount": 7,
  "anomalyRate": 0.0467,
  "worstWait": 94.2,
  "byType": { "Patient": 5, "VIP": 2 },
  "threshold": 24.6
}
```

Anomalies are defined as: individual entity wait > 3× mean wait for the run.

**Why it matters:** The AI can now identify patterns like *"7 entities (4.7% of arrivals) experienced waits > 3× the mean — 5 are Patient type and 2 are VIP type. This suggests a priority inversion issue for VIP entities despite their assumed priority"*.

---

### 8 — System prompt updates

The system prompts for `buildSuggestionPrompt` and `buildNarrativePrompt` now explicitly declare the expanded data categories and include domain-specific reasoning instructions:

- **When a failure/repair model is present:** factor availability into capacity calculations
- **When a loop guard is present:** consider whether the limit is causing premature exits
- **When state variables are present:** they may represent conditions affecting routing or service rates
- **When `phaseCTruncated` is set:** flag this as a simulation caveat in the narrative

---

### 9 — Token budget expansion

`MAX_PROMPT_WORDS` increased from 1500 to 2000 to accommodate the richer model payloads without truncating existing data.

---

## Coverage matrix — before and after

| Data category | Before S45 | After S45 |
|---------------|------------|-----------|
| Wait percentiles (p50–p99) | ✓ | ✓ |
| Resource utilisation/idle | ✓ | ✓ |
| Goal gaps | ✓ | ✓ |
| CI / replication stats | ✓ | ✓ |
| maxSojourn, avgWIP | ✗ | ✓ |
| Cost metrics | ✗ | ✓ |
| Container levels | ✗ | ✓ |
| Engine warnings | ✗ | ✓ |
| Server failure/repair model | ✗ | ✓ |
| Shift schedule (server) | ✗ | ✓ |
| Queue overflow routing | ✗ | ✓ |
| B-event structure digest | ✗ | ✓ |
| C-event structure digest | ✗ | ✓ |
| Loop guard configuration | ✗ | ✓ |
| Balk mode and probability | ✗ | ✓ |
| Reneging schedules flag | ✗ | ✓ |
| Event fire counts | ✗ | ✓ (single runs) |
| State variables (suggestion) | ✗ | ✓ |
| State variables (narrative) | ✗ | ✓ |
| Entity anomaly digest | ✗ | ✓ |

---

## Files changed

| File | Change |
|------|--------|
| `src/llm/prompts.js` | Enriched `buildKpis`, `extractResources`, `extractQueues`; added `extractBEvents`, `extractCEvents`, `extractEntityAnomalies`; updated `buildSuggestionPrompt` payload + system prompt; updated `buildNarrativePrompt`; increased `MAX_PROMPT_WORDS` to 2000 |
| `tests/llm/prompts.test.js` | 13 new tests covering all new data fields |

---

## What's next (Sprint 46 candidates)

- **loopConfig and balkCondition engine wiring** — the UI fields exist, the prompts now reference them, but the engine doesn't yet evaluate `balkCondition` expressions or enforce `loopConfig` loop counts
- **AI comparison mode with goal gaps** — the comparison prompt doesn't yet receive goal gap data; both runs should be assessed against goals simultaneously
- **Per-replication entity anomaly aggregation** — anomaly digest currently only works for single runs; extend to summarise across replications
- **Prompt caching** — the model structure portion of prompts is stable across re-runs; add Anthropic prompt caching headers to reduce latency and cost
