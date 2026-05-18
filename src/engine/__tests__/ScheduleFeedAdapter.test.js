import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScheduleFeedAdapter } from '../adapters/ScheduleFeedAdapter.js';

const EPOCH = '2026-05-18T08:00:00';

function mockFetch(data, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

describe('ScheduleFeedAdapter', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('prefetch converts ISO timestamps to sim time', async () => {
    global.fetch = mockFetch([
      { startTime: '2026-05-18T08:30:00', patientName: 'Alice', surgeryType: 'hip' },
      { startTime: '2026-05-18T10:45:00', patientName: 'Bob',   surgeryType: 'knee' },
    ]);

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_theatre',
      type: 'scheduleFeed',
      url: 'https://example.com/schedule',
      entityType: 'Patient',
      targetBEventId: 'b_arrives',
      timeField: 'startTime',
      attrMap: { patientName: 'entityId', surgeryType: 'surgery_type' },
    });

    await adapter.prefetch(EPOCH, 'minutes');
    const rows = adapter.getRows();

    expect(rows).toHaveLength(2);
    expect(rows[0].time).toBe(30);
    expect(rows[0].attrs.entityId).toBe('Alice');
    expect(rows[0].attrs.surgery_type).toBe('hip');
    expect(rows[1].time).toBe(165);
    expect(rows[1].attrs.entityId).toBe('Bob');
  });

  test('prefetch converts HH:MM timestamps to sim time', async () => {
    global.fetch = mockFetch([
      { time: '08:30', name: 'Alice' },
      { time: '09:00', name: 'Bob' },
    ]);

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_x',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
      timeField: 'time',
      attrMap: { name: 'entityId' },
    });

    await adapter.prefetch(EPOCH, 'minutes');
    const rows = adapter.getRows();
    expect(rows[0].time).toBe(30);
    expect(rows[1].time).toBe(60);
  });

  test('prefetch accepts plain numeric sim times', async () => {
    global.fetch = mockFetch([{ time: 10 }, { time: 5 }]);

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_y',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
    });

    await adapter.prefetch(EPOCH, 'minutes');
    const rows = adapter.getRows();
    expect(rows).toHaveLength(2);
    expect(rows[0].time).toBe(5); // sorted
    expect(rows[1].time).toBe(10);
  });

  test('sorts rows chronologically', async () => {
    global.fetch = mockFetch([
      { time: 30 }, { time: 10 }, { time: 20 },
    ]);

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_z',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
    });

    await adapter.prefetch('', 'minutes');
    const times = adapter.getRows().map(r => r.time);
    expect(times).toEqual([10, 20, 30]);
  });

  test('skips activities with missing or invalid time field', async () => {
    global.fetch = mockFetch([
      { time: null },
      { time: 'not-a-date' },
      { time: 15 },
    ]);

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_a',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
    });

    await adapter.prefetch('', 'minutes');
    expect(adapter.getRows()).toHaveLength(1);
    expect(adapter.getRows()[0].time).toBe(15);
  });

  test('accepts { activities: [...] } response envelope', async () => {
    global.fetch = mockFetch({ activities: [{ time: 5 }, { time: 10 }] });

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_b',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
    });

    await adapter.prefetch('', 'minutes');
    expect(adapter.getRows()).toHaveLength(2);
  });

  test('throws when response is not an array of activities', async () => {
    global.fetch = mockFetch({ total: 0, meta: {} });

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_c',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
    });

    await expect(adapter.prefetch('', 'minutes')).rejects.toThrow(/expected array/i);
  });

  test('throws on HTTP error', async () => {
    global.fetch = mockFetch(null, 401);

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_d',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
    });

    await expect(adapter.prefetch('', 'minutes')).rejects.toThrow(/HTTP 401/);
  });

  test('attaches auth header when authHeader/authSecret present', async () => {
    const spy = mockFetch([]);
    global.fetch = spy;

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_e',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
      authHeader: 'Authorization',
      authSecret: 'Bearer mytoken',
    });

    await adapter.prefetch('', 'minutes').catch(() => {});
    const [, opts] = spy.mock.calls[0];
    expect(opts.headers).toEqual({ Authorization: 'Bearer mytoken' });
  });

  test('dispose clears rows', async () => {
    global.fetch = mockFetch([{ time: 5 }]);

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_f',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
    });

    await adapter.prefetch('', 'minutes');
    expect(adapter.getRows()).toHaveLength(1);
    adapter.dispose();
    expect(adapter.getRows()).toBeNull();
  });

  test('resolves dot-notation timeField paths', async () => {
    global.fetch = mockFetch([
      { schedule: { start: 20 } },
      { schedule: { start: 10 } },
    ]);

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_g',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
      timeField: 'schedule.start',
    });

    await adapter.prefetch('', 'minutes');
    const times = adapter.getRows().map(r => r.time);
    expect(times).toEqual([10, 20]);
  });

  test('resolves dot-notation attrMap paths', async () => {
    global.fetch = mockFetch([
      { patient: { name: 'Alice' }, time: 5 },
    ]);

    const adapter = new ScheduleFeedAdapter({
      id: 'ds_h',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
      attrMap: { 'patient.name': 'entityId' },
    });

    await adapter.prefetch('', 'minutes');
    expect(adapter.getRows()[0].attrs.entityId).toBe('Alice');
  });

  test('getRows returns null before prefetch', () => {
    const adapter = new ScheduleFeedAdapter({
      id: 'ds_i',
      type: 'scheduleFeed',
      url: 'https://example.com/sched',
    });
    expect(adapter.getRows()).toBeNull();
  });
});
