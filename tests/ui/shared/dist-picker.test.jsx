import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DistPicker } from '../../../src/ui/shared/components.jsx';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CSV_5_ROWS = `name,duration,count
Alice,5.2,3
Bob,bad_value,2
Carol,8.7,1
Dave,3.1,4
Eve,12.0,5`;

// CSV where >10% rows are non-numeric in the value column
const CSV_MOSTLY_BAD = `val\nbad1\nbad2\nbad3\nbad4\nbad5\nbad6\nbad7\nbad8\nbad9\n5.0`;

// Make a FileReader class whose readAsText fires onload synchronously via microtask
function makeFileReader(content) {
  return class {
    readAsText() {
      queueMicrotask(() => this.onload({ target: { result: content } }));
    }
  };
}

function triggerFileInput(content, fileName = 'test.csv') {
  const fileInput = document.querySelector('input[type="file"]');
  vi.stubGlobal('FileReader', makeFileReader(content));
  const file = new File([content], fileName, { type: 'text/csv' });
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fireEvent.change(fileInput);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DistPicker — CSV import (F2.9)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('"Import from CSV…" option is present in the distribution dropdown', () => {
    render(<DistPicker value={{ dist: 'Exponential', distParams: { mean: '3' } }} onChange={vi.fn()} />);
    const options = Array.from(screen.getByRole('combobox').querySelectorAll('option')).map(o => o.textContent);
    expect(options.some(t => t.includes('Import from CSV'))).toBe(true);
  });

  it('column picker appears after a CSV file is selected', async () => {
    render(<DistPicker value={{ dist: 'Exponential', distParams: { mean: '3' } }} onChange={vi.fn()} />);

    triggerFileInput(CSV_5_ROWS, 'times.csv');

    await waitFor(() =>
      expect(screen.getByText(/select numeric column/i)).toBeInTheDocument()
    );

    // All three column headers must appear as options in the column selector
    const comboboxes = screen.getAllByRole('combobox');
    const colSelect = comboboxes[comboboxes.length - 1];
    const colOptions = Array.from(colSelect.querySelectorAll('option')).map(o => o.textContent);
    expect(colOptions).toContain('name');
    expect(colOptions).toContain('duration');
    expect(colOptions).toContain('count');
  });

  it('calls onChange with Empirical format and values array after column confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true); // 1 bad row / 5 = 20% → triggers warning
    const handleChange = vi.fn();
    render(<DistPicker value={{ dist: 'Exponential', distParams: { mean: '3' } }} onChange={handleChange} />);

    triggerFileInput(CSV_5_ROWS, 'data.csv');
    await waitFor(() => expect(screen.getByText(/select numeric column/i)).toBeInTheDocument());

    // Select the 'duration' column (index 1)
    const comboboxes = screen.getAllByRole('combobox');
    const colSelect = comboboxes[comboboxes.length - 1];
    fireEvent.change(colSelect, { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));

    expect(handleChange).toHaveBeenCalledOnce();
    const result = handleChange.mock.calls[0][0];
    expect(result.dist).toBe('Empirical');
    expect(result.sourceFile).toBe('data.csv');
    expect(result.column).toBe('duration');
    // Values array: 4 numeric rows (bad_value is skipped)
    expect(result.distParams.values).toHaveLength(4);
    expect(result.distParams.values).toEqual(expect.arrayContaining([5.2, 8.7, 3.1, 12.0]));
    // CSV file content is NOT stored — only the values array
    expect(result.distParams.values).not.toContain('bad_value');
  });

  it('shows skip-rate warning when >10% of rows are non-numeric', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const handleChange = vi.fn();
    render(<DistPicker value={{ dist: 'Exponential', distParams: { mean: '3' } }} onChange={handleChange} />);

    triggerFileInput(CSV_MOSTLY_BAD, 'bad.csv');
    await waitFor(() => expect(screen.getByText(/select numeric column/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('skipped'));
    expect(handleChange).not.toHaveBeenCalled(); // user cancelled
  });

  it('proceeds without warning when skip rate is ≤10%', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const handleChange = vi.fn();
    // 1 bad row out of 10 = 10% — exactly at threshold (≤10% no warning)
    const CSV_10_PCT = `val\n1\n2\n3\n4\n5\n6\n7\n8\n9\nbad`;
    render(<DistPicker value={{ dist: 'Exponential', distParams: { mean: '3' } }} onChange={handleChange} />);

    triggerFileInput(CSV_10_PCT);
    await waitFor(() => expect(screen.getByText(/select numeric column/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledOnce();
    expect(handleChange.mock.calls[0][0].distParams.values).toHaveLength(9);
  });

  it('shows CSV summary after successful import', () => {
    render(
      <DistPicker
        value={{
          dist: 'Empirical',
          distParams: { values: [5.2, 8.7, 3.1, 12.0] },
          sourceFile: 'service_times.csv',
          column: 'duration',
          _csvStats: { count: 4, skipped: 1, min: 3.1, max: 12.0, mean: 7.25 },
        }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/service_times\.csv/)).toBeInTheDocument();
    expect(screen.getByText(/4 values/)).toBeInTheDocument();
    expect(screen.getByText(/Re-import CSV/i)).toBeInTheDocument();
  });

  it('Cancel button hides the column picker without calling onChange', async () => {
    const handleChange = vi.fn();
    render(<DistPicker value={{ dist: 'Exponential', distParams: { mean: '3' } }} onChange={handleChange} />);

    triggerFileInput(CSV_5_ROWS);
    await waitFor(() => expect(screen.getByText(/select numeric column/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));

    expect(screen.queryByText(/select numeric column/i)).not.toBeInTheDocument();
    expect(handleChange).not.toHaveBeenCalled();
  });
});
