const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const requestCounts = new Map<string, { count: number; resetAt: number }>();
type LlmMessage = { role?: string; content?: string };
type LlmProxyRequest = {
  version: string;
  kind: string;
  messages: LlmMessage[];
  maxTokens: number;
  stream: boolean;
  responseFormat: "text" | "json";
};
type LlmProviderConfig = {
  provider: string;
  model: string;
};

function rateLimitKey(request: Request) {
  return request.headers.get("authorization") || request.headers.get("x-forwarded-for") || "anonymous";
}

function rateLimitExceeded(key: string) {
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > 10;
}

function getProviderConfig(): LlmProviderConfig {
  const provider = Deno.env.get("LLM_PROVIDER") || DEFAULT_PROVIDER;
  const model = Deno.env.get("LLM_MODEL") || Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;
  return { provider, model };
}

function normalizeMessages(messages: unknown): LlmMessage[] {
  return Array.isArray(messages)
    ? messages.map((message: LlmMessage) => ({
      role: message?.role === "assistant" || message?.role === "system" ? message.role : "user",
      content: String(message?.content || ""),
    })).filter(message => message.content.trim())
    : [];
}

function normalizeRequest(body: Record<string, unknown>, config: LlmProviderConfig): LlmProxyRequest | Response {
  const messages = normalizeMessages(body.messages);
  if (!messages.length) {
    return new Response("At least one LLM message is required", { status: 400, headers: CORS_HEADERS });
  }

  // Backwards compatibility for the Sprint 6 browser client payload shape.
  if (!body.version && body.model) {
    if (body.model !== config.model) {
      return new Response("Model is not allowed", { status: 400, headers: CORS_HEADERS });
    }
    return {
      version: "legacy",
      kind: "narrative",
      messages,
      maxTokens: Math.min(Number(body.max_tokens) || 450, 1000),
      stream: true,
      responseFormat: "text",
    };
  }

  return {
    version: String(body.version || "2026-05-05"),
    kind: String(body.kind || "narrative"),
    messages,
    maxTokens: Math.min(Number(body.maxTokens) || Number(body.max_tokens) || 450, 4000),
    stream: body.stream !== false,
    responseFormat: body.responseFormat === "json" ? "json" : "text",
  };
}

async function callAnthropic(request: LlmProxyRequest, config: LlmProviderConfig, apiKey: string) {
  const system = request.messages.find(message => message.role === "system")?.content || "";
  const userMessages = request.messages
    .filter(message => message.role !== "system")
    .map(message => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || ""),
    }));

  return fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      system,
      messages: userMessages,
      max_tokens: request.maxTokens,
      stream: request.stream,
    }),
  });
}

async function callProvider(request: LlmProxyRequest, config: LlmProviderConfig) {
  if (config.provider !== "anthropic") {
    return new Response(`LLM provider '${config.provider}' is not supported by this deployment`, {
      status: 503,
      headers: CORS_HEADERS,
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response("LLM provider is not configured", { status: 503, headers: CORS_HEADERS });
  }

  return callAnthropic(request, config, apiKey);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  if (rateLimitExceeded(rateLimitKey(request))) {
    return new Response("Rate limit exceeded", { status: 429, headers: CORS_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS });
  }

  const config = getProviderConfig();
  const proxyRequest = normalizeRequest(body, config);
  if (proxyRequest instanceof Response) return proxyRequest;
  const upstream = await callProvider(proxyRequest, config);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": proxyRequest.stream ? "text/event-stream" : "application/json",
      "Cache-Control": "no-cache",
    },
  });
});
