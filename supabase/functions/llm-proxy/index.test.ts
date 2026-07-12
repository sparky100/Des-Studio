// Deno unit tests for llm-proxy's Deepgram response mapping.
// Run with: deno test --allow-env supabase/functions/llm-proxy/index.test.ts
//
// Only the pure mapDeepgramResponseToTranscript function is tested here --
// it has no network or Deno.env dependency, so it's exercised directly with
// hand-built response shapes rather than mocking fetch. The Whisper path and
// the Deno.serve request handler aren't covered by an automated test (same
// as the rest of this function today), since both require a live upstream
// call or a full HTTP mock harness this repo doesn't have for llm-proxy yet.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapDeepgramResponseToTranscript } from "./index.ts";

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
