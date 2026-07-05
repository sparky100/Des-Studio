import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteEdgeDialog } from '../../../src/ui/visual-designer/RouteEdgeDialog.jsx';
import { deriveGraphFromModel } from '../../../src/ui/visual-designer/graph.js';

// Mirrors graph-operations.test.js's makeModel/makeProbabilisticModel fixtures —
// an activity ("Triage") whose completion B-event already routes probabilistically
// to two queues, exactly the shape connectVisualNodes now produces after a 2nd
// canvas connection (F-consolidation fix).
function makeModel() {
  return {
    entityTypes: [
      { id: 'customer-1', name: 'Customer', role: 'customer' },
      { id: 'server-1', name: 'Server', role: 'server', count: 1 },
    ],
    queues: [
      { id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO' },
      { id: 'queue-2', name: 'Queue 2', customerType: 'Customer', discipline: 'FIFO' },
      { id: 'queue-3', name: 'Queue 3', customerType: 'Customer', discipline: 'FIFO' },
    ],
    bEvents: [
      { id: 'arrival-1', name: 'Arrivals', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue 1)',
        schedules: [{ eventId: 'arrival-1', dist: 'Exponential', distParams: { mean: '5' } }] },
      {
        id: 'route-activity-1-queue-2',
        name: 'Triage Complete',
        scheduledTime: '9999',
        effect: 'RELEASE(Server)',
        schedules: [],
        probabilisticRouting: [
          { probability: 0.7, queueName: 'Queue 2' },
          { probability: 0.3, queueName: 'Queue 3' },
        ],
      },
    ],
    cEvents: [{
      id: 'activity-1',
      name: 'Triage',
      priority: 1,
      condition: 'queue(Queue 1).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Queue 1, Server)',
      cSchedules: [{ eventId: 'route-activity-1-queue-2', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
    }],
  };
}

function setup(model = makeModel(), overrides = {}) {
  const graph = deriveGraphFromModel(model);
  const edge = graph.edges.find(e => e.bEventId === 'route-activity-1-queue-2' && e.branchIndex === 0);
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <RouteEdgeDialog
      edgeId={edge.id}
      model={model}
      graph={graph}
      canEdit
      onApply={onApply}
      onClose={onClose}
      {...overrides}
    />
  );
  return { onApply, onClose, edge };
}

describe('RouteEdgeDialog', () => {
  it('shows one row per probabilistic branch with the right percentage and a green total', () => {
    setup();
    expect(screen.getByText(/Triage Complete/)).toBeInTheDocument();
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue(70);
    expect(inputs[1]).toHaveValue(30);
    expect(screen.getByText(/1\.000 ✓/)).toBeInTheDocument();
  });

  it('shows a red mismatch total when branch probabilities do not sum to 1', () => {
    const model = makeModel();
    model.bEvents[1].probabilisticRouting[0].probability = 0.5;
    setup(model);
    expect(screen.getByText(/≠ 1\.0 ✗/)).toBeInTheDocument();
  });

  it('changing a branch percentage applies an updated model via onApply', () => {
    const { onApply } = setup();
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '55' } });

    expect(onApply).toHaveBeenCalledTimes(1);
    const nextModel = onApply.mock.calls[0][0];
    const bEvent = nextModel.bEvents.find(b => b.id === 'route-activity-1-queue-2');
    expect(bEvent.probabilisticRouting[0].probability).toBe(0.55);
    expect(bEvent.probabilisticRouting[1].probability).toBe(0.3);
  });

  it('adding a branch appends a blank row and removing a branch removes the right one', () => {
    const { onApply } = setup();

    fireEvent.click(screen.getByRole('button', { name: /add branch/i }));
    let nextModel = onApply.mock.calls[0][0];
    expect(nextModel.bEvents.find(b => b.id === 'route-activity-1-queue-2').probabilisticRouting).toHaveLength(3);

    onApply.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: /remove branch 2/i })[0]);
    nextModel = onApply.mock.calls[0][0];
    const bEvent = nextModel.bEvents.find(b => b.id === 'route-activity-1-queue-2');
    expect(bEvent.probabilisticRouting).toEqual([{ probability: 0.7, queueName: 'Queue 2' }]);
  });

  it('switching the mode to conditional replaces the probability rows with condition rows and strips the RELEASE queue arg', () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByDisplayValue('Probabilistic routing'), { target: { value: 'conditional' } });

    const nextModel = onApply.mock.calls[0][0];
    const bEvent = nextModel.bEvents.find(b => b.id === 'route-activity-1-queue-2');
    expect(bEvent.probabilisticRouting).toBeUndefined();
    expect(bEvent.routing).toHaveLength(1);
    expect(bEvent.defaultQueueName).toBe('');
  });

  it('the Close/Done button closes without mutating the model', () => {
    const { onApply, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('disables edit controls and hides add/remove buttons when canEdit is false', () => {
    setup(makeModel(), { canEdit: false });
    const inputs = screen.getAllByRole('spinbutton');
    inputs.forEach(input => expect(input).toBeDisabled());
    expect(screen.queryByRole('button', { name: /add branch/i })).not.toBeInTheDocument();
  });

  it('renders nothing when the edge or its completion B-event cannot be resolved', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const { container } = render(
      <RouteEdgeDialog edgeId="not-a-real-edge" model={model} graph={graph} canEdit onApply={vi.fn()} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
