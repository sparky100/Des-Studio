import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

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
  test("shows blocking validation status on every model tab", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "bad-customer", name: "", role: "customer", attrDefs: [] }],
    });

    expect(screen.getByRole("region", { name: /model health/i })).toHaveTextContent(/blocker/i);
    expect(screen.getByRole("button", { name: /\[V1\] Entity Types/i })).toBeInTheDocument();
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
});
