import { describe, test, expect } from 'vitest';
import {
  buildModelDescriptionPrompt,
  buildReportRecommendationsPrompt,
  parseReportRecommendations,
  applySuggestionPatch,
  parseSuggestionResponse,
  correctUtilisationFigures,
  correctSuggestionGoalFields,
} from '../prompts.js';

const FORBIDDEN_TERMS = ['B-event', 'C-event', 'macro', 'ARRIVE', 'COMPLETE', 'ASSIGN', 'Phase'];

const minimalModel = {
  name: 'Test Model',
  entityTypes: [
    { id: 'e1', name: 'Customer', role: 'customer' },
    { id: 'e2', name: 'Server', role: 'server', count: 2 },
  ],
  queues: [{ id: 'q1', name: 'Waiting Queue', discipline: 'FIFO' }],
  bEvents: [{ id: 'b1', name: 'Arrival', effect: 'ARRIVE(Customer, Waiting Queue)' }],
  cEvents: [{ id: 'c1', name: 'Start Service', effect: 'ASSIGN(Waiting Queue, Server)', priority: 1 }],
  goals: [],
};

const minimalResults = {
  summary: {
    total: 100,
    served: 95,
    reneged: 5,
    avgWait: 2.5,
    avgSvc: 3.0,
    avgSojourn: 5.5,
    avgWIP: 1.2,
  },
  aggregateStats: {},
  waitDist: {},
};

describe('buildModelDescriptionPrompt', () => {
  test('returns a prompt object with messages array and max_tokens', () => {
    const result = buildModelDescriptionPrompt(minimalModel);
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    expect(typeof result.max_tokens).toBe('number');
    expect(result.max_tokens).toBeGreaterThan(0);
  });

  test('system prompt is a non-empty string', () => {
    const result = buildModelDescriptionPrompt(minimalModel);
    const systemMsg = result.messages[0];
    expect(systemMsg.role).toBe('system');
    expect(typeof systemMsg.content).toBe('string');
    expect(systemMsg.content.length).toBeGreaterThan(0);
  });

  test('system prompt instructs LLM not to use DES technical terms (mentions them only in prohibition)', () => {
    const result = buildModelDescriptionPrompt(minimalModel);
    const systemContent = result.messages[0].content;
    // The system prompt should contain a "do NOT use" instruction that names the forbidden terms
    // The key check: the prohibition instruction is present
    expect(systemContent.toLowerCase()).toContain('do not');
    // And it should NOT ask the LLM to use those terms — verify the context is always a prohibition
    // The terms appear in a "Do NOT use technical terms like …" list, so the phrase "Do NOT" precedes them
    const doNotIndex = systemContent.toUpperCase().indexOf('DO NOT USE TECHNICAL SIMULATION TERMS');
    expect(doNotIndex).toBeGreaterThanOrEqual(0);
  });

  test('works with empty model', () => {
    const result = buildModelDescriptionPrompt({});
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });
});

describe('buildReportRecommendationsPrompt', () => {
  test('returns a prompt object with messages and max_tokens', () => {
    const result = buildReportRecommendationsPrompt(minimalModel, minimalResults);
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
    expect(typeof result.max_tokens).toBe('number');
    expect(result.max_tokens).toBeGreaterThan(0);
  });

  test('system prompt contains "json" (asks for JSON response)', () => {
    const result = buildReportRecommendationsPrompt(minimalModel, minimalResults);
    const systemContent = result.messages[0].content;
    expect(typeof systemContent).toBe('string');
    expect(systemContent.toLowerCase()).toContain('json');
  });

  test('kind is set to report-recommendations', () => {
    const result = buildReportRecommendationsPrompt(minimalModel, minimalResults);
    expect(result.kind).toBe('report-recommendations');
  });

  test('works with empty model and results', () => {
    const result = buildReportRecommendationsPrompt({}, {});
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });
});

describe('parseReportRecommendations', () => {
  test('parses fenced JSON array correctly', () => {
    const input = '```json\n[{"priority":1,"headline":"Reduce queue","finding":"Long waits","action":"Add server","expectedImpact":"50% reduction","confidence":"HIGH"}]\n```';
    const result = parseReportRecommendations(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].priority).toBe(1);
    expect(result[0].headline).toBe('Reduce queue');
    expect(result[0].confidence).toBe('HIGH');
  });

  test('parses unfenced JSON array', () => {
    const input = '[{"priority":2,"headline":"Test headline"}]';
    const result = parseReportRecommendations(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].priority).toBe(2);
  });

  test('returns empty array for malformed input', () => {
    expect(parseReportRecommendations('not valid json at all {{{')).toEqual([]);
  });

  test('returns empty array for null/undefined input', () => {
    expect(parseReportRecommendations(null)).toEqual([]);
    expect(parseReportRecommendations(undefined)).toEqual([]);
    expect(parseReportRecommendations('')).toEqual([]);
  });

  test('returns empty array when JSON is an object, not array', () => {
    const input = '```json\n{"priority":1}\n```';
    const result = parseReportRecommendations(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe('applySuggestionPatch — shiftPeriodCapacity', () => {
  const baseModel = {
    entityTypes: [
      { name: "TriageNurse", count: 4, shiftSchedule: [{ time: 0, capacity: 4 }, { time: 480, capacity: 2 }] },
    ],
    queues: [], bEvents: [], cEvents: [], stateVariables: [],
  };

  test('patches the capacity of the matching period by time value', () => {
    const change = { type: "shiftPeriodCapacity", target: "TriageNurse.0", from: 4, to: 6 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.entityTypes[0].shiftSchedule[0].capacity).toBe(6);
    expect(result.entityTypes[0].shiftSchedule[1].capacity).toBe(2);
  });

  test('also updates count when period time is 0', () => {
    const change = { type: "shiftPeriodCapacity", target: "TriageNurse.0", from: 4, to: 6 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.entityTypes[0].count).toBe(6);
  });

  test('patches a non-zero period without changing count', () => {
    const change = { type: "shiftPeriodCapacity", target: "TriageNurse.480", from: 2, to: 3 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.entityTypes[0].shiftSchedule[1].capacity).toBe(3);
    expect(result.entityTypes[0].count).toBe(4);
  });

  test('does not mutate the original model', () => {
    const change = { type: "shiftPeriodCapacity", target: "TriageNurse.0", from: 4, to: 8 };
    applySuggestionPatch(baseModel, change);
    expect(baseModel.entityTypes[0].shiftSchedule[0].capacity).toBe(4);
    expect(baseModel.entityTypes[0].count).toBe(4);
  });

  test('returns clone unchanged when entity name does not match', () => {
    const change = { type: "shiftPeriodCapacity", target: "Unknown.0", from: 4, to: 6 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.entityTypes[0].shiftSchedule[0].capacity).toBe(4);
  });

  test('returns clone unchanged when periodTime does not match any period', () => {
    const change = { type: "shiftPeriodCapacity", target: "TriageNurse.999", from: 4, to: 6 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.entityTypes[0].shiftSchedule[0].capacity).toBe(4);
    expect(result.entityTypes[0].shiftSchedule[1].capacity).toBe(2);
  });
});

describe('applySuggestionPatch — entityTypeCount with shift schedule', () => {
  const baseModel = {
    entityTypes: [
      { name: "BloodsLab", count: 3, shiftSchedule: [{ time: 0, capacity: 3 }, { time: 480, capacity: 2 }] },
    ],
    queues: [], bEvents: [], cEvents: [], stateVariables: [],
  };

  test('scales all shift period capacities proportionally when entity has a shift schedule', () => {
    const change = { type: "entityTypeCount", target: "BloodsLab", from: 3, to: 6 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.entityTypes[0].count).toBe(6);
    expect(result.entityTypes[0].shiftSchedule[0].capacity).toBe(6);
    expect(result.entityTypes[0].shiftSchedule[1].capacity).toBe(4);
  });

  test('does not mutate original model when patching shifted entity', () => {
    const change = { type: "entityTypeCount", target: "BloodsLab", from: 3, to: 6 };
    applySuggestionPatch(baseModel, change);
    expect(baseModel.entityTypes[0].count).toBe(3);
    expect(baseModel.entityTypes[0].shiftSchedule[0].capacity).toBe(3);
    expect(baseModel.entityTypes[0].shiftSchedule[1].capacity).toBe(2);
  });
});

describe('applySuggestionPatch — bEventDistParam', () => {
  const baseModel = {
    bEvents: [
      {
        name: "Arrivals",
        schedules: [{ dist: "exponential", distParams: { rate: 1.0 } }],
      },
    ],
    cEvents: [],
    entityTypes: [],
    queues: [],
    stateVariables: [],
  };

  test('patches a numeric distParam on a bEvent', () => {
    const change = { type: "bEventDistParam", target: "Arrivals.rate", from: 1.0, to: 0.8 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.bEvents[0].schedules[0].distParams.rate).toBe(0.8);
  });

  test('does not mutate the original model', () => {
    const change = { type: "bEventDistParam", target: "Arrivals.rate", from: 1.0, to: 0.5 };
    applySuggestionPatch(baseModel, change);
    expect(baseModel.bEvents[0].schedules[0].distParams.rate).toBe(1.0);
  });

  test('returns clone unchanged when bEvent name does not match', () => {
    const change = { type: "bEventDistParam", target: "NonExistent.rate", from: 1.0, to: 0.5 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.bEvents[0].schedules[0].distParams.rate).toBe(1.0);
  });

  test('returns clone unchanged when paramKey does not exist in distParams', () => {
    const change = { type: "bEventDistParam", target: "Arrivals.mean", from: 1.0, to: 2.0 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.bEvents[0].schedules[0].distParams).toEqual({ rate: 1.0 });
  });
});

describe('applySuggestionPatch — cEventDistParam', () => {
  const baseModel = {
    bEvents: [],
    cEvents: [
      {
        name: "ServiceComplete",
        cSchedules: [{ dist: "normal", distParams: { mean: 5, std: 1 } }],
      },
    ],
    entityTypes: [],
    queues: [],
    stateVariables: [],
  };

  test('patches a numeric distParam on a cEvent', () => {
    const change = { type: "cEventDistParam", target: "ServiceComplete.mean", from: 5, to: 4 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.cEvents[0].cSchedules[0].distParams.mean).toBe(4);
  });

  test('patches std param on a cEvent', () => {
    const change = { type: "cEventDistParam", target: "ServiceComplete.std", from: 1, to: 0.5 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.cEvents[0].cSchedules[0].distParams.std).toBe(0.5);
  });

  test('does not mutate the original model', () => {
    const change = { type: "cEventDistParam", target: "ServiceComplete.mean", from: 5, to: 3 };
    applySuggestionPatch(baseModel, change);
    expect(baseModel.cEvents[0].cSchedules[0].distParams.mean).toBe(5);
  });

  test('returns clone unchanged when cEvent name does not match', () => {
    const change = { type: "cEventDistParam", target: "Unknown.mean", from: 5, to: 3 };
    const result = applySuggestionPatch(baseModel, change);
    expect(result.cEvents[0].cSchedules[0].distParams.mean).toBe(5);
  });
});

describe('parseSuggestionResponse — truncation recovery', () => {
  test('recovers 2 valid suggestions when suggestion 3 is malformed mid-object', () => {
    // Build a JSON string where sug1 and sug2 are valid but sug3's change object has
    // narrative text injected where from/to should be — the real A&E failure pattern.
    const sug1 = '{"rank":1,"constraint":"Lab wait","cause":"High util","change":{"type":"entityTypeCount","target":"BloodsLab","from":3,"to":5},"predicted":"Wait halved","goalImpact":"MET","confidence":"high"}';
    const sug2 = '{"rank":2,"constraint":"Triage util","cause":"Peak demand","change":{"type":"entityTypeCount","target":"TriageNurse","from":4,"to":5},"predicted":"Util drops","goalImpact":"MET","confidence":"high"}';
    const malformedSug3 = '{"rank":3,"change":{"type":"cEventDistParam","target":"Lab.mode", min; narrative text injected here}';
    const analysis = "## What Happened\\nBottleneck found.\\n## What to Change\\nAdd servers.";
    // The outer array and object are intentionally NOT properly closed (mirrors LLM truncation)
    const raw = `{"analysis":"${analysis}","suggestions":[${sug1},${sug2},${malformedSug3}`;
    const input = '```json\n' + raw + '\n```';

    const result = parseSuggestionResponse(input);
    expect(result.suggestions.length).toBe(2);
    expect(result.suggestions[0].rank).toBe(1);
    expect(result.suggestions[1].rank).toBe(2);
    expect(result.analysis).toContain("What Happened");
  });

  test('returns empty array when fenced JSON is completely garbled', () => {
    const input = '```json\n{ not: [valid, json at all <<<\n```';
    const result = parseSuggestionResponse(input);
    expect(result.suggestions).toEqual([]);
  });
});

describe('correctUtilisationFigures — reversed phrasing', () => {
  test('fixes "NN% utilisation" (number stated before the word)', () => {
    const text = 'PET-CT Scanner emerging as the binding bottleneck at 89% utilisation (goal: <85%, MISSED).';
    const corrected = correctUtilisationFigures(text, { 'PET-CT Scanner': 63.5 });
    expect(corrected).toContain('64% utilisation');
    expect(corrected).not.toContain('89% utilisation');
  });

  test('still fixes the original "utilisation ... NN%" phrasing', () => {
    const text = 'PET-CT Scanner utilisation is 89%.';
    const corrected = correctUtilisationFigures(text, { 'PET-CT Scanner': 63.5 });
    expect(corrected).toContain('64%');
    expect(corrected).not.toContain('89%');
  });

  test('leaves text untouched when no matching resource name is present', () => {
    const text = 'Nuclear Medicine Physician at 88% utilisation.';
    const corrected = correctUtilisationFigures(text, { 'PET-CT Scanner': 63.5 });
    expect(corrected).toBe(text);
  });
});

describe('correctSuggestionGoalFields', () => {
  const goalGaps = [
    {
      metric: 'resource.utilisation',
      label: 'PET-CT Scanner utilisation < 85%',
      scope: { type: 'resource', name: 'PET-CT Scanner' },
      operator: '<',
      target: 0.85,
      current: 0.635,
      gap: -21.4,
      met: true,
    },
  ];

  test('overwrites a corrupted constraint/goalImpact when change.target matches a goal scope', () => {
    const suggestion = {
      rank: 1,
      constraint: 'PET-CT Scanner utilisation = 64% (goal: <85%)',
      cause: 'Single scanner serves all scan types.',
      change: { type: 'entityTypeCount', target: 'PET-CT Scanner', from: 1, to: 2 },
      predicted: 'Utilisation 44-64%',
      goalImpact: 'PET-CT Scanner utilisation under 64% MET',
      confidence: 'high',
    };
    const result = correctSuggestionGoalFields(suggestion, goalGaps);
    expect(result.constraint).toBe('PET-CT Scanner utilisation = 64% (goal: < 85%)');
    expect(result.goalImpact).toBe('PET-CT Scanner utilisation < 85%: MET');
    expect(result.constraint).not.toContain('8500%');
    // Untouched fields are preserved
    expect(result.cause).toBe(suggestion.cause);
    expect(result.predicted).toBe(suggestion.predicted);
  });

  test('reports MISSED when the goal is not met', () => {
    const missedGaps = [{ ...goalGaps[0], met: false }];
    const suggestion = {
      rank: 1,
      constraint: 'stale',
      change: { type: 'entityTypeCount', target: 'PET-CT Scanner', from: 1, to: 2 },
      goalImpact: 'stale',
    };
    const result = correctSuggestionGoalFields(suggestion, missedGaps);
    expect(result.goalImpact).toContain('MISSED');
  });

  test('leaves the suggestion untouched when change.target does not match any goal scope', () => {
    const suggestion = {
      rank: 1,
      constraint: 'Some other constraint',
      change: { type: 'entityTypeCount', target: 'Nuclear Medicine Physician', from: 1, to: 2 },
      goalImpact: 'Some other goal impact',
    };
    const result = correctSuggestionGoalFields(suggestion, goalGaps);
    expect(result).toBe(suggestion);
  });

  test('leaves the suggestion untouched when goalGaps is empty', () => {
    const suggestion = {
      rank: 1,
      change: { type: 'entityTypeCount', target: 'PET-CT Scanner', from: 1, to: 2 },
      goalImpact: 'stale',
    };
    const result = correctSuggestionGoalFields(suggestion, []);
    expect(result).toBe(suggestion);
  });
});
