// engine/adapters/RestAdapter.js — Poll-based REST adapter with TTL cache and exponential backoff retry

export class AdapterFetchError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'AdapterFetchError';
    this.status = status;
  }
}

function getField(obj, path) {
  if (!path || obj == null) return obj;
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

async function fetchWithRetry(url, headers, maxAttempts = 3) {
  let lastErr;
  let delay = 2000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (res.status >= 400 && res.status < 500) {
        throw new AdapterFetchError(`HTTP ${res.status} (client error) from ${url}`, res.status);
      }
      if (!res.ok) {
        throw new AdapterFetchError(`HTTP ${res.status} from ${url}`, res.status);
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new AdapterFetchError('Malformed JSON response', null);
      }
      return data;
    } catch (err) {
      if (err instanceof AdapterFetchError && err.status !== null && err.status >= 400 && err.status < 500) {
        throw err;
      }
      if (err instanceof AdapterFetchError && err.message === 'Malformed JSON response') {
        throw err;
      }
      lastErr = err;
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  if (lastErr instanceof AdapterFetchError) throw lastErr;
  throw new AdapterFetchError(lastErr?.message || 'Network error', null);
}

export class RestAdapter {
  constructor(source) {
    this._source = source;
    this._cachedData = null;
    this._fetchedAt = null;
    this._pending = null;
  }

  _buildHeaders() {
    if (!this._source.authHeader || !this._source.authSecret) return {};
    return { [this._source.authHeader]: this._source.authSecret };
  }

  _isFresh() {
    if (!this._fetchedAt || this._cachedData == null) return false;
    const ttl = (this._source.refreshSecs ?? 60) * 1000;
    return Date.now() - this._fetchedAt < ttl;
  }

  async prefetch() {
    if (this._isFresh()) return;
    if (!this._pending) {
      this._pending = fetchWithRetry(this._source.url, this._buildHeaders())
        .then(data => {
          this._cachedData = data;
          this._fetchedAt = Date.now();
        })
        .finally(() => { this._pending = null; });
      this._pending.catch(() => {});
    }
    await this._pending;
  }

  getLatest(field) {
    if (this._cachedData == null) return null;
    const val = getField(this._cachedData, field);
    if (val == null) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : String(val);
  }

  dispose() {
    this._cachedData = null;
    this._fetchedAt = null;
    this._pending = null;
  }
}
