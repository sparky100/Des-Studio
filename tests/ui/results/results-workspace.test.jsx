import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ResultsWorkspace } from "../../../src/ui/results/ResultsWorkspace.jsx";

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

  test("shows detailed-output guidance when chart inputs are absent", () => {
    render(<ResultsWorkspace results={{}} model={model} />);

    expect(screen.getByText(/Detailed output/i)).toBeInTheDocument();
  });
});
