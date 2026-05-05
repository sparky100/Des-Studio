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
