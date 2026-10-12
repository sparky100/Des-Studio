// tests/model/predicate-evaluate.test.js — UI-side snapshot predicate evaluator
// and conditional-routing branch-state computation (Execute canvas diversion view).
import { describe, test, expect } from "vitest";
import {
  resolveSnapVariable,
  evaluateSnapPredicate,
  computeRoutingBranchStates,
  collectConditionStateVars,
  computeRoutingSwitchDeps,
} from "../../src/model/predicateEvaluate.js";

const snap = {
  clock: 100,
  served: 12,
  reneged: 1,
  balked: 0,
  scalars: { hormuzOpen: 0, closureStart: 50, closureEnd: 200, closureEnabled: 1 },
  byQueue: {
    "Hormuz Queue": { waiting: 8, total: 20 },
    "Bypass Pipeline Queue": { waiting: 0, total: 0 },
  },
  entities: [
    { id: 1, role: "customer", status: "waiting", queue: "Hormuz Queue" },
    { id: 2, role: "customer", status: "waiting", queue: "Hormuz Queue" },
    { id: 3, role: "server", status: "busy", type: "Berth" },
  ],
};

describe("resolveSnapVariable", () => {
  test("resolves a bare state variable from scalars", () => {
    expect(resolveSnapVariable("hormuzOpen", snap)).toBe(0);
    expect(resolveSnapVariable("closureStart", snap)).toBe(50);
  });

  test("resolves state.<name>", () => {
    expect(resolveSnapVariable("state.hormuzOpen", snap)).toBe(0);
  });

  test("resolves clock and built-in counters", () => {
    expect(resolveSnapVariable("clock", snap)).toBe(100);
    expect(resolveSnapVariable("served", snap)).toBe(12);
    expect(resolveSnapVariable("reneged", snap)).toBe(1);
  });

  test("resolves queue(Name).length from byQueue", () => {
    expect(resolveSnapVariable("queue(Hormuz Queue).length", snap)).toBe(8);
    expect(resolveSnapVariable("queue(Bypass Pipeline Queue).count", snap)).toBe(0);
  });

  test("falls back to counting waiting entities when byQueue is absent", () => {
    const noByQueue = { ...snap, byQueue: undefined };
    expect(resolveSnapVariable("queue(Hormuz Queue).length", noByQueue)).toBe(2);
  });

  test("returns undefined for runtime-only references", () => {
    expect(resolveSnapVariable("Entity.priority", snap)).toBeUndefined();
    expect(resolveSnapVariable("Resource.Berth.status", snap)).toBeUndefined();
    expect(resolveSnapVariable("idle(Berth).count", snap)).toBeUndefined();
    expect(resolveSnapVariable("unknownVar", snap)).toBeUndefined();
  });
});

describe("evaluateSnapPredicate", () => {
  test("evaluates a numeric leaf", () => {
    expect(evaluateSnapPredicate({ variable: "queue(Hormuz Queue).length", operator: ">", value: 6 }, snap)).toBe(true);
    expect(evaluateSnapPredicate({ variable: "queue(Hormuz Queue).length", operator: ">", value: 8 }, snap)).toBe(false);
  });

  test("resolves a state-variable RHS (clock >= closureStart)", () => {
    expect(evaluateSnapPredicate({ variable: "clock", operator: ">=", value: "closureStart" }, snap)).toBe(true);
    expect(evaluateSnapPredicate({ variable: "clock", operator: "<", value: "closureStart" }, snap)).toBe(false);
  });

  test("evaluates AND and OR compounds", () => {
    const and = { operator: "AND", clauses: [
      { variable: "queue(Hormuz Queue).length", operator: ">", value: 6 },
      { variable: "hormuzOpen", operator: "==", value: 0 },
    ] };
    expect(evaluateSnapPredicate(and, snap)).toBe(true);

    const or = { operator: "OR", clauses: [
      { variable: "hormuzOpen", operator: "==", value: 1 },
      { variable: "queue(Hormuz Queue).length", operator: ">", value: 6 },
    ] };
    expect(evaluateSnapPredicate(or, snap)).toBe(true);
  });

  test("returns null when any AND clause is unresolvable", () => {
    const and = { operator: "AND", clauses: [
      { variable: "hormuzOpen", operator: "==", value: 0 },
      { variable: "Entity.priority", operator: ">", value: 1 },
    ] };
    expect(evaluateSnapPredicate(and, snap)).toBeNull();
  });

  test("returns false for a resolvable AND with a false clause even if another is unresolvable", () => {
    const and = { operator: "AND", clauses: [
      { variable: "hormuzOpen", operator: "==", value: 1 },
      { variable: "Entity.priority", operator: ">", value: 1 },
    ] };
    expect(evaluateSnapPredicate(and, snap)).toBe(false);
  });

  test("returns null for a legacy string condition", () => {
    expect(evaluateSnapPredicate("clock > 5", snap)).toBeNull();
  });

  test("returns null for an unresolvable leaf", () => {
    expect(evaluateSnapPredicate({ variable: "Entity.priority", operator: ">", value: 1 }, snap)).toBeNull();
  });
});

// Mirrors the World Oil Network scenario: "Gulf Cargo Loaded" diverts tankers to
// the Bypass Pipeline Queue while the strait is closed and Hormuz Queue is long.
const model = {
  bEvents: [{
    id: "be_gulf",
    name: "Gulf Cargo Loaded",
    effect: "RELEASE_COSEIZED([Gulf Terminal Berth])",
    routing: [{
      queueName: "Bypass Pipeline Queue",
      condition: { operator: "AND", clauses: [
        { variable: "queue(Hormuz Queue).length", operator: ">", value: 6 },
        { variable: "hormuzOpen", operator: "==", value: 0 },
      ] },
    }],
    defaultQueueName: "Hormuz Queue",
  }],
  queues: [
    { id: "q_hormuz", name: "Hormuz Queue" },
    { id: "q_bypass", name: "Bypass Pipeline Queue" },
  ],
};

const graph = {
  nodes: [],
  edges: [
    { id: "edge:be_gulf->q_bypass:be_gulf-0-0", from: "be_gulf", to: "q_bypass", source: "routing", label: "…", bEventId: "be_gulf", branchIndex: 0 },
    { id: "edge:be_gulf->q_hormuz:be_gulf-0-default", from: "be_gulf", to: "q_hormuz", source: "routing", label: "fallback", bEventId: "be_gulf", branchIndex: "default" },
  ],
};

const BYPASS = "edge:be_gulf->q_bypass:be_gulf-0-0";
const DEFAULT = "edge:be_gulf->q_hormuz:be_gulf-0-default";

describe("computeRoutingBranchStates", () => {
  test("marks the conditional branch active and the default inactive when the condition holds", () => {
    const states = computeRoutingBranchStates(graph, model, snap);
    expect(states.get(BYPASS)).toEqual({ active: true, resolvable: true });
    expect(states.get(DEFAULT)).toEqual({ active: false, resolvable: true });
  });

  test("flips to the default branch when the state variable changes", () => {
    const open = { ...snap, scalars: { ...snap.scalars, hormuzOpen: 1 } };
    const states = computeRoutingBranchStates(graph, model, open);
    expect(states.get(BYPASS)).toEqual({ active: false, resolvable: true });
    expect(states.get(DEFAULT)).toEqual({ active: true, resolvable: true });
  });

  test("flips to the default branch when the queue is short", () => {
    const short = { ...snap, byQueue: { ...snap.byQueue, "Hormuz Queue": { waiting: 3, total: 3 } } };
    const states = computeRoutingBranchStates(graph, model, short);
    expect(states.get(BYPASS).active).toBe(false);
    expect(states.get(DEFAULT).active).toBe(true);
  });

  test("leaves both branches neutral when the condition is unresolvable", () => {
    const unresolvableModel = {
      ...model,
      bEvents: [{ ...model.bEvents[0], routing: [{ queueName: "Bypass Pipeline Queue", condition: { variable: "Entity.priority", operator: ">", value: 1 } }] }],
    };
    const states = computeRoutingBranchStates(graph, unresolvableModel, snap);
    expect(states.get(BYPASS)).toEqual({ active: false, resolvable: false });
    expect(states.get(DEFAULT)).toEqual({ active: false, resolvable: false });
  });

  test("ignores probabilistic routing edges (no condition)", () => {
    const probModel = {
      ...model,
      bEvents: [{ ...model.bEvents[0], routing: undefined, probabilisticRouting: [{ queueName: "Bypass Pipeline Queue", probability: 0.5 }] }],
    };
    const states = computeRoutingBranchStates(graph, probModel, snap);
    expect(states.size).toBe(0);
  });

  test("returns an empty map without a snapshot", () => {
    expect(computeRoutingBranchStates(graph, model, null).size).toBe(0);
  });
});

describe("collectConditionStateVars", () => {
  const known = new Set(["hormuzOpen", "closureStart", "closureEnabled"]);

  test("collects a bare LHS state variable", () => {
    const names = collectConditionStateVars({ variable: "hormuzOpen", operator: "==", value: 0 }, known);
    expect([...names]).toEqual(["hormuzOpen"]);
  });

  test("collects state.<name> and an RHS state variable", () => {
    const names = collectConditionStateVars({ variable: "state.closureEnabled", operator: "==", value: "closureStart" }, known);
    expect(names.has("closureEnabled")).toBe(true);
    expect(names.has("closureStart")).toBe(true);
  });

  test("collects across AND/OR clauses", () => {
    const pred = { operator: "AND", clauses: [
      { variable: "queue(Hormuz Queue).length", operator: ">", value: 6 },
      { variable: "hormuzOpen", operator: "==", value: 0 },
    ] };
    expect([...collectConditionStateVars(pred, known)]).toEqual(["hormuzOpen"]);
  });

  test("ignores queue-length refs, built-ins, and RHS literals when knownNames is given", () => {
    const pred = { operator: "AND", clauses: [
      { variable: "clock", operator: ">", value: "closureStart" },
      { variable: "queue(Hormuz Queue).length", operator: ">", value: 6 },
      { variable: "hormuzOpen", operator: "==", value: "Hormuz Queue" },
    ] };
    expect([...collectConditionStateVars(pred, known)]).toEqual(["closureStart", "hormuzOpen"]);
  });

  test("returns an empty set for a legacy string condition", () => {
    expect(collectConditionStateVars("clock > 5", known).size).toBe(0);
  });
});

describe("computeRoutingSwitchDeps", () => {
  const modelWithVars = { ...model, stateVariables: [{ name: "hormuzOpen" }, { name: "closureStart" }] };

  test("maps the routing edge's source node to the state variables it depends on", () => {
    const deps = computeRoutingSwitchDeps(graph, modelWithVars);
    expect(deps.get("be_gulf")).toEqual(["hormuzOpen"]);
  });

  test("ignores the default branch (no condition)", () => {
    const deps = computeRoutingSwitchDeps(graph, modelWithVars);
    expect(deps.has("q_hormuz")).toBe(false);
  });

  test("returns an empty map when the model declares no state variables", () => {
    expect(computeRoutingSwitchDeps(graph, model).size).toBe(0);
  });
});
