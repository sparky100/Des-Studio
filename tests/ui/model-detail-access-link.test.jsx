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
  id: "m1",
  name: "Emergency Desk",
  description: "A small queueing model",
  visibility: "private",
  access: {},
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
  owner_id: "user-1",
};

function renderAccessTab(model = baseModel, overridesExtra = {}) {
  render(
    <ModelDetail
      modelId={model.id}
      modelData={model}
      onBack={vi.fn()}
      onRefresh={vi.fn()}
      overrides={{ isOwner: true, canEdit: true, profiles: [], userId: "user-1", onSetVisibility: vi.fn(() => Promise.resolve()), onSetAccess: vi.fn(), ...overridesExtra }}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /^access$/i }));
}

describe("ModelDetail Access tab — shareable link", () => {
  beforeEach(() => {
    mockFetchRunHistory.mockReset();
    mockListShareLinks.mockReset();
    mockFetchRunHistory.mockResolvedValue([]);
    mockListShareLinks.mockResolvedValue([]);
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
  });

  test("copies a #model/<id> link to the clipboard", () => {
    renderAccessTab();

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("#model/m1")
    );
  });

  test("warns that a private model with no collaborators has nothing for the link to open", () => {
    renderAccessTab({ ...baseModel, visibility: "private", access: {} });

    expect(screen.getByText(/won't open it for anyone else yet/i)).toBeInTheDocument();
  });

  test("does not warn once the model is public", () => {
    renderAccessTab({ ...baseModel, visibility: "public", access: {} });

    expect(screen.queryByText(/won't open it for anyone else yet/i)).not.toBeInTheDocument();
  });

  test("does not warn once a collaborator has access", () => {
    renderAccessTab({ ...baseModel, visibility: "private", access: { "user-2": "viewer" } });

    expect(screen.queryByText(/won't open it for anyone else yet/i)).not.toBeInTheDocument();
  });
});
