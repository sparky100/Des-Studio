// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('html-to-image', () => ({
  toPng: vi.fn(),
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

  test('returns data URL when element exists and toPng succeeds', async () => {
    const mockElement = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    const mockDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const htmlToImageMod = await import('html-to-image');
    htmlToImageMod.toPng.mockResolvedValue(mockDataUrl);

    const result = await exportCanvasToPng();
    expect(result).toBe(mockDataUrl);
  });

  test('returns null when toPng throws', async () => {
    const mockElement = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    const htmlToImageMod = await import('html-to-image');
    htmlToImageMod.toPng.mockRejectedValue(new Error('canvas error'));

    const result = await exportCanvasToPng();
    expect(result).toBeNull();
  });

  test('calls fitViewFn if provided before capturing', async () => {
    const mockElement = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);
    const htmlToImageMod = await import('html-to-image');
    htmlToImageMod.toPng.mockResolvedValue('data:image/png;base64,abc');

    const fitFn = vi.fn();
    await exportCanvasToPng(fitFn);
    expect(fitFn).toHaveBeenCalledOnce();
  });
});

describe('getModelImageDataUrl', () => {
  test('delegates to exportCanvasToPng', async () => {
    vi.spyOn(document, 'querySelector').mockReturnValue(null);
    const result = await getModelImageDataUrl();
    expect(result).toBeNull();
  });
});
