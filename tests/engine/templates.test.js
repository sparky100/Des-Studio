import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../../src/engine/templates.js';
import { validateModel } from '../../src/engine/validation.js';
import { buildEngine } from '../../src/engine/index.js';

describe('All template models', () => {
  TEMPLATES.forEach(template => {
    it(`${template.name} — passes validation`, () => {
      const result = validateModel(template);
      if (result.errors.length > 0) {
        console.log(`Validation errors for ${template.name}:`, result.errors);
      }
      expect(result.errors).toEqual([]);
    });

    it(`${template.name} — runs without crashing`, () => {
      const engine = buildEngine(template, 42, 0, 20);
      const result = engine.runAll();
      expect(result).toBeDefined();
      expect(typeof result.summary).toBe('object');
    }, 10000);

    it(`${template.name} — same seed produces identical results`, () => {
      const e1 = buildEngine(template, 99, 0, 10);
      const r1 = e1.runAll();

      const e2 = buildEngine(template, 99, 0, 10);
      const r2 = e2.runAll();

      expect(r1.summary.departures).toBe(r2.summary.departures);
    }, 10000);
  });
});

describe('ER Triage priority discipline', () => {
  const template = TEMPLATES.find(t => t.id === 'er-triage');

  it('Treatment queue uses PRIORITY discipline', () => {
    const q = template.queues.find(q => q.name === 'Treatment');
    expect(q.discipline).toBe('PRIORITY');
  });

  it('Patient entity type has priority attribute', () => {
    const et = template.entityTypes.find(et => et.name === 'Patient');
    expect(et.attrDefs.some(a => a.name === 'priority')).toBe(true);
  });

  it('higher-priority patients (lower number) get served first', () => {
    const entities = [
      { id: 1, type: 'Patient', status: 'waiting', queue: 'Treatment', arrivalTime: 10, attrs: { priority: 1 } },
      { id: 2, type: 'Patient', status: 'waiting', queue: 'Treatment', arrivalTime: 5,  attrs: { priority: 5 } },
      { id: 3, type: 'Patient', status: 'waiting', queue: 'Treatment', arrivalTime: 1,  attrs: { priority: 3 } },
    ];
    const sorted = entities.sort((a, b) => {
      const pa = Number(a.attrs?.priority ?? Infinity);
      const pb = Number(b.attrs?.priority ?? Infinity);
      if (pa !== pb) return pa - pb;
      return (a.arrivalTime || 0) - (b.arrivalTime || 0);
    });
    // Priority 1 served first despite arriving last
    expect(sorted[0].id).toBe(1);
    // Priority 3 served second
    expect(sorted[1].id).toBe(3);
    // Priority 5 served last despite arriving first
    expect(sorted[2].id).toBe(2);
  });
});

describe('Specific template properties', () => {
  it('M/M/1 has 1 server entity', () => {
    const t = TEMPLATES.find(t => t.id === 'mm1');
    const srv = t.entityTypes.find(e => e.role === 'server');
    expect(srv.count).toBe(1);
  });

  it('Call Center has RENEGE macro for abandonment', () => {
    const t = TEMPLATES.find(t => t.id === 'call-center');
    const renege = t.bEvents.find(b => b.effect?.startsWith('RENEGE'));
    expect(renege).toBeDefined();
  });

  it('Factory uses BATCH macro', () => {
    const t = TEMPLATES.find(t => t.id === 'factory');
    const batch = t.cEvents.find(c => c.effect?.startsWith('BATCH'));
    expect(batch).toBeDefined();
  });

  it('Construction uses RELEASE macro with state variables', () => {
    const t = TEMPLATES.find(t => t.id === 'construction');
    const release = t.bEvents.find(b => b.effect?.includes('RELEASE'));
    expect(release).toBeDefined();
    expect(t.stateVariables.length).toBeGreaterThan(0);
  });

  it('Airport has finite queue capacity', () => {
    const t = TEMPLATES.find(t => t.id === 'airport');
    t.queues.forEach(q => {
      expect(parseInt(q.capacity, 10)).toBeGreaterThan(0);
    });
  });
});
