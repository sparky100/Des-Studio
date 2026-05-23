import { describe, expect, it } from "vitest";
import {
  buildHelpAssistantSystemPrompt,
  buildHelpUserMessage,
} from "../../src/llm/help-assistant-prompt.js";

describe("help assistant prompt", () => {
  it("buildHelpAssistantSystemPrompt returns a string", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(500);
  });

  it("prompt contains role and scope definition", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/DES Studio Help Assistant/i);
    expect(prompt).toMatch(/your role/i);
    expect(prompt).toMatch(/knowledge base/i);
  });

  it("prompt contains Three-Phase method reference", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/three-phase/i);
  });

  it("prompt contains macro references", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/ARRIVE/);
    expect(prompt).toMatch(/ASSIGN/);
    expect(prompt).toMatch(/COMPLETE/);
    expect(prompt).toMatch(/RENEGE/);
  });

  it("prompt contains distribution references", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/exponential/i);
    expect(prompt).toMatch(/uniform/i);
    expect(prompt).toMatch(/normal/i);
    expect(prompt).toMatch(/triangular/i);
  });

  it("prompt contains validation rules", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/V1/);
    expect(prompt).toMatch(/V8/);
    expect(prompt).toMatch(/error/i);
  });

  it("prompt contains queue disciplines", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/FIFO/i);
    expect(prompt).toMatch(/LIFO/i);
    expect(prompt).toMatch(/PRIORITY/i);
  });

  it("prompt contains KPI definitions", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/avgwait/i);
    expect(prompt).toMatch(/utilisation/i);
    expect(prompt).toMatch(/confidence interval/i);
  });

  it("prompt contains common problems section", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/common problems/i);
    expect(prompt).toMatch(/queue growing/i);
    expect(prompt).toMatch(/warmup/i);
  });

  it("prompt contains workflow modes", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/designing/i);
    expect(prompt).toMatch(/running/i);
    expect(prompt).toMatch(/analyzing/i);
    expect(prompt).toMatch(/library/i);
  });

  it("prompt contains context handling instructions", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/context handling/i);
    expect(prompt).toMatch(/workflow mode/i);
    expect(prompt).toMatch(/modelSummary/i);
  });

  it("buildHelpUserMessage includes currentModel context", () => {
    const message = buildHelpUserMessage(
      "How do I add a server?",
      {
        workflowMode: "Designing",
        currentTab: "entities",
        currentView: "model-detail",
        modelSummary: {
          entityCount: 2,
          queueCount: 1,
          bEventCount: 2,
          cEventCount: 1,
          hasValidationErrors: false,
          hasValidationWarnings: false,
        },
      }
    );
    expect(typeof message).toBe("string");
    expect(message).toMatch(/How do I add a server\?/);
    expect(message).toMatch(/Designing/);
    expect(message).toMatch(/entities/);
    expect(message).toMatch(/2 entity type\(s\)/);
    expect(message).toMatch(/1 queue\(s\)/);
  });

  it("buildHelpUserMessage handles empty context", () => {
    const message = buildHelpUserMessage("General question", {});
    expect(typeof message).toBe("string");
    expect(message).toBe("General question");
  });

  it("buildHelpUserMessage includes validation state", () => {
    const message = buildHelpUserMessage(
      "Why won't my model run?",
      {
        workflowMode: "Running",
        currentTab: "execute",
        modelSummary: {
          entityCount: 1,
          queueCount: 1,
          bEventCount: 1,
          cEventCount: 1,
          hasValidationErrors: true,
          hasValidationWarnings: false,
        },
      }
    );
    expect(message).toMatch(/has validation errors/);
  });
});
