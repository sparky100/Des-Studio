// Shared test fixtures and assertion helpers for src/engine/__tests__
import { expect } from 'vitest';

// ── cSchedule `when` fixtures ─────────────────────────────────────────────────

export const B_HIP   = { id: 'b_hip',  name: 'Hip Complete',     scheduledTime: null };
export const B_KNEE  = { id: 'b_knee', name: 'Knee Complete',    scheduledTime: null };
export const B_GEN   = { id: 'b_gen',  name: 'Generic Complete', scheduledTime: null };

export function makeWhenModel(bEvents = [B_HIP, B_KNEE, B_GEN]) {
  return { bEvents, queues: [], entityTypes: [] };
}

// The standard 3-cSchedule conditional event used in the first-match semantics tests.
// All three tests that vary the entity attribute share this identical ev shape.
export function makeStandardScheduleEv() {
  return {
    id: 'ce1',
    name: 'Assign',
    effect: '',
    cSchedules: [
      { id: 'cs1', eventId: 'b_hip',  dist: 'Fixed', distParams: { value: '120' }, useEntityCtx: false,
        when: { variable: 'Entity.surgery_type', operator: '==', value: 'hip' } },
      { id: 'cs2', eventId: 'b_knee', dist: 'Fixed', distParams: { value: '90' },  useEntityCtx: false,
        when: { variable: 'Entity.surgery_type', operator: '==', value: 'knee' } },
      { id: 'cs3', eventId: 'b_gen',  dist: 'Fixed', distParams: { value: '60' },  useEntityCtx: false },
    ],
  };
}

// ── engine.test.js assertion helpers ─────────────────────────────────────────

export function assertDoneEntitiesHaveSojournTime(result) {
  const done = result.entitySummary.filter(e => e.status === 'done');
  expect(done.length).toBeGreaterThan(0);
  for (const e of done) {
    expect(e.sojournTime).toBeGreaterThan(0);
  }
}

// ── macros.test.js assertion helpers ─────────────────────────────────────────

export function assertClaimsCleared(customer, server) {
  expect(customer.serverId).toBeUndefined();
  expect(customer.resourceClaim).toBeUndefined();
  expect(server.currentCustId).toBeUndefined();
  expect(server.resourceClaim).toBeUndefined();
}
