import { supabase } from "../db/supabase.js";
import { LLM_RESPONSE_FORMATS, LLM_TASKS, buildLlmRequest } from "./contracts.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

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
      throw new Error(`LLM proxy returned ${response.status}`);
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

function parseModelBuilderJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try {
    return JSON.parse(fenced ? fenced[1] : raw);
  } catch (error) {
    const friendly = new Error("AI returned incomplete or invalid model JSON. Please ask it to produce a smaller model proposal, or answer one more clarifying question first.");
    friendly.cause = error;
    throw friendly;
  }
}

export async function callModelBuilder(systemPrompt, messages = [], onComplete, onError, { signal } = {}) {
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
        maxTokens: 4000,
        stream: false,
        responseFormat: LLM_RESPONSE_FORMATS.JSON,
      })),
      signal,
    });

    if (!response.ok) {
      throw new Error(`LLM proxy returned ${response.status}`);
    }

    const payload = await response.json();
    const text = extractJsonText(payload);
    const parsed = typeof payload === "object" && payload.intent ? payload : parseModelBuilderJson(text);
    onComplete?.(parsed);
    return parsed;
  } catch (error) {
    if (error?.name === "AbortError") return null;
    onError?.(error);
    return null;
  }
}

export { DEFAULT_MODEL };
