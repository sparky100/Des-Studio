// Golden corpus of raw model-builder LLM responses — every *shape* of reply the
// model builder has been observed (or is expected) to produce, exercised through
// the REAL parser via the public entry points (see
// tests/llm/model-builder-response-corpus.test.js and the journey tests in
// tests/ui/editors/ai-model-builder-journeys.test.jsx).
//
// CONVENTION: every production incident involving an unexpected LLM response
// adds an entry here, verbatim (the UI's "Show raw AI response" details makes
// harvesting them easy). The corpus exists because the 2026-08-29 "stuck
// assistant" bug (PR #501) was a response shape — plain markdown prose instead
// of the required JSON envelope — that no test had ever fed the parser.
//
// `expected` is one of:
//   { kind: "complete", intent, questionsInclude?, hasProposedModel? }
//     → callModelBuilder resolves via onComplete with this envelope intent
//   { kind: "error", match: /regex/ }
//     → callModelBuilder rejects via onError with a message matching `match`

// The smallest proposedModel that passes validateModel() after the panel's
// normalisation (mirrors the fixture proven valid in
// tests/ui/editors/ai-generated-model-panel.test.jsx — arrival source,
// COMPLETE sink, one queue, one server, one seize C-event).
export const MINIMAL_VALID_PROPOSED_MODEL = {
  entityTypes: [
    { id: "cust", name: "Customer", role: "customer", attrDefs: [] },
    { id: "clerk", name: "Clerk", role: "server", count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  queues: [{ id: "main", name: "Main Queue", discipline: "FIFO" }],
  bEvents: [
    {
      id: "arrive",
      name: "Customer Arrival",
      scheduledTime: "0",
      effect: "ARRIVE(Customer, Main Queue)",
      schedules: [{ eventId: "arrive", dist: "Exponential", distParams: { mean: "5" } }],
    },
    {
      id: "complete",
      name: "Service Complete",
      scheduledTime: "9999",
      effect: ["COMPLETE()"],
      schedules: [],
    },
  ],
  cEvents: [
    {
      id: "start",
      name: "Start Service",
      priority: 1,
      condition: { variable: "Queue.Main Queue.length", operator: ">", value: 0 },
      actions: [{ macro: "ASSIGN", args: ["Main Queue", "Clerk"] }],
      schedules: [{ eventId: "complete", type: "fixed", value: 7.5, useEntityCtx: true }],
    },
  ],
};

// A proposal that FAILS validateModel even after the panel's normalisation
// (no arrival source and no COMPLETE/RENEGE sink → V8 and friends) — used to
// deliberately drive the panel's validation-error retry loop in journey tests.
// This is the exact shape the panel's own test file documents as tripping that
// loop (ai-generated-model-panel.test.jsx:672-678); richer "almost valid"
// shapes don't work here because the panel's normalisation infers missing
// arrival/service effects and can repair them into validity.
export const SINKLESS_INVALID_PROPOSED_MODEL = {
  entityTypes: [
    { id: "cust", name: "Customer", role: "customer", attrDefs: [] },
    { id: "clerk", name: "Clerk", role: "server", count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  queues: [],
  bEvents: [],
  cEvents: [],
};

// ── Incident responses (verbatim / reconstructed from the 2026-08-29 report) ──

// The 248-char raw response from the first "stuck" screenshot: a well-formed
// clarifying question sent as markdown prose — no JSON anywhere.
export const INCIDENT_PROSE_CLARIFY_248 =
  "Got it. Let me clarify two more things:\n\n1. **For the repair/service customers** — when a customer brings in a bike for repair, do they wait in the shop while it's being worked on, or do they drop it off and leave (coming back later to pick it up)?";

// The 407-char raw response from the second screenshot (opening reconstructed
// from the visible portion): again pure prose, markdown numbering and bold.
export const INCIDENT_PROSE_CLARIFY_407 =
  "I need to clarify the structure of your system. You mentioned three customer types:\n\n1. **Hire customers** — arriving to pick up a rental bike\n2. **Return customers** — bringing a rental bike back\n3. **Repair customers** — bringing their own bike in for repair\n\nDo all three share the same counter and staff, or does the workshop handle repairs separately from the hire desk? And roughly how many staff work at once?";

export const MODEL_BUILDER_RESPONSE_CORPUS = [
  {
    name: "incident 2026-08-29: prose clarify with markdown bold (248 chars, no braces)",
    raw: INCIDENT_PROSE_CLARIFY_248,
    expected: { kind: "complete", intent: "clarify", questionsInclude: "repair" },
  },
  {
    name: "incident 2026-08-29: prose clarify with numbered list (407 chars, no braces)",
    raw: INCIDENT_PROSE_CLARIFY_407,
    expected: { kind: "complete", intent: "clarify", questionsInclude: "three customer types" },
  },
  {
    name: "compliant clarify envelope (bare JSON, per the system prompt)",
    raw: JSON.stringify({ intent: "clarify", questions: "How many clerks serve the counter?", summary: null, proposedModel: null, explanation: "One detail is needed.", suggestions: null }),
    expected: { kind: "complete", intent: "clarify", questionsInclude: "How many clerks" },
  },
  {
    name: "clarify envelope wrapped in a ```json fence",
    raw: '```json\n{"intent":"clarify","questions":"What is the arrival rate?","proposedModel":null,"explanation":"Need the rate."}\n```',
    expected: { kind: "complete", intent: "clarify", questionsInclude: "arrival rate" },
  },
  {
    name: "prose preamble before the JSON envelope",
    raw: 'Here is what I need to know: {"intent":"clarify","questions":"How long does service take?","proposedModel":null,"explanation":"Need the duration."}',
    expected: { kind: "complete", intent: "clarify", questionsInclude: "service take" },
  },
  {
    name: "envelope inside <json> tags",
    raw: '<json>{"intent":"clarify","questions":"Is there a single queue?","proposedModel":null,"explanation":"Need the layout."}</json>',
    expected: { kind: "complete", intent: "clarify", questionsInclude: "single queue" },
  },
  {
    name: "truncated build JSON (cut off mid-string)",
    raw: '{"intent":"build","explanation":"A post office model with',
    expected: { kind: "error", match: /incomplete or invalid model JSON/i },
  },
  {
    name: "empty response",
    raw: "",
    expected: { kind: "error", match: /empty response/i },
  },
  {
    // KNOWN BOUNDARY of the no-braces heuristic (apiClient.js
    // parseModelBuilderJson): prose that happens to contain a stray brace is
    // still routed down the JSON-error path today. This fixture documents that
    // boundary deliberately — if the heuristic is ever improved to handle it,
    // update `expected` here rather than deleting the entry.
    name: "prose clarify containing a stray brace (documents heuristic boundary — currently an error)",
    raw: "Should the queue capacity be {1, 2 or 3}? Also, how do customers arrive?",
    expected: { kind: "error", match: /incomplete or invalid model JSON/i },
  },
  {
    name: "valid build envelope with a minimal passing model",
    raw: JSON.stringify({ intent: "build", questions: null, summary: null, explanation: "Built a small post office.", suggestions: ["Add a second clerk"], proposedModel: MINIMAL_VALID_PROPOSED_MODEL }),
    expected: { kind: "complete", intent: "build", hasProposedModel: true },
  },
];
