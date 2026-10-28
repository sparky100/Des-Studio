import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidenceEditor } from "../../../src/ui/editors/EvidenceEditor.jsx";

const model = () => ({
  queues: [{ id: "q1", name: "Triage", capacity: 5 }],
  bEvents: [{ id: "b1", name: "Arrive", schedules: [{ distName: "Exponential", distParams: { mean: "12" } }] }],
  evidence: [{ id: "ev_audit", name: "ED audit", type: "data", description: "Hourly arrivals", source: "BI 4471", strength: 0.6, dateCaptured: "2025-11-03" }],
  assumptions: [],
  backingLinks: [{ id: "bl_1", recordType: "evidence", recordId: "ev_audit", targetType: "b_event", targetId: "b1", targetPath: "schedules[0].distParams.mean" }],
});

describe("EvidenceEditor", () => {
  it("summarises coverage and lists records by name", () => {
    render(<EvidenceEditor model={model()} canEdit onChange={vi.fn()} />);
    expect(screen.getByText(/evidenced, .* unbacked/)).toBeTruthy();
    expect(screen.getByText("ED audit")).toBeTruthy();
  });

  it("adds an evidence record through onChange", () => {
    const onChange = vi.fn();
    render(<EvidenceEditor model={model()} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    const next = onChange.mock.calls.at(-1)[0];
    expect(next.evidence).toHaveLength(2);
    expect(next.evidence[1].type).toBe("literature");
    expect(next.evidence[1].strength).toBe(0.6);
  });

  it("hides every edit control when the model is read-only", () => {
    render(<EvidenceEditor model={model()} canEdit={false} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add evidence" })).toBeNull();
    fireEvent.click(screen.getByText("ED audit"));
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("the Coverage view shows the parameter the record backs as evidenced", () => {
    render(<EvidenceEditor model={model()} canEdit={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Coverage/ }));
    expect(screen.getByText(/Schedule row 1 — mean/)).toBeTruthy();
    expect(screen.getAllByText("Evidenced").length).toBeGreaterThan(0);
  });
});
