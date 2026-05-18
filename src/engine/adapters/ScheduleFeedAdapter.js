// engine/adapters/ScheduleFeedAdapter.js
// Fetches a list of planned activities from a REST endpoint and converts them
// to a rows[] array (the planned-arrival schedule format) using wallToSim().
//
// Source config shape (dataSources[]):
//   {
//     id: "ds_theatre",
//     type: "scheduleFeed",
//     url: "https://...",
//     authHeader: "Authorization",        // optional
//     authSecret: "{{env.TOKEN}}",        // optional; already resolved by registry
//     entityType: "Patient",              // name of the arriving entity type
//     targetBEventId: "b_patient_arrives",
//     timeField: "startTime",             // dot-notation path into each activity object
//     attrMap: {                          // API field -> entity attribute name
//       "patientName": "entityId",
//       "surgeryType": "surgery_type"
//     }
//   }

import { parseTimeInput } from '../clockUtils.js';

async function fetchWithRetry(url, headers, maxAttempts = 3) {
  let lastErr;
  let delay = 2000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    } catch (err) {
      // Network / timeout error — retry with backoff
      lastErr = err;
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
  throw lastErr;
}

function getField(obj, path) {
  if (!path || obj == null) return undefined;
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

export class ScheduleFeedAdapter {
  constructor(source) {
    this._source = source;
    this._rows = null;
  }

  _buildHeaders() {
    if (!this._source.authHeader || !this._source.authSecret) return {};
    return { [this._source.authHeader]: this._source.authSecret };
  }

  /**
   * Fetch the schedule feed and convert activities to rows[].
   * @param {string} epoch  model.epoch ISO string — required for timestamp conversion
   * @param {string} timeUnit  model.timeUnit
   */
  async prefetch(epoch, timeUnit = 'minutes') {
    const data = await fetchWithRetry(this._source.url, this._buildHeaders());

    const activities = Array.isArray(data)
      ? data
      : (Array.isArray(data.activities) ? data.activities : Object.values(data)[0]);

    if (!Array.isArray(activities)) {
      throw new Error(`ScheduleFeedAdapter: expected array of activities from ${this._source.url}`);
    }

    const timeField = this._source.timeField || 'time';
    const attrMap   = this._source.attrMap || {};

    this._rows = [];
    for (const activity of activities) {
      const rawTime = getField(activity, timeField);
      if (rawTime == null) continue;

      const simTime = parseTimeInput(rawTime, epoch || null, timeUnit);
      if (simTime == null || !Number.isFinite(simTime)) continue;

      // Map API fields to entity attrs
      const attrs = {};
      for (const [apiField, attrName] of Object.entries(attrMap)) {
        const val = getField(activity, apiField);
        if (val != null) attrs[attrName] = val;
      }

      this._rows.push({ time: simTime, attrs });
    }

    // Sort chronologically
    this._rows.sort((a, b) => a.time - b.time);
  }

  /** Returns the converted rows[] or null if not yet fetched. */
  getRows() {
    return this._rows;
  }

  dispose() {
    this._rows = null;
  }
}
