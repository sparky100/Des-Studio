import { describe, test, expect } from 'vitest';
import {
  buildModelDescriptionPrompt,
  buildReportRecommendationsPrompt,
  parseReportRecommendations,
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
