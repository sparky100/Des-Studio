import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import { NodeDetailSidebar } from "../../../src/ui/execute/NodeDetailSidebar.jsx";
import { ThemeProvider } from "../../../src/ui/shared/ThemeContext.jsx";

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeSnap({ clock = 10.5, entities = [], served = 0 } = {}) {
  return { clock, entities, served };
}

function makeQueueSnap({ clock = 10.5, queueEntities = [] } = {}) {
  const entities = queueEntities.map((e, i) => ({
    id: e.id ?? i + 1,
    type: e.type || "Customer",
    status: "waiting",
    queue: e.queue || "Queue",
    arrivalTime: e.arrivalTime ?? (2 + i * 2),
    waitingSince: e.waitingSince ?? (2 + i * 2),
    attrs: e.attrs || {},
    role: "customer",
  }));
  return makeSnap({ clock, entities });
}

function makeActivitySnap({ clock = 15.0, servers = [] } = {}) {
  const entities = servers.map((s, i) => ({
    id: i + 1,
    type: s.type || "Server",
    role: "server",
    status: s.status || "idle",
    currentCustId: s.currentCustId ?? null,
    _busyTime: s.busyTime ?? 0,
    _starvationTime: s.starvationTime ?? 0,
    _downtime: s.downtime ?? 0,
    _scheduledDuration: s.scheduledDuration ?? null,
    _busyStart: s.serviceStart ?? null,
    _suspended: s._suspended ?? false,
  }));
  // Add customer entities for busy servers
  if (servers.some(s => s.currentCustId != null)) {
    const custIds = servers.filter(s => s.currentCustId != null).map(s => s.currentCustId);
    custIds.forEach(cid => {
      entities.push({
        id: cid,
        type: "Customer",
        role: "customer",
        status: "busy",
        arrivalTime: 3.0,
      });
    });
  }
  return makeSnap({ clock, entities });
}

const mockModel = {
  queues: [{ name: "Queue", discipline: "FIFO", capacity: "5" }],
  cEvents: [{ id: "ce-1", effect: [{ macro: "ASSIGN", args: ["Queue", "Server"] }] }],
  entityTypes: [{ name: "Server", role: "server", count: "3" }],
};

const mockServerTypeIndex = new Map([
  ["ce-1", { serverTypes: ["Server"], capacities: [3] }],
]);

const mockCoseizeServerTypeIndex = new Map([
  ["ce-2", { serverTypes: ["Surgeon", "Anesthetist"], capacities: [2, 1] }],
]);

describe("NodeDetailSidebar", () => {
  test("renders nothing when no node selected", () => {
    const { container } = renderWithTheme(
      <NodeDetailSidebar selectedNode={null} onClose={vi.fn()} snap={null} serverTypeIndex={new Map()} model={{}} />
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders queue detail sidebar with header", () => {
    const snap = makeQueueSnap({
      queueEntities: [
        { id: 1, type: "Customer", arrivalTime: 2.0, waitingSince: 2.0 },
        { id: 2, type: "Customer", arrivalTime: 4.0, waitingSince: 4.0, attrs: { priority: 3 } },
        { id: 3, type: "VIP", arrivalTime: 6.0, waitingSince: 6.0 },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={new Map()}
        model={mockModel}
      />
    );
    expect(screen.getByText("Queue Members")).toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("FIFO")).toBeInTheDocument();
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
  });

  test("shows queue entities sorted by arrival time (FIFO)", () => {
    const snap = makeQueueSnap({
      queueEntities: [
        { id: 1, type: "Customer", arrivalTime: 2.0, waitingSince: 2.0 },
        { id: 2, type: "Customer", arrivalTime: 4.0, waitingSince: 4.0 },
        { id: 3, type: "VIP", arrivalTime: 6.0, waitingSince: 6.0 },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={new Map()}
        model={mockModel}
      />
    );
    expect(screen.getAllByText(/#\d/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Customer").length).toBe(2);
    expect(screen.getByText("VIP")).toBeInTheDocument();
  });

  test("shows wait times for queue entities", () => {
    const snap = makeQueueSnap({
      clock: 10.5,
      queueEntities: [
        { id: 1, type: "Customer", arrivalTime: 2.0, waitingSince: 2.0 },
        { id: 2, type: "Customer", arrivalTime: 4.0, waitingSince: 4.0 },
        { id: 3, type: "VIP", arrivalTime: 6.0, waitingSince: 6.0 },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={new Map()}
        model={mockModel}
      />
    );
    expect(screen.getByText("t=8.5")).toBeInTheDocument();
    expect(screen.getByText("t=6.5")).toBeInTheDocument();
    expect(screen.getByText("t=4.5")).toBeInTheDocument();
  });

  test("shows priority badge when entity has priority attribute", () => {
    const snap = makeQueueSnap({
      queueEntities: [
        { id: 2, type: "Customer", arrivalTime: 4.0, waitingSince: 4.0, attrs: { priority: 3 } },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={new Map()}
        model={mockModel}
      />
    );
    expect(screen.getByText("P=3")).toBeInTheDocument();
  });

  test("shows empty queue message when no entities", () => {
    const snap = makeQueueSnap({ queueEntities: [] });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "EmptyQueue" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={new Map()}
        model={{ queues: [{ name: "EmptyQueue", discipline: "FIFO" }] }}
      />
    );
    expect(screen.getByText("Queue is empty")).toBeInTheDocument();
  });

  test("renders activity detail sidebar with header", () => {
    const snap = makeActivitySnap({
      servers: [
        { type: "Server", status: "busy", currentCustId: 10, busyTime: 8.0, serviceStart: 10.0, scheduledDuration: 5.0 },
        { type: "Server", status: "busy", currentCustId: 11, busyTime: 6.0, serviceStart: 12.0, scheduledDuration: 4.0 },
        { type: "Server", status: "idle", busyTime: 4.0, starvationTime: 3.0 },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "ServiceActivity", refId: "ce-1" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={mockServerTypeIndex}
        model={mockModel}
      />
    );
    expect(screen.getByText("Server Pool")).toBeInTheDocument();
    expect(screen.getByText("ServiceActivity")).toBeInTheDocument();
    expect(screen.getByText("Server")).toBeInTheDocument();
  });

  test("shows server pool stats", () => {
    const snap = makeActivitySnap({
      servers: [
        { type: "Server", status: "busy", busyTime: 8.0 },
        { type: "Server", status: "busy", busyTime: 6.0 },
        { type: "Server", status: "idle", busyTime: 4.0 },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "ServiceActivity", refId: "ce-1" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={mockServerTypeIndex}
        model={mockModel}
      />
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  test("shows utilisation bar and percentage", () => {
    const snap = makeActivitySnap({
      servers: [
        { type: "Server", status: "busy", busyTime: 8.0 },
        { type: "Server", status: "busy", busyTime: 6.0 },
        { type: "Server", status: "idle", busyTime: 4.0 },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "ServiceActivity", refId: "ce-1" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={mockServerTypeIndex}
        model={mockModel}
      />
    );
    expect(screen.getByText(/Utilisation: 67%/)).toBeInTheDocument();
  });

  test("shows busy server details with customer info", () => {
    const snap = makeActivitySnap({
      servers: [
        { type: "Server", status: "busy", currentCustId: 10, busyTime: 8.0, serviceStart: 10.0, scheduledDuration: 5.0 },
        { type: "Server", status: "idle", busyTime: 4.0 },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "ServiceActivity", refId: "ce-1" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={mockServerTypeIndex}
        model={mockModel}
      />
    );
    expect(screen.getByText("Server #1")).toBeInTheDocument();
    expect(screen.getAllByText("busy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Serving/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("#10")).toBeInTheDocument();
  });

  test("shows idle server with starvation time", () => {
    const snap = makeActivitySnap({
      servers: [
        { type: "Server", status: "idle", busyTime: 4.0, starvationTime: 3.0 },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "ServiceActivity", refId: "ce-1" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={mockServerTypeIndex}
        model={mockModel}
      />
    );
    expect(screen.getByText("Server #1")).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(screen.getByText("Starvation: t=3.0")).toBeInTheDocument();
  });

  test("shows suspended servers in separate section with shift change label", () => {
    const snap = makeActivitySnap({
      servers: [
        { type: "Server", status: "busy", busyTime: 5.0, currentCustId: 10, serviceStart: 8.0, scheduledDuration: 4.0 },
        { type: "Server", status: "idle", busyTime: 2.0, starvationTime: 0 },
        { type: "Server", status: "busy", busyTime: 3.0, _suspended: true, currentCustId: 11, serviceStart: 5.0, scheduledDuration: 6.0 },
        { type: "Server", status: "idle", busyTime: 1.0, _suspended: true, starvationTime: 0 },
      ],
    });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "ServiceActivity", refId: "ce-1" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={mockServerTypeIndex}
        model={mockModel}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Suspended (shift change)")).toBeInTheDocument();
    expect(screen.getAllByText("suspended").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Suspended by shift change")).toBeInTheDocument();
    expect(screen.getAllByText("busy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("idle").length).toBeGreaterThanOrEqual(1);
  });

  test("calls onClose when close button clicked", () => {
    const snap = makeQueueSnap({ queueEntities: [] });
    const onClose = vi.fn();
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue" }}
        onClose={onClose}
        snap={snap}
        serverTypeIndex={new Map()}
        model={mockModel}
      />
    );
    fireEvent.click(screen.getByText(/Close/));
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onClose when Escape key pressed", () => {
    const snap = makeQueueSnap({ queueEntities: [] });
    const onClose = vi.fn();
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue" }}
        onClose={onClose}
        snap={snap}
        serverTypeIndex={new Map()}
        model={mockModel}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onEntitySelect when entity clicked in queue", () => {
    const snap = makeQueueSnap({
      queueEntities: [{ id: 1, type: "Customer", arrivalTime: 2.0, waitingSince: 2.0 }],
    });
    const onEntitySelect = vi.fn();
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={new Map()}
        model={mockModel}
        onEntitySelect={onEntitySelect}
      />
    );
    const entityRow = screen.getByTitle("Click to inspect entity #1");
    fireEvent.click(entityRow);
    expect(onEntitySelect).toHaveBeenCalledWith(1);
  });

  test("renders a separate resource row per server type for COSEIZE activities", () => {
    const entities = [
      { id: 1, type: "Surgeon", role: "server", status: "busy", currentCustId: 100, _busyTime: 5 },
      { id: 2, type: "Surgeon", role: "server", status: "idle", _busyTime: 2 },
      { id: 3, type: "Anesthetist", role: "server", status: "busy", currentCustId: 100, _busyTime: 5 },
      { id: 100, type: "Patient", role: "customer", status: "busy", arrivalTime: 3.0 },
    ];
    const snap = makeSnap({ clock: 15.0, entities });
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "Surgery", refId: "ce-2" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={mockCoseizeServerTypeIndex}
        model={{ ...mockModel, cEvents: [{ id: "ce-2", effect: [{ macro: "COSEIZE", args: ["SurgeryQueue", "Surgeon", "Anesthetist"] }] }] }}
      />
    );
    expect(screen.getByText("Surgery")).toBeInTheDocument();
    expect(screen.getByText("Surgeon")).toBeInTheDocument();
    expect(screen.getByText("Anesthetist")).toBeInTheDocument();
    expect(screen.getAllByText("Server #1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Server #3").length).toBeGreaterThanOrEqual(1);
  });

  test("calls onEntitySelect when customer clicked in activity", () => {
    const snap = makeActivitySnap({
      servers: [
        { type: "Server", status: "busy", currentCustId: 10, busyTime: 8.0, serviceStart: 10.0, scheduledDuration: 5.0 },
      ],
    });
    const onEntitySelect = vi.fn();
    renderWithTheme(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "ServiceActivity", refId: "ce-1" }}
        onClose={vi.fn()}
        snap={snap}
        serverTypeIndex={mockServerTypeIndex}
        model={mockModel}
        onEntitySelect={onEntitySelect}
      />
    );
    const customerLink = screen.getByText("#10");
    fireEvent.click(customerLink);
    expect(onEntitySelect).toHaveBeenCalledWith(10);
  });
});
