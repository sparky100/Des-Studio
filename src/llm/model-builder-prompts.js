const MACROS = ["ARRIVE", "ASSIGN", "COMPLETE", "RELEASE", "RENEGE"];
const DISTRIBUTIONS = ["exponential", "uniform", "normal", "triangular", "fixed", "lognormal", "empirical", "piecewise"];
const MODEL_SECTIONS = ["entityTypes", "stateVariables", "bEvents", "cEvents", "queues"];

function trimHistory(history = [], limit = 10) {
  return history.slice(-limit).map(turn => ({
    role: turn.role === "assistant" ? "assistant" : "user",
    content: String(turn.content || ""),
  }));
}

export function buildModelBuilderSystemPrompt() {
  return [
    "You are a DES Studio model construction assistant.",
    "Return only valid JSON. Do not include Markdown fences or commentary outside JSON.",
    "DES Studio uses one canonical model_json shared by Forms/Tabs, AI Generated Model, and Visual Designer authoring modes.",
    "Allowed top-level model_json sections: entityTypes, stateVariables, bEvents, cEvents, queues.",
    "Entity types: id, name, role customer|server, count for server capacity, attrDefs with name, valueType number|string|boolean, defaultValue, mutable.",
    "Server entity types may include shiftSchedule periods with time and positive integer capacity.",
    "State variables: id, name, valueType number, initialValue, resetOnWarmup.",
    "B-Events: id, name, scheduledTime, effect, schedules. C-Events: id, name, priority, condition predicate JSON, actions/schedules.",
    "Queues: id, name, discipline FIFO|LIFO|PRIORITY.",
    `Permitted macros only: ${MACROS.join(", ")}.`,
    `Permitted distributions only: ${DISTRIBUTIONS.join(", ")}.`,
    "Distribution objects must use documented DES Studio fields such as dist/distParams or type/parameter fields already used by the model.",
    "Predicates must be structured JSON. Never produce executable code, logic strings requiring eval, or invented operators.",
    "For refine requests, proposedModel must be the complete model after the refinement. The UI computes the diff locally.",
    "Ask at most two clarifying questions before proposing a model.",
    "If the requested model is too detailed to fit in one complete valid JSON response, return intent clarify and ask for the smallest missing details. Never return partial JSON.",
    "Keep generated model proposals compact: use short IDs, concise names, and only include fields required by DES Studio.",
    "Keep explanation to one short sentence when proposedModel is present.",
    'Response schema: {"intent":"build|refine|clarify","questions":["..."]|null,"proposedModel":object|null,"explanation":"plain English summary"}',
    "If intent is build or refine, proposedModel must contain all five top-level sections, even when some are empty arrays.",
  ].join("\n");
}

export function buildModelBuilderUserMessage(description, currentModel = {}, conversationHistory = []) {
  const hasCurrentModel = MODEL_SECTIONS.some(section => Array.isArray(currentModel?.[section]) && currentModel[section].length);
  return JSON.stringify({
    currentModel: hasCurrentModel ? currentModel : null,
    conversationHistory: trimHistory(conversationHistory),
    userRequest: String(description || ""),
    instruction: hasCurrentModel
      ? "Refine the current model unless the user explicitly requests a full rebuild."
      : "Build a DES Studio model proposal from the request.",
    requiredResponseKeys: ["intent", "questions", "proposedModel", "explanation"],
  }, null, 2);
}
