// tests/model/balk-migration.test.js — migrateBalkingToQueues() (F11.2 queue-scoped balking)
import { describe, test, expect } from "vitest";
import { migrateBalkingToQueues } from "../../src/model/balkMigration.js";

function makeModel({ balkProbability, balkCondition, queueBalkProbability, queueBalkCondition } = {}) {
  return {
    bEvents: [
      {
        id: "be-arrive", name: "Arrival", scheduledTime: "0",
        effect: "ARRIVE(Customer, Main Queue)", schedules: [],
        ...(balkProbability !== undefined ? { balkProbability } : {}),
        ...(balkCondition   !== undefined ? { balkCondition }   : {}),
      },
    ],
    queues: [
      {
        id: "q-main", name: "Main Queue", customerType: "Customer", discipline: "FIFO",
        ...(queueBalkProbability !== undefined ? { balkProbability: queueBalkProbability } : {}),
        ...(queueBalkCondition   !== undefined ? { balkCondition: queueBalkCondition }     : {}),
      },
    ],
  };
}

describe("migrateBalkingToQueues", () => {
  test("copies legacy balkProbability from the ARRIVE B-event onto the matching queue", () => {
    const model = makeModel({ balkProbability: 0.3 });
    const result = migrateBalkingToQueues(model);
    expect(result.queues[0].balkProbability).toBe(0.3);
  });

  test("copies legacy balkCondition from the ARRIVE B-event onto the matching queue", () => {
    const balkCondition = { variable: "Queue.Main Queue.length", operator: ">=", value: 2 };
    const model = makeModel({ balkCondition });
    const result = migrateBalkingToQueues(model);
    expect(result.queues[0].balkCondition).toEqual(balkCondition);
  });

  test("does not clobber a queue that already defines its own balkProbability", () => {
    const model = makeModel({ balkProbability: 0.9, queueBalkProbability: 0.1 });
    const result = migrateBalkingToQueues(model);
    expect(result.queues[0].balkProbability).toBe(0.1);
  });

  test("does not clobber a queue that already defines its own balkCondition", () => {
    const legacyCondition = { variable: "Queue.Main Queue.length", operator: ">=", value: 5 };
    const queueCondition  = { variable: "Queue.Main Queue.length", operator: ">=", value: 1 };
    const model = makeModel({ balkCondition: legacyCondition, queueBalkCondition: queueCondition });
    const result = migrateBalkingToQueues(model);
    expect(result.queues[0].balkCondition).toEqual(queueCondition);
  });

  test("is a no-op when there is nothing to migrate", () => {
    const model = makeModel({});
    const result = migrateBalkingToQueues(model);
    expect(result).toBe(model); // returns the same reference — no spurious copy
  });

  test("is idempotent — running twice produces the same result as running once", () => {
    const model = makeModel({ balkProbability: 0.4 });
    const once  = migrateBalkingToQueues(model);
    const twice = migrateBalkingToQueues(once);
    expect(twice.queues[0].balkProbability).toBe(0.4);
    expect(twice).toEqual(once);
  });

  test("leaves the B-event's legacy fields in place (does not strip them)", () => {
    const model = makeModel({ balkProbability: 0.5 });
    const result = migrateBalkingToQueues(model);
    expect(result.bEvents[0].balkProbability).toBe(0.5);
  });

  test("no queues or no bEvents — returns model unchanged", () => {
    expect(migrateBalkingToQueues({ bEvents: [], queues: [] })).toEqual({ bEvents: [], queues: [] });
    expect(migrateBalkingToQueues({})).toEqual({});
  });
});
