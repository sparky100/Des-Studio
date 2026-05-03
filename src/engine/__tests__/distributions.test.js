import { describe, test, expect } from 'vitest';
import { DISTRIBUTIONS, sample, sampleAttrs, mulberry32 } from '../distributions.js';

const rng = mulberry32(42);

describe('Fixed', () => {
  test('returns exactly the value param', () => {
    expect(sample('Fixed', { value: '7' }, rng)).toBe(7);
    expect(sample('Fixed', { value: '0' }, rng)).toBe(0);
    expect(sample('Fixed', { value: '3.5' }, rng)).toBe(3.5);
  });

  test('clamps negative value to 0', () => {
    expect(sample('Fixed', { value: '-1' }, rng)).toBe(0);
  });
});

describe('Uniform', () => {
  test('always returns value in [0, 10]', () => {
    for (let i = 0; i < 100; i++) {
      const v = sample('Uniform', { min: '0', max: '10' }, rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  test('mean of 1000 samples is near midpoint', () => {
    const samples = Array.from({ length: 1000 }, () =>
      sample('Uniform', { min: '0', max: '10' }, rng)
    );
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(4);
    expect(mean).toBeLessThan(6);
  });
});

describe('Exponential', () => {
  test('mean of 1000 samples within 5% of 5.0', () => {
    const samples = Array.from({ length: 1000 }, () =>
      sample('Exponential', { mean: '5' }, rng)
    );
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(5 * 0.95);
    expect(mean).toBeLessThan(5 * 1.05);
  });

  test('all values are non-negative', () => {
    for (let i = 0; i < 100; i++) {
      expect(sample('Exponential', { mean: '2' }, rng)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Normal', () => {
  test('mean of 1000 samples within 5% of 5.0', () => {
    const samples = Array.from({ length: 1000 }, () =>
      sample('Normal', { mean: '5', stddev: '1' }, rng)
    );
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(5 * 0.95);
    expect(mean).toBeLessThan(5 * 1.05);
  });

  test('all values are >= 0 (clipped at 0)', () => {
    for (let i = 0; i < 200; i++) {
      expect(sample('Normal', { mean: '0', stddev: '5' }, rng)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Triangular', () => {
  test('all values in [0, 10]', () => {
    for (let i = 0; i < 100; i++) {
      const v = sample('Triangular', { min: '0', mode: '5', max: '10' }, rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  test('mean of 1000 samples near 5', () => {
    const samples = Array.from({ length: 1000 }, () =>
      sample('Triangular', { min: '0', mode: '5', max: '10' }, rng)
    );
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(4.5);
    expect(mean).toBeLessThan(5.5);
  });
});

describe('Erlang', () => {
  test('all values >= 0', () => {
    for (let i = 0; i < 100; i++) {
      expect(sample('Erlang', { k: '2', mean: '4' }, rng)).toBeGreaterThanOrEqual(0);
    }
  });

  test('mean of 1000 samples within 10% of 4.0', () => {
    const samples = Array.from({ length: 1000 }, () =>
      sample('Erlang', { k: '2', mean: '4' }, rng)
    );
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(4 * 0.9);
    expect(mean).toBeLessThan(4 * 1.1);
  });
});

describe('ServerAttr', () => {
  test('returns server attr value when serverAttrs provided', () => {
    const v = sample('ServerAttr', { attr: 'serviceTime' }, rng, { serviceTime: 7 });
    expect(v).toBe(7);
  });

  test('returns 1.0 when serverAttrs is null', () => {
    const v = sample('ServerAttr', { attr: 'serviceTime' }, rng, null);
    expect(v).toBe(1);
  });

  test('returns 1.0 when attr is missing from serverAttrs', () => {
    const v = sample('ServerAttr', { attr: 'missing' }, rng, { serviceTime: 5 });
    expect(v).toBe(1);
  });
});

describe('sampleAttrs', () => {
  test('array format returns object with all named attributes', () => {
    const result = sampleAttrs([
      { name: 'serviceTime', dist: 'Fixed', distParams: { value: '5' } },
      { name: 'priority',    dist: 'Fixed', distParams: { value: '2' } },
    ]);
    expect(result.serviceTime).toBe(5);
    expect(result.priority).toBe(2);
  });

  test('string format "serviceTime=3" returns {serviceTime: 3}', () => {
    const result = sampleAttrs('serviceTime=3');
    expect(result).toEqual({ serviceTime: 3 });
  });

  test('string format with multiple pairs', () => {
    const result = sampleAttrs('a=1,b=2');
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });

  test('null returns {}', () => {
    expect(sampleAttrs(null)).toEqual({});
  });

  test('empty array returns {}', () => {
    expect(sampleAttrs([])).toEqual({});
  });

  test('array entry without name is skipped', () => {
    const result = sampleAttrs([{ name: '', dist: 'Fixed', distParams: { value: '1' } }]);
    expect(Object.keys(result).length).toBe(0);
  });
});
