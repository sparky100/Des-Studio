// RA7 — pre-run scan estimate vs the tier limit, and the runtime scan cap.
//
// The estimate is per replication: B-event firings (arrivals + stage
// completions along each entity's actual route + other recurring events) ×
// scans per B-event (default from the C-event count, or measured on the
// model's last run). It blocks only above 2× the tier limit; between 1× and
// 2× the run is allowed with a warning and the engine stops any replication
// at 2× the limit.

import { describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { estimateRunComplexity, estimateMaxCycles, scansPerBEventFromMetrics } from "../../src/engine/complexity-estimator.js";
import { getRunAdmission, RUN_ADMISSION_TIERS, SCAN_BLOCK_FACTOR } from "../../src/engine/run-admission.js";

const FREE_LIMIT = RUN_ADMISSION_TIERS.free.maxScans;
const T = 200;

// Three loading terminals, each feeding three voyages (one picked at random)
// and one refinery: 15 ASSIGN stages and 15 C-events, but every cargo visits
// only 3 of them. The old estimate assumed every entity visited every stage.
function shippingNetwork({ arrivalMean = 1.2, withTick = true } = {}) {
  const regions = ["Gulf", "Africa", "Coast"];
  const entityTypes = [{ id: "cargo", name: "Cargo", role: "customer", count: 0, attrDefs: [] }];
  const queues = [];
  const bEvents = [];
  const cEvents = [];
  for (const r of regions) {
    entityTypes.push({ id: `berth_${r}`, name: `${r} Berth`, role: "server", count: "20", attrDefs: [] });
    entityTypes.push({ id: `ship_${r}`, name: `${r} Ship`, role: "server", count: "60", attrDefs: [] });
    entityTypes.push({ id: `ref_${r}`, name: `${r} Refinery`, role: "server", count: "20", attrDefs: [] });
    queues.push({ id: `q_load_${r}`, name: `${r} Load Queue` }, { id: `q_ref_${r}`, name: `${r} Refinery Queue` });
    bEvents.push({
      id: `arr_${r}`, name: `${r} Arrival`, scheduledTime: "0", effect: `ARRIVE(Cargo, ${r} Load Queue)`,
      schedules: [{ eventId: `arr_${r}`, dist: "Exponential", distParams: { mean: String(arrivalMean) } }],
    });
    bEvents.push({
      id: `loaded_${r}`, name: `${r} Loaded`, scheduledTime: "9999", effect: `RELEASE(${r} Berth)`, schedules: [],
      probabilisticRouting: [0, 1, 2].map(v => ({ queueName: `${r} Voyage ${v}`, probability: 1 / 3 })),
    });
    cEvents.push({
      id: `load_${r}`, name: `Load ${r}`, priority: 1, effect: `ASSIGN(${r} Load Queue, ${r} Berth)`,
      condition: `queue(${r} Load Queue).length > 0 AND idle(${r} Berth).count > 0`,
      cSchedules: [{ eventId: `loaded_${r}`, dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    });
    for (const v of [0, 1, 2]) {
      queues.push({ id: `q_voy_${r}_${v}`, name: `${r} Voyage ${v}` });
      bEvents.push({
        id: `arrived_${r}_${v}`, name: `${r} Voyage ${v} Done`, scheduledTime: "9999", effect: `RELEASE(${r} Ship)`, schedules: [],
        probabilisticRouting: [{ queueName: `${r} Refinery Queue`, probability: 1 }],
      });
      cEvents.push({
        id: `voy_${r}_${v}`, name: `Voyage ${r} ${v}`, priority: 2, effect: `ASSIGN(${r} Voyage ${v}, ${r} Ship)`,
        condition: `queue(${r} Voyage ${v}).length > 0 AND idle(${r} Ship).count > 0`,
        cSchedules: [{ eventId: `arrived_${r}_${v}`, dist: "Fixed", distParams: { value: "3" }, useEntityCtx: true }],
      });
    }
    bEvents.push({ id: `refined_${r}`, name: `${r} Refined`, scheduledTime: "9999", effect: "COMPLETE()", schedules: [] });
    cEvents.push({
      id: `ref_${r}`, name: `Refine ${r}`, priority: 3, effect: `ASSIGN(${r} Refinery Queue, ${r} Refinery)`,
      condition: `queue(${r} Refinery Queue).length > 0 AND idle(${r} Refinery).count > 0`,
      cSchedules: [{ eventId: `refined_${r}`, dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    });
  }
  if (withTick) {
    bEvents.push({ id: "tick", name: "Daily Tick", scheduledTime: "0", effect: "ticks++", schedules: [{ eventId: "tick", dist: "Fixed", distParams: { value: "1" } }] });
  }
  return { entityTypes, queues, bEvents, cEvents, stateVariables: [{ name: "ticks", initialValue: 0 }] };
}

function admit(model, overrides = {}) {
  return getRunAdmission(model, {
    tier: "free",
    terminationMode: "time",
    maxSimTime: T,
    replications: 1,
    validation: { errors: [], warnings: [] },
    modelCheckIssues: [],
    ...overrides,
  });
}

function run(model, admission, cap = admission.effectiveSettings.maxCEventScans) {
  return buildEngine(model, 11, 0, T, null, estimateMaxCycles(admission.complexityEstimate), 5000, false, undefined,
    { collectTrace: false, maxCEventScans: cap }).runAll();
}

const scanIssues = admission => [...admission.hardErrors, ...admission.warnings].filter(i => i.code === "RA7" || i.code === "RA8");

describe("RA7 scan estimate", () => {
  it("does not block a model whose naive (every entity × every stage) estimate is over the limit but whose real scans are not", () => {
    const model = shippingNetwork();
    const admission = admit(model);
    const est = admission.complexityEstimate;

    // The pre-fix formula: entities × (1 + stage C-events) B-events × every C-event.
    const naive = est.expectedEntities * (1 + 15) * est.cEventCount;
    expect(naive).toBeGreaterThan(SCAN_BLOCK_FACTOR * FREE_LIMIT);

    expect(est.stageVisitBasis).toBe("flow");
    expect(est.meanStageVisitsPerEntity).toBe(3);
    expect(admission.effectiveSettings.allowRun).toBe(true);
    expect(admission.hardErrors.some(i => i.code === "RA7")).toBe(false);

    const result = run(model, admission);
    expect(result.scanLimitReached).toBe(false);
    expect(result.finalTime).toBe(T);
    expect(result.runtimeMetrics.c_event_scans).toBeLessThan(FREE_LIMIT);
    // B-events now track the real count closely; the default scans-per-event
    // (one per C-event) stays on the safe side of what filtering achieves.
    const bFirings = result.runtimeMetrics.events_processed - result.runtimeMetrics.c_events_fired;
    expect(est.estimatedBEventFirings / bFirings).toBeGreaterThan(0.9);
    expect(est.estimatedBEventFirings / bFirings).toBeLessThan(1.2);
    expect(est.estimatedCEventScans).toBeGreaterThanOrEqual(result.runtimeMetrics.c_event_scans);
  });

  it("still blocks a model that genuinely needs more than 2× the limit", () => {
    // A tier with a 2,000-scan limit keeps the real run small enough for a unit test.
    const tierPolicies = { free: { maxScans: 2000 } };
    const model = shippingNetwork();
    const admission = admit(model, { tierPolicies });
    const [ra7] = scanIssues(admission);
    expect(admission.effectiveSettings.allowRun).toBe(false);
    expect(ra7.code).toBe("RA7");
    expect(ra7.message).toMatch(/more than 2× the free tier limit of 2,000 per replication/);
    expect(ra7.message).toMatch(/Basis: about [\d,]+ B-events per replication × [\d.]+ scans each \(estimated for 15 C-events\)/);

    // And it really is that big: uncapped, one replication runs well past 2× the limit.
    const result = run(model, admission, null);
    expect(result.runtimeMetrics.c_event_scans).toBeGreaterThan(SCAN_BLOCK_FACTOR * 2000);
  });

  it("warns instead of blocking when the estimate is between 1× and 2× the limit", () => {
    const model = shippingNetwork({ arrivalMean: 0.4 });
    const admission = admit(model);
    const est = admission.complexityEstimate.estimatedCEventScans;
    expect(est).toBeGreaterThan(FREE_LIMIT);
    expect(est).toBeLessThanOrEqual(SCAN_BLOCK_FACTOR * FREE_LIMIT);

    expect(admission.effectiveSettings.allowRun).toBe(true);
    const [ra8] = scanIssues(admission);
    expect(ra8.code).toBe("RA8");
    expect(ra8.message).toMatch(/exceed the free tier limit of 50,000 per replication/);
    expect(ra8.message).toMatch(/100,000 scans will stop early/);
    expect(admission.confirmations.some(c => c.code === "RA9")).toBe(true);
    expect(admission.effectiveSettings.maxCEventScans).toBe(SCAN_BLOCK_FACTOR * FREE_LIMIT);
  });

  it("uses the measured scans-per-event ratio from the model's last run when the C-event count matches", () => {
    const model = shippingNetwork();
    const first = admit(model);
    const result = run(model, first);
    const calibration = scansPerBEventFromMetrics(result.runtimeMetrics, model.cEvents.length);
    expect(calibration).not.toBeNull();

    const est = estimateRunComplexity(model, { terminationMode: "time", maxSimTime: T, calibration });
    expect(est.scanBasis).toBe("measured");
    expect(est.estimatedCEventScans).toBe(Math.ceil(est.estimatedBEventFirings * est.scansPerBEvent));
    // Measured on the same model, the estimate lands close to the real count.
    expect(est.estimatedCEventScans / result.runtimeMetrics.c_event_scans).toBeGreaterThan(0.85);
    expect(est.estimatedCEventScans / result.runtimeMetrics.c_event_scans).toBeLessThan(1.2);
    expect(admit(model, { complexityEstimate: { ...est, estimatedCEventScans: 1.5 * FREE_LIMIT } }).warnings
      .find(i => i.code === "RA8").message).toMatch(/measured on this model's last run/);

    // A structural change (different C-event count) discards the measurement.
    const stale = estimateRunComplexity(model, { terminationMode: "time", maxSimTime: T, calibration: { ...calibration, cEventCount: 3 } });
    expect(stale.scanBasis).toBe("filtered");
  });

  it("falls back to every-entity-visits-every-stage when the route can't be traced", () => {
    const model = shippingNetwork();
    model.bEvents[1].loopConfig = { maxLoopCount: 3, exitQueueName: "Gulf Refinery Queue" };
    const est = estimateRunComplexity(model, { terminationMode: "time", maxSimTime: T });
    expect(est.stageVisitBasis).toBe("all-stages");
    expect(est.meanStageVisitsPerEntity).toBe(15);
  });
});

describe("runtime C-event scan cap", () => {
  it("stops a replication cleanly at the cap and flags it", () => {
    const model = shippingNetwork({ arrivalMean: 0.4 });
    const result = buildEngine(model, 11, 0, T, null, 1e7, 5000, false, undefined, { collectTrace: false, maxCEventScans: 5000 }).runAll();
    expect(result.scanLimitReached).toBe(true);
    expect(result.cycleLimitReached).toBe(false);
    expect(result.finalTime).toBeLessThan(T);
    expect(result.runtimeMetrics.c_event_scans).toBeGreaterThanOrEqual(5000);
    // Checked once per cycle, so it overshoots by at most one cycle's scans.
    expect(result.runtimeMetrics.c_event_scans).toBeLessThan(5000 + 15 * 20);
    expect(result.warnings.some(w => /Scan limit reached \(5,000 C-event scans\)/.test(w))).toBe(true);
  });

  it("step() reports done and stays done once the cap is reached", () => {
    const engine = buildEngine(shippingNetwork(), 11, 0, T, null, 1e7, 5000, false, undefined, { collectTrace: false, maxCEventScans: 500 });
    let r;
    for (let i = 0; i < 10_000; i++) { r = engine.step({ captureSnap: false }); if (r.done) break; }
    expect(r.scanLimitReached).toBe(true);
    expect(engine.step({ captureSnap: false })).toEqual(expect.objectContaining({ done: true, scanLimitReached: true }));
  });

  it("has no effect when no cap is given", () => {
    const result = run(shippingNetwork(), admit(shippingNetwork()), null);
    expect(result.scanLimitReached).toBe(false);
  });
});

describe("cycle cap sizing", () => {
  // A model whose work is mostly a frequent non-arrival B-event (a 0.1-unit
  // tick) — previously ignored by the estimate, so the derived cycle cap
  // halted the run halfway.
  it("counts self-recurring non-arrival B-events so a tick-driven model runs to the end", () => {
    const model = {
      entityTypes: [{ id: "c", name: "Job", role: "customer", attrDefs: [] }, { id: "s", name: "M", role: "server", count: "1", attrDefs: [] }],
      queues: [{ id: "q", name: "Q" }],
      stateVariables: [{ name: "ticks", initialValue: 0 }],
      bEvents: [
        { id: "arr", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Job, Q)", schedules: [{ eventId: "arr", dist: "Fixed", distParams: { value: "100" } }] },
        { id: "tick", name: "Tick", scheduledTime: "0", effect: "ticks++", schedules: [{ eventId: "tick", dist: "Fixed", distParams: { value: "0.1" } }] },
        { id: "done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [{ id: "c1", name: "Work", priority: 1, effect: "ASSIGN(Q, M)", condition: "queue(Q).length > 0 AND idle(M).count > 0",
        cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] }],
    };
    const est = estimateRunComplexity(model, { terminationMode: "time", maxSimTime: 1000 });
    expect(est.otherRecurringFirings).toBe(10001);
    const result = buildEngine(model, 1, 0, 1000, null, estimateMaxCycles(est), 5000, false, undefined, { collectTrace: false }).runAll();
    expect(result.cycleLimitReached).toBe(false);
    expect(result.finalTime).toBe(1000);
  });
});
