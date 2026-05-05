import { describe, expect, it } from "vitest";
import {
  LLM_CONTRACT_VERSION,
  LLM_RESPONSE_FORMATS,
  LLM_TASKS,
  buildLlmRequest,
} from "../../src/llm/contracts.js";

describe("LLM provider-neutral contract", () => {
  it("builds a narrative request without exposing provider or model choices", () => {
    const request = buildLlmRequest({
      kind: LLM_TASKS.NARRATIVE,
      messages: [
        { role: "system", content: "Analyse results" },
        { role: "user", content: "Explain this run" },
      ],
      maxTokens: 550,
    });

    expect(request).toEqual(expect.objectContaining({
      version: LLM_CONTRACT_VERSION,
      kind: "narrative",
      maxTokens: 550,
      stream: true,
      responseFormat: "text",
    }));
    expect(request).not.toHaveProperty("provider");
    expect(request).not.toHaveProperty("model");
    expect(request.messages).toHaveLength(2);
  });

  it("supports model-builder JSON responses through the same request shape", () => {
    const request = buildLlmRequest({
      kind: LLM_TASKS.MODEL_BUILDER,
      messages: [{ role: "user", content: "Build a post office model" }],
      stream: false,
      responseFormat: LLM_RESPONSE_FORMATS.JSON,
    });

    expect(request.kind).toBe("model_builder");
    expect(request.stream).toBe(false);
    expect(request.responseFormat).toBe("json");
  });

  it("normalises invalid options to safe defaults", () => {
    const request = buildLlmRequest({
      kind: "provider-specific-task",
      responseFormat: "xml",
      maxTokens: "not-a-number",
      messages: [{ role: "tool", content: "hello" }, { role: "user", content: "" }],
    });

    expect(request.kind).toBe(LLM_TASKS.NARRATIVE);
    expect(request.responseFormat).toBe(LLM_RESPONSE_FORMATS.TEXT);
    expect(request.maxTokens).toBe(450);
    expect(request.messages).toEqual([{ role: "user", content: "hello" }]);
  });
});
