import { describe, expect, it } from 'vitest';
import { formatReadout } from '../../../src/ui/shared/utils.js';

describe('formatReadout — precision follows magnitude', () => {
  it('keeps two decimals below 1, one from 1 to 10, none from 10 up', () => {
    expect(formatReadout(0.37249)).toBe('0.37');
    expect(formatReadout(0.5)).toBe('0.5');
    expect(formatReadout(4.2468)).toBe('4.2');
    expect(formatReadout(9.96)).toBe('10');
    expect(formatReadout(10.6)).toBe('11');
    expect(formatReadout(20387362.034938715)).toBe('20,387,362');
    expect(formatReadout(-1922124.17)).toBe('-1,922,124');
  });

  it('shows whole numbers unchanged and non-numbers safely', () => {
    expect(formatReadout(47)).toBe('47');
    expect(formatReadout(3)).toBe('3');
    expect(formatReadout(null)).toBe('—');
    expect(formatReadout('open')).toBe('open');
  });
});
