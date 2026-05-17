// engine/adapters/WebSocketAdapter.js — Live WebSocket adapter for rolling mode
//
// Connects to a WebSocket endpoint, waits for the first message (up to 10 s),
// then exposes the latest received value synchronously via getLatest().
// The connection stays open after prefetch() so values update continuously.
//
// Dependency injection: pass _wsFactory as the second option to override the
// global WebSocket constructor in tests (Node/jsdom environments).

/**
 * @param {object} obj  Nested object
 * @param {string} path Dot-notation field path, e.g. "data.mean_rate"
 * @returns {*} The value at the path, or undefined if not found
 */
function getByPath(obj, path) {
  if (obj == null || !path) return undefined;
  return path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

export class WebSocketAdapter {
  /**
   * @param {import('./types.js').DataSource} dataSource
   * @param {{ _wsFactory?: (url: string) => WebSocket }} [options]
   */
  constructor(dataSource, options = {}) {
    this._source    = dataSource;
    this._wsFactory = options._wsFactory || null;
    this._ws        = null;
    this._connected = false;
    this._lastMessage = null; // parsed JSON from the most recent message
    this._lastMessageTime = null; // Date.now() when last message received
  }

  /**
   * Opens the WebSocket connection and waits for the first message (10 s timeout).
   * After the first message arrives, resolves. The connection stays open.
   * @returns {Promise<void>}
   */
  async prefetch() {
    const WSClass = this._wsFactory || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!WSClass) {
      throw new Error('WebSocket not available in this environment');
    }

    const url = this._source.url;
    if (!url) {
      throw new Error(`WebSocketAdapter: dataSource "${this._source.id}" has no url`);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          // Timed out waiting for first message — resolve anyway so rolling mode
          // can start; getLatest() will return null until a message arrives.
          this._connected = true;
          resolve();
        }
      }, 10_000);

      const settle = (fn) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        fn();
      };

      try {
        this._ws = new WSClass(url);
      } catch (err) {
        settle(() => reject(err));
        return;
      }

      this._ws.onopen = () => {
        // Connection open — wait for first message before resolving
      };

      this._ws.onmessage = (event) => {
        try {
          this._lastMessage = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : event.data;
        } catch {
          // Non-JSON message — store raw string
          this._lastMessage = event.data;
        }
        this._lastMessageTime = Date.now();
        this._connected = true;

        // Resolve on first message
        settle(() => resolve());
      };

      this._ws.onerror = (err) => {
        settle(() => reject(new Error(`WebSocketAdapter: connection error for "${this._source.id}"`)));
      };

      this._ws.onclose = () => {
        // Connection closed — _connected stays true; getLatest() returns last value
      };
    });
  }

  /**
   * Returns the latest value for a field (dot-notation) from the last received message.
   * Returns null if no message has been received yet, or if the field is missing.
   * @param {string} field  Dot-notation path into the message payload, e.g. "mean_rate"
   * @returns {number | string | null}
   */
  getLatest(field) {
    if (this._lastMessage == null) return null;

    let raw;
    if (typeof this._lastMessage === 'object' && this._lastMessage !== null) {
      raw = getByPath(this._lastMessage, field);
    } else {
      // Scalar message — only return it if field is empty or '.'
      raw = this._lastMessage;
    }

    if (raw == null) return null;
    // Objects/arrays: return as-is (callers handle serialisation if needed)
    if (typeof raw === 'object') return raw;
    const n = Number(raw);
    return Number.isFinite(n) ? n : String(raw);
  }

  /**
   * Returns the timestamp (Date.now()) of the last received message, or null.
   * @returns {number | null}
   */
  getLastMessageTime() {
    return this._lastMessageTime;
  }

  /**
   * Closes the WebSocket connection.
   */
  dispose() {
    if (this._ws) {
      this._ws.onmessage = null;
      this._ws.onerror   = null;
      this._ws.onclose   = null;
      try { this._ws.close(); } catch { /* ignore */ }
      this._ws = null;
    }
    this._connected = false;
  }
}
