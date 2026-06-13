// resolve-inline-schedules.test.js
//
// Phase 0: confirm resolveInlineSchedules() semantics BEFORE any model migration.
//
// Covers:
//  1. scheduleRef present + rows [] + schedulesMap provided → rows resolved
//  2. scheduleRef present + rows [] + no schedulesMap      → 0 arrivals, no crash
//  3. scheduleRef present + rows already filled            → not overwritten (idempotent)
//  4. no scheduleRef                                       → entry unchanged
//  5. unknown scheduleRef (not in map)                     → 0 arrivals, no crash
//  6. engine integration: scheduleRef + schedulesMap delivers correct arrivals
//  7. engine integration: scheduleRef + no schedulesMap delivers 0 arrivals (graceful)
//  8. multi-event schedule: each bEvent gets its own rows via compound key

import { describe, test, expect, beforeEach } from 'vitest';
import { resolveInlineSchedules, buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

// ── Unit tests for resolveInlineSchedules ─────────────────────────────────────

describe('resolveInlineSchedules — unit', () => {
  const ROWS_A = [
    { time: 10, attrs: { train_id: 'HL0001', route_group: 'wcml' } },
    { time: 20, attrs: { train_id: 'HL0002', route_group: 'wcml' } },
  ];
  const SCHEDULE_UUID = '3f2a9b1c-0000-0000-0000-000000000001';

  const makeModel = (schedules) => ({
    bEvents: [{ id: 'b_arrive', schedules }],
  });

  test('resolves rows when scheduleRef present, rows empty, and schedulesMap provided', () => {
    const model = makeModel([{ eventId: 'b_arrive', scheduleRef: SCHEDULE_UUID, rows: [] }]);
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive', rows: ROWS_A } };

    const result = resolveInlineSchedules(model, schedulesMap);

    expect(result.bEvents[0].schedules[0].rows).toEqual(ROWS_A);
    expect(result.bEvents[0].schedules[0].scheduleRef).toBe(SCHEDULE_UUID);
  });

  test('returns model unchanged when no schedulesMap provided (backward compatibility)', () => {
    const model = makeModel([{ eventId: 'b_arrive', scheduleRef: SCHEDULE_UUID, rows: [] }]);

    const result = resolveInlineSchedules(model);

    // rows remain empty — 0 arrivals, no crash
    expect(result.bEvents[0].schedules[0].rows).toEqual([]);
    expect(result).toBe(model); // same reference — no copy made
  });

  test('returns model unchanged when schedulesMap is empty object', () => {
    const model = makeModel([{ eventId: 'b_arrive', scheduleRef: SCHEDULE_UUID, rows: [] }]);

    const result = resolveInlineSchedules(model, {});

    expect(result).toBe(model);
  });

  test('schedulesMap always wins over pre-populated rows (named-schedule update)', () => {
    const existingRows = [{ time: 5, attrs: { train_id: 'HL0099' } }];
    const model = makeModel([{ eventId: 'b_arrive', scheduleRef: SCHEDULE_UUID, rows: existingRows }]);
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive', rows: ROWS_A } };

    const result = resolveInlineSchedules(model, schedulesMap);

    // schedulesMap rows override any stale inline rows from a prior import
    expect(result.bEvents[0].schedules[0].rows).toEqual(ROWS_A);
  });

  test('entry without scheduleRef is left untouched', () => {
    const distEntry = { eventId: 'b_arrive', dist: 'Exponential', distParams: { rate: 0.5 } };
    const model = makeModel([distEntry]);
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive', rows: ROWS_A } };

    const result = resolveInlineSchedules(model, schedulesMap);

    expect(result.bEvents[0].schedules[0]).toEqual(distEntry);
  });

  test('unknown scheduleRef (not in map) leaves rows empty — 0 arrivals, no crash', () => {
    const model = makeModel([{ eventId: 'b_arrive', scheduleRef: 'unknown-uuid', rows: [] }]);
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive', rows: ROWS_A } };

    const result = resolveInlineSchedules(model, schedulesMap);

    expect(result.bEvents[0].schedules[0].rows).toEqual([]);
  });

  test('is a pure function — does not mutate the input model', () => {
    const model = makeModel([{ eventId: 'b_arrive', scheduleRef: SCHEDULE_UUID, rows: [] }]);
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive', rows: ROWS_A } };
    const originalSchedules = model.bEvents[0].schedules;

    resolveInlineSchedules(model, schedulesMap);

    // original model is not mutated
    expect(model.bEvents[0].schedules[0].rows).toEqual([]);
    expect(model.bEvents[0].schedules).toBe(originalSchedules);
  });

  test('model with no bEvents returns unchanged', () => {
    const model = { bEvents: [] };
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive', rows: ROWS_A } };

    const result = resolveInlineSchedules(model, schedulesMap);

    expect(result.bEvents).toEqual([]);
  });

  test('multi-event: each bEvent resolves its own rows via compound key', () => {
    const ROWS_B = [{ time: 30, attrs: { train_id: 'SW0001' } }];
    const model = {
      bEvents: [
        { id: 'b_arrive_a', schedules: [{ eventId: 'b_arrive_a', scheduleRef: SCHEDULE_UUID, rows: [] }] },
        { id: 'b_arrive_b', schedules: [{ eventId: 'b_arrive_b', scheduleRef: SCHEDULE_UUID, rows: [] }] },
      ],
    };
    // buildSchedulesMap-style compound keys
    const schedulesMap = {
      [SCHEDULE_UUID]: { eventId: 'b_arrive_a', rows: ROWS_A },           // plain key (first event)
      [`${SCHEDULE_UUID}:b_arrive_a`]: { eventId: 'b_arrive_a', rows: ROWS_A },
      [`${SCHEDULE_UUID}:b_arrive_b`]: { eventId: 'b_arrive_b', rows: ROWS_B },
    };

    const result = resolveInlineSchedules(model, schedulesMap);

    expect(result.bEvents[0].schedules[0].rows).toEqual(ROWS_A);
    expect(result.bEvents[1].schedules[0].rows).toEqual(ROWS_B);
  });

  test('multi-event: falls back to plain key when compound key absent', () => {
    const model = {
      bEvents: [
        { id: 'b_arrive_a', schedules: [{ eventId: 'b_arrive_a', scheduleRef: SCHEDULE_UUID, rows: [] }] },
      ],
    };
    // Only plain key — old format
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive_a', rows: ROWS_A } };

    const result = resolveInlineSchedules(model, schedulesMap);

    expect(result.bEvents[0].schedules[0].rows).toEqual(ROWS_A);
  });
});

// ── Engine integration tests ──────────────────────────────────────────────────

// makeRefModel builds a model after ADR-016 migration:
// bEvent has scheduleRef + rows:[] — no inline data.
// scheduledTime is '99999' so the event never fires within maxSimTime
// unless resolveInlineSchedules() populates rows[] (phantom-elimination then
// advances scheduledTime to rows[0].time).
function makeRefModel(scheduleRef) {
  return {
    entityTypes: [
      {
        id: 'et_train', name: 'Train', role: 'customer', count: 0,
        attrDefs: [
          { name: 'train_id', valueType: 'string', defaultValue: '', mutable: true },
          { name: 'route_group', valueType: 'string', defaultValue: '', mutable: true },
        ],
      },
      { id: 'et_platform', name: 'Platform', role: 'server', count: '2', attrDefs: [] },
    ],
    queues: [{ id: 'q_approach', name: 'Approach Queue', customerType: 'Train', discipline: 'FIFO' }],
    stateVariables: [],
    bEvents: [
      {
        id: 'b_arrive',
        name: 'Train Arrives',
        // Use a large scheduledTime so the event never fires within maxSimTime (200)
        // when rows[] is empty. resolveInlineSchedules populates rows[] BEFORE FEL init,
        // so phantom-elimination then advances scheduledTime to rows[0].time.
        scheduledTime: '99999',
        effect: 'ARRIVE(Train, Approach Queue)',
        schedules: [{
          eventId: 'b_arrive',
          // scheduleRef present, rows: [] — the engine must resolve via schedulesMap
          scheduleRef,
          rows: [],
        }],
      },
      { id: 'b_done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [{
      id: 'c_board',
      name: 'Board',
      priority: 1,
      condition: 'queue(Approach Queue).length > 0 AND idle(Platform).count > 0',
      effect: 'ASSIGN(Approach Queue, Platform)',
      cSchedules: [{
        eventId: 'b_done',
        dist: 'Fixed',
        distParams: { value: '1' },
        useEntityCtx: true,
      }],
    }],
  };
}

describe('Engine integration — scheduleRef with schedulesMap', () => {
  const SCHEDULE_UUID = '3f2a9b1c-0000-0000-0000-000000000002';

  const ROWS = [
    { time: 10, attrs: { train_id: 'HL0001', route_group: 'wcml' } },
    { time: 25, attrs: { train_id: 'HL0002', route_group: 'wcml' } },
    { time: 50, attrs: { train_id: 'HL0003', route_group: 'caledonian' } },
  ];

  test('delivers correct number of arrivals when schedulesMap resolves the ref', () => {
    const model = makeRefModel(SCHEDULE_UUID);
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive', rows: ROWS } };

    const engine = buildEngine(model, 42, 0, 200, null, 5000, 500, false, undefined, { schedulesMap });
    const { summary } = engine.runAll();

    expect(summary.served).toBe(3);
  });

  test('arrives at correct times from schedulesMap rows', () => {
    const model = makeRefModel(SCHEDULE_UUID);
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive', rows: ROWS } };

    const engine = buildEngine(model, 42, 0, 200, null, 5000, 500, false, undefined, { schedulesMap });
    const { log } = engine.runAll();

    const arriveTimes = log
      .filter(e => e.phase === 'B' && e.event?.name === 'Train Arrives' && !e.skipped)
      .map(e => e.time);

    expect(arriveTimes.length).toBe(3);
    expect(arriveTimes[0]).toBeCloseTo(10, 1);
    expect(arriveTimes[1]).toBeCloseTo(25, 1);
    expect(arriveTimes[2]).toBeCloseTo(50, 1);
  });

  test('per-arrival attributes are assigned from schedulesMap rows', () => {
    const model = makeRefModel(SCHEDULE_UUID);
    const schedulesMap = { [SCHEDULE_UUID]: { eventId: 'b_arrive', rows: ROWS } };

    const engine = buildEngine(model, 42, 0, 200, null, 5000, 500, false, undefined, { schedulesMap });
    const { entitySummary } = engine.runAll();

    const hl0001 = entitySummary.find(e => e.attrs?.train_id === 'HL0001');
    expect(hl0001).toBeDefined();
    expect(hl0001.attrs.route_group).toBe('wcml');

    const hl0003 = entitySummary.find(e => e.attrs?.train_id === 'HL0003');
    expect(hl0003).toBeDefined();
    expect(hl0003.attrs.route_group).toBe('caledonian');
  });
});

describe('Engine integration — scheduleRef with NO schedulesMap (graceful fallback)', () => {
  const SCHEDULE_UUID = '3f2a9b1c-0000-0000-0000-000000000003';

  test('engine runs without crash when scheduleRef unresolved (0 arrivals)', () => {
    const model = makeRefModel(SCHEDULE_UUID);

    // No schedulesMap — rows[] stays empty
    const engine = buildEngine(model, 42, 0, 200);
    expect(() => engine.runAll()).not.toThrow();
  });

  test('produces 0 arrivals when scheduleRef is present but unresolved', () => {
    const model = makeRefModel(SCHEDULE_UUID);

    const engine = buildEngine(model, 42, 0, 200);
    const { summary } = engine.runAll();

    // bEvent scheduledTime='99999' — never fires within maxSimTime=200
    expect(summary.served).toBe(0);
    expect(summary.total).toBe(0);  // total customers created
  });

  test('produces 0 arrivals when schedulesMap is provided but ref is unknown', () => {
    const model = makeRefModel(SCHEDULE_UUID);
    // schedulesMap has a different UUID — SCHEDULE_UUID won't be found
    const schedulesMap = { 'different-uuid': { eventId: 'b_arrive', rows: [{ time: 5, attrs: {} }] } };

    const engine = buildEngine(model, 42, 0, 200, null, 5000, 500, false, undefined, { schedulesMap });
    const { summary } = engine.runAll();

    expect(summary.served).toBe(0);
    expect(summary.total).toBe(0);
  });
});
