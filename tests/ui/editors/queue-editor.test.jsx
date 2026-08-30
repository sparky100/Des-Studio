import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueueEditor } from '../../../src/ui/editors/index.jsx';

// jsdom doesn't implement scrollIntoView — the focus/expand effect below calls it.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

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

  it('offers container tokens (e.g. "current level") in the condition-based balking variable picker', () => {
    // Regression: the balk-condition variable dropdown was hand-rolled here
    // (not the shared ConditionBuilder) and only offered queue lengths and
    // state variables — container(...) tokens were missing even though the
    // engine already resolves them fine inside a balkCondition.
    render(
      <QueueEditor
        queues={[{
          id: 'q1', name: 'Hire Queue', customerType: 'HireCustomer', discipline: 'FIFO',
          // Already condition-mode balking (QueueEditor is fully controlled via
          // props/onChange — a mocked onChange means clicking the mode select
          // in-test wouldn't actually flip it, so start in the target state).
          balkCondition: { variable: '', operator: '>', value: 0 },
        }]}
        entityTypes={[{ id: 'hire', name: 'HireCustomer', role: 'customer', attrDefs: [] }]}
        containers={[{ id: 'BikesAvailable', capacity: '5', initialLevel: '5' }]}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Expand'));
    // The Balking SectionPanel auto-opens because its status ("condition") is
    // active — no separate click needed here (unlike an "off"/inactive status).

    // QueueEditor is fully controlled — a mocked onChange won't propagate a
    // selection back into `value`, so the regression coverage that matters is
    // that these options exist at all (they didn't before this fix).
    screen.getByDisplayValue('— variable —');
    expect(screen.getByRole('option', { name: 'BikesAvailable — current level' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'BikesAvailable — capacity' })).toBeInTheDocument();
  });

  it('focusQueueId auto-expands the matching card, clears any filter, and reports back via onFocusHandled', async () => {
    const handleFocusHandled = vi.fn();
    const { rerender } = render(
      <QueueEditor
        queues={[
          { id: 'q1', name: 'Triage', customerType: 'Patient', discipline: 'FIFO' },
          { id: 'q2', name: 'Treatment', customerType: 'Patient', discipline: 'FIFO' },
        ]}
        entityTypes={[{ id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] }]}
        onChange={vi.fn()}
        focusQueueId={null}
        onFocusHandled={handleFocusHandled}
      />
    );

    // Both cards collapsed by default — expanded-only content isn't shown yet.
    expect(screen.queryByText('ACCEPTS')).not.toBeInTheDocument();

    rerender(
      <QueueEditor
        queues={[
          { id: 'q1', name: 'Triage', customerType: 'Patient', discipline: 'FIFO' },
          { id: 'q2', name: 'Treatment', customerType: 'Patient', discipline: 'FIFO' },
        ]}
        entityTypes={[{ id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] }]}
        onChange={vi.fn()}
        focusQueueId="q2"
        onFocusHandled={handleFocusHandled}
      />
    );

    // The focused card ("Treatment") expands; the other ("Triage") stays collapsed.
    await waitFor(() => expect(screen.getByDisplayValue('Treatment').closest('div').parentElement.textContent).toContain('ACCEPTS'));
    expect(screen.getByDisplayValue('Triage').closest('div').parentElement.textContent).not.toContain('ACCEPTS');
    await waitFor(() => expect(handleFocusHandled).toHaveBeenCalled());
  });
});
