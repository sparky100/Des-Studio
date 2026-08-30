// Integration coverage for "Edit in the X tab" jump links: clicking a
// DefinePointer in Draw's inspector switches ModelDetail to the right Define
// tab AND lands on that exact entity's card, expanded — not just the tab.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// Draw's canvas renders through @xyflow/react — mock it the same way the
// other Visual Designer tests do, since ModelDetail mounts the real panel.
vi.mock("../../src/ui/shared/xyflow.js", () => ({
  Background: () => null,
  Controls: () => null,
  Handle: () => <span data-testid="flow-handle" />,
  MarkerType: { ArrowClosed: "arrowclosed" },
  MiniMap: () => null,
  Panel: ({ children }) => <div data-testid="flow-panel">{children}</div>,
  Position: { Left: "left", Right: "right" },
  SelectionMode: { Full: "full", Partial: "partial" },
  useReactFlow: () => ({
    fitView: vi.fn(),
    getNode: vi.fn(() => null),
    setCenter: vi.fn(),
    getViewport: vi.fn(() => ({ zoom: 1 })),
  }),
  useStoreApi: () => ({ getState: () => ({}), setState: () => {}, subscribe: () => () => {} }),
  ReactFlow: ({ nodes = [], children }) => (
    <div data-testid="react-flow" data-node-count={nodes.length}>{children}</div>
  ),
}));

// jsdom doesn't implement scrollIntoView — the Define tabs' focus/expand
// effects call it once they land on the targeted card.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import { ModelDetail } from "../../src/ui/ModelDetail.jsx";

const baseModel = {
  id: "m-jump",
  name: "Clinic Desk",
  description: "A small queueing model",
  visibility: "private",
  access: {},
  stateVariables: [],
  owner_id: "user-1",
  entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
  queues: [
    { id: "q-triage", name: "Triage Queue", customerType: "Customer", discipline: "FIFO" },
    { id: "q-consult", name: "Consultant Queue", customerType: "Customer", discipline: "FIFO", balkProbability: 0.2 },
  ],
  bEvents: [
    { id: "b-arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Customer, Triage Queue)", schedules: [] },
  ],
  cEvents: [],
};

function renderDetail(modelData) {
  return render(
    <ModelDetail
      modelId="m-jump"
      modelData={modelData}
      onBack={vi.fn()}
      onRefresh={vi.fn()}
      overrides={{ isOwner: true, canEdit: true, profiles: [], userId: "user-1" }}
    />
  );
}

describe("ModelDetail — Draw inspector 'Edit in the X tab' jump links", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
    window.dispatchEvent(new Event("resize"));
    mockFetchRunHistory.mockReset();
    mockListShareLinks.mockReset();
    mockFetchRunHistory.mockResolvedValue([]);
    mockListShareLinks.mockResolvedValue([]);
  });

  test("clicking a queue's 'Edit in the Queues tab' pointer switches to Define → Queues with that exact queue expanded", async () => {
    const user = userEvent.setup();
    renderDetail(baseModel);

    // Design mode defaults to the Draw (visual) tab.
    fireEvent.click(screen.getByRole("button", { name: /^design$/i }));

    // Use Draw's own node search to select the balking queue's node — the
    // real UI path a modeller uses, not a synthetic canvas click.
    // VisualDesignerPanel is lazy-loaded (Suspense) — wait for it to resolve.
    const searchInput = await screen.findByLabelText("Search canvas nodes");
    await user.type(searchInput, "Consultant");
    const results = screen.getByLabelText("Node search results");
    await user.click(within(results).getByRole("option", { name: /^Consultant Queue/i }));

    // Inspector now shows the selected queue's pointers (description/balking/
    // reneging) as links — any of them should jump to the same queue.
    const queueLinks = screen.getAllByRole("button", { name: /edit in the queues tab/i });
    await user.click(queueLinks[0]);

    // Define → Queues is now the active tab…
    expect(screen.getByRole("button", { name: /^queues$/i })).toHaveAttribute("aria-pressed", "true");
    // …and the Consultant Queue card (not Triage Queue) is expanded — its
    // ACCEPTS field, only rendered when a card is expanded, is visible.
    await waitFor(() => {
      expect(screen.getByDisplayValue("Consultant Queue").closest("div").parentElement.textContent).toContain("ACCEPTS");
    });
    expect(screen.getByDisplayValue("Triage Queue").closest("div").parentElement.textContent).not.toContain("ACCEPTS");
  });
});
