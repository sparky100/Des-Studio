import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportPopover } from '../../../src/ui/shared/ExportPopover.jsx';
import { ThemeProvider } from '../../../src/ui/shared/ThemeContext.jsx';

const model = { id: 'm1', name: 'Queue Demo' };
const results = {
  summary: { total: 10, served: 9, reneged: 1, avgWait: 1.2, avgSvc: 2.1 },
};

function renderPopover(props = {}) {
  const onClose = vi.fn();
  render(
    <ThemeProvider>
      <ExportPopover model={model} results={results} onClose={onClose} {...props} />
    </ThemeProvider>
  );
  return { onClose };
}

describe('ExportPopover', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:export-popover');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('mounts without crashing and lists the core export rows', () => {
    renderPopover();

    expect(screen.getByText(/full model results \(\.json\)/i)).toBeInTheDocument();
    expect(screen.getByText(/results table \(\.csv\)/i)).toBeInTheDocument();
    expect(screen.getByText(/results workbook \(\.xlsx\)/i)).toBeInTheDocument();
  });

  it('calls onClose after triggering a CSV export', () => {
    const { onClose } = renderPopover();

    fireEvent.click(screen.getByText(/results table \(\.csv\)/i));

    expect(onClose).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('calls onClose after triggering a JSON export', () => {
    const { onClose } = renderPopover();

    fireEvent.click(screen.getByText(/full model results \(\.json\)/i));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose after triggering an XLSX export', () => {
    const { onClose } = renderPopover();

    fireEvent.click(screen.getByText(/results workbook \(\.xlsx\)/i));

    expect(onClose).toHaveBeenCalled();
  });

  it('does not render the AI & Reports section when onCreateReport is not provided', () => {
    renderPopover();

    expect(screen.queryByText(/create report/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/llm bundle/i)).not.toBeInTheDocument();
  });

  it('opens the schema reference modal', () => {
    renderPopover();

    fireEvent.click(screen.getByText(/schema reference/i));

    expect(screen.getByRole('dialog', { name: /json export schema reference/i })).toBeInTheDocument();
  });
});
