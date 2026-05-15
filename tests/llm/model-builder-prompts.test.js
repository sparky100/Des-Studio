import { describe, expect, it } from "vitest";
import {
  buildModelBuilderSystemPrompt,
  buildModelBuilderUserMessage,
} from "../../src/llm/model-builder-prompts.js";

describe("model builder prompts", () => {
  it("includes all original macros in the system prompt", () => {
    const prompt = buildModelBuilderSystemPrompt();
    ["ARRIVE", "ASSIGN", "COMPLETE", "RELEASE", "RENEGE", "BATCH", "UNBATCH"].forEach(macro => {
      expect(prompt).toMatch(new RegExp(macro));
    });
    expect(prompt).toMatch(/BATCH.*C-Event/i);
    expect(prompt).toMatch(/UNBATCH.*B-Event/i);
  });

  it("includes all Sprint 31–37 macros in the system prompt", () => {
    const prompt = buildModelBuilderSystemPrompt();
    ["PREEMPT", "FAIL", "REPAIR", "SPLIT", "COSEIZE", "MATCH", "SET", "SET_ATTR", "COST"].forEach(macro => {
      expect(prompt).toContain(macro);
    });
  });

  it("constrains the model builder to supported distributions including Schedule", () => {
    const prompt = buildModelBuilderSystemPrompt();
    ["exponential", "uniform", "normal", "triangular", "fixed", "erlang", "empirical", "schedule"].forEach(dist => {
      expect(prompt).toMatch(new RegExp(dist, "i"));
    });
  });

  it("includes a distribution selection guide", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/distribution selection guide/i);
    expect(prompt).toMatch(/Exponential.*inter-arrival/i);
    expect(prompt).toMatch(/Triangular.*best.*likely.*worst/i);
    expect(prompt).toMatch(/Schedule.*planned arrival/i);
  });

  it("includes the template catalogue with all 16 template IDs", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/template catalogue/i);
    [
      "mm1", "er-triage", "outpatient-clinic", "ward-admission", "surgical-suite",
      "call-center", "fast-food", "airport", "bank-branch", "retail-checkout",
      "factory", "construction", "warehouse", "order-fulfillment",
      "port-berth", "data-center",
    ].forEach(id => {
      expect(prompt).toContain(id);
    });
  });

  it("instructs the LLM to prefer adapting templates over building from scratch", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/prefer adapting over building from scratch/i);
    expect(prompt).toMatch(/adapting a template is always preferred/i);
  });

  it("includes intent:template in the response schema", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/intent.*build.*refine.*clarify.*template/i);
    expect(prompt).toMatch(/templateId/);
  });

  it("tells the model builder to place user timing answers into DES Studio distribution fields", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/distParams/);
    expect(prompt).toMatch(/average time-between-arrivals/i);
    expect(prompt).toMatch(/serviceTime/);
    expect(prompt).toMatch(/never leave timing defaults/i);
    expect(prompt).toMatch(/Service Complete B-event/i);
    expect(prompt).toMatch(/queue size > 0 and idle server count > 0/i);
    expect(prompt).toMatch(/RELEASE\(ServerType, NextQueueName\)/);
  });

  it("declares the required JSON response keys including templateId", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/intent/);
    expect(prompt).toMatch(/questions/);
    expect(prompt).toMatch(/proposedModel/);
    expect(prompt).toMatch(/explanation/);
    expect(prompt).toMatch(/templateId/);
  });

  it("forbids partial JSON when the proposal would be too large", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/Never return partial JSON/i);
    expect(prompt).toMatch(/too detailed to fit/i);
  });

  it("mandates COMPLETE() for final-stage completion B-events and RELEASE() only for intermediate routing", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/COMPLETE\(\).*final stage/i);
    expect(prompt).toMatch(/Never use RELEASE\(\) as the effect of a final-stage/i);
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
    expect(prompt).toMatch(/required/i);
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
    expect(payload.requiredResponseKeys).toContain("templateId");
  });

  it("instructs to check the template catalogue when no current model exists", () => {
    const message = buildModelBuilderUserMessage("Build a call centre", {}, []);
    const payload = JSON.parse(message);
    expect(payload.instruction).toMatch(/template catalogue/i);
  });

  it("includes simulation results in the payload when results are provided", () => {
    const results = {
      queues: [{ name: "Triage", meanWait: 8.2, maxWait: 14.3 }],
      resources: [{ name: "Nurse", utilisation: 0.98 }],
      throughput: 42, served: 40, reneged: 2, avgWait: 8.2, avgService: 4.1, avgSojourn: 12.3,
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
    const message = buildModelBuilderUserMessage("Add a server", { entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] }, []);
    const payload = JSON.parse(message);
    expect(payload.simulationResults).toBeNull();
  });
});
