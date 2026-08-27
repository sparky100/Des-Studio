// tests/model/macro-parser.test.js — bracket-aware macro parsing and the
// surgical rewrite helpers the Visual Designer uses to edit one macro call
// without destroying its siblings.
import { describe, test, expect } from "vitest";
import {
  macroCalls,
  replaceMacroCall,
  extractReleaseTarget,
  stripReleaseTarget,
  withReleaseTarget,
  classifyActivityEffect,
} from "../../src/model/macroParser.js";

describe("macroCalls", () => {
  test("splits a multi-macro string into calls with args", () => {
    expect(macroCalls("SET(total, 1); ASSIGN(Queue A, Clerk)")).toEqual([
      { macro: "SET", args: ["total", "1"] },
      { macro: "ASSIGN", args: ["Queue A", "Clerk"] },
    ]);
  });

  test("keeps RELEASE_COSEIZED's bracketed type list as one argument", () => {
    expect(macroCalls("RELEASE_COSEIZED([Nurse, Doctor], Ward Queue)")).toEqual([
      { macro: "RELEASE_COSEIZED", args: ["[Nurse, Doctor]", "Ward Queue"] },
    ]);
  });

  test("accepts array effects", () => {
    expect(macroCalls(["COST(5)", "COMPLETE()"])).toEqual([
      { macro: "COST", args: ["5"] },
      { macro: "COMPLETE", args: [] },
    ]);
  });
});

describe("replaceMacroCall", () => {
  test("replaces only the named call, preserving siblings", () => {
    const { effect, replaced } = replaceMacroCall(
      "COST(5);COMPLETE()", "COMPLETE", () => "RENEGE()"
    );
    expect(replaced).toBe(true);
    expect(effect).toBe("COST(5);RENEGE()");
  });

  test("preserves array shape, replacing inside the matching element", () => {
    const { effect, replaced } = replaceMacroCall(
      ["SET(x, 1)", "ARRIVE(Customer, Old Queue)"],
      "ARRIVE",
      call => `ARRIVE(${call.args[0]}, New Queue)`
    );
    expect(replaced).toBe(true);
    expect(effect).toEqual(["SET(x, 1)", "ARRIVE(Customer, New Queue)"]);
  });

  test("reports replaced: false and returns the effect unchanged when absent", () => {
    const { effect, replaced } = replaceMacroCall("COST(5)", "ARRIVE", () => "x");
    expect(replaced).toBe(false);
    expect(effect).toBe("COST(5)");
  });

  test("survives bracketed args in the rewritten call", () => {
    const { effect } = replaceMacroCall(
      "SET(a, 1);RELEASE_COSEIZED([Nurse, Doctor], Q1)",
      "RELEASE_COSEIZED",
      call => `RELEASE_COSEIZED(${call.args[0]}, Q2)`
    );
    expect(effect).toBe("SET(a, 1);RELEASE_COSEIZED([Nurse, Doctor], Q2)");
  });
});

describe("extractReleaseTarget", () => {
  test("finds the queue on RELEASE and RELEASE_COSEIZED, even mid-string", () => {
    expect(extractReleaseTarget("RELEASE(Clerk, Exit Queue)")).toBe("Exit Queue");
    expect(extractReleaseTarget("SET(x, 1);RELEASE(Clerk, Exit Queue)")).toBe("Exit Queue");
    expect(extractReleaseTarget("RELEASE_COSEIZED([Nurse, Doctor], Ward)")).toBe("Ward");
  });

  test("returns null when no targeted RELEASE exists", () => {
    expect(extractReleaseTarget("RELEASE(Clerk)")).toBeNull();
    expect(extractReleaseTarget("DELAY(Q)")).toBeNull();
  });
});

describe("stripReleaseTarget", () => {
  test("strips the queue arg wherever the RELEASE sits in the effect", () => {
    expect(stripReleaseTarget("RELEASE(Clerk, Q2)")).toBe("RELEASE(Clerk)");
    // Previously ^-anchored — a leading sibling made it a silent no-op.
    expect(stripReleaseTarget("SET(x, 1);RELEASE(Clerk, Q2)")).toBe("SET(x, 1);RELEASE(Clerk)");
    expect(stripReleaseTarget("RELEASE_COSEIZED([A, B], Q2)")).toBe("RELEASE_COSEIZED([A, B])");
  });

  test("leaves untargeted or unrelated effects alone", () => {
    expect(stripReleaseTarget("RELEASE(Clerk)")).toBe("RELEASE(Clerk)");
    expect(stripReleaseTarget(["COMPLETE()"])).toEqual(["COMPLETE()"]);
  });
});

describe("withReleaseTarget", () => {
  test("adds a queue arg to a stripped RELEASE, preserving siblings", () => {
    expect(withReleaseTarget("SET(x, 1);RELEASE(Clerk)", "Q3")).toBe("SET(x, 1);RELEASE(Clerk, Q3)");
  });

  test("replaces an existing target and handles RELEASE_COSEIZED", () => {
    expect(withReleaseTarget("RELEASE(Clerk, Old)", "New")).toBe("RELEASE(Clerk, New)");
    expect(withReleaseTarget("RELEASE_COSEIZED([A, B])", "Ward")).toBe("RELEASE_COSEIZED([A, B], Ward)");
  });

  test("no-ops without a RELEASE call or a queue name", () => {
    expect(withReleaseTarget("COMPLETE()", "Q")).toBe("COMPLETE()");
    expect(withReleaseTarget("RELEASE(Clerk)", "")).toBe("RELEASE(Clerk)");
  });
});

describe("classifyActivityEffect", () => {
  test.each([
    ["", "empty"],
    ["ASSIGN(Q, Clerk)", "assign"],
    ["DELAY(Q)", "delay"],
    ["DELAY(Q, 3)", "delay"],
    ["ASSIGN(Q, Clerk, \"Triage\")", "advanced"],   // skill arg
    ["COSEIZE(Q, Nurse, Doctor)", "advanced"],
    ["BATCH(Q, 5)", "advanced"],
    ["SET(x, 1);DELAY(Q)", "advanced"],             // multi-macro
    [["SET(x, 1)", "ASSIGN(Q, Clerk)"], "advanced"],
  ])("classifies %j as %s", (effect, kind) => {
    expect(classifyActivityEffect(effect).kind).toBe(kind);
  });

  test("returns the primary call for downstream use", () => {
    expect(classifyActivityEffect("DELAY(Q, 3)").call).toEqual({ macro: "DELAY", args: ["Q", "3"] });
  });
});
