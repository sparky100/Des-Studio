import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const proxySource = readFileSync("supabase/functions/llm-proxy/index.ts", "utf8");

describe("llm-proxy provider router", () => {
  it("keeps provider and model selection server-side", () => {
    expect(proxySource).toMatch(/LLM_PROVIDER/);
    expect(proxySource).toMatch(/LLM_MODEL/);
    expect(proxySource).toMatch(/DEFAULT_MODEL/);
    expect(proxySource).toMatch(/async function callProvider/);
  });

  it("keeps backwards compatibility with the legacy Sprint 6 payload", () => {
    expect(proxySource).toMatch(/!body\.version/);
    expect(proxySource).toMatch(/body\.model !== config\.model/);
    expect(proxySource).toMatch(/max_tokens/);
  });

  it("routes neutral requests through a provider implementation", () => {
    expect(proxySource).toMatch(/async function callProvider/);
    expect(proxySource).toMatch(/async function callAnthropic/);
    expect(proxySource).toMatch(/proxyRequest\.stream/);
  });

  it("merges every system-role message instead of dropping all but the first", () => {
    expect(proxySource).toMatch(/function splitSystemMessages/);
    // The old bug: `.find(m => m.role === "system")` picked one message, then
    // `.filter(m => m.role !== "system")` silently discarded any others (e.g.
    // "Working draft" / validation-retry notes injected mid-conversation).
    expect(proxySource).not.toMatch(/request\.messages\.find\(m => m\.role === "system"\)/);
    expect(proxySource).toMatch(/\.filter\(m => m\.role === "system"\)/);
    expect(proxySource).toMatch(/join\("\\n\\n"\)/);
  });
});
