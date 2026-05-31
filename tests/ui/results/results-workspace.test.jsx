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
      byType: { Customer: { waiting: 1 }, Clerk: { busy: 0 } },
    },
    {
      t: 5,
      byQueue: { "Queue A": { waiting: 3 } },
      byType: { Customer: { waiting: 3 }, Clerk: { busy: 1 } },
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

    expect(screen.getByText(/Where do queues build up/i)).toBeInTheDocument();
    expect(screen.getByText(/How busy are resources/i)).toBeInTheDocument();
    expect(screen.getByText(/How spread out are waiting times/i)).toBeInTheDocument();
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

  test("renders runtime metrics when present", () => {
    render(<ResultsWorkspace results={results} model={model} />);
    const runtimeSection = screen.getByRole("region", { name: /runtime metrics/i });

    expect(screen.getByText(/run effort/i)).toBeInTheDocument();
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
});
