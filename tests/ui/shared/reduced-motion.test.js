import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion } from '../../../src/ui/shared/hooks.js';

describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when the OS/browser signals a reduced-motion preference', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when no reduced-motion preference is set', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    expect(prefersReducedMotion()).toBe(false);
  });

  it('falls back to a falsy value when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(prefersReducedMotion()).toBeFalsy();
  });

  it('falls back to false when matchMedia throws', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => {
      throw new Error('not supported');
    }));

    expect(prefersReducedMotion()).toBe(false);
  });
});
