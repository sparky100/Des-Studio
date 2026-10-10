// An entity holding a server across stages ("carried" claim):
//   COSEIZE(Gulf Loading Queue, Gulf Terminal Berth, VLCC)
//   → RELEASE_COSEIZED([Gulf Terminal Berth], Hormuz Queue)   (keeps the VLCC)
//   → ASSIGN(Hormuz Queue, Hormuz Transit Lane)              (second claim)
//   → RELEASE(Hormuz Transit Lane, Voyage Queue)
//   → DELAY(Voyage Queue)
//   → RELEASE(VLCC, Asia Crude Queue)
// A failure/preemption of one server must not strip the others, and losing
// the carried VLCC must not strand the entity.

import { describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";

const fix = v => ({ dist: "Fixed", distParams: { value: String(v) } });
const srv = (name, count, extra = {}) => ({ id: name.replace(/\W/g, "_"), name, role: "server", count, attrDefs: [], ...extra });

function tanker({ cargoes = 1, vlcc = {}, extraB = [], extraC = [] } = {}) {
  return {
    entityTypes: [{ id: "cargo", name: "Cargo", role: "customer", count: 0, attrDefs: [] },
      srv("Gulf Terminal Berth", 2), srv("VLCC", 1, vlcc), srv("Hormuz Transit Lane", 1)],
    queues: ["Gulf Loading Queue", "Hormuz Queue", "Voyage Queue", "Asia Crude Queue", "Urgent Queue"]
      .map(n => ({ id: n.replace(/\W/g, "_"), name: n, discipline: "FIFO" })),
    stateVariables: [],
    bEvents: [
      ...Array.from({ length: cargoes }, (_, i) => ({ id: `arr${i}`, name: `Arrive ${i}`, scheduledTime: String(i * 0.5), effect: "ARRIVE(Cargo, Gulf Loading Queue)", schedules: [] })),
      { id: "loaded", name: "Loaded", scheduledTime: "9999", effect: "RELEASE_COSEIZED([Gulf Terminal Berth], Hormuz Queue)", schedules: [] },
      { id: "transited", name: "Transited", scheduledTime: "9999", effect: "RELEASE(Hormuz Transit Lane, Voyage Queue)", schedules: [] },
      { id: "voyaged", name: "Voyaged", scheduledTime: "9999", effect: "RELEASE(VLCC, Asia Crude Queue)", schedules: [] },
      { id: "delivered", name: "Delivered", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ...extraB,
    ],
    cEvents: [
      { id: "load", name: "Load", priority: 1, effect: "COSEIZE(Gulf Loading Queue, Gulf Terminal Berth, VLCC)",
        condition: "queue(Gulf Loading Queue).length > 0 AND idle(Gulf Terminal Berth).count > 0 AND idle(VLCC).count > 0",
        cSchedules: [{ eventId: "loaded", ...fix(2), useEntityCtx: true }] },
      { id: "transit", name: "Transit", priority: 2, effect: "ASSIGN(Hormuz Queue, Hormuz Transit Lane)",
        condition: "queue(Hormuz Queue).length > 0 AND idle(Hormuz Transit Lane).count > 0",
        cSchedules: [{ eventId: "transited", ...fix(1), useEntityCtx: true }] },
      { id: "voyage", name: "Voyage", priority: 3, effect: "DELAY(Voyage Queue)", condition: "queue(Voyage Queue).length > 0",
        cSchedules: [{ eventId: "voyaged", ...fix(10), useEntityCtx: true }] },
      { id: "discharge", name: "Discharge", priority: 4, effect: "DELAY(Asia Crude Queue)", condition: "queue(Asia Crude Queue).length > 0",
        cSchedules: [{ eventId: "delivered", ...fix(1), useEntityCtx: true }] },
      ...extraC,
    ],
  };
}

const at = (t, name, effect) => ({ id: `${name}_${t}`.replace(/\W/g, "_"), name, scheduledTime: String(t), effect, schedules: [] });

function run(model, T = 60) {
  const r = buildEngine(model, 1, 0, T, null, 1e6, 5000, false, undefined, { collectTrace: true }).runAll();
  const cargo = r.entitySummary.filter(e => e.role !== "server").sort((a, b) => a.id - b.id);
  const servers = Object.fromEntries(r.entitySummary.filter(e => e.role === "server").map(e => [`${e.type}#${e.id}`, e]));
  return { r, cargo, servers, log: r.log.map(e => e.message || "").join("\n") };
}

describe("carried server claims", () => {
  it("holds the VLCC through the chokepoint and voyage (baseline)", () => {
    const { cargo } = run(tanker({ cargoes: 2 }));
    expect(cargo.map(c => [c.status, c.completionTime])).toEqual([["done", 14], ["done", 27]]);
  });

  it("a lane failure re-queues the transit but leaves the carried VLCC with the entity", () => {
    const { cargo, log } = run(tanker({ cargoes: 2, extraB: [at(2.5, "Fail lane", "FAIL(Hormuz Transit Lane)"), at(4, "Repair lane", "REPAIR(Hormuz Transit Lane)")] }));
    expect(log).not.toMatch(/VLCC\) → idle \(COSEIZE release on preempt\/fail\)/);
    // Cargo 1 resumes transit at 4 (0.5 remaining) → voyage 4.5–14.5 → done 15.5.
    // Cargo 2 cannot load until that VLCC comes back at 14.5 → done 14.5 + 2 + 1 + 10 + 1.
    expect(cargo.map(c => [c.status, c.completionTime])).toEqual([["done", 15.5], ["done", 28.5]]);
  });

  it("a VLCC failure mid-transit drops only the VLCC; the transit carries on", () => {
    const { cargo, log } = run(tanker({ extraB: [at(2.5, "Fail VLCC", "FAIL(VLCC)"), at(4, "Repair VLCC", "REPAIR(VLCC)")] }));
    expect(log).toMatch(/#\d+ lost its VLCC #\d+ \(held from an earlier stage\)/);
    expect(log).toMatch(/its VLCC was lost earlier, nothing to free/);
    expect(cargo[0]).toMatchObject({ status: "done", completionTime: 14 });
  });

  it("a VLCC failure mid-voyage does not restart the voyage or strand the entity", () => {
    const { cargo, log } = run(tanker({ extraB: [at(5, "Fail VLCC", "FAIL(VLCC)"), at(7, "Repair VLCC", "REPAIR(VLCC)")] }));
    expect(log).not.toMatch(/no busy server\+customer pair found/);
    expect(cargo[0]).toMatchObject({ status: "done", completionTime: 14 });
  });

  it("a VLCC failure while its cargo waits at the chokepoint keeps the cargo's place", () => {
    // Lane is down 1–6, so cargo 1 waits in Hormuz Queue holding its VLCC when it fails at 3.
    const m = tanker({ extraB: [at(1, "Fail lane", "FAIL(Hormuz Transit Lane)"), at(6, "Repair lane", "REPAIR(Hormuz Transit Lane)"),
      at(3, "Fail VLCC", "FAIL(VLCC)"), at(4, "Repair VLCC", "REPAIR(VLCC)")] });
    const { cargo } = run(m);
    // Transit 6–7, voyage 7–17, discharge 17–18.
    expect(cargo[0]).toMatchObject({ status: "done", completionTime: 18 });
  });

  it("MTBF failures of a carried VLCC keep the entity's own pending events", () => {
    const m = tanker({ vlcc: { mtbfDist: "Fixed", mtbfDistParams: { value: "5" }, mttrDist: "Fixed", mttrDistParams: { value: "1" }, failureScope: "unit" } });
    const { cargo, log } = run(m, 30);
    expect(log).toMatch(/its VLCC was lost earlier, nothing to free/);
    expect(cargo[0]).toMatchObject({ status: "done", completionTime: 14 });
  });

  it("PREEMPT of a carried VLCC hands it over without interrupting the voyage", () => {
    const m = tanker({
      extraB: [at(5, "Urgent", "ARRIVE(Cargo, Urgent Queue)"), { id: "urgent_done", name: "Urgent done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] }],
      extraC: [{ id: "urgent", name: "Urgent", priority: 0, effect: "PREEMPT(VLCC); ASSIGN(Urgent Queue, VLCC)",
        condition: "queue(Urgent Queue).length > 0 AND idle(VLCC).count == 0",
        cSchedules: [{ eventId: "urgent_done", ...fix(3), useEntityCtx: true }] }],
    });
    const { cargo } = run(m);
    expect(cargo[0]).toMatchObject({ status: "done", completionTime: 14 });
    expect(cargo[1]).toMatchObject({ status: "done", completionTime: 8 });
  });

  it("a failure of one co-seized server still releases its partners (same claim group)", () => {
    // FAIL both berths at 1 while cargo 1 is loading with berth + VLCC.
    const { log, cargo } = run(tanker({ extraB: [at(1, "Fail berths", "FAIL(Gulf Terminal Berth, 2)"), at(1.5, "Repair berths", "REPAIR(Gulf Terminal Berth)")] }));
    expect(log).toMatch(/#\d+ \(VLCC\) → idle \(COSEIZE release on preempt\/fail\)/);
    // (Exact timing is not asserted: the FAIL macro leaves the interrupted
    // load's original "Loaded" event in the FEL — pre-existing, CANCEL is the
    // opt-in — so it can end the resumed load early.)
    expect(cargo[0].status).toBe("done");
  });
});
