import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomPanel } from '../../../src/ui/execute/BottomPanel.jsx';

const mockModel = {
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer", attrDefs: [] },
    { id: "et2", name: "Server", role: "server", count: "1", attrDefs: [] },
  ],
  queues: [{ id: "q1", name: "Queue", discipline: "FIFO" }],
  bEvents: [{ id: "b1", name: "Arrival" }],
  cEvents: [{ id: "c1", name: "Assign", priority: 1 }],
};

const mockSnap = {
  clock: 10.5,
  served: 3,
  reneged: 0,
  entities: [
    { id: 1, type: "Customer", role: "customer", status: "waiting", queue: "Queue", arrivalTime: 2, attrs: {}, stages: [] },
    { id: 2, type: "Customer", role: "customer", status: "serving", queue: "Queue", arrivalTime: 1, attrs: {}, stages: [], serverId: 10 },
    { id: 10, type: "Server", role: "server", status: "busy", attrs: {} },
  ],
};

const mockLog = [
  { phase: "INIT", time: 0, seq: 1, message: "Engine initialised" },
  { phase: "A", time: 0, seq: 2, message: "Clock → t=0.000", clock: { from: 0, to: 0, dueEvents: [] } },
  { phase: "B", time: 0, seq: 3, message: `B: "Arrival"  ·  #1 (Customer) arrived → waiting [queue: Queue, depth: 1]`, event: { type: "B", id: "b1", name: "Arrival", fired: true, entityIds: [1], newEvents: [] } },
  { phase: "C", time: 0, seq: 4, message: `C: "Assign"  ·  #1 (Customer) → serving by #10 (Server)`, cEval: { eventId: "c1", eventName: "Assign", priority: 1, pass: 1, conditionTrue: true }, event: { type: "C", id: "c1", name: "Assign", fired: true, entityIds: [1, 10], newEvents: [] }, arbitration: { type: "server", serverType: "Server", discipline: "FIFO", candidates: [{ entityId: 1, type: "Customer", key: "arrivalTime", value: 0 }], idleServers: [{ serverId: 10, type: "Server" }], winner: { entityId: 1, serverId: 10 } } },
];

describe('BottomPanel — LogTab', () => {
  test('renders log entries with phase tags', () => {
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    expect(screen.getByText(/Engine initialised/i)).toBeInTheDocument();
    expect(screen.getByText(/Clock/i)).toBeInTheDocument();
  });

  test('expand button shows debug detail for entries with cEval', () => {
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    const expandButtons = screen.getAllByText('▶');
    expect(expandButtons.length).toBeGreaterThan(0);
    fireEvent.click(expandButtons[0]);
    expect(screen.getByText(/C-Eval/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Assign/i).length).toBeGreaterThan(0);
  });

  test('entity ID links in log detail call onEntitySelect', () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} onEntitySelect={onEntitySelect} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    const expandButtons = screen.getAllByText('▶');
    fireEvent.click(expandButtons[0]);
    const entityLink = screen.getByText('#1');
    fireEvent.click(entityLink);
    expect(onEntitySelect).toHaveBeenCalledWith(1);
  });

  test('node name in log message is clickable and calls onNodeSelect', () => {
    const onNodeSelect = vi.fn();
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} onNodeSelect={onNodeSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    const nodeLink = screen.getByText('Arrival');
    fireEvent.click(nodeLink);
    expect(onNodeSelect).toHaveBeenCalledWith('Arrival');
  });

  test('node filter banner shows when selectedNodeLabel is set', () => {
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} selectedNodeLabel="Queue" />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    expect(screen.getByText(/Filter: Queue/i)).toBeInTheDocument();
    expect(screen.getByText('Show all')).toBeInTheDocument();
  });

  test('Show all button clears node filter', () => {
    const onClearFilter = vi.fn();
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} selectedNodeLabel="Queue" onClearFilter={onClearFilter} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    fireEvent.click(screen.getByText('Show all'));
    expect(onClearFilter).toHaveBeenCalled();
  });
});

describe('BottomPanel — EntitiesTab', () => {
  test('renders active entities with status tags', () => {
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entity Details/i }));
    expect(screen.getByText(/2 active entities/i)).toBeInTheDocument();
    expect(screen.getByText('waiting')).toBeInTheDocument();
    expect(screen.getAllByText('In Service').length).toBeGreaterThanOrEqual(1);
  });

  test('clicking entity row calls onEntitySelect with entity ID', () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} onEntitySelect={onEntitySelect} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entity Details/i }));
    const rows = screen.getAllByText(/#1/i);
    fireEvent.click(rows[0]);
    expect(onEntitySelect).toHaveBeenCalledWith(1);
  });

  test('clicking same entity again deselects it', () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={1} onEntitySelect={onEntitySelect} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entity Details/i }));
    const rows = screen.getAllByText(/#1/i);
    fireEvent.click(rows[0]);
    expect(onEntitySelect).toHaveBeenCalledWith(null);
  });
});

describe('BottomPanel — EntityInspector', () => {
  test('inspector pane shows entity details when entity is selected', () => {
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={1} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entity Details/i }));
    const entityIds = screen.getAllByText('#1');
    expect(entityIds.length).toBeGreaterThanOrEqual(1);
    const customerTypes = screen.getAllByText('Customer');
    expect(customerTypes.length).toBeGreaterThanOrEqual(1);
    const waitingLabels = screen.getAllByText('waiting');
    expect(waitingLabels.length).toBeGreaterThanOrEqual(1);
  });

  test('inspector shows waiting age', () => {
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={1} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entity Details/i }));
    const waitingLabels = screen.getAllByText(/Waiting/i);
    expect(waitingLabels.length).toBeGreaterThanOrEqual(1);
  });

  test('inspector close button calls onEntitySelect with null', () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={1} onEntitySelect={onEntitySelect} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entity Details/i }));
    const closeBtn = screen.getByText('Clear');
    fireEvent.click(closeBtn);
    expect(onEntitySelect).toHaveBeenCalledWith(null);
  });

  test('inspector shows in-service entity with server ID', () => {
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={2} />);
    fireEvent.click(screen.getByRole('tab', { name: /Entity Details/i }));
    const entityIds = screen.getAllByText('#2');
    expect(entityIds.length).toBeGreaterThanOrEqual(1);
    const inServiceLabels = screen.getAllByText('In Service');
    expect(inServiceLabels.length).toBeGreaterThanOrEqual(1);
    const serverIds = screen.getAllByText('#10');
    expect(serverIds.length).toBeGreaterThanOrEqual(1);
  });
});

describe('BottomPanel — tab navigation', () => {
  test('all three tabs are present: Step Log, Entities, Live Metrics', () => {
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} />);
    expect(screen.getByRole('tab', { name: /Step Log/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Entity Details/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Live Metrics/i })).toBeInTheDocument();
  });
});
