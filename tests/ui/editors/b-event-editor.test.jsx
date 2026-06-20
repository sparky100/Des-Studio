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

describe('BEventEditor — ARRIVE-on-scheduled-follow-on warning', () => {
  it('warns when a B-event referenced by a C-event cSchedule has an ARRIVE effect', () => {
    const bEvents = [
      { id: 'b1', name: 'Recovery Complete', scheduledTime: '9999', effect: 'ARRIVE(Customer, Queue 2)', schedules: [] },
    ];
    const cEvents = [
      { id: 'c1', name: 'Delay', condition: 'true', effect: 'DELAY(RecoveryQueue)',
        cSchedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[]}
        stateVariables={[]}
        queues={[{ id: 'q2', name: 'Queue 2', discipline: 'FIFO' }]}
        cEvents={cEvents}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    expect(screen.getByText(/ARRIVE always creates a brand-new entity/i)).toBeInTheDocument();
  });

  it('does not warn when the B-event uses COMPLETE() instead of ARRIVE', () => {
    const bEvents = [
      { id: 'b1', name: 'Recovery Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ];
    const cEvents = [
      { id: 'c1', name: 'Delay', condition: 'true', effect: 'DELAY(RecoveryQueue)',
        cSchedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[]}
        stateVariables={[]}
        queues={[]}
        cEvents={cEvents}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    expect(screen.queryByText(/ARRIVE always creates a brand-new entity/i)).not.toBeInTheDocument();
  });

  it('does not warn for a plain ARRIVE B-event that is not referenced by any cSchedule', () => {
    const bEvents = [
      { id: 'b1', name: 'New Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue 1)', schedules: [] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[]}
        stateVariables={[]}
        queues={[{ id: 'q1', name: 'Queue 1', discipline: 'FIFO' }]}
        cEvents={[]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    expect(screen.queryByText(/ARRIVE always creates a brand-new entity/i)).not.toBeInTheDocument();
  });

  it('does not warn when ARRIVE is combined with RELEASE() — legit derived-entity multi-stage pattern', () => {
    const bEvents = [
      { id: 'b1', name: 'Recovery Complete', scheduledTime: '9999',
        effect: ['RELEASE(Worker, Queue 2)', 'ARRIVE(LogEntry, Queue 2)'], schedules: [] },
    ];
    const cEvents = [
      { id: 'c1', name: 'Delay', condition: 'true', effect: 'DELAY(RecoveryQueue)',
        cSchedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[{ id: 'w', name: 'Worker', role: 'server', attrDefs: [] }]}
        stateVariables={[]}
        queues={[{ id: 'q2', name: 'Queue 2', discipline: 'FIFO' }]}
        cEvents={cEvents}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    expect(screen.queryByText(/ARRIVE always creates a brand-new entity/i)).not.toBeInTheDocument();
  });
});
