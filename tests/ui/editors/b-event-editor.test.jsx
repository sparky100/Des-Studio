import { useState } from 'react';
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

describe('BEventEditor — routing mode selector', () => {
  it('keeps "Conditional routing" selected (and shows the condition row) after picking it from the Mode dropdown', () => {
    const StatefulEditor = () => {
      const [events, setEvents] = useState([
        { id: 'b1', name: 'Recovery Complete', scheduledTime: '9999',
          effect: ['RELEASE(Worker, Queue 2)'], schedules: [] },
      ]);
      return (
        <BEventEditor
          events={events}
          onChange={setEvents}
          entityTypes={[{ id: 'w', name: 'Worker', role: 'server', attrDefs: [] }]}
          stateVariables={[]}
          queues={[{ id: 'q2', name: 'Queue 2', discipline: 'FIFO' }]}
          cEvents={[]}
        />
      );
    };
    render(<StatefulEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    fireEvent.click(screen.getByText('Release Routing'));

    const modeSelect = screen.getByDisplayValue('Single queue (no routing)');
    fireEvent.change(modeSelect, { target: { value: 'conditional' } });

    expect(screen.getByDisplayValue('Conditional routing')).toBeInTheDocument();
    expect(screen.getByText('IF')).toBeInTheDocument();
  });
});

describe('BEventEditor — COSEIZE multi-resource awareness', () => {
  it('shows RELEASE options for all server types when B-event is scheduled by a COSEIZE C-event', () => {
    const bEvents = [
      { id: 'b_surgery_done', name: 'Surgery Complete', scheduledTime: '9999',
        effect: 'COMPLETE()', schedules: [] },
    ];
    const cEvents = [
      { id: 'c_surgery', name: 'Perform Surgery', priority: 1,
        condition: 'queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0',
        effect: 'COSEIZE(SurgeryQueue, Surgeon, Anesthetist)',
        cSchedules: [{ eventId: 'b_surgery_done', dist: 'Triangular',
          distParams: { min: '10', mode: '20', max: '40' }, useEntityCtx: true }] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[
          { id: 'surgeon', name: 'Surgeon', role: 'server', count: 2, attrDefs: [] },
          { id: 'anesthetist', name: 'Anesthetist', role: 'server', count: 2, attrDefs: [] },
          { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
        ]}
        queues={[
          { id: 'surgery_q', name: 'SurgeryQueue', customerType: 'Patient', discipline: 'FIFO' },
        ]}
        cEvents={cEvents}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    fireEvent.click(screen.getByText('+ Add Effect'));

    expect(screen.getByRole('option', { name: 'Release Surgeon (entity stays in current stage)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Release Anesthetist (entity stays in current stage)' })).toBeInTheDocument();
  });

  it('shows routing combos for COSEIZE server types (Release X and route to Y)', () => {
    const bEvents = [
      { id: 'b_surgery_done', name: 'Surgery Complete', scheduledTime: '9999',
        effect: 'COMPLETE()', schedules: [] },
    ];
    const cEvents = [
      { id: 'c_surgery', name: 'Perform Surgery', priority: 1,
        condition: 'queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0',
        effect: 'COSEIZE(SurgeryQueue, Surgeon, Anesthetist)',
        cSchedules: [{ eventId: 'b_surgery_done', dist: 'Triangular',
          distParams: { min: '10', mode: '20', max: '40' }, useEntityCtx: true }] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[
          { id: 'surgeon', name: 'Surgeon', role: 'server', count: 2, attrDefs: [] },
          { id: 'anesthetist', name: 'Anesthetist', role: 'server', count: 2, attrDefs: [] },
          { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
        ]}
        queues={[
          { id: 'surgery_q', name: 'SurgeryQueue', customerType: 'Patient', discipline: 'FIFO' },
          { id: 'ward_q', name: 'WardQueue', customerType: 'Patient', discipline: 'FIFO' },
        ]}
        cEvents={cEvents}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    fireEvent.click(screen.getByText('+ Add Effect'));

    const options = screen.getAllByRole('option').map(o => o.getAttribute('aria-label') || o.textContent);
    expect(options).toContain('Release Surgeon and route Patient to WardQueue');
    expect(options).toContain('Release Anesthetist and route Patient to WardQueue');
  });

  it('shows a combined RELEASE_COSEIZED option for all co-seized resources', () => {
    const bEvents = [
      { id: 'b_surgery_done', name: 'Surgery Complete', scheduledTime: '9999',
        effect: 'COMPLETE()', schedules: [] },
    ];
    const cEvents = [
      { id: 'c_surgery', name: 'Perform Surgery', priority: 1,
        condition: 'queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0',
        effect: 'COSEIZE(SurgeryQueue, Surgeon, Anesthetist)',
        cSchedules: [{ eventId: 'b_surgery_done', dist: 'Triangular',
          distParams: { min: '10', mode: '20', max: '40' }, useEntityCtx: true }] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[
          { id: 'surgeon', name: 'Surgeon', role: 'server', count: 2, attrDefs: [] },
          { id: 'anesthetist', name: 'Anesthetist', role: 'server', count: 2, attrDefs: [] },
          { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
        ]}
        queues={[
          { id: 'surgery_q', name: 'SurgeryQueue', customerType: 'Patient', discipline: 'FIFO' },
          { id: 'ward_q', name: 'WardQueue', customerType: 'Patient', discipline: 'FIFO' },
        ]}
        cEvents={cEvents}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    fireEvent.click(screen.getByText('+ Add Effect'));

    const options = screen.getAllByRole('option').map(o => o.getAttribute('aria-label') || o.textContent);
    expect(options).toContain('Release Surgeon & Anesthetist (entity stays in current stage)');
    expect(options).toContain('Release Surgeon & Anesthetist and route Patient to WardQueue');
  });

  it('warns inline when separate RELEASE() calls are stacked for co-seized types', () => {
    const bEvents = [
      { id: 'b_surgery_done', name: 'Surgery Complete', scheduledTime: '9999',
        effect: ['RELEASE(Surgeon)', 'RELEASE(Anesthetist)'], schedules: [] },
    ];
    const cEvents = [
      { id: 'c_surgery', name: 'Perform Surgery', priority: 1,
        condition: 'queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0',
        effect: 'COSEIZE(SurgeryQueue, Surgeon, Anesthetist)',
        cSchedules: [{ eventId: 'b_surgery_done', dist: 'Triangular',
          distParams: { min: '10', mode: '20', max: '40' }, useEntityCtx: true }] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[
          { id: 'surgeon', name: 'Surgeon', role: 'server', count: 2, attrDefs: [] },
          { id: 'anesthetist', name: 'Anesthetist', role: 'server', count: 2, attrDefs: [] },
          { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
        ]}
        queues={[
          { id: 'surgery_q', name: 'SurgeryQueue', customerType: 'Patient', discipline: 'FIFO' },
        ]}
        cEvents={cEvents}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));

    expect(screen.getByText(/stacks separate RELEASE\(\) calls for co-seized resources/i)).toBeInTheDocument();
  });

  it('does not show the stacked-RELEASE warning for a single RELEASE() or RELEASE_COSEIZED', () => {
    const bEvents = [
      { id: 'b_surgery_done', name: 'Surgery Complete', scheduledTime: '9999',
        effect: ['RELEASE_COSEIZED([Surgeon, Anesthetist])'], schedules: [] },
    ];
    const cEvents = [
      { id: 'c_surgery', name: 'Perform Surgery', priority: 1,
        condition: 'queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0',
        effect: 'COSEIZE(SurgeryQueue, Surgeon, Anesthetist)',
        cSchedules: [{ eventId: 'b_surgery_done', dist: 'Triangular',
          distParams: { min: '10', mode: '20', max: '40' }, useEntityCtx: true }] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[
          { id: 'surgeon', name: 'Surgeon', role: 'server', count: 2, attrDefs: [] },
          { id: 'anesthetist', name: 'Anesthetist', role: 'server', count: 2, attrDefs: [] },
          { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
        ]}
        queues={[
          { id: 'surgery_q', name: 'SurgeryQueue', customerType: 'Patient', discipline: 'FIFO' },
        ]}
        cEvents={cEvents}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));

    expect(screen.queryByText(/stacks separate RELEASE\(\) calls for co-seized resources/i)).not.toBeInTheDocument();
  });

  it('does not over-prune RELEASE options when B-event is NOT scheduled by COSEIZE', () => {
    const bEvents = [
      { id: 'b_done', name: 'Service Complete', scheduledTime: '9999',
        effect: 'COMPLETE()', schedules: [] },
    ];
    render(
      <BEventEditor
        events={bEvents}
        onChange={vi.fn()}
        entityTypes={[
          { id: 'surgeon', name: 'Surgeon', role: 'server', count: 2, attrDefs: [] },
          { id: 'anesthetist', name: 'Anesthetist', role: 'server', count: 2, attrDefs: [] },
          { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
        ]}
        queues={[
          { id: 'surgery_q', name: 'SurgeryQueue', customerType: 'Patient', discipline: 'FIFO' },
        ]}
        cEvents={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));
    fireEvent.click(screen.getByText('+ Add Effect'));

    expect(screen.getByRole('option', { name: 'Release Surgeon (entity stays in current stage)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Release Anesthetist (entity stays in current stage)' })).toBeInTheDocument();
  });
});
