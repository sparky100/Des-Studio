/**
 * F9B.6 Part A — Regression tests for Sprint 9B exit gate.
 *
 * Five round-trip scenarios that were not covered by the existing suite:
 *   1. Visual Designer Source→Queue→Activity→Sink round-trip through export/reload
 *   2. Forms/Tabs inter-arrival edit reflected in Visual Designer Source inspector
 *   3. Visual Designer Activity service-time edit reflected in model cSchedules
 *   4. Execute blocked and error panel visible when model has a validation error
 *   5. Node deletion with dependents leaves model without stale references
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pure-function imports
import {
  addVisualNode,
  deleteVisualNode,
  findNodeDependents,
  updateVisualNode,
} from '../../../src/ui/visual-designer/graph-operations.js';
import { deriveGraphFromModel } from '../../../src/ui/visual-designer/graph.js';
import { validateModel } from '../../../src/engine/validation.js';
import { buildModelExportPayload } from '../../../src/ui/ModelDetail.jsx';

// UI-component imports (tests 2 and 4 only)
import { VisualDesignerPanel } from '../../../src/ui/visual-designer/VisualDesignerPanel.jsx';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFetchRunHistory   = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockRunReplications   = vi.hoisted(() => vi.fn());
const mockStreamNarrative   = vi.hoisted(() => vi.fn());

vi.mock('@xyflow/react', () => ({
  Background:   () => null,
  Controls:     () => null,
  Handle:       () => <span />,
  MarkerType:   { ArrowClosed: 'arrowclosed' },
  MiniMap:      () => null,
  Panel:        ({ children }) => <div>{children}</div>,
  Position:     { Left: 'left', Right: 'right' },
  useReactFlow: () => ({ fitView: vi.fn() }),
  ReactFlow: ({ nodes = [], children, onNodeClick }) => {
    const source = nodes.find(n => n.id.startsWith('source:'));
    return (
      <div data-testid="react-flow" data-node-count={nodes.length}>
        {children}
        {source && (
          <button type="button" onClick={() => onNodeClick?.({}, source)}>
            Select source node
          </button>
        )}
      </div>
    );
  },
}));

vi.mock('../../../src/db/models.js', () => ({
  fetchRunHistory:   mockFetchRunHistory,
  saveSimulationRun: mockSaveSimulationRun,
  fetchUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  saveUserSettings:  vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
}));

vi.mock('../../../src/engine/replication-runner.js', () => ({
  runReplications: mockRunReplications,
}));

vi.mock('../../../src/llm/apiClient.js', () => ({
  streamNarrative: mockStreamNarrative,
}));

// ── Shared fixtures ────────────────────────────────────────────────────────────
// A fully-connected single-stage model usable by pure-function tests.
const connectedModel = {
  id: 'connected-model',
  entityTypes: [
    { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
    { id: 'server', name: 'Server', role: 'server', count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  queues: [
    { id: 'q1', name: 'Main Queue', customerType: 'Customer', discipline: 'FIFO' },
  ],
  bEvents: [
    {
      id: 'arrival',
      name: 'Customer Arrival',
      scheduledTime: '0',
      effect: 'ARRIVE(Customer, Main Queue)',
      schedules: [],
    },
    {
      id: 'complete',
      name: 'Service Complete',
      scheduledTime: '9999',
      effect: 'COMPLETE()',
      schedules: [],
    },
  ],
  cEvents: [
    {
      id: 'start-service',
      name: 'Start Service',
      priority: 1,
      condition: 'queue(Main Queue).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Main Queue, Server)',
      cSchedules: [{ eventId: 'complete', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
    },
  ],
};

// Variant with a custom inter-arrival schedule (simulating a Forms/Tabs edit).
const modelWithCustomRate = {
  ...connectedModel,
  bEvents: [
    {
      ...connectedModel.bEvents[0],
      schedules: [
        { eventId: 'arrival', dist: 'Exponential', distParams: { mean: '9' }, useEntityCtx: false },
      ],
    },
    connectedModel.bEvents[1],
  ],
};

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('F9B.6 Sprint 9B round-trip regression', () => {
  beforeEach(() => {
    mockSaveSimulationRun.mockReset();
    mockFetchRunHistory.mockReset();
    mockRunReplications.mockReset();
    mockSaveSimulationRun.mockResolvedValue(undefined);
    mockFetchRunHistory.mockResolvedValue([]);
  });

  // ── Test 1: Visual Designer round-trip ─────────────────────────────────────
  it('1. Source→Queue→Activity→Sink built in Visual Designer survives export/reload with identical structure', () => {
    // Build a minimal model via the same addVisualNode path the UI uses
    let m = { entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [] };
    m = addVisualNode(m, 'queue');
    m = addVisualNode(m, 'source');
    m = addVisualNode(m, 'activity');
    m = addVisualNode(m, 'sink');

    const before = deriveGraphFromModel(m);
    expect(before.nodes.some(n => n.type === 'source')).toBe(true);
    expect(before.nodes.some(n => n.type === 'queue')).toBe(true);
    expect(before.nodes.some(n => n.type === 'activity')).toBe(true);
    expect(before.nodes.some(n => n.type === 'sink')).toBe(true);

    // Simulate save → export payload → re-import
    const payload = buildModelExportPayload(m, '2026-05-07T00:00:00.000Z');
    const reloaded = payload.model_json;
    const after = deriveGraphFromModel(reloaded);

    // Graph structure must be identical after reload
    expect(after.nodes.length).toBe(before.nodes.length);
    expect(after.edges.length).toBe(before.edges.length);

    // No stale B-event references (V6) in the reloaded model
    const { errors } = validateModel(reloaded);
    expect(errors.filter(e => e.code === 'V6')).toHaveLength(0);
  });

  // ── Test 2: Forms/Tabs → Visual Designer data sync ─────────────────────────
  it('2. Inter-arrival rate set in Forms/Tabs is reflected in Visual Designer Source inspector', async () => {
    const user = userEvent.setup();

    // modelWithCustomRate has mean=9 on the arrival bEvent (simulating a Forms/Tabs edit)
    render(
      <VisualDesignerPanel
        model={modelWithCustomRate}
        canEdit
        onModelChange={vi.fn()}
      />
    );

    // Select the source node via the mock canvas button
    await user.click(screen.getByRole('button', { name: /select source node/i }));

    // The Source inspector reads from bEvent.schedules[0].distParams.mean — must show "9"
    expect(screen.getByDisplayValue('9')).toBeInTheDocument();
  });

  // ── Test 3: Visual Designer → Forms/Tabs data sync ─────────────────────────
  it('3. Service time edited via Visual Designer Activity inspector is written to cSchedules', () => {
    const graph = deriveGraphFromModel(connectedModel);
    const activityNode = graph.nodes.find(n => n.type === 'activity');
    expect(activityNode).toBeDefined();

    // Patch service time exactly as the inspector's DistPicker onChange does
    const updated = updateVisualNode(connectedModel, activityNode, {
      serviceTime: { dist: 'Exponential', distParams: { mean: '7' } },
    });

    // The C-event's first cSchedule is what the Forms/Tabs C-Event editor displays
    const updatedCEvent = updated.cEvents.find(ce => ce.id === activityNode.refId);
    expect(updatedCEvent.cSchedules[0].dist).toBe('Exponential');
    expect(updatedCEvent.cSchedules[0].distParams.mean).toBe('7');

    // validateModel must not gain new errors from this change
    const { errors } = validateModel(updated);
    expect(errors.filter(e => ['V6', 'V9'].includes(e.code))).toHaveLength(0);
  });

  // ── Test 4: Execute blocked by validation error ────────────────────────────
  it('4. Run All is disabled and the error panel is visible when the model has a blocking validation error', () => {
    const invalidModel = {
      entityTypes: [
        { id: 'e1', name: '', role: 'customer', attrDefs: [] }, // V1: empty entity name
      ],
      stateVariables: [],
      bEvents: [],
      cEvents: [],
      queues: [],
    };

    render(
      <ExecutePanel model={invalidModel} modelId="model-1" userId="user-1" />
    );

    expect(screen.getByRole('button', { name: /run all/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('V1');
  });

  // ── Test 5: Delete node with dependents → coherent model ──────────────────
  it('5. Deleting a queue node with C-event dependents leaves no stale queue references', () => {
    const graph = deriveGraphFromModel(connectedModel);
    const queueNode = graph.nodes.find(n => n.type === 'queue');
    expect(queueNode).toBeDefined();

    // The queue has dependents (the C-event that conditions on it)
    const deps = findNodeDependents(connectedModel, queueNode);
    expect(deps.length).toBeGreaterThan(0);

    // Cascade delete
    const cleaned = deleteVisualNode(connectedModel, queueNode);

    // No C-event should reference the deleted queue name anymore
    const { errors } = validateModel(cleaned);
    expect(errors.filter(e => e.code === 'V9')).toHaveLength(0);
    expect(errors.filter(e => e.code === 'V6')).toHaveLength(0);

    // The graph derived from the cleaned model has no orphaned nodes referencing Main Queue
    const cleanedGraph = deriveGraphFromModel(cleaned);
    const nodesWithMainQueue = cleanedGraph.nodes.filter(
      n => (n.label || '').includes('Main Queue') || (n.sublabel || '').includes('Main Queue')
    );
    expect(nodesWithMainQueue).toHaveLength(0);
  });
});
