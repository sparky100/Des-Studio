import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../llm/apiClient.js', () => ({
  callLLMOnce: vi.fn(),
}));

import { generateReport, buildModelDefinitionHtml } from '../reportGenerator.js';
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
    outcomes: {
      'route-exit:triage': { routeId: 'route-exit:triage', routeLabel: 'Exit', status: 'completed', endedBy: 'direct-routing', count: 12 },
    },
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

  test('returns a non-empty HTML string', async () => {
    callLLMOnce.mockResolvedValue('Test description for the model.');

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  test('includes expected section headings', async () => {
    callLLMOnce.mockResolvedValue('A model description.');

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(html).toContain('Test Clinic');
    expect(html).toContain('Executive Summary');
    expect(html).toContain('Scope &amp; Methodology');
    expect(html).toContain('Simulation Results');
    expect(html).toContain('Recommendations');
    expect(html).toContain('Appendix');
    expect(html).toContain('Experiment Configuration'); // default type is 'technical'
  });

  test('still returns HTML when callLLMOnce throws (graceful fallback)', async () => {
    callLLMOnce.mockRejectedValue(new Error('LLM unavailable'));

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(typeof html).toBe('string');
    expect(html).toContain('Executive Summary');
    expect(html).toContain('<!DOCTYPE html>');
  });

  test('works with empty model and results', async () => {
    callLLMOnce.mockResolvedValue('');

    const html = await generateReport({}, {}, {}, {});

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('<!DOCTYPE html>');
  });

  test('includes run metadata in the output', async () => {
    callLLMOnce.mockResolvedValue('');

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(html).toContain('Test Run 1');
  });

  test('includes KPI values from results', async () => {
    callLLMOnce.mockResolvedValue('');

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(html).toContain('195');  // served
    expect(html).toContain('3.2'); // avgWait (1 dp)
  });

  test('includes journey outcome breakdowns', async () => {
    callLLMOnce.mockResolvedValue('');

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(html).toContain('Journey outcomes');
    expect(html).toContain('Exit');
    expect(html).toContain('direct-routing');
  });

  test('includes entity types in appendix', async () => {
    callLLMOnce.mockResolvedValue('');

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(html).toContain('Patient');
    expect(html).toContain('Doctor');
  });

  test('includes model diagram when imageDataUrl provided', async () => {
    callLLMOnce.mockResolvedValue('');
    const fakeImg = 'data:image/png;base64,ABC123';

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta, fakeImg);

    expect(html).toContain('Model Diagram');
    expect(html).toContain(fakeImg);
  });

  test('omits model diagram section when no imageDataUrl', async () => {
    callLLMOnce.mockResolvedValue('');

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta, null);

    expect(html).not.toContain('Model Diagram');
  });

  test('includes SVG charts for journey breakdown when wait and service data present', async () => {
    callLLMOnce.mockResolvedValue('');

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(html).toContain('<svg');
    expect(html).toContain('Journey Time Breakdown');
  });

  test('includes resource utilisation chart when perResource data present', async () => {
    callLLMOnce.mockResolvedValue('');
    const resultsWithUtil = {
      ...minimalResults,
      summary: {
        ...minimalResults.summary,
        perResource: {
          Doctor: { total: 2, utilisation: 0.72 },
        },
      },
    };

    const html = await generateReport(minimalModel, resultsWithUtil, experimentConfig, runMeta);

    expect(html).toContain('Resource Utilisation');
    expect(html).toContain('Doctor');
    expect(html).toContain('72%');
  });

  test('includes queue wait chart when waitDist data present', async () => {
    callLLMOnce.mockResolvedValue('');
    const resultsWithWait = {
      ...minimalResults,
      waitDist: {
        'Waiting Room': { n: 50, mean: 3.2, p50: 2.8, p90: 6.1, p95: 7.4, p99: 9.0 },
      },
    };

    const html = await generateReport(minimalModel, resultsWithWait, experimentConfig, runMeta);

    expect(html).toContain('Queue Wait-Time Distribution');
    expect(html).toContain('Waiting Room');
  });

  test('title element contains model name', async () => {
    callLLMOnce.mockResolvedValue('');

    const html = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(html).toContain('<title>');
    expect(html).toContain('Test Clinic');
  });

  test('reports per-run average counts (not pooled totals) for batch runs', async () => {
    callLLMOnce.mockResolvedValue('');
    // Pooled totals across 4 replications would be served=780/reneged=20; the
    // report must show the per-run average (195/5) sourced from aggregateStats.
    const batchResults = {
      ...minimalResults,
      summary: { ...minimalResults.summary, served: 780, reneged: 20 },
      aggregateStats: {
        'summary.served':  { n: 4, mean: 195, lower: 190, upper: 200 },
        'summary.reneged': { n: 4, mean: 5,   lower: 3,   upper: 7 },
      },
    };
    const batchConfig = { ...experimentConfig, replications: 4 };

    const html = await generateReport(minimalModel, batchResults, batchConfig, runMeta, {
      aggregateStats: batchResults.aggregateStats,
    });

    expect(html).toContain('195');
    expect(html).not.toContain('780');
    expect(html).not.toContain('20</div>');
  });

  test('formats percentage figures as whole integers', async () => {
    callLLMOnce.mockResolvedValue('');
    const resultsWithRatio = {
      ...minimalResults,
      summary: { ...minimalResults.summary, servedRatio: 0.8523 },
    };

    const html = await generateReport(minimalModel, resultsWithRatio, experimentConfig, runMeta);

    expect(html).toContain('85%');
    expect(html).not.toMatch(/85\.\d%/);
  });
});

function cEventRowCells(html, eventName) {
  const rowMatch = html.match(new RegExp(`<tr><td>${eventName}</td>([\\s\\S]*?)</tr>`));
  if (!rowMatch) return null;
  return [...rowMatch[1].matchAll(/<td>(.*?)<\/td>/g)].map(m => m[1]);
}

describe('buildModelDefinitionHtml — C-Events Server column', () => {
  test('shows the single server type for an ASSIGN c-event', () => {
    const model = {
      ...minimalModel,
      cEvents: [
        { id: 'c1', name: 'Start Service', priority: 1, effect: ['ASSIGN(Waiting Room, Doctor)'], cSchedules: [] },
      ],
    };
    const html = buildModelDefinitionHtml(model);
    const cells = cEventRowCells(html, 'Start Service');
    expect(cells[0]).toBe('Doctor');
  });

  test('shows all resource types, comma-separated, for a COSEIZE c-event', () => {
    const model = {
      ...minimalModel,
      entityTypes: [
        ...minimalModel.entityTypes,
        { id: 'e3', name: 'Anesthetist', role: 'server', count: 2 },
      ],
      cEvents: [
        { id: 'c1', name: 'Perform Surgery', priority: 1, effect: ['COSEIZE(Waiting Room, Doctor, Anesthetist)'], cSchedules: [] },
      ],
    };
    const html = buildModelDefinitionHtml(model);
    const cells = cEventRowCells(html, 'Perform Surgery');
    expect(cells[0]).toBe('Doctor, Anesthetist');
  });

  test('shows a dash for a server-less DELAY c-event', () => {
    const model = {
      ...minimalModel,
      cEvents: [
        { id: 'c1', name: 'Wait Period', priority: 1, effect: ['DELAY(Waiting Room)'], cSchedules: [] },
      ],
    };
    const html = buildModelDefinitionHtml(model);
    const cells = cEventRowCells(html, 'Wait Period');
    expect(cells[0]).toBe('—');
  });
});
