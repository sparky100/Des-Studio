import { describe, expect, it } from "vitest";
import {
  buildModelBuilderSystemPrompt,
  buildModelBuilderUserMessage,
} from "../../src/llm/model-builder-prompts.js";

describe("model builder prompts", () => {
  it("constrains the model builder to the supported macro vocabulary (7 macros)", () => {
    const prompt = buildModelBuilderSystemPrompt();
    ["ARRIVE", "ASSIGN", "COMPLETE", "RELEASE", "RENEGE", "BATCH", "UNBATCH"].forEach(macro => {
      expect(prompt).toMatch(new RegExp(macro));
    });
    expect(prompt).toMatch(/BATCH.*C-Event/i);
    expect(prompt).toMatch(/UNBATCH.*B-Event/i);
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

  it("mandates COMPLETE() for final-stage completion B-events and RELEASE() only for intermediate routing", () => {
    const prompt = buildModelBuilderSystemPrompt();
    // Final-stage completion must use COMPLETE()
    expect(prompt).toMatch(/COMPLETE\(\).*final stage/i);
    // Must explicitly forbid RELEASE() on final-stage events
    expect(prompt).toMatch(/Never use RELEASE\(\) as the effect of a final-stage/i);
    // Intermediate routing uses RELEASE(ServerType, NextQueueName)
    expect(prompt).toMatch(/RELEASE\(ServerType, NextQueueName\)/);
  });

  it("requires PRIORITY queue discipline when entity has a priority attribute", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/priority.*attrDef/i);
    expect(prompt).toMatch(/PRIORITY.*queue discipline/i);
    expect(prompt).toMatch(/lower numbers.*higher priority/i);
    expect(prompt).toMatch(/1 = highest/i);
    expect(prompt).toMatch(/valueType.*number/i);
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

  it("includes simulation results in the payload when results are provided", () => {
    const results = {
      queues: [{ name: "Triage", meanWait: 8.2, maxWait: 14.3 }],
      resources: [{ name: "Nurse", utilisation: 0.98 }],
      throughput: 42,
      served: 40,
      reneged: 2,
      avgWait: 8.2,
      avgService: 4.1,
      avgSojourn: 12.3,
    };
    const message = buildModelBuilderUserMessage(
      "Waits are too long, add a server",
      { entityTypes: [{ id: "cust", name: "Customer", role: "customer" }], queues: [], bEvents: [], cEvents: [], stateVariables: [] },
      [],
      results
    );
    const payload = JSON.parse(message);

    expect(payload.simulationResults).toEqual(results);
    expect(payload.instruction).toMatch(/simulation results/i);
    expect(payload.instruction).toMatch(/bottlenecks/i);
  });

  it("leaves simulationResults null when no results provided", () => {
    const message = buildModelBuilderUserMessage(
      "Add a server",
      { entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] },
      []
    );
    const payload = JSON.parse(message);
    expect(payload.simulationResults).toBeNull();
  });
});
