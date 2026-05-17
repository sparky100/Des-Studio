// engine/adapters/SnapshotAdapter.js — Fetch and validate a SystemSnapshot from a REST endpoint

import { AdapterFetchError } from './RestAdapter.js';

function resolveEnvSecret(secret, envSecrets = {}) {
  if (!secret) return secret;
  const m = secret.match(/^\{\{env\.(.+?)\}\}$/);
  return m ? (envSecrets[m[1]] ?? '') : secret;
}

/**
 * Thrown when the fetched snapshot does not match the required schema.
 */
export class SnapshotValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

/**
 * Validates a SystemSnapshot object, throwing SnapshotValidationError if invalid.
 * Returns the snapshot unchanged if valid.
 */
function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new SnapshotValidationError('Snapshot must be a non-null object');
  }
  if (typeof snapshot.clock !== 'number' || !Number.isFinite(snapshot.clock)) {
    throw new SnapshotValidationError('Snapshot missing required field "clock" (must be a finite number)');
  }
  if (!Array.isArray(snapshot.entities)) {
    throw new SnapshotValidationError('Snapshot missing required field "entities" (must be an array)');
  }
  if (typeof snapshot.queues !== 'object' || snapshot.queues === null || Array.isArray(snapshot.queues)) {
    throw new SnapshotValidationError('Snapshot missing required field "queues" (must be an object)');
  }
  for (let i = 0; i < snapshot.entities.length; i++) {
    const entity = snapshot.entities[i];
    if (typeof entity.type !== 'string') {
      throw new SnapshotValidationError(`Entity at index ${i} missing required field "type" (must be a string)`);
    }
    if (typeof entity.id !== 'string') {
      throw new SnapshotValidationError(`Entity at index ${i} missing required field "id" (must be a string)`);
    }
    if (entity.location !== 'queue' && entity.location !== 'server') {
      throw new SnapshotValidationError(`Entity at index ${i} has invalid "location" (must be "queue" or "server")`);
    }
    if (entity.location === 'queue' && typeof entity.queueId !== 'string') {
      throw new SnapshotValidationError(`Entity at index ${i} has location "queue" but missing required "queueId" (must be a string)`);
    }
  }
  return snapshot;
}

async function fetchSnapshotWithRetry(url, headers, maxAttempts = 3) {
  let lastErr;
  let delay = 2000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (res.status >= 400 && res.status < 500) {
        throw new AdapterFetchError(`SnapshotAdapter: HTTP ${res.status} (client error) from ${url}`, res.status);
      }
      if (!res.ok) {
        throw new AdapterFetchError(`SnapshotAdapter: HTTP ${res.status} from ${url}`, res.status);
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

/**
 * Fetches and parses a SystemSnapshot from a REST endpoint.
 * Validates the snapshot schema; throws SnapshotValidationError if invalid.
 */
export class SnapshotAdapter {
  constructor(dataSource, envSecrets = {}) {
    this._url = dataSource.url;
    this._authHeader = dataSource.authHeader;
    this._authSecret = resolveEnvSecret(dataSource.authSecret || '', envSecrets);
    this._snapshot = null;
  }

  _buildHeaders() {
    if (!this._authHeader || !this._authSecret) return {};
    return { [this._authHeader]: this._authSecret };
  }

  async prefetch() {
    const data = await fetchSnapshotWithRetry(this._url, this._buildHeaders());
    this._snapshot = validateSnapshot(data);
  }

  getSnapshot() {
    return this._snapshot;
  }

  getLatest(_field) {
    return null;
  }

  dispose() {
    this._snapshot = null;
  }
}
