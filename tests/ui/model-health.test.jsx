import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetchRunHistory = vi.hoisted(() => vi.fn());
const mockListShareLinks = vi.hoisted(() => vi.fn());

vi.mock("../../src/db/models.js", async () => {
  const actual = await vi.importActual("../../src/db/models.js");
  return {
    ...actual,
    fetchRunHistory: mockFetchRunHistory,
    listShareLinks: mockListShareLinks,
  };
});

import { ModelDetail } from "../../src/ui/ModelDetail.jsx";

const baseModel = {
  id: "m-health",
  name: "Clinic Desk",
  description: "A small queueing model",
  visibility: "private",
  access: {},
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
  owner_id: "user-1",
};

function renderDetail(modelData) {
  return render(
    <ModelDetail
      modelId="m-health"
      modelData={modelData}
      onBack={vi.fn()}
      onRefresh={vi.fn()}
      overrides={{ isOwner: true, canEdit: true, profiles: [], userId: "user-1" }}
    />
  );
}

describe("ModelDetail Model Health panel", () => {
  beforeEach(() => {
    mockFetchRunHistory.mockReset();
    mockListShareLinks.mockReset();
    mockFetchRunHistory.mockResolvedValue([]);
    mockListShareLinks.mockResolvedValue([]);
  });

  test("shows blocking validation status on every model tab", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "bad-customer", name: "", role: "customer", attrDefs: [] }],
    });

    expect(screen.getByRole("region", { name: /model health/i })).toHaveTextContent(/blocker/i);
    expect(screen.getByRole("button", { name: /\[V1\] Entity Types/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run model/i })).not.toBeInTheDocument();
  });

  test("opens the editor tab attached to a health issue", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "bad-customer", name: "", role: "customer", attrDefs: [] }],
    });

    fireEvent.click(screen.getByRole("button", { name: /\[V1\] Entity Types/i }));

    expect(screen.getByRole("tab", { name: /entity types/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/Entity class at position 1 has an empty name/i);
  });

  test("marks tabs and section selector options with validation counts", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "bad-customer", name: "", role: "customer", attrDefs: [] }],
    });

    expect(screen.getByRole("tab", { name: /entity types, 1 error/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Entity Types \(1\/0\)/i })).toBeInTheDocument();
  });

  test("uses responsive overview metric columns", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "customer", name: "Customer", role: "customer", attrDefs: [] }],
    });

    expect(screen.getByLabelText(/model structure metrics/i)).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    });
  });

  test("jumps between model sections from the compact selector", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "customer", name: "Customer", role: "customer", attrDefs: [] }],
    });

    fireEvent.change(screen.getByRole("combobox", { name: /jump to model section/i }), {
      target: { value: "queues" },
    });

    expect(screen.getByRole("tab", { name: /queues/i })).toHaveAttribute("aria-selected", "true");
  });

  test("offers next-step run actions when the model has no blockers", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "customer", name: "Customer", role: "customer", attrDefs: [] }],
    });

    fireEvent.click(screen.getByRole("button", { name: /run model/i }));

    expect(screen.getByRole("tab", { name: /execute/i })).toHaveAttribute("aria-selected", "true");
  });
});
