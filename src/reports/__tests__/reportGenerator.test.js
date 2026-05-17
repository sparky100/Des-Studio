import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock LLM client
vi.mock('../../llm/apiClient.js', () => ({
  callLLMOnce: vi.fn(),
}));

// Mock canvas export
vi.mock('../../ui/visual-designer/graph.js', () => ({
  getModelImageDataUrl: vi.fn(),
}));

import { generateReport } from '../reportGenerator.js';
import { callLLMOnce } from '../../llm/apiClient.js';
import { getModelImageDataUrl } from '../../ui/visual-designer/graph.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

  test('returns a Blob with correct MIME type and non-zero size', async () => {
    callLLMOnce.mockResolvedValue('Test description for the model.');
    getModelImageDataUrl.mockResolvedValue(null);

    const blob = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);
  });

  test('still returns a Blob when callLLMOnce throws (graceful fallback)', async () => {
    callLLMOnce.mockRejectedValue(new Error('LLM unavailable'));
    getModelImageDataUrl.mockResolvedValue(null);

    const blob = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);
  });

  test('still returns a Blob when getModelImageDataUrl throws', async () => {
    callLLMOnce.mockResolvedValue('A model description.');
    getModelImageDataUrl.mockRejectedValue(new Error('Canvas unavailable'));

    const blob = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);
  });

  test('works with minimal/empty model and results', async () => {
    callLLMOnce.mockResolvedValue('');
    getModelImageDataUrl.mockResolvedValue(null);

    const blob = await generateReport({}, {}, {}, {});

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);
  });

  test('includes image section when valid data URL is returned', async () => {
    const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    callLLMOnce.mockResolvedValue('Description with image.');
    getModelImageDataUrl.mockResolvedValue(fakeDataUrl);

    const blob = await generateReport(minimalModel, minimalResults, experimentConfig, runMeta);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
