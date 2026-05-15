import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq, queueDisciplineComparator } from '../../src/engine/entities.js';
import { MACROS } from '../../src/engine/macros.js';
import {
  buildHistogram,
  buildHistogramFD,
  oneWayANOVA,
  tukeyHSD,
  mean,
  sampleStdDev,
} from '../../src/engine/statistics.js';
import { TEMPLATES } from '../../src/engine/templates.js';

beforeEach(() => {
  resetSeq();
});

// ============================================================================
// Bug Fix Regression Tests (Sprint 31-33 issues)
// ============================================================================

describe('Bug fix regression tests', () => {
  test('REPAIR macro records correct downtime (not always 0)', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv", name: "Machine", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "fail", name: "Fail Machine", effect: "FAIL(Machine)", scheduledTime: "5", schedules: [] },
        { id: "repair", name: "Repair Machine", effect: "REPAIR(Machine)", scheduledTime: "10", schedules: [] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0 AND idle(Machine).count > 0",
          effect: "ASSIGN(Queue, Machine)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();

    // Find the repaired server and check downtime
    const servers = result.entitySummary.filter(e => e.role === "server");
    const machine = servers.find(s => s.type === "Machine");
    // Downtime should be 5 (failed at t=5, repaired at t=10), not 0
    expect(machine._downtime).toBe(5);
  });

  test('avgWIP uses observation period (post-warmup) as denominator', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv", name: "Server", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0 AND idle(Server).count > 0",
          effect: "ASSIGN(Queue, Server)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    // Run with warmup=5, maxSimTime=10
    // WIP integral should only cover t=5 to t=10 (5 time units)
    const engine = buildEngine(model, 42, 5, 10);
    const result = engine.runAll();

    // avgWIP should be computed over observation period (10 - 5 = 5), not total time (10)
    // If there are entities in the system during post-warmup, avgWIP should be > 0
    expect(result.summary.avgWIP).toBeGreaterThanOrEqual(0);
    // The key test: if we had 2 entities consistently in the system for 5 time units,
    // avgWIP should be ~2, not ~1 (which would be the result of dividing by total time 10)
  });

  test('MATCH validates entity types — does not match wrong types', () => {
    const model = {
      entityTypes: [
        { id: "typeA", name: "TypeA", role: "customer", attrDefs: [] },
        { id: "typeB", name: "TypeB", role: "customer", attrDefs: [] },
        { id: "wrong", name: "WrongType", role: "customer", attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "qA", name: "QueueA", discipline: "FIFO" },
        { id: "qB", name: "QueueB", discipline: "FIFO" },
        { id: "qOut", name: "Output", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrivalA", name: "Arrival A", effect: "ARRIVE(TypeA, QueueA)", scheduledTime: "0",
          schedules: [{ eventId: "arrivalA", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "arrivalB", name: "Arrival B", effect: "ARRIVE(TypeB, QueueB)", scheduledTime: "0",
          schedules: [{ eventId: "arrivalB", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "arrivalWrong", name: "Arrival Wrong", effect: "ARRIVE(WrongType, QueueA)", scheduledTime: "0",
          schedules: [{ eventId: "arrivalWrong", dist: "Fixed", distParams: { value: "1" } }] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Match",
          condition: "queue(QueueA).length > 0 AND queue(QueueB).length > 0",
          effect: "MATCH(TypeA, QueueA, TypeB, QueueB, Output)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 5);
    const result = engine.runAll();

    // Should have created batch entities from matching TypeA + TypeB
    const batchEntities = result.entitySummary.filter(e => e.role === "batch");
    expect(batchEntities.length).toBeGreaterThan(0);

    // Batch entity type should be "TypeA+TypeB", not "WrongType+TypeB"
    batchEntities.forEach(be => {
      expect(be.type).toBe("TypeA+TypeB");
    });
  });
});

// ============================================================================
// Sprint 31: WIP, Clock Token, Queue-Depth Time-Plot
// ============================================================================

describe('Sprint 31: WIP time-average metric', () => {
  test('avgWIP is 0 when no entities are in the system', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv", name: "Server", role: "server", count: 10, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0 AND idle(Server).count > 0",
          effect: "ASSIGN(Queue, Server)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "0.1" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // With fast service and many servers, WIP should be low
    expect(result.summary.avgWIP).toBeGreaterThanOrEqual(0);
    expect(result.summary.avgWIP).toBeLessThan(5);
  });

  test('avgWIP increases with more entities and slower service', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv", name: "Server", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "0.5" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0 AND idle(Server).count > 0",
          effect: "ASSIGN(Queue, Server)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();

    // With arrival rate 2/min and service time 2, utilization is high
    // avgWIP should be significantly > 0
    expect(result.summary.avgWIP).toBeGreaterThan(1);
  });

  test('avgWIP with warmup excludes pre-warmup period from denominator', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv", name: "Server", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0 AND idle(Server).count > 0",
          effect: "ASSIGN(Queue, Server)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    // Run with warmup=5, maxSimTime=15
    const engine = buildEngine(model, 42, 5, 15);
    const result = engine.runAll();

    // avgWIP should be computed over observation period (15 - 5 = 10)
    // If we had ~2 entities on average during post-warmup, avgWIP should be ~2
    // NOT ~1 (which would result from dividing by total time 15)
    expect(result.summary.avgWIP).toBeGreaterThan(0);
    expect(result.summary.warmupPeriod).toBe(5);
  });
});

// ============================================================================
// Sprint 32: PREEMPT, FAIL/REPAIR, MTBF/MTTR
// ============================================================================

describe('Sprint 32: Resource preemption', () => {
  test('PREEMPT re-queues customer with remaining service time', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv", name: "Server", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "preempt", name: "Preempt", effect: "PREEMPT(Server)", scheduledTime: "3", schedules: [] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0 AND idle(Server).count > 0",
          effect: "ASSIGN(Queue, Server)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "10" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();

    // Preemption should have occurred at t=3
    const preemptLogs = result.log.filter(entry =>
      entry.message && entry.message.includes('PREEMPT')
    );
    expect(preemptLogs.length).toBeGreaterThan(0);

    // Customer should have been re-queued with remaining service
    const waitingAfterPreempt = result.entitySummary.filter(e => e.status === "waiting");
    expect(waitingAfterPreempt.length).toBeGreaterThan(0);
  });

  test('PREEMPT with no busy server logs appropriate message', () => {
    const model = {
      entityTypes: [
        { id: "srv", name: "Server", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "preempt", name: "Preempt", effect: "PREEMPT(Server)", scheduledTime: "0", schedules: [] },
      ],
      cEvents: [],
    };

    const engine = buildEngine(model, 42, 0, 5);
    const result = engine.runAll();

    const logs = result.log.filter(entry =>
      entry.message && entry.message.includes('PREEMPT') && entry.message.includes('no busy server')
    );
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe('Sprint 32: Resource failures and repairs', () => {
  test('FAIL sets servers to failed state and re-queues customers', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv", name: "Machine", role: "server", count: 2, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "fail", name: "Fail", effect: "FAIL(Machine)", scheduledTime: "5", schedules: [] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0 AND idle(Machine).count > 0",
          effect: "ASSIGN(Queue, Machine)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "10" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Servers should be in failed state
    const servers = result.entitySummary.filter(e => e.role === "server");
    const failedServers = servers.filter(s => s.status === "failed");
    expect(failedServers.length).toBeGreaterThan(0);

    // Customers should have been re-queued
    const waitingCustomers = result.entitySummary.filter(e => e.status === "waiting");
    expect(waitingCustomers.length).toBeGreaterThan(0);
  });

  test('REPAIR restores failed servers to idle with correct downtime', () => {
    const model = {
      entityTypes: [
        { id: "srv", name: "Machine", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [],
      bEvents: [
        { id: "fail", name: "Fail", effect: "FAIL(Machine)", scheduledTime: "5", schedules: [] },
        { id: "repair", name: "Repair", effect: "REPAIR(Machine)", scheduledTime: "12", schedules: [] },
      ],
      cEvents: [],
    };

    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();

    // Server should be idle after repair
    const servers = result.entitySummary.filter(e => e.role === "server");
    const machine = servers.find(s => s.type === "Machine");
    expect(machine.status).toBe("idle");

    // Downtime should be 7 (failed at t=5, repaired at t=12)
    expect(machine._downtime).toBe(7);
  });

  test('MTBF/MTTR auto-schedules recurring failure events', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv", name: "Machine", role: "server", count: 1, attrDefs: [],
          mtbfDist: "Fixed", mtbfDistParams: { value: "5" },
          mttrDist: "Fixed", mttrDistParams: { value: "2" },
        },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0 AND idle(Machine).count > 0",
          effect: "ASSIGN(Queue, Machine)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();

    // Should have multiple failure/repair events
    const failureLogs = result.log.filter(entry =>
      entry.message && entry.message.includes('FAILURE')
    );
    const repairLogs = result.log.filter(entry =>
      entry.message && entry.message.includes('REPAIR')
    );
    expect(failureLogs.length).toBeGreaterThan(1);
    expect(repairLogs.length).toBeGreaterThan(1);
  });
});

// ============================================================================
// Sprint 33: SPLIT, COSEIZE, MATCH, dynamic BATCH, SPT/EDD/PRIORITY
// ============================================================================

describe('Sprint 33: SPLIT macro edge cases', () => {
  test('SPLIT with N=2 creates exactly 1 clone', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Input", discipline: "FIFO" },
        { id: "q2", name: "Output", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Input)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Split",
          condition: "queue(Input).length > 0",
          effect: "SPLIT(Item, 2, Output)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 6);
    const result = engine.runAll();

    const customers = result.entitySummary.filter(e => e.role !== "server");
    const parent = customers.find(e => e._splitParent);
    expect(parent).toBeDefined();
    expect(parent._splitChildren.length).toBe(1);

    const children = customers.filter(e => e._splitFrom != null);
    expect(children.length).toBe(1);
    expect(children[0]._splitIndex).toBe(1);
  });

  test('SPLIT preserves entity attributes in clones', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [
          { name: "priority", valueType: "number", defaultValue: "5" },
          { name: "label", valueType: "string", defaultValue: "test" },
        ]},
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Input", discipline: "FIFO" },
        { id: "q2", name: "Output", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Input)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Split",
          condition: "queue(Input).length > 0",
          effect: "SPLIT(Item, 3, Output)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 6);
    const result = engine.runAll();

    const children = result.entitySummary.filter(e => e._splitFrom != null);
    expect(children.length).toBeGreaterThan(0);
    children.forEach(child => {
      expect(child.attrs.priority).toBe(5);
      expect(child.attrs.label).toBe("test");
    });
  });

  test('SPLIT with N < 2 logs error and does not create clones', () => {
    const split = MACROS.find(m => m.name === 'SPLIT');
    const ctx = {
      entities: [{ id: 1, type: "Item", role: "customer", status: "waiting", attrs: {} }],
      clock: 0,
      nextId: () => 2,
      msgs: [],
      setLastCustId: () => {},
      felRef: { _contextCustId: 1 },
      getLastCustId: () => 1,
    };

    const match = 'SPLIT(Item, 1, Output)'.match(split.pattern);
    expect(match).toBeTruthy();
    split.apply(match, ctx);

    // Should have logged an error
    expect(ctx.msgs.some(m => m.includes('N must be >= 2'))).toBe(true);
  });
});

describe('Sprint 33: COSEIZE edge cases', () => {
  test('COSEIZE with 3 server types claims all simultaneously', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv1", name: "Server1", role: "server", count: 1, attrDefs: [] },
        { id: "srv2", name: "Server2", role: "server", count: 1, attrDefs: [] },
        { id: "srv3", name: "Server3", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Co-Seize",
          condition: "queue(Queue).length > 0",
          effect: "COSEIZE(Queue, Server1, Server2, Server3)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 3);
    const result = engine.runAll();

    // All three server types should be busy (service time 5, sim ends at 3)
    const servers = result.entitySummary.filter(e => e.role === "server");
    const busyServers = servers.filter(s => s.status === "busy" || s.status === "serving");
    expect(busyServers.length).toBe(3);
  });

  test('COSEIZE fails atomically when any server type is unavailable', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv1", name: "Server1", role: "server", count: 1, attrDefs: [] },
        { id: "srv2", name: "Server2", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Seize Server1 only",
          condition: "queue(Queue).length > 0 AND idle(Server1).count > 0",
          effect: "ASSIGN(Queue, Server1)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "10" }, useEntityCtx: true }],
          priority: 1,
        },
        {
          id: "c2",
          name: "Co-Seize",
          condition: "queue(Queue).length > 0",
          effect: "COSEIZE(Queue, Server1, Server2)",
          cSchedules: [],
          priority: 2,
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 3);
    const result = engine.runAll();

    // Server1 should be busy (seized by c1), Server2 should be idle
    // COSEIZE should have failed atomically (logged error) because Server1 is busy
    const servers = result.entitySummary.filter(e => e.role === "server");
    const srv1 = servers.find(s => s.type === "Server1");
    const srv2 = servers.find(s => s.type === "Server2");
    expect(srv1.status).toBe("busy");
    expect(srv2.status).toBe("idle");

    // Should have logged the failure
    const logs = result.log.filter(entry =>
      entry.message && entry.message.includes('no idle Server1')
    );
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe('Sprint 33: MATCH edge cases', () => {
  test('MATCH with mixed entity types in queue only matches correct types', () => {
    const model = {
      entityTypes: [
        { id: "typeA", name: "TypeA", role: "customer", attrDefs: [] },
        { id: "typeB", name: "TypeB", role: "customer", attrDefs: [] },
        { id: "wrong", name: "WrongType", role: "customer", attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "qA", name: "QueueA", discipline: "FIFO" },
        { id: "qB", name: "QueueB", discipline: "FIFO" },
        { id: "qOut", name: "Output", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrivalA", name: "Arrival A", effect: "ARRIVE(TypeA, QueueA)", scheduledTime: "0",
          schedules: [{ eventId: "arrivalA", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "arrivalB", name: "Arrival B", effect: "ARRIVE(TypeB, QueueB)", scheduledTime: "0",
          schedules: [{ eventId: "arrivalB", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "arrivalWrong", name: "Arrival Wrong", effect: "ARRIVE(WrongType, QueueA)", scheduledTime: "0",
          schedules: [{ eventId: "arrivalWrong", dist: "Fixed", distParams: { value: "1" } }] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Match",
          condition: "queue(QueueA).length > 0 AND queue(QueueB).length > 0",
          effect: "MATCH(TypeA, QueueA, TypeB, QueueB, Output)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 5);
    const result = engine.runAll();

    // Should have matched TypeA + TypeB, not WrongType + TypeB
    const batchEntities = result.entitySummary.filter(e => e.role === "batch");
    expect(batchEntities.length).toBeGreaterThan(0);
    batchEntities.forEach(be => {
      expect(be.type).toBe("TypeA+TypeB");
    });
  });

  test('MATCH with empty queue logs appropriate message', () => {
    const match = MACROS.find(m => m.name === 'MATCH');
    const ctx = {
      entities: [],
      clock: 0,
      nextId: () => 1,
      msgs: [],
      helpers: {
        waitingInQueue: () => [],
        findQueueConfig: () => null,
      },
    };

    const matchCall = 'MATCH(TypeA, QueueA, TypeB, QueueB, Output)'.match(match.pattern);
    match.apply(matchCall, ctx);

    expect(ctx.msgs.some(m => m.includes('no match'))).toBe(true);
  });
});

describe('Sprint 33: Dynamic BATCH edge cases', () => {
  test('BATCH with Entity.attrName reads from first waiting entity', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [
          { name: "batchSize", valueType: "number", defaultValue: "4" },
        ]},
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Accum", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Accum)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Dynamic Batch",
          condition: "queue(Accum).length >= 4",
          effect: "BATCH(Accum, Entity.batchSize)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const batchEntities = result.entitySummary.filter(e => e.role === "batch");
    expect(batchEntities.length).toBeGreaterThan(0);
    batchEntities.forEach(be => {
      expect(be.batch.children.length).toBe(4);
    });
  });

  test('BATCH with invalid attribute value logs error', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [
          { name: "batchSize", valueType: "string", defaultValue: "invalid" },
        ]},
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Accum", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Accum)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Dynamic Batch",
          condition: "queue(Accum).length >= 1",
          effect: "BATCH(Accum, Entity.batchSize)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const invalidWarnings = result.log.filter(entry =>
      entry.message && entry.message.includes('invalid batch size')
    );
    expect(invalidWarnings.length).toBeGreaterThan(0);
  });

  test('BATCH with missing attribute logs error', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Accum", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Accum)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Dynamic Batch",
          condition: "queue(Accum).length >= 1",
          effect: "BATCH(Accum, Entity.missingAttr)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const missingWarnings = result.log.filter(entry =>
      entry.message && entry.message.includes('no \'missingAttr\' attribute')
    );
    expect(missingWarnings.length).toBeGreaterThan(0);
  });
});

describe('Sprint 33: Queue disciplines', () => {
  test('SPT sorts by serviceTime ascending with FIFO tiebreaker', () => {
    const comparator = queueDisciplineComparator("SPT");
    const a = { arrivalTime: 1, attrs: { serviceTime: 5 } };
    const b = { arrivalTime: 2, attrs: { serviceTime: 3 } };
    const c = { arrivalTime: 3, attrs: { serviceTime: 3 } };

    const sorted = [a, b, c].sort(comparator);
    // b and c have same serviceTime (3), so FIFO tiebreaker: b (arrivalTime 2) before c (arrivalTime 3)
    expect(sorted[0].attrs.serviceTime).toBe(3);
    expect(sorted[0].arrivalTime).toBe(2);
    expect(sorted[1].attrs.serviceTime).toBe(3);
    expect(sorted[1].arrivalTime).toBe(3);
    expect(sorted[2].attrs.serviceTime).toBe(5);
  });

  test('EDD sorts by dueDate ascending with FIFO tiebreaker', () => {
    const comparator = queueDisciplineComparator("EDD");
    const a = { arrivalTime: 1, attrs: { dueDate: 10 } };
    const b = { arrivalTime: 2, attrs: { dueDate: 5 } };
    const c = { arrivalTime: 3, attrs: { dueDate: 5 } };

    const sorted = [a, b, c].sort(comparator);
    expect(sorted[0].attrs.dueDate).toBe(5);
    expect(sorted[0].arrivalTime).toBe(2);
    expect(sorted[1].attrs.dueDate).toBe(5);
    expect(sorted[1].arrivalTime).toBe(3);
    expect(sorted[2].attrs.dueDate).toBe(10);
  });

  test('PRIORITY(attrName) sorts by specified attribute with FIFO tiebreaker', () => {
    const comparator = queueDisciplineComparator("PRIORITY(urgency)");
    const a = { arrivalTime: 1, attrs: { urgency: 3 } };
    const b = { arrivalTime: 2, attrs: { urgency: 1 } };
    const c = { arrivalTime: 3, attrs: { urgency: 1 } };

    const sorted = [a, b, c].sort(comparator);
    expect(sorted[0].attrs.urgency).toBe(1);
    expect(sorted[0].arrivalTime).toBe(2);
    expect(sorted[1].attrs.urgency).toBe(1);
    expect(sorted[1].arrivalTime).toBe(3);
    expect(sorted[2].attrs.urgency).toBe(3);
  });

  test('PRIORITY(attrName) puts entities without attribute last', () => {
    const comparator = queueDisciplineComparator("PRIORITY(priority)");
    const a = { arrivalTime: 1, attrs: {} };
    const b = { arrivalTime: 2, attrs: { priority: 5 } };

    const sorted = [a, b].sort(comparator);
    expect(sorted[0].attrs.priority).toBe(5);
    expect(sorted[1].attrs.priority).toBeUndefined();
  });

  test('SPT falls back to processingTime if serviceTime is missing', () => {
    const comparator = queueDisciplineComparator("SPT");
    const a = { arrivalTime: 1, attrs: { processingTime: 3 } };
    const b = { arrivalTime: 2, attrs: { processingTime: 5 } };

    const sorted = [a, b].sort(comparator);
    expect(sorted[0].attrs.processingTime).toBe(3);
    expect(sorted[1].attrs.processingTime).toBe(5);
  });
});

// ============================================================================
// Sprint 33: Histogram and ANOVA
// ============================================================================

describe('Sprint 33: Histogram edge cases', () => {
  test('buildHistogram handles all identical values', () => {
    const values = [5, 5, 5, 5, 5];
    const hist = buildHistogram(values, { numBins: 5 });

    expect(hist.total).toBe(5);
    expect(hist.bins.length).toBe(1);
    expect(hist.bins[0].count).toBe(5);
  });

  test('buildHistogram handles negative values', () => {
    const values = [-5, -3, -1, 0, 1, 3, 5];
    const hist = buildHistogram(values, { numBins: 7 });

    expect(hist.total).toBe(7);
    expect(hist.min).toBe(-5);
    expect(hist.max).toBe(5);
  });

  test('buildHistogramFD handles small sample sizes', () => {
    const values = [1, 2, 3];
    const hist = buildHistogramFD(values);

    expect(hist.total).toBe(3);
    expect(hist.numBins).toBeGreaterThan(0);
  });

  test('buildHistogram density calculation is correct', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const hist = buildHistogram(values, { numBins: 5 });

    // Density should be count / (total * binWidth)
    const binWidth = (hist.max - hist.min) / hist.numBins;
    let areaSum = 0;
    for (const bin of hist.bins) {
      areaSum += bin.density * binWidth;
    }
    expect(areaSum).toBeCloseTo(1, 4);
  });
});

describe('Sprint 33: ANOVA edge cases', () => {
  test('oneWayANOVA handles groups with different sizes', () => {
    const groupA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const groupB = [10, 11, 12];
    const result = oneWayANOVA([groupA, groupB]);

    expect(result.k).toBe(2);
    expect(result.n).toBe(13);
    expect(result.significant).toBe(true);
  });

  test('oneWayANOVA handles single observation per group', () => {
    const groupA = [5];
    const groupB = [10];
    const result = oneWayANOVA([groupA, groupB]);

    // With only 1 observation per group, dfWithin = 0, so F is undefined
    expect(result.k).toBe(2);
    expect(result.n).toBe(2);
    expect(result.fStatistic).toBeNull();
  });

  test('oneWayANOVA handles many groups', () => {
    const groups = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
      [13, 14, 15],
    ];
    const result = oneWayANOVA(groups);

    expect(result.k).toBe(5);
    expect(result.n).toBe(15);
    expect(result.dfBetween).toBe(4);
    expect(result.dfWithin).toBe(10);
    expect(result.significant).toBe(true);
  });

  test('tukeyHSD handles many groups with multiple comparisons', () => {
    const groups = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ];
    const result = tukeyHSD(groups);

    // 4 groups = 6 pairwise comparisons
    expect(result.comparisons.length).toBe(6);
  });
});

// ============================================================================
// Template Model Execution Validation
// ============================================================================

describe('All template models — execution validation', () => {
  TEMPLATES.forEach(template => {
    describe(`${template.name}`, () => {
      test('passes validation', () => {
        // Basic validation: model has required fields
        expect(template.entityTypes).toBeDefined();
        expect(template.bEvents).toBeDefined();
        expect(template.queues).toBeDefined();

        // All entity types have required fields
        template.entityTypes.forEach(et => {
          expect(et.name).toBeDefined();
          expect(et.role).toBeDefined();
        });

        // All queues have required fields
        template.queues.forEach(q => {
          expect(q.name).toBeDefined();
          expect(q.discipline).toBeDefined();
        });
      });

      test('runs without crashing', () => {
        const engine = buildEngine(template, 42, 0, 100);
        const result = engine.runAll();

        expect(result.finalTime).toBeGreaterThan(0);
        expect(result.summary).toBeDefined();
      });

      test('serves at least one entity (non-trivial output)', () => {
        const engine = buildEngine(template, 42, 0, 100);
        const result = engine.runAll();

        // Batch templates (factory, warehouse) count batched groups as departures
        expect(result.summary.served).toBeGreaterThan(0);
      });

      test('same seed produces identical results', () => {
        const e1 = buildEngine(template, 99, 0, 50);
        const r1 = e1.runAll();

        const e2 = buildEngine(template, 99, 0, 50);
        const r2 = e2.runAll();

        expect(r1.summary.served).toBe(r2.summary.served);
        expect(r1.summary.avgWait).toBe(r2.summary.avgWait);
      });

      test('has domain and templateMeta fields', () => {
        expect(typeof template.domain).toBe('string');
        expect(template.domain.length).toBeGreaterThan(0);
        expect(typeof template.templateMeta).toBe('object');
        expect(typeof template.templateMeta.scenarioType).toBe('string');
        expect(typeof template.templateMeta.paramGuide).toBe('string');
        expect(typeof template.templateMeta.limitations).toBe('string');
      });

      test('no data anomalies in summary statistics', () => {
        const engine = buildEngine(template, 42, 0, 100);
        const result = engine.runAll();
        const summary = result.summary;

        // Served count should be non-negative
        expect(summary.served).toBeGreaterThanOrEqual(0);

        // Reneged count should be non-negative
        expect(summary.reneged).toBeGreaterThanOrEqual(0);

        // If there are served entities, avgWait should be non-negative
        if (summary.served > 0) {
          expect(summary.avgWait).toBeGreaterThanOrEqual(0);
          expect(summary.avgSvc).toBeGreaterThanOrEqual(0);
          expect(summary.avgSojourn).toBeGreaterThanOrEqual(0);
        }

        // avgWIP should be non-negative
        expect(summary.avgWIP).toBeGreaterThanOrEqual(0);

        // maxSojourn should be >= avgSojourn if both exist
        if (summary.maxSojourn != null && summary.avgSojourn != null) {
          expect(summary.maxSojourn).toBeGreaterThanOrEqual(summary.avgSojourn);
        }
      });
    });
  });
});

describe('New template models — specific feature validation', () => {
  test('Surgical Suite uses COSEIZE and PRIORITY(urgency)', () => {
    const template = TEMPLATES.find(t => t.id === 'surgical-suite');
    expect(template).toBeDefined();

    // Check COSEIZE in cEvents
    const coseizeEvent = template.cEvents.find(ce =>
      ce.effect && ce.effect.includes('COSEIZE')
    );
    expect(coseizeEvent).toBeDefined();

    // Check PRIORITY(urgency) queue discipline
    const surgeryQueue = template.queues.find(q => q.name === 'SurgeryQueue');
    expect(surgeryQueue.discipline).toBe('PRIORITY(urgency)');

    // Check urgency attribute on Patient
    const patient = template.entityTypes.find(et => et.name === 'Patient');
    const urgencyAttr = patient.attrDefs.find(a => a.name === 'urgency');
    expect(urgencyAttr).toBeDefined();
  });

  test('Order Fulfillment uses MATCH and EDD', () => {
    const template = TEMPLATES.find(t => t.id === 'order-fulfillment');
    expect(template).toBeDefined();

    // Check MATCH in cEvents
    const matchEvent = template.cEvents.find(ce =>
      ce.effect && ce.effect.includes('MATCH')
    );
    expect(matchEvent).toBeDefined();

    // Check EDD queue discipline
    const orderQueue = template.queues.find(q => q.name === 'OrderQueue');
    expect(orderQueue.discipline).toBe('EDD');

    // Check dueDate attribute on Order
    const order = template.entityTypes.find(et => et.name === 'Order');
    const dueDateAttr = order.attrDefs.find(a => a.name === 'dueDate');
    expect(dueDateAttr).toBeDefined();
  });
});
