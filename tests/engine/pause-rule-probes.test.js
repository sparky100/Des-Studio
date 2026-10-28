// tests/engine/pause-rule-probes.test.js — engine probes behind Auto Run's
// "Pause when…" rules (roadmap #6): clock, queue depth, cumulative queue joins.
import { describe, test, expect } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { createPauseWatcher } from "../../src/ui/execute/pauseRules.js";

// Arrivals every 1 time unit, one server taking 3: the queue grows steadily.
function makeModel() {
  return {
    entityTypes: [
      { id: "et-c", name: "Customer", role: "customer", attrDefs: [] },
      { id: "et-s", name: "Server", role: "server", count: "1", attrDefs: [] },
    ],
    queues: [{ id: "q-main", name: "Main Queue", customerType: "Customer", discipline: "FIFO" }],
    bEvents: [
      { id: "be-arrive", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Customer, Main Queue)",
        schedules: [{ eventId: "be-arrive", dist: "Fixed", distParams: { value: "1" } }] },
      { id: "be-complete", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    ],
    cEvents: [{
      id: "ce-serve", name: "Serve", priority: 1,
      condition: "queue(Main Queue).length > 0 AND idle(Server).count > 0",
      effect: "ASSIGN(Main Queue, Server)",
      cSchedules: [{ eventId: "be-complete", dist: "Fixed", distParams: { value: "3" }, useEntityCtx: true }],
    }],
    stateVariables: [],
  };
}

const engineFor = () => buildEngine(makeModel(), 1, 0, 30, null, 100000, 5000, false);

function stepUntil(engine, predicate, limit = 500) {
  for (let i = 0; i < limit; i++) {
    const r = engine.step({ captureSnap: false });
    if (predicate() || r.done) return r;
  }
  throw new Error("predicate never held");
}

describe("engine pause probes", () => {
  test("getClock, getQueueDepth and getQueueJoins track the run", () => {
    const engine = engineFor();
    expect(engine.getClock()).toBe(0);
    expect(engine.getQueueJoins("Main Queue")).toBe(0);
    stepUntil(engine, () => engine.getClock() >= 10);
    const joins = engine.getQueueJoins("Main Queue");
    // Every arrival joins Main Queue once (t = 0..10 → 11 arrivals).
    expect(joins).toBe(11);
    // Queue names are matched case-insensitively, like everywhere else.
    expect(engine.getQueueJoins("main queue")).toBe(joins);
    // Served: t=0,3,6,9 → 4 left the queue; the rest are waiting.
    expect(engine.getQueueDepth("Main Queue")).toBe(joins - 4);
    expect(engine.getQueueDepth("No Such Queue")).toBe(0);
  });
});

describe("createPauseWatcher", () => {
  test("enter rule fires on the step that adds a join", () => {
    const engine = engineFor();
    const watcher = createPauseWatcher([{ id: "a", kind: "enter", queue: "Main Queue" }], engine);
    let hit = null;
    stepUntil(engine, () => (hit = watcher.check()) !== null);
    expect(hit.rule.id).toBe("a");
    expect(engine.getQueueJoins("Main Queue")).toBe(1);
    expect(hit.message).toMatch(/entered Main Queue at t = 0/);
  });

  test("depth rule fires on the upward crossing only", () => {
    const engine = engineFor();
    const watcher = createPauseWatcher([{ id: "d", kind: "depth", queue: "Main Queue", count: 3 }], engine);
    let hit = null;
    stepUntil(engine, () => (hit = watcher.check()) !== null);
    expect(engine.getQueueDepth("Main Queue")).toBe(3);
    expect(hit.message).toMatch(/Main Queue reached 3 waiting/);
    // Still at or above 3 for a while: no repeat until it drops below and rises again.
    for (let i = 0; i < 5; i++) { engine.step({ captureSnap: false }); expect(watcher.check()).toBeNull(); }
  });

  test("time rule fires once when the clock reaches it", () => {
    const engine = engineFor();
    const watcher = createPauseWatcher([{ id: "t", kind: "time", time: "7.5" }], engine);
    let hit = null;
    stepUntil(engine, () => (hit = watcher.check()) !== null);
    expect(engine.getClock()).toBeGreaterThanOrEqual(7.5);
    engine.step({ captureSnap: false });
    expect(watcher.check()).toBeNull();
  });

  test("a rule already true when the watcher starts waits for the next change", () => {
    const engine = engineFor();
    stepUntil(engine, () => engine.getClock() >= 12);
    const watcher = createPauseWatcher([
      { id: "t", kind: "time", time: "5" },
      { id: "d", kind: "depth", queue: "Main Queue", count: 1 },
    ], engine);
    for (let i = 0; i < 3; i++) { engine.step({ captureSnap: false }); expect(watcher.check()).toBeNull(); }
  });

  test("incomplete or disabled rules are ignored", () => {
    const engine = engineFor();
    const watcher = createPauseWatcher([
      { id: "x", kind: "enter", queue: "" },
      { id: "y", kind: "time", time: "" },
      { id: "z", kind: "enter", queue: "Main Queue", enabled: false },
    ], engine);
    expect(watcher.size).toBe(0);
    engine.step({ captureSnap: false });
    expect(watcher.check()).toBeNull();
  });
});

describe("join counts with routing", () => {
  test("a RELEASE routed onward counts one join for the destination, none for the provisional queue", () => {
    const model = {
      entityTypes: [
        { id: "et-p", name: "Patient", role: "customer", attrDefs: [{ name: "outcome", valueType: "string", defaultValue: "ICU" }] },
        { id: "et-n", name: "Nurse", role: "server", count: "1", attrDefs: [] },
      ],
      queues: [
        { id: "q-wait", name: "Waiting Queue", discipline: "FIFO" },
        { id: "q-icu", name: "ICU Queue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "be-arrive", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Patient, Waiting Queue)", schedules: [] },
        { id: "be-release", name: "Release", scheduledTime: "9999", effect: "RELEASE(Nurse, Waiting Queue)", schedules: [],
          routing: [{ condition: { variable: "Entity.outcome", operator: "==", value: "ICU" }, queueName: "ICU Queue" }],
          defaultQueueName: "Waiting Queue" },
      ],
      cEvents: [{
        id: "ce-serve", name: "Serve", priority: 1,
        condition: "queue(Waiting Queue).length > 0 AND idle(Nurse).count > 0",
        effect: "ASSIGN(Waiting Queue, Nurse)",
        cSchedules: [{ eventId: "be-release", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }],
      }],
      stateVariables: [],
    };
    const engine = buildEngine(model, 1, 0, 20);
    stepUntil(engine, () => engine.getClock() >= 2 && engine.getQueueDepth("ICU Queue") === 1);
    expect(engine.getQueueJoins("Waiting Queue")).toBe(1);
    expect(engine.getQueueJoins("ICU Queue")).toBe(1);
  });
});
