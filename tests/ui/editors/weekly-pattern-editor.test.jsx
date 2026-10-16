import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WeeklyPatternEditor, mergePeriods } from '../../../src/ui/editors/WeeklyPatternEditor.jsx';

describe('WeeklyPatternEditor', () => {
  const emptyPattern = { type: 'weekly', defaultCapacity: 0, periods: [], exceptions: [] };

  it('renders 7 day headers', () => {
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={vi.fn()} />);
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d => {
      expect(screen.getByText(d)).toBeInTheDocument();
    });
  });

  it('renders hour labels 00 through 23', () => {
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={vi.fn()} />);
    for (let h = 0; h < 24; h++) {
      expect(screen.getByText(String(h).padStart(2, '0'))).toBeInTheDocument();
    }
  });

  it('renders default capacity input at 0', () => {
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={vi.fn()} />);
    const input = screen.getByDisplayValue('0');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'number');
  });

  it('shows click-drag hint when no cells selected', () => {
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={vi.fn()} />);
    expect(screen.getByText(/Click-drag cells to select/)).toBeInTheDocument();
  });

  it('displays existing period capacities in grid cells', () => {
    const pattern = {
      type: 'weekly', defaultCapacity: 0,
      periods: [{ dayOfWeek: 1, start: '09:00', end: '12:00', capacity: 3 }],
      exceptions: [],
    };
    render(<WeeklyPatternEditor pattern={pattern} onChange={vi.fn()} />);
    const cells = screen.getAllByText('3');
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  it('calls onChange with empty periods on Clear All', () => {
    const handleChange = vi.fn();
    const pattern = {
      type: 'weekly', defaultCapacity: 2,
      periods: [{ dayOfWeek: 1, start: '09:00', end: '12:00', capacity: 3 }],
      exceptions: [],
    };
    render(<WeeklyPatternEditor pattern={pattern} onChange={handleChange} />);
    fireEvent.click(screen.getByText('Clear All'));
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ periods: [] }));
  });

  it('adds an exception date on button click', () => {
    const handleChange = vi.fn();
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={handleChange} />);
    fireEvent.click(screen.getByText('+ Add Exception Date'));
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      exceptions: [expect.objectContaining({ date: '', label: '' })],
    }));
  });

  it('removes an exception when delete button clicked', () => {
    const handleChange = vi.fn();
    const pattern = {
      type: 'weekly', defaultCapacity: 0, periods: [],
      exceptions: [{ date: '2026-12-25', label: 'Xmas', periods: [{ start: '09:00', end: '17:00', capacity: 1 }] }],
    };
    render(<WeeklyPatternEditor pattern={pattern} onChange={handleChange} />);
    fireEvent.click(screen.getByText('✕'));
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ exceptions: [] }));
  });

  it('updates default capacity via input', () => {
    const handleChange = vi.fn();
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={handleChange} />);
    const input = screen.getByDisplayValue('0');
    fireEvent.change(input, { target: { value: '5' } });
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ defaultCapacity: 5 }));
  });

  it('shows InfoBox guidance referencing epoch', () => {
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={vi.fn()} />);
    expect(screen.getByText(/Real-world start date/)).toBeInTheDocument();
  });

  it('no preview section when epoch is not set', () => {
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={vi.fn()} />);
    expect(screen.queryByText(/Preview/)).not.toBeInTheDocument();
  });

  it('Invert Selection selects all 168 cells', async () => {
    const user = userEvent.setup();
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={vi.fn()} />);
    expect(screen.getByText(/Click-drag cells to select/)).toBeInTheDocument();
    await user.click(screen.getByText('Invert Selection'));
    expect(screen.getByText(/168 cells selected/)).toBeInTheDocument();
  });

  it('calls onChange with merged periods when Apply clicked after Invert Selection', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={handleChange} />);
    await user.click(screen.getByText('Invert Selection'));
    await user.click(screen.getByText('Apply'));
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      periods: expect.arrayContaining([expect.objectContaining({ capacity: 3 })]),
    }));
  });

  it('re-applying a new capacity to filled cells replaces it rather than adding an overlapping period', () => {
    const handleChange = vi.fn();
    const pattern = {
      type: 'weekly', defaultCapacity: 2,
      periods: [1, 2].map(d => ({ dayOfWeek: d, start: '09:00', end: '17:00', capacity: 2 })),
      exceptions: [],
    };
    const { container } = render(<WeeklyPatternEditor pattern={pattern} onChange={handleChange} />);
    const rows = container.querySelectorAll('tbody tr');
    // Select Mon+Tue 09:00–17:00 (each mousedown toggles one cell).
    for (let h = 9; h < 17; h++) {
      fireEvent.mouseDown(rows[h].children[1]);
      fireEvent.mouseDown(rows[h].children[2]);
    }
    fireEvent.mouseUp(rows[16].children[2]);
    fireEvent.click(screen.getByText('Apply'));
    expect(handleChange.mock.calls.at(-1)[0].periods).toEqual([
      { dayOfWeek: 1, start: '09:00', end: '17:00', capacity: 3 },
      { dayOfWeek: 2, start: '09:00', end: '17:00', capacity: 3 },
    ]);
  });

  it('Clear selection resets display after Invert Selection', async () => {
    const user = userEvent.setup();
    render(<WeeklyPatternEditor pattern={emptyPattern} onChange={vi.fn()} />);
    await user.click(screen.getByText('Invert Selection'));
    expect(screen.getByText(/168 cells selected/)).toBeInTheDocument();
    await user.click(screen.getByText('Clear selection'));
    expect(screen.getByText(/Click-drag cells to select/)).toBeInTheDocument();
  });

});

describe('mergePeriods', () => {
  it('merges consecutive same-capacity periods on the same day', () => {
    const result = mergePeriods([
      { dayOfWeek: 1, start: '09:00', end: '12:00', capacity: 3 },
      { dayOfWeek: 1, start: '11:00', end: '14:00', capacity: 3 },
    ]);
    expect(result).toEqual([
      { dayOfWeek: 1, start: '09:00', end: '14:00', capacity: 3 },
    ]);
  });

  it('does not merge different capacities', () => {
    const result = mergePeriods([
      { dayOfWeek: 1, start: '09:00', end: '12:00', capacity: 3 },
      { dayOfWeek: 1, start: '12:00', end: '14:00', capacity: 5 },
    ]);
    expect(result).toEqual([
      { dayOfWeek: 1, start: '09:00', end: '12:00', capacity: 3 },
      { dayOfWeek: 1, start: '12:00', end: '14:00', capacity: 5 },
    ]);
  });

  it('does not merge across different days', () => {
    const result = mergePeriods([
      { dayOfWeek: 1, start: '09:00', end: '17:00', capacity: 3 },
      { dayOfWeek: 2, start: '09:00', end: '17:00', capacity: 3 },
    ]);
    expect(result).toEqual([
      { dayOfWeek: 1, start: '09:00', end: '17:00', capacity: 3 },
      { dayOfWeek: 2, start: '09:00', end: '17:00', capacity: 3 },
    ]);
  });

  it('merges overlapping same-capacity periods', () => {
    const result = mergePeriods([
      { dayOfWeek: 1, start: '09:00', end: '12:00', capacity: 2 },
      { dayOfWeek: 1, start: '10:00', end: '16:00', capacity: 2 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe('09:00');
    expect(result[0].end).toBe('16:00');
  });

  it('a later period replaces the hours it covers instead of overlapping (V51)', () => {
    // Re-applying capacity 3 over a 09:00–17:00 block that had capacity 2.
    expect(mergePeriods([
      { dayOfWeek: 1, start: '09:00', end: '17:00', capacity: 2 },
      { dayOfWeek: 1, start: '09:00', end: '17:00', capacity: 3 },
    ])).toEqual([{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: 3 }]);
  });

  it('splits an earlier period around a later one in its middle', () => {
    expect(mergePeriods([
      { dayOfWeek: 2, start: '08:00', end: '18:00', capacity: 2 },
      { dayOfWeek: 2, start: '12:00', end: '13:00', capacity: 1 },
    ])).toEqual([
      { dayOfWeek: 2, start: '08:00', end: '12:00', capacity: 2 },
      { dayOfWeek: 2, start: '12:00', end: '13:00', capacity: 1 },
      { dayOfWeek: 2, start: '13:00', end: '18:00', capacity: 2 },
    ]);
  });

  it('handles a period ending at midnight (24:00)', () => {
    expect(mergePeriods([
      { dayOfWeek: 3, start: '20:00', end: '24:00', capacity: 2 },
      { dayOfWeek: 3, start: '22:00', end: '24:00', capacity: 4 },
    ])).toEqual([
      { dayOfWeek: 3, start: '20:00', end: '22:00', capacity: 2 },
      { dayOfWeek: 3, start: '22:00', end: '24:00', capacity: 4 },
    ]);
  });

  it('handles empty input', () => {
    expect(mergePeriods([])).toEqual([]);
  });

  it('keeps non-adjacent periods separate', () => {
    const result = mergePeriods([
      { dayOfWeek: 1, start: '09:00', end: '12:00', capacity: 3 },
      { dayOfWeek: 1, start: '14:00', end: '17:00', capacity: 3 },
    ]);
    expect(result).toHaveLength(2);
  });

  it('prefers later end time when merging contained periods', () => {
    const result = mergePeriods([
      { dayOfWeek: 3, start: '08:00', end: '10:00', capacity: 4 },
      { dayOfWeek: 3, start: '09:00', end: '18:00', capacity: 4 },
    ]);
    expect(result[0].start).toBe('08:00');
    expect(result[0].end).toBe('18:00');
  });
});
