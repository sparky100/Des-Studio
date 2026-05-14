# Sprint 32 Capability Guide — Resource Reliability

Created: 2026-05-14  
Sprint: Sprint 32  
Status: ✅ Complete

## Purpose

This guide explains the resource reliability capabilities delivered in Sprint 32. It answers:

- How to model resource preemption (interrupting in-service entities)
- How to model resource breakdowns and repairs (MTBF/MTTR cycles)
- How remaining service time is preserved across interruptions
- What the new macros do and when to use them

## New Macros

### PREEMPT(ServerType)

Interrupts a busy server of the specified type. The current customer is re-queued with their remaining service time preserved. When the customer is re-seized, they resume service from where they left off.

**Use case:** Emergency patients interrupting routine consultations, high-priority jobs interrupting lower-priority processing.

**Example:**
```
PREEMPT(Doctor)
```

### FAIL(ServerType)

Sets all matching servers (idle, busy, or serving) to `failed` state. Busy servers' customers are re-queued with remaining service time. Failed servers are excluded from `idle().count`.

**Use case:** Machine breakdowns, server crashes, equipment failures.

**Example:**
```
FAIL(Machine)
```

### REPAIR(ServerType)

Sets all failed servers of the specified type back to `idle` state, making them available for assignment again.

**Use case:** Repair completion, maintenance finish, equipment restoration.

**Example:**
```
REPAIR(Machine)
```

## MTBF/MTTR Scheduling

Server entity types can now define MTBF (Mean Time Between Failures) and MTTR (Mean Time To Repair) distributions. The engine automatically schedules recurring FAILURE and REPAIR events.

**Configuration on server entity type:**
```json
{
  "id": "Machine",
  "name": "Machine",
  "role": "server",
  "count": "2",
  "mtbfDist": "exponential",
  "mtbfDistParams": { "rate": "0.1" },
  "mttrDist": "fixed",
  "mttrDistParams": { "value": "5" }
}
```

This configures machines that fail on average every 10 time units (rate=0.1) and take exactly 5 time units to repair.

## Remaining Service Time

When a customer is interrupted (by PREEMPT or FAIL), their remaining service time is calculated and stored:

```
remainingService = scheduledDuration - (clock - serviceStart)
```

When the customer is re-seized, the engine uses this remaining time instead of resampling a new service duration. This ensures that interrupted service resumes correctly.

## Debugging

### Trace Entries

Preemption and failure events appear in the Step Log:

```
[t=5.000] B: "Emergency Preempt"  ·  PREEMPT: server #2 (Doctor) interrupted #1 [remaining 7.500 t] → re-queued
[t=8.000] B: "Failure: Machine"  ·  FAILURE: 1 Machine server(s) failed at t=8.000
[t=11.000] B: "Repair: Machine"  ·  REPAIR: 1 Machine server(s) restored at t=11.000
```

### Entity Inspector

Interrupted entities show their remaining service time in the Inspector tab when selected.

### Server States

Servers can now be in these states:
- `idle` — available for assignment
- `busy` — processing a customer
- `failed` — broken down, excluded from idle count

## Scenario Walkthroughs

### Scenario 1: Emergency Room Preemption

**Model:** A hospital with one doctor. Routine patients arrive every 2 minutes and need 10 minutes of service. Emergency patients arrive at t=5 and preempt the doctor.

**Setup:**
1. Create a Doctor server (count=1)
2. Create a B-event "Emergency Preempt" at t=5 with effect `PREEMPT(Doctor)`
3. Create a C-event "Start Service" with ASSIGN and a fixed 10-minute service time

**What happens:**
- Routine patient arrives at t=0, starts service
- At t=5, emergency preempts — routine patient re-queued with 5 minutes remaining
- After emergency is served, routine patient resumes with 5 minutes left

### Scenario 2: Manufacturing Machine Breakdown

**Model:** A factory with one machine. Parts arrive every minute and need 4 minutes of processing. The machine fails every 8 minutes (fixed) and takes 3 minutes to repair.

**Setup:**
1. Create a Machine server with `mtbfDist: "fixed", mtbfDistParams: { value: "8" }` and `mttrDist: "fixed", mttrDistParams: { value: "3" }`
2. Create parts arriving every minute
3. Create a C-event to assign parts to the machine

**What happens:**
- Machine processes parts normally
- At t=8, machine fails — current part re-queued with remaining time
- At t=11, machine is repaired and resumes processing

## Out-of-Scope Boundaries

The following remain limited after Sprint 32:

- **Preemption priority levels:** Currently any PREEMPT interrupts any busy server. Priority-based preemption (only higher-priority can preempt) is a Sprint 33 candidate.
- **Partial repair:** Servers are either fully failed or fully idle. Degraded performance modes are not supported.
- **Multiple simultaneous failures:** Each server fails independently. Cascading failures are not modelled.
- **Preemption of preempted servers:** A server cannot be preempted while already in a preempted state.
