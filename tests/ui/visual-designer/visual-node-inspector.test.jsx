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

describe('VisualNodeInspector — advanced activity effects', () => {
  it('hides the Server type control for a COSEIZE activity and shows the C-Events pointer instead', () => {
    const model = makeModel({
      cEvents: [{
        id: 'activity-1',
        name: 'Joint Procedure',
        priority: 1,
        condition: 'queue(Queue 1).length > 0',
        effect: 'COSEIZE(Queue 1, Nurse, Doctor)',
        cSchedules: [],
      }],
    });
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.queryByLabelText(/server type/i)).not.toBeInTheDocument();
    expect(screen.getByText(/advanced effect .* the canvas can't edit/i)).toBeInTheDocument();
    expect(screen.getAllByText(/edit in the conditional events tab/i).length).toBeGreaterThan(0);
  });

  it('still shows the Server type control, with the right server, for a skill-gated ASSIGN', () => {
    const model = makeModel({
      cEvents: [{
        id: 'activity-1',
        name: 'Triage',
        priority: 1,
        condition: 'queue(Queue 1).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue 1, Server, "Paediatrics")',
        cSchedules: [],
      }],
    });
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByLabelText(/server type/i)).toHaveValue('Server');
  });
});

// Balking/reneging are edited only in Define (Queues tab) — the Inspector
// shows a read-only "edit in Define" pointer with the current value (or a
// "not configured" state) rather than silently omitting them.
describe('VisualNodeInspector — queue balking/reneging/description pointers', () => {
  it('shows "not configured" for balking and reneging on a plain queue', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText(/not configured — all arrivals join/i)).toBeInTheDocument();
    expect(screen.getByText(/not configured — entities never abandon this queue/i)).toBeInTheDocument();
    expect(screen.getByText('Not set.')).toBeInTheDocument(); // Description
  });

  it('summarizes a probability-based balking config', () => {
    const model = makeModel({
      queues: [{ id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO', balkProbability: 0.15 }],
    });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText(/15% of arrivals balk/i)).toBeInTheDocument();
  });

  it('summarizes a condition-based balking config', () => {
    const model = makeModel({
      queues: [{
        id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO',
        balkCondition: { variable: 'Entity.severity', operator: '<', value: 3 },
      }],
    });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText(/balks when severity < 3/i)).toBeInTheDocument();
  });

  it('summarizes a configured reneging distribution', () => {
    const model = makeModel({
      queues: [{
        id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO',
        renegeDist: 'Exponential', renegeDistParams: { rate: 0.1 },
      }],
    });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText(/abandons after exp/i)).toBeInTheDocument();
  });

  it('shows a queue\'s description when set, and names the Queues tab', () => {
    const model = makeModel({
      queues: [{ id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO', description: 'Overflow buffer for peak hours.' }],
    });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText('Overflow buffer for peak hours.')).toBeInTheDocument();
    expect(screen.getAllByText(/edit in the queues tab/i).length).toBeGreaterThan(0);
  });
});

describe('VisualNodeInspector — activity type pointer', () => {
  it('shows a "Service" activity type pointer for a plain ASSIGN activity', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText('Activity Type')).toBeInTheDocument();
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText(/switch to delay/i)).toBeInTheDocument();
  });

  it('shows a "Delay" activity type pointer for a delay activity', () => {
    const model = makeModel({
      cEvents: [{
        id: 'activity-1', name: 'Wait', priority: 1,
        condition: 'queue(Queue 1).length > 0',
        effect: 'DELAY(Queue 1)',
        cSchedules: [],
      }],
    });
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText('Activity Type')).toBeInTheDocument();
    expect(screen.getByText('Delay')).toBeInTheDocument();
  });

  it('shows an "Advanced" activity type pointer for a COSEIZE activity', () => {
    const model = makeModel({
      cEvents: [{
        id: 'activity-1', name: 'Joint Procedure', priority: 1,
        condition: 'queue(Queue 1).length > 0',
        effect: 'COSEIZE(Queue 1, Nurse, Doctor)',
        cSchedules: [],
      }],
    });
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText('Activity Type')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });
});

describe('VisualNodeInspector — description pointers', () => {
  it('shows an activity\'s description when set, and names the Conditional Events tab', () => {
    const model = makeModel({
      cEvents: [{ ...makeModel().cEvents[0], description: 'Primary triage assessment.' }],
    });
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText('Primary triage assessment.')).toBeInTheDocument();
  });

  it('shows a source\'s description when set, and names the Bound Events tab', () => {
    const model = makeModel({
      bEvents: [{ ...makeModel().bEvents[0], description: 'Walk-in patient arrivals.' }],
    });
    const graph = deriveGraphFromModel(model);
    const sourceNode = findNode(graph, 'source');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={sourceNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText('Walk-in patient arrivals.')).toBeInTheDocument();
    expect(screen.getAllByText(/edit in the bound events tab/i).length).toBeGreaterThan(0);
  });
});

describe('VisualNodeInspector — source/sink Effect and Loop Guard pointers', () => {
  function makeSinkModel(bEventOverrides = {}) {
    return makeModel({
      bEvents: [
        makeModel().bEvents[0],
        {
          id: 'complete-1', name: 'Complete', scheduledTime: '9999',
          // COMPLETE() (alongside RELEASE) guarantees a sink node regardless
          // of whether routing/probabilisticRouting is set — a bare RELEASE
          // with no routing table and no COMPLETE produces a plain queue-to-
          // queue edge instead, with no sink node to select in the Inspector.
          effect: ['RELEASE(Server, Queue 1)', 'COMPLETE()'],
          schedules: [],
          ...bEventOverrides,
        },
      ],
      cEvents: [{ ...makeModel().cEvents[0], cSchedules: [{ eventId: 'complete-1', dist: 'Fixed', distParams: { value: '1' } }] }],
    });
  }

  it('shows the Loop Guard as not configured by default', () => {
    const model = makeSinkModel();
    const graph = deriveGraphFromModel(model);
    const sinkNode = findNode(graph, 'sink');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={sinkNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText(/not configured — no recirculation limit/i)).toBeInTheDocument();
  });

  it('summarizes a configured Loop Guard', () => {
    const model = makeSinkModel({ loopConfig: { maxLoopCount: 3, exitQueueName: 'Queue 1' } });
    const graph = deriveGraphFromModel(model);
    const sinkNode = findNode(graph, 'sink');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={sinkNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText(/max 3 loops/i)).toBeInTheDocument();
  });

  it('summarizes the Effect via the same routing summary used elsewhere', () => {
    const model = makeSinkModel({
      probabilisticRouting: [
        { probability: 0.25, queueName: null },
        { probability: 0.75, queueName: 'Queue 1' },
      ],
    });
    const graph = deriveGraphFromModel(model);
    const sinkNode = findNode(graph, 'sink');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={sinkNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.getByText(/routes 25% →/i)).toBeInTheDocument();
  });
});

// "Edit in the X tab" pointers become real jump links when the host (Draw's
// VisualDesignerPanel, wired from ModelDetail) supplies onGoToDefine — falling
// back to the original plain-text footer when it's omitted (e.g. embedded
// contexts that don't have a Define surface to jump to).
describe('VisualNodeInspector — DefinePointer jump links', () => {
  it('renders "Edit in the X tab" pointers as plain text when onGoToDefine is omitted', () => {
    const model = makeModel({
      queues: [{ id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO', description: 'Overflow buffer.' }],
    });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /edit in the queues tab/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/edit in the queues tab/i).length).toBeGreaterThan(0);
  });

  it('clicking a queue\'s "Edit in the Queues tab" link calls onGoToDefine with the queue tab id and the queue\'s id', () => {
    const model = makeModel({
      queues: [{ id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO', description: 'Overflow buffer.' }],
    });
    const graph = deriveGraphFromModel(model);
    const queueNode = findNode(graph, 'queue');
    const onGoToDefine = vi.fn();
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={queueNode.id} canEdit onPatchNode={vi.fn()} onGoToDefine={onGoToDefine} />);

    const links = screen.getAllByRole('button', { name: /edit in the queues tab/i });
    expect(links.length).toBeGreaterThan(0);
    fireEvent.click(links[0]);
    expect(onGoToDefine).toHaveBeenCalledWith('queues', 'queue-1');
  });

  it('clicking an activity\'s "Edit in the Conditional Events tab" link passes the cEvent id', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    const onGoToDefine = vi.fn();
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} onGoToDefine={onGoToDefine} />);

    fireEvent.click(screen.getAllByRole('button', { name: /edit in the conditional events tab/i })[0]);
    expect(onGoToDefine).toHaveBeenCalledWith('cevents', 'activity-1');
  });

  it('clicking a source\'s "Edit in the Bound Events tab" link passes the bEvent id', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const sourceNode = findNode(graph, 'source');
    const onGoToDefine = vi.fn();
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={sourceNode.id} canEdit onPatchNode={vi.fn()} onGoToDefine={onGoToDefine} />);

    fireEvent.click(screen.getAllByRole('button', { name: /edit in the bound events tab/i })[0]);
    expect(onGoToDefine).toHaveBeenCalledWith('bevents', 'arrival-1');
  });

  it('clicking a server\'s "Edit in the Entity Types tab" link (Shift Schedule pointer) passes the server entity type id', () => {
    const model = makeModel({
      entityTypes: [
        { id: 'customer-1', name: 'Customer', role: 'customer' },
        { id: 'server-1', name: 'Server', role: 'server', count: 1, shiftSchedule: [{ time: '0', capacity: '2' }, { time: '480', capacity: '1' }] },
      ],
    });
    const graph = deriveGraphFromModel(model);
    const activityNode = findNode(graph, 'activity');
    const onGoToDefine = vi.fn();
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={activityNode.id} canEdit onPatchNode={vi.fn()} onGoToDefine={onGoToDefine} />);

    fireEvent.click(screen.getByRole('button', { name: /edit in the entity types tab/i }));
    expect(onGoToDefine).toHaveBeenCalledWith('entities', 'server-1');
  });
});
