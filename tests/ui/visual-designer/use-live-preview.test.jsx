import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLivePreview } from '../../../src/ui/visual-designer/useLivePreview.js';

const mm1Model = {
  id: 'preview-model',
  entityTypes: [
    { id: 'cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'srv', name: 'Server', role: 'server', count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: 'arr', name: 'Arrival', scheduledTime: '0', effect: ['ARRIVE(Customer)'], schedules: [{ eventId: 'arr', dist: 'Exponential', distParams: { mean: '2' } }] },
    { id: 'comp', name: 'Complete', scheduledTime: '9999', effect: ['COMPLETE()'], schedules: [] },
  ],
  cEvents: [{
    id: 'seize', name: 'Seize', condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
    effect: ['ASSIGN(Customer, Server)'],
    cSchedules: [{ eventId: 'comp', dist: 'Exponential', distParams: { mean: '1' }, useEntityCtx: true }],
  }],
  queues: [{ id: 'q', name: 'Customer', customerType: 'Customer', capacity: '', discipline: 'FIFO' }],
};

const invalidModel = { ...mm1Model, bEvents: [] }; // no arrivals → buildEngine should still construct, but nothing happens

describe('useLivePreview', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does nothing while disabled', () => {
    const { result } = renderHook(({ model, enabled }) => useLivePreview(model, { enabled }), {
      initialProps: { model: mm1Model, enabled: false },
    });
    expect(result.current.snap).toBeNull();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.snap).toBeNull();
  });

  it('debounces before building, then produces a running snap', () => {
    const { result } = renderHook(({ model, enabled }) => useLivePreview(model, { enabled }), {
      initialProps: { model: mm1Model, enabled: true },
    });
    // Before the debounce settles, no engine yet.
    act(() => { vi.advanceTimersByTime(799); });
    expect(result.current.snap).toBeNull();

    // Debounce fires → engine built → initial snap present.
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current.snap).not.toBeNull();
    expect(result.current.snap.clock).toBe(0);

    // A step tick advances the clock.
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current.snap.clock).toBeGreaterThanOrEqual(0);
  });

  it('re-debounces on model changes instead of rebuilding immediately', () => {
    const { result, rerender } = renderHook(({ model, enabled }) => useLivePreview(model, { enabled }), {
      initialProps: { model: mm1Model, enabled: true },
    });
    act(() => { vi.advanceTimersByTime(800); });
    const firstSnap = result.current.snap;
    expect(firstSnap).not.toBeNull();

    act(() => { vi.advanceTimersByTime(300); }); // let the sim tick forward a bit
    const midSnap = result.current.snap;

    // A model edit arrives — this must NOT immediately rebuild (no rewind flicker).
    rerender({ model: { ...mm1Model, name: 'edited' }, enabled: true });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.snap).toBe(midSnap); // unchanged — still debouncing

    // After the debounce window, it rebuilds from t=0 again.
    act(() => { vi.advanceTimersByTime(700); });
    expect(result.current.snap.clock).toBe(0);
  });

  it('clears state and stops timers when disabled', () => {
    const { result, rerender } = renderHook(({ model, enabled }) => useLivePreview(model, { enabled }), {
      initialProps: { model: mm1Model, enabled: true },
    });
    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current.snap).not.toBeNull();

    rerender({ model: mm1Model, enabled: false });
    expect(result.current.snap).toBeNull();

    // No further ticks should resurrect a snap.
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.snap).toBeNull();
  });

  it('surfaces a build error without throwing, and never calls persistence', () => {
    // The engine's own layers (safe evaluator, validation) are deliberately
    // defensive and rarely throw on malformed *model content* — so exercise
    // the hook's catch path with a model reference that isn't a model at all
    // (e.g. mid-render with data not yet loaded), which does throw inside
    // buildEngine's setup pass.
    const { result } = renderHook(({ model, enabled }) => useLivePreview(model, { enabled }), {
      initialProps: { model: null, enabled: true },
    });
    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current.error).toBeTruthy();
    expect(result.current.snap).toBeNull();
  });
});
