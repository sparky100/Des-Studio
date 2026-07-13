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

// Regression coverage for the "Courier Ground Transport" template bug: the
// Activity inspector's Service Time DistPicker never passed entityTypes/queues/
// allowDistance, so a Distance-type schedule (from queue, to queue, speed
// attribute) silently rendered with everything blank and a false "no numeric
// attribute declared" warning, even though the template's server entity type
// and queues were fully declared.
describe('VisualNodeInspector — Distance-type service time (Courier Ground Transport regression)', () => {
  function makeDistanceModel(overrides = {}) {
    return makeModel({
      entityTypes: [
        { id: 'customer-1', name: 'Customer', role: 'customer' },
        { id: 'server-1', name: 'Server', role: 'server', count: 1, attrDefs: [{ name: 'speed', valueType: 'number', defaultValue: '3' }] },
      ],
      queues: [
        { id: 'queue-1', name: 'Warehouse Queue', customerType: 'Customer', discipline: 'FIFO' },
        { id: 'queue-2', name: 'Depot Queue', customerType: 'Customer', discipline: 'FIFO' },
      ],
      bEvents: [
        { id: 'arrival-1', name: 'Arrivals', scheduledTime: '0', effect: 'ARRIVE(Customer, Warehouse Queue)',
          schedules: [{ eventId: 'arrival-1', dist: 'Exponential', distParams: { mean: '5' } }] },
        { id: 'route-activity-1', name: 'Arrived at Depot', scheduledTime: '9999', effect: 'RELEASE(Server, Depot Queue)', schedules: [] },
      ],
      cEvents: [{
        id: 'activity-1',
        name: 'Courier Ground Transport',
        priority: 1,
        condition: 'queue(Warehouse Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Warehouse Queue, Server)',
        cSchedules: [{
          eventId: 'route-activity-1',
          dist: 'Distance',
          distParams: { from: 'Warehouse Queue', to: 'Depot Queue', speedAttr: 'speed', speedSource: 'server' },
          useEntityCtx: true,
        }],
      }],
      ...overrides,
    });
  }

  it('pre-populates the from/to queues and speed attribute instead of showing them blank', () => {
    const model = makeDistanceModel();
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByLabelText('Distance from queue')).toHaveValue('Warehouse Queue');
    expect(screen.getByLabelText('Distance to queue')).toHaveValue('Depot Queue');
    expect(screen.getByLabelText('Distance speed attribute')).toHaveValue('speed');
  });

  it('does not show the false "no numeric attribute declared" warning when one is declared', () => {
    const model = makeDistanceModel();
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.queryByText(/no numeric attribute declared/i)).not.toBeInTheDocument();
  });

  it('offers the declared numeric server attribute as a selectable option', () => {
    const model = makeDistanceModel();
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    const options = Array.from(screen.getByLabelText('Distance speed attribute').querySelectorAll('option')).map(o => o.value);
    expect(options).toContain('speed');
  });

  it('also passes entityTypes/queues for the V29 multi-schedule (per-when) rows', () => {
    const model = makeDistanceModel({
      cEvents: [{
        id: 'activity-1',
        name: 'Courier Ground Transport',
        priority: 1,
        condition: 'queue(Warehouse Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Warehouse Queue, Server)',
        cSchedules: [
          { eventId: 'route-activity-1', when: { variable: 'Entity.priority', operator: '==', value: 'high' },
            dist: 'Distance', distParams: { from: 'Warehouse Queue', to: 'Depot Queue', speedAttr: 'speed', speedSource: 'server' } },
          { eventId: 'route-activity-1', dist: 'Fixed', distParams: { value: '5' } },
        ],
      }],
    });
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByLabelText('Distance from queue')).toHaveValue('Warehouse Queue');
    expect(screen.queryByText(/no numeric attribute declared/i)).not.toBeInTheDocument();
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
