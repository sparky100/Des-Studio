import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnovaTukeyTable } from '../../../src/ui/shared/AnovaTukeyTable.jsx';
import { ThemeProvider } from '../../../src/ui/shared/ThemeContext.jsx';
import { oneWayANOVA, tukeyHSD } from '../../../src/engine/statistics.js';

const GROUPS = [
  [10, 11, 9, 10, 11],
  [20, 21, 19, 20, 21],
  [10.5, 9.5, 10, 11, 9],
];
const LABELS = ['Base model', 'Double staffing', 'Extended hours'];

function renderTable(metric = 'summary.avgWait') {
  const anova = oneWayANOVA(GROUPS, { labels: LABELS });
  const tukey = tukeyHSD(GROUPS, { labels: LABELS });
  render(
    <ThemeProvider>
      <AnovaTukeyTable metric={metric} anova={anova} tukey={tukey} />
    </ThemeProvider>
  );
  return { anova, tukey };
}

describe('AnovaTukeyTable', () => {
  it('renders nothing when no ANOVA result is given', () => {
    const { container } = render(
      <ThemeProvider>
        <AnovaTukeyTable metric="summary.avgWait" anova={null} tukey={null} />
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a significance banner with the F-statistic and p-value', () => {
    const { anova } = renderTable();

    expect(screen.getByText(/significant difference detected/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`p = ${anova.pValue.toFixed(4)}`))).toBeInTheDocument();
  });

  it('lists every group with its n and mean in the group-stats table', () => {
    renderTable();

    for (const label of LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // 3 groups of 5 values each
    expect(screen.getAllByText('5')).toHaveLength(3);
  });

  it('renders a pairwise Tukey HSD comparison row per group pair', () => {
    renderTable();

    expect(screen.getByText(/pairwise comparisons \(tukey hsd\)/i)).toBeInTheDocument();
    expect(screen.getByText('Base model vs Double staffing')).toBeInTheDocument();
    expect(screen.getByText('Base model vs Extended hours')).toBeInTheDocument();
    expect(screen.getByText('Double staffing vs Extended hours')).toBeInTheDocument();
  });

  it('falls back to the raw metric key when no METRIC_LABELS entry exists', () => {
    renderTable('made.up.metric');
    // fmtMetric/METRIC_LABELS both fall through; the column header should
    // still render using the raw metric string rather than crashing.
    expect(screen.getByText(/mean made.up.metric/i)).toBeInTheDocument();
  });
});
