// Golden-corpus runner: every observed/expected raw model-builder LLM response
// shape, pushed through the REAL parser via the public callModelBuilder entry
// point (fetch is the only mock — see tests/__helpers__/llmFetchHarness.js).
// The corpus itself lives in tests/__helpers__/llmModelBuilderResponses.js;
// every production incident adds an entry there.
import { describe, it, expect, vi } from "vitest";
import { callModelBuilder } from "../../src/llm/apiClient.js";
import { installLlmFetchMock } from "../__helpers__/llmFetchHarness.js";
import { MODEL_BUILDER_RESPONSE_CORPUS } from "../__helpers__/llmModelBuilderResponses.js";

describe("model-builder golden response corpus — raw LLM reply shapes through the real parser", () => {
  it.each(MODEL_BUILDER_RESPONSE_CORPUS.map(f => [f.name, f]))("%s", async (_name, fixture) => {
    installLlmFetchMock([fixture.raw]);
    const onComplete = vi.fn();
    const onError = vi.fn();

    await callModelBuilder("system", [{ role: "user", content: "corpus probe" }], onComplete, onError);

    if (fixture.expected.kind === "error") {
      expect(onComplete).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].message).toMatch(fixture.expected.match);
    } else {
      expect(onError).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledOnce();
      const result = onComplete.mock.calls[0][0];
      expect(result.intent).toBe(fixture.expected.intent);
      if (fixture.expected.questionsInclude) {
        const questions = Array.isArray(result.questions) ? result.questions.join("\n") : String(result.questions);
        expect(questions).toContain(fixture.expected.questionsInclude);
      }
      if (fixture.expected.hasProposedModel) {
        expect(result.proposedModel).toBeTruthy();
      }
    }
  });
});
