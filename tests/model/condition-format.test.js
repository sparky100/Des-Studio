import { describe, expect, it } from "vitest";
import {
  buildConditionString,
  rowsToPredicate,
  predicateToRows,
  parseConditionString,
  conditionToLegacyString,
  predicateToLegacyString,
  migrateLegacyCondition,
  normalizeModelConditions,
  hasConditionDefinition,
  isMeaningfulRoutingBranch,
} from "../../src/model/conditionFormat.js";

describe("conditionFormat", () => {
  it("parses a legacy condition string into rows", () => {
    expect(parseConditionString("queue(Main Queue).length > 0 AND idle(Clerk).count > 0")).toEqual([
      { id: "r0", token: "queue(Main Queue).length", operator: ">", value: "0", join: "AND" },
      { id: "r1", token: "idle(Clerk).count", operator: ">", value: "0", join: "AND" },
    ]);
  });

  it("converts rows into a typed predicate object", () => {
    expect(rowsToPredicate([
      { id: "r0", token: "queue(Main Queue).length", operator: ">", value: "0", join: "AND" },
      { id: "r1", token: "idle(Clerk).count", operator: ">", value: "0", join: "AND" },
    ])).toEqual({
      operator: "AND",
      clauses: [
        { variable: "queue(Main Queue).length", operator: ">", value: 0 },
        { variable: "idle(Clerk).count", operator: ">", value: 0 },
      ],
    });
  });

  it("round-trips a predicate object back into rows and legacy text", () => {
    const predicate = {
      operator: "AND",
      clauses: [
        { variable: "queue(Main Queue).length", operator: ">", value: 0 },
        { variable: "idle(Clerk).count", operator: ">", value: 0 },
      ],
    };

    expect(predicateToRows(predicate)).toEqual([
      { id: "r0", token: "queue(Main Queue).length", operator: ">", value: "0", join: "AND" },
      { id: "r1", token: "idle(Clerk).count", operator: ">", value: "0", join: "AND" },
    ]);
    expect(buildConditionString(predicateToRows(predicate))).toBe("queue(Main Queue).length > 0 AND idle(Clerk).count > 0");
    expect(conditionToLegacyString(predicate)).toBe("queue(Main Queue).length > 0 AND idle(Clerk).count > 0");
    expect(predicateToLegacyString(predicate)).toBe("queue(Main Queue).length > 0 AND idle(Clerk).count > 0");
  });
});

describe("normalizeModelConditions — unified storage format (Part B)", () => {
  it("converts a string cEvents[].condition to the canonical object form", () => {
    const model = { cEvents: [{ id: "c1", condition: "queue(Main Queue).length > 0" }] };
    const normalized = normalizeModelConditions(model);
    expect(normalized.cEvents[0].condition).toEqual({
      variable: "queue(Main Queue).length", operator: ">", value: 0,
    });
  });

  it("converts a string queues[].balkCondition to the canonical object form", () => {
    const model = { queues: [{ id: "q1", balkCondition: "queue(Main Queue).length > 5" }] };
    const normalized = normalizeModelConditions(model);
    expect(normalized.queues[0].balkCondition).toEqual({
      variable: "queue(Main Queue).length", operator: ">", value: 5,
    });
  });

  it("converts a string bEvents[].routing[].condition to the canonical object form", () => {
    const model = {
      bEvents: [{ id: "b1", routing: [{ queueName: "Q", condition: "idle(Clerk).count > 0" }] }],
    };
    const normalized = normalizeModelConditions(model);
    expect(normalized.bEvents[0].routing[0].condition).toEqual({
      variable: "idle(Clerk).count", operator: ">", value: 0,
    });
  });

  it("converts a string cEvents[].cSchedules[].when to the canonical object form", () => {
    const model = {
      cEvents: [{ id: "c1", cSchedules: [{ eventId: "e1", when: "clock > 5" }] }],
    };
    const normalized = normalizeModelConditions(model);
    expect(normalized.cEvents[0].cSchedules[0].when).toEqual({
      variable: "clock", operator: ">", value: 5,
    });
  });

  it("is idempotent — normalizing an already-canonical model is a no-op", () => {
    const model = {
      queues: [{ id: "q1", balkCondition: { variable: "queue(X).length", operator: ">", value: 1 } }],
      bEvents: [{ id: "b1", routing: [{ condition: { variable: "Entity.priority", operator: "<", value: 2 } }] }],
      cEvents: [{
        id: "c1",
        condition: { variable: "clock", operator: ">", value: 0 },
        cSchedules: [{ eventId: "e1", when: { variable: "clock", operator: ">", value: 5 } }],
      }],
    };
    const once = normalizeModelConditions(model);
    const twice = normalizeModelConditions(once);
    expect(twice).toEqual(once);
  });

  it("recurses into model.modelJson when present", () => {
    const model = { modelJson: { queues: [{ id: "q1", balkCondition: "queue(X).length > 1" }] } };
    const normalized = normalizeModelConditions(model);
    expect(normalized.modelJson.queues[0].balkCondition).toEqual({
      variable: "queue(X).length", operator: ">", value: 1,
    });
  });
});

describe("A3 regression guard — stray token/left/right keys are no longer specially resolved", () => {
  it("migrateLegacyCondition ignores legacy token/left/right keys, using variable/value only", () => {
    const stray = { token: "queue(X).length", left: "queue(X).length", operator: ">", right: 5 };
    expect(migrateLegacyCondition(stray)).toEqual({ variable: "", operator: ">", value: "" });
  });

  it("predicateToLegacyString produces an empty clause for a stray-key-only condition", () => {
    const stray = { token: "queue(X).length", operator: ">", right: 5 };
    expect(predicateToLegacyString(stray)).toBe("");
  });
});

describe("hasConditionDefinition / isMeaningfulRoutingBranch", () => {
  it("returns false for null/empty conditions", () => {
    expect(hasConditionDefinition(null)).toBe(false);
    expect(hasConditionDefinition("")).toBe(false);
    expect(hasConditionDefinition({})).toBe(false);
  });

  it("returns true for a leaf predicate with a variable", () => {
    expect(hasConditionDefinition({ variable: "clock", operator: ">", value: 0 })).toBe(true);
  });

  it("returns true for a non-empty legacy string", () => {
    expect(hasConditionDefinition("clock > 0")).toBe(true);
  });

  it("recurses into compound clauses", () => {
    expect(hasConditionDefinition({
      operator: "AND",
      clauses: [{ variable: "clock", operator: ">", value: 0 }],
    })).toBe(true);
    expect(hasConditionDefinition({ operator: "AND", clauses: [] })).toBe(false);
  });

  it("isMeaningfulRoutingBranch delegates to hasConditionDefinition on branch.condition", () => {
    expect(isMeaningfulRoutingBranch({ condition: { variable: "clock", operator: ">", value: 0 } })).toBe(true);
    expect(isMeaningfulRoutingBranch({ condition: null })).toBe(false);
    expect(isMeaningfulRoutingBranch(null)).toBe(false);
  });
});
