import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CEventEditor } from '../../../src/ui/editors/index.jsx';

const mockCEvents = [
  { id: 'c1', name: 'Seize Nurse',  priority: 1, condition: '', effect: '', cSchedules: [], description: '' },
  { id: 'c2', name: 'Seize Doctor', priority: 2, condition: '', effect: '', cSchedules: [], description: '' },
  { id: 'c3', name: 'Discharge',    priority: 3, condition: '', effect: '', cSchedules: [], description: '' },
];

describe('CEventEditor — priority field', () => {
  it('renders a priority badge on each C-Event row', () => {
    render(
      <CEventEditor
        events={mockCEvents}
        onChange={vi.fn()}
        bEvents={[]}
        entityTypes={[]}
        stateVariables={[]}
        queues={[]}
      />
    );
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
    expect(screen.getByText('P3')).toBeInTheDocument();
  });

  it('priority is shown as an explicit integer — one badge per event', () => {
    render(
      <CEventEditor
        events={mockCEvents}
        onChange={vi.fn()}
        bEvents={[]}
        entityTypes={[]}
        stateVariables={[]}
        queues={[]}
      />
    );
    const p1 = screen.getByText('P1');
    const p2 = screen.getByText('P2');
    const p3 = screen.getByText('P3');
    expect(p1).not.toBe(p2);
    expect(p2).not.toBe(p3);
  });

  it('new C-Event receives priority = length + 1 of existing list', () => {
    const handleChange = vi.fn();
    render(
      <CEventEditor
        events={[{ id: 'c1', name: 'First', priority: 1, condition: '', effect: '', cSchedules: [], description: '' }]}
        onChange={handleChange}
        bEvents={[]}
        entityTypes={[]}
        stateVariables={[]}
        queues={[]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add C-Event/i }));
    const newList = handleChange.mock.calls[0][0];
    expect(newList).toHaveLength(2);
    expect(newList[1].priority).toBe(2);
  });

  it('deleting a C-Event re-numbers remaining priorities from 1', () => {
    const handleChange = vi.fn();
    render(
      <CEventEditor
        events={mockCEvents}
        onChange={handleChange}
        bEvents={[]}
        entityTypes={[]}
        stateVariables={[]}
        queues={[]}
      />
    );
    // Delete the first event (P1) through its accessible remove button
    const deleteButtons = screen.getAllByRole('button', { name: /remove c-event/i });
    fireEvent.click(deleteButtons[0]);
    const remaining = handleChange.mock.calls[0][0];
    expect(remaining).toHaveLength(2);
    expect(remaining[0].priority).toBe(1);
    expect(remaining[1].priority).toBe(2);
  });

  it('each priority badge has an accessible aria-label', () => {
    render(
      <CEventEditor
        events={mockCEvents}
        onChange={vi.fn()}
        bEvents={[]}
        entityTypes={[]}
        stateVariables={[]}
        queues={[]}
      />
    );
    expect(screen.getByLabelText('Priority 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority 3')).toBeInTheDocument();
  });
});

describe('CEventEditor — ConditionBuilder token list staleness (C8)', () => {
  const singleEvent = [
    { id: 'c1', name: 'Triage', priority: 1, condition: '', effect: '', cSchedules: [], description: '' },
  ];

  it('new entity type queue token appears in condition picker after entityTypes prop update', () => {
    const { rerender } = render(
      <CEventEditor
        events={singleEvent}
        onChange={vi.fn()}
        bEvents={[]}
        entityTypes={[{ id: 'et1', name: 'Patient', role: 'customer', attrDefs: [] }]}
        stateVariables={[]}
        queues={[]}
      />
    );

    // Open a condition clause so the token dropdown is visible
    fireEvent.click(screen.getByRole('button', { name: /Add Clause/i }));

    // Re-render with a server entity type that has an attribute — simulates model edit
    rerender(
      <CEventEditor
        events={singleEvent}
        onChange={vi.fn()}
        bEvents={[]}
        entityTypes={[
          { id: 'et1', name: 'Patient', role: 'customer', attrDefs: [] },
          { id: 'et2', name: 'Nurse', role: 'server', attrDefs: [
            { id: 'a1', name: 'serviceTime', valueType: 'number', defaultValue: '5' },
          ]},
        ]}
        stateVariables={[]}
        queues={[]}
      />
    );

    // Token dropdown should now include the new server's count and attribute tokens
    const comboboxes = screen.getAllByRole('combobox');
    const tokenSelect = comboboxes[0];
    const options = Array.from(tokenSelect.querySelectorAll('option')).map(o => o.value);

    expect(options).toContain('idle(Nurse).count');
    expect(options).toContain('attr(Nurse, serviceTime)');
  });

  it('attr() tokens for server entity attributes appear in the condition picker', () => {
    render(
      <CEventEditor
        events={singleEvent}
        onChange={vi.fn()}
        bEvents={[]}
        entityTypes={[{
          id: 'et1', name: 'Doctor', role: 'server',
          attrDefs: [
            { id: 'a1', name: 'maxPatients', valueType: 'number', defaultValue: '3' },
            { id: 'a2', name: 'isSpecialist', valueType: 'boolean', defaultValue: 'false' },
          ],
        }]}
        stateVariables={[]}
        queues={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Clause/i }));

    const comboboxes = screen.getAllByRole('combobox');
    const tokenSelect = comboboxes[0];
    const options = Array.from(tokenSelect.querySelectorAll('option')).map(o => o.value);

    expect(options).toContain('attr(Doctor, maxPatients)');
    expect(options).toContain('attr(Doctor, isSpecialist)');
    expect(options).toContain('idle(Doctor).count');
    expect(options).toContain('busy(Doctor).count');
  });

  it('writes visible fallback condition tokens back to the canonical C-event value', async () => {
    const handleChange = vi.fn();
    render(
      <CEventEditor
        events={[{ id: 'c1', name: 'Start Serving Customer', priority: 1, condition: 'queue(Queue 1).length > 0', effect: '', cSchedules: [], description: '' }]}
        onChange={handleChange}
        bEvents={[]}
        entityTypes={[]}
        stateVariables={[]}
        queues={[{ id: 'waiting', name: 'Waiting', customerType: 'Customer', discipline: 'FIFO' }]}
      />
    );

    expect(screen.getAllByRole('combobox')[0]).toHaveValue('queue(Waiting).length');
    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith([
        expect.objectContaining({ condition: 'queue(Waiting).length > 0' }),
      ]);
    });
  });
});

describe('CEventEditor — follow-on B-event labels', () => {
  it('does not show template wording for scheduled follow-on B-events', () => {
    render(
      <CEventEditor
        events={[{ id: 'c1', name: 'Start Service', priority: 1, condition: '', effect: '', cSchedules: [{ id: 'cs1', eventId: '', dist: 'Fixed', distParams: { value: '1' } }], description: '' }]}
        onChange={vi.fn()}
        bEvents={[{ id: 'complete', name: 'Service Complete (template)', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] }]}
        entityTypes={[]}
        stateVariables={[]}
        queues={[]}
      />
    );

    expect(screen.getByRole('option', { name: 'Service Complete' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /template/i })).not.toBeInTheDocument();
  });

  it('strips template wording from the scheduled follow-on preview', () => {
    render(
      <CEventEditor
        events={[{ id: 'c1', name: 'Start Service', priority: 1, condition: '', effect: '', cSchedules: [{ id: 'cs1', eventId: 'complete', dist: 'Fixed', distParams: { value: '1' } }], description: '' }]}
        onChange={vi.fn()}
        bEvents={[{ id: 'complete', name: 'Service Complete (template)', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] }]}
        entityTypes={[]}
        stateVariables={[]}
        queues={[]}
      />
    );

    expect(screen.getByText(/Will schedule:/i).textContent).toContain('Will schedule: Service Complete');
    expect(screen.queryByText(/template/i)).not.toBeInTheDocument();
  });
});
