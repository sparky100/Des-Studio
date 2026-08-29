// Fetch-level test harness for the model-builder LLM flows.
//
// WHY THIS EXISTS: the 2026-08-29 "stuck assistant" bug (PR #501) survived
// 3,400+ tests because every panel test mocked src/llm/apiClient.js — a module
// we own — so the real parse step (parseModelBuilderJson/tryExtractJson) never
// ran in any test that also ran the panel. This harness mocks ONLY global
// `fetch`, the true network boundary, so raw LLM response text flows through
// the real parser into the real component. Rule of thumb it encodes: mock the
// world, not your own modules.
//
// Mechanics (verified against src/llm/apiClient.js):
// - streamModelBuilder: when the response has NO `body` property it takes the
//   non-SSE fallback — `await response.text()` → parseModelBuilderJson. So a
//   plain-object response with `text()` and no `body` needs no SSE simulation.
// - callModelBuilder (the panel's retry paths): `await response.json()` →
//   extractJsonText joins content[].text → parseModelBuilderJson. Wrapping the
//   raw text as { content: [{ text: raw }] } routes it through the same real
//   parser. (Never return a bare object with an `intent` key from json() —
//   apiClient short-circuits past the parser for those.)
// Each queued response exposes BOTH shapes, so one queue serves both entry
// points. `vi.stubGlobal` + the root config's `unstubGlobals: true` restores
// fetch automatically after every test.
import { vi, expect } from "vitest";

/**
 * Install a scripted fetch mock. Each queue entry is either a raw LLM response
 * string, or `{ status, text? }` for an HTTP error response. Fetching past the
 * end of the queue throws loudly — an over-budget fetch is a finding, not noise.
 * Returns `{ fetchMock, calls }`; each call records `{ url, body }` with the
 * request body JSON-parsed so tests can assert on the replayed message history.
 */
export function installLlmFetchMock(queue) {
  const remaining = [...queue];
  const calls = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (remaining.length === 0) {
      throw new Error(`LLM fetch queue exhausted after ${calls.length} call(s) — a code path fetched more than the journey scripted.`);
    }
    const next = remaining.shift();
    if (next && typeof next === "object" && "status" in next) {
      return { ok: false, status: next.status, text: async () => next.text ?? "" };
    }
    const raw = String(next);
    return {
      ok: true,
      // No `body` property → streamModelBuilder's text() fallback (real parser).
      text: async () => raw,
      // callModelBuilder's json() path → extractJsonText → real parser.
      json: async () => ({ content: [{ text: raw }] }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

/** Stringify a compliant model-builder JSON envelope. */
export function envelope(obj) {
  return JSON.stringify({ questions: null, summary: null, proposedModel: null, explanation: null, suggestions: null, ...obj });
}

/**
 * The wire-contract invariant from PR #501: every assistant turn the app
 * replays to the LLM must be the strict JSON envelope the system prompt
 * demands — replaying the model's own past turns as bare prose teaches it to
 * drift into prose. Asserts every role:"assistant" message in a captured
 * request body parses as JSON with a string `intent`. Returns the count so
 * callers can additionally assert how many assistant turns were replayed.
 */
export function expectLlmTurnsEnveloped(messages) {
  const assistantTurns = (messages || []).filter(m => m.role === "assistant");
  for (const turn of assistantTurns) {
    let parsed = null;
    try { parsed = JSON.parse(turn.content); } catch { /* asserted below */ }
    expect(parsed, `assistant turn replayed to the LLM must be the JSON envelope, got: ${String(turn.content).slice(0, 120)}`).toBeTruthy();
    expect(typeof parsed.intent, `replayed assistant envelope must carry an intent: ${String(turn.content).slice(0, 120)}`).toBe("string");
  }
  return assistantTurns.length;
}
