import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowDiagramReactFlow } from '../../../src/ui/visual-designer/FlowDiagramReactFlow.jsx';

// Captures the props of the latest <ReactFlow> render so tests can assert
// configuration (selectionKeyCode, snapToGrid, node positions) and drive the
// interaction handlers (onNodeClick, onNodesChange, onNodeDragStop) directly.
const latestFlowProps = vi.hoisted(() => ({ current: null }));

// Controllable stand-in for React Flow's internal zustand store, so the
// SelectionRectSuppressor's subscription can be exercised.
const mockStore = vi.hoisted(() => {
  const listeners = new Set();
  return {
    state: { nodesSelectionActive: false },
    getState() { return this.state; },
    setState: null, // assigned in the factory below (needs vi.fn())
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    emit(partial) {
      this.state = { ...this.state, ...partial };
      listeners.forEach(l => l(this.state));
    },
    reset() { this.state = { nodesSelectionActive: false }; listeners.clear(); },
  };
});

// Real node/edge rendering, unlike the lighter mock used by visual-designer-panel.test.jsx —
// this exercises the actual nodeTypes/edgeTypes components (DesNode, DesEdge) so the
// error-badge tooltip (and similar per-node rendering) is verified against real markup
// rather than a stubbed <div>.
vi.mock('../../../src/ui/shared/xyflow.js', () => ({
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
  getSmoothStepPath: ({ centerY }) => [`M0,0 L1,${centerY ?? 1}`, 5, centerY ?? 5],
  useReactFlow: () => ({
    fitView: vi.fn(),
    getNode: vi.fn(() => null),
    setCenter: vi.fn(),
    getViewport: vi.fn(() => ({ zoom: 1 })),
  }),
  useStoreApi: () => mockStore,
  ReactFlow: (props) => {
    latestFlowProps.current = props;
    const { nodes = [], edges = [], nodeTypes = {}, edgeTypes = {}, children } = props;
    return (
      <div data-testid="react-flow">
        {nodes.map(node => {
          const Comp = nodeTypes[node.type];
          return Comp ? <div key={node.id} data-node-id={node.id} data-x={node.position?.x} data-y={node.position?.y} style={node.style}><Comp data={node.data} selected={!!node.selected} /></div> : null;
        })}
        {edges.map(edge => {
          const Comp = edgeTypes[edge.type];
          return Comp ? <div key={edge.id} data-edge-id={edge.id}><Comp {...edge} /></div> : null;
        })}
        {children}
      </div>
    );
  },
}));

beforeEach(() => {
  latestFlowProps.current = null;
  mockStore.setState = vi.fn(partial => { mockStore.state = { ...mockStore.state, ...partial }; });
  mockStore.reset();
});

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

function makeSectionedGraph() {
  return {
    nodes: [
      { id: 'queue:queue-1', type: 'queue', refId: 'queue-1', x: 0, y: 0, label: 'Queue 1', sectionId: 'sec-a' },
      { id: 'queue:queue-2', type: 'queue', refId: 'queue-2', x: 100, y: 0, label: 'Queue 2', sectionId: 'sec-b' },
    ],
    edges: [],
    sectionPanels: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe('FlowDiagramReactFlow — node search', () => {
  it('dims nodes outside the matched set and keeps matches at full opacity', () => {
    render(
      <FlowDiagramReactFlow
        graph={makeSectionedGraph()}
        canEdit
        matchedNodeIds={new Set(['queue:queue-1'])}
      />
    );
    const matched = screen.getByTestId('react-flow').querySelector('[data-node-id="queue:queue-1"]');
    const other = screen.getByTestId('react-flow').querySelector('[data-node-id="queue:queue-2"]');
    expect(matched.style.opacity).toBe('1');
    expect(other.style.opacity).toBe('0.15');
  });

  it('leaves nodes at full opacity when matchedNodeIds is empty', () => {
    render(
      <FlowDiagramReactFlow
        graph={makeSectionedGraph()}
        canEdit
        matchedNodeIds={new Set()}
      />
    );
    const node = screen.getByTestId('react-flow').querySelector('[data-node-id="queue:queue-1"]');
    expect(node.style.opacity).toBe('1');
  });

  it('exposes focusSectionRef so external search UI can expand a node\'s section, dimming other sections', () => {
    const focusSectionRef = { current: null };
    render(
      <FlowDiagramReactFlow
        graph={makeSectionedGraph()}
        canEdit
        showSections
        focusSectionRef={focusSectionRef}
      />
    );
    expect(typeof focusSectionRef.current).toBe('function');

    act(() => focusSectionRef.current('sec-b'));

    const nodeInOtherSection = screen.getByTestId('react-flow').querySelector('[data-node-id="queue:queue-1"]');
    const nodeInFocusedSection = screen.getByTestId('react-flow').querySelector('[data-node-id="queue:queue-2"]');
    expect(nodeInOtherSection.style.opacity).toBe('0.15');
    expect(nodeInFocusedSection.style.opacity).toBe('1');
  });
});

function makeProbabilisticGraph() {
  return {
    nodes: [
      { id: 'activity:activity-1', type: 'activity', refId: 'activity-1', x: 0, y: 0, label: 'Triage' },
      { id: 'queue:queue-2', type: 'queue', refId: 'queue-2', x: 100, y: 0, label: 'Queue 2' },
    ],
    edges: [
      {
        id: 'edge-1',
        from: 'activity:activity-1',
        to: 'queue:queue-2',
        source: 'routing',
        label: '70%',
        bEventId: 'route-1',
        branchIndex: 0,
        probability: 0.7,
      },
    ],
    sectionPanels: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

// The inline "%" quick-editor (Sprint 89) was replaced by RouteEdgeDialog — a single
// click on a routing/terminal edge now opens the full dialog (see VisualDesignerPanel's
// selectEdge/RouteEdgeDialog) instead of an inline input rendered by this component.
// FlowDiagramReactFlow's job for a probabilistic branch edge is now just to render the
// static "NN%" label, whether or not the edge is selected.
describe('FlowDiagramReactFlow — probabilistic-branch % label', () => {
  it('shows the static % label when the edge is unselected', () => {
    render(<FlowDiagramReactFlow graph={makeProbabilisticGraph()} canEdit />);
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('still shows the static % label (no inline input) when the edge is selected', () => {
    render(<FlowDiagramReactFlow graph={makeProbabilisticGraph()} canEdit selectedEdgeId="edge-1" />);
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('never shows an inline input when canEdit is false, even if selected', () => {
    render(<FlowDiagramReactFlow graph={makeProbabilisticGraph()} canEdit={false} selectedEdgeId="edge-1" />);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
  });
});

// An activity's outgoing route (routing/terminal edge) opens the RouteEdgeDialog
// on click, which now owns deletion (a "Delete connection" button in "none" mode,
// or per-branch "x" rows otherwise) — so the inline canvas delete button must not
// also appear for these edges, to avoid two competing ways to delete on one click.
// Edges from other sources (e.g. Queue -> Activity "condition" edges) are untouched.
describe('FlowDiagramReactFlow — delete button suppressed for activity routing/terminal edges', () => {
  function makeMixedGraph() {
    return {
      nodes: [
        { id: 'queue:queue-1', type: 'queue', refId: 'queue-1', x: 0, y: 0, label: 'Queue 1' },
        { id: 'activity:activity-1', type: 'activity', refId: 'activity-1', x: 100, y: 0, label: 'Triage' },
        { id: 'queue:queue-2', type: 'queue', refId: 'queue-2', x: 200, y: 0, label: 'Queue 2' },
      ],
      edges: [
        { id: 'condition-edge', from: 'queue:queue-1', to: 'activity:activity-1', source: 'condition' },
        { id: 'routing-edge', from: 'activity:activity-1', to: 'queue:queue-2', source: 'routing' },
      ],
      sectionPanels: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }

  it('does not show the inline delete button on a selected activity routing edge', () => {
    render(<FlowDiagramReactFlow graph={makeMixedGraph()} canEdit selectedEdgeId="routing-edge" onDeleteEdge={vi.fn()} />);
    const routingEdgeEl = screen.getByTestId('react-flow').querySelector('[data-edge-id="routing-edge"]');
    expect(routingEdgeEl.querySelector('button[title^="Delete connection"]')).toBeNull();
  });

  it('still shows the inline delete button on a selected non-activity-route edge (e.g. condition)', () => {
    render(<FlowDiagramReactFlow graph={makeMixedGraph()} canEdit selectedEdgeId="condition-edge" onDeleteEdge={vi.fn()} />);
    const conditionEdgeEl = screen.getByTestId('react-flow').querySelector('[data-edge-id="condition-edge"]');
    expect(conditionEdgeEl.querySelector('button[title^="Delete connection"]')).not.toBeNull();
  });

  it('still suppresses the routing edge delete button even when canEdit is true and it is a terminal (Activity->Sink) edge', () => {
    const graph = {
      nodes: [
        { id: 'activity:activity-1', type: 'activity', refId: 'activity-1', x: 0, y: 0, label: 'Triage' },
        { id: 'sink:sink-1', type: 'sink', refId: 'sink-1', x: 100, y: 0, label: 'Done' },
      ],
      edges: [{ id: 'terminal-edge', from: 'activity:activity-1', to: 'sink:sink-1', source: 'terminal' }],
      sectionPanels: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    render(<FlowDiagramReactFlow graph={graph} canEdit selectedEdgeId="terminal-edge" onDeleteEdge={vi.fn()} />);
    const terminalEdgeEl = screen.getByTestId('react-flow').querySelector('[data-edge-id="terminal-edge"]');
    expect(terminalEdgeEl.querySelector('button[title^="Delete connection"]')).toBeNull();
  });
});

// "Run size" ghosts show each object's Run-canvas footprint (160 wide,
// per-type heights) behind the Draw card; the amber overlap badge marks nodes
// whose Run footprints collide. Both are advisory — see runFootprint.js.
describe('FlowDiagramReactFlow — run footprint ghosts and overlap badges', () => {
  it('renders a ghost per node with per-type Run dimensions when showRunFootprint is on', () => {
    const { container } = render(
      <FlowDiagramReactFlow graph={makeGraph()} canEdit showRunFootprint />
    );
    const ghosts = container.querySelectorAll('.run-footprint-ghost');
    expect(ghosts.length).toBe(2);
    const sizes = [...ghosts].map(g => `${g.style.width}x${g.style.height}`).sort();
    expect(sizes).toEqual(['160pxx120px', '160pxx145px']); // queue 120, activity 145
  });

  it('renders no ghosts when showRunFootprint is off', () => {
    const { container } = render(<FlowDiagramReactFlow graph={makeGraph()} canEdit />);
    expect(container.querySelectorAll('.run-footprint-ghost').length).toBe(0);
  });

  it('shows the amber overlap badge only on nodes in overlapNodeIds', () => {
    render(
      <FlowDiagramReactFlow
        graph={makeGraph()}
        canEdit
        overlapNodeIds={new Set(['queue:queue-1'])}
      />
    );
    const badges = screen.getAllByTitle(/Overlaps another object on the Run canvas/i);
    expect(badges.length).toBe(1);
  });

  it('shows no overlap badges when overlapNodeIds is empty or absent', () => {
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit overlapNodeIds={new Set()} />);
    expect(screen.queryByTitle(/Overlaps another object on the Run canvas/i)).not.toBeInTheDocument();
  });
});

// A rework/loop-back edge (Activity -> earlier Queue) is routed through a
// dedicated rail below all nodes (see loopEdgeRouting.js) instead of the
// default bezier used for every other edge — geometry itself is covered by
// tests/ui/visual-designer/loop-edge-routing.test.js's pure-function tests,
// so this stays a light "still renders, still labeled" smoke check.
describe('FlowDiagramReactFlow — rework/loop-back edge rendering', () => {
  it('renders a loop edge with its rework label and does not crash', () => {
    const graph = makeGraph({
      edges: [{ id: 'loop-1', from: 'activity:activity-1', to: 'queue:queue-1', loop: true, maxLoopCount: 3 }],
    });
    const { container } = render(<FlowDiagramReactFlow graph={graph} canEdit />);
    expect(screen.getByText(/rework \(max 3x\)/i)).toBeInTheDocument();
    expect(container.querySelector('[data-edge-id="loop-1"]')).toBeInTheDocument();
  });
});

// Item 2 of the b7be68c UX batch: box-drag selections must behave exactly like
// click-built ones. Two library defaults broke that — selectionKeyCode='Shift'
// hijacked Shift+click on a node (wiping the selection before onNodeClick's
// toggle ran), and the post-box-drag nodes-selection overlay swallowed clicks
// in the gaps between selected nodes so empty space couldn't clear it.
describe('FlowDiagramReactFlow — box-drag selection parity', () => {
  it('disables the Shift rubber-band key so Shift+click reaches onNodeClick', () => {
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit />);
    expect(latestFlowProps.current.selectionKeyCode).toBeNull();
    // Box-drag selection itself must survive via selectionOnDrag.
    expect(latestFlowProps.current.selectionOnDrag).toBe(true);
  });

  it('Shift+click on a node toggles it via onNodeSelect, like Ctrl/Cmd+click', () => {
    const onNodeSelect = vi.fn();
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit onNodeSelect={onNodeSelect} />);
    act(() => latestFlowProps.current.onNodeClick({ shiftKey: true }, { id: 'queue:queue-1', type: 'desNode' }));
    expect(onNodeSelect).toHaveBeenCalledWith('queue:queue-1', { toggle: true });
    act(() => latestFlowProps.current.onNodeClick({}, { id: 'queue:queue-1', type: 'desNode' }));
    expect(onNodeSelect).toHaveBeenLastCalledWith('queue:queue-1', { toggle: false });
  });

  it('flips the post-box-drag nodesSelectionActive overlay back off whenever it turns on', () => {
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit />);
    expect(mockStore.setState).not.toHaveBeenCalled();
    act(() => mockStore.emit({ nodesSelectionActive: true }));
    expect(mockStore.setState).toHaveBeenCalledWith({ nodesSelectionActive: false });
  });

  it('suppresses an overlay that is already active at mount time', () => {
    mockStore.state = { nodesSelectionActive: true };
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit />);
    expect(mockStore.setState).toHaveBeenCalledWith({ nodesSelectionActive: false });
  });

  it('documents Shift/Ctrl-click selection toggling in the ? Keys panel', () => {
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit />);
    act(() => { screen.getByRole('button', { name: '? Keys' }).click(); });
    expect(screen.getByText(/add or remove a node from the selection/i)).toBeInTheDocument();
  });
});

// Item 3 of the b7be68c UX batch: alignment guides shipped but never appeared.
// Nodes are fully controlled and onNodesChange used to discard position
// changes, so a dragged node never moved until drop — guides computed against
// a phantom position with no node next to them — and snapToGrid's 24-unit
// steps could never land inside the guides' 6-screen-px window.
describe('FlowDiagramReactFlow — live drag positions', () => {
  it('moves the dragged node in the controlled nodes prop while dragging', () => {
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit />);
    const before = latestFlowProps.current.nodes.find(n => n.id === 'queue:queue-1');
    expect(before.position).toEqual({ x: 0, y: 0 });

    act(() => latestFlowProps.current.onNodesChange([
      { type: 'position', id: 'queue:queue-1', position: { x: 37, y: 53 }, dragging: true },
    ]));

    const during = latestFlowProps.current.nodes.find(n => n.id === 'queue:queue-1');
    expect(during.position).toEqual({ x: 37, y: 53 });
    // Other nodes keep their graph-derived positions.
    expect(latestFlowProps.current.nodes.find(n => n.id === 'activity:activity-1').position).toEqual({ x: 100, y: 0 });
  });

  it('ignores position changes that are not part of an active drag', () => {
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit />);
    act(() => latestFlowProps.current.onNodesChange([
      { type: 'position', id: 'queue:queue-1', position: { x: 37, y: 53 }, dragging: false },
    ]));
    expect(latestFlowProps.current.nodes.find(n => n.id === 'queue:queue-1').position).toEqual({ x: 0, y: 0 });
  });

  it('clears the live override on drag stop and commits through onNodesMove', () => {
    const onNodesMove = vi.fn();
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit onNodesMove={onNodesMove} />);
    act(() => latestFlowProps.current.onNodesChange([
      { type: 'position', id: 'queue:queue-1', position: { x: 37, y: 53 }, dragging: true },
    ]));

    const dropped = { id: 'queue:queue-1', type: 'desNode', position: { x: 37, y: 53 } };
    act(() => latestFlowProps.current.onNodeDragStop({}, dropped, []));

    // Override cleared — position falls back to the (unchanged) graph value.
    expect(latestFlowProps.current.nodes.find(n => n.id === 'queue:queue-1').position).toEqual({ x: 0, y: 0 });
    expect(onNodesMove).toHaveBeenCalledTimes(1);
    const [positions] = onNodesMove.mock.calls[0];
    expect(positions).toHaveLength(1);
    expect(positions[0].id).toBe('queue:queue-1');
  });

  it('snaps a single dropped node to a nearby neighbour edge via the alignment snap', () => {
    const onNodesMove = vi.fn();
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit onNodesMove={onNodesMove} />);
    // activity-1 sits at x=100; drop queue-1 at x=103 — inside the 6px window at zoom 1.
    const dropped = { id: 'queue:queue-1', type: 'desNode', position: { x: 103, y: 300 } };
    act(() => latestFlowProps.current.onNodeDragStop({}, dropped, []));
    expect(onNodesMove).toHaveBeenCalledWith([{ id: 'queue:queue-1', x: 100, y: 300 }]);
  });

  it('no longer forces 24px grid snapping (alignment snap is the only snap)', () => {
    render(<FlowDiagramReactFlow graph={makeGraph()} canEdit />);
    expect(latestFlowProps.current.snapToGrid).toBeUndefined();
    expect(latestFlowProps.current.snapGrid).toBeUndefined();
  });
});
