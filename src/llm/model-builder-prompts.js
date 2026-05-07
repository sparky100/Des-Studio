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
    "B-Events: id, name, scheduledTime, effect, schedules. Schedule rows must include eventId plus dist and distParams.",
    "C-Events: id, name, priority, condition predicate JSON, effect, cSchedules. cSchedules must include eventId plus dist and distParams.",
    "Queues: id, name, discipline FIFO|LIFO|PRIORITY, customerType (required — must be the name of the customer entityType whose entities arrive into this queue via ARRIVE(); must match an entityType with role customer).",
    "Every queue MUST include customerType matching the first argument of the ARRIVE() macro that targets it. Never omit customerType.",
    `Permitted macros only: ${MACROS.join(", ")}.`,
    `Permitted distributions only: ${DISTRIBUTIONS.join(", ")}.`,
    "Use DES Studio distribution shape exactly: {\"dist\":\"Exponential\",\"distParams\":{\"mean\":\"5\"}} for average time-between-arrivals; {\"dist\":\"Fixed\",\"distParams\":{\"value\":\"7.5\"}} for deterministic service time.",
    "If the user gives an arrival rate lambda per time unit, convert it to Exponential mean = 1 / lambda in distParams.mean.",
    "If the user answers timing questions, copy those numbers into schedule distParams or server serviceTime attrDefs; never leave timing defaults such as mean 1 or value 0.",
    "For a simple queue, create an arrival B-event at scheduledTime 0 with ARRIVE(Customer, QueueName) and a self-schedule for the next arrival (follow-on) at scheduledTime 9999.",
    "B-events representing arrivals SHOULD include an ARRIVE(Type, Queue) effect.",
    "B-events representing service completion SHOULD include COMPLETE(), RELEASE(ServerType), and potentially a follow-on B-event (e.g. for the next stage).",
    "For every service-start C-event, include effect ASSIGN(queueOrCustomer, ServerType) and a condition requiring both queue size > 0 and idle server count > 0.",
    "If a C-event schedules a follow-on B-event (e.g. Service Complete), ALWAYS default useEntityCtx to true to preserve the matched entity context.",
    "For service time, either put it directly in the C-event cSchedule distribution for the Service Complete B-event, or create a server attrDef named serviceTime with Fixed value and use ServerAttr attr serviceTime.",
    "The 'scheduledTime' for follow-on B-events (those scheduled by others) should be '9999'. Only events intended to fire at t=0 should have '0'.",
    "For multi-stage service, use the first stage completion B-event to RELEASE(ServerType, Next Queue) and the final completion B-event to COMPLETE().",
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
