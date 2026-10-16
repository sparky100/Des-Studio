import { DOMParser } from "npm:linkedom@0.16.11";
import { Readability } from "npm:@mozilla/readability@0.5.0";

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ZEN_BASE_URL = "https://opencode.ai/zen/v1";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const requestCounts = new Map<string, { count: number; resetAt: number }>();
type LlmMessage = { role?: string; content?: string };
type LlmProxyRequest = {
  version: string; kind: string; messages: LlmMessage[];
  maxTokens: number; stream: boolean; responseFormat: "text" | "json";
  // Optional per-request reasoning effort (see anthropicModelTraits). Absent
  // for every app's request today; the proxy then picks a default only for
  // models that reason by default.
  effort?: Effort;
};
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const VALID_EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
type LlmProviderConfig = {
  provider: string; model: string; apiKey: string;
  temperature?: number; rateLimitPerHour?: number; maxTokensPerRun?: number;
  // Optional stronger model for requests of kind "model_builder" (an app
  // generating or editing a whole model as one long JSON document), and
  // its own output ceiling. Unset = every request uses `model` /
  // `maxTokensPerRun`, exactly as before.
  buildModel?: string; buildMaxTokensPerRun?: number;
};

export const MODEL_BUILDER_KIND = "model_builder";
// A whole generated model (tens of variables, subscripts, equations) plus
// the reasoning that counts toward max_tokens on 5.x models needs far more
// than the everyday per-run ceiling (8192 in the live config today).
export const DEFAULT_BUILD_MAX_TOKENS = 16000;

export function isBuildRequest(request: { kind: string }) {
  return request.kind === MODEL_BUILDER_KIND;
}

// The config one request actually runs with: a model_builder request uses
// buildModel when one is configured; everything else is untouched.
export function configForRequest(request: { kind: string }, config: LlmProviderConfig): LlmProviderConfig {
  return isBuildRequest(request) && config.buildModel ? { ...config, model: config.buildModel } : config;
}

function rateLimitKey(request: Request) {
  return request.headers.get("authorization") || request.headers.get("x-forwarded-for") || "anonymous";
}

function isRateLimited(key: string, maxPerHour: number) {
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > maxPerHour;
}

function normalizeMessages(messages: unknown): LlmMessage[] {
  return Array.isArray(messages)
    ? messages.map((message: LlmMessage) => ({
      role: message?.role === "assistant" || message?.role === "assistant-confirm"
        ? "assistant"
        : message?.role === "system"
          ? "system"
          : "user",
      content: String(message?.content || ""),
    })).filter(message => message.content.trim())
    : [];
}

export function normalizeRequest(body: Record<string, unknown>, config: LlmProviderConfig): LlmProxyRequest | Response {
  const messages = normalizeMessages(body.messages);
  if (!messages.length) {
    return new Response("At least one LLM message is required", { status: 400, headers: CORS_HEADERS });
  }
  if (!body.version && body.model) {
    if (body.model !== config.model) {
      return new Response("Model is not allowed", { status: 400, headers: CORS_HEADERS });
    }
    return {
      version: "legacy", kind: "narrative", messages,
      maxTokens: Math.min(Number(body.max_tokens) || 450, 1000), stream: true, responseFormat: "text",
    };
  }
  const kind = String(body.kind || "narrative");
  const ceiling = kind === MODEL_BUILDER_KIND
    ? (config.buildMaxTokensPerRun || DEFAULT_BUILD_MAX_TOKENS)
    : (config.maxTokensPerRun || 16000);
  return {
    version: String(body.version || "2026-05-05"),
    kind, messages,
    maxTokens: Math.min(Number(body.maxTokens) || Number(body.max_tokens) || 450, ceiling),
    stream: body.stream !== false,
    responseFormat: body.responseFormat === "json" ? "json" : "text",
    effort: VALID_EFFORTS.includes(body.effort as Effort) ? body.effort as Effort : undefined,
  };
}

function splitSystemMessages(messages: LlmMessage[]) {
  const systemText = messages
    .filter(m => m.role === "system")
    .map(m => m.content || "")
    .filter(Boolean)
    .join("\n\n");
  const userMessages = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));
  return { systemText, userMessages };
}

// ── Anthropic model rules ────────────────────────────────────────────────────
// Every app on this proxy (Flow/DES Studio, Lens, Loop/SD Studio, Compass)
// shares ONE configured model, so newer models must work for all of them with
// no app-side change, while older models (e.g. today's claude-haiku-4-5) must
// keep receiving exactly the request they always have. These rules are the
// single place that knows which request fields a given model accepts.
//
//  - acceptsTemperature: Claude 4.6 and earlier accept any temperature.
//    Opus 4.7/4.8 and every 5.x / Fable / Mythos model reject a non-default
//    temperature with a 400, so it is omitted for them (and for unrecognised
//    models — leaving it out is always valid).
//  - reasonsByDefault: 5.x / Fable / Mythos models think before answering
//    even when the request doesn't ask, and that thinking counts toward
//    max_tokens. The apps size max_tokens for the answer alone (Lens sends
//    200-token JSON calls), so those models get REASONING_MIN_MAX_TOKENS of
//    headroom. max_tokens is a ceiling, not a target: unused headroom costs
//    nothing.
//  - supportsEffort: output_config.effort exists on 4.6+ (xhigh from 4.7);
//    Haiku 4.5 and Sonnet 4.5 reject it.
//  - serverFallback: models with a server-side refusal fallback
//    (`fallbacks: "default"`). Haiku 5.5 has none, and sending it is pointless
//    there, so it is gated per model.
export type AnthropicModelTraits = {
  acceptsTemperature: boolean;
  reasonsByDefault: boolean;
  supportsEffort: boolean;
  serverFallback: boolean;
};

export const REASONING_MIN_MAX_TOKENS = 4096;
// When a request names no effort, reasoning-by-default models run at "low":
// every current caller is a short, interactive task, and low keeps them fast
// and cheap. A caller can ask for more per request.
export const DEFAULT_REASONING_EFFORT: Effort = "low";
const SERVER_FALLBACK_MODELS = new Set(["claude-opus-5", "claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function anthropicModelTraits(model: string): AnthropicModelTraits {
  const id = String(model || "").trim().toLowerCase();
  if (/^claude-(fable|mythos)-/.test(id)) {
    return { acceptsTemperature: false, reasonsByDefault: true, supportsEffort: true, serverFallback: SERVER_FALLBACK_MODELS.has(id) };
  }
  // Legacy naming: claude-3-5-haiku, claude-3-7-sonnet-20250219, ...
  if (/^claude-[123]-/.test(id)) {
    return { acceptsTemperature: true, reasonsByDefault: false, supportsEffort: false, serverFallback: false };
  }
  const m = id.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/);
  if (!m) {
    // Unrecognised id: send only what every model accepts.
    return { acceptsTemperature: false, reasonsByDefault: true, supportsEffort: false, serverFallback: false };
  }
  const version = Number(m[2]) + Number(m[3] || 0) / 10;
  return {
    acceptsTemperature: version <= 4.6,
    reasonsByDefault: version >= 5,
    supportsEffort: version >= 4.6,
    serverFallback: SERVER_FALLBACK_MODELS.has(id),
  };
}

// xhigh arrived with 4.7; on 4.6 the nearest supported level is high.
function effortFor(traits: AnthropicModelTraits, model: string, requested: Effort | undefined): Effort | undefined {
  if (!traits.supportsEffort) return undefined;
  const effort = requested ?? (traits.reasonsByDefault ? DEFAULT_REASONING_EFFORT : undefined);
  if (!effort) return undefined;
  if (effort === "xhigh" && /-4-6$/.test(model)) return "high";
  return effort;
}

// Builds the Anthropic Messages request (headers + body) for the configured
// model. Pure, so the per-model rules are unit-testable without a network.
export function buildAnthropicRequest(request: LlmProxyRequest, config: LlmProviderConfig) {
  const { systemText, userMessages } = splitSystemMessages(request.messages);
  const traits = anthropicModelTraits(config.model);
  const body: Record<string, unknown> = {
    model: config.model,
    system: systemText || undefined,
    messages: userMessages,
    max_tokens: traits.reasonsByDefault ? Math.max(request.maxTokens, REASONING_MIN_MAX_TOKENS) : request.maxTokens,
    stream: request.stream,
  };
  if (traits.acceptsTemperature) body.temperature = config.temperature ?? 0.3;
  const effort = effortFor(traits, config.model, request.effort);
  if (effort) body.output_config = { effort };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (traits.serverFallback) {
    body.fallbacks = "default";
    headers["anthropic-beta"] = FALLBACK_BETA;
  }
  return { headers, body };
}

async function callAnthropic(request: LlmProxyRequest, config: LlmProviderConfig) {
  const { headers, body } = buildAnthropicRequest(request, config);
  return fetch(ANTHROPIC_API_URL, { method: "POST", headers, body: JSON.stringify(body) });
}

async function callOpenAI(request: LlmProxyRequest, config: LlmProviderConfig) {
  const messages = request.messages.map(m => ({
    role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));
  return fetch(OPENAI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model, messages,
      max_tokens: request.maxTokens, stream: request.stream,
      temperature: config.temperature ?? 0.3,
    }),
  });
}

function getZenEndpoint(model: string): { url: string; format: "openai" | "anthropic" | "google" } {
  const openaiCompatible = [
    "deepseek-v4-flash", "deepseek-v4-flash-free", "minimax-m2.7", "minimax-m2.5",
    "glm-5.1", "glm-5", "kimi-k2.5", "kimi-k2.6", "grok-build-0.1",
    "big-pickle", "mimo-v2.5-free", "north-mini-code-free", "nemotron-3-ultra-free",
  ];
  const anthropicModels = [
    "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-5", "claude-opus-4-1",
    "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-sonnet-4",
    "claude-haiku-4-5", "claude-3-5-haiku",
    "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus", "qwen3.5-plus",
  ];
  const googleModels = ["gemini-3.5-flash", "gemini-3.1-pro", "gemini-3-flash"];
  const openaiModels = [
    "gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-pro", "gpt-5.4-mini", "gpt-5.4-nano",
    "gpt-5.3-codex", "gpt-5.3-codex-spark", "gpt-5.2", "gpt-5.2-codex",
    "gpt-5.1", "gpt-5.1-codex", "gpt-5.1-codex-max", "gpt-5.1-codex-mini",
    "gpt-5", "gpt-5-codex", "gpt-5-nano",
  ];

  if (openaiCompatible.includes(model)) return { url: `${ZEN_BASE_URL}/chat/completions`, format: "openai" };
  if (anthropicModels.includes(model)) return { url: `${ZEN_BASE_URL}/messages`, format: "anthropic" };
  if (googleModels.includes(model)) return { url: `${ZEN_BASE_URL}/models/${model}`, format: "google" };
  if (openaiModels.includes(model)) return { url: `${ZEN_BASE_URL}/responses`, format: "openai" };
  return { url: `${ZEN_BASE_URL}/chat/completions`, format: "openai" };
}

async function callZen(request: LlmProxyRequest, config: LlmProviderConfig) {
  const { url, format } = getZenEndpoint(config.model);

  if (format === "anthropic") {
    const { systemText, userMessages } = splitSystemMessages(request.messages);
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        system: systemText || undefined,
        messages: userMessages,
        max_tokens: request.maxTokens,
        stream: request.stream,
        // Same rule as the direct Anthropic path (anthropicModelTraits):
        // Opus 4.7/4.8 reject a non-default temperature.
        ...(anthropicModelTraits(config.model).acceptsTemperature ? { temperature: config.temperature ?? 0.3 } : {}),
      }),
    });
  }

  if (format === "google") {
    const messages = request.messages.map(m => ({
      role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || ""),
    }));
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: request.maxTokens,
        stream: request.stream,
        temperature: config.temperature ?? 0.3,
      }),
    });
  }

  const messages = request.messages.map(m => ({
    role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: request.maxTokens,
      stream: request.stream,
      temperature: config.temperature ?? 0.3,
    }),
  });
}

async function callProvider(request: LlmProxyRequest, config: LlmProviderConfig) {
  switch (config.provider) {
    case "openai":
      return callOpenAI(request, config);
    case "opencode-go": {
      const zenConfig = { ...config, model: config.model.replace(/^opencode-go\//, "") };
      return callZen(request, zenConfig);
    }
    case "zen":
      return callZen(request, config);
    default:
      return callAnthropic(request, config);
  }
}

// Speech-to-text is independent of whichever chat/extraction provider is
// configured via platform_config's `llm` key -- it reads its own dedicated
// `whisper`/`deepgram` platform_config keys instead (falling back to the
// matching env secret if a key isn't set there), so an admin can configure
// either from Lens's own Admin Panel rather than needing Supabase Dashboard
// access. Default is OpenAI Whisper (plain text, unchanged from before). If
// a Deepgram key is available, Deepgram is used instead, which additionally
// returns per-speaker diarization (`segments`) -- consumers that only read
// `.text` (e.g. any existing caller) are unaffected either way, since
// `segments` is a new, additive field that's `null` whenever diarization
// isn't available.
type TranscriptSegment = { speaker: string; text: string };
type TranscriptResult = { text: string; segments: TranscriptSegment[] | null };

// Mirrors loadConfig()'s REST-fetch-with-service-role pattern for the `llm`
// key, extended to fetch `whisper`/`deepgram` in one request. Returns {} if
// either env var is missing or the request fails -- callers already fall
// back to their own env-var secret in that case, matching loadConfig()'s
// own fail-open behavior.
export async function loadTranscriptionKeys(): Promise<{ whisperApiKey?: string; deepgramApiKey?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return {};
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/platform_config?key=in.(whisper,deepgram)&select=key,value`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!res.ok) return {};
    const rows: { key: string; value?: { apiKey?: string } }[] = await res.json();
    const whisperApiKey = rows.find(r => r.key === "whisper")?.value?.apiKey || undefined;
    const deepgramApiKey = rows.find(r => r.key === "deepgram")?.value?.apiKey || undefined;
    return { whisperApiKey, deepgramApiKey };
  } catch (e) {
    console.error("[llm-proxy] loadTranscriptionKeys exception", e);
    return {};
  }
}

async function transcribeWithWhisper(audio: File, overrideApiKey?: string): Promise<TranscriptResult> {
  const apiKey = overrideApiKey || Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const model = Deno.env.get("TRANSCRIPTION_MODEL") || "whisper-1";
  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, audio.name || "recording.webm");
  upstreamForm.append("model", model);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstreamForm,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI transcription API ${response.status}: ${err}`);
  }

  const result = await response.json();
  return { text: result?.text || "", segments: null };
}

// Pure mapper kept separate from the network call so it's unit-testable
// without mocking fetch (see index.test.ts) -- turns Deepgram's nested
// response shape into the flat {text, segments} contract this function
// returns either way, regardless of which provider served the request.
export function mapDeepgramResponseToTranscript(result: unknown): TranscriptResult {
  const r = result as Record<string, any> | null | undefined;
  const text = r?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  const utterances = r?.results?.utterances;
  if (!Array.isArray(utterances) || utterances.length === 0) {
    return { text, segments: null };
  }
  const segments = utterances
    .map((u: any) => ({
      speaker: Number.isInteger(u?.speaker) ? `Speaker ${u.speaker + 1}` : "",
      text: String(u?.transcript || "").trim(),
    }))
    .filter((s: TranscriptSegment) => s.speaker && s.text);
  return { text, segments: segments.length > 0 ? segments : null };
}

async function transcribeWithDeepgram(audio: File, apiKey: string): Promise<TranscriptResult> {
  const response = await fetch(
    "https://api.deepgram.com/v1/listen?diarize=true&utterances=true&model=nova-2&smart_format=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": audio.type || "audio/webm",
      },
      body: audio,
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Deepgram transcription API ${response.status}: ${err}`);
  }

  return mapDeepgramResponseToTranscript(await response.json());
}

async function transcribeAudio(audio: File): Promise<TranscriptResult> {
  const { whisperApiKey, deepgramApiKey } = await loadTranscriptionKeys();
  const deepgramKey = deepgramApiKey || Deno.env.get("DEEPGRAM_API_KEY");
  if (deepgramKey) {
    try {
      return await transcribeWithDeepgram(audio, deepgramKey);
    } catch (e) {
      // Diarization is a bonus, not a hard dependency -- if Deepgram is down
      // or misconfigured, fall back to Whisper rather than breaking
      // transcription for every caller.
      console.error("[llm-proxy] Deepgram transcription failed, falling back to Whisper:", e);
    }
  }
  return transcribeWithWhisper(audio, whisperApiKey);
}

// URL import (Lens "Load from URL"): fetch a page server-side and extract
// its main article/content text, stripping navigation, ads, subscribe CTAs,
// and other page furniture -- this exists precisely because a plain client-
// side fetch(url) can't do this (CORS) and because the boilerplate-stripping
// needs a real HTML parser + Readability, not just a chat-completion call.
// Independent of whichever chat-completion provider is configured -- like
// transcription above, this doesn't touch `config`/`platform_config` at all.

// Blocks the naive/common SSRF vector for handleFetchUrl below: a hostname
// or literal IP that resolves to loopback, link-local, or RFC1918 private
// space (including the 169.254.169.254 cloud-metadata address). This does
// NOT defend against DNS rebinding (a hostname resolving to a private IP
// only at fetch time, after this check already passed against a different
// address) -- closing that fully would require fetching by a pre-resolved IP
// rather than by hostname, which this does not do. Exported so it's
// unit-testable in isolation (see index.test.ts).
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".localhost")) return true;

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. cloud metadata)
    return false;
  }

  const ipv6 = h.replace(/^\[|\]$/g, "");
  if (ipv6 === "::1") return true; // loopback
  if (/^fe80:/i.test(ipv6)) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(ipv6)) return true; // fc00::/7 unique local

  return false;
}

function fetchUrlError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function validateFetchUrl(rawUrl: unknown): URL | Response {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return fetchUrlError(400, "A valid http(s) URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return fetchUrlError(400, "A valid http(s) URL is required");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fetchUrlError(400, "A valid http(s) URL is required");
  }
  if (isBlockedHostname(parsed.hostname)) {
    return fetchUrlError(400, "This URL points at a private or internal address and can't be fetched");
  }
  return parsed;
}

export type ExtractedContent = { title: string; text: string };

// Pure HTML -> {title, text} extraction, kept separate from the network
// fetch so it's unit-testable without a live request (see index.test.ts) --
// same split this file already uses for mapDeepgramResponseToTranscript vs.
// transcribeWithDeepgram. linkedom's DOMParser has no documented base-URL
// option, so relative links/images inside the article aren't resolved --
// that only affects the (unused) HTML `content` field, not the `textContent`
// this function actually returns, so it's an acceptable gap for this use case.
export function extractReadableContent(html: string): ExtractedContent {
  // deno-lint-ignore no-explicit-any
  const document = new (DOMParser as any)().parseFromString(html, "text/html");
  // deno-lint-ignore no-explicit-any
  const reader = new (Readability as any)(document, { charThreshold: 200 });
  const article = reader.parse();
  if (!article || !article.textContent || !String(article.textContent).trim()) {
    throw new Error("Could not find readable article content on this page");
  }
  return {
    title: String(article.title || "").trim(),
    text: String(article.textContent || "").trim(),
  };
}

const FETCH_URL_TIMEOUT_MS = 15000;
const FETCH_URL_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const FETCH_URL_USER_AGENT = "Mozilla/5.0 (compatible; LensURLImport/1.0; +https://github.com/sparky100/lens)";

async function handleFetchUrl(rawUrl: unknown): Promise<Response> {
  const validated = validateFetchUrl(rawUrl);
  if (validated instanceof Response) return validated;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_URL_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(validated.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": FETCH_URL_USER_AGENT, Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
      redirect: "follow",
    });
  } catch (e) {
    const message = e instanceof Error && e.name === "AbortError"
      ? "Timed out fetching this URL"
      : `Could not reach this URL: ${e instanceof Error ? e.message : String(e)}`;
    return fetchUrlError(504, message);
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    return fetchUrlError(502, `The page returned ${upstream.status} ${upstream.statusText || ""}`.trim());
  }

  const contentLength = Number(upstream.headers.get("content-length") || 0);
  if (contentLength > FETCH_URL_MAX_BYTES) {
    return fetchUrlError(422, "This page is too large to import");
  }

  const contentType = upstream.headers.get("content-type") || "";
  const isHtml = contentType.includes("text/html");
  const isPlainText = contentType.includes("text/plain");
  if (!isHtml && !isPlainText) {
    return fetchUrlError(422, `This URL doesn't look like a text or HTML page (content-type: ${contentType || "unknown"})`);
  }

  let raw: string;
  try {
    raw = await upstream.text();
  } catch (e) {
    return fetchUrlError(502, `Failed reading the page body: ${e instanceof Error ? e.message : String(e)}`);
  }
  // Belt-and-braces cap for servers that omit or understate content-length --
  // truncate rather than reject outright, since the article content we
  // actually want is very likely near the start of the page regardless of
  // how much boilerplate follows.
  if (raw.length > FETCH_URL_MAX_BYTES) raw = raw.slice(0, FETCH_URL_MAX_BYTES);

  const sourceUrl = upstream.url || validated.toString();

  if (isPlainText) {
    const text = raw.trim();
    if (!text) return fetchUrlError(422, "This page had no readable text content");
    return new Response(JSON.stringify({ text, title: "", sourceUrl }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const { title, text } = extractReadableContent(raw);
    return new Response(JSON.stringify({ text, title, sourceUrl }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return fetchUrlError(422, e instanceof Error ? e.message : "Could not extract readable content from this page");
  }
}

async function loadConfig(): Promise<LlmProviderConfig> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceRoleKey) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/platform_config?key=eq.llm&select=value`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0) {
          const cfg = rows[0].value;
          const provider = cfg.provider || DEFAULT_PROVIDER;
          const model = cfg.model || DEFAULT_MODEL;
          const apiKey = cfg.apiKey ||
            (provider === "anthropic"
              ? Deno.env.get("ANTHROPIC_API_KEY")
              : provider === "zen" || provider === "opencode-go"
                ? Deno.env.get("ZEN_API_KEY")
                : Deno.env.get("OPENAI_API_KEY")) || "";
          const temperature = typeof cfg.temperature === "number" ? cfg.temperature : 0.3;
          const rateLimitPerHour = typeof cfg.rateLimitPerHour === "number" ? cfg.rateLimitPerHour : 25;
          const maxTokensPerRun = typeof cfg.maxTokensPerRun === "number" && cfg.maxTokensPerRun > 0
            ? cfg.maxTokensPerRun
            : undefined;
          const buildModel = typeof cfg.buildModel === "string" && cfg.buildModel.trim() ? cfg.buildModel.trim() : undefined;
          const buildMaxTokensPerRun = typeof cfg.buildMaxTokensPerRun === "number" && cfg.buildMaxTokensPerRun > 0
            ? cfg.buildMaxTokensPerRun
            : undefined;
          console.log("[llm-proxy] config:platform_config", { provider, model, buildModel, hasApiKey: !!apiKey, apiKeyLen: apiKey.length });
          return { provider, model, apiKey, temperature, rateLimitPerHour, maxTokensPerRun, buildModel, buildMaxTokensPerRun };
        }
        console.log("[llm-proxy] config:platform_config table has no 'llm' row — falling back to env vars");
      } else {
        console.error("[llm-proxy] config:platform_config fetch failed", res.status, await res.text().catch(() => ""));
      }
    } else {
      console.log("[llm-proxy] config:SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — falling back to env vars");
    }
  } catch (e) {
    console.error("[llm-proxy] config:loadConfig exception", e);
  }
  const provider = Deno.env.get("LLM_PROVIDER") || DEFAULT_PROVIDER;
  const model = Deno.env.get("LLM_MODEL") || DEFAULT_MODEL;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("ZEN_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
  const rateLimitPerHour = parseInt(Deno.env.get("LLM_RATE_LIMIT") || "25", 10);
  const temperature = parseFloat(Deno.env.get("LLM_TEMPERATURE") || "0.3");
  console.log("[llm-proxy] config:env_vars", { provider, model, hasApiKey: !!apiKey, apiKeyLen: apiKey.length });
  return { provider, model, apiKey, temperature, rateLimitPerHour };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  if (request.method === "GET") {
    const config = await loadConfig();
    return new Response(JSON.stringify({
      provider: config.provider,
      model: config.model,
      hasApiKey: !!config.apiKey,
      apiKeyPreview: config.apiKey ? config.apiKey.slice(0, 12) + "..." : "(none)",
      temperature: config.temperature,
      rateLimitPerHour: config.rateLimitPerHour,
      maxTokensPerRun: config.maxTokensPerRun,
      buildModel: config.buildModel ?? null,
      buildMaxTokensPerRun: config.buildMaxTokensPerRun ?? DEFAULT_BUILD_MAX_TOKENS,
    }, null, 2), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const config = await loadConfig();
  if (isRateLimited(rateLimitKey(request), config.rateLimitPerHour || 25)) {
    return new Response("Rate limit exceeded", { status: 429, headers: CORS_HEADERS });
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const audio = form.get("audio");
      if (!(audio instanceof File)) {
        return new Response(JSON.stringify({ error: { message: "Missing 'audio' file field" } }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      const result = await transcribeAudio(audio);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: { message } }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS }); }

  // URL import is independent of whichever chat-completion provider is
  // configured (like transcription above) -- handled before the apiKey check
  // below, since it doesn't need one.
  if (body.action === "fetch_url") {
    return await handleFetchUrl(body.url);
  }

  if (!config.apiKey) {
    return new Response("LLM provider is not configured", { status: 503, headers: CORS_HEADERS });
  }

  const proxyRequest = normalizeRequest(body, config);
  if (proxyRequest instanceof Response) return proxyRequest;
  const requestConfig = configForRequest(proxyRequest, config);
  if (requestConfig !== config) console.log("[llm-proxy] build request", { model: requestConfig.model, maxTokens: proxyRequest.maxTokens });
  const upstream = await callProvider(proxyRequest, requestConfig);

  if (!upstream.ok) {
    let detail = "";
    try { detail = await upstream.text(); } catch { /* ignore */ }
    return new Response(
      `Upstream ${upstream.status}: ${detail || "no body"}`,
      { status: upstream.status, headers: CORS_HEADERS },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": proxyRequest.stream ? "text/event-stream" : "application/json",
      "Cache-Control": "no-cache",
    },
  });
});
