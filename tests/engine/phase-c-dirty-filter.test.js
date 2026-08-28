import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

// Differential regression test for the Phase C dirty-set filter
// (enableFilteredPhaseC, active once a model has >= 8 C-events).
//
// The filter must never change *which* events fire or *when* — only skip
// redundant re-evaluation of C-events whose dependencies weren't touched.
// We build one model with 5 real, actively-interacting C-events (sharing a
// 2-server pool, so genuine priority contention exists) — below the
// filtering threshold, so it always runs the unfiltered path — and an
// identical copy padded with always-false decoy C-events past the
// threshold, so it engages the filtered path (including the precise
// dirty-merge on C-event fire). Same seed, same real events: the two runs
// must produce bit-identical outcomes.

function makeRealCEvents(queueDefs) {
  return queueDefs.map((queue, index) => ({
    id: `c_service_${index + 1}`,
    name: `Serve ${queue.name}`,
    priority: index + 1,
    condition: `queue(${queue.name}).length > 0 AND idle(Server).count > 0`,
    effect: `ASSIGN(${queue.name}, Server)`,
    cSchedules: [{ eventId: 'b_complete', dist: 'Fixed', distParams: { value: String(1 + (index % 3) * 0.25) }, useEntityCtx: true }],
  }));
}

function makeDecoyCEvents(count, startPriority) {
  return Array.from({ length: count }, (_, index) => ({
    id: `c_decoy_${index + 1}`,
    name: `Decoy ${index + 1}`,
    priority: startPriority + index,
    condition: `queue(Decoy Queue ${index + 1}).length > 0 AND idle(Server).count > 0`,
    effect: `ASSIGN(Decoy Queue ${index + 1}, Server)`,
    cSchedules: [{ eventId: 'b_complete', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
  }));
}

function makeModel({ decoyCount }) {
  const realQueueDefs = Array.from({ length: 5 }, (_, index) => ({
    id: `q_active_${index + 1}`,
    name: `Active Queue ${index + 1}`,
    customerType: index % 2 === 0 ? 'TypeA' : 'TypeB',
    discipline: 'FIFO',
  }));
  const decoyQueueDefs = Array.from({ length: decoyCount }, (_, index) => ({
    id: `q_decoy_${index + 1}`,
    name: `Decoy Queue ${index + 1}`,
    customerType: 'TypeA',
    discipline: 'FIFO',
  }));
  const arrivals = realQueueDefs.map((queue, index) => ({
    id: `b_arrive_${index + 1}`,
    name: `Arrival ${index + 1}`,
    scheduledTime: String((index % 3) * 0.1),
    effect: `ARRIVE(${queue.customerType}, ${queue.name})`,
    schedules: [{ eventId: `b_arrive_${index + 1}`, dist: 'Exponential', distParams: { mean: String(6 + (index % 4)) } }],
  }));
  return {
    entityTypes: [
      { id: 'et_a', name: 'TypeA', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_b', name: 'TypeB', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_server', name: 'Server', role: 'server', count: 2, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [...realQueueDefs, ...decoyQueueDefs],
    bEvents: [
      ...arrivals,
      { id: 'b_complete', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [...makeRealCEvents(realQueueDefs), ...makeDecoyCEvents(decoyCount, realQueueDefs.length + 1)],
  };
}

describe('Phase C dirty-set filter — differential correctness', () => {
  test('filtered path (>=8 C-events) matches unfiltered path (<8 C-events) bit-for-bit', () => {
    const seed = 12345;
    const unfiltered = makeModel({ decoyCount: 0 }); // 5 C-events — below threshold
    const filtered = makeModel({ decoyCount: 5 }); // 10 C-events — engages enableFilteredPhaseC

    const unfilteredResult = buildEngine(unfiltered, seed).runAll();
    const filteredResult = buildEngine(filtered, seed).runAll();

    expect(filteredResult.summary).toEqual(unfilteredResult.summary);
    expect(filteredResult.finalTime).toEqual(unfilteredResult.finalTime);
    expect(filteredResult.runtimeMetrics.events_processed).toEqual(unfilteredResult.runtimeMetrics.events_processed);
    expect(filteredResult.runtimeMetrics.c_events_fired).toEqual(unfilteredResult.runtimeMetrics.c_events_fired);

    // The decoys never fire (their queues never receive arrivals), so the
    // sequence of *real* fired C-events/B-events must line up exactly.
    const realFiredSequence = (result) => result.log
      .filter((entry) => entry.cEval?.conditionTrue || entry.phase === 'B')
      .filter((entry) => !entry.cEval || !entry.cEval.eventId.startsWith('c_decoy_'))
      .map((entry) => `${entry.time}|${entry.phase}|${entry.cEval?.eventId ?? entry.event?.id ?? entry.message}`);

    expect(realFiredSequence(filteredResult)).toEqual(realFiredSequence(unfilteredResult));

    // Filtering should actually reduce scan volume on the model exercising it.
    expect(filteredResult.runtimeMetrics.c_event_scans).toBeLessThan(unfilteredResult.runtimeMetrics.c_event_scans + filteredResult.runtimeMetrics.c_events_fired * decoyScanUpperBound(filtered));
  });
});

// Loose upper bound: even in the worst case the decoys could only add one
// scan per decoy per C-event-firing pass — this just guards against a
// regression that makes filtering strictly worse than the unfiltered baseline,
// not a tight performance assertion.
function decoyScanUpperBound(model) {
  return model.cEvents.length;
}

// ── RELEASE_COSEIZED dirty-tracking precision ────────────────────────────────
// compileEffectImpactTemplate() (src/engine/index.js) must recognize
// RELEASE_COSEIZED([...], Queue) as a precise "release" action — falling back
// to its `{ kind: "all" }` catch-all (which forces every C-event to
// re-scan on every fire) would still be *correct* but defeats the filter's
// purpose. Reuse the same differential-correctness shape as above, with
// COSEIZE/RELEASE_COSEIZED "real" C-events instead of ASSIGN/COMPLETE.

function makeCoseizeRealCEvents(queueDefs) {
  return queueDefs.map((queue, index) => ({
    id: `c_surgery_${index + 1}`,
    name: `Surgery ${queue.name}`,
    priority: index + 1,
    condition: `queue(${queue.name}).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0`,
    effect: `COSEIZE(${queue.name}, Surgeon, Anesthetist)`,
    cSchedules: [{ eventId: 'b_surgery_done', dist: 'Fixed', distParams: { value: String(1 + (index % 3) * 0.25) }, useEntityCtx: true }],
  }));
}

// Decoys deliberately use their own resource pool (DecoyServer) and completion
// B-event, disjoint from Surgeon/Anesthetist/Ward Queue — their conditions never
// depend on anything RELEASE_COSEIZED touches. This is what makes the test
// discriminating: if RELEASE_COSEIZED's dirty marking falls back to `{ kind:
// "all" }`, every decoy gets needlessly rescanned on every surgery completion
// even though nothing in its own dependencies changed; with precise marking,
// decoys are skipped entirely (their queues never receive arrivals).
function makeCoseizeDecoyCEvents(count, startPriority) {
  return Array.from({ length: count }, (_, index) => ({
    id: `c_decoy_${index + 1}`,
    name: `Decoy ${index + 1}`,
    priority: startPriority + index,
    condition: `queue(Decoy Queue ${index + 1}).length > 0 AND idle(DecoyServer).count > 0`,
    effect: `ASSIGN(Decoy Queue ${index + 1}, DecoyServer)`,
    cSchedules: [{ eventId: 'b_decoy_complete', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
  }));
}

function makeCoseizeModel({ decoyCount }) {
  const realQueueDefs = Array.from({ length: 5 }, (_, index) => ({
    id: `q_active_${index + 1}`,
    name: `Active Queue ${index + 1}`,
    customerType: 'Patient',
    discipline: 'FIFO',
  }));
  const decoyQueueDefs = Array.from({ length: decoyCount }, (_, index) => ({
    id: `q_decoy_${index + 1}`,
    name: `Decoy Queue ${index + 1}`,
    customerType: 'Patient',
    discipline: 'FIFO',
  }));
  const arrivals = realQueueDefs.map((queue, index) => ({
    id: `b_arrive_${index + 1}`,
    name: `Arrival ${index + 1}`,
    scheduledTime: String((index % 3) * 0.1),
    effect: `ARRIVE(${queue.customerType}, ${queue.name})`,
    schedules: [{ eventId: `b_arrive_${index + 1}`, dist: 'Exponential', distParams: { mean: String(6 + (index % 4)) } }],
  }));
  return {
    entityTypes: [
      { id: 'et_patient', name: 'Patient', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_surgeon', name: 'Surgeon', role: 'server', count: 2, attrDefs: [] },
      { id: 'et_anesthetist', name: 'Anesthetist', role: 'server', count: 2, attrDefs: [] },
      { id: 'et_decoy_server', name: 'DecoyServer', role: 'server', count: 2, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [...realQueueDefs, ...decoyQueueDefs, { id: 'q_ward', name: 'Ward Queue', customerType: 'Patient', discipline: 'FIFO' }],
    bEvents: [
      ...arrivals,
      { id: 'b_surgery_done', name: 'Surgery Complete', scheduledTime: '9999', effect: 'RELEASE_COSEIZED([Surgeon, Anesthetist], Ward Queue)', schedules: [] },
      { id: 'b_decoy_complete', name: 'Decoy Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [...makeCoseizeRealCEvents(realQueueDefs), ...makeCoseizeDecoyCEvents(decoyCount, realQueueDefs.length + 1)],
  };
}

describe('Phase C dirty-set filter — RELEASE_COSEIZED precision', () => {
  test('filtered path (>=8 C-events) matches unfiltered path (<8 C-events) bit-for-bit with RELEASE_COSEIZED', () => {
    const seed = 12345;
    const unfiltered = makeCoseizeModel({ decoyCount: 0 }); // 5 C-events — below threshold
    const filtered = makeCoseizeModel({ decoyCount: 5 }); // 10 C-events — engages enableFilteredPhaseC

    const unfilteredResult = buildEngine(unfiltered, seed).runAll();
    const filteredResult = buildEngine(filtered, seed).runAll();

    expect(filteredResult.summary).toEqual(unfilteredResult.summary);
    expect(filteredResult.finalTime).toEqual(unfilteredResult.finalTime);
    expect(filteredResult.runtimeMetrics.events_processed).toEqual(unfilteredResult.runtimeMetrics.events_processed);
    expect(filteredResult.runtimeMetrics.c_events_fired).toEqual(unfilteredResult.runtimeMetrics.c_events_fired);

    // Decoys use a disjoint resource pool (DecoyServer) and never depend on
    // anything RELEASE_COSEIZED touches. If RELEASE_COSEIZED's dirty marking fell
    // back to the `{ kind: "all" }` catch-all, every decoy would be needlessly
    // rescanned on every surgery completion — measured empirically at ~31.2k scans
    // (barely below the ~32.4k unfiltered baseline). With precise marking, decoys
    // are skipped and scans drop to ~8.4k. This ratio comfortably separates the two.
    expect(filteredResult.runtimeMetrics.c_event_scans).toBeLessThan(unfilteredResult.runtimeMetrics.c_event_scans * 0.5);
  });
});

// ── JOIN dirty-tracking precision (Sprint 98) ────────────────────────────────
// A JOIN C-event's condition (`queue(SyncQueue).length > 0`) is true on every
// cycle the rendezvous queue holds anyone, including all the do-nothing passes
// while a split family is still assembling — so JOIN leans on two pieces of
// shared Phase C machinery at once: compileEffectImpactTemplate() must
// classify JOIN(Q, Target) as a precise queue-only action (the `{kind:"all"}`
// fallback would re-dirty the whole model on every merge), and the effect
// no-op protocol must keep incomplete-family firings from restarting the
// scan. This differential drives a full SPLIT → parallel branches → JOIN
// pipeline under repeating traffic through both the filtered and unfiltered
// paths and requires bit-identical outcomes.

function makeForkJoinRealCEvents() {
  return [
    { id: 'c_triage', name: 'Triage', priority: 1,
      condition: 'queue(IntakeQueue).length > 0 AND idle(Nurse).count > 0',
      effect: 'ASSIGN(IntakeQueue, Nurse)',
      cSchedules: [{ eventId: 'b_triage_done', dist: 'Fixed', distParams: { value: '2' }, useEntityCtx: true }] },
    { id: 'c_lab', name: 'Run Test', priority: 2,
      condition: 'queue(TestQueue).length > 0 AND idle(Lab).count > 0',
      effect: 'ASSIGN(TestQueue, Lab)',
      cSchedules: [{ eventId: 'b_lab_done', dist: 'Fixed', distParams: { value: '4' }, useEntityCtx: true }] },
    { id: 'c_join', name: 'Rendezvous', priority: 3,
      condition: 'queue(SyncQueue).length > 0',
      effect: 'JOIN(SyncQueue, ReviewQueue)',
      cSchedules: [] },
    { id: 'c_review', name: 'Review', priority: 4,
      condition: 'queue(ReviewQueue).length > 0 AND idle(Consultant).count > 0',
      effect: 'ASSIGN(ReviewQueue, Consultant)',
      cSchedules: [{ eventId: 'b_review_done', dist: 'Fixed', distParams: { value: '3' }, useEntityCtx: true }] },
  ];
}

// Same disjoint-decoy trick as the RELEASE_COSEIZED suite: decoys depend only
// on their own queues and DecoyServer, none of which the fork/join pipeline
// ever touches.
function makeForkJoinDecoyCEvents(count, startPriority) {
  return Array.from({ length: count }, (_, index) => ({
    id: `c_decoy_${index + 1}`,
    name: `Decoy ${index + 1}`,
    priority: startPriority + index,
    condition: `queue(Decoy Queue ${index + 1}).length > 0 AND idle(DecoyServer).count > 0`,
    effect: `ASSIGN(Decoy Queue ${index + 1}, DecoyServer)`,
    cSchedules: [{ eventId: 'b_decoy_complete', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
  }));
}

function makeForkJoinModel({ decoyCount }) {
  const decoyQueueDefs = Array.from({ length: decoyCount }, (_, index) => ({
    id: `q_decoy_${index + 1}`,
    name: `Decoy Queue ${index + 1}`,
    customerType: 'Patient',
    discipline: 'FIFO',
  }));
  return {
    entityTypes: [
      { id: 'et_patient', name: 'Patient', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_nurse', name: 'Nurse', role: 'server', count: 1, attrDefs: [] },
      { id: 'et_lab', name: 'Lab', role: 'server', count: 2, attrDefs: [] },
      { id: 'et_consultant', name: 'Consultant', role: 'server', count: 1, attrDefs: [] },
      { id: 'et_decoy_server', name: 'DecoyServer', role: 'server', count: 2, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: 'q_intake', name: 'IntakeQueue', customerType: 'Patient', discipline: 'FIFO' },
      { id: 'q_test', name: 'TestQueue', customerType: 'Patient', discipline: 'FIFO' },
      { id: 'q_sync', name: 'SyncQueue', customerType: 'Patient', discipline: 'FIFO' },
      { id: 'q_review', name: 'ReviewQueue', customerType: 'Patient', discipline: 'FIFO' },
      ...decoyQueueDefs,
    ],
    bEvents: [
      { id: 'b_arrive', name: 'Patient Arrival', scheduledTime: '0',
        effect: 'ARRIVE(Patient, IntakeQueue)',
        schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: '7' } }] },
      { id: 'b_triage_done', name: 'Triage Done', scheduledTime: '9999',
        effect: ['SPLIT(Patient, 3, TestQueue)', 'RELEASE(Nurse, SyncQueue)'], schedules: [] },
      { id: 'b_lab_done', name: 'Lab Done', scheduledTime: '9999',
        effect: 'RELEASE(Lab, SyncQueue)', schedules: [] },
      { id: 'b_review_done', name: 'Review Done', scheduledTime: '9999',
        effect: 'COMPLETE()', schedules: [] },
      { id: 'b_decoy_complete', name: 'Decoy Complete', scheduledTime: '9999',
        effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [...makeForkJoinRealCEvents(), ...makeForkJoinDecoyCEvents(decoyCount, 5)],
  };
}

describe('Phase C dirty-set filter — SPLIT → JOIN pipeline', () => {
  test('filtered path (>=8 C-events) matches unfiltered path (<8 C-events) bit-for-bit under fork/join traffic', () => {
    const seed = 12345;
    const unfiltered = makeForkJoinModel({ decoyCount: 0 }); // 4 C-events — below threshold
    const filtered = makeForkJoinModel({ decoyCount: 4 }); // 8 C-events — engages enableFilteredPhaseC

    const unfilteredResult = buildEngine(unfiltered, seed).runAll();
    const filteredResult = buildEngine(filtered, seed).runAll();

    expect(filteredResult.summary).toEqual(unfilteredResult.summary);
    expect(filteredResult.finalTime).toEqual(unfilteredResult.finalTime);
    expect(filteredResult.runtimeMetrics.events_processed).toEqual(unfilteredResult.runtimeMetrics.events_processed);
    expect(filteredResult.runtimeMetrics.c_events_fired).toEqual(unfilteredResult.runtimeMetrics.c_events_fired);

    // The pipeline actually forked and joined in both runs — the differential
    // is vacuous otherwise.
    const joinMerges = (result) => result.log.flatMap((entry) =>
      (entry.event?.result ?? []).filter((m) => typeof m === 'string' && m.startsWith('JOIN: family')));
    expect(joinMerges(unfilteredResult).length).toBeGreaterThan(0);
    expect(joinMerges(filteredResult)).toEqual(joinMerges(unfilteredResult));

    // Real fired sequence must line up exactly. No-op JOIN evaluations are
    // excluded: they are scans, not fires, and the whole point of the filter
    // is that the filtered path may legitimately skip them.
    const realFiredSequence = (result) => result.log
      .filter((entry) => (entry.cEval?.conditionTrue && entry.cEval?.failureReason !== 'effect no-op') || entry.phase === 'B')
      .filter((entry) => !entry.cEval || !entry.cEval.eventId.startsWith('c_decoy_'))
      .map((entry) => `${entry.time}|${entry.phase}|${entry.cEval?.eventId ?? entry.event?.id ?? entry.message}`);

    expect(realFiredSequence(filteredResult)).toEqual(realFiredSequence(unfilteredResult));
  });
});
