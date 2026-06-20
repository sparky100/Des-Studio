import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlowDiagramReactFlow } from '../../../src/ui/visual-designer/FlowDiagramReactFlow.jsx';

// Real node/edge rendering, unlike the lighter mock used by visual-designer-panel.test.jsx —
// this exercises the actual nodeTypes/edgeTypes components (DesNode, DesEdge) so the
// error-badge tooltip (and similar per-node rendering) is verified against real markup
// rather than a stubbed <div>.
vi.mock('@xyflow/react', () => ({
  Background: () => <div data-testid="flow-background" />,
  Controls: () => <div data-testid="flow-controls" />,
  Handle: () => <span data-testid="flow-handle" />,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  MiniMap: () => <div data-testid="flow-minimap" />,
  Panel: ({ children }) => <div data-testid="flow-panel">{children}</div>,
  Position: { Left: 'left', Right: 'right' },
  SelectionMode: { Full: 'full', Partial: 'partial' },
  EdgeLabelRenderer: ({ children }) => <div data-testid="edge-label-renderer">{children}</div>,
  BaseEdge: () => <path data-testid="base-edge" />,
  getBezierPath: () => ['M0,0 L1,1', 5, 5],
  useReactFlow: () => ({
    fitView: vi.fn(),
    getNode: vi.fn(() => null),
    setCenter: vi.fn(),
    getViewport: vi.fn(() => ({ zoom: 1 })),
  }),
  ReactFlow: ({ nodes = [], edges = [], nodeTypes = {}, edgeTypes = {}, children }) => (
    <div data-testid="react-flow">
      {nodes.map(node => {
        const Comp = nodeTypes[node.type];
        return Comp ? <div key={node.id} data-node-id={node.id}><Comp data={node.data} selected={!!node.selected} /></div> : null;
      })}
      {edges.map(edge => {
        const Comp = edgeTypes[edge.type];
        return Comp ? <div key={edge.id} data-edge-id={edge.id}><Comp {...edge} /></div> : null;
      })}
      {children}
    </div>
  ),
}));

function makeGraph(overrides = {}) {
  return {
    nodes: [
      { id: 'queue:queue-1', type: 'queue', refId: 'queue-1', x: 0, y: 0, label: 'Queue 1' },
      { id: 'activity:activity-1', type: 'activity', refId: 'activity-1', x: 100, y: 0, label: 'Triage' },
    ],
    edges: [],
    sectionPanels: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

describe('FlowDiagramReactFlow — node error badge', () => {
  it('renders no error badge when the node has no validation issue', () => {
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit errorNodeIds={new Map()} />);
    expect(screen.queryByTitle(/validation issue|This node has/i)).not.toBeInTheDocument();
  });

  it('shows the specific validation message as a tooltip on the error badge', () => {
    const errorNodeIds = new Map([['queue:queue-1', ['Queue has no inbound arrival or routing.']]]);
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit errorNodeIds={errorNodeIds} />);
    expect(screen.getByTitle('Queue has no inbound arrival or routing.')).toBeInTheDocument();
  });

  it('joins multiple validation messages for the same node with a separator', () => {
    const errorNodeIds = new Map([['queue:queue-1', ['Issue one.', 'Issue two.']]]);
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit errorNodeIds={errorNodeIds} />);
    expect(screen.getByTitle('Issue one. · Issue two.')).toBeInTheDocument();
  });

  it('falls back to a generic message when errorNodeIds has no messages for the node', () => {
    const errorNodeIds = new Map([['queue:queue-1', []]]);
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit errorNodeIds={errorNodeIds} />);
    expect(screen.getByTitle(/This node has a validation issue/i)).toBeInTheDocument();
  });

  it('only badges the node referenced by errorNodeIds, not other nodes', () => {
    const errorNodeIds = new Map([['queue:queue-1', ['Queue issue.']]]);
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit errorNodeIds={errorNodeIds} />);
    const queueNode = screen.getByTestId('react-flow').querySelector('[data-node-id="queue:queue-1"]');
    const activityNode = screen.getByTestId('react-flow').querySelector('[data-node-id="activity:activity-1"]');
    expect(queueNode.querySelector('[title="Queue issue."]')).toBeTruthy();
    expect(activityNode.querySelector('[title="Queue issue."]')).toBeNull();
  });
});
