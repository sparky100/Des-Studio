import { describe, expect, it } from "vitest";
import {
  buildHelpAssistantSystemPrompt,
  buildHelpUserMessage,
} from "../../src/llm/help-assistant-prompt.js";

describe("help assistant prompt", () => {
  it("buildHelpAssistantSystemPrompt returns a string", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(1000);
  });

  it("prompt contains role and scope definition", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/DES Studio Help Assistant/i);
    expect(prompt).toMatch(/your role/i);
    expect(prompt).toMatch(/scope/i);
  });

  it("prompt contains User Guide excerpts", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/getting started/i);
    expect(prompt).toMatch(/entity types/i);
    expect(prompt).toMatch(/queues/i);
    expect(prompt).toMatch(/b-events/i);
    expect(prompt).toMatch(/c-events/i);
    expect(prompt).toMatch(/distributions/i);
    expect(prompt).toMatch(/running simulations/i);
    expect(prompt).toMatch(/results/i);
  });

  it("prompt contains Engineering Spec excerpts", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/three-phase method/i);
    expect(prompt).toMatch(/model schema/i);
    expect(prompt).toMatch(/macros/i);
    expect(prompt).toMatch(/validation rules/i);
  });

  it("prompt contains LLM schema (macros, distributions)", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/b-event macros/i);
    expect(prompt).toMatch(/c-event macros/i);
    expect(prompt).toMatch(/ARRIVE/);
    expect(prompt).toMatch(/ASSIGN/);
    expect(prompt).toMatch(/COMPLETE/);
    expect(prompt).toMatch(/exponential/i);
    expect(prompt).toMatch(/uniform/i);
    expect(prompt).toMatch(/normal/i);
  });

  it("prompt contains scope boundaries", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/you do not/i);
    expect(prompt).toMatch(/ai insights/i);
    expect(prompt).toMatch(/ai generated model/i);
  });

  it("prompt contains example Q&A pairs", () => {
    const prompt = buildHelpAssistantSystemPrompt();
    expect(prompt).toMatch(/example q&a/i);
    expect(prompt).toMatch(/exponential inter-arrival/i);
    expect(prompt).toMatch(/b-events and c-events/i);
    expect(prompt).toMatch(/replications/i);
    expect(prompt).toMatch(/queue growing/i);
    expect(prompt).toMatch(/priority queuing/i);
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
