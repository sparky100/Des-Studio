// tests/llm/schedule-flags.test.js
//
// Tests for ADR-016 schedule flags in the LLM suggestion prompt payload.
// Covers: externalSchedule, inlineRows, and system-prompt timetable context.

import { describe, it, expect } from 'vitest';
import { buildSuggestionPrompt } from '../../src/llm/prompts.js';

const BASE_MODEL = {
  name: 'Test Clinic',
  entityTypes: [],
  queues: [],
};

const SCHED_UUID = 'aaaaaaaa-0000-0000-0000-000000000001';

function getPayload(model) {
  const prompt = buildSuggestionPrompt(model, {}, {});
  return JSON.parse(prompt.messages[1].content);
}

function getSystemMsg(model) {
  return buildSuggestionPrompt(model, {}, {}).messages[0].content;
}

describe('ADR-016 schedule flags in LLM suggestion payload', () => {
  it('sets externalSchedule:true when bEvent references a named schedule (scheduleRef, empty rows)', () => {
    const model = {
      ...BASE_MODEL,
      bEvents: [{
        id: 'b_arrive', name: 'Arrivals',
        schedules: [{ dist: 'Schedule', scheduleRef: SCHED_UUID, rows: [] }],
      }],
    };
    const payload = getPayload(model);
    const be = payload.model.bEvents.find(e => e.name === 'Arrivals');
    expect(be.externalSchedule).toBe(true);
    expect(be.inlineRows).toBeUndefined();
  });

  it('sets externalSchedule:true when scheduleRef present even if rows field is absent', () => {
    const model = {
      ...BASE_MODEL,
      bEvents: [{
        id: 'b_arrive', name: 'Arrivals',
        schedules: [{ dist: 'Schedule', scheduleRef: SCHED_UUID }],
      }],
    };
    const payload = getPayload(model);
    const be = payload.model.bEvents.find(e => e.name === 'Arrivals');
    expect(be.externalSchedule).toBe(true);
  });

  it('sets inlineRows:true when bEvent carries rows[] without a scheduleRef', () => {
    const model = {
      ...BASE_MODEL,
      bEvents: [{
        id: 'b_arrive', name: 'Arrivals',
        schedules: [{ dist: 'Schedule', rows: [{ time: 480, attrs: {} }] }],
      }],
    };
    const payload = getPayload(model);
    const be = payload.model.bEvents.find(e => e.name === 'Arrivals');
    expect(be.inlineRows).toBe(true);
    expect(be.externalSchedule).toBeUndefined();
  });

  it('sets both flags when the same bEvent has one external and one inline entry', () => {
    const model = {
      ...BASE_MODEL,
      bEvents: [{
        id: 'b_arrive', name: 'Arrivals',
        schedules: [
          { dist: 'Schedule', scheduleRef: SCHED_UUID, rows: [] },
          { dist: 'Schedule', rows: [{ time: 500, attrs: {} }] },
        ],
      }],
    };
    const payload = getPayload(model);
    const be = payload.model.bEvents.find(e => e.name === 'Arrivals');
    expect(be.externalSchedule).toBe(true);
    expect(be.inlineRows).toBe(true);
  });

  it('sets neither flag when bEvent has no Schedule distribution entries', () => {
    const model = {
      ...BASE_MODEL,
      bEvents: [{
        id: 'b_arrive', name: 'Arrivals',
        schedules: [{ dist: 'Exponential', distParams: { mean: 5 } }],
      }],
    };
    const payload = getPayload(model);
    const be = payload.model.bEvents.find(e => e.name === 'Arrivals');
    expect(be.externalSchedule).toBeUndefined();
    expect(be.inlineRows).toBeUndefined();
  });

  it('sets neither flag when schedules array is absent', () => {
    const model = {
      ...BASE_MODEL,
      bEvents: [{ id: 'b_arrive', name: 'Arrivals' }],
    };
    const payload = getPayload(model);
    const be = payload.model.bEvents.find(e => e.name === 'Arrivals');
    expect(be.externalSchedule).toBeUndefined();
    expect(be.inlineRows).toBeUndefined();
  });

  it('sets neither flag on a fully-resolved bEvent (scheduleRef + non-empty rows)', () => {
    // rows are already populated — this means the engine has resolved the schedule;
    // it is neither "external-only" nor "inline-only"
    const model = {
      ...BASE_MODEL,
      bEvents: [{
        id: 'b_arrive', name: 'Arrivals',
        schedules: [{ dist: 'Schedule', scheduleRef: SCHED_UUID, rows: [{ time: 480, attrs: {} }] }],
      }],
    };
    const payload = getPayload(model);
    const be = payload.model.bEvents.find(e => e.name === 'Arrivals');
    // scheduleRef present but rows are non-empty → externalCount is 0
    expect(be.externalSchedule).toBeUndefined();
    // rows non-empty AND no scheduleRef? No — scheduleRef IS present → inlineCount is 0
    expect(be.inlineRows).toBeUndefined();
  });

  it('counts flags independently across multiple bEvents', () => {
    const model = {
      ...BASE_MODEL,
      bEvents: [
        {
          id: 'b_a', name: 'External Event',
          schedules: [{ dist: 'Schedule', scheduleRef: SCHED_UUID, rows: [] }],
        },
        {
          id: 'b_b', name: 'Inline Event',
          schedules: [{ dist: 'Schedule', rows: [{ time: 480, attrs: {} }] }],
        },
      ],
    };
    const payload = getPayload(model);
    const extBE   = payload.model.bEvents.find(e => e.name === 'External Event');
    const inlineBE = payload.model.bEvents.find(e => e.name === 'Inline Event');
    expect(extBE.externalSchedule).toBe(true);
    expect(extBE.inlineRows).toBeUndefined();
    expect(inlineBE.inlineRows).toBe(true);
    expect(inlineBE.externalSchedule).toBeUndefined();
  });
});

describe('ADR-016 timetable context in suggestion system prompt', () => {
  it('system prompt mentions model_schedules table', () => {
    expect(getSystemMsg(BASE_MODEL)).toMatch(/model_schedules/i);
  });

  it('system prompt mentions scheduleRef', () => {
    expect(getSystemMsg(BASE_MODEL)).toMatch(/scheduleRef/i);
  });

  it('system prompt mentions timetable', () => {
    expect(getSystemMsg(BASE_MODEL)).toMatch(/timetable/i);
  });

  it('system prompt advises migrating inlineRows models', () => {
    expect(getSystemMsg(BASE_MODEL)).toMatch(/Schedules tab/i);
  });
});
