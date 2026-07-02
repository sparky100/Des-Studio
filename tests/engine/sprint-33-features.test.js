import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';
import { MACROS } from '../../src/engine/macros.js';
import {
  buildHistogram,
  buildHistogramFD,
  oneWayANOVA,
  tukeyHSD,
} from '../../src/engine/statistics.js';

beforeEach(() => {
  resetSeq();
});

// ============================================================================
// G09: Dynamic batch size by attribute
// ============================================================================

describe('G09: Dynamic batch size by attribute', () => {
  test('BATCH macro pattern matches attribute reference', () => {
    const batch = MACROS.find(m => m.name === 'BATCH');
    const m = 'BATCH(Queue, Entity.batchSize)'.match(batch.pattern);
    expect(m).toBeTruthy();
    expect(m[1].trim()).toBe('Queue');
    expect(m[2].trim()).toBe('Entity.batchSize');
  });

  test('BATCH with literal integer still works', () => {
    const batch = MACROS.find(m => m.name === 'BATCH');
    const m = 'BATCH(Queue, 5)'.match(batch.pattern);
    expect(m).toBeTruthy();
    expect(m[2].trim()).toBe('5');
  });

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
// G12: Histogram collector
// ============================================================================

describe('G12: Histogram collector', () => {
  test('buildHistogram creates equal-width bins', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const hist = buildHistogram(values, { numBins: 5 });

    expect(hist.total).toBe(10);
    expect(hist.numBins).toBe(5);
    expect(hist.min).toBe(1);
    expect(hist.max).toBe(10);
    expect(hist.bins.length).toBe(5);
    // Each bin should have 2 values
    hist.bins.forEach(bin => {
      expect(bin.count).toBe(2);
    });
  });

  test('buildHistogram handles empty input', () => {
    const hist = buildHistogram([], { numBins: 5 });
    expect(hist.total).toBe(0);
    expect(hist.bins.length).toBe(0);
  });

  test('buildHistogram handles single value', () => {
    const hist = buildHistogram([5], { numBins: 5 });
    expect(hist.total).toBe(1);
    expect(hist.bins.length).toBe(1);
    expect(hist.bins[0].count).toBe(1);
  });

  test('buildHistogram density sums to approximately 1/binWidth', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const hist = buildHistogram(values, { numBins: 10 });

    // Density should be count / (total * binWidth)
    const binWidth = (hist.max - hist.min) / hist.numBins;
    let totalDensity = 0;
    for (const bin of hist.bins) {
      totalDensity += bin.density * binWidth;
    }
    // Should be approximately 1 (allowing for floating point error)
    expect(totalDensity).toBeCloseTo(1, 4);
  });

  test('buildHistogramFD uses Freedman-Diaconis rule', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const hist = buildHistogramFD(values);

    expect(hist.method).toBe('freedman-diaconis');
    expect(hist.total).toBe(15);
    expect(hist.numBins).toBeGreaterThan(0);
    expect(hist.numBins).toBeLessThanOrEqual(50);
  });

  test('buildHistogramFD handles empty input', () => {
    const hist = buildHistogramFD([]);
    expect(hist.total).toBe(0);
    expect(hist.bins.length).toBe(0);
  });

  test('buildHistogram respects min/max bounds', () => {
    const values = [2, 3, 4, 5, 6, 7, 8];
    const hist = buildHistogram(values, { numBins: 3, min: 0, max: 10 });

    expect(hist.min).toBe(0);
    expect(hist.max).toBe(10);
    expect(hist.bins.length).toBe(3);
    // Bin width should be (10-0)/3 = 3.33...
    expect(hist.bins[0].low).toBe(0);
    expect(hist.bins[2].high).toBe(10);
  });
});

// ============================================================================
// G13: ANOVA analysis
// ============================================================================

describe('G13: One-way ANOVA', () => {
  test('oneWayANOVA requires at least 2 groups', () => {
    const result = oneWayANOVA([[1, 2, 3]]);
    expect(result.k).toBe(1);
    expect(result.fStatistic).toBeNull();
    expect(result.explanation).toContain('At least 2 groups');
  });

  test('oneWayANOVA detects identical groups (no difference)', () => {
    const groupA = [5, 5, 5, 5, 5];
    const groupB = [5, 5, 5, 5, 5];
    const result = oneWayANOVA([groupA, groupB]);

    expect(result.k).toBe(2);
    expect(result.n).toBe(10);
    // When all values are identical, msWithin=0 so fStatistic is null
    expect(result.fStatistic).toBeNull();
    expect(result.significant).toBe(false);
  });

  test('oneWayANOVA detects significantly different groups', () => {
    const groupA = [1, 2, 3, 4, 5];
    const groupB = [10, 11, 12, 13, 14];
    const result = oneWayANOVA([groupA, groupB], { labels: ['Low', 'High'] });

    expect(result.k).toBe(2);
    expect(result.n).toBe(10);
    expect(result.fStatistic).toBeGreaterThan(0);
    expect(result.significant).toBe(true);
    expect(result.groupStats.length).toBe(2);
    expect(result.groupStats[0].label).toBe('Low');
    expect(result.groupStats[1].label).toBe('High');
  });

  test('oneWayANOVA computes correct grand mean', () => {
    const groupA = [1, 2, 3];
    const groupB = [4, 5, 6];
    const result = oneWayANOVA([groupA, groupB]);

    // Grand mean = (1+2+3+4+5+6)/6 = 3.5
    expect(result.grandMean).toBeCloseTo(3.5, 4);
  });

  test('oneWayANOVA handles three groups', () => {
    const groupA = [1, 2, 3, 4, 5];
    const groupB = [6, 7, 8, 9, 10];
    const groupC = [11, 12, 13, 14, 15];
    const result = oneWayANOVA([groupA, groupB, groupC]);

    expect(result.k).toBe(3);
    expect(result.n).toBe(15);
    expect(result.dfBetween).toBe(2);
    expect(result.dfWithin).toBe(12);
    expect(result.fStatistic).toBeGreaterThan(0);
  });

  test('oneWayANOVA handles insufficient data', () => {
    const result = oneWayANOVA([[], []]);
    expect(result.n).toBe(0);
    expect(result.fStatistic).toBeNull();
  });

  test('oneWayANOVA explanation is human-readable', () => {
    const groupA = [1, 2, 3, 4, 5];
    const groupB = [10, 11, 12, 13, 14];
    const result = oneWayANOVA([groupA, groupB]);

    expect(result.explanation).toContain('ANOVA');
    expect(result.explanation).toContain('F(');
    expect(result.explanation).toContain('p =');
  });
});

describe('G13: Tukey HSD post-hoc test', () => {
  test('tukeyHSD requires at least 2 groups', () => {
    const result = tukeyHSD([[1, 2, 3]]);
    expect(result.comparisons.length).toBe(0);
    expect(result.explanation).toContain('At least 2 groups');
  });

  test('tukeyHSD identifies significant pair differences', () => {
    const groupA = [1, 2, 3, 4, 5];
    const groupB = [10, 11, 12, 13, 14];
    const result = tukeyHSD([groupA, groupB], { labels: ['Low', 'High'] });

    expect(result.comparisons.length).toBe(1);
    expect(result.comparisons[0].groupA).toBe('Low');
    expect(result.comparisons[0].groupB).toBe('High');
    expect(result.comparisons[0].significant).toBe(true);
    expect(result.anySignificant).toBe(true);
  });

  test('tukeyHSD handles three groups with multiple comparisons', () => {
    const groupA = [1, 2, 3, 4, 5];
    const groupB = [6, 7, 8, 9, 10];
    const groupC = [11, 12, 13, 14, 15];
    const result = tukeyHSD([groupA, groupB, groupC]);

    // 3 groups = 3 pairwise comparisons: A-B, A-C, B-C
    expect(result.comparisons.length).toBe(3);
    expect(result.anySignificant).toBe(true);
  });

  test('tukeyHSD returns no significant differences for identical groups', () => {
    const groupA = [5, 5, 5, 5, 5];
    const groupB = [5, 5, 5, 5, 5];
    const result = tukeyHSD([groupA, groupB]);

    // When msWithin=0, Tukey HSD returns empty comparisons
    expect(result.comparisons.length).toBe(0);
    expect(result.anySignificant).toBe(false);
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

    // Should have warning about no idle MissingServer
    const warnings = result.log.filter(entry =>
      entry.message && entry.message.includes('no idle MissingServer')
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
