# Pattern 8: Skill Priority, Cross-Type Pooling, and Round-Robin Routing

## When to use
- **Skill priority** — a mixed pool of servers shares a skill, but some should be preferred over others (e.g. "prefer the surgeon, fall back to the GP").
- **Cross-type pooling** — any idle server with a given skill should be seized, regardless of which server type it belongs to (e.g. "any agent certified in billing").
- **Round-robin routing** — entities should cycle evenly across N destination queues rather than always picking the same one.

## Skill priority

`SkillProfile.priority` (default 0, higher wins) controls which idle server `ASSIGN` picks first when several match a skill.

```
Doctor (server, count=3)
  skillProfiles:
    - name: Specialist   skills: [Surgery]   count: 1   priority: 10
    - name: Generalist   skills: [Surgery]   count: 2   priority: 1

C-event:
  effect: ASSIGN(Queue, Doctor, "Surgery")
```

With both a Specialist and Generalist idle, `ASSIGN` picks the Specialist even if the Generalist has been idle longer. Ties within the same priority tier still resolve FIFO by idle-since time.

## Cross-type pooling — `ANY`

Use the reserved token `ANY` in the server-type position to pool idle servers across every server type that carries the skill:

```
effect: ASSIGN(Queue, ANY, "Billing")
```

This replaces the old workaround of one C-event per server type racing on priority. Combine with `SkillProfile.priority` to prefer one type's servers over another's within the pool.

**Gotcha:** `ANY` only makes sense with a skill argument — `ASSIGN(Queue, ANY, "Skill")` — since without a skill filter there's no way to know which servers are eligible to pool. Don't name a real server type `ANY`; validation will warn about the collision.

## Round-robin routing

`ROUND_ROBIN(StateVar, N)` advances `StateVar` through `0, 1, ..., N-1, 0, 1, ...` each time it fires. Pair it with a `routing[]` table (or conditional-routing C-event) that compares the state variable to each literal index:

```
State variable: rrIndex (initialValue: -1)

B-event "Done" (fires on RELEASE, no target queue):
  effect: RELEASE(Server); ROUND_ROBIN(rrIndex, 3)
  routing:
    - condition: { variable: rrIndex, operator: "==", value: 0 } → QueueA
    - condition: { variable: rrIndex, operator: "==", value: 1 } → QueueB
    - condition: { variable: rrIndex, operator: "==", value: 2 } → QueueC
```

Entities are distributed QueueA → QueueB → QueueC → QueueA → ... in strict rotation, regardless of queue depth.

## Notes
- Both `ANY` pooling and priority sorting only activate when a skill argument is present — `ASSIGN(Queue, ServerType)` with no skill is unaffected.
- `CANCEL(EventName)` (see ADR-019) pairs naturally with round-robin-style patterns that schedule a competing timeout: `CANCEL` removes the calling entity's own pending instance of a named event, useful for "whichever happens first" races.
