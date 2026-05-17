// engine/adapters/mockAdapter.js — Deterministic stub for Vitest; never makes network calls

/**
 * Creates a mock adapter that returns configured values by field name.
 *
 * Usage:
 *   const mock = makeMockAdapter({ mean_interarrival_mins: 3.2 })
 *   registry.registerMock('ds_arrivals', mock)
 *
 * @param {Record<string, number | string | null>} fieldValues
 * @param {{ prefetchDelay?: number }} options
 */
export function makeMockAdapter(fieldValues = {}, options = {}) {
  let _fetched = false;
  let _callLog = [];

  return {
    async prefetch() {
      if (options.prefetchDelay) await new Promise(r => setTimeout(r, options.prefetchDelay));
      _fetched = true;
    },

    getLatest(field) {
      _callLog.push(field);
      if (!_fetched) return null;
      const val = fieldValues[field] ?? null;
      if (val == null) return null;
      const n = Number(val);
      return Number.isFinite(n) ? n : String(val);
    },

    dispose() {
      _fetched = false;
      _callLog = [];
    },

    // Test helpers
    wasFetched() { return _fetched; },
    callLog()    { return [..._callLog]; },
    setField(field, value) { fieldValues[field] = value; },
  };
}
