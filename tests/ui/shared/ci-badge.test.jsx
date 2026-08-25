import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CiBadge } from '../../../src/ui/shared/CiBadge.jsx';

// Minimal theme stand-in — CiBadge takes C/FONT as props (same pattern as its
// former inline definitions in ResultsWorkspace.jsx / ModelHistoryTab.jsx).
const C = { green: '#16a34a', amber: '#d97706', red: '#dc2626', muted: '#4a6280' };
const FONT = 'monospace';

describe('CiBadge (93.3 — CI reliability detail persistent, not hover-only)', () => {
  it('renders the relative half-width figure and a visible ±halfWidth · n=reps line (not just in a title)', () => {
    const ci = { n: 12, mean: 50, halfWidth: 2.5, lower: 47.5, upper: 52.5 };
    render(<CiBadge ci={ci} C={C} FONT={FONT} />);

    expect(screen.getByText('±5%')).toBeInTheDocument();
    // The half-width and replication count must be in ordinary text content,
    // reachable without hover/focus — not only inside a title attribute.
    expect(screen.getByText('±2.5 · n=12 reps')).toBeInTheDocument();
  });

  it('puts the fuller 95% interval bounds in the supplementary title tooltip', () => {
    const ci = { n: 12, mean: 50, halfWidth: 2.5, lower: 47.5, upper: 52.5 };
    const { container } = render(<CiBadge ci={ci} C={C} FONT={FONT} />);
    const wrapper = container.querySelector('[title]');
    expect(wrapper).not.toBeNull();
    expect(wrapper.getAttribute('title')).toContain('95% CI: [47.50, 52.50]');
    expect(wrapper.getAttribute('title')).toContain('±2.5 half-width, n=12 reps');
  });

  it('falls back to the plain half-width/n title when lower/upper are not present', () => {
    const ci = { n: 8, mean: 20, halfWidth: 1 };
    const { container } = render(<CiBadge ci={ci} C={C} FONT={FONT} />);
    const wrapper = container.querySelector('[title]');
    expect(wrapper.getAttribute('title')).toBe('±1.0 half-width, n=8 reps');
  });

  describe('colour banding at the documented thresholds (relHw = halfWidth / |mean| * 100)', () => {
    it('bands green when relative half-width is below 10%', () => {
      // halfWidth 4 / mean 50 = 8% < 10%
      const { container } = render(<CiBadge ci={{ n: 5, mean: 50, halfWidth: 4 }} C={C} FONT={FONT} />);
      const pill = screen.getByText('±8%');
      expect(pill).toHaveStyle({ color: C.green });
      expect(container).toBeTruthy();
    });

    it('bands amber when relative half-width is at least 10% and below 25%', () => {
      // halfWidth 10 / mean 50 = 20%, within [10, 25)
      render(<CiBadge ci={{ n: 5, mean: 50, halfWidth: 10 }} C={C} FONT={FONT} />);
      const pill = screen.getByText('±20%');
      expect(pill).toHaveStyle({ color: C.amber });
    });

    it('bands red when relative half-width is 25% or above', () => {
      // halfWidth 15 / mean 50 = 30% >= 25%
      render(<CiBadge ci={{ n: 5, mean: 50, halfWidth: 15 }} C={C} FONT={FONT} />);
      const pill = screen.getByText('±30%');
      expect(pill).toHaveStyle({ color: C.red });
    });

    it('is green exactly at the 10% boundary (band uses strict <)', () => {
      // halfWidth 5 / mean 50 = 10% exactly → not < 10, falls into amber band
      render(<CiBadge ci={{ n: 5, mean: 50, halfWidth: 5 }} C={C} FONT={FONT} />);
      const pill = screen.getByText('±10%');
      expect(pill).toHaveStyle({ color: C.amber });
    });
  });

  describe('null-guard for missing/zero mean', () => {
    it('renders nothing when ci is undefined', () => {
      const { container } = render(<CiBadge ci={undefined} C={C} FONT={FONT} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when halfWidth is missing', () => {
      const { container } = render(<CiBadge ci={{ n: 5, mean: 50 }} C={C} FONT={FONT} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when mean is missing', () => {
      const { container } = render(<CiBadge ci={{ n: 5, halfWidth: 5 }} C={C} FONT={FONT} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when mean is zero', () => {
      const { container } = render(<CiBadge ci={{ n: 5, mean: 0, halfWidth: 5 }} C={C} FONT={FONT} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when mean is not finite', () => {
      const { container } = render(<CiBadge ci={{ n: 5, mean: NaN, halfWidth: 5 }} C={C} FONT={FONT} />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});
