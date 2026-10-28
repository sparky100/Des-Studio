import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEMPLATES } from "../../../src/engine/templates.js";

const runner = vi.hoisted(() => ({ options: null, cancel: vi.fn() }));
vi.mock("../../../src/engine/replication-runner.js", () => ({
  runReplications: options => {
    runner.options = options;
    return { cancel: runner.cancel };
  },
}));
vi.mock("../../../src/ui/results/ResultsWorkspace.jsx", () => ({
  ResultsWorkspace: ({ model, results }) => <div>
    <span>Results with {model.entityTypes.find(entity => entity.id === "et_srv").count} servers</span>
    <span>Average served: {results.aggregateStats?.["summary.served"]?.mean}</span>
  </div>,
}));
import { PublicSimulator } from "../../../src/ui/public/PublicSimulator.jsx";

const makePayload = () => ({
  title: "Published queue",
  model: { ...structuredClone(TEMPLATES.find(template => template.name === "M/M/1 Queue")), experimentDefaults: { maxSimTime: 20, warmupPeriod: 0, replications: 1 } },
  schedules: [],
  exposed_params: [{ path: "entityTypes.et_srv.count", businessLabel: "Servers", min: 1, max: 5 }],
});

beforeEach(() => {
  runner.options = null;
  vi.clearAllMocks();
});

describe("public simulation", () => {
  it("passes per-run statistics to the results and identifies incomplete runs", () => {
    const payload = makePayload();
    payload.model.experimentDefaults.replications = 2;
    render(<PublicSimulator payload={payload} />);
    fireEvent.click(screen.getByRole("button", { name: "Run the simulation" }));
    act(() => runner.options.onComplete([
      { result: { summary: { served: 10, total: 10 }, cycleLimitReached: true } },
      { result: { summary: { served: 20, total: 20 } } },
    ]));
    expect(screen.getByText("Average served: 15")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Treat these results as incomplete");
  });
  it("asks for chart data and hands the full results view what the Run page does", () => {
    render(<PublicSimulator payload={makePayload()} />);
    fireEvent.click(screen.getByRole("button", { name: "Run the simulation" }));
    expect(runner.options.collectTimeSeries).toBe(true);
    expect(typeof runner.options.onTimeSeriesSample).toBe("function");
    act(() => runner.options.onComplete([{ result: { summary: { served: 10, total: 10 } } }]));
    expect(screen.getByText("Average served: 10")).toBeInTheDocument();
  });
  it("clamps curated inputs and keeps results tied to the settings used for the run", () => {
    render(<PublicSimulator payload={makePayload()} />);
    fireEvent.change(screen.getByLabelText("Servers"), { target: { value: "9" } });
    fireEvent.blur(screen.getByLabelText("Servers"));
    expect(screen.getByLabelText("Servers")).toHaveValue(5);
    fireEvent.click(screen.getByRole("button", { name: "Run the simulation" }));
    expect(screen.getByLabelText("Servers")).toBeDisabled();
    act(() => runner.options.onComplete([{ result: { summary: { served: 10, total: 10 } } }]));
    expect(screen.getByText("Results with 5 servers")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Servers"), { target: { value: "2" } });
    expect(screen.getByText("Results with 5 servers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download report" })).toBeEnabled();
  });

  it("revalidates visitor changes before enabling a run", () => {
    const payload = makePayload();
    payload.exposed_params[0] = { path: "entityTypes.et_srv.count", businessLabel: "Servers" };
    render(<PublicSimulator payload={payload} />);
    expect(screen.getByRole("button", { name: "Run the simulation" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Servers"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Run the simulation" })).toBeDisabled();
  });

  it("blocks a partially missing timetable payload", () => {
    const payload = makePayload();
    payload.model.bEvents[0].schedules = [{ dist: "Schedule", scheduleRef: "missing" }];
    payload.schedules = [{ id: "another", scheduleJson: [] }];
    render(<PublicSimulator payload={payload} />);
    expect(screen.getByText(/missing a timetable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run the simulation" })).toBeDisabled();
  });

  it("cancels an active worker when the visitor closes the simulator", () => {
    const view = render(<PublicSimulator payload={makePayload()} />);
    fireEvent.click(screen.getByRole("button", { name: "Run the simulation" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    view.unmount();
    expect(runner.cancel).toHaveBeenCalledOnce();
  });
});
