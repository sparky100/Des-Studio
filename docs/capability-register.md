# simmodlr — Capability Register v1.0
Sprint baseline: 55a  |  Date: 2026-05-20

All "Supported" statuses are backed by a passing benchmark in the
Benchmark Register (docs/performance-envelope.md).

| Scenario class | Status | Benchmark/Evidence | Notes |
|---|---|---|---|
| Single-class M/M/c queueing | ✓ Supported | Benchmarks 1, 2 | M/M/1 ±2%, M/M/c ±3% |
| M/G/1 general service | ✓ Supported | Benchmark 3 | Pollaczek-Khinchine ±3% |
| Finite queues with loss (M/M/1/K) | ✓ Supported | Benchmark 4 | Loss probability ±3% |
| Priority queuing (non-preemptive) | ✓ Supported | Benchmark 5 | Directional |
| Preemptive priority | ✓ Supported | Benchmark 6 | Directional |
| Warmup period removal | ✓ Supported | Benchmark 7 | Accuracy improvement confirmed |
| Seeded reproducibility | ✓ Supported | Benchmark 8 | Bit-identical |
| Server failures and repair | ✓ Supported | Functional test | FAIL/REPAIR macros |
| Time-varying arrivals | ✓ Supported | Functional test | Piecewise distributions |
| Shift schedules | ✓ Supported | Functional test | ShiftPeriod config |
| Batching and assembly | ✓ Supported | Functional test | BATCH/UNBATCH/MATCH macros |
| Cost tracking | ✓ Supported | Functional test | COST() macro |
| Containers (level resources) | ✓ Supported | Functional test | FILL/DRAIN macros |
| Preemption | ✓ Supported | Functional test | PREEMPT macro |
| Probabilistic routing | ✓ Supported | Functional test | ProbBranch config |
| Conditional routing | ✓ Supported | Functional test | RoutingBranch config |
| Multi-class resource contention | ~ Partial — Workaround required | See User Guide | Complex contention patterns require careful C-event priority ordering. See User Guide Section 12. |
| Network flows with arc travel time | ✗ Not supported | — | Entities on arcs not a first-class construct in this version |
| Agent-like entity decision logic | ✗ Not supported | — | Use AB Studio for agent-based modelling |
| Continuous flow (fluid models) | ✗ Not supported | — | Use SD Studio for system dynamics modelling |
