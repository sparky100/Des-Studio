import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "../../src/ui/shared/ToastContext.jsx";

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

const PROFILES = [
  { id: "user-2", full_name: "Grainne Parkinson", initials: "GP" },
];

function renderAccessTab(model = baseModel, overridesExtra = {}) {
  const onRefresh = overridesExtra.onRefresh ?? vi.fn();
  render(
    <ToastProvider>
      <ModelDetail
        modelId={model.id}
        modelData={model}
        onBack={vi.fn()}
        onRefresh={onRefresh}
        overrides={{ isOwner: true, canEdit: true, profiles: PROFILES, userId: "user-1", onSetVisibility: vi.fn(() => Promise.resolve()), onSetAccess: vi.fn(() => Promise.resolve()), ...overridesExtra }}
      />
    </ToastProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /^access$/i }));
  return { onRefresh };
}

describe("ModelDetail Access tab — shareable link", () => {
  beforeEach(() => {
    mockFetchRunHistory.mockReset();
    mockListShareLinks.mockReset();
    mockFetchRunHistory.mockResolvedValue([]);
    mockListShareLinks.mockResolvedValue([]);
    // Object.defineProperty (not Object.assign) — @testing-library/user-event's
    // clipboard stub (installed by any test elsewhere that calls
    // userEvent.setup(), and never torn down — it has no auto-cleanup hook)
    // replaces navigator.clipboard with a getter-only accessor. That's a
    // shared-worker/shared-environment concern, not something scoped to this
    // file, so Object.assign's plain [[Set]] can throw against it if this
    // file's tests happen to run after one of those elsewhere. defineProperty
    // always succeeds against a configurable property regardless of whether
    // it previously held a plain value or a getter.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
      writable: true,
    });
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
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
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

describe("ModelDetail Access tab — adding/editing/removing collaborators", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
      writable: true,
    });
  });

  test("searching and adding a person persists via onSetAccess and refreshes on success", async () => {
    const onSetAccess = vi.fn(() => Promise.resolve());
    const { onRefresh } = renderAccessTab(baseModel, { onSetAccess });

    fireEvent.change(screen.getByPlaceholderText(/search by name/i), { target: { value: "grainne" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    // Optimistic: shows immediately in "WITH ACCESS", before the save resolves.
    expect(screen.getByText("Grainne Parkinson")).toBeInTheDocument();
    expect(onSetAccess).toHaveBeenCalledWith("m1", { "user-2": "viewer" });
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  test("changing an existing collaborator's role persists the updated map", () => {
    const onSetAccess = vi.fn(() => Promise.resolve());
    renderAccessTab({ ...baseModel, access: { "user-2": "viewer" } }, { onSetAccess });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "editor" } });

    expect(onSetAccess).toHaveBeenCalledWith("m1", { "user-2": "editor" });
  });

  test("removing a collaborator persists the map without them", () => {
    const onSetAccess = vi.fn(() => Promise.resolve());
    renderAccessTab({ ...baseModel, access: { "user-2": "viewer" } }, { onSetAccess });

    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));

    expect(onSetAccess).toHaveBeenCalledWith("m1", {});
  });

  test("reverts the optimistic update and shows an error toast when the save fails, instead of silently vanishing", async () => {
    const onSetAccess = vi.fn(() => Promise.reject(new Error("network error")));
    renderAccessTab(baseModel, { onSetAccess });

    fireEvent.change(screen.getByPlaceholderText(/search by name/i), { target: { value: "grainne" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(screen.getByText("Grainne Parkinson")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("network error"));
    // Reverted: back to "no one else has access" instead of leaving the phantom entry.
    expect(screen.getByText(/no one else has access yet/i)).toBeInTheDocument();
  });
});
