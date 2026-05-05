import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callModelBuilder, streamNarrative } from "../../src/llm/apiClient.js";
import { supabase } from "../../src/db/supabase.js";

function makeStream(text) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: {"delta":{"text":"${text}"}}\n\n`));
      controller.close();
    },
  });
}

describe("LLM API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeStream("hello"),
    });
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the provider-neutral request contract while preserving streaming callbacks", async () => {
    const onToken = vi.fn();
    const onComplete = vi.fn();

    await streamNarrative(
      {
        kind: "comparison",
        messages: [{ role: "user", content: "Compare runs" }],
        max_tokens: 550,
      },
      { onToken, onComplete }
    );

    expect(global.fetch).toHaveBeenCalledOnce();
    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual(expect.objectContaining({
      version: "2026-05-05",
      kind: "comparison",
      maxTokens: 550,
      stream: true,
      responseFormat: "text",
    }));
    expect(body).not.toHaveProperty("model");
    expect(body).not.toHaveProperty("provider");
    expect(options.headers.Authorization).toBe("Bearer token-1");
    expect(onToken).toHaveBeenCalledWith("hello");
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("uses the full model-builder token budget for complete JSON proposals", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        intent: "clarify",
        questions: ["How many servers?"],
        proposedModel: null,
        explanation: "One detail is needed.",
      }),
    });

    await callModelBuilder("system", [{ role: "user", content: "Build a clinic" }], vi.fn(), vi.fn());

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual(expect.objectContaining({
      kind: "model_builder",
      maxTokens: 4000,
      stream: false,
      responseFormat: "json",
    }));
  });

  it("reports malformed model-builder JSON with a user-facing error", async () => {
    const onError = vi.fn();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ content: [{ text: '{"intent":"build","explanation":"' }] }),
    });

    await callModelBuilder("system", [{ role: "user", content: "Build a clinic" }], vi.fn(), onError);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toMatch(/incomplete or invalid model JSON/i);
  });
});
