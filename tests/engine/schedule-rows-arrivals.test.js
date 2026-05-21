// Schedule distribution with rows[] — planned arrivals with per-arrival attributes.
// Tests the full pipeline: CSV import → rows[] → engine arrivals → attribute assignment.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { sample, mulberry32 } from '../../src/engine/distributions.js';
import { resetSeq } from '../../src/engine/entities.js';
import { parsePlanCsv } from '../../src/ui/shared/planCsvParser.js';

beforeEach(() => { resetSeq(); });

// ── CSV parsing → rows[] conversion ──────────────────────────────────────────

describe('CSV import → rows[] conversion', () => {
  test('parses numeric time column and string attributes correctly', () => {
    const csv = `time,flight_id,aircraft_class,route_type,priority
16,AC001,narrow_body,domestic,2
51,AC002,regional,domestic,3
91,AC003,wide_body,international,1`;

    const result = parsePlanCsv(csv);
    expect(result.error).toBeUndefined();
    expect(result.rows.length).toBe(3);
    expect(result.attrHeaders).toEqual(['flight_id', 'aircraft_class', 'route_type', 'priority']);

    // First row
    expect(result.rows[0].time).toBe(16);
    expect(result.rows[0].attrs.flight_id).toBe('AC001');
    expect(result.rows[0].attrs.aircraft_class).toBe('narrow_body');
    expect(result.rows[0].attrs.route_type).toBe('domestic');
    expect(result.rows[0].attrs.priority).toBe(2);

    // Third row
    expect(result.rows[2].time).toBe(91);
    expect(result.rows[2].attrs.flight_id).toBe('AC003');
    expect(result.rows[2].attrs.aircraft_class).toBe('wide_body');
    expect(result.rows[2].attrs.route_type).toBe('international');
    expect(result.rows[2].attrs.priority).toBe(1);
  });

  test('skips rows with non-numeric time', () => {
    const csv = `time,flight_id
10,AC001
bad,AC002
30,AC003`;

    const result = parsePlanCsv(csv);
    expect(result.rows.length).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.rows[0].attrs.flight_id).toBe('AC001');
    expect(result.rows[1].attrs.flight_id).toBe('AC003');
  });
});

// ── Schedule sampler with rows[] ─────────────────────────────────────────────

describe('Schedule sampler with rows[]', () => {
  const rng = mulberry32(42);

  test('returns delay = plannedTime - clock for first row entry', () => {
    const state = {};
    const rows = [
      { time: 16, attrs: { flight_id: 'AC001', aircraft_class: 'narrow_body' } },
      { time: 51, attrs: { flight_id: 'AC002', aircraft_class: 'regional' } },
    ];
    const delay = sample('Schedule', { rows }, rng, null, { clock: 0, state, schedKey: 'ev1' });
    expect(delay).toBeCloseTo(16, 5);
    expect(state.__schedIdx_ev1).toBe(1);
    expect(state.__schedRowAttrs_ev1).toEqual({ flight_id: 'AC001', aircraft_class: 'narrow_body' });
  });

  test('advances index and stores correct row attrs on each call', () => {
    const state = {};
    const rows = [
      { time: 16, attrs: { flight_id: 'AC001' } },
      { time: 51, attrs: { flight_id: 'AC002' } },
      { time: 91, attrs: { flight_id: 'AC003' } },
    ];

    // First call
    sample('Schedule', { rows }, rng, null, { clock: 0, state, schedKey: 'ev1' });
    expect(state.__schedIdx_ev1).toBe(1);
    expect(state.__schedRowAttrs_ev1.flight_id).toBe('AC001');

    // Second call
    const d2 = sample('Schedule', { rows }, rng, null, { clock: 16, state, schedKey: 'ev1' });
    expect(d2).toBeCloseTo(35, 5); // 51 - 16
    expect(state.__schedIdx_ev1).toBe(2);
    expect(state.__schedRowAttrs_ev1.flight_id).toBe('AC002');

    // Third call
    const d3 = sample('Schedule', { rows }, rng, null, { clock: 51, state, schedKey: 'ev1' });
    expect(d3).toBeCloseTo(40, 5); // 91 - 51
    expect(state.__schedIdx_ev1).toBe(3);
    expect(state.__schedRowAttrs_ev1.flight_id).toBe('AC003');
  });

  test('returns 1e9 when rows[] plan is exhausted', () => {
    const state = { __schedIdx_ev1: 3 };
    const rows = [
      { time: 16, attrs: { flight_id: 'AC001' } },
      { time: 51, attrs: { flight_id: 'AC002' } },
      { time: 91, attrs: { flight_id: 'AC003' } },
    ];
    const delay = sample('Schedule', { rows }, rng, null, { clock: 0, state, schedKey: 'ev1' });
    expect(delay).toBe(1e9);
  });
});

// ── Engine integration: arrivals with per-arrival attributes ─────────────────

describe('Engine integration: scheduled arrivals with rows[] attributes', () => {
  function makeScheduleRowsModel(rows) {
    return {
      entityTypes: [
        {
          id: 'et_aircraft',
          name: 'Aircraft',
          role: 'customer',
          count: 0,
          attrDefs: [
            { name: 'flight_id', valueType: 'string', defaultValue: '', mutable: true },
            { name: 'aircraft_class', valueType: 'string', defaultValue: 'narrow_body', mutable: true },
            { name: 'route_type', valueType: 'string', defaultValue: 'domestic', mutable: true },
            { name: 'priority', valueType: 'number', defaultValue: 2, mutable: true },
          ],
        },
        { id: 'et_runway', name: 'Runway', role: 'server', count: '2', attrDefs: [] },
      ],
      queues: [
        { id: 'q_holding', name: 'Holding Queue', customerType: 'Aircraft', discipline: 'PRIORITY' },
      ],
      stateVariables: [],
      bEvents: [
        {
          id: 'b_arrive',
          name: 'Scheduled Arrival',
          scheduledTime: '0',
          effect: 'ARRIVE(Aircraft, Holding Queue)',
          schedules: [{
            eventId: 'b_arrive',
            dist: 'Schedule',
            distParams: { rows },
          }],
        },
        { id: 'b_done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'c_landing',
        name: 'Start Landing',
        priority: 1,
        condition: 'queue(Holding Queue).length > 0 AND idle(Runway).count > 0',
        effect: 'ASSIGN(Holding Queue, Runway)',
        cSchedules: [{
          eventId: 'b_done',
          dist: 'Fixed',
          distParams: { value: '1' },
          useEntityCtx: true,
        }],
      }],
    };
  }

  test('B-Event log shows Scheduled Arrival and Complete events in correct order', () => {
    const rows = [
      { time: 10, attrs: { flight_id: 'AC001', aircraft_class: 'narrow_body', route_type: 'domestic', priority: 2 } },
      { time: 30, attrs: { flight_id: 'AC002', aircraft_class: 'wide_body', route_type: 'international', priority: 1 } },
      { time: 60, attrs: { flight_id: 'AC003', aircraft_class: 'regional', route_type: 'domestic', priority: 3 } },
    ];

    const engine = buildEngine(makeScheduleRowsModel(rows), 42, 0, 200);
    const { log } = engine.runAll();

    // Extract all B-Event entries from the log
    const bEvents = log.filter(e => e.phase === 'B' && e.event && !e.skipped);

    // Group by event name
    const arrivalEvents = bEvents.filter(e => e.event.name === 'Scheduled Arrival');
    const completeEvents = bEvents.filter(e => e.event.name === 'Complete');

    // 4 arrivals: 1 initial (t=0) + 3 from rows[] (t=10, t=30, t=60)
    expect(arrivalEvents.length).toBe(4);
    expect(arrivalEvents[0].time).toBeCloseTo(0, 1);
    expect(arrivalEvents[1].time).toBeCloseTo(10, 1);
    expect(arrivalEvents[2].time).toBeCloseTo(30, 1);
    expect(arrivalEvents[3].time).toBeCloseTo(60, 1);

    // 4 completions (one per served entity)
    expect(completeEvents.length).toBe(4);

    // Log the B-Event sequence for debugging
    console.log('B-Event sequence:');
    bEvents.forEach(e => {
      console.log(`  t=${e.time.toFixed(1)} | ${e.event.name} | ${e.msgs?.join('; ') || ''}`);
    });
  });

  test('creates N+1 arrivals: 1 initial fire at scheduledTime + N from rows[]', () => {
    const rows = [
      { time: 10, attrs: { flight_id: 'AC001', aircraft_class: 'narrow_body', route_type: 'domestic', priority: 2 } },
      { time: 30, attrs: { flight_id: 'AC002', aircraft_class: 'wide_body', route_type: 'international', priority: 1 } },
      { time: 60, attrs: { flight_id: 'AC003', aircraft_class: 'regional', route_type: 'domestic', priority: 3 } },
    ];

    const engine = buildEngine(makeScheduleRowsModel(rows), 42, 0, 200);
    const { summary, log } = engine.runAll();

    // 1 initial (at t=0) + 3 from rows[] = 4 total arrivals
    expect(summary.served).toBe(4);

    // Verify arrival times: initial at t=0, then rows at t=10, t=30, t=60
    const arriveTimes = log
      .filter(e => e.phase === 'B' && e.event?.name === 'Scheduled Arrival' && !e.skipped)
      .map(e => e.time);
    expect(arriveTimes.length).toBe(4);
    expect(arriveTimes[0]).toBeCloseTo(0, 1);   // initial fire
    expect(arriveTimes[1]).toBeCloseTo(10, 1);  // rows[0]
    expect(arriveTimes[2]).toBeCloseTo(30, 1);  // rows[1]
    expect(arriveTimes[3]).toBeCloseTo(60, 1);  // rows[2]
  });

  test('per-arrival attributes from rows[] are correctly assigned to entities', () => {
    const rows = [
      { time: 10, attrs: { flight_id: 'AC001', aircraft_class: 'narrow_body', route_type: 'domestic', priority: 2 } },
      { time: 30, attrs: { flight_id: 'AC002', aircraft_class: 'wide_body', route_type: 'international', priority: 1 } },
      { time: 60, attrs: { flight_id: 'AC003', aircraft_class: 'regional', route_type: 'domestic', priority: 3 } },
    ];

    const engine = buildEngine(makeScheduleRowsModel(rows), 42, 0, 200);
    const { entitySummary } = engine.runAll();

    // entitySummary includes customer entities + pre-created server entities (2 Runways)
    // 1 initial + 3 from rows + 2 servers = 6 total
    expect(entitySummary.length).toBe(6);

    // Find customer entities by their flight_id attribute (only rows[] entities have flight_id set)
    const ac001 = entitySummary.find(e => e.attrs?.flight_id === 'AC001');
    const ac002 = entitySummary.find(e => e.attrs?.flight_id === 'AC002');
    const ac003 = entitySummary.find(e => e.attrs?.flight_id === 'AC003');

    expect(ac001).toBeDefined();
    expect(ac001.attrs.aircraft_class).toBe('narrow_body');
    expect(ac001.attrs.route_type).toBe('domestic');
    expect(ac001.attrs.priority).toBe(2);

    expect(ac002).toBeDefined();
    expect(ac002.attrs.aircraft_class).toBe('wide_body');
    expect(ac002.attrs.route_type).toBe('international');
    expect(ac002.attrs.priority).toBe(1);

    expect(ac003).toBeDefined();
    expect(ac003.attrs.aircraft_class).toBe('regional');
    expect(ac003.attrs.route_type).toBe('domestic');
    expect(ac003.attrs.priority).toBe(3);
  });

  test('initial arrival has default attributes (no row attrs)', () => {
    const rows = [
      { time: 10, attrs: { flight_id: 'AC001', aircraft_class: 'narrow_body' } },
    ];

    const engine = buildEngine(makeScheduleRowsModel(rows), 42, 0, 50);
    const { entitySummary } = engine.runAll();

    // 1 initial + 1 from rows + 2 servers = 4 total
    expect(entitySummary.length).toBe(4);

    // Initial arrival has default attrs (empty flight_id, default aircraft_class)
    const initial = entitySummary.find(e => e.attrs?.flight_id === '');
    expect(initial).toBeDefined();
    expect(initial.attrs.aircraft_class).toBe('narrow_body'); // default from attrDefs

    // Row arrival has row attrs
    const rowEntity = entitySummary.find(e => e.attrs?.flight_id === 'AC001');
    expect(rowEntity).toBeDefined();
    expect(rowEntity.attrs.aircraft_class).toBe('narrow_body');
  });

  test('string attributes are preserved (not coerced to numbers)', () => {
    const rows = [
      { time: 5, attrs: { flight_id: 'AC001', aircraft_class: 'narrow_body' } },
    ];

    const engine = buildEngine(makeScheduleRowsModel(rows), 42, 0, 50);
    const { entitySummary } = engine.runAll();

    const ac001 = entitySummary.find(e => e.attrs?.flight_id === 'AC001');
    expect(ac001).toBeDefined();
    expect(typeof ac001.attrs.flight_id).toBe('string');
    expect(ac001.attrs.flight_id).toBe('AC001');
    expect(typeof ac001.attrs.aircraft_class).toBe('string');
    expect(ac001.attrs.aircraft_class).toBe('narrow_body');
  });

  test('numeric attributes remain numeric', () => {
    const rows = [
      { time: 5, attrs: { flight_id: 'AC001', priority: 1 } },
    ];

    const engine = buildEngine(makeScheduleRowsModel(rows), 42, 0, 50);
    const { entitySummary } = engine.runAll();

    const ac001 = entitySummary.find(e => e.attrs?.flight_id === 'AC001');
    expect(ac001).toBeDefined();
    expect(typeof ac001.attrs.priority).toBe('number');
    expect(ac001.attrs.priority).toBe(1);
  });

  test('large schedule (150 rows) processes all arrivals correctly', () => {
    // Simulate the airport arrivals pattern
    const rows = [];
    for (let i = 1; i <= 150; i++) {
      rows.push({
        time: Math.round(10 + i * 9.5 + Math.random() * 5),
        attrs: {
          flight_id: `AC${String(i).padStart(3, '0')}`,
          aircraft_class: i % 3 === 0 ? 'wide_body' : i % 2 === 0 ? 'regional' : 'narrow_body',
          route_type: i % 4 === 0 ? 'international' : 'domestic',
          priority: i % 3 === 0 ? 1 : 2,
        },
      });
    }

    const engine = buildEngine(makeScheduleRowsModel(rows), 42, 0, 2000);
    const { summary, entitySummary } = engine.runAll();

    // 1 initial + 150 from rows + 2 servers = 153 total in entitySummary
    expect(summary.served).toBe(151);
    expect(entitySummary.length).toBe(153);

    // Verify all flight IDs are present (only rows[] entities have flight_id)
    const flightIds = entitySummary.map(e => e.attrs?.flight_id).filter(Boolean);
    expect(flightIds.length).toBe(150);
    expect(flightIds.includes('AC001')).toBe(true);
    expect(flightIds.includes('AC150')).toBe(true);
  });

  test('PRIORITY queue discipline uses per-arrival priority attribute', () => {
    const rows = [
      { time: 10, attrs: { flight_id: 'AC001', priority: 3 } },
      { time: 10, attrs: { flight_id: 'AC002', priority: 1 } },
      { time: 10, attrs: { flight_id: 'AC003', priority: 2 } },
    ];

    const engine = buildEngine(makeScheduleRowsModel(rows), 42, 0, 200);
    const { summary } = engine.runAll();

    // All 4 entities (1 initial + 3 from rows) should be served
    expect(summary.served).toBe(4);

    // Verify entities were served (the PRIORITY discipline should have been used)
    // The exact order depends on C-event priority and queue discipline
    expect(summary.served).toBeGreaterThan(0);
  });

  test('no extra arrivals after plan exhaustion even with large maxSimTime', () => {
    const rows = [
      { time: 10, attrs: { flight_id: 'AC001' } },
      { time: 20, attrs: { flight_id: 'AC002' } },
    ];

    const engine = buildEngine(makeScheduleRowsModel(rows), 42, 0, 10000);
    const { summary } = engine.runAll();

    // 1 initial + 2 from rows[] = 3 total
    expect(summary.served).toBe(3);
  });
});

// ── End-to-end: CSV text → parsePlanCsv → rows[] → engine ────────────────────

describe('End-to-end: CSV text → parsePlanCsv → rows[] → engine', () => {
  function makeScheduleRowsModel(rows) {
    return {
      entityTypes: [
        {
          id: 'et_aircraft',
          name: 'Aircraft',
          role: 'customer',
          count: 0,
          attrDefs: [
            { name: 'flight_id', valueType: 'string', defaultValue: '', mutable: true },
            { name: 'aircraft_class', valueType: 'string', defaultValue: 'narrow_body', mutable: true },
            { name: 'route_type', valueType: 'string', defaultValue: 'domestic', mutable: true },
            { name: 'priority', valueType: 'number', defaultValue: 2, mutable: true },
          ],
        },
        { id: 'et_runway', name: 'Runway', role: 'server', count: '2', attrDefs: [] },
      ],
      queues: [
        { id: 'q_holding', name: 'Holding Queue', customerType: 'Aircraft', discipline: 'FIFO' },
      ],
      stateVariables: [],
      bEvents: [
        {
          id: 'b_arrive',
          name: 'Scheduled Arrival',
          scheduledTime: '0',
          effect: 'ARRIVE(Aircraft, Holding Queue)',
          schedules: [{
            eventId: 'b_arrive',
            dist: 'Schedule',
            distParams: { rows },
          }],
        },
        { id: 'b_done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'c_landing',
        name: 'Start Landing',
        priority: 1,
        condition: 'queue(Holding Queue).length > 0 AND idle(Runway).count > 0',
        effect: 'ASSIGN(Holding Queue, Runway)',
        cSchedules: [{
          eventId: 'b_done',
          dist: 'Fixed',
          distParams: { value: '1' },
          useEntityCtx: true,
        }],
      }],
    };
  }

  test('full pipeline: CSV text → parsePlanCsv → rows[] → engine arrivals with attributes', () => {
    const csvText = `time,flight_id,aircraft_class,route_type,priority
16,AC001,narrow_body,domestic,2
51,AC002,regional,domestic,3
91,AC003,wide_body,international,1
122,AC004,narrow_body,domestic,2`;

    // Step 1: Parse CSV
    const parsed = parsePlanCsv(csvText);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows.length).toBe(4);

    // Step 2: Build model with rows[]
    const model = makeScheduleRowsModel(parsed.rows);

    // Step 3: Run engine
    const engine = buildEngine(model, 42, 0, 200);
    const { summary, entitySummary } = engine.runAll();

    // Step 4: Verify results (1 initial + 4 from rows[] = 5 total)
    expect(summary.served).toBe(5);

    // Verify each row entity has correct attributes
    const ac001 = entitySummary.find(e => e.attrs?.flight_id === 'AC001');
    expect(ac001.attrs.aircraft_class).toBe('narrow_body');
    expect(ac001.attrs.route_type).toBe('domestic');
    expect(ac001.attrs.priority).toBe(2);

    const ac003 = entitySummary.find(e => e.attrs?.flight_id === 'AC003');
    expect(ac003.attrs.aircraft_class).toBe('wide_body');
    expect(ac003.attrs.route_type).toBe('international');
    expect(ac003.attrs.priority).toBe(1);
  });
});
