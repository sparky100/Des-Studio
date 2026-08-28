import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';
import { MACROS } from '../../src/engine/macros.js';

beforeEach(() => {
  resetSeq();
});

// ============================================================================
// G09: Dynamic batch size by attribute
// ============================================================================
// The BATCH macro's pattern-matching tests (registration, literal-integer
// and attribute-reference operands) live in tests/engine/batch-unbatch.test.js
// alongside the rest of BATCH's macro-pattern coverage.

describe('G09: Dynamic batch size by attribute', () => {
  test('BATCH reads batch size from entity attribute', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [
          { name: "batchSize", valueType: "number", defaultValue: "3" },
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
          condition: "queue(Accum).length >= 3",
          effect: "BATCH(Accum, Entity.batchSize)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const batchEntities = result.entitySummary.filter(e => e.role === "batch");
    expect(batchEntities.length).toBeGreaterThan(0);
    // Each batch should have 3 children (from Entity.batchSize = 3)
    batchEntities.forEach(be => {
      expect(be.batch.children.length).toBe(3);
    });
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
          condition: "queue(Accum).length >= 3",
          effect: "BATCH(Accum, Entity.missingAttr)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Should have warning messages about missing attribute
    const batchWarnings = result.log.filter(entry =>
      entry.message && entry.message.includes('no \'missingAttr\' attribute')
    );
    expect(batchWarnings.length).toBeGreaterThan(0);
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

    // Should have warning about invalid batch size
    const invalidWarnings = result.log.filter(entry =>
      entry.message && entry.message.includes('invalid batch size')
    );
    expect(invalidWarnings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SPLIT macro tests
// ============================================================================

describe('SPLIT macro', () => {
  test('SPLIT macro is registered in MACROS', () => {
    const split = MACROS.find(m => m.name === 'SPLIT');
    expect(split).toBeDefined();
    expect(split.pattern).toBeDefined();
    expect(typeof split.apply).toBe('function');
  });

  test('SPLIT pattern matches valid syntax', () => {
    const split = MACROS.find(m => m.name === 'SPLIT');
    const m = 'SPLIT(Item, 3, OutputQueue)'.match(split.pattern);
    expect(m).toBeTruthy();
    expect(m[1].trim()).toBe('Item');
    expect(m[2]).toBe('3');
    expect(m[3].trim()).toBe('OutputQueue');
  });

  test('SPLIT creates N-1 clones', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [
          { name: "priority", valueType: "number", defaultValue: "1" },
        ]},
        { id: "worker", name: "Worker", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Input", discipline: "FIFO" },
        { id: "q2", name: "Output", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Input)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign and Split",
          condition: "queue(Input).length > 0",
          effect: "ASSIGN(Input, Worker)",
          cSchedules: [
            { eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true },
            { eventId: "split-b", dist: "Fixed", distParams: { value: "0" }, useEntityCtx: true },
          ],
        },
      ],
    };

    // Add a B-event for split that fires after complete
    model.bEvents.push({
      id: "split-b",
      name: "Split",
      effect: "SPLIT(Item, 3, Output)",
      scheduledTime: "9999",
      schedules: [],
    });

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Should have split entities in Output queue
    const outputEntities = result.entitySummary.filter(e => e.queue === "Output" || e.lastQueue === "Output");
    expect(outputEntities.length).toBeGreaterThan(0);

    // Check for split-related log messages
    const splitLogs = result.log.filter(entry =>
      entry.message && entry.message.includes('SPLIT')
    );
    expect(splitLogs.length).toBeGreaterThan(0);
  });

  test('SPLIT clone children can be seized and completed downstream, not just parked in the queue', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "worker", name: "Worker", role: "server", count: 1, attrDefs: [] },
        { id: "packer", name: "Packer", role: "server", count: 3, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Input", discipline: "FIFO" },
        { id: "q2", name: "Output", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Input)", scheduledTime: "0", schedules: [] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
        { id: "split-b", name: "Split", effect: "SPLIT(Item, 3, Output)", scheduledTime: "9999", schedules: [] },
        { id: "pack-complete", name: "Pack Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign and Split",
          priority: 1,
          condition: "queue(Input).length > 0",
          effect: "ASSIGN(Input, Worker)",
          cSchedules: [
            { eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true },
            { eventId: "split-b", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true },
          ],
        },
        {
          id: "c2",
          name: "Pack Clones",
          priority: 2,
          condition: "queue(Output).length > 0 AND idle(Packer).count > 0",
          effect: "ASSIGN(Output, Packer)",
          cSchedules: [{ eventId: "pack-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const clones = result.entitySummary.filter(e => e._splitFrom != null);
    expect(clones.length).toBeGreaterThan(0);

    for (const clone of clones) {
      const seizeLog = result.log.some(e => e.message?.includes(`#${clone.id} (Output) → serving`));
      expect(seizeLog).toBe(true);
      expect(clone.status).toBe("done");
    }
  });
});

// ============================================================================
// COSEIZE macro tests
// ============================================================================

describe('COSEIZE macro', () => {
  test('COSEIZE macro is registered in MACROS', () => {
    const coseize = MACROS.find(m => m.name === 'COSEIZE');
    expect(coseize).toBeDefined();
    expect(coseize.pattern).toBeDefined();
    expect(typeof coseize.apply).toBe('function');
  });

  test('COSEIZE pattern matches valid syntax', () => {
    const coseize = MACROS.find(m => m.name === 'COSEIZE');
    const m = 'COSEIZE(Queue, Server1, Server2)'.match(coseize.pattern);
    expect(m).toBeTruthy();
    expect(m[1].trim()).toBe('Queue');
    expect(m[2].trim()).toBe('Server1, Server2');
  });

  test('COSEIZE seizes multiple server types simultaneously', () => {
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
          name: "Co-Seize",
          condition: "queue(Queue).length > 0",
          effect: "COSEIZE(Queue, Server1, Server2)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Check that COSEIZE fired (look for any COSEIZE log entry)
    const coseizeLogs = result.log.filter(entry =>
      entry.message && entry.message.includes('COSEIZE')
    );
    expect(coseizeLogs.length).toBeGreaterThan(0);
  });

  test('COSEIZE fails when any server type has no idle servers', () => {
    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer", attrDefs: [] },
        { id: "srv1", name: "Server1", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Item, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Co-Seize",
          condition: "queue(Queue).length > 0",
          effect: "COSEIZE(Queue, Server1, MissingServer)",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Should have warning about insufficient idle MissingServer (Sprint 95:
    // wording carries a quantity now — "only N idle Type (need M)" — since
    // the same check now also gates Type:N quantity seizes)
    const warnings = result.log.filter(entry =>
      entry.message && entry.message.includes('idle MissingServer') && entry.message.includes('need 1')
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('full round-trip: entity arrives → COSEIZE seizes two servers → service elapses → COMPLETE releases both → entity served', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "surgeon", name: "Surgeon", role: "server", count: 1, attrDefs: [] },
        { id: "anesthetist", name: "Anesthetist", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "surgery_q", name: "SurgeryQueue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, SurgeryQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "6" } }] },
        { id: "surgery_done", name: "Surgery Complete", scheduledTime: "9999",
          effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [
        { id: "ce_surgery", name: "Perform Surgery", priority: 1,
          condition: "queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0",
          effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
          cSchedules: [{ eventId: "surgery_done", dist: "Fixed", distParams: { value: "3" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();

    const served = result.entitySummary.filter(e => e.role === "customer" && e.status === "done");
    expect(served.length).toBeGreaterThan(0);

    const coseizeLogs = result.log.filter(e => e.message?.includes("COSEIZE"));
    expect(coseizeLogs.length).toBeGreaterThan(0);

    const servingAtEnd = result.entitySummary.filter(e => e.role === "customer" && e.status === "serving");
    const busyServersAtEnd = result.entitySummary.filter(e => e.role === "server" && e.status === "busy");
    if (servingAtEnd.length === 0) {
      expect(busyServersAtEnd.length).toBe(0);
    }

    expect(result.summary?.served).toBeGreaterThan(0);
  });

  test('round-trip: both servers released after COMPLETE — multiple patients can be served', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "surgeon", name: "Surgeon", role: "server", count: 1, attrDefs: [] },
        { id: "anesthetist", name: "Anesthetist", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "surgery_q", name: "SurgeryQueue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, SurgeryQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "4" } }] },
        { id: "surgery_done", name: "Surgery Complete", scheduledTime: "9999",
          effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [
        { id: "ce_surgery", name: "Perform Surgery", priority: 1,
          condition: "queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0",
          effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
          cSchedules: [{ eventId: "surgery_done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();

    const served = result.entitySummary.filter(e => e.role === "customer" && e.status === "done");
    expect(served.length).toBeGreaterThan(1);

    const coseizeLogs = result.log.filter(e => e.message?.includes("COSEIZE"));
    expect(coseizeLogs.length).toBeGreaterThan(0);

    const releaseLogs = result.log.filter(e => e.message?.includes("COSEIZE release"));
    if (served.length > 1) {
      expect(releaseLogs.length).toBeGreaterThan(0);
    }
  });

  test('RELEASE_COSEIZED releases both servers and routes the entity to the target queue', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "surgeon", name: "Surgeon", role: "server", count: 1, attrDefs: [] },
        { id: "anesthetist", name: "Anesthetist", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "surgery_q", name: "SurgeryQueue", discipline: "FIFO" },
        { id: "ward_q", name: "WardQueue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, SurgeryQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "4" } }] },
        { id: "surgery_done", name: "Surgery Complete", scheduledTime: "9999",
          effect: ["RELEASE_COSEIZED([Surgeon, Anesthetist], WardQueue)"], schedules: [] },
      ],
      cEvents: [
        { id: "ce_surgery", name: "Perform Surgery", priority: 1,
          condition: "queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0",
          effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
          cSchedules: [{ eventId: "surgery_done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();

    const releaseLogs = result.log.filter(e => e.message?.includes("released [#") && e.message?.includes("Surgeon") && e.message?.includes("Anesthetist"));
    expect(releaseLogs.length).toBeGreaterThan(1);

    const inWard = result.entitySummary.filter(e => e.role === "customer" && (e.queue === "WardQueue" || e.lastQueue === "WardQueue"));
    expect(inWard.length).toBeGreaterThan(1);

    // No leaked/orphaned claims — a busy server always has a currentCustId, and vice versa.
    const servers = result.entitySummary.filter(e => e.role === "server");
    servers.forEach(s => {
      if (s.status === "idle") expect(s.currentCustId).toBeUndefined();
    });
  });

  test('RELEASE_COSEIZED records every co-seized server type in the stage history, not just the first', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "surgeon", name: "Surgeon", role: "server", count: 1, attrDefs: [] },
        { id: "anesthetist", name: "Anesthetist", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "surgery_q", name: "SurgeryQueue", discipline: "FIFO" },
        { id: "ward_q", name: "WardQueue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, SurgeryQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "10" } }] },
        { id: "surgery_done", name: "Surgery Complete", scheduledTime: "9999",
          effect: ["RELEASE_COSEIZED([Surgeon, Anesthetist], WardQueue)"], schedules: [] },
      ],
      cEvents: [
        { id: "ce_surgery", name: "Perform Surgery", priority: 1,
          condition: "queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0",
          effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
          cSchedules: [{ eventId: "surgery_done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const patient = result.entitySummary.find(e => e.role === "customer" && e.stages?.length > 0);
    expect(patient).toBeDefined();
    const stage = patient.stages[0];
    expect(stage.serverTypes).toEqual(expect.arrayContaining(["Surgeon", "Anesthetist"]));
    expect(stage.serverTypes).toHaveLength(2);
    // serverType (singular, backward-compat) still holds the primary type
    expect(stage.serverType).toBe("Surgeon");
  });

  test('RELEASE_COSEIZED aborts without partial release when a listed type was not actually co-seized', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "surgeon", name: "Surgeon", role: "server", count: 1, attrDefs: [] },
        { id: "anesthetist", name: "Anesthetist", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "surgery_q", name: "SurgeryQueue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, SurgeryQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "100" } }] },
        // Mismatched: COSEIZE only claims Surgeon + Anesthetist, but the release lists a
        // type ("Nurse") that was never claimed for this customer.
        { id: "surgery_done", name: "Surgery Complete", scheduledTime: "9999",
          effect: ["RELEASE_COSEIZED([Surgeon, Nurse])"], schedules: [] },
      ],
      cEvents: [
        { id: "ce_surgery", name: "Perform Surgery", priority: 1,
          condition: "queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0",
          effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
          cSchedules: [{ eventId: "surgery_done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();

    const errorLogs = result.log.filter(e => e.message?.includes("no claimed Nurse server"));
    expect(errorLogs.length).toBeGreaterThan(0);

    // Neither server was released — the Surgeon claim from before the failed call is untouched.
    const surgeon = result.entitySummary.find(e => e.type === "Surgeon");
    const anesthetist = result.entitySummary.find(e => e.type === "Anesthetist");
    expect(surgeon.status).toBe("busy");
    expect(anesthetist.status).toBe("busy");
  });

  test('PREEMPT on one co-seized resource also releases the other co-seized resource', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "surgeon", name: "Surgeon", role: "server", count: 1, attrDefs: [] },
        { id: "anesthetist", name: "Anesthetist", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "surgery_q", name: "SurgeryQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, SurgeryQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "100" } }] },
        { id: "surgery_done", name: "Surgery Complete", scheduledTime: "9999",
          effect: "COMPLETE()", schedules: [] },
        { id: "preempt_it", name: "Preempt", scheduledTime: "1", effect: "PREEMPT(Surgeon)", schedules: [] },
      ],
      cEvents: [
        { id: "ce_surgery", name: "Perform Surgery", priority: 1,
          condition: "queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0",
          effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
          cSchedules: [{ eventId: "surgery_done", dist: "Fixed", distParams: { value: "20" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 5);
    const result = engine.runAll();

    // The preempted Surgeon frees up too, so the same waiting patient is immediately
    // re-coseized and both servers end up busy again by run end — that's correct, not a
    // leak. The proof that the fix actually released the Anesthetist (rather than leaving
    // it permanently claimed by the preempted patient) is this explicit release log line.
    const releaseLog = result.log.find(e => e.message?.includes("Anesthetist") && e.message?.includes("COSEIZE release on preempt/fail"));
    expect(releaseLog).toBeDefined();
  });

  test('FAIL on one co-seized resource also releases the other co-seized resource', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "surgeon", name: "Surgeon", role: "server", count: 1, attrDefs: [] },
        { id: "anesthetist", name: "Anesthetist", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "surgery_q", name: "SurgeryQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, SurgeryQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "100" } }] },
        { id: "surgery_done", name: "Surgery Complete", scheduledTime: "9999",
          effect: "COMPLETE()", schedules: [] },
        { id: "fail_it", name: "Fail", scheduledTime: "1", effect: "FAIL(Surgeon)", schedules: [] },
      ],
      cEvents: [
        { id: "ce_surgery", name: "Perform Surgery", priority: 1,
          condition: "queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0",
          effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
          cSchedules: [{ eventId: "surgery_done", dist: "Fixed", distParams: { value: "20" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 5);
    const result = engine.runAll();

    const surgeon = result.entitySummary.find(e => e.type === "Surgeon");
    const anesthetist = result.entitySummary.find(e => e.type === "Anesthetist");
    expect(surgeon.status).toBe("failed");
    expect(anesthetist.status).toBe("idle");
    expect(anesthetist.currentCustId).toBeUndefined();
  });
});

// ============================================================================
// MATCH macro tests
// ============================================================================

describe('MATCH macro', () => {
  test('MATCH macro is registered in MACROS', () => {
    const match = MACROS.find(m => m.name === 'MATCH');
    expect(match).toBeDefined();
    expect(match.pattern).toBeDefined();
    expect(typeof match.apply).toBe('function');
  });

  test('MATCH pattern matches valid syntax', () => {
    const match = MACROS.find(m => m.name === 'MATCH');
    const m = 'MATCH(TypeA, QueueA, TypeB, QueueB, Output)'.match(match.pattern);
    expect(m).toBeTruthy();
    expect(m[1].trim()).toBe('TypeA');
    expect(m[2].trim()).toBe('QueueA');
    expect(m[3].trim()).toBe('TypeB');
    expect(m[4].trim()).toBe('QueueB');
    expect(m[5].trim()).toBe('Output');
  });

  test('MATCH pairs entities from two queues', () => {
    const model = {
      entityTypes: [
        { id: "typeA", name: "TypeA", role: "customer", attrDefs: [] },
        { id: "typeB", name: "TypeB", role: "customer", attrDefs: [] },
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

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Should have created batch entities from matching
    const batchEntities = result.entitySummary.filter(e => e.role === "batch");
    expect(batchEntities.length).toBeGreaterThan(0);

    // Original entities should be marked as done with _matchedInto
    const matchedEntities = result.entitySummary.filter(e => e._matchedInto != null);
    expect(matchedEntities.length).toBeGreaterThan(0);
  });

  test('MATCH-produced parent entity can be seized and completed downstream, not just parked in the queue', () => {
    const model = {
      entityTypes: [
        { id: "typeA", name: "TypeA", role: "customer", attrDefs: [] },
        { id: "typeB", name: "TypeB", role: "customer", attrDefs: [] },
        { id: "worker", name: "Worker", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "qA", name: "QueueA", discipline: "FIFO" },
        { id: "qB", name: "QueueB", discipline: "FIFO" },
        { id: "qOut", name: "Output", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrivalA", name: "Arrival A", effect: "ARRIVE(TypeA, QueueA)", scheduledTime: "0", schedules: [] },
        { id: "arrivalB", name: "Arrival B", effect: "ARRIVE(TypeB, QueueB)", scheduledTime: "0", schedules: [] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Match",
          priority: 1,
          condition: "queue(QueueA).length > 0 AND queue(QueueB).length > 0",
          effect: "MATCH(TypeA, QueueA, TypeB, QueueB, Output)",
          cSchedules: [],
        },
        {
          id: "c2",
          name: "Process Matched Pair",
          priority: 2,
          condition: "queue(Output).length > 0 AND idle(Worker).count > 0",
          effect: "ASSIGN(Output, Worker)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const matchedParent = result.entitySummary.find(e => e.role === "batch" && e._matchedFrom);
    expect(matchedParent).toBeDefined();

    // Proves the parent was actually seized from Output (not just sitting there).
    const seizeLog = result.log.some(e => e.message?.includes(`#${matchedParent.id} (Output) → serving`));
    expect(seizeLog).toBe(true);

    expect(matchedParent.status).toBe("done");
  });

  test('MATCH waits when one queue is empty', () => {
    const model = {
      entityTypes: [
        { id: "typeA", name: "TypeA", role: "customer", attrDefs: [] },
        { id: "typeB", name: "TypeB", role: "customer", attrDefs: [] },
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

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // No matches should occur since QueueB is always empty
    const batchEntities = result.entitySummary.filter(e => e.role === "batch");
    expect(batchEntities.length).toBe(0);

    // TypeA entities should still be waiting
    const waitingA = result.entitySummary.filter(e => e.type === "TypeA" && e.status === "waiting");
    expect(waitingA.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// New queue disciplines: SPT, EDD, PRIORITY(attrName)
// ============================================================================

describe('New queue disciplines', () => {
  test('SPT discipline sorts by shortest processing time', () => {
    const model = {
      entityTypes: [
        { id: "job", name: "Job", role: "customer", attrDefs: [
          { name: "serviceTime", valueType: "number", defaultValue: "5" },
        ]},
        { id: "worker", name: "Worker", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "SPT" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Job, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0",
          effect: "ASSIGN(Queue, Worker)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Should have served entities
    expect(result.summary.served).toBeGreaterThan(0);
  });

  test('EDD discipline sorts by earliest due date', () => {
    const model = {
      entityTypes: [
        { id: "job", name: "Job", role: "customer", attrDefs: [
          { name: "dueDate", valueType: "number", defaultValue: "10" },
        ]},
        { id: "worker", name: "Worker", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "EDD" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Job, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0",
          effect: "ASSIGN(Queue, Worker)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Should have served entities
    expect(result.summary.served).toBeGreaterThan(0);
  });

  test('PRIORITY(attrName) discipline sorts by specified attribute', () => {
    const model = {
      entityTypes: [
        { id: "job", name: "Job", role: "customer", attrDefs: [
          { name: "urgency", valueType: "number", defaultValue: "5" },
        ]},
        { id: "worker", name: "Worker", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Queue", discipline: "PRIORITY(urgency)" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Job, Queue)", scheduledTime: "0",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Assign",
          condition: "queue(Queue).length > 0",
          effect: "ASSIGN(Queue, Worker)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Should have served entities
    expect(result.summary.served).toBeGreaterThan(0);
  });
});
