import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../llm/apiClient.js', () => ({
  callLLMOnce: vi.fn(),
}));

import { generateReport } from '../reportGenerator.js';
import { callLLMOnce } from '../../llm/apiClient.js';

const minimalModel = {
  name: 'Test Clinic',
  description: 'A simple test model.',
  entityTypes: [
    { id: 'e1', name: 'Patient', role: 'customer' },
    { id: 'e2', name: 'Doctor', role: 'server', count: 2 },
  ],
  queues: [{ id: 'q1', name: 'Waiting Room', discipline: 'FIFO' }],
  bEvents: [],
  cEvents: [],
  goals: [],
};

const minimalResults = {
  summary: {
    total: 200,
    served: 195,
    reneged: 5,
    avgWait: 3.2,
    avgSvc: 5.0,
    avgSojourn: 8.2,
    avgWIP: 2.1,
  },
  aggregateStats: {},
  waitDist: {},
};

const experimentConfig = {
  warmupPeriod: 50,
  maxSimTime: 500,
  replications: 1,
  seed: 12345,
};

const runMeta = {
  runId: 'run-001',
  runLabel: 'Test Run 1',
  engineVersion: '1.0',
  seed: 12345,
  prnAlgorithm: 'mulberry32',
  runTimestamp: '2025-05-17T10:00:00.000Z',
};

describe('generateReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns a non-empty markdown string', async () => {
    callLLMOnce.mockResolvedValue('Test description for the model.');

    const md = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  test('includes expected section headings', async () => {
    callLLMOnce.mockResolvedValue('A model description.');

    const md = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(md).toContain('# Test Clinic — Analysis Report');
    expect(md).toContain('## Executive Summary');
    expect(md).toContain('## Model Description');
    expect(md).toContain('## Experiment Configuration');
    expect(md).toContain('## Simulation Results');
    expect(md).toContain('## Recommendations');
    expect(md).toContain('## Appendix');
  });

  test('still returns markdown when callLLMOnce throws (graceful fallback)', async () => {
    callLLMOnce.mockRejectedValue(new Error('LLM unavailable'));

    const md = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(typeof md).toBe('string');
    expect(md).toContain('## Executive Summary');
  });

  test('works with empty model and results', async () => {
    callLLMOnce.mockResolvedValue('');

    const md = await generateReport({}, {}, {}, {});

    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  test('includes run metadata in the output', async () => {
    callLLMOnce.mockResolvedValue('');

    const md = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(md).toContain('Test Run 1');
    expect(md).toContain('run-001');
  });

  test('includes KPI values from results', async () => {
    callLLMOnce.mockResolvedValue('');

    const md = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(md).toContain('195');  // served
    expect(md).toContain('3.20'); // avgWait
  });

  test('includes entity types in appendix', async () => {
    callLLMOnce.mockResolvedValue('');

    const md = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(md).toContain('Patient');
    expect(md).toContain('Doctor');
  });
});
