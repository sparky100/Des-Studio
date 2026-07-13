// Deno unit tests for llm-proxy's Deepgram response mapping and the
// platform_config-backed transcription key lookup.
// Run with: deno test --allow-env supabase/functions/llm-proxy/index.test.ts
//
// mapDeepgramResponseToTranscript has no network or Deno.env dependency, so
// it's exercised directly with hand-built response shapes. loadTranscriptionKeys
// does call fetch and read Deno.env, so those tests stub globalThis.fetch and
// use Deno.env.set/delete around each case, restoring both afterward. The
// Whisper/Deepgram upstream-calling paths and the Deno.serve request handler
// still aren't covered by an automated test (same as the rest of this
// function today, and as loadConfig's own equivalent fetch is today), since
// fully exercising those needs a live upstream call or a fuller HTTP mock
// harness this repo doesn't have for llm-proxy yet.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapDeepgramResponseToTranscript, loadTranscriptionKeys } from "./index.ts";

function withMockedFetch<T>(handler: (url: string) => Response, fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string) => Promise.resolve(handler(url))) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  for (const [k, v] of Object.entries(vars)) Deno.env.set(k, v);
  return fn().finally(() => {
    for (const k of Object.keys(vars)) Deno.env.delete(k);
  });
}

Deno.test("maps a diarized Deepgram response into {text, segments}", () => {
  const result = mapDeepgramResponseToTranscript({
    results: {
      channels: [{ alternatives: [{ transcript: "we're short staffed. I think it's the budget." }] }],
      utterances: [
        { speaker: 0, transcript: "we're short staffed." },
        { speaker: 1, transcript: "I think it's the budget." },
      ],
    },
  });

  assertEquals(result, {
    text: "we're short staffed. I think it's the budget.",
    segments: [
      { speaker: "Speaker 1", text: "we're short staffed." },
      { speaker: "Speaker 2", text: "I think it's the budget." },
    ],
  });
});

Deno.test("returns null segments when Deepgram reports no utterances (diarization unavailable/disabled)", () => {
  const result = mapDeepgramResponseToTranscript({
    results: {
      channels: [{ alternatives: [{ transcript: "just one voice here" }] }],
      utterances: [],
    },
  });

  assertEquals(result, { text: "just one voice here", segments: null });
});

Deno.test("returns null segments when the utterances field is missing entirely", () => {
  const result = mapDeepgramResponseToTranscript({
    results: { channels: [{ alternatives: [{ transcript: "no diarization here" }] }] },
  });

  assertEquals(result, { text: "no diarization here", segments: null });
});

Deno.test("drops malformed utterance entries (missing speaker index or empty transcript)", () => {
  const result = mapDeepgramResponseToTranscript({
    results: {
      channels: [{ alternatives: [{ transcript: "fine" }] }],
      utterances: [
        { speaker: 0, transcript: "fine" },
        { speaker: null, transcript: "no speaker index" },
        { speaker: 1, transcript: "" },
      ],
    },
  });

  assertEquals(result, {
    text: "fine",
    segments: [{ speaker: "Speaker 1", text: "fine" }],
  });
});

Deno.test("returns an empty string and null segments for a completely empty response", () => {
  const result = mapDeepgramResponseToTranscript({});
  assertEquals(result, { text: "", segments: null });
});

Deno.test("loadTranscriptionKeys reads both whisper and deepgram keys from platform_config in one request", () =>
  withEnv({ SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" }, () =>
    withMockedFetch(
      (url) => {
        assertEquals(url, "https://test.supabase.co/rest/v1/platform_config?key=in.(whisper,deepgram)&select=key,value");
        return new Response(JSON.stringify([
          { key: "whisper", value: { apiKey: "sk-whisper-123" } },
          { key: "deepgram", value: { apiKey: "dg-456" } },
        ]), { status: 200 });
      },
      async () => {
        const result = await loadTranscriptionKeys();
        assertEquals(result, { whisperApiKey: "sk-whisper-123", deepgramApiKey: "dg-456" });
      }
    )
  )
);

Deno.test("loadTranscriptionKeys returns only the keys present when just one row exists", () =>
  withEnv({ SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" }, () =>
    withMockedFetch(
      () => new Response(JSON.stringify([{ key: "deepgram", value: { apiKey: "dg-only" } }]), { status: 200 }),
      async () => {
        const result = await loadTranscriptionKeys();
        assertEquals(result, { whisperApiKey: undefined, deepgramApiKey: "dg-only" });
      }
    )
  )
);

Deno.test("loadTranscriptionKeys returns {} when SUPABASE_URL/SERVICE_ROLE_KEY aren't configured", () =>
  withEnv({}, async () => {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    const result = await loadTranscriptionKeys();
    assertEquals(result, {});
  })
);

Deno.test("loadTranscriptionKeys returns {} when the platform_config request fails", () =>
  withEnv({ SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" }, () =>
    withMockedFetch(
      () => new Response("db error", { status: 500 }),
      async () => {
        const result = await loadTranscriptionKeys();
        assertEquals(result, {});
      }
    )
  )
);

Deno.test("loadTranscriptionKeys returns {} when fetch itself throws", () =>
  withEnv({ SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error("network down"); }) as unknown as typeof fetch;
    try {
      const result = await loadTranscriptionKeys();
      assertEquals(result, {});
    } finally {
      globalThis.fetch = originalFetch;
    }
  })
);
