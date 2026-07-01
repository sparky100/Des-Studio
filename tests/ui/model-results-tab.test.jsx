import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("ModelDetail Results tab", () => {
  beforeEach(() => {
    mockFetchRunHistory.mockReset();
    mockListShareLinks.mockReset();
    mockFetchRunHistory.mockResolvedValue([]);
    mockListShareLinks.mockResolvedValue([]);
  });

  test("shows a top-level Results tab with run guidance", () => {
    render(
      <ModelDetail
        modelId="m1"
        modelData={baseModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, profiles: [], userId: "user-1" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^results$/i }));

    expect(screen.getByRole("button", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.getByText(/No results yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Run$/i })).toBeInTheDocument();
  });

  test("loads a saved run directly in Results and shows its log", async () => {
    mockFetchRunHistory.mockResolvedValue([
      {
        id: "run-1",
        run_label: "Morning baseline",
        ran_at: "2026-05-11T10:00:00.000Z",
        results_json: {
          summary: { served: 3 },
          log: [
            { phase: "INIT", time: 0, message: "Run started" },
            { phase: "END", time: 5, message: "Run finished" },
          ],
          timeSeries: [
            {
              t: 0,
              byQueue: { "Queue A": { waiting: 1 } },
              byType: { Customer: { waiting: 1 }, Clerk: { busy: 0 } },
            },
            {
              t: 5,
              byQueue: { "Queue A": { waiting: 2 } },
              byType: { Customer: { waiting: 2 }, Clerk: { busy: 1 } },
            },
          ],
          waitDist: {
            "Queue A": { n: 2, mean: 3, p50: 3, p90: 4, p95: 4, p99: 4, values: [2, 4] },
          },
        },
      },
    ]);

    render(
      <ModelDetail
        modelId="m1"
        modelData={{
          ...baseModel,
          queues: [{ id: "q1", name: "Queue A", customerType: "Customer" }],
          entityTypes: [
            { id: "e1", name: "Customer", role: "customer" },
            { id: "e2", name: "Clerk", role: "server", count: "1" },
          ],
        }}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, profiles: [], userId: "user-1" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^results$/i }));

    await waitFor(() => expect(mockFetchRunHistory).toHaveBeenCalledWith("m1", expect.objectContaining({ archived: false })));
    expect(await screen.findByRole("combobox", { name: /saved run/i })).toHaveValue("run-1");
    expect(screen.getByText(/Morning baseline/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(screen.getByText(/Run started/i)).toBeInTheDocument();
    expect(screen.getByText(/Run finished/i)).toBeInTheDocument();
  });

  test("opens the Export popover from the Results summary view without crashing", async () => {
    mockFetchRunHistory.mockResolvedValue([
      {
        id: "run-1",
        run_label: "Morning baseline",
        ran_at: "2026-05-11T10:00:00.000Z",
        results_json: { summary: { served: 3 } },
      },
    ]);

    render(
      <ModelDetail
        modelId="m1"
        modelData={baseModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, profiles: [], userId: "user-1" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^results$/i }));
    await screen.findByText(/Morning baseline/i);

    fireEvent.click(screen.getByRole("button", { name: /^export/i }));

    expect(screen.getByText(/full model results \(\.json\)/i)).toBeInTheDocument();
  });
});
