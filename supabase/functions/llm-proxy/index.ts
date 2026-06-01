const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const requestCounts = new Map<string, { count: number; resetAt: number }>();
type LlmMessage = { role?: string; content?: string };
type LlmProxyRequest = {
  version: string; kind: string; messages: LlmMessage[];
  maxTokens: number; stream: boolean; responseFormat: "text" | "json";
};
type LlmProviderConfig = {
  provider: string; model: string; apiKey: string;
  temperature?: number; rateLimitPerHour?: number;
};

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

function normalizeRequest(body: Record<string, unknown>, config: LlmProviderConfig): LlmProxyRequest | Response {
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
  return {
    version: String(body.version || "2026-05-05"),
    kind: String(body.kind || "narrative"), messages,
    maxTokens: Math.min(Number(body.maxTokens) || Number(body.max_tokens) || 450, 16000),
    stream: body.stream !== false,
    responseFormat: body.responseFormat === "json" ? "json" : "text",
  };
}

async function callAnthropic(request: LlmProxyRequest, config: LlmProviderConfig) {
  const systemText = request.messages.find(m => m.role === "system")?.content || "";
  const userMessages = request.messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));
  const system = systemText || undefined;
  return fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model, system, messages: userMessages,
      max_tokens: request.maxTokens, stream: request.stream,
      temperature: config.temperature ?? 0.3,
    }),
  });
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

async function callProvider(request: LlmProxyRequest, config: LlmProviderConfig) {
  switch (config.provider) {
    case "openai":
    case "opencode-go":
      return callOpenAI(request, config);
    default:
      return callAnthropic(request, config);
  }
}

async function loadConfig(): Promise<LlmProviderConfig> {
  // Try platform_config table first so admin UI changes take effect without redeployment
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
          // API key: prefer DB-stored value, fall back to provider-specific env var
          const apiKey = cfg.apiKey ||
            (provider === "anthropic"
              ? Deno.env.get("ANTHROPIC_API_KEY")
              : Deno.env.get("OPENAI_API_KEY")) || "";
          const temperature = typeof cfg.temperature === "number" ? cfg.temperature : 0.3;
          const rateLimitPerHour = typeof cfg.rateLimitPerHour === "number" ? cfg.rateLimitPerHour : 25;
          return { provider, model, apiKey, temperature, rateLimitPerHour };
        }
      }
    }
  } catch {
    // fall through to env vars
  }
  // Fallback: env vars (used when platform_config is unavailable)
  const provider = Deno.env.get("LLM_PROVIDER") || DEFAULT_PROVIDER;
  const model = Deno.env.get("LLM_MODEL") || DEFAULT_MODEL;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
  const rateLimitPerHour = parseInt(Deno.env.get("LLM_RATE_LIMIT") || "25", 10);
  const temperature = parseFloat(Deno.env.get("LLM_TEMPERATURE") || "0.3");
  return { provider, model, apiKey, temperature, rateLimitPerHour };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const config = await loadConfig();
  if (isRateLimited(rateLimitKey(request), config.rateLimitPerHour || 25)) {
    return new Response("Rate limit exceeded", { status: 429, headers: CORS_HEADERS });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS }); }

  if (!config.apiKey) {
    return new Response("LLM provider is not configured", { status: 503, headers: CORS_HEADERS });
  }

  const proxyRequest = normalizeRequest(body, config);
  if (proxyRequest instanceof Response) return proxyRequest;
  const upstream = await callProvider(proxyRequest, config);

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
