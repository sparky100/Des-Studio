import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeEvidenceSection, backingTargetForNode } from "../../../src/ui/visual-designer/NodeEvidenceSection.jsx";

const model = () => ({
  queues: [{ id: "q1", name: "Triage", capacity: 5 }],
  bEvents: [{ id: "b1", name: "Arrive", effect: ["ARRIVE(Patient, Triage)"], scheduledTime: "0", schedules: [{ distName: "Exponential", distParams: { mean: "12" } }] }],
  cEvents: [],
  containerTypes: [],
  evidence: [{ id: "ev_audit", name: "ED audit", type: "data", description: "Arrivals", source: "BI" }],
  assumptions: [],
  backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "ev_audit", targetType: "b_event", targetId: "b1", targetPath: "schedules[0].distParams.mean" }],
});

describe("backingTargetForNode", () => {
  it("maps a node to its backing target by refId", () => {
    expect(backingTargetForNode(model(), { refId: "b1" })).toEqual({ targetType: "b_event", targetId: "b1" });
    expect(backingTargetForNode(model(), { refId: "route-exit:b1" })).toEqual({ targetType: "b_event", targetId: "b1" });
    expect(backingTargetForNode(model(), { refId: "q1" })).toEqual({ targetType: "queue", targetId: "q1" });
    expect(backingTargetForNode(model(), { refId: "nothing" })).toBeNull();
    expect(backingTargetForNode(model(), {})).toBeNull();
  });
});

describe("NodeEvidenceSection", () => {
  it("shows the backing status, parameter count and attached record names", () => {
    render(<NodeEvidenceSection model={model()} node={{ refId: "b1" }} />);
    expect(screen.getByText(/1 of 1 parameter backed/)).toBeTruthy();
    expect(screen.getByText("ED audit")).toBeTruthy();
  });

  it("says nothing backs an unlinked queue", () => {
    render(<NodeEvidenceSection model={model()} node={{ refId: "q1" }} />);
    expect(screen.getByText(/Nothing backs this yet/)).toBeTruthy();
  });

  it("renders nothing for a node with no backing target", () => {
    const { container } = render(<NodeEvidenceSection model={model()} node={{ refId: "nothing" }} />);
    expect(container.textContent).toBe("");
  });
});
