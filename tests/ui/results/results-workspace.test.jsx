import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  ResultsWorkspace,
  buildSeriesCsv,
  buildWaitValuesCsv,
} from "../../../src/ui/results/ResultsWorkspace.jsx";

const model = {
  queues: [{ id: "q1", name: "Queue A", customerType: "Customer" }],
  entityTypes: [
    { id: "e1", name: "Customer", role: "customer" },
    { id: "e2", name: "Clerk", role: "server", count: "1" },
  ],
};

const results = {
  timeSeries: [
    {
      t: 0,
      byQueue: { "Queue A": { waiting: 1 } },
      byType: { Customer: { waiting: 1 }, Clerk: { busy: 0, total: 1 } },
    },
    {
      t: 5,
      byQueue: { "Queue A": { waiting: 3 } },
      byType: { Customer: { waiting: 3 }, Clerk: { busy: 1, total: 1 } },
    },
  ],
  waitDist: {
    "Queue A": { n: 3, mean: 4, p50: 4, p90: 8, p95: 8, p99: 8, values: [1, 4, 8] },
  },
  runtimeMetrics: {
    wall_clock_ms: 42,
    replications: 1,
    events_processed: 15,
    c_event_scans: 9,
    c_events_fired: 4,
    entities_created: 6,
    entities_completed: 5,
    max_queue_length_by_queue: { "Queue A": 3 },
  },
};

const makeReplicationResult = (avgWait, avgSvc = 5, served = 100) => ({
  result: {
    summary: { avgWait, avgSvc, avgSojourn: avgWait + avgSvc, served, reneged: 0 },
  },
});

const warmupDetection = {
  truncationPoint: 35,
  explanation: "Welch's method detected a warm-up truncation at t=35.00.",
  series: Array.from({ length: 5 }, (_, i) => ({ t: i * 5, value: 10 - i })),
  confidence: "high",
};

describe("ResultsWorkspace", () => {
  test("renders chart sections as analysis questions", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    expect(screen.getAllByText(/Where do queues build up/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/How busy are resources/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/How much time is spent queueing/i).length).toBeGreaterThanOrEqual(1);
  });

  test("shows data provenance labels", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    expect(screen.getByText(/Queue measurements taken during the run/i)).toBeInTheDocument();
    expect(screen.getByText(/Busy Clerk resources measured during the run/i)).toBeInTheDocument();
    expect(screen.getByText(/3 waiting times from completed customers/i)).toBeInTheDocument();
  });

  test("shows compact data checks under charts", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    // StatCards: "PEAK" appears for queue depth and server utilisation series
    expect(screen.getAllByText("PEAK").length).toBeGreaterThanOrEqual(2);
    // "N" appears for number of data points in each series
    expect(screen.getAllByText("N").length).toBeGreaterThanOrEqual(2);
    // Queue A depth peak value is 3 (at t=5)
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    // Wait distribution histogram stat cards show percentile labels
    expect(screen.getByText("P99")).toBeInTheDocument();
  });

  test("shows wait distribution AVG to 1 decimal place", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    // Queue A's waitDist mean is 4 (an integer); AVG should still render as "4.0",
    // not rounded to "4" like the other stat cards (N/P50/P90/P95/P99).
    expect(screen.getByText("4.0")).toBeInTheDocument();
  });

  test("renders runtime metrics when present", () => {
    render(<ResultsWorkspace results={results} model={model} />);
    const runtimeSection = screen.getByRole("region", { name: /runtime metrics/i });

    expect(within(runtimeSection).getByText(/run effort/i)).toBeInTheDocument();
    expect(within(runtimeSection).getByText(/wall-clock time/i)).toBeInTheDocument();
    expect(within(runtimeSection).getByText("42 ms")).toBeInTheDocument();
    expect(within(runtimeSection).getByText(/events processed/i)).toBeInTheDocument();
    expect(within(runtimeSection).getByText("15")).toBeInTheDocument();
    expect(screen.getAllByText(/peak queue length by queue/i).length).toBeGreaterThanOrEqual(1);
    const peakQueueSection = screen.getByLabelText(/peak queue lengths/i);
    expect(within(peakQueueSection).getAllByText("Queue A").length).toBeGreaterThanOrEqual(1);
    expect(within(peakQueueSection).getByText("3")).toBeInTheDocument();
  });

  test("uses responsive chart grids", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    expect(screen.getByLabelText(/queue depth chart grid/i)).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    });
    expect(screen.getByLabelText(/server utilisation chart grid/i)).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    });
  });

  test("renders upgraded accessible chart visuals with endpoint legends", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    expect(screen.getByRole("img", { name: /Queue A depth trend chart/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Queue A chart legend/i)).toHaveTextContent(/latest t=5/i);
    expect(screen.getByLabelText(/Queue A chart legend/i)).toHaveTextContent(/peak t=5/i);
  });

  test("offers expandable previews of chart data and wait samples", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    expect(screen.getAllByText(/See the numbers behind this chart \(2 points\)/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/See the waiting times behind this chart \(3 values\)/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /csv/i }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("time").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("wait")).toBeInTheDocument();
  });

  test("builds CSV for chart data exports", () => {
    expect(buildSeriesCsv({ points: [{ t: 0, value: 1 }, { t: 5, value: 3 }] })).toBe(
      "index,time,value\n1,0,1\n2,5,3"
    );
    expect(buildWaitValuesCsv({ values: [1, 4, 8] })).toBe(
      "rank,wait\n1,1\n2,4\n3,8"
    );
  });

  test("shows detailed-output guidance when chart inputs are absent", () => {
    render(<ResultsWorkspace results={{}} model={model} />);

    expect(screen.getByText(/Keep chart data during the run/i)).toBeInTheDocument();
  });

  test("shows runtime-metrics fallback for older runs", () => {
    render(<ResultsWorkspace results={{ summary: { served: 4 } }} model={model} />);

    expect(screen.getByText(/runtime metrics are not available for this saved run/i)).toBeInTheDocument();
  });

  test("hosts statistical analysis with warm-up and batch-means controls", () => {
    render(
      <ResultsWorkspace
        results={results}
        model={model}
        warmupDetection={warmupDetection}
        replicationResults={[makeReplicationResult(8), makeReplicationResult(10), makeReplicationResult(12)]}
      />
    );

    expect(screen.getByText(/How reliable are these results/i)).toBeInTheDocument();
    expect(screen.getByText(/START-UP CHECK/i)).toBeInTheDocument();
    expect(screen.getByText(/Welch's method/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /batch-means metric/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /assess/i })).not.toBeDisabled();
  });

  test("computes batch-means and shows distribution diagnostics in Results", () => {
    render(
      <ResultsWorkspace
        results={results}
        model={model}
        replicationResults={[
          makeReplicationResult(8, 5, 100),
          makeReplicationResult(10, 6, 110),
          makeReplicationResult(12, 7, 120),
          makeReplicationResult(9, 5, 105),
          makeReplicationResult(11, 6, 115),
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /assess/i }));

    expect(screen.getByText(/SHAPE OF REPEATED-RUN RESULTS \(AVERAGE WAIT\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/skewness/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/kurtosis/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/LOWER BOUND/i)).toBeInTheDocument();
    expect(screen.getByText(/UPPER BOUND/i)).toBeInTheDocument();
  });

  test("uses saved-run replications for analysis", () => {
    render(
      <ResultsWorkspace
        results={{
          replications: [
            { summary: { avgWait: 8, avgSvc: 5, avgSojourn: 13, served: 100 } },
            { summary: { avgWait: 10, avgSvc: 6, avgSojourn: 16, served: 110 } },
          ],
        }}
        model={model}
      />
    );

    expect(screen.getByText(/How reliable are these results/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /assess/i })).not.toBeDisabled();
  });

  test("renders batch runtime metrics from aggregate batch results", () => {
    render(
      <ResultsWorkspace
        results={{
          summary: { avgWait: 10, avgSojourn: 16, served: 210, reneged: 0 },
          runtimeMetrics: {
            wall_clock_ms: 125,
            replications: 3,
            events_processed: 300,
            c_event_scans: 420,
            c_events_fired: 180,
            entities_created: 90,
            entities_completed: 75,
            max_queue_length_by_queue: { "Queue A": 7 },
          },
        }}
        model={model}
      />
    );
    const runtimeSection = screen.getByRole("region", { name: /runtime metrics/i });

    expect(within(runtimeSection).getByText("125 ms")).toBeInTheDocument();
    expect(within(runtimeSection).getByText(/replications/i)).toBeInTheDocument();
    expect(within(runtimeSection).getByText("300")).toBeInTheDocument();
  });

  test("shows Balked/Blocked columns in the queue table when perQueue has rejections", () => {
    const sectionModel = {
      ...model,
      sections: [{ id: "sec1", name: "Section 1", color: "#4488ff", memberIds: ["q1"] }],
    };
    const sectionResults = {
      ...results,
      perQueue: { "Queue A": { balkCount: 5, blockingCount: 3 } },
      summary: { sections: { sec1: { count: 10, avgSojourn: 5 } }, journeys: {} },
    };

    render(<ResultsWorkspace results={sectionResults} model={sectionModel} />);

    fireEvent.click(screen.getByText(/QUEUE WAIT TIMES/i));

    expect(screen.getByText("Balked")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    const table = screen.getByText("Mean").closest("table");
    expect(within(table).getByText("5")).toBeInTheDocument();
    expect(within(table).getByText("3")).toBeInTheDocument();
  });

  test("renders a System-Level Trends section with WIP, throughput, wait-by-arrival, and sojourn cards", () => {
    const systemTrendsResults = {
      ...results,
      timeSeries: [
        { t: 0, byQueue: { "Queue A": { waiting: 1 } }, byType: { Customer: { waiting: 1 }, Clerk: { busy: 0 } }, wip: 1, completed: 0 },
        { t: 5, byQueue: { "Queue A": { waiting: 3 } }, byType: { Customer: { waiting: 3 }, Clerk: { busy: 1 } }, wip: 3, completed: 1 },
        { t: 10, byQueue: { "Queue A": { waiting: 2 } }, byType: { Customer: { waiting: 2 }, Clerk: { busy: 1 } }, wip: 2, completed: 2 },
      ],
      waitByArrival: [[0, 2], [10, 4], [20, 6], [30, 8]],
      sojournDist: { n: 4, mean: 5, p50: 5, p90: 8, p95: 8, p99: 8, values: [2, 4, 6, 8] },
    };

    const { container } = render(<ResultsWorkspace results={systemTrendsResults} model={model} />);

    expect(screen.getAllByText(/System-Level Trends/i).length).toBeGreaterThanOrEqual(1);

    const systemTrendsRegion = container.querySelector("#results-section-systemTrends");
    expect(systemTrendsRegion).toBeInTheDocument();
    expect(within(systemTrendsRegion).getByText("Entities in system")).toBeInTheDocument();
    expect(within(systemTrendsRegion).getByText("Completions per interval")).toBeInTheDocument();
    expect(within(systemTrendsRegion).getByText("Total wait vs. arrival time")).toBeInTheDocument();
    expect(within(systemTrendsRegion).getByText("Whole-journey sojourn time")).toBeInTheDocument();

    // The wait-by-arrival card now gets the same Peak/At t/Final/N stat cards as its siblings.
    expect(within(systemTrendsRegion).getAllByText("PEAK").length).toBeGreaterThanOrEqual(3);
    expect(within(systemTrendsRegion).getAllByText("FINAL").length).toBeGreaterThanOrEqual(3);

    // Wait-by-arrival has moved out of "Where Are the Bottlenecks?" entirely.
    const bottlenecksRegion = container.querySelector("#results-section-bottlenecks");
    expect(bottlenecksRegion).toBeInTheDocument();
    expect(within(bottlenecksRegion).queryByText("Total wait vs. arrival time")).not.toBeInTheDocument();

    // System-Level Trends now renders right under Results Summary, before the bottlenecks section.
    const sectionIds = Array.from(container.querySelectorAll('[id^="results-section-"]')).map(el => el.id);
    expect(sectionIds.indexOf("results-section-summary")).toBeLessThan(sectionIds.indexOf("results-section-systemTrends"));
    expect(sectionIds.indexOf("results-section-systemTrends")).toBeLessThan(sectionIds.indexOf("results-section-bottlenecks"));
  });

  test("hides charts whose entire series is all zero", () => {
    const allZeroResults = {
      timeSeries: [
        { t: 0, byQueue: { "Queue A": { waiting: 0 } }, byType: { Customer: { waiting: 0 }, Clerk: { busy: 1, total: 2 } }, wip: 0, completed: 0 },
        { t: 5, byQueue: { "Queue A": { waiting: 0 } }, byType: { Customer: { waiting: 0 }, Clerk: { busy: 2, total: 2 } }, wip: 0, completed: 0 },
      ],
      waitByArrival: [[0, 0], [10, 0]],
    };

    const { container } = render(<ResultsWorkspace results={allZeroResults} model={model} />);

    // Queue A never had any entities waiting — its chart should not render.
    expect(screen.queryByText(/Where do queues build up\?/i)).not.toBeInTheDocument();
    // Server utilisation has real (non-zero) data, so its section still renders.
    expect(screen.getAllByText(/How busy are resources\?/i).length).toBeGreaterThanOrEqual(1);

    // wip/throughput/wait-by-arrival are all zero and there's no sojournDist —
    // System-Level Trends has nothing left to show.
    expect(container.querySelector("#results-section-systemTrends")).not.toBeInTheDocument();
  });

  test("hides 'Resources available over time' chart when capacity is constant", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    expect(screen.queryByText(/Resources available over time/i)).not.toBeInTheDocument();
  });

  test("shows 'Resources available over time' chart when a server failure dips capacity", () => {
    const failureResults = {
      ...results,
      timeSeries: [
        { t: 0, byQueue: { "Queue A": { waiting: 1 } }, byType: { Customer: { waiting: 1 }, Clerk: { busy: 0, total: 2, failed: 0 } } },
        { t: 5, byQueue: { "Queue A": { waiting: 3 } }, byType: { Customer: { waiting: 3 }, Clerk: { busy: 1, total: 2, failed: 1 } } },
      ],
    };

    render(<ResultsWorkspace results={failureResults} model={model} />);

    expect(screen.getByText(/Resources available over time/i)).toBeInTheDocument();
  });

  test("hides Balked/Blocked columns when no perQueue data is present", () => {
    const sectionModel = {
      ...model,
      sections: [{ id: "sec1", name: "Section 1", color: "#4488ff", memberIds: ["q1"] }],
    };
    const sectionResults = {
      ...results,
      summary: { sections: { sec1: { count: 10, avgSojourn: 5 } }, journeys: {} },
    };

    render(<ResultsWorkspace results={sectionResults} model={sectionModel} />);

    fireEvent.click(screen.getByText(/QUEUE WAIT TIMES/i));

    expect(screen.queryByText("Balked")).not.toBeInTheDocument();
    expect(screen.queryByText("Blocked")).not.toBeInTheDocument();
  });
});
