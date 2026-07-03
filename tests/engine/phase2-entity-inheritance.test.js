// tests/engine/phase2-entity-inheritance.test.js — Phase 2, item 2b: entity
// family/inheritance. A child entity type with `parentTypeId` set inherits its
// ancestors' attrDefs/skills/skillProfiles at model-load time (build-time
// merge in engine/entity-inheritance.js), producing a flat runtime record.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';
import { validateModel } from '../../src/engine/validation.js';
import { applyEntityInheritance } from '../../src/engine/entity-inheritance.js';

beforeEach(() => {
  resetSeq();
});

describe('applyEntityInheritance — build-time merge', () => {
  function baseModel() {
    return {
      entityTypes: [
        {
          id: 'et-nurse', name: 'Nurse', role: 'server', count: 1,
          skills: ['Triage'],
          attrDefs: [{ name: 'shiftLength', valueType: 'number', defaultValue: '8' }],
          skillProfiles: [{ name: 'Base', skills: ['Triage'], count: 1, priority: 1 }],
        },
        {
          id: 'et-senior', name: 'Senior Nurse', role: 'server', count: 1, parentTypeId: 'et-nurse',
          skills: ['Surgery'],
        },
      ],
    };
  }

  test('child inherits parent skills, merged with its own', () => {
    const result = applyEntityInheritance(baseModel());
    const child = result.entityTypes.find(et => et.id === 'et-senior');
    expect(child.skills.sort()).toEqual(['Surgery', 'Triage']);
  });

  test('child inherits parent attrDefs it does not redeclare', () => {
    const result = applyEntityInheritance(baseModel());
    const child = result.entityTypes.find(et => et.id === 'et-senior');
    expect(child.attrDefs.some(a => a.name === 'shiftLength')).toBe(true);
  });

  test('child overriding an attrDef by name wins over the parent version', () => {
    const model = baseModel();
    model.entityTypes[1].attrDefs = [{ name: 'shiftLength', valueType: 'number', defaultValue: '12' }];
    const result = applyEntityInheritance(model);
    const child = result.entityTypes.find(et => et.id === 'et-senior');
    const attr = child.attrDefs.find(a => a.name === 'shiftLength');
    expect(attr.defaultValue).toBe('12');
  });

  test('child inherits parent skillProfiles', () => {
    const result = applyEntityInheritance(baseModel());
    const child = result.entityTypes.find(et => et.id === 'et-senior');
    expect(child.skillProfiles.some(p => p.name === 'Base')).toBe(true);
  });

  test('types without parentTypeId are returned unchanged', () => {
    const model = baseModel();
    const result = applyEntityInheritance(model);
    const parent = result.entityTypes.find(et => et.id === 'et-nurse');
    expect(parent).toBe(model.entityTypes[0]);
  });

  test('a lingering cycle degrades to "stop inheriting" instead of hanging', () => {
    const model = {
      entityTypes: [
        { id: 'a', name: 'A', role: 'server', count: 1, parentTypeId: 'b', skills: ['X'] },
        { id: 'b', name: 'B', role: 'server', count: 1, parentTypeId: 'a', skills: ['Y'] },
      ],
    };
    expect(() => applyEntityInheritance(model)).not.toThrow();
  });
});

describe('Entity inheritance — engine run behavior', () => {
  test('ASSIGN with a skill declared only on the parent type still matches the child', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'base', name: 'Nurse', role: 'server', count: '0', skills: ['Triage'], attrDefs: [] },
        { id: 'child', name: 'Senior Nurse', role: 'server', count: '1', parentTypeId: 'base', attrDefs: [] },
      ],
      queues: [{ id: 'wait', name: 'Wait Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'a1', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Wait Queue)', schedules: [] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'RELEASE(Senior Nurse)', schedules: [] },
      ],
      cEvents: [{
        id: 'c1', name: 'Start', priority: 1,
        condition: 'queue(Wait Queue).length > 0 AND idle(Senior Nurse).count > 0',
        effect: 'ASSIGN(Wait Queue, Senior Nurse, "Triage")',
        cSchedules: [{ eventId: 'done', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
      }],
    };
    const result = buildEngine(model, 1, 0, 5).runAll();
    const servedMsg = result.log.some(e => typeof e.message === 'string' && e.message.includes('skill: Triage'));
    expect(servedMsg).toBe(true);
  });
});

describe('V67 — parentTypeId validation', () => {
  function baseModel(overrides = {}) {
    return {
      entityTypes: [
        { id: 'a', name: 'A', role: 'server', count: 1, ...overrides.a },
        { id: 'b', name: 'B', role: 'server', count: 1, ...overrides.b },
      ],
    };
  }

  test('flags a self-referential parentTypeId', () => {
    const model = baseModel({ a: { parentTypeId: 'a' } });
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === 'V67' && /own parent/.test(e.message))).toBe(true);
  });

  test('flags a parentTypeId that does not match any entity type', () => {
    const model = baseModel({ a: { parentTypeId: 'ghost' } });
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === 'V67' && /does not match/.test(e.message))).toBe(true);
  });

  test('flags a role mismatch between parent and child', () => {
    const model = baseModel({ a: { role: 'customer', parentTypeId: 'b' } });
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === 'V67' && /same role/.test(e.message))).toBe(true);
  });

  test('flags a circular parentTypeId chain', () => {
    const model = baseModel({ a: { parentTypeId: 'b' }, b: { parentTypeId: 'a' } });
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === 'V67' && /circular/.test(e.message))).toBe(true);
  });

  test('accepts a valid same-role, non-cyclic parentTypeId', () => {
    const model = baseModel({ a: { parentTypeId: 'b' } });
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === 'V67')).toBe(false);
  });
});
