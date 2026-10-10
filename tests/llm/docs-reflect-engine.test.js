// The help assistant, the model-builder AI and the downloadable prompt pack
// must describe the engine as it is. Guards the B1/B2/B3/C features and the
// removed "state variable on the right-hand side is a literal" rule.
import { describe, it, expect } from "vitest";
import { buildHelpAssistantSystemPrompt } from "../../src/llm/help-assistant-prompt.js";
import { buildModelBuilderSystemPrompt } from "../../src/llm/model-builder-prompts.js";
import { buildLLMSchemaPromptPack } from "../../src/llm/bundleExport.js";

const sources = {
  help: () => buildHelpAssistantSystemPrompt(),
  modelBuilder: () => buildModelBuilderSystemPrompt(),
  promptPack: () => buildLLMSchemaPromptPack(),
};

describe.each(Object.entries(sources))("%s", (_name, build) => {
  const text = build();

  it("documents ASSIGN ... SCAN", () => {
    expect(text).toMatch(/Entity\.\w+, SCAN\)/);
    expect(text).toContain("V77");
  });

  it("documents DRAIN_PARTIAL", () => {
    expect(text).toContain("DRAIN_PARTIAL(");
  });

  it("documents quantityAttr", () => {
    expect(text).toMatch(/quantityAttr/);
    expect(text).toContain("V78");
  });

  it("documents state variables on the right-hand side", () => {
    expect(text).toMatch(/clock >= closureStart/);
    expect(text).toContain("V76");
  });

  it("no longer claims a right-hand-side state variable is always a literal", () => {
    expect(text).not.toMatch(/state-variable right side\s+silently evaluates to false forever/);
    expect(text).not.toMatch(/never for a bare state-variable name/);
    expect(text).not.toMatch(/never re-resolved as another queue length, server count, or state variable/);
  });
});
