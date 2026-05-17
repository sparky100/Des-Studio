// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock html2canvas before importing graph.js because it uses dynamic import
vi.mock('html2canvas', () => ({
  default: vi.fn(),
}));

import { exportCanvasToPng, getModelImageDataUrl } from '../graph.js';

describe('exportCanvasToPng', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns null when document.querySelector returns null', async () => {
    vi.spyOn(document, 'querySelector').mockReturnValue(null);
    const result = await exportCanvasToPng();
    expect(result).toBeNull();
  });

  test('returns data URL when element exists and html2canvas succeeds', async () => {
    const mockElement = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    const mockDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const mockCanvas = { toDataURL: vi.fn().mockReturnValue(mockDataUrl) };

    // Re-import html2canvas mock and set implementation
    const html2canvasMod = await import('html2canvas');
    html2canvasMod.default.mockResolvedValue(mockCanvas);

    const result = await exportCanvasToPng();
    expect(result).toBe(mockDataUrl);
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  test('returns null when html2canvas throws', async () => {
    const mockElement = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    const html2canvasMod = await import('html2canvas');
    html2canvasMod.default.mockRejectedValue(new Error('canvas error'));

    const result = await exportCanvasToPng();
    expect(result).toBeNull();
  });
});

describe('getModelImageDataUrl', () => {
  test('delegates to exportCanvasToPng', async () => {
    vi.spyOn(document, 'querySelector').mockReturnValue(null);
    const result = await getModelImageDataUrl();
    expect(result).toBeNull();
  });
});
