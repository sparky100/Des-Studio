// engine/adapters/index.js — AdapterRegistry: resolves parameter values from data sources

import { RestAdapter, AdapterFetchError } from './RestAdapter.js';
import { WebSocketAdapter }               from './WebSocketAdapter.js';
import { SnapshotAdapter }                from './SnapshotAdapter.js';

export { AdapterFetchError };

/**
 * Transparent no-op registry used by default when no live sources are configured.
 * Ensures engine callers never need to null-check the registry.
 */
export const nullRegistry = {
  resolve(distParams, _paramSource)             { return distParams; },
  async resolveAsync(distParams, _paramSource)  { return distParams; },
  async prefetchAll()                           { },
  dispose()                                     { },
};

/**
 * Resolves distParams fields from named external data sources.
 * Constructed once per simulation run; disposed after the run completes.
 *
 * @param {import('./types.js').DataSource[]} dataSources
 * @param {Record<string, string>} envSecrets  resolved {{env.VAR}} values
 */
export class AdapterRegistry {
  constructor(dataSources = [], envSecrets = {}) {
    this._sources        = Object.fromEntries((dataSources || []).map(ds => [ds.id, ds]));
    this._envSecrets     = envSecrets;
    this._adapters       = {};
    this._resolvedValues = {};
  }

  _resolveSecret(secret) {
    if (!secret) return secret;
    const m = secret.match(/^\{\{env\.(.+?)\}\}$/);
    return m ? (this._envSecrets[m[1]] ?? '') : secret;
  }

  _getAdapter(source) {
    if (this._adapters[source.id]) return this._adapters[source.id];

    const resolved = source.authSecret
      ? { ...source, authSecret: this._resolveSecret(source.authSecret) }
      : source;

    if (resolved.type === 'rest') {
      this._adapters[source.id] = new RestAdapter(resolved);
    } else if (resolved.type === 'websocket') {
      this._adapters[source.id] = new WebSocketAdapter(resolved, this._wsOptions || {});
    } else if (resolved.type === 'snapshot') {
      this._adapters[source.id] = new SnapshotAdapter(resolved, this._envSecrets);
    } else if (resolved.type === 'mock') {
      throw new Error(`No mock registered for source "${source.id}" — call registerMock() before use`);
    } else {
      throw new Error(`Unsupported adapter type "${resolved.type}"`);
    }
    return this._adapters[source.id];
  }

  /**
   * Register a pre-built adapter instance for a source ID.
   * Used in tests to inject mockAdapter instances.
   */
  registerMock(sourceId, adapterInstance) {
    this._adapters[sourceId] = adapterInstance;
  }

  /**
   * Eagerly fetch all sources. Called before a calibrated_batch run so that
   * resolve() can operate synchronously throughout the FEL loop.
   */
  async prefetchAll() {
    await Promise.all(
      Object.values(this._sources).map(async source => {
        try {
          const adapter = this._getAdapter(source);
          if (adapter.prefetch) await adapter.prefetch();
        } catch {
          // non-fatal: resolve() falls back to static distParams on error
        }
      })
    );
  }

  /**
   * Resolve a distParams object, substituting the live value if a paramSource
   * is present and the adapter has a cached value. Always returns a valid
   * distParams object — never throws.
   *
   * @param {Record<string, string>} distParams
   * @param {import('./types.js').ParamSource | undefined} paramSource
   * @returns {Record<string, string>}
   */
  resolve(distParams, paramSource) {
    if (!paramSource || !paramSource.sourceId) return distParams;

    const source = this._sources[paramSource.sourceId];
    if (!source) return distParams;

    try {
      const adapter = this._getAdapter(source);
      const rawValue = adapter.getLatest(paramSource.field);

      const targetKey =
        paramSource.targetParam ||
        (distParams && Object.keys(distParams)[0]) ||
        'value';

      if (rawValue == null) {
        // Adapter not yet fetched or field missing — use fallback if provided
        if (paramSource.fallback != null) {
          return { ...distParams, [targetKey]: String(paramSource.fallback) };
        }
        return distParams;
      }

      const resolvedNum = Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue;
      this._resolvedValues[`${paramSource.sourceId}.${paramSource.field}`] = resolvedNum;
      return { ...distParams, [targetKey]: String(rawValue) };
    } catch {
      if (paramSource.fallback != null) {
        const targetKey =
          paramSource.targetParam ||
          (distParams && Object.keys(distParams)[0]) ||
          'value';
        return { ...distParams, [targetKey]: String(paramSource.fallback) };
      }
      return distParams;
    }
  }

  /**
   * Returns a map of { [sourceId.field]: resolvedValue } for all live parameter
   * values resolved during this registry's lifetime.
   * @returns {Record<string, number | string>}
   */
  getResolvedValues() {
    return { ...this._resolvedValues };
  }

  /**
   * Async variant of resolve(). If the adapter exposes a getValue() method, awaits
   * it; otherwise falls back to getLatest(). Used by runAllAsync() in rolling mode
   * so that each sample site can wait for a fresh value if the adapter needs it.
   *
   * @param {Record<string, string>} distParams
   * @param {import('./types.js').ParamSource | undefined} paramSource
   * @returns {Promise<Record<string, string>>}
   */
  async resolveAsync(distParams, paramSource) {
    if (!paramSource || !paramSource.sourceId) return distParams;

    const source = this._sources[paramSource.sourceId];
    if (!source) return distParams;

    try {
      const adapter = this._getAdapter(source);

      // If adapter has an async getValue, await it; otherwise use synchronous getLatest
      let rawValue;
      if (typeof adapter.getValue === 'function') {
        rawValue = await adapter.getValue(paramSource.field);
      } else {
        rawValue = adapter.getLatest(paramSource.field);
      }

      const targetKey =
        paramSource.targetParam ||
        (distParams && Object.keys(distParams)[0]) ||
        'value';

      if (rawValue == null) {
        if (paramSource.fallback != null) {
          return { ...distParams, [targetKey]: String(paramSource.fallback) };
        }
        return distParams;
      }

      return { ...distParams, [targetKey]: String(rawValue) };
    } catch {
      if (paramSource.fallback != null) {
        const targetKey =
          paramSource.targetParam ||
          (distParams && Object.keys(distParams)[0]) ||
          'value';
        return { ...distParams, [targetKey]: String(paramSource.fallback) };
      }
      return distParams;
    }
  }

  /**
   * Returns the cached SystemSnapshot from a SnapshotAdapter, or null if not available.
   * @param {string} sourceId
   * @returns {object | null}
   */
  getSnapshot(sourceId) {
    const adapter = this._adapters[sourceId];
    if (!adapter || typeof adapter.getSnapshot !== 'function') return null;
    return adapter.getSnapshot();
  }

  dispose() {
    for (const adapter of Object.values(this._adapters)) {
      adapter.dispose?.();
    }
    this._adapters = {};
    this._resolvedValues = {};
  }
}
