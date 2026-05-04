const ALLOWED_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const requestCounts = new Map<string, { count: number; resetAt: number }>();

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

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response("LLM provider is not configured", { status: 503, headers: CORS_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS });
  }

  if (body?.model !== ALLOWED_MODEL) {
    return new Response("Model is not allowed", { status: 400, headers: CORS_HEADERS });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages.find((message: { role?: string }) => message.role === "system")?.content || "";
  const userMessages = messages
    .filter((message: { role?: string }) => message.role !== "system")
    .map((message: { role?: string; content?: string }) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || ""),
    }));

  const upstream = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ALLOWED_MODEL,
      system,
      messages: userMessages,
      max_tokens: Math.min(Number(body.max_tokens) || 450, 1000),
      stream: true,
    }),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
});
