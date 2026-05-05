import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntityTypeEditor } from '../../../src/ui/editors/index.jsx';

describe('EntityTypeEditor — shift schedules (F7.6)', () => {
  const serverType = {
    id: 'srv',
    name: 'Server',
    role: 'server',
    count: '1',
    attrDefs: [],
  };

  it('enabling shift schedule writes an initial time-0 period', () => {
    const handleChange = vi.fn();
    render(<EntityTypeEditor types={[serverType]} onChange={handleChange} />);

    fireEvent.click(screen.getByLabelText(/Use shift schedule/i));

    expect(handleChange).toHaveBeenCalledOnce();
    expect(handleChange.mock.calls[0][0][0].shiftSchedule).toEqual([{ time: '0', capacity: '1' }]);
  });

  it('renders existing shift rows and locks the first start time', () => {
    const { container } = render(
      <EntityTypeEditor
        types={[{
          ...serverType,
          shiftSchedule: [
            { time: '0', capacity: '3' },
            { time: '480', capacity: '1' },
          ],
        }]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('+ Add Shift')).toBeInTheDocument();
    expect(container.querySelector('input[type="number"]')).toBeDisabled();
    expect(screen.getAllByDisplayValue('3')).toHaveLength(1);
    expect(screen.getAllByDisplayValue('1').length).toBeGreaterThanOrEqual(1);
  });

  it('adding a shift appends a new row', () => {
    const handleChange = vi.fn();
    render(
      <EntityTypeEditor
        types={[{ ...serverType, shiftSchedule: [{ time: '0', capacity: '3' }] }]}
        onChange={handleChange}
      />
    );

    fireEvent.click(screen.getByText('+ Add Shift'));

    expect(handleChange).toHaveBeenCalledOnce();
    expect(handleChange.mock.calls[0][0][0].shiftSchedule).toHaveLength(2);
  });
});
