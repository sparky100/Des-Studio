import { describe, expect, it } from "vitest";
import { MODEL_JSON_KEYS } from "../../src/contracts/model";
import { USER_SETTINGS_NAMESPACES, USER_SETTINGS_SCHEMA_VERSION } from "../../src/contracts/user-settings";

describe("typed contracts", () => {
  it("exports the canonical model json sections in storage order", () => {
    expect(MODEL_JSON_KEYS).toEqual([
      "entityTypes",
      "stateVariables",
      "bEvents",
      "cEvents",
      "queues",
    ]);
  });

  it("exports the initial user settings schema contract", () => {
    expect(USER_SETTINGS_SCHEMA_VERSION).toBe(1);
    expect(USER_SETTINGS_NAMESPACES).toEqual(["ui", "execute", "ai"]);
  });
});
