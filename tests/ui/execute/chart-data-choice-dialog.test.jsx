import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChartDataChoiceDialog } from '../../../src/ui/execute/ChartDataChoiceDialog.jsx';
import { ThemeProvider } from '../../../src/ui/shared/ThemeContext.jsx';

function renderDialog(props = {}) {
  const onCancel = vi.fn();
  const onProceedWithoutCharts = vi.fn();
  const onProceedWithCharts = vi.fn();
  render(
    <ThemeProvider>
      <ChartDataChoiceDialog
        isOpen
        messages={[{ code: 'RA9', message: 'This run is likely to be heavy.' }]}
        onCancel={onCancel}
        onProceedWithoutCharts={onProceedWithoutCharts}
        onProceedWithCharts={onProceedWithCharts}
        {...props}
      />
    </ThemeProvider>
  );
  return { onCancel, onProceedWithoutCharts, onProceedWithCharts };
}

describe('ChartDataChoiceDialog', () => {
  it('shows the chart-specific heading and both proceed buttons by default', () => {
    renderDialog();

    expect(screen.getByText(/large run — chart data collection/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run without chart data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run with chart data anyway/i })).toBeInTheDocument();
  });

  it('shows a generic heading and a single Continue button when offersChartToggle is false', () => {
    renderDialog({
      offersChartToggle: false,
      messages: [{ code: 'RA17', message: "This model's default save setting is 'Full' detail." }],
    });

    expect(screen.getByText(/before you run/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run without chart data/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run with chart data anyway/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument();
  });

  it('resolves "without" when Continue is clicked in the non-chart-toggle mode', () => {
    const { onProceedWithoutCharts } = renderDialog({ offersChartToggle: false });

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(onProceedWithoutCharts).toHaveBeenCalled();
  });

  it('always renders the Cancel run button', () => {
    renderDialog({ offersChartToggle: false });
    expect(screen.getByRole('button', { name: /cancel run/i })).toBeInTheDocument();
  });
});
