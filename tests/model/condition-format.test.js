import { describe, expect, it } from "vitest";
import {
  buildConditionString,
  rowsToPredicate,
  predicateToRows,
  parseConditionString,
  conditionToLegacyString,
  predicateToLegacyString,
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
