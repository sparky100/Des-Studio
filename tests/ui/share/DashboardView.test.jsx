import { render, screen, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import DashboardView from "../../../src/ui/share/DashboardView.jsx";

vi.mock("../../../src/db/models.js", () => ({
  getShareLink: vi.fn(),
}));

import { getShareLink } from "../../../src/db/models.js";

const mockData = {
  share: {
    id: "s1",
    token: "abc-123",
    config: { pinnedWidgets: [] },
    createdAt: "2026-05-09T12:00:00Z",
  },
  run: {
    id: "r1",
    ranAt: "2026-05-09T11:00:00Z",
    replications: 5,
    seed: 42,
    totalArrived: 1000,
    totalServed: 950,
    totalReneged: 10,
    avgWaitTime: 4.5,
    avgServiceTime: 3.2,
    maxSimulationTime: 1000,
    warmupPeriod: 100,
    resultsJson: {
      summary: {
        total: 1000,
        served: 950,
        reneged: 10,
        avgWait: 4.5,
        avgSvc: 3.2,
      },
      waitDist: {
        Customer: { n: 950, mean: 4.5, p50: 3.1, p90: 8.2, p99: 15.4, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      },
    },
  },
  model: {
    name: "Test Model",
    entityTypes: [
      { id: "et1", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      { id: "et2", name: "Server", role: "server", count: 2, attrDefs: [] },
    ],
    queues: [
      { id: "q1", name: "Customer", customerType: "Customer" },
    ],
  },
};

describe("DashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("shows loading state initially", () => {
    getShareLink.mockReturnValue(new Promise(() => {})); // never resolves
    render(<DashboardView token="abc-123" />);
    expect(screen.getByText("Loading shared results...")).toBeTruthy();
  });

  test("shows error when token is missing", () => {
    render(<DashboardView token={null} />);
    expect(screen.getByText("Dashboard unavailable")).toBeTruthy();
  });

  test("shows error when getShareLink rejects", async () => {
    getShareLink.mockRejectedValue(new Error("Link revoked"));
    render(<DashboardView token="bad-token" />);
    await waitFor(() => {
      expect(screen.getByText("Dashboard unavailable")).toBeTruthy();
    });
  });

  test("renders model name and run info after load", async () => {
    getShareLink.mockResolvedValue(mockData);
    render(<DashboardView token="abc-123" />);
    await waitFor(() => {
      expect(screen.getByText("Test Model")).toBeTruthy();
    });
  });

  test("shows KPI cards (ARRIVED, SERVED, RENEGED, MEAN WAIT, MEAN SERVICE)", async () => {
    getShareLink.mockResolvedValue(mockData);
    render(<DashboardView token="abc-123" />);
    await waitFor(() => {
      expect(screen.getByText("ARRIVED")).toBeTruthy();
      expect(screen.getByText("SERVED")).toBeTruthy();
      expect(screen.getByText("RENEGED")).toBeTruthy();
      expect(screen.getByText("MEAN WAIT")).toBeTruthy();
      expect(screen.getByText("MEAN SERVICE")).toBeTruthy();
    });
  });

  test("shows QUEUES table when queue data is present", async () => {
    getShareLink.mockResolvedValue(mockData);
    render(<DashboardView token="abc-123" />);
    await waitFor(() => {
      expect(screen.getByText("QUEUE PERFORMANCE")).toBeTruthy();
      expect(screen.getAllByText("Customer").length).toBeGreaterThanOrEqual(1);
    });
  });

  test("shows SERVERS section when server entity types exist", async () => {
    getShareLink.mockResolvedValue(mockData);
    render(<DashboardView token="abc-123" />);
    await waitFor(() => {
      expect(screen.getByText("SERVER PERFORMANCE")).toBeTruthy();
    });
  });

  test("shows QUEUE DEPTH chart section when timeSeries is present", async () => {
    const withTs = {
      ...mockData,
      run: {
        ...mockData.run,
        resultsJson: {
          ...mockData.run.resultsJson,
          timeSeries: [{ t: 0, byType: { Customer: { waiting: 0 } } }, { t: 10, byType: { Customer: { waiting: 5 } } }],
        },
      },
    };
    getShareLink.mockResolvedValue(withTs);
    render(<DashboardView token="abc-123" />);
    await waitFor(() => {
      expect(screen.getByText("QUEUE DEPTH OVER TIME")).toBeTruthy();
    });
  });

  test("shows WAIT TIME DISTRIBUTION when waitDist is present", async () => {
    getShareLink.mockResolvedValue(mockData);
    render(<DashboardView token="abc-123" />);
    await waitFor(() => {
      expect(screen.getByText("WAIT TIME DISTRIBUTION")).toBeTruthy();
    });
  });

  test("shows Back button when onBack is provided", async () => {
    getShareLink.mockResolvedValue(mockData);
    const onBack = vi.fn();
    render(<DashboardView token="abc-123" onBack={onBack} />);
    await waitFor(() => {
      expect(screen.getByText("← Back")).toBeTruthy();
    });
  });

  test("respects pinnedWidgets — hides charts when not pinned", async () => {
    const noCharts = {
      ...mockData,
      share: {
        ...mockData.share,
        config: { pinnedWidgets: ["summary"] },
      },
    };
    getShareLink.mockResolvedValue(noCharts);
    render(<DashboardView token="abc-123" />);
    await waitFor(() => {
      expect(screen.queryByText("QUEUES")).toBeNull();
      expect(screen.getByText("ARRIVED")).toBeTruthy();
    });
  });

  test("handles revoked share link error", async () => {
    getShareLink.mockRejectedValue(new Error("This share link has been revoked."));
    render(<DashboardView token="revoked" />);
    await waitFor(() => {
      expect(screen.getByText("Dashboard unavailable")).toBeTruthy();
      expect(screen.getByText(/revoked/i)).toBeTruthy();
    });
  });
});
