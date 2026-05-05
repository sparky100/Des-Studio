import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const proxySource = readFileSync("supabase/functions/llm-proxy/index.ts", "utf8");

describe("llm-proxy provider router", () => {
  it("keeps provider and model selection server-side", () => {
    expect(proxySource).toMatch(/LLM_PROVIDER/);
    expect(proxySource).toMatch(/LLM_MODEL/);
    expect(proxySource).toMatch(/ANTHROPIC_MODEL/);
    expect(proxySource).toMatch(/function getProviderConfig/);
  });

  it("keeps backwards compatibility with the legacy Sprint 6 payload", () => {
    expect(proxySource).toMatch(/Backwards compatibility/);
    expect(proxySource).toMatch(/body\.model !== config\.model/);
    expect(proxySource).toMatch(/max_tokens/);
  });

  it("routes neutral requests through a provider implementation", () => {
    expect(proxySource).toMatch(/async function callProvider/);
    expect(proxySource).toMatch(/async function callAnthropic/);
    expect(proxySource).toMatch(/proxyRequest\.stream/);
  });
});
