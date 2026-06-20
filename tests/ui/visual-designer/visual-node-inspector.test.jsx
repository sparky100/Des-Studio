import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VisualNodeInspector } from '../../../src/ui/visual-designer/VisualNodeInspector.jsx';
import { deriveGraphFromModel } from '../../../src/ui/visual-designer/graph.js';

function makeModel(overrides = {}) {
  return {
    entityTypes: [
      { id: 'customer-1', name: 'Customer', role: 'customer' },
      { id: 'server-1', name: 'Server', role: 'server', count: 1 },
    ],
    queues: [
      { id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO' },
    ],
    bEvents: [
      {
        id: 'arrival-1',
        name: 'Arrivals',
        scheduledTime: '0',
        effect: 'ARRIVE(Customer, Queue 1)',
        schedules: [{ eventId: 'arrival-1', dist: 'Exponential', distParams: { mean: '5' } }],
      },
    ],
    cEvents: [{
      id: 'activity-1',
      name: 'Triage',
      priority: 1,
      condition: 'queue(Queue 1).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Queue 1, Server)',
      cSchedules: [],
    }],
    sections: [],
    ...overrides,
  };
}

function findNode(graph, type) {
  return graph.nodes.find(n => n.type === type);
}

describe('VisualNodeInspector — placeholder', () => {
  it('shows a placeholder when no node is selected', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={null} canEdit onPatchNode={vi.fn()} />);
    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
  });
});

describe('VisualNodeInspector — commit-on-blur (not per-keystroke)', () => {
  it('does not call onPatchNode while typing, only on blur', async () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    const onPatchNode = vi.fn();
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={onPatchNode} />);

    const nameInput = screen.getByLabelText(/queue name/i);
    const user = userEvent.setup();
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Queue');
    expect(onPatchNode).not.toHaveBeenCalled();

    fireEvent.blur(nameInput);
    expect(onPatchNode).toHaveBeenCalledTimes(1);
    expect(onPatchNode).toHaveBeenCalledWith(queueNode, { name: 'Renamed Queue' });
  });
});

describe('VisualNodeInspector — queue discipline parity', () => {
  it('offers all 5 engine disciplines, matching QueueEditor', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);

    const select = screen.getByLabelText(/discipline/i);
    const optionValues = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(optionValues).toEqual(['FIFO', 'LIFO', 'PRIORITY', 'PRIORITY_ATTR', 'SPT', 'EDD']);
  });

  it('reveals a custom priority-attribute field when PRIORITY_ATTR is chosen', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    const onPatchNode = vi.fn();
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={onPatchNode} />);

    expect(screen.queryByLabelText(/priority attribute/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/discipline/i), { target: { value: 'PRIORITY_ATTR' } });
    expect(onPatchNode).toHaveBeenCalledWith(queueNode, { discipline: 'PRIORITY(priority)' });
  });

  it('shows the existing custom attribute name for a queue already using PRIORITY(attr)', () => {
    const model = makeModel({ queues: [{ id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'PRIORITY(severity)' }] });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByLabelText(/discipline/i).value).toBe('PRIORITY_ATTR');
    expect(screen.getByLabelText(/priority attribute/i).value).toBe('severity');
  });
});

describe('VisualNodeInspector — capacity field', () => {
  it('coerces non-numeric input to unlimited (null) on blur', async () => {
    const model = makeModel({ queues: [{ id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO', capacity: '10' }] });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    const onPatchNode = vi.fn();
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={onPatchNode} />);

    const capacityInput = screen.getByLabelText(/max queue length/i);
    const user = userEvent.setup();
    await user.clear(capacityInput);
    await user.type(capacityInput, 'abc');
    fireEvent.blur(capacityInput);

    expect(onPatchNode).toHaveBeenCalledWith(queueNode, { capacity: null });
  });
});

describe('VisualNodeInspector — section assignment', () => {
  it('does not render the Section field when the model has no sections', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);
    expect(screen.queryByLabelText(/^section$/i)).not.toBeInTheDocument();
  });

  it('shows the section a node is currently assigned to', () => {
    const model = makeModel({
      sections: [{ id: 'sec-1', name: 'Triage', color: '#4A90D9', memberIds: ['queue-1'] }],
    });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);
    expect(screen.getByLabelText(/^section$/i).value).toBe('sec-1');
  });

  it('assigns a node to a section, removing it from any other section', () => {
    const model = makeModel({
      sections: [
        { id: 'sec-1', name: 'Triage', color: '#4A90D9', memberIds: ['queue-1'] },
        { id: 'sec-2', name: 'Recovery', color: '#27AE60', memberIds: [] },
      ],
    });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    const onPatchNode = vi.fn();
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={onPatchNode} />);

    fireEvent.change(screen.getByLabelText(/^section$/i), { target: { value: 'sec-2' } });
    expect(onPatchNode).toHaveBeenCalledWith(queueNode, { sectionId: 'sec-2' });
  });

  it('unassigns a node from its section when "Unassigned" is chosen', () => {
    const model = makeModel({
      sections: [{ id: 'sec-1', name: 'Triage', color: '#4A90D9', memberIds: ['queue-1'] }],
    });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    const onPatchNode = vi.fn();
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={onPatchNode} />);

    fireEvent.change(screen.getByLabelText(/^section$/i), { target: { value: '' } });
    expect(onPatchNode).toHaveBeenCalledWith(queueNode, { sectionId: null });
  });
});

describe('VisualNodeInspector — read-only mode', () => {
  it('disables fields and hides delete when canEdit is false', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit={false} onPatchNode={vi.fn()} onDeleteNode={vi.fn()} />);
    expect(screen.getByLabelText(/queue name/i)).toBeDisabled();
    expect(screen.queryByText(/delete node/i)).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });
});
