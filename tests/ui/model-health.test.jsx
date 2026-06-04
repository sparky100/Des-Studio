import { fireEvent, render, screen, within } from "@testing-library/react";
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
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
    window.dispatchEvent(new Event("resize"));
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

    expect(screen.getByRole("region", { name: /model health/i })).toHaveTextContent(/fixes before it can run/i);
    expect(screen.getByRole("button", { name: /2 errors/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open run/i })).not.toBeInTheDocument();
  });

  test("opens the editor tab attached to a health issue", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "bad-customer", name: "", role: "customer", attrDefs: [] }],
    });

    fireEvent.click(screen.getByRole("button", { name: /model health →/i }));
    fireEvent.click(screen.getByRole("button", { name: /Entity Types: Entity class at position 1 has an empty name/i }));

    expect(screen.getByRole("button", { name: /entity types/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/Entity class at position 1 has an empty name/i);
  });

  test("marks tabs with validation counts", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "bad-customer", name: "", role: "customer", attrDefs: [] }],
    });

    fireEvent.click(screen.getByRole("button", { name: /^design$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^define$/i }));
    expect(screen.getByRole("button", { name: /entity types/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /model health/i })).toBeInTheDocument();
  });

  test("only shows the Model Health tab when there are issues to review", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "customer", name: "Customer", role: "customer", attrDefs: [] }],
      queues: [{ id: "q1", name: "Customer Queue", discipline: "FIFO" }],
      bEvents: [
        { id: "b-arrive", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
        { id: "b-complete", name: "Depart", effect: "COMPLETE()", schedules: [] },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /^design$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^define$/i }));
    fireEvent.click(screen.getByRole("button", { name: /b-events/i }));
    expect(screen.getByRole("button", { name: /b-events/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /model health/i })).not.toBeInTheDocument();
  });

  test("uses a shared authoring shell for workflow modes", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "customer", name: "Customer", role: "customer", attrDefs: [] }],
    });

    fireEvent.click(screen.getByRole("button", { name: /^design$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^define$/i }));

    expect(screen.getByRole("region", { name: /design authoring shell/i })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: /design context panel/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /b-events/i }));
    expect(screen.getByRole("region", { name: /design authoring shell/i })).toBeInTheDocument();
  });

  test("offers next-step run actions when the model has no blockers", () => {
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "customer", name: "Customer", role: "customer", attrDefs: [] }],
      queues: [{ id: "q1", name: "Customer Queue", discipline: "FIFO" }],
      bEvents: [
        { id: "b-arrive", name: "Arrival", effect: "ARRIVE(Customer)", schedules: [] },
        { id: "b-complete", name: "Depart", effect: "COMPLETE()", schedules: [] },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /open run/i }));

    const workflow = screen.getByLabelText(/model workflow/i);
    expect(within(workflow).getByRole("button", { name: /^run$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  test("uses a mobile read/run/results workflow at phone width", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 600 });
    window.dispatchEvent(new Event("resize"));

    renderDetail({
      ...baseModel,
      entityTypes: [{ id: "customer", name: "Customer", role: "customer", attrDefs: [] }],
    });

    expect(screen.getByLabelText(/model workflow/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^overview$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^design$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /entity model/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /entity types/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^design$/i }));
    expect(screen.getByRole("button", { name: /^describe$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^define$/i }));
    expect(screen.getByRole("button", { name: /entity types/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /execute/i })).not.toBeInTheDocument();
    const mobileWorkflow = screen.getByLabelText(/model workflow/i);
    fireEvent.click(within(mobileWorkflow).getByRole("button", { name: /^run$/i }));
    expect(within(mobileWorkflow).getByRole("button", { name: /^run$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^setup$/i })).toBeInTheDocument();
    fireEvent.click(within(mobileWorkflow).getByRole("button", { name: /^results$/i }));
    expect(within(mobileWorkflow).getByRole("button", { name: /^results$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^summary$/i })).toBeInTheDocument();
  });

  test("treats a fresh blank model as getting started instead of blocked", () => {
    renderDetail(baseModel);

    expect(screen.getByRole("region", { name: /model health/i })).toHaveTextContent(/start with a template, the visual designer, ai designer, or forms/i);
    expect(screen.queryByText(/fix blocking validation issues/i)).not.toBeInTheDocument();
    expect(screen.getByText(/choose a build path below to start defining your model/i)).toBeInTheDocument();
  });
});
