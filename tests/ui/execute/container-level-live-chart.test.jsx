import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContainerLevelTimePlot } from "../../../src/ui/execute/SweepViews.jsx";

const timeSeries = [
  { t: 0, byQueue: {}, byType: {}, byContainer: { ct_asia_products: 100 } },
  { t: 4, byQueue: {}, byType: {}, byContainer: { ct_asia_products: 0 } },
  { t: 9, byQueue: {}, byType: {}, byContainer: { ct_asia_products: 40 } },
];

describe("ContainerLevelTimePlot (Run tab live charts)", () => {
  test("renders one chart per container with trough and latest level", () => {
    render(<ContainerLevelTimePlot timeSeries={timeSeries} containerTypes={[{ id: "ct_asia_products" }]} />);
    expect(screen.getByText("CONTAINER LEVEL OVER TIME (per container)")).toBeTruthy();
    expect(screen.getByText("ct_asia_products")).toBeTruthy();
    const trough = screen.getByLabelText("ct_asia_products trough");
    expect(trough.textContent).toContain("Trough 0 at t = 4");
    expect(trough.textContent).toContain("Latest 40");
  });

  test("renders nothing when the model has no containers", () => {
    const { container } = render(<ContainerLevelTimePlot timeSeries={[{ t: 0 }, { t: 1 }]} containerTypes={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
