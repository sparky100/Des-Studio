// tests/engine/queue-join-generalization.test.js — attemptQueueJoin() centralization
//
// Covers the recursive overflow-chain fix (F11.3): capacity is re-checked at every
// hop of an overflowDestination chain, and a cycle of overflow destinations safely
// falls back to "exit system" instead of looping or silently overfilling a queue.
import { describe, test, expect } from "vitest";
import { buildEngine } from "../../src/engine/index.js";

function makeChainModel(queueDefs) {
  return {
    entityTypes: [
      { id: "et-c", name: "Customer", role: "customer", attrDefs: [] },
    ],
    queues: queueDefs,
    bEvents: [
      { id: "be-arrive-0", name: "Arrival 0", scheduledTime: "0",   effect: "ARRIVE(Customer, Queue A)", schedules: [] },
      { id: "be-arrive-1", name: "Arrival 1", scheduledTime: "0.1", effect: "ARRIVE(Customer, Queue A)", schedules: [] },
      { id: "be-arrive-2", name: "Arrival 2", scheduledTime: "0.2", effect: "ARRIVE(Customer, Queue A)", schedules: [] },
    ],
    cEvents: [],
    stateVariables: [],
  };
}

function runToCompletion(model) {
  const eng = buildEngine(model, 1, 0, 5);
  for (let i = 0; i < 20; i++) { const r = eng.step(); if (r.done) break; }
  return eng.getSnap();
}

describe("attemptQueueJoin — multi-hop overflow chain", () => {
  test("A -> B -> C: capacity is re-checked at every hop, not just the first", () => {
    const model = makeChainModel([
      { id: "q-a", name: "Queue A", customerType: "Customer", discipline: "FIFO", capacity: 1, overflowDestination: "Queue B" },
      { id: "q-b", name: "Queue B", customerType: "Customer", discipline: "FIFO", capacity: 1, overflowDestination: "Queue C" },
      { id: "q-c", name: "Queue C", customerType: "Customer", discipline: "FIFO" },
    ]);
    const snap = runToCompletion(model);
    const byQueue = (name) => snap.entities.filter(e => e.role === "customer" && e.queue === name);

    // 1st arrival fills Queue A; 2nd overflows into Queue B; 3rd finds A AND B full,
    // and must be recursively re-checked against B's own capacity before landing in C.
    expect(byQueue("Queue A").length).toBe(1);
    expect(byQueue("Queue B").length).toBeLessThanOrEqual(1); // bug would have let 2 entities into B
    expect(byQueue("Queue C").length).toBeGreaterThanOrEqual(1);
  });

  test("A -> B -> A cycle: third entity is discarded (exits system) rather than looping", () => {
    const model = makeChainModel([
      { id: "q-a", name: "Queue A", customerType: "Customer", discipline: "FIFO", capacity: 1, overflowDestination: "Queue B" },
      { id: "q-b", name: "Queue B", customerType: "Customer", discipline: "FIFO", capacity: 1, overflowDestination: "Queue A" },
    ]);
    const snap = runToCompletion(model);
    const byQueue = (name) => snap.entities.filter(e => e.role === "customer" && e.queue === name);

    expect(byQueue("Queue A").length).toBe(1);
    expect(byQueue("Queue B").length).toBe(1);
    // 3rd entity hits the cycle guard and is discarded — not present in either queue,
    // and not double-counted into a queue that's already at capacity.
    const total = snap.entities.filter(e => e.role === "customer").length;
    expect(total).toBe(2);
  });
});
