import { describe, expect, it } from "vitest";
import {
  buildModelBuilderSystemPrompt,
  buildModelBuilderUserMessage,
} from "../../src/llm/model-builder-prompts.js";

describe("model builder prompts", () => {
  it("constrains the model builder to the supported macro vocabulary", () => {
    const prompt = buildModelBuilderSystemPrompt();
    ["ARRIVE", "ASSIGN", "COMPLETE", "RELEASE", "RENEGE"].forEach(macro => {
      expect(prompt).toMatch(new RegExp(macro));
    });
  });

  it("constrains the model builder to supported distributions", () => {
    const prompt = buildModelBuilderSystemPrompt();
    ["exponential", "uniform", "normal", "triangular", "fixed", "lognormal", "empirical"].forEach(dist => {
      expect(prompt).toMatch(new RegExp(dist));
    });
  });

  it("tells the model builder to place user timing answers into DES Studio distribution fields", () => {
    const prompt = buildModelBuilderSystemPrompt();

    expect(prompt).toMatch(/distParams/);
    expect(prompt).toMatch(/average time-between-arrivals/i);
    expect(prompt).toMatch(/serviceTime/);
    expect(prompt).toMatch(/never leave timing defaults/i);
    expect(prompt).toMatch(/Service Complete B-event/i);
    expect(prompt).toMatch(/queue size > 0 and idle server count > 0/i);
    expect(prompt).toMatch(/RELEASE\(ServerType, Next Queue\)/);
  });

  it("declares the required JSON response keys", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/intent/);
    expect(prompt).toMatch(/questions/);
    expect(prompt).toMatch(/proposedModel/);
    expect(prompt).toMatch(/explanation/);
  });

  it("forbids partial JSON when the proposal would be too large", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/Never return partial JSON/i);
    expect(prompt).toMatch(/too detailed to fit/i);
  });

  it("requires queues to include customerType matching the arriving entity", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/customerType/);
    expect(prompt).toMatch(/role customer/i);
    // Must be framed as required, not optional
    expect(prompt).toMatch(/required/i);
    // Must be tied to the ARRIVE macro's first argument
    expect(prompt).toMatch(/ARRIVE\(\)/i);
  });

  it("includes the current model when one exists", () => {
    const message = buildModelBuilderUserMessage(
      "Add a second server",
      { entityTypes: [{ id: "srv", name: "Server", role: "server" }], queues: [], bEvents: [], cEvents: [], stateVariables: [] },
      [{ role: "user", content: "Initial request" }]
    );
    const payload = JSON.parse(message);

    expect(payload.currentModel.entityTypes[0].name).toBe("Server");
    expect(payload.conversationHistory[0].content).toBe("Initial request");
    expect(payload.requiredResponseKeys).toEqual(["intent", "questions", "proposedModel", "explanation"]);
  });
});
