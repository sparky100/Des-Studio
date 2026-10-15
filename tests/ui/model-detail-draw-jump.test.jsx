// Integration coverage for "Edit in the X tab" jump links: clicking a
// DefinePointer in Draw's inspector switches ModelDetail to the right Define
// tab AND lands on that exact entity's card, expanded — not just the tab.
import { getRoles, isInaccessible } from "@testing-library/dom";
import { computeAccessibleName } from "dom-accessibility-api";
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
    // findBy*, not getBy*: the Draw panel and its inspector are lazy-loaded
    // under Suspense, which hides the rendered tree (display: none) while a
    // chunk loads. On slower CI runners the immediate getBy* queries saw the
    // results list as inaccessible and the inspector links as missing.
    const results = await screen.findByLabelText("Node search results");
    // Diagnostic for a CI-only failure (GitHub runners report this option as
    // inaccessible; it never reproduces locally): name the ancestor that hides it.
    const optionEl = within(results).getByText("Consultant Queue").closest('[role="option"]');
    if (optionEl && isInaccessible(optionEl)) {
      const chain = [];
      for (let el = optionEl; el && el !== document.documentElement; el = el.parentElement) {
        const cs = window.getComputedStyle(el);
        if (el.hidden || el.getAttribute("aria-hidden") === "true" || cs.display === "none" || cs.visibility === "hidden") {
          chain.push(`<${el.tagName.toLowerCase()} ${[...el.attributes].map(a => `${a.name}="${a.value.slice(0, 80)}"`).join(" ")}> display=${cs.display} visibility=${cs.visibility}`);
        }
      }
      console.error("draw-jump: option inaccessible; hiding ancestors:\n" + chain.join("\n"));
    }
    if (optionEl) console.info(`draw-jump: option accessible name = ${JSON.stringify(computeAccessibleName(optionEl))}, roles = ${Object.keys(getRoles(optionEl.parentElement)).join(",")}`);
    await user.click(await within(results).findByRole("option", { name: /^Consultant Queue/i }, { timeout: 5000 }));

    // Inspector now shows the selected queue's pointers (description/balking/
    // reneging) as links — any of them should jump to the same queue.
    const queueLinks = await screen.findAllByRole("button", { name: /edit in the queues tab/i }, { timeout: 5000 });
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
