// engine/adapters/index.js — AdapterRegistry: resolves parameter values from data sources

import { RestAdapter } from './RestAdapter.js';

/**
 * Transparent no-op registry used by default when no live sources are configured.
 * Ensures engine callers never need to null-check the registry.
 */
export const nullRegistry = {
  resolve(distParams, _paramSource) { return distParams; },
  async prefetchAll()               { },
  dispose()                         { },
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
    this._sources   = Object.fromEntries((dataSources || []).map(ds => [ds.id, ds]));
    this._envSecrets = envSecrets;
    this._adapters  = {};
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

  dispose() {
    for (const adapter of Object.values(this._adapters)) {
      adapter.dispose?.();
    }
    this._adapters = {};
  }
}
