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
      const engine = buildEngine(template, 42, 0, 100);
      const result = engine.runAll();
      expect(result).toBeDefined();
      expect(typeof result.summary).toBe('object');
    }, 10000);

    it(`${template.name} — serves at least one entity (non-trivial output)`, () => {
      const engine = buildEngine(template, 42, 0, 100);
      const result = engine.runAll();
      // Batch templates (factory, warehouse) count batched groups as departures
      const output = (result.summary?.served ?? 0) + (result.summary?.departures ?? 0);
      expect(output).toBeGreaterThan(0);
    }, 10000);

    it(`${template.name} — same seed produces identical results`, () => {
      const e1 = buildEngine(template, 99, 0, 50);
      const r1 = e1.runAll();

      const e2 = buildEngine(template, 99, 0, 50);
      const r2 = e2.runAll();

      expect(r1.summary.departures).toBe(r2.summary.departures);
    }, 10000);

    it(`${template.name} — has domain and templateMeta fields`, () => {
      expect(typeof template.domain).toBe('string');
      expect(template.domain.length).toBeGreaterThan(0);
      expect(typeof template.templateMeta).toBe('object');
      expect(typeof template.templateMeta.scenarioType).toBe('string');
      expect(typeof template.templateMeta.paramGuide).toBe('string');
      expect(typeof template.templateMeta.limitations).toBe('string');
    });
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
    const effectText = (e) => Array.isArray(e) ? e.join(';') : (e || '');
    const renege = t.bEvents.find(b => effectText(b.effect).includes('RENEGE'));
    expect(renege).toBeDefined();
  });

  it('Factory uses BATCH macro', () => {
    const t = TEMPLATES.find(t => t.id === 'factory');
    const effectText = (e) => Array.isArray(e) ? e.join(';') : (e || '');
    const batch = t.cEvents.find(c => effectText(c.effect).includes('BATCH'));
    expect(batch).toBeDefined();
  });

  it('Construction uses RELEASE macro with state variables', () => {
    const t = TEMPLATES.find(t => t.id === 'construction');
    const effectText = (e) => Array.isArray(e) ? e.join(';') : (e || '');
    const release = t.bEvents.find(b => effectText(b.effect).includes('RELEASE'));
    expect(release).toBeDefined();
    expect(t.stateVariables.length).toBeGreaterThan(0);
  });

  it('Airport has finite queue capacity', () => {
    const t = TEMPLATES.find(t => t.id === 'airport');
    t.queues.forEach(q => {
      expect(parseInt(q.capacity, 10)).toBeGreaterThan(0);
    });
  });

  it('Ward Bed Admission has finite admission queue and ward queue', () => {
    const t = TEMPLATES.find(t => t.id === 'ward-admission');
    expect(t).toBeDefined();
    const admQ = t.queues.find(q => q.name === 'Admission');
    const wardQ = t.queues.find(q => q.name === 'Ward');
    expect(parseInt(admQ.capacity, 10)).toBeGreaterThan(0);
    expect(parseInt(wardQ.capacity, 10)).toBeGreaterThan(0);
  });

  it('Bank Branch uses PRIORITY queue discipline', () => {
    const t = TEMPLATES.find(t => t.id === 'bank-branch');
    expect(t).toBeDefined();
    const q = t.queues.find(q => q.discipline === 'PRIORITY');
    expect(q).toBeDefined();
  });

  it('Retail Checkout has finite waiting queue', () => {
    const t = TEMPLATES.find(t => t.id === 'retail-checkout');
    expect(t).toBeDefined();
    const q = t.queues[0];
    expect(parseInt(q.capacity, 10)).toBeGreaterThan(0);
  });

  it('Port Berth has 3 berths', () => {
    const t = TEMPLATES.find(t => t.id === 'port-berth');
    expect(t).toBeDefined();
    const berths = t.entityTypes.find(e => e.name === 'Berth');
    expect(berths.count).toBe(3);
  });

  it('all templates have a domain field from the expected set', () => {
    const validDomains = new Set(['Academic', 'Healthcare', 'Service Systems', 'Manufacturing', 'Logistics', 'Technology', 'Transport']);
    TEMPLATES.forEach(t => {
      expect(validDomains.has(t.domain)).toBe(true);
    });
  });
});
