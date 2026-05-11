import { fireEvent, render, screen } from "@testing-library/react";
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

    expect(screen.getByText(/Where are queues forming/i)).toBeInTheDocument();
    expect(screen.getByText(/Are resources under- or over-utilised/i)).toBeInTheDocument();
    expect(screen.getByText(/How variable is customer waiting time/i)).toBeInTheDocument();
  });

  test("shows data provenance labels", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    expect(screen.getByText(/Data: Queue-specific runtime counts/i)).toBeInTheDocument();
    expect(screen.getByText(/Data: Busy Clerk resources divided by capacity 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Data: 3 completed waits from engine waitDist/i)).toBeInTheDocument();
  });

  test("shows compact data checks under charts", () => {
    render(<ResultsWorkspace results={results} model={model} />);

    expect(screen.getAllByText("POINTS").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("t=0 -> 1")).toBeInTheDocument();
    expect(screen.getByText("t=5 -> 3")).toBeInTheDocument();
    expect(screen.getByText("PEAK DEPTH")).toBeInTheDocument();
    expect(screen.getByText("MAX WAIT")).toBeInTheDocument();
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

    expect(screen.getAllByText(/View chart data \(2 points\)/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/View wait samples \(3 values\)/i)).toBeInTheDocument();
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

    expect(screen.getByText(/Detailed output/i)).toBeInTheDocument();
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

    expect(screen.getByText(/How reliable are these outputs/i)).toBeInTheDocument();
    expect(screen.getByText(/WARM-UP DETECTION/i)).toBeInTheDocument();
    expect(screen.getByText(/Welch's method/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /batch-means metric/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /compute/i })).not.toBeDisabled();
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

    fireEvent.click(screen.getByRole("button", { name: /compute/i }));

    expect(screen.getByText(/DISTRIBUTION DIAGNOSTICS \(Avg Wait\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/skewness/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/kurtosis/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/CI LOW/i)).toBeInTheDocument();
    expect(screen.getByText(/CI HIGH/i)).toBeInTheDocument();
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

    expect(screen.getByText(/How reliable are these outputs/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /compute/i })).not.toBeDisabled();
  });
});
