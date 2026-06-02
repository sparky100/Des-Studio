import { supabase } from "../db/supabase.js";
import { LLM_RESPONSE_FORMATS, LLM_TASKS, buildLlmRequest } from "./contracts.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

function getProxyUrl() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/llm-proxy`;
  return "/functions/v1/llm-proxy";
}

function extractTokenFromSsePayload(payload) {
  if (!payload || payload === "[DONE]") return "";
  try {
    const data = JSON.parse(payload);
    return data?.delta?.text
      || data?.content_block?.text
      || data?.completion
      || data?.text
      || "";
  } catch {
    return "";
  }
}

function consumeSseChunk(chunk, onToken) {
  const events = chunk.split(/\n\n+/);
  for (const event of events) {
    const lines = event.split(/\r?\n/);
    const dataLines = lines
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim());
    if (!dataLines.length) continue;
    const token = extractTokenFromSsePayload(dataLines.join("\n"));
    if (token) onToken(token);
  }
}

export async function streamNarrative(prompt, {
  onToken,
  onComplete,
  onError,
  signal,
} = {}) {
  try {
    const sessionResponse = await supabase.auth.getSession();
    const accessToken = sessionResponse?.data?.session?.access_token;
    const response = await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(buildLlmRequest({
        kind: prompt.kind,
        messages: prompt.messages,
        maxTokens: prompt.max_tokens || prompt.maxTokens || 450,
        stream: true,
        responseFormat: "text",
      })),
      signal,
    });

    if (!response.ok) {
      let detail = "";
      try { detail = await response.text(); } catch {}
      throw new Error(`LLM proxy returned ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    if (!response.body?.getReader) {
      const text = await response.text();
      if (text) onToken?.(text);
      onComplete?.();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        consumeSseChunk(decoder.decode(result.value, { stream: !done }), token => onToken?.(token));
      }
    }
    onComplete?.();
  } catch (error) {
    if (error?.name === "AbortError") return;
    onError?.(error);
  }
}

function extractJsonText(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (payload.intent || payload.proposedModel || payload.questions) return JSON.stringify(payload);
  if (Array.isArray(payload.content)) {
    return payload.content
      .map(part => part?.text || "")
      .filter(Boolean)
      .join("\n");
  }
  return payload.text || payload.completion || "";
}

function tryExtractJson(raw) {
  // Strategy 1: code fences (```json ... ```) anywhere in text
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (fenced) return JSON.parse(fenced[1]);

  // Strategy 2: <json> tags anywhere
  const tagged = raw.match(/<json>\s*([\s\S]*?)<\/json>/i);
  if (tagged) return JSON.parse(tagged[1]);

  // Strategy 3: extract JSON object/array by finding balanced braces from the first { or [
  const firstBrace = raw.indexOf("{");
  const firstBracket = raw.indexOf("[");
  let start = -1;
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) start = firstBrace;
  else if (firstBracket >= 0) start = firstBracket;

  if (start >= 0) {
    const openChar = raw[start];
    const closeChar = openChar === "{" ? "}" : "]";
    let depth = 0;
    let lastValidEnd = -1;
    let inString = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      // Toggle string state only on unescaped quotes
      if (ch === '"' && (i === start || raw[i - 1] !== '\\')) inString = !inString;
      if (inString) continue;
      if (ch === openChar) depth++;
      else if (ch === closeChar) {
        depth--;
        if (depth >= 0) {
          const candidate = raw.slice(start, i + 1);
          try { JSON.parse(candidate); lastValidEnd = i + 1; } catch { /* deeper parse needed */ }
        }
      }
    }
    if (lastValidEnd > start) {
      const complete = raw.slice(start, lastValidEnd);
      try { return JSON.parse(complete); } catch { /* fall through */ }
    }
  }

  // Strategy 4: brute force — try raw text as-is
  return JSON.parse(raw);
}

function parseModelBuilderJson(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("AI returned empty response — please try again.");
  }
  try {
    return tryExtractJson(raw);
  } catch (error) {
    const friendly = new Error("AI returned incomplete or invalid model JSON. Please ask it to produce a smaller model proposal, or answer one more clarifying question first.");
    friendly.cause = error;
    friendly.rawResponse = raw;
    throw friendly;
  }
}

export async function streamModelBuilder(systemPrompt, messages = [], { onToken, onComplete, onError, signal } = {}) {
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), 60_000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeout.signal])
    : timeout.signal;

  try {
    const sessionResponse = await supabase.auth.getSession();
    const accessToken = sessionResponse?.data?.session?.access_token;
    const requestMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const response = await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(buildLlmRequest({
        kind: LLM_TASKS.MODEL_BUILDER,
        messages: requestMessages,
        maxTokens: 8000,
        stream: true,
        responseFormat: LLM_RESPONSE_FORMATS.JSON,
      })),
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = "";
      try { detail = await response.text(); } catch {}
      const err = new Error(`LLM proxy returned ${response.status}${detail ? `: ${detail}` : ""}`);
      err.rawResponse = detail;
      throw err;
    }

    if (!response.body?.getReader) {
      const text = await response.text();
      const parsed = parseModelBuilderJson(text);
      onComplete?.(parsed);
      return parsed;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sseBuffer = "";
    let done = false;

    const processSseEvent = event => {
      const lines = event.split(/\r?\n/);
      const dataLines = lines
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim());
      if (!dataLines.length) return;
      const token = extractTokenFromSsePayload(dataLines.join("\n"));
      if (token) {
        buffer += token;
        onToken?.(token);
      }
    };

    while (!done) {
      const result = await reader.read();
      done = result.done;
      sseBuffer += result.value ? decoder.decode(result.value, { stream: true }) : "";
      if (done) sseBuffer += decoder.decode(); // flush any buffered bytes

      // Process all complete SSE events (delimited by blank lines)
      let boundary;
      while ((boundary = sseBuffer.indexOf("\n\n")) >= 0) {
        processSseEvent(sseBuffer.slice(0, boundary));
        sseBuffer = sseBuffer.slice(boundary + 2);
      }
    }
    // Process any trailing data that arrived without a final blank line
    if (sseBuffer.trim()) processSseEvent(sseBuffer);

    const parsed = parseModelBuilderJson(buffer);
    onComplete?.(parsed);
    return parsed;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      if (timeout.signal.aborted) {
        const err = new Error("The model builder took too long — please try again.");
        onError?.(err);
      }
      return null;
    }
    onError?.(error);
    return null;
  }
}

export async function callModelBuilder(systemPrompt, messages = [], onComplete, onError, { signal } = {}) {
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), 60_000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeout.signal])
    : timeout.signal;

  try {
    const sessionResponse = await supabase.auth.getSession();
    const accessToken = sessionResponse?.data?.session?.access_token;
    const requestMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const response = await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(buildLlmRequest({
        kind: LLM_TASKS.MODEL_BUILDER,
        messages: requestMessages,
        maxTokens: 8000,
        stream: false,
        responseFormat: LLM_RESPONSE_FORMATS.JSON,
      })),
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = "";
      try { detail = await response.text(); } catch {}
      throw new Error(`LLM proxy returned ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const payload = await response.json();
    const text = extractJsonText(payload);
    const parsed = typeof payload === "object" && payload.intent ? payload : parseModelBuilderJson(text);
    onComplete?.(parsed);
    return parsed;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      if (timeout.signal.aborted) {
        const err = new Error("The model builder took too long — please try again.");
        onError?.(err);
      }
      return null;
    }
    onError?.(error);
    return null;
  }
}

export async function callLLMOnce(prompt) {
  const sessionResponse = await supabase.auth.getSession();
  const accessToken = sessionResponse?.data?.session?.access_token;
  const response = await fetch(getProxyUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(buildLlmRequest({
      kind: prompt.kind,
      messages: prompt.messages,
      maxTokens: prompt.maxTokens || prompt.max_tokens || 800,
      stream: false,
      responseFormat: "text",
    })),
  });
  if (!response.ok) {
    let detail = "";
    try { const err = await response.json(); detail = err?.error?.message || err?.message || ""; } catch {}
    throw new Error(`LLM proxy returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const payload = await response.json();
  if (Array.isArray(payload?.content)) return payload.content.map(p => p?.text || "").join("");
  return payload?.content || payload?.text || payload?.completion || String(payload || "");
}

export { DEFAULT_MODEL };
