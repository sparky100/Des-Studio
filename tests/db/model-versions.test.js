import { describe, expect, it } from 'vitest';
import { getNextVersion, createVersion, listVersions, getVersion, deleteVersion } from '../../src/db/models.js';

describe('model version DB functions', () => {
  it('exports getNextVersion', () => {
    expect(typeof getNextVersion).toBe('function');
  });

  it('exports createVersion', () => {
    expect(typeof createVersion).toBe('function');
  });

  it('exports listVersions', () => {
    expect(typeof listVersions).toBe('function');
  });

  it('exports getVersion', () => {
    expect(typeof getVersion).toBe('function');
  });

  it('exports deleteVersion', () => {
    expect(typeof deleteVersion).toBe('function');
  });
});
