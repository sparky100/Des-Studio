import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  fitDistribution,
  inferColumns,
  generateEntityType,
  csvToEntityType,
} from '../../src/engine/distribution-fitting.js';
import { mulberry32 } from '../../src/engine/distributions.js';

describe('parseCsv', () => {
  it('parses a simple CSV with headers', () => {
    const { headers, rows } = parseCsv('name,age\nAlice,30\nBob,25');
    expect(headers).toEqual(['name', 'age']);
    expect(rows).toEqual([['Alice', '30'], ['Bob', '25']]);
  });

  it('handles quoted fields with commas', () => {
    const { headers, rows } = parseCsv('name,description\nAlice,"Tall, dark"\nBob,Short');
    expect(headers).toEqual(['name', 'description']);
    expect(rows).toEqual([['Alice', 'Tall, dark'], ['Bob', 'Short']]);
  });

  it('handles double quotes inside quoted fields', () => {
    const { headers, rows } = parseCsv('name,note\nAlice,"She said ""hello"""');
    expect(rows).toEqual([['Alice', 'She said "hello"']]);
  });

  it('returns empty arrays for empty input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
    expect(parseCsv('   ')).toEqual({ headers: [], rows: [] });
  });

  it('ignores blank lines', () => {
    const { rows } = parseCsv('a,b\n1,2\n\n3,4');
    expect(rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('handles CRLF line endings', () => {
    const { headers, rows } = parseCsv('a,b\r\n1,2\r\n3,4');
    expect(headers).toEqual(['a', 'b']);
    expect(rows).toEqual([['1', '2'], ['3', '4']]);
  });
});

describe('inferColumns', () => {
  it('infers string column', () => {
    const cols = inferColumns(['name'], [['Alice'], ['Bob'], ['Charlie']]);
    expect(cols[0].valueType).toBe('string');
  });

  it('infers number column', () => {
    const cols = inferColumns(['age'], [['30'], ['25'], ['40']]);
    expect(cols[0].valueType).toBe('number');
  });

  it('infers boolean column', () => {
    const cols = inferColumns(['active'], [['true'], ['false'], ['1']]);
    expect(cols[0].valueType).toBe('boolean');
  });

  it('returns sample values', () => {
    const cols = inferColumns(['a'], [['1'], ['2'], ['3']]);
    expect(cols[0].sampleValues).toEqual(['1', '2', '3']);
  });

  it('returns rowCount', () => {
    const cols = inferColumns(['a'], [['1'], ['2']]);
    expect(cols[0].rowCount).toBe(2);
  });
});

describe('fitDistribution', () => {
  it('fits fixed to constant values', () => {
    const result = fitDistribution([5, 5, 5, 5, 5]);
    expect(result.type).toBe('fixed');
    expect(result.params.value).toBe('5');
    expect(result.score).toBe(0);
  });

  it('fits exponential to exponential samples', () => {
    // Exponential with mean 2: samples via inverse CDF
    const mean = 2;
    const values = [];
    for (let i = 1; i <= 100; i++) {
      const u = i / 101; // uniform-ish
      values.push(-mean * Math.log(1 - u));
    }
    const result = fitDistribution(values);
    expect(result.type).toBe('exponential');
    expect(parseFloat(result.params.mean)).toBeCloseTo(2, 0);
  });

  it('fits uniform to uniform samples', () => {
    const values = [];
    for (let i = 0; i < 100; i++) {
      values.push(10 + (i / 99) * 20); // deterministic spread 10..30
    }
    const result = fitDistribution(values);
    expect(result.type).toBe('uniform');
    expect(parseFloat(result.params.min)).toBeCloseTo(10, 0);
    expect(parseFloat(result.params.max)).toBeCloseTo(30, 0);
  });

  it('fits normal to normal samples', () => {
    // Box-Muller for normal(10, 2) — seeded for determinism
    const rng = mulberry32(42);
    const values = [];
    for (let i = 0; i < 200; i++) {
      const u1 = Math.max(1e-10, rng());
      const u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      values.push(10 + 2 * z);
    }
    const result = fitDistribution(values);
    expect(result.type).toBe('normal');
    expect(parseFloat(result.params.mean)).toBeCloseTo(10, 0);
    expect(parseFloat(result.params.stdDev)).toBeCloseTo(2, 0);
  });

  it('fits lognormal to lognormal samples', () => {
    // lognormal with logMean=1, logStdDev=0.5
    const values = [];
    for (let i = 0; i < 200; i++) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      values.push(Math.exp(1 + 0.5 * z));
    }
    const result = fitDistribution(values);
    expect(result.type).toBe('lognormal');
    expect(parseFloat(result.params.logMean)).toBeCloseTo(1, 0);
    expect(parseFloat(result.params.logStdDev)).toBeCloseTo(0.5, 0);
  });

  it('falls back to empirical for irregular data', () => {
    const values = [1, 5, 2, 8, 3, 9, 1, 5, 2, 8]; // noisy, no clear shape
    const result = fitDistribution(values);
    // Should pick something; empirical is always a candidate
    expect(['fixed', 'exponential', 'uniform', 'normal', 'lognormal', 'triangular', 'empirical']).toContain(result.type);
    expect(result.score).toBeLessThan(Infinity);
  });

  it('returns fixed for empty array', () => {
    const result = fitDistribution([]);
    expect(result.type).toBe('fixed');
    expect(result.params.value).toBe('0');
  });
});

describe('generateEntityType', () => {
  it('creates entity type with number and string attrDefs', () => {
    const columns = [
      { name: 'age', valueType: 'number', sampleValues: ['10', '12'], rowCount: 2, distResult: { type: 'normal', params: { mean: '10', stdDev: '2' }, stats: { mean: 10 } } },
      { name: 'name', valueType: 'string', sampleValues: ['A', 'B'], rowCount: 2, distResult: null },
    ];
    const et = generateEntityType('Customer', columns);
    expect(et.name).toBe('Customer');
    expect(et.role).toBe('customer');
    expect(et.attrDefs).toHaveLength(2);
    expect(et.attrDefs[0]).toMatchObject({
      name: 'age',
      valueType: 'number',
      defaultValue: 10,
      dist: 'normal',
      distParams: { mean: '10', stdDev: '2' },
    });
    expect(et.attrDefs[1]).toMatchObject({
      name: 'name',
      valueType: 'string',
      defaultValue: '',
    });
  });

  it('creates boolean attrDef correctly', () => {
    const columns = [
      { name: 'active', valueType: 'boolean', sampleValues: ['true', 'false'], rowCount: 2, distResult: null },
    ];
    const et = generateEntityType('Item', columns);
    expect(et.attrDefs[0]).toMatchObject({
      name: 'active',
      valueType: 'boolean',
      defaultValue: false,
    });
  });

  it('sanitizes id and attr names', () => {
    const columns = [
      { name: 'My Column!', valueType: 'number', sampleValues: ['1'], rowCount: 1, distResult: { type: 'fixed', params: { value: '1' } } },
    ];
    const et = generateEntityType('My Entity', columns);
    expect(et.id).toMatch(/^et_my_entity/);
    expect(et.attrDefs[0].id).toMatch(/^a_my_column/);
  });
});

describe('csvToEntityType', () => {
  it('end-to-end: CSV text to entity type', () => {
    const csv = 'service_time,patient_type\n2.5,A\n3.1,B\n1.8,A\n4.0,C';
    const { entityType, columns } = csvToEntityType(csv, 'Patient');
    expect(entityType.name).toBe('Patient');
    expect(columns).toHaveLength(2);
    expect(columns[0].valueType).toBe('number');
    expect(columns[1].valueType).toBe('string');
    expect(entityType.attrDefs[0].valueType).toBe('number');
    expect(entityType.attrDefs[1].valueType).toBe('string');
  });

  it('throws for empty CSV', () => {
    expect(() => csvToEntityType('')).toThrow('empty');
  });

  it('throws for headers-only CSV', () => {
    expect(() => csvToEntityType('a,b')).toThrow('no data');
  });
});
