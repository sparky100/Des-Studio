import { supabase } from "../db/supabase.js";

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
      body: JSON.stringify({
        messages: prompt.messages,
        model: DEFAULT_MODEL,
        max_tokens: prompt.max_tokens || 450,
      }),
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

export { DEFAULT_MODEL };
