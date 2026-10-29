// Run mode fixes: entity click-through from the inspector, bottom panel
// resize direction, the run readiness status button, and the queue/delay
// inspectors' card layout.
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { BottomPanel } from "../../../src/ui/execute/BottomPanel.jsx";
import { NodeDetailSidebar } from "../../../src/ui/execute/NodeDetailSidebar.jsx";
import { RunReadinessStatusButton } from "../../../src/ui/execute/RunReadinessPanel.jsx";

beforeEach(() => {
  localStorage.clear();
});

const snap = {
  clock: 10, served: 0, reneged: 0,
  entities: [
    { id: 1, type: "Clerk", role: "server", status: "idle", arrivalTime: 0 },
    { id: 2, type: "Customer", role: "customer", status: "waiting", queue: "Queue A", arrivalTime: 1, waitingSince: 1 },
    { id: 3, type: "Customer", role: "customer", status: "waiting", queue: "Queue A", arrivalTime: 4, waitingSince: 4 },
  ],
};
const model = {
  queues: [{ name: "Queue A", capacity: "4" }],
  entityTypes: [{ name: "Customer", role: "customer" }, { name: "Clerk", role: "server", count: "1" }],
  bEvents: [], cEvents: [],
};

describe("BottomPanel", () => {
  test("an entity picked elsewhere opens the Entity Details tab, expanded", () => {
    const { rerender } = render(<BottomPanel log={[]} snap={snap} model={model} selectedEntityId={null} entityFocusRequest={0} />);
    expect(screen.queryByLabelText("Bottom panel content")).toBeNull();

    rerender(<BottomPanel log={[]} snap={snap} model={model} selectedEntityId={2} entityFocusRequest={1} />);
    expect(screen.getByLabelText("Bottom panel content")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Entity Details" })).toHaveAttribute("aria-selected", "true");
  });

  test("dragging the bottom-edge handle down makes the panel taller", () => {
    localStorage.setItem("des.bottomPanel.collapsed", "0");
    localStorage.setItem("des.bottomPanel.height", "300");
    render(<BottomPanel log={[]} snap={snap} model={model} />);
    const body = screen.getByLabelText("Bottom panel content");
    expect(body.style.height).toBe("300px");

    const handle = screen.getByRole("separator", { name: /resize bottom panel/i });
    fireEvent.mouseDown(handle, { clientY: 500 });
    fireEvent.mouseMove(window, { clientY: 560 });
    fireEvent.mouseUp(window);
    expect(body.style.height).toBe("360px");

    fireEvent.mouseDown(handle, { clientY: 500 });
    fireEvent.mouseMove(window, { clientY: 400 });
    fireEvent.mouseUp(window);
    expect(body.style.height).toBe("260px");
  });
});

describe("RunReadinessStatusButton", () => {
  test("the warnings button is enabled and opens the readiness details", () => {
    const onShowDetails = vi.fn();
    render(<RunReadinessStatusButton runAdmission={{ hardErrors: [], warnings: [{ code: "W1", message: "x" }, { code: "W2", message: "y" }] }} onShowDetails={onShowDetails} />);
    const btn = screen.getByRole("button", { name: /2 warnings/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onShowDetails).toHaveBeenCalled();
  });

  test("blockers and ready states are clickable too", () => {
    const onShowDetails = vi.fn();
    const { rerender } = render(<RunReadinessStatusButton runAdmission={{ hardErrors: [{ code: "E1", message: "x" }], warnings: [] }} onShowDetails={onShowDetails} />);
    fireEvent.click(screen.getByRole("button", { name: /1 blocker/ }));
    rerender(<RunReadinessStatusButton runAdmission={{ hardErrors: [], warnings: [] }} onShowDetails={onShowDetails} />);
    fireEvent.click(screen.getByRole("button", { name: /Ready/ }));
    expect(onShowDetails).toHaveBeenCalledTimes(2);
  });
});

describe("Run inspector cards", () => {
  test("queue inspector shows stat cards, a fill bar and clickable entity cards", () => {
    const onEntitySelect = vi.fn();
    render(<NodeDetailSidebar selectedNode={{ nodeType: "queueNode", label: "Queue A" }} snap={snap} model={model} serverTypeIndex={new Map()} onEntitySelect={onEntitySelect} />);
    expect(screen.getByText("Waiting", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("Longest wait")).toBeInTheDocument();
    expect(screen.getByText("9.0")).toBeInTheDocument();
    expect(screen.getByText("Fill: 50%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "#3" }));
    expect(onEntitySelect).toHaveBeenCalledWith(3);
    expect(onEntitySelect).toHaveBeenCalledTimes(1);
  });

  test("delay inspector shows stat cards and clickable entity cards", () => {
    const delaySnap = {
      clock: 20,
      entities: [
        { id: 7, type: "Customer", role: "customer", status: "serving", _isDelay: true, ceventName: "CoolingOff", serviceStart: 12, arrivalTime: 2 },
        { id: 8, type: "Customer", role: "customer", status: "serving", _isDelay: true, ceventName: "CoolingOff", serviceStart: 16, arrivalTime: 3 },
      ],
    };
    const delayModel = { queues: [], entityTypes: [], cEvents: [{ id: "ce-d", name: "CoolingOff", effect: "DELAY(Exponential(5))" }] };
    const onEntitySelect = vi.fn();
    render(<NodeDetailSidebar selectedNode={{ nodeType: "activityNode", label: "CoolingOff", refId: "ce-d" }} snap={delaySnap} model={delayModel} serverTypeIndex={new Map()} onEntitySelect={onEntitySelect} />);
    expect(screen.getByText("DELAY")).toBeInTheDocument();
    expect(screen.getByText("In delay")).toBeInTheDocument();
    expect(screen.getByText("8.0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "#7" }));
    expect(onEntitySelect).toHaveBeenCalledWith(7);
  });
});
