import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueueEditor } from '../../../src/ui/editors/index.jsx';

describe('QueueEditor', () => {
  it('describes named queues and customer binding without implicit queue copy', () => {
    render(
      <QueueEditor
        queues={[]}
        entityTypes={[{ id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] }]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Named waiting lines for arriving entities/i)).toBeInTheDocument();
    expect(screen.getByText(/only compatible entity-to-queue combinations/i)).toBeInTheDocument();
    expect(screen.queryByText(/implicit per-customer queue/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No queues yet/i)).toBeInTheDocument();
  });

  it('commits queue name edits on blur instead of on every keypress', () => {
    const handleChange = vi.fn();
    render(
      <QueueEditor
        queues={[{ id: 'q1', name: 'Waiting', customerType: 'Patient', discipline: 'FIFO' }]}
        entityTypes={[{ id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] }]}
        onChange={handleChange}
      />
    );

    const input = screen.getByDisplayValue('Waiting');
    fireEvent.change(input, { target: { value: 'Triage Queue' } });
    expect(handleChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Triage Queue' }),
    ]);
  });

  it('offers server idle/busy and container level/capacity tokens as balk-condition variables', () => {
    // The balk-condition variable dropdown previously only offered Queue.<name>.length
    // and state variables — there was no way to express e.g. "balk if a container is
    // empty" or "balk if no server is idle" even though the engine's condition
    // evaluator (src/engine/conditions.js resolveVariable) already supports both.
    const queues = [{
      id: 'q1', name: 'Hire Queue', customerType: 'HireCustomer', discipline: 'FIFO',
      balkCondition: { variable: '', operator: '>', value: 0 },
    }];
    render(
      <QueueEditor
        queues={queues}
        entityTypes={[
          { id: 'hire', name: 'HireCustomer', role: 'customer', attrDefs: [] },
          { id: 'staff', name: 'Staff', role: 'server', attrDefs: [] },
        ]}
        stateVariables={[]}
        containerTypes={[{ id: 'BikesAvailable', capacity: '20', initialLevel: '20' }]}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Expand/i }));

    const variableSelect = screen.getByDisplayValue('— variable —');
    const options = Array.from(variableSelect.querySelectorAll('option')).map(o => o.value);
    expect(options).toContain('container(BikesAvailable).level');
    expect(options).toContain('container(BikesAvailable).capacity');
    expect(options).toContain('idle(Staff).count');
    expect(options).toContain('busy(Staff).count');
  });
});
