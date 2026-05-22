import { describe, expect, it } from "vitest";
import {
  buildModelBuilderSystemPrompt,
  buildModelBuilderUserMessage,
} from "../../src/llm/model-builder-prompts.js";

describe("model builder prompts", () => {
  // ─── System prompt structural checks ────────────────────────────────────────

  it("instructs the LLM to ask questions one at a time", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/Ask questions one at a time/i);
  });

  it("embeds the schema reference document verbatim", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/SCHEMA REFERENCE/);
  });

  it("does NOT contain any numeric question cap", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).not.toMatch(/ask at most \d/i);
    expect(prompt).not.toMatch(/at most \d+ question/i);
    expect(prompt).not.toMatch(/no more than \d/i);
  });

  it("does NOT contain Phase A, Phase B, or Phase C labels", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).not.toMatch(/\bPHASE A\b/);
    expect(prompt).not.toMatch(/\bPHASE B\b/);
    expect(prompt).not.toMatch(/\bPHASE C\b/);
  });

  it("contains all five core macro names from the schema", () => {
    const prompt = buildModelBuilderSystemPrompt();
    ["ARRIVE", "ASSIGN", "COMPLETE", "RELEASE", "RENEGE"].forEach(macro => {
      expect(prompt).toContain(macro);
    });
  });

  it("lists all four intent values in the response format", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/clarify/);
    expect(prompt).toMatch(/confirm/);
    expect(prompt).toMatch(/\bbuild\b/);
    expect(prompt).toMatch(/\brefine\b/);
  });

  it("specifies the suggestions field in the response format", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/suggestions/);
  });

  it("specifies the summary field for confirm intent", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/summary/);
    expect(prompt).toMatch(/confirm/);
  });

  it("instructs questions to be a single string not an array", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/next single question/i);
  });

  it("forbids generating JSON before user confirmation", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/Only generate the model JSON after confirmation/i);
  });

  it("instructs the LLM not to invent macros or field names", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/Do not invent macros/i);
  });

  it("requires all distParams values to be strings", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/distParams values must be strings/i);
  });

  it("embeds the distribution table from the schema", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/Exponential/);
    expect(prompt).toMatch(/Triangular/);
    expect(prompt).toMatch(/Fixed/);
    expect(prompt).toMatch(/Uniform/);
  });

  it("embeds the validation rules from the schema", () => {
    const prompt = buildModelBuilderSystemPrompt();
    expect(prompt).toMatch(/V8/);
    expect(prompt).toMatch(/ARRIVE/);
  });

  // ─── buildModelBuilderUserMessage ───────────────────────────────────────────

  it("returns plain text containing the user request", () => {
    const message = buildModelBuilderUserMessage("Build a call centre", {});
    expect(message).toContain("Build a call centre");
  });

  it("includes currentModel with the correct label when non-empty", () => {
    const model = {
      entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
      queues: [],
      bEvents: [],
      cEvents: [],
      stateVariables: [],
    };
    const message = buildModelBuilderUserMessage("Add a second server", model);
    expect(message).toMatch(/Current model \(refine this, do not replace unless asked\)/);
    expect(message).toContain("Customer");
  });

  it("omits currentModel label when model is empty", () => {
    const message = buildModelBuilderUserMessage("Build something", {});
    expect(message).not.toMatch(/Current model/);
  });

  it("includes simulation results with label when provided", () => {
    const results = { queues: [{ name: "Triage", meanWait: 8.2 }] };
    const model = {
      entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
      queues: [],
      bEvents: [],
      cEvents: [],
      stateVariables: [],
    };
    const message = buildModelBuilderUserMessage("Waits are too long", model, results);
    expect(message).toMatch(/Simulation results/i);
    expect(message).toContain("Triage");
  });

  it("leaves simulation results absent when not provided", () => {
    const message = buildModelBuilderUserMessage("Build a post office", {});
    expect(message).not.toMatch(/Simulation results/i);
  });
});
