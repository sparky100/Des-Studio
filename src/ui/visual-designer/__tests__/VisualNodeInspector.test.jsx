// Focused render/interaction tests for the new "Probabilistic routing" section.
// This is the first component test for VisualNodeInspector — broader coverage
// of the rest of the panel is a separate follow-up, not bundled into this change.
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VisualNodeInspector } from '../VisualNodeInspector.jsx';
import { deriveGraphFromModel } from '../graph.js';

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
      {
        id: 'arrival-1',
        name: 'Arrivals',
        scheduledTime: '0',
        effect: 'ARRIVE(Customer, Queue 1)',
        schedules: [{ eventId: 'arrival-1', dist: 'Exponential', distParams: { mean: '5' } }],
      },
      {
        id: 'route-activity-1-queue-2',
        name: 'Triage Complete',
        scheduledTime: '9999',
        effect: 'RELEASE(Server, Queue 2)',
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
      condition: '',
      effect: 'ASSIGN(Queue 1, Server)',
      cSchedules: [{ eventId: 'route-activity-1-queue-2', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
    }],
  };
}

function makeNonProbabilisticModel() {
  const model = makeModel();
  model.bEvents = model.bEvents.map(be =>
    be.id === 'route-activity-1-queue-2' ? { ...be, probabilisticRouting: undefined } : be
  );
  return model;
}

const baseHandlers = {
  onPatchNode: vi.fn(),
  onDeleteNode: vi.fn(),
  onAddBranch: vi.fn(),
  onUpdateBranchQueue: vi.fn(),
  onUpdateBranchProbability: vi.fn(),
  onDeleteBranch: vi.fn(),
  onClose: vi.fn(),
};

function renderInspector(model, overrides = {}) {
  const graph = deriveGraphFromModel(model);
  const handlers = { ...baseHandlers, ...overrides };
  Object.values(baseHandlers).forEach(fn => fn.mockClear?.());
  render(
    <VisualNodeInspector
      model={model}
      graph={graph}
      selectedNodeId="activity:activity-1"
      canEdit
      {...handlers}
    />
  );
  return handlers;
}

describe('VisualNodeInspector — probabilistic routing branches', () => {
  test('renders a branch row per probabilisticRouting entry for a probabilistic Activity', () => {
    renderInspector(makeModel());
    expect(screen.getByText('Probabilistic routing')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Branch \d+ destination/)).toHaveLength(2);
  });

  test('does not render the section for a plain (non-probabilistic) Activity', () => {
    renderInspector(makeNonProbabilisticModel());
    expect(screen.queryByText('Probabilistic routing')).not.toBeInTheDocument();
  });

  test('"+ Add branch" calls onAddBranch with the bEvent id', async () => {
    const handlers = renderInspector(makeModel());
    await userEvent.click(screen.getByText('+ Add branch'));
    expect(handlers.onAddBranch).toHaveBeenCalledWith('route-activity-1-queue-2');
  });

  test('changing a branch destination calls onUpdateBranchQueue, "Exit system" passes null', async () => {
    const handlers = renderInspector(makeModel());
    const [firstSelect] = screen.getAllByLabelText(/Branch \d+ destination/);

    await userEvent.selectOptions(firstSelect, 'Queue 3');
    expect(handlers.onUpdateBranchQueue).toHaveBeenCalledWith('route-activity-1-queue-2', 0, 'Queue 3');

    await userEvent.selectOptions(firstSelect, 'Exit system');
    expect(handlers.onUpdateBranchQueue).toHaveBeenCalledWith('route-activity-1-queue-2', 0, null);
  });

  test('clicking a branch delete button calls onDeleteBranch with (bEventId, branchIndex)', async () => {
    const handlers = renderInspector(makeModel());
    const deleteButtons = screen.getAllByLabelText(/Remove branch \d+/);

    await userEvent.click(deleteButtons[1]);
    expect(handlers.onDeleteBranch).toHaveBeenCalledWith('route-activity-1-queue-2', 1);
  });
});
