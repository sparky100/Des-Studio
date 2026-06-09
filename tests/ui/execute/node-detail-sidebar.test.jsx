import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import { NodeDetailSidebar } from "../../../src/ui/execute/NodeDetailSidebar.jsx";

const mockQueueLiveData = {
  depth: 3,
  capacity: 5,
  discipline: "FIFO",
  clock: 10.5,
  entities: [
    { id: 1, type: "Customer", arrivalTime: 2.0, waitingSince: 2.0, attrs: {} },
    { id: 2, type: "Customer", arrivalTime: 4.0, waitingSince: 4.0, attrs: { priority: 3 } },
    { id: 3, type: "VIP", arrivalTime: 6.0, waitingSince: 6.0, attrs: {} },
  ],
};

const mockActivityLiveData = {
  serverTypeName: "Server",
  capacity: 3,
  busyCount: 2,
  idleCount: 1,
  failedCount: 0,
  utilisation: 66.67,
  clock: 15.0,
  servers: [
    { id: 1, status: "busy", busyTime: 8.0, starvationTime: 0, downtime: 0, scheduledDuration: 5.0, serviceStart: 10.0, customerId: 10, customerType: "Customer", customerArrivalTime: 3.0 },
    { id: 2, status: "busy", busyTime: 6.0, starvationTime: 0, downtime: 0, scheduledDuration: 4.0, serviceStart: 12.0, customerId: 11, customerType: "VIP", customerArrivalTime: 5.0 },
    { id: 3, status: "idle", busyTime: 4.0, starvationTime: 3.0, downtime: 0, scheduledDuration: null, serviceStart: null, customerId: null, customerType: null, customerArrivalTime: null },
  ],
};

describe("NodeDetailSidebar", () => {
  test("renders nothing when no node selected", () => {
    const { container } = render(<NodeDetailSidebar selectedNode={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  test("renders queue detail sidebar with header", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "CheckinQueue", liveData: mockQueueLiveData }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Queue Members")).toBeInTheDocument();
    expect(screen.getByText("CheckinQueue")).toBeInTheDocument();
    expect(screen.getByText("FIFO")).toBeInTheDocument();
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
  });

  test("shows queue entities sorted by arrival time (FIFO)", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue", liveData: mockQueueLiveData }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getAllByText(/#\d/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Customer").length).toBe(2);
    expect(screen.getByText("VIP")).toBeInTheDocument();
  });

  test("shows wait times for queue entities", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue", liveData: mockQueueLiveData }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("t=8.5")).toBeInTheDocument();
    expect(screen.getByText("t=6.5")).toBeInTheDocument();
    expect(screen.getByText("t=4.5")).toBeInTheDocument();
  });

  test("shows priority badge when entity has priority attribute", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue", liveData: mockQueueLiveData }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("P=3")).toBeInTheDocument();
  });

  test("shows empty queue message when no entities", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "EmptyQueue", liveData: { ...mockQueueLiveData, entities: [], depth: 0 } }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Queue is empty")).toBeInTheDocument();
  });

  test("renders activity detail sidebar with header", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "ServiceActivity", liveData: mockActivityLiveData }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Server Pool")).toBeInTheDocument();
    expect(screen.getByText("ServiceActivity")).toBeInTheDocument();
    expect(screen.getByText("Server")).toBeInTheDocument();
  });

  test("shows server pool stats", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "Activity", liveData: mockActivityLiveData }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  test("shows utilisation bar and percentage", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "Activity", liveData: mockActivityLiveData }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/Utilisation: 67%/)).toBeInTheDocument();
  });

  test("shows busy server details with customer info", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "Activity", liveData: mockActivityLiveData }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Server #1")).toBeInTheDocument();
    expect(screen.getAllByText("busy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Serving/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("#10")).toBeInTheDocument();
    expect(screen.getAllByText(/Customer/).length).toBeGreaterThanOrEqual(1);
  });

  test("shows idle server with starvation time", () => {
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "Activity", liveData: mockActivityLiveData }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Server #3")).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(screen.getByText("Starvation: t=3.0")).toBeInTheDocument();
  });

  test("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue", liveData: mockQueueLiveData }}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText("×"));
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onClose when Escape key pressed", () => {
    const onClose = vi.fn();
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue", liveData: mockQueueLiveData }}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onEntitySelect when entity clicked in queue", () => {
    const onEntitySelect = vi.fn();
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "queueNode", label: "Queue", liveData: mockQueueLiveData }}
        onClose={vi.fn()}
        onEntitySelect={onEntitySelect}
      />
    );
    const entityRow = screen.getByTitle("Click to inspect entity #1");
    fireEvent.click(entityRow);
    expect(onEntitySelect).toHaveBeenCalledWith(1);
  });

  test("calls onEntitySelect when customer clicked in activity", () => {
    const onEntitySelect = vi.fn();
    render(
      <NodeDetailSidebar
        selectedNode={{ nodeType: "activityNode", label: "Activity", liveData: mockActivityLiveData }}
        onClose={vi.fn()}
        onEntitySelect={onEntitySelect}
      />
    );
    const customerLink = screen.getByText("#10");
    fireEvent.click(customerLink);
    expect(onEntitySelect).toHaveBeenCalledWith(10);
  });
});
