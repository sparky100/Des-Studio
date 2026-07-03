import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntityTypeEditor } from '../../../src/ui/editors/index.jsx';

// Expands the entity type card whose name input has the given display value,
// by finding the "Expand" button within that card's own header row — more
// robust than indexing into getAllByRole when multiple cards are on screen.
const expandCardNamed = (name) => {
  const nameInput = screen.getByDisplayValue(name);
  const headerRow = nameInput.parentElement;
  fireEvent.click(within(headerRow).getByRole('button', { name: /Expand/i }));
};

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

    // Entity type card is collapsed by default — expand it first
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));

    // Shift Schedule section starts collapsed — open it first, then enable via checkbox
    fireEvent.click(screen.getByText(/Shift Schedule/i));
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

    // Entity type card is collapsed by default — expand it first
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));

    expect(screen.getByText('+ Add Shift')).toBeInTheDocument();
    // The first shift row's time field is always locked at t=0
    expect(container.querySelector('input[type="number"][disabled]')).toBeInTheDocument();
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

    // Entity type card is collapsed by default — expand it first
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));

    fireEvent.click(screen.getByText('+ Add Shift'));

    expect(handleChange).toHaveBeenCalledOnce();
    expect(handleChange.mock.calls[0][0][0].shiftSchedule).toHaveLength(2);
  });

  it('commits entity type name edits on blur instead of on every keypress', () => {
    const handleChange = vi.fn();
    render(
      <EntityTypeEditor
        types={[{ id: 'cust', name: 'Patient', role: 'customer', attrDefs: [] }]}
        onChange={handleChange}
      />
    );

    const input = screen.getByDisplayValue('Patient');
    fireEvent.change(input, { target: { value: 'Emergency Patient' } });
    expect(handleChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Emergency Patient' }),
    ]);
  });
});

describe('EntityTypeEditor — entity family / inheritance (Phase 2, 2b)', () => {
  const nurse = { id: 'et-nurse', name: 'Nurse', role: 'server', count: '2', skills: ['Triage'], attrDefs: [] };
  const seniorNurse = { id: 'et-senior', name: 'Senior Nurse', role: 'server', count: '1', attrDefs: [] };

  it('renders the "Inherits from" picker without throwing when expanded', () => {
    render(<EntityTypeEditor types={[nurse, seniorNurse]} onChange={vi.fn()} />);
    expandCardNamed('Senior Nurse');
    expect(screen.getByText(/Inherits from/i)).toBeInTheDocument();
  });

  it('does not offer a same-type or cross-role option in the parent picker', () => {
    const customer = { id: 'et-patient', name: 'Patient', role: 'customer', attrDefs: [] };
    render(<EntityTypeEditor types={[nurse, seniorNurse, customer]} onChange={vi.fn()} />);
    expandCardNamed('Senior Nurse');
    const select = screen.getByText(/Inherits from/i).closest('div').querySelector('select');
    const optionLabels = Array.from(select.options).map(o => o.textContent);
    expect(optionLabels).toContain('Nurse');
    expect(optionLabels).not.toContain('Senior Nurse');
    expect(optionLabels).not.toContain('Patient');
  });

  it('setting a parent updates parentTypeId', () => {
    const handleChange = vi.fn();
    render(<EntityTypeEditor types={[nurse, seniorNurse]} onChange={handleChange} />);
    expandCardNamed('Senior Nurse');
    const select = screen.getByText(/Inherits from/i).closest('div').querySelector('select');
    fireEvent.change(select, { target: { value: 'et-nurse' } });
    expect(handleChange.mock.calls[0][0].find(t => t.id === 'et-senior')).toEqual(expect.objectContaining({ parentTypeId: 'et-nurse' }));
  });
});

describe('EntityTypeEditor — required sequence (Phase 2, 2c)', () => {
  const patient = { id: 'et-patient', name: 'Patient', role: 'customer', attrDefs: [] };
  const queues = [
    { id: 'q1', name: 'Triage Queue' },
    { id: 'q2', name: 'Treatment Queue' },
    { id: 'q3', name: 'Discharge Queue' },
  ];

  it('renders the Required Sequence panel for a customer type without throwing', () => {
    render(<EntityTypeEditor types={[patient]} queues={queues} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    expect(screen.getByText(/Required Sequence/i)).toBeInTheDocument();
  });

  it('does not render the Required Sequence panel for a server type', () => {
    render(<EntityTypeEditor types={[{ id: 'srv2', name: 'Server2', role: 'server', count: '1', attrDefs: [] }]} queues={queues} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    expect(screen.queryByText(/Required Sequence/i)).not.toBeInTheDocument();
  });

  it('adding a queue from the dropdown appends it to requiredSequence', () => {
    const handleChange = vi.fn();
    render(<EntityTypeEditor types={[patient]} queues={queues} onChange={handleChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    fireEvent.click(screen.getByText(/Required Sequence/i));
    const select = screen.getByLabelText(/Add queue to sequence/i);
    fireEvent.change(select, { target: { value: 'Triage Queue' } });
    expect(handleChange.mock.calls[0][0][0].requiredSequence).toEqual(['Triage Queue']);
  });

  it('moving a stage down reorders requiredSequence', () => {
    const handleChange = vi.fn();
    render(
      <EntityTypeEditor
        types={[{ ...patient, requiredSequence: ['Triage Queue', 'Treatment Queue'] }]}
        queues={queues}
        onChange={handleChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    fireEvent.click(screen.getByRole('button', { name: /Move Triage Queue later/i }));
    expect(handleChange.mock.calls[0][0][0].requiredSequence).toEqual(['Treatment Queue', 'Triage Queue']);
  });

  it('removing a stage drops it from requiredSequence', () => {
    const handleChange = vi.fn();
    render(
      <EntityTypeEditor
        types={[{ ...patient, requiredSequence: ['Triage Queue', 'Treatment Queue'] }]}
        queues={queues}
        onChange={handleChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    fireEvent.click(screen.getByRole('button', { name: /Remove Triage Queue/i }));
    expect(handleChange.mock.calls[0][0][0].requiredSequence).toEqual(['Treatment Queue']);
  });
});
