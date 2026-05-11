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

  test("shows a top-level Results workspace tab with run guidance", () => {
    render(
      <ModelDetail
        modelId="m1"
        modelData={baseModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, profiles: [], userId: "user-1" }}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /results/i }));

    expect(screen.getByText(/RESULTS WORKSPACE/i)).toBeInTheDocument();
    expect(screen.getByText(/latest run will appear here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open execute/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open history/i })).toBeInTheDocument();
  });

  test("loads a saved run directly in Results", async () => {
    mockFetchRunHistory.mockResolvedValue([
      {
        id: "run-1",
        run_label: "Morning baseline",
        ran_at: "2026-05-11T10:00:00.000Z",
        results_json: {
          summary: { served: 3 },
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

    fireEvent.click(screen.getByRole("tab", { name: /results/i }));

    await waitFor(() => expect(mockFetchRunHistory).toHaveBeenCalledWith("m1"));
    expect(await screen.findByRole("combobox", { name: /saved run/i })).toHaveValue("run-1");
    expect(screen.getByText(/Morning baseline/i)).toBeInTheDocument();
    expect(screen.getByText(/Where are queues forming/i)).toBeInTheDocument();
    expect(screen.getByText(/Data: Queue-specific runtime counts/i)).toBeInTheDocument();
  });
});
