import { render, screen, within } from '@testing-library/react';
import { createEvent, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModelDetail, buildModelExportPayload } from '../../../src/ui/ModelDetail.jsx';
import { VisualDesignerPanel } from '../../../src/ui/visual-designer/VisualDesignerPanel.jsx';

// A source node with no queue → validateVisualGraph fires "not connected" warning
const disconnectedSourceModel = {
  id: 'model-validation',
  entityTypes: [{ id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] }],
  stateVariables: [],
  queues: [],
  bEvents: [{ id: 'arr', name: 'Customer Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer)', schedules: [] }],
  cEvents: [],
};

vi.mock('@xyflow/react', () => ({
  Background: () => <div data-testid="flow-background" />,
  Controls: () => <div data-testid="flow-controls" />,
  Handle: () => <span data-testid="flow-handle" />,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  MiniMap: () => <div data-testid="flow-minimap" />,
  Panel: ({ children }) => <div data-testid="flow-panel">{children}</div>,
  Position: { Left: 'left', Right: 'right' },
  SelectionMode: { Full: 'full', Partial: 'partial' },
  useReactFlow: () => ({
    fitView: vi.fn(),
    getNode: vi.fn(() => null),
    setCenter: vi.fn(),
    getViewport: vi.fn(() => ({ zoom: 1 })),
  }),
  ReactFlow: ({ nodes = [], edges = [], children, fitView, defaultViewport, onNodeClick, onNodeDragStop, onSelectionChange, onConnect, onEdgeClick, selectionOnDrag, panOnDrag, panActivationKeyCode, minZoom, maxZoom }) => {
    const source = nodes.find(node => node.id.startsWith('source:'));
    const firstQueue = nodes.find(node => node.id.startsWith('queue:'));
    const overflow = nodes.find(node => node.id === 'queue:consult-q');
    const first = nodes[0];
    return (
      <div
        data-testid="react-flow"
        data-node-count={nodes.length}
        data-edge-count={edges.length}
        data-fit-view={String(Boolean(fitView))}
        data-viewport-zoom={defaultViewport?.zoom}
        data-selection-on-drag={String(selectionOnDrag)}
        data-pan-on-drag={JSON.stringify(panOnDrag)}
        data-pan-activation={panActivationKeyCode}
        data-min-zoom={minZoom}
        data-max-zoom={maxZoom}
        data-selected-edge={edges.find(edge => edge.selected)?.id || ''}
      >
        {children}
        {first && (
          <button type="button" onClick={() => onNodeDragStop?.({}, { id: first.id, position: { x: 444, y: 555 } })}>
            Mock move first node
          </button>
        )}
        {firstQueue && overflow && (
          <>
            <button type="button" onClick={() => onSelectionChange?.({
              nodes: [
                { ...firstQueue, selected: true },
                { ...overflow, selected: true },
              ],
            })}>
              Mock multi-select queues
            </button>
            <button
              type="button"
              onClick={() => onSelectionChange?.({
                nodes: nodes.map(node => ({ ...node, selected: node.id === firstQueue.id })),
              })}
            >
              Mock noisy box selection
            </button>
            <button
              type="button"
              onClick={() => onNodeDragStop?.({}, firstQueue, [
                { id: firstQueue.id, position: { x: 111, y: 222 } },
                { id: overflow.id, position: { x: 333, y: 444 } },
              ])}
            >
              Mock move selected queues
            </button>
          </>
        )}
        {source && (
          <button type="button" onClick={() => onNodeClick?.({}, source)}>
            Mock select source
          </button>
        )}
        {firstQueue && (
          <button type="button" onClick={() => onNodeClick?.({}, firstQueue)}>
            Mock select queue
          </button>
        )}
        {source && overflow && (
          <button type="button" onClick={() => onConnect?.({ source: source.id, target: overflow.id })}>
            Mock connect source to consultant queue
          </button>
        )}
        {edges.length > 0 && (
          <button type="button" onClick={() => onEdgeClick?.({}, edges[0])}>
            Mock select edge
          </button>
        )}
      </div>
    );
  },
}));

const twoStageModel = {
  id: 'model-visual',
  name: 'Two Stage Clinic',
  description: '',
  visibility: 'private',
  owner_id: 'user-1',
  entityTypes: [
    { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
    { id: 'triage', name: 'Triage Nurse', role: 'server', count: 1, attrDefs: [] },
    { id: 'consultant', name: 'Consultant', role: 'server', count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  queues: [
    { id: 'triage-q', name: 'Triage Queue', customerType: 'Patient', discipline: 'FIFO' },
    { id: 'consult-q', name: 'Consultant Queue', customerType: 'Patient', discipline: 'FIFO' },
  ],
  bEvents: [
    { id: 'arrive', name: 'Patient Arrival', scheduledTime: '0', effect: 'ARRIVE(Patient, Triage Queue)', schedules: [] },
    { id: 'triage-complete', name: 'Triage Complete', scheduledTime: '9999', effect: 'RELEASE(Triage Nurse, Consultant Queue)', schedules: [] },
    { id: 'consult-complete', name: 'Consultation Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
  ],
  cEvents: [
    {
      id: 'start-triage',
      name: 'Start Triage',
      priority: 1,
      condition: 'queue(Triage Queue).length > 0 AND idle(Triage Nurse).count > 0',
      effect: 'ASSIGN(Triage Queue, Triage Nurse)',
      cSchedules: [{ eventId: 'triage-complete', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
    },
    {
      id: 'start-consult',
      name: 'Start Consultation',
      priority: 2,
      condition: 'queue(Consultant Queue).length > 0 AND idle(Consultant).count > 0',
      effect: 'ASSIGN(Consultant Queue, Consultant)',
      cSchedules: [{ eventId: 'consult-complete', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
    },
  ],
};

describe('Visual Designer shell', () => {
  it('opens from the model tab list and displays the derived graph', async () => {
    const user = userEvent.setup();

    render(
      <ModelDetail
        modelId="model-visual"
        modelData={twoStageModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1' }}
      />
    );

    await user.click(screen.getByRole('button', { name: /^design$/i }));
    await screen.findByLabelText('Visual Designer'); // wait for lazy chunk to resolve

    expect(screen.getByRole('button', { name: /^design$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Visual Designer')).toBeInTheDocument();
    expect(screen.getByLabelText('Visual Designer canvas')).toBeInTheDocument();
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-node-count', '6');
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-edge-count', '5');
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-fit-view', 'false');
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-viewport-zoom', '1');
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-edge-count', '5');
  });

  it('keeps optional graph metadata in model exports', () => {
    const payload = buildModelExportPayload({
      ...twoStageModel,
      graph: {
        version: 1,
        nodes: [{ id: 'queue:triage-q', type: 'queue', refId: 'triage-q', x: 10, y: 20 }],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    }, '2026-05-05T00:00:00.000Z');

    expect(payload.model_json.graph).toEqual(expect.objectContaining({
      version: 1,
      nodes: [expect.objectContaining({ id: 'queue:triage-q', x: 10, y: 20 })],
    }));
  });

  it('supports initial visual authoring actions and marks the model dirty', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ModelDetail
        modelId="model-visual"
        modelData={twoStageModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1', onSave }}
      />
    );

    await user.click(screen.getByRole('button', { name: /^design$/i }));
    await screen.findByLabelText('Visual Designer');
    await user.click(screen.getByRole('button', { name: /add queue/i }));

    expect(screen.getByText('Unsaved changes in this model.')).toBeInTheDocument();
  });

  it('auto-links a newly added queue from the currently selected source when the connection is valid', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ModelDetail
        modelId="model-visual"
        modelData={twoStageModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1', onSave }}
      />
    );

    await user.click(screen.getByRole('button', { name: /^design$/i }));
    await screen.findByLabelText('Visual Designer');
    await user.click(screen.getByRole('button', { name: /mock select source/i }));
    await user.click(screen.getByRole('button', { name: /add queue/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      bEvents: expect.arrayContaining([
        expect.objectContaining({ id: 'arrive', effect: 'ARRIVE(Patient, Queue 3)' }),
      ]),
    }));
  }, 15000);

  it('persists layout changes through the normal save path', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ModelDetail
        modelId="model-visual"
        modelData={twoStageModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1', onSave }}
      />
    );

    await user.click(screen.getByRole('button', { name: /^design$/i }));
    await screen.findByLabelText('Visual Designer');
    await user.click(screen.getByRole('button', { name: /mock move first node/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ x: 444, y: 555 }),
        ]),
      }),
    }));
    expect(onSave.mock.calls[0][0].graph.edges).toBeUndefined();
  }, 15000);

  it('shows and clears multi-node canvas selection actions', async () => {
    const user = userEvent.setup();

    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit
        onModelChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /mock multi-select queues/i }));

    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('ignores unselected nodes when React Flow reports a noisy selection payload', async () => {
    const user = userEvent.setup();

    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit
        onModelChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /mock noisy box selection/i }));

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByText('6 selected')).not.toBeInTheDocument();
  });

  it('persists group movement for selected visual nodes', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit
        onModelChange={onModelChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /mock multi-select queues/i }));
    await user.click(screen.getByRole('button', { name: /mock move selected queues/i }));

    expect(onModelChange).toHaveBeenLastCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'queue:triage-q', x: 111, y: 222 }),
          expect.objectContaining({ id: 'queue:consult-q', x: 333, y: 444 }),
        ]),
      }),
    }));
  });

  it('bulk deletes selected visual nodes after confirmation', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();
    const queueOnlyModel = {
      id: 'queue-only',
      entityTypes: [{ id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] }],
      stateVariables: [],
      queues: [
        { id: 'triage-q', name: 'Triage Queue', customerType: 'Patient', discipline: 'FIFO' },
        { id: 'consult-q', name: 'Consultant Queue', customerType: 'Patient', discipline: 'FIFO' },
      ],
      bEvents: [],
      cEvents: [],
    };

    render(
      <VisualDesignerPanel
        model={queueOnlyModel}
        canEdit
        onModelChange={onModelChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /mock multi-select queues/i }));
    await user.click(within(screen.getByLabelText('Selection actions')).getByRole('button', { name: /^delete$/i }));

    const dialog = screen.getByRole('dialog', { name: /confirm node deletion/i });
    expect(within(dialog).getByText('Delete 2 selected nodes?')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(onModelChange).toHaveBeenCalledOnce();
    expect(onModelChange.mock.calls[0][0].queues).toHaveLength(0);
  });

  it('uses visual connections to update canonical source routing', async () => {
    const user = userEvent.setup();

    render(
      <ModelDetail
        modelId="model-visual"
        modelData={twoStageModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1', onSave: vi.fn() }}
      />
    );

    await user.click(screen.getByRole('button', { name: /^design$/i }));
    await screen.findByLabelText('Visual Designer');
    await user.click(screen.getByRole('button', { name: /mock connect source to consultant queue/i }));
    await user.click(screen.getByRole('button', { name: /mock select source/i }));

    expect(screen.getByLabelText(/target queue/i)).toHaveValue('Consultant Queue');
  }, 15000);

  it('validation checklist shows clickable error row for a disconnected source and selecting it opens the inspector', async () => {
    const user = userEvent.setup();

    render(
      <VisualDesignerPanel
        model={disconnectedSourceModel}
        canEdit
        onModelChange={vi.fn()}
      />
    );

    // Checklist must be present
    const checklist = screen.getByLabelText('Validation checklist');
    expect(checklist).toBeInTheDocument();

    // A warning row mentioning the unconnected source must be visible
    const warnRow = screen.getByRole('button', { name: /not connected/i });
    expect(warnRow).toBeInTheDocument();

    // Clicking the row selects the node → the inspector renders the source fields
    await user.click(warnRow);
    // Source inspector shows the arrival event's name in a "Source name" input
    expect(screen.getByDisplayValue('Customer Arrival')).toBeInTheDocument();
  });

  it('gives server count controls room for two digits in the node palette', async () => {
    const onModelChange = vi.fn();

    render(
      <VisualDesignerPanel
        model={{
          ...twoStageModel,
          entityTypes: [
            { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
            { id: 'nurse', name: 'Nurse', role: 'server', count: '2', attrDefs: [] },
          ],
        }}
        canEdit
        onModelChange={onModelChange}
      />
    );

    const countInput = screen.getByDisplayValue('2');
    expect(countInput).toHaveStyle({ width: '100%', boxSizing: 'border-box' });

    fireEvent.change(countInput, { target: { value: '12' } });

    expect(onModelChange).toHaveBeenLastCalledWith(expect.objectContaining({
      entityTypes: expect.arrayContaining([
        expect.objectContaining({ id: 'nurse', count: '12' }),
      ]),
    }));
  });

  it('adds a selected modelling pattern from the node palette', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(
      <VisualDesignerPanel
        model={{ entityTypes: [], stateVariables: [], queues: [], bEvents: [], cEvents: [] }}
        canEdit
        onModelChange={onModelChange}
      />
    );

    await user.selectOptions(screen.getByLabelText(/add pattern/i), 'priority-queue');
    await user.click(screen.getByRole('button', { name: /add pattern/i }));

    expect(onModelChange).toHaveBeenLastCalledWith(expect.objectContaining({
      queues: expect.arrayContaining([
        expect.objectContaining({ name: 'Priority Queue', discipline: 'PRIORITY' }),
      ]),
      entityTypes: expect.arrayContaining([
        expect.objectContaining({
          name: 'Customer',
          attrDefs: expect.arrayContaining([
            expect.objectContaining({ name: 'priority', valueType: 'number' }),
          ]),
        }),
      ]),
    }));
    expect(screen.getByText(/Priority queue added/i)).toBeInTheDocument();
  });

  it('shows dependency dialog listing C-event when deleting a queue referenced by C-events', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit
        onModelChange={onModelChange}
      />
    );

    // Select the first queue node (Triage Queue) via canvas
    await user.click(screen.getByRole('button', { name: /mock select queue/i }));
    // Inspector now shows the queue editor — click the delete button
    await user.click(screen.getByRole('button', { name: /delete node/i }));

    // Confirmation dialog must appear listing Start Triage as a dependent
    const dialog = screen.getByRole('dialog', { name: /confirm node deletion/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Start Triage/)).toBeInTheDocument();

    // Cancelling must leave the model unchanged
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onModelChange).not.toHaveBeenCalled();
  });

  it('deletes a source node with no dependents immediately without a confirmation dialog', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    const isolatedModel = {
      id: 'isolated',
      entityTypes: [{ id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] }],
      stateVariables: [],
      queues: [],
      bEvents: [{ id: 'arr1', name: 'Customer Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer)', schedules: [] }],
      cEvents: [],
    };

    render(
      <VisualDesignerPanel
        model={isolatedModel}
        canEdit
        onModelChange={onModelChange}
      />
    );

    // Select the source node
    await user.click(screen.getByRole('button', { name: /mock select source/i }));
    // No dependents — click delete should fire immediately without a dialog
    await user.click(screen.getByRole('button', { name: /delete node/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onModelChange).toHaveBeenCalledOnce();
    expect(onModelChange.mock.calls[0][0].bEvents).toHaveLength(0);
  });

  it('supports dropping a palette node onto the canvas and saving its position', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const data = new Map();
    const dataTransfer = {
      dropEffect: '',
      effectAllowed: '',
      setData: (type, value) => data.set(type, value),
      getData: type => data.get(type) || '',
    };

    render(
      <ModelDetail
        modelId="model-visual"
        modelData={twoStageModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1', onSave }}
      />
    );

    await user.click(screen.getByRole('button', { name: /^design$/i }));
    await screen.findByLabelText('Visual Designer');
    fireEvent.dragStart(screen.getByRole('button', { name: /add sink/i }), { dataTransfer });
    const canvas = screen.getByLabelText('Visual Designer canvas');
    const dropEvent = createEvent.drop(canvas, { dataTransfer });
    Object.defineProperty(dropEvent, 'clientX', { value: 300 });
    Object.defineProperty(dropEvent, 'clientY', { value: 200 });
    fireEvent(canvas, dropEvent);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ type: 'sink', x: 300, y: 200 }),
        ]),
      }),
    }));
  }, 15000);

  it('configures modeless pan/select interaction props on the canvas', () => {
    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit
        onModelChange={vi.fn()}
      />
    );

    const flow = screen.getByTestId('react-flow');
    expect(flow).toHaveAttribute('data-selection-on-drag', 'true');
    expect(flow).toHaveAttribute('data-pan-on-drag', '[1,2]');
    expect(flow).toHaveAttribute('data-pan-activation', 'Space');
    expect(flow).toHaveAttribute('data-min-zoom', '0.1');
    expect(flow).toHaveAttribute('data-max-zoom', '2');
    expect(screen.queryByLabelText('Canvas interaction mode')).not.toBeInTheDocument();
  });

  it('falls back to drag-to-pan when the model is read-only', () => {
    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit={false}
        onModelChange={vi.fn()}
      />
    );

    const flow = screen.getByTestId('react-flow');
    expect(flow).toHaveAttribute('data-selection-on-drag', 'false');
    expect(flow).toHaveAttribute('data-pan-on-drag', 'true');
  });

  it('deletes a selected edge with the Delete key and shows a status message', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit
        onModelChange={onModelChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /mock select edge/i }));
    expect(screen.getByTestId('react-flow').getAttribute('data-selected-edge')).not.toBe('');

    await user.keyboard('{Delete}');

    expect(onModelChange).toHaveBeenCalledOnce();
    expect(screen.getByText('Connection removed.')).toBeInTheDocument();
  });

  it('does not delete a selected edge when the model is read-only', async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit={false}
        onModelChange={onModelChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /mock select edge/i }));
    await user.keyboard('{Delete}');

    expect(onModelChange).not.toHaveBeenCalled();
  });

  it('clears node and edge selection with Escape', async () => {
    const user = userEvent.setup();

    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit
        onModelChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /mock multi-select queues/i }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mock select edge/i }));
    expect(screen.getByTestId('react-flow').getAttribute('data-selected-edge')).not.toBe('');

    await user.keyboard('{Escape}');
    expect(screen.getByTestId('react-flow').getAttribute('data-selected-edge')).toBe('');
  });

  it('keeps node and edge selection mutually exclusive', async () => {
    const user = userEvent.setup();

    render(
      <VisualDesignerPanel
        model={twoStageModel}
        canEdit
        onModelChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /mock select queue/i }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mock select edge/i }));
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    expect(screen.getByTestId('react-flow').getAttribute('data-selected-edge')).not.toBe('');

    await user.click(screen.getByRole('button', { name: /mock select queue/i }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByTestId('react-flow').getAttribute('data-selected-edge')).toBe('');
  });
});
