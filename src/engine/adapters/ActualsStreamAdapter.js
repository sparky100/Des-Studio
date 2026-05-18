// engine/adapters/ActualsStreamAdapter.js
// Receives actual start-time updates from an external system (e.g. a theatre
// management system) and applies them to the engine's FEL via updateScheduledTime().
//
// Source config shape (dataSources[]):
//   {
//     id: "ds_actuals",
//     type: "actualsStream",
//     url: "wss://...",
//     authHeader: "Authorization",        // optional
//     authSecret: "{{env.TOKEN}}",        // optional; already resolved by registry
//   }
//
// Expected WebSocket message format (JSON):
//   { "entityId": "Alice",  "actualTime": "2026-05-18T09:05:00" }
//   { "entityId": "Bob",    "actualTime": 65 }
//   { "type": "batch", "updates": [{ "entityId": "...", "actualTime": "..." }] }
//
// actualTime may be a plain sim-time number, HH:MM, or ISO 8601 datetime.
// ISO/HH:MM timestamps require an epoch to be set on the model.

import { parseTimeInput } from '../clockUtils.js';

export class ActualsStreamAdapter {
  constructor(source) {
    this._source = source;
    this._engine = null;
    this._epoch  = null;
    this._timeUnit = 'minutes';
    this._ws     = null;
    this._queue  = []; // buffered updates received before engine is attached
  }

  /**
   * Attach a running engine instance. Flushes any buffered updates immediately.
   */
  attachEngine(engine, epoch = '', timeUnit = 'minutes') {
    this._engine   = engine;
    this._epoch    = epoch;
    this._timeUnit = timeUnit;
    for (const update of this._queue) this._applyUpdate(update);
    this._queue = [];
  }

  /**
   * Open the WebSocket connection and start receiving updates.
   */
  connect() {
    if (!this._source.url || this._ws) return;
    try {
      this._ws = new WebSocket(this._source.url);
      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'batch' && Array.isArray(msg.updates)) {
            msg.updates.forEach(u => this._handle(u));
          } else {
            this._handle(msg);
          }
        } catch { /* malformed message — ignore */ }
      };
    } catch { /* WebSocket not available (e.g. test env) */ }
  }

  /**
   * Push an actual-time update directly (used in tests and non-WebSocket scenarios).
   */
  pushUpdate(entityId, actualTime) {
    this._handle({ entityId, actualTime });
  }

  _handle(update) {
    if (!update?.entityId) return;
    this._applyUpdate(update);
  }

  _applyUpdate({ entityId, actualTime }) {
    const simTime = parseTimeInput(actualTime, this._epoch || null, this._timeUnit);
    if (simTime == null || !Number.isFinite(simTime)) return;
    if (this._engine) {
      this._engine.updateScheduledTime(entityId, simTime);
    } else {
      this._queue.push({ entityId, actualTime });
    }
  }

  dispose() {
    if (this._ws) {
      try { this._ws.close(); } catch { /* ignore */ }
      this._ws = null;
    }
    this._engine = null;
    this._queue  = [];
  }
}
