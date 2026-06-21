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

  test("falls back to a manual copy when the Clipboard API is unavailable, so the click still gives feedback", () => {
    // Simulate a context (e.g. non-HTTPS) where navigator.clipboard doesn't exist —
    // previously this silently did nothing, with no success or error toast.
    Object.assign(navigator, { clipboard: undefined });
    const execCommandSpy = vi.fn(() => true);
    document.execCommand = execCommandSpy;

    renderAccessTab();

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
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

  test("switches the Public/Private button highlight immediately on click, without waiting on a refresh", () => {
    let resolveSetVisibility;
    const onSetVisibility = vi.fn(
      () => new Promise(resolve => { resolveSetVisibility = resolve; })
    );
    renderAccessTab(baseModel, { onSetVisibility });

    const publicBtn = screen.getByRole("button", { name: /🌐 Public/i });
    const privateBtn = screen.getByRole("button", { name: /🔒 Private/i });

    const privateBgBefore = getComputedStyle(privateBtn).backgroundColor;
    const publicBgBefore = getComputedStyle(publicBtn).backgroundColor;

    fireEvent.click(publicBtn);

    // The highlight should flip right away, before the onSetVisibility promise (and the
    // onRefresh round-trip it chains into) has resolved.
    expect(getComputedStyle(publicBtn).backgroundColor).not.toBe(publicBgBefore);
    expect(getComputedStyle(privateBtn).backgroundColor).not.toBe(privateBgBefore);
    expect(onSetVisibility).toHaveBeenCalledWith("m1", "public");

    resolveSetVisibility();
  });
});
