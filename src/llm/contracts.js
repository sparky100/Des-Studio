export const LLM_CONTRACT_VERSION = "2026-05-05";

export const LLM_TASKS = Object.freeze({
  NARRATIVE: "narrative",
  COMPARISON: "comparison",
  SENSITIVITY: "sensitivity",
  MODEL_BUILDER: "model_builder",
});

export const LLM_RESPONSE_FORMATS = Object.freeze({
  TEXT: "text",
  JSON: "json",
});

const TASK_SET = new Set(Object.values(LLM_TASKS));
const FORMAT_SET = new Set(Object.values(LLM_RESPONSE_FORMATS));

function normaliseMessages(messages = []) {
  return messages
    .filter(message => message && typeof message === "object")
    .map(message => ({
      role: message.role === "assistant" || message.role === "system" ? message.role : "user",
      content: String(message.content || ""),
    }))
    .filter(message => message.content.trim());
}

export function buildLlmRequest({
  kind = LLM_TASKS.NARRATIVE,
  messages = [],
  maxTokens = 450,
  stream = true,
  responseFormat = LLM_RESPONSE_FORMATS.TEXT,
} = {}) {
  const task = TASK_SET.has(kind) ? kind : LLM_TASKS.NARRATIVE;
  const format = FORMAT_SET.has(responseFormat) ? responseFormat : LLM_RESPONSE_FORMATS.TEXT;
  const tokenLimit = Math.min(Math.max(Number(maxTokens) || 450, 1), 4000);

  return {
    version: LLM_CONTRACT_VERSION,
    kind: task,
    messages: normaliseMessages(messages),
    maxTokens: tokenLimit,
    stream: Boolean(stream),
    responseFormat: format,
  };
}
