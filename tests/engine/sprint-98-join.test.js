// Sprint 98 — JOIN(Queue, TargetQueue): fork/join rendezvous for SPLIT
// families, closing the last correctness-level Group B gap from
// docs/reviews/macro-library-ui-coverage-audit.md ("SPLIT has no JOIN
// counterpart"). Every scenario here exercises the full
// SPLIT → parallel branches → JOIN round trip through the real engine —
// the lineage JOIN consumes is always produced by an actual SPLIT firing
// in the same run, never hand-constructed on fixture entities.
import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

// Canonical fork/join pipeline:
//   Patient arrives t=0 → IntakeQueue → ASSIGN(Nurse), Fixed 2 triage →
//   triage-done B-event ["SPLIT(Patient, N, TestQueue)", "RELEASE(Nurse, SyncQueue)"]
//   (clones fan out to the parallel-work queue; the parent routes to the
//   rendezvous queue) → TestQueue served by Lab, Fixed 4 → lab completions
//   RELEASE(Lab, SyncQueue) → JOIN(SyncQueue, ReviewQueue) → ASSIGN(Consultant),
//   Fixed 3 review → COMPLETE.
// With the defaults (N=3, one Lab) the timeline is: split t=2, clones reach
// SyncQueue staggered t=6 and t=10, join t=10, review 10→13, sojourn 13.
function forkJoinModel({
  splitN = 3,
  nurseCount = 1,
  labCount = 1,
  labService = "4",
  consultantCount = 1,
  testQueueCapacity = null,
  testQueueRenege = null,
  syncQueueCapacity = null,
  syncQueueRenege = null,
  arrivalRepeatEvery = null,
  extraArrivalTimes = [],
  includeReview = true,
} = {}) {
  const testQueue = { id: "q_test", name: "TestQueue", discipline: "FIFO" };
  if (testQueueCapacity != null) testQueue.capacity = String(testQueueCapacity);
  if (testQueueRenege != null) {
    testQueue.renegeDist = "Fixed";
    testQueue.renegeDistParams = { value: String(testQueueRenege) };
  }
  const syncQueue = { id: "q_sync", name: "SyncQueue", discipline: "FIFO" };
  if (syncQueueCapacity != null) syncQueue.capacity = String(syncQueueCapacity);
  if (syncQueueRenege != null) {
    syncQueue.renegeDist = "Fixed";
    syncQueue.renegeDistParams = { value: String(syncQueueRenege) };
  }

  const model = {
    entityTypes: [
      { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
      { id: "nurse", name: "Nurse", role: "server", count: nurseCount, attrDefs: [] },
      { id: "lab", name: "Lab", role: "server", count: labCount, attrDefs: [] },
      { id: "consultant", name: "Consultant", role: "server", count: consultantCount, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: "q_intake", name: "IntakeQueue", discipline: "FIFO" },
      testQueue,
      syncQueue,
      { id: "q_review", name: "ReviewQueue", discipline: "FIFO" },
    ],
    bEvents: [
      { id: "arrival", name: "Patient Arrival", scheduledTime: "0",
        effect: "ARRIVE(Patient, IntakeQueue)",
        schedules: arrivalRepeatEvery != null
          ? [{ eventId: "arrival", dist: "Fixed", distParams: { value: String(arrivalRepeatEvery) } }]
          : [] },
      { id: "triage-done", name: "Triage Done", scheduledTime: "9999",
        effect: [`SPLIT(Patient, ${splitN}, TestQueue)`, "RELEASE(Nurse, SyncQueue)"],
        schedules: [] },
      { id: "lab-done", name: "Lab Done", scheduledTime: "9999",
        effect: "RELEASE(Lab, SyncQueue)", schedules: [] },
      { id: "review-done", name: "Review Done", scheduledTime: "9999",
        effect: "COMPLETE()", schedules: [] },
    ],
    cEvents: [
      { id: "ce_triage", name: "Triage", priority: 1,
        condition: "queue(IntakeQueue).length > 0 AND idle(Nurse).count > 0",
        effect: "ASSIGN(IntakeQueue, Nurse)",
        cSchedules: [{ eventId: "triage-done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }] },
      { id: "ce_lab", name: "Run Test", priority: 2,
        condition: "queue(TestQueue).length > 0 AND idle(Lab).count > 0",
        effect: "ASSIGN(TestQueue, Lab)",
        cSchedules: [{ eventId: "lab-done", dist: "Fixed", distParams: { value: labService }, useEntityCtx: true }] },
      { id: "ce_join", name: "Rendezvous", priority: 3,
        condition: "queue(SyncQueue).length > 0",
        effect: "JOIN(SyncQueue, ReviewQueue)",
        cSchedules: [] },
    ],
  };
  for (const [i, t] of extraArrivalTimes.entries()) {
    model.bEvents.push({
      id: `arrival${i + 2}`, name: `Patient Arrival ${i + 2}`, scheduledTime: String(t),
      effect: "ARRIVE(Patient, IntakeQueue)", schedules: [],
    });
  }
  if (includeReview) {
    model.cEvents.push({ id: "ce_review", name: "Review", priority: 4,
      condition: "queue(ReviewQueue).length > 0 AND idle(Consultant).count > 0",
      effect: "ASSIGN(ReviewQueue, Consultant)",
      cSchedules: [{ eventId: "review-done", dist: "Fixed", distParams: { value: "3" }, useEntityCtx: true }] });
  }
  return model;
}

const run = (model, horizon = 30, seed = 42) => buildEngine(model, seed, 0, horizon).runAll();

const customers = (result) => result.entitySummary.filter(e => e.role === "customer");
const clonesOf = (result, parentId) =>
  customers(result).filter(e => e._splitFrom === parentId);
// One JOIN firing can merge several complete families and reports each as its
// own message inside a single log entry — count merge messages, not entries.
const joinMsgs = (result) => result.log.flatMap(e =>
  (e.event?.result ?? []).filter(m => typeof m === "string" && m.startsWith("JOIN: family")));
// A JOIN C-event's condition (rendezvous queue non-empty) stays true while a
// family assembles, so do-nothing firings are routine — the engine's no-op
// protocol must keep them from spinning Phase C into its pass cap.
const expectNoPhaseCStorm = (result) =>
  expect((result.warnings ?? []).filter(w => String(w).includes("Phase C truncated"))).toEqual([]);

describe('JOIN — fork/join happy path (full SPLIT → branches → JOIN round trip)', () => {
  test('the fork\'s ledger and the join\'s intake agree, and the original parent survives', () => {
    const result = run(forkJoinModel());

    // SPLIT side: the fork actually happened and recorded its lineage.
    const parent = customers(result).find(e => e._splitParent === true);
    expect(parent).toBeDefined();
    expect(parent._splitChildren).toHaveLength(2);
    const clones = clonesOf(result, parent.id);
    expect(clones).toHaveLength(2);
    for (const clone of clones) expect(clone._splitFrom).toBe(parent.id);

    // JOIN side: it consumed exactly the ids SPLIT recorded — no more, no less.
    expect(parent.joined).toBeDefined();
    const mergedIds = parent.joined.children.map(c => c.id).sort((a, b) => a - b);
    expect(mergedIds).toEqual([...parent._splitChildren].sort((a, b) => a - b));
    expect(parent.joined.lostMemberIds).toEqual([]);

    // The ORIGINAL parent survives with its original arrival time.
    expect(parent.arrivalTime).toBe(0);

    // Clones are terminated MATCH-style, visible in results.
    for (const clone of clones) {
      expect(clone.status).toBe("done");
      expect(clone.outcome?.endedBy).toBe("JOIN");
      expect(clone.outcome?.routeId).toBe("macro:JOIN");
      // Label names the merge destination (stable across every JOIN completion),
      // not the per-instance survivor id — outcomes aggregate by routeId across
      // an entire run, so an id-bearing label would misrepresent the aggregate
      // with one arbitrary survivor's id (e.g. "Joined into #257").
      expect(clone.outcome?.routeLabel).toBe("Joined into ReviewQueue");
      expect(clone._joinedInto).toBe(parent.id);
    }

    // Exactly one entity continued past the join: the survivor completed review.
    expect(parent.status).toBe("done");
    expect(parent.outcome?.endedBy).not.toBe("JOIN");
    const doneNotByJoin = customers(result).filter(e => e.status === "done" && e.outcome?.endedBy !== "JOIN");
    expect(doneNotByJoin).toHaveLength(1);

    // One JOIN merge logged, naming family root and survivor.
    const merges = joinMsgs(result);
    expect(merges).toHaveLength(1);
    expect(merges[0]).toContain(`family #${parent.id} → #${parent.id}`);
    expect(merges[0]).toContain('2 member(s) merged');
    expect(merges[0]).toContain('"ReviewQueue"');
    expectNoPhaseCStorm(result);
  });

  test('KPI correctness: the join waits for the slowest branch and sojourn spans the whole fork-join', () => {
    const result = run(forkJoinModel());
    const parent = customers(result).find(e => e._splitParent === true);

    // One Lab, Fixed 4: clones finish t=6 and t=10 — the join can only fire at
    // the slowest branch's completion.
    expect(parent.joined.at).toBe(10);
    // Review is Fixed 3 after the join: completion at 13, spanning
    // pre-split service (2) + slowest branch (8) + review (3) from arrival t=0.
    expect(parent.completionTime).toBe(13);
    expect(parent.completionTime - parent.arrivalTime).toBe(13);
    // Both clones were terminated at the join, not before.
    for (const clone of clonesOf(result, parent.id)) {
      expect(clone.completionTime).toBe(10);
    }
  });

  test('survivor lands in TargetQueue with standard queue semantics (no downstream consumer)', () => {
    const result = run(forkJoinModel({ includeReview: false }));
    const parent = customers(result).find(e => e._splitParent === true);
    expect(parent.joined).toBeDefined();
    expect(parent.status).toBe("waiting");
    expect(parent.queue).toBe("ReviewQueue");
  });
});

describe('JOIN — SPLIT quantity variations', () => {
  test.each([
    // [splitN, expected clone count, horizon]  (one Lab, Fixed 4 → last clone
    // finishes at 2 + 4*(N-1), then review Fixed 3)
    [2, 1, 30],
    [5, 4, 40],
  ])('N=%i: the join completes with the family size SPLIT actually recorded', (splitN, expectedClones, horizon) => {
    const result = run(forkJoinModel({ splitN }), horizon);
    const parent = customers(result).find(e => e._splitParent === true);
    expect(parent._splitChildren).toHaveLength(expectedClones);
    expect(parent.joined.children).toHaveLength(expectedClones);
    expect(parent.joined.at).toBe(2 + 4 * expectedClones);
    expect(parent.status).toBe("done");
    const clones = clonesOf(result, parent.id);
    expect(clones).toHaveLength(expectedClones);
    for (const clone of clones) expect(clone.outcome?.endedBy).toBe("JOIN");
  });
});

describe('JOIN — degraded forks and lost members (lenient completeness)', () => {
  test('balk at the fork: JOIN completes with the smaller family SPLIT recorded', () => {
    // TestQueue capacity 1: of the two clones SPLIT tries to create at t=2,
    // the second balks at birth and is never recorded in _splitChildren.
    const result = run(forkJoinModel({ testQueueCapacity: 1 }));
    const parent = customers(result).find(e => e._splitParent === true);
    expect(parent._splitChildren).toHaveLength(1);
    // The balked clone was spliced out of the system entirely.
    expect(clonesOf(result, parent.id)).toHaveLength(1);

    // The join proceeds with the one recorded clone — nothing waits for the
    // balked one, and it is not "lost" (SPLIT never recorded it).
    expect(parent.joined.children).toHaveLength(1);
    expect(parent.joined.lostMemberIds).toEqual([]);
    expect(parent.joined.at).toBe(6);
    expect(parent.status).toBe("done");
    expect(parent.completionTime).toBe(9);
  });

  test('lost via renege: a clone reneging between fork and join degrades the join instead of deadlocking it', () => {
    // One Lab: clone A is seized at t=2 (done t=6), clone B waits in TestQueue
    // and reneges at t=2+3=5 (before the Lab frees at t=6 and could seize it).
    // The family is then complete-with-loss when clone A arrives at t=6.
    const result = run(forkJoinModel({ testQueueRenege: 3 }));
    const parent = customers(result).find(e => e._splitParent === true);
    const clones = clonesOf(result, parent.id);
    const reneged = clones.filter(c => c.status === "reneged");
    const merged = clones.filter(c => c.outcome?.endedBy === "JOIN");
    expect(reneged).toHaveLength(1);
    expect(merged).toHaveLength(1);

    expect(parent.joined.at).toBe(6);
    expect(parent.joined.children.map(c => c.id)).toEqual([merged[0].id]);
    expect(parent.joined.lostMemberIds).toEqual([reneged[0].id]);
    expect(parent.status).toBe("done");
    expect(parent.completionTime).toBe(9);

    const merge = joinMsgs(result)[0];
    expect(merge).toContain('1 lost en route');
    expect(merge).toContain(`#${reneged[0].id}`);
  });

  test('lost via vanish: a clone spliced out of the system (capacity block, no overflow) is counted as lost', () => {
    // SyncQueue capacity 2: parent (t=2) and clone A (t=6) fill it; clone B's
    // release at t=10 finds it full, and with no overflow destination the
    // clone exits the system — absent from entities[] entirely, the
    // "absent = lost" branch (distinct from terminal-status loss above).
    const result = run(forkJoinModel({ syncQueueCapacity: 2 }));
    const parent = customers(result).find(e => e._splitParent === true);
    const clones = clonesOf(result, parent.id);
    // The vanished clone left no trace in the summary.
    expect(clones).toHaveLength(1);

    expect(parent.joined.children).toHaveLength(1);
    expect(parent.joined.lostMemberIds).toHaveLength(1);
    const lostId = parent.joined.lostMemberIds[0];
    expect(customers(result).some(e => e.id === lostId)).toBe(false);
    expect(parent.joined.at).toBe(10);
    expect(parent.status).toBe("done");

    expect(joinMsgs(result)[0]).toContain('1 lost en route');
  });

  test('parent lost between fork and join: the earliest-arrived clone survives', () => {
    // Two Labs so both clones run in parallel (t=2→6). The parent reneges out
    // of SyncQueue at t=2+3=5, before either clone arrives.
    const result = run(forkJoinModel({ labCount: 2, syncQueueRenege: 3 }));
    const parent = customers(result).find(e => e._splitParent === true);
    expect(parent.status).toBe("reneged");

    const clones = clonesOf(result, parent.id);
    const survivor = clones.find(c => c.joined);
    const merged = clones.filter(c => c.outcome?.endedBy === "JOIN");
    expect(survivor).toBeDefined();
    expect(merged).toHaveLength(1);
    expect(survivor.joined.at).toBe(6);
    expect(survivor.joined.children.map(c => c.id)).toEqual([merged[0].id]);
    expect(survivor.joined.lostMemberIds).toEqual([parent.id]);
    // The clone survivor completes the review stage the parent never reached.
    expect(survivor.status).toBe("done");
    expect(survivor.outcome?.endedBy).not.toBe("JOIN");
    expect(survivor.completionTime).toBe(9);

    expect(joinMsgs(result)[0]).toContain(`family #${parent.id} → #${survivor.id}`);
  });

  test('incomplete family: nothing merges while a branch is still in flight', () => {
    // Lab service Fixed 100 stretches past the horizon — the family never
    // completes, so the join must never fire (and must not deadlock the run).
    const result = run(forkJoinModel({ labService: "100" }), 20);
    const parent = customers(result).find(e => e._splitParent === true);
    expect(parent.joined).toBeUndefined();
    expect(parent.status).toBe("waiting");
    expect(parent.queue).toBe("SyncQueue");

    const clones = clonesOf(result, parent.id);
    expect(clones).toHaveLength(2);
    expect(clones.some(c => c.status === "serving")).toBe(true);
    expect(clones.every(c => c.outcome?.endedBy !== "JOIN")).toBe(true);

    expect(joinMsgs(result)).toHaveLength(0);
    expectNoPhaseCStorm(result);
    // Nothing reached the target queue.
    expect(customers(result).some(e => e.queue === "ReviewQueue")).toBe(false);
  });
});

describe('JOIN — selectivity and concurrency', () => {
  test('non-split entities waiting in the rendezvous queue are never touched', () => {
    const model = forkJoinModel();
    model.entityTypes.push({ id: "visitor", name: "Visitor", role: "customer", attrDefs: [] });
    model.bEvents.push({ id: "v-arrival", name: "Visitor Arrival", scheduledTime: "1",
      effect: "ARRIVE(Visitor, SyncQueue)", schedules: [] });

    const result = run(model);
    const visitor = customers(result).find(e => e.type === "Visitor");
    expect(visitor.status).toBe("waiting");
    expect(visitor.queue).toBe("SyncQueue");
    expect(visitor.joined).toBeUndefined();
    expect(visitor.outcome?.endedBy).not.toBe("JOIN");

    // The split family still merged around the bystander.
    const parent = customers(result).find(e => e._splitParent === true);
    expect(parent.joined.children).toHaveLength(2);
    expect(parent.status).toBe("done");
  });

  test('two concurrent families interleaved in the same rendezvous queue merge independently', () => {
    // Two patients (t=0, t=1), two Nurses, two Labs: family 1 splits at t=2
    // and its clones run t=2→6; family 2 splits at t=3, its clones wait for
    // the Labs and run t=6→10. Both families' members share SyncQueue.
    const result = run(forkJoinModel({
      nurseCount: 2, labCount: 2, consultantCount: 2, extraArrivalTimes: [1],
    }), 40);

    const parents = customers(result).filter(e => e._splitParent === true);
    expect(parents).toHaveLength(2);
    for (const parent of parents) {
      // Each family's join consumed exactly its own recorded clones — no
      // cross-family leakage.
      expect(parent.joined).toBeDefined();
      const mergedIds = parent.joined.children.map(c => c.id).sort((a, b) => a - b);
      expect(mergedIds).toEqual([...parent._splitChildren].sort((a, b) => a - b));
      expect(parent.joined.lostMemberIds).toEqual([]);
      expect(parent.status).toBe("done");
      for (const clone of clonesOf(result, parent.id)) {
        expect(clone._joinedInto).toBe(parent.id);
      }
    }
    expect(joinMsgs(result)).toHaveLength(2);
  });

  test('multiple complete families in one pass all merge', () => {
    // Both patients arrive t=0 with capacity for full parallelism: both split
    // at t=2, all four clones run t=2→6, so both families complete in the
    // same Phase C pass at t=6.
    const result = run(forkJoinModel({
      nurseCount: 2, labCount: 4, consultantCount: 2, extraArrivalTimes: [0],
    }), 40);

    const parents = customers(result).filter(e => e._splitParent === true);
    expect(parents).toHaveLength(2);
    for (const parent of parents) {
      expect(parent.joined.at).toBe(6);
      expect(parent.joined.children).toHaveLength(2);
      expect(parent.status).toBe("done");
      expect(parent.completionTime).toBe(9);
    }
    expect(joinMsgs(result)).toHaveLength(2);
  });

  test('repeating pipeline: successive generations of families all complete with no state bleed', () => {
    // Arrivals every 10 over a 35-tick horizon: generation k arrives at
    // t=10k, joins at t=10k+10, completes at t=10k+13 — three full cycles.
    const result = run(forkJoinModel({ arrivalRepeatEvery: 10 }), 35);

    const parents = customers(result).filter(e => e._splitParent === true && e.joined);
    expect(parents.length).toBeGreaterThanOrEqual(3);
    const completed = parents.filter(p => p.status === "done");
    expect(completed).toHaveLength(3);
    for (const parent of completed) {
      expect(parent.joined.children).toHaveLength(2);
      expect(parent.joined.lostMemberIds).toEqual([]);
      expect(parent.joined.at - parent.arrivalTime).toBe(10);
      expect(parent.completionTime - parent.arrivalTime).toBe(13);
    }
    const mergedClones = customers(result).filter(e => e.outcome?.endedBy === "JOIN");
    expect(mergedClones).toHaveLength(6);
  });
});

describe('JOIN — Phase C no-op protocol boundary', () => {
  test('a mixed effect (JOIN + scalar) is NOT a no-op: the scalar part still changes state', () => {
    // The no-op skip applies only when EVERY part of the effect marks itself
    // a no-op. Here `joinPasses++` mutates state on each firing, so the
    // C-event must keep its normal fire/restart semantics even while the
    // JOIN half has nothing to do — the counter proves the firings happened.
    const model = forkJoinModel();
    model.stateVariables = [{ name: "joinPasses", initial: 0 }];
    model.cEvents.find(c => c.id === "ce_join").effect = ["JOIN(SyncQueue, ReviewQueue)", "joinPasses++"];

    const result = run(model);
    const parent = customers(result).find(e => e._splitParent === true);
    expect(parent.joined).toBeDefined();
    expect(parent.status).toBe("done");
    // The scalar fired on incomplete-family passes too, not just at the merge.
    expect(result.snap.scalars.joinPasses).toBeGreaterThan(1);
  });
});

describe('JOIN — conservation invariant', () => {
  // For every run: #clones SPLIT created == #merged by JOIN + #lost en route
  // + #still in flight — no clone unaccounted for, none double-consumed.
  function reconcile(result) {
    const parents = customers(result).filter(e => e._splitParent === true);
    const cloneIds = new Set(parents.flatMap(p => p._splitChildren));
    const created = cloneIds.size;
    const merged = customers(result).filter(e => e.outcome?.endedBy === "JOIN").length;
    // Only clone ids count as lost clones — a lost *parent* also appears in
    // lostMemberIds but belongs to the parent's own ledger, not the clones'.
    const lost = parents
      .flatMap(p => p.joined?.lostMemberIds ?? [])
      .concat(customers(result).filter(e => e.joined && e._splitFrom != null)
        .flatMap(s => s.joined.lostMemberIds))
      .filter(id => cloneIds.has(id)).length;
    const cloneIsSurvivor = customers(result).filter(e => e._splitFrom != null && e.joined).length;
    const inFlight = customers(result).filter(e =>
      e._splitFrom != null && !e.joined && e.outcome?.endedBy !== "JOIN" &&
      !["done", "reneged"].includes(e.status)).length;
    return { created, accounted: merged + lost + cloneIsSurvivor + inFlight };
  }

  test.each([
    ['happy path', forkJoinModel(), 30],
    ['lost via renege', forkJoinModel({ testQueueRenege: 3 }), 30],
    ['parent lost', forkJoinModel({ labCount: 2, syncQueueRenege: 3 }), 30],
    ['incomplete family', forkJoinModel({ labService: "100" }), 20],
    ['repeating pipeline', forkJoinModel({ arrivalRepeatEvery: 10 }), 35],
  ])('%s: every clone is accounted for exactly once', (_name, model, horizon) => {
    const result = run(model, horizon);
    const { created, accounted } = reconcile(result);
    expect(created).toBeGreaterThan(0);
    expect(accounted).toBe(created);
  });

  test('lost-via-renege ledger: the reneged clone is lost, not merged (terminal-status branch)', () => {
    const result = run(forkJoinModel({ testQueueRenege: 3 }));
    const parent = customers(result).find(e => e._splitParent === true);
    const renegedClone = clonesOf(result, parent.id).find(c => c.status === "reneged");
    expect(parent.joined.lostMemberIds).toContain(renegedClone.id);
    expect(parent.joined.children.map(c => c.id)).not.toContain(renegedClone.id);
  });
});
