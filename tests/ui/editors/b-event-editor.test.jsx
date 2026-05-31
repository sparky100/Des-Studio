import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BEventEditor } from '../../../src/ui/editors/index.jsx';

describe('BEventEditor — queue-aware effect options', () => {
  it('only offers ARRIVE actions for queues that accept the selected customer type', () => {
    render(
      <BEventEditor
        events={[{ id: 'b1', name: 'Arrival', scheduledTime: '0', effect: [''], schedules: [], description: '' }]}
        onChange={vi.fn()}
        entityTypes={[
          { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
          { id: 'specimen', name: 'Specimen', role: 'customer', attrDefs: [] },
        ]}
        queues={[
          { id: 'triage', name: 'Triage Queue', customerType: 'Patient', discipline: 'FIFO' },
          { id: 'lab', name: 'Lab Queue', customerType: 'Specimen', discipline: 'FIFO' },
        ]}
        cEvents={[]}
      />
    );

    // Card is collapsed by default — expand it first
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));

    // EffectPicker shows the dropdown only after opening it
    fireEvent.click(screen.getByText('+ Add Effect'));

    expect(screen.getByRole('option', { name: 'Add Patient to Triage Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Add Patient to Lab Queue' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Add Specimen to Lab Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Add Specimen to Triage Queue' })).not.toBeInTheDocument();
  });

  it('explains B-event actions without exposing the old macro list heading', () => {
    render(
      <BEventEditor
        events={[]}
        onChange={vi.fn()}
        entityTypes={[{ id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] }]}
        queues={[{ id: 'triage', name: 'Triage Queue', customerType: 'Patient', discipline: 'FIFO' }]}
        cEvents={[]}
      />
    );

    expect(screen.getAllByText(/Arrivals/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Completion/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Macros:/i)).not.toBeInTheDocument();
  });

  it('adds Queue to ARRIVE labels when the queue name omits it', () => {
    render(
      <BEventEditor
        events={[{ id: 'b1', name: 'Arrival', scheduledTime: '0', effect: [''], schedules: [], description: '' }]}
        onChange={vi.fn()}
        entityTypes={[{ id: 'customer', name: 'Customer', role: 'customer', attrDefs: [] }]}
        queues={[{ id: 'waiting', name: 'Waiting', customerType: 'Customer', discipline: 'FIFO' }]}
        cEvents={[]}
      />
    );

    // Card is collapsed by default — expand it first
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));

    // EffectPicker shows the dropdown only after opening it
    fireEvent.click(screen.getByText('+ Add Effect'));

    expect(screen.getByRole('option', { name: 'Add Customer to Waiting Queue' })).toBeInTheDocument();
  });

  it('commits B-event name edits on blur instead of on every keypress', () => {
    const handleChange = vi.fn();
    render(
      <BEventEditor
        events={[{ id: 'b1', name: 'Arrival', scheduledTime: '0', effect: [''], schedules: [], description: '' }]}
        onChange={handleChange}
        entityTypes={[{ id: 'customer', name: 'Customer', role: 'customer', attrDefs: [] }]}
        queues={[]}
        cEvents={[]}
      />
    );

    const input = screen.getByDisplayValue('Arrival');
    fireEvent.change(input, { target: { value: 'Patient Arrival' } });
    expect(handleChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Patient Arrival' }),
    ]);
  });
});
