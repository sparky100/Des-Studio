# Sprint 27 Capability Guide — Simulation Debugging and Explainability

Created: 2026-05-13  
Sprint: Sprint 27  
Status: ✅ Complete

## Purpose

This guide explains the debugging and explainability capabilities delivered in Sprint 27. It answers:

- What the product can now explain during a run
- How to inspect a waiting, blocked, or surprising entity
- How to understand queue/server selection decisions
- How to diagnose conditional-event behaviour
- What still remains out of scope

## Debugging Workflow

### 1. Run your model and watch the Step Log

After starting a run (Step, Auto Run, or Run All), the **Step Log** tab in the bottom panel shows every phase transition:

```
[t=0] Phase A  Clock → t=0.000
[t=0] Phase B  B: "Arrival"  ·  #1 (Customer) arrived → waiting [queue: Queue, depth: 1]
[t=0] Phase C  C: "Assign"  ·  #1 (Customer) → serving by #10 (Server)
```

### 2. Expand log entries for debug detail

Click the **▶** button on any log entry to see structured trace data:

- **C-Eval**: Shows whether the condition was true or false, the pass number, priority, and failure reason
- **Event**: Shows which entities were affected, what new events were scheduled
- **Arb**: Shows arbitration details — candidates, winner, idle servers

### 3. Click entity IDs to inspect

In expanded log entries, entity IDs (e.g., `#1`, `#10`) are clickable links. Clicking one opens the **Inspector** tab with full details for that entity.

### 4. Click node names to filter the log

Node names (queue names, server types, event names) in log messages are highlighted and clickable. Clicking one filters the log to show only entries mentioning that node. Click **Show all** to clear the filter.

### 5. Use the Entities tab to browse active entities

The **Entities** tab lists all active (non-done, non-reneged) entities with their status, location, and age. Click any row to open the Inspector.

### 6. Use the Inspector tab for deep entity analysis

The **Inspector** tab shows:

- **Identity**: Entity ID, type, status tag
- **Timing**: Arrival time, current clock, waiting age
- **Location**: Current queue, assigned server
- **Progress**: Loop count, sojourn time, completion time
- **Attributes**: All entity attribute values
- **Service Stages**: Per-stage wait and service times for multi-stage entities

### 7. Navigate from the canvas

Click any node on the Execute Canvas to filter the Step Log to entries related to that node. Click the canvas background to clear the filter.

## Scenario Walkthroughs

### Scenario 1: Why is this entity still waiting?

1. Open the **Entities** tab and find the waiting entity
2. Click the entity row → **Inspector** tab opens
3. Check **Waiting** field — shows how long the entity has been waiting
4. Check **Waiting for** field — shows which queue it's waiting in
5. Switch to **Step Log** and look for the C-event that should seize this entity
6. Expand the C-event log entry → check **cEval** detail:
   - If `false`: check `failureReason` — the condition wasn't met
   - If `skipped: restart`: a higher-priority C-event fired first

### Scenario 2: Why did this queue get selected?

1. Find the log entry showing the entity entering the queue
2. Expand the entry → check the **Event** detail for `newEvents[]` showing the scheduled routing
3. If the entity was routed via overflow, the message will show `→ overflow to "X"`

### Scenario 3: Why did this server get selected?

1. Find the log entry showing the ASSIGN macro firing
2. Expand the entry → check the **Arb** detail:
   - `candidates[]` — all waiting entities considered
   - `idleServers[]` — all idle servers available
   - `winner` — which entity-server pair was selected
   - `losers` — which entities were skipped and why

### Scenario 4: Why did this C-event fire (or not fire)?

1. Find the C-event log entry
2. Expand the entry → check **C-Eval** detail:
   - `conditionTrue: true` → the condition was met, event fired
   - `conditionTrue: false` → check `failureReason` for why it failed
   - `skippedBecause: restart` → a higher-priority event fired first, causing a restart

### Scenario 5: What does the Phase C truncation warning mean?

If you see a **WARNING** entry:
```
[t=X] WARNING  Phase C truncated after 500 passes at t=X — model may have an unstable condition
```

This means your C-events are firing in a cycle that never stabilises. Common causes:
- Two C-events with contradictory conditions that keep triggering each other
- A C-event that changes state to make another C-event true, which changes it back

Check the **Live Metrics** tab to see how many times each C-event fired — if counts are very high, you likely have an unstable condition.

## Out-of-Scope Boundaries

The following remain limited after Sprint 27:

- **Per-entity timeline replay**: You can see the current state and last transition, but not a full historical timeline of all transitions. (Sprint 28 candidate)
- **Condition variable values at eval time**: The cEval detail shows true/false and failure reason, but not the actual variable values that were compared. (Sprint 28 candidate)
- **Trace persistence**: Trace data is kept in memory during a run but not persisted to the database. Saved runs do not include full trace data.
- **Replication batch traces**: For multi-replication runs, only summary statistics are kept — individual trace data is not retained.
- **FEL composition**: The future event list contents at each clock tick are not exposed in the trace.

## UI Reference

### Bottom Panel Tabs

| Tab | Purpose |
|---|---|
| **Step Log** | Chronological event log with expandable debug detail |
| **Entities** | List of active entities with status, location, age |
| **Inspector** | Detailed view of a selected entity's state and history |
| **Live Metrics** | Event fire counts, queue depth, server utilisation |

### Trace Entry Types

| Phase | Payload | Key fields |
|---|---|---|
| `A` | `clock{}` | `from`, `to`, `dueEvents[]` |
| `B` | `event{}` | `type`, `fired`, `entityIds[]`, `newEvents[]` |
| `C` | `cEval{}` + `event{}` + `arbitration{}` | `conditionTrue`, `failureReason`, `skippedBecause`, `pass`, `priority` |
| `WARNING` | `warning{}` | `code`, `message`, `detail` |
