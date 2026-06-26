import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ContainerGaugeStrip } from "../../../src/ui/execute/ContainerGaugeStrip.jsx";

describe("ContainerGaugeStrip", () => {
  test("renders one gauge per container with level/capacity", () => {
    render(
      <ContainerGaugeStrip
        containers={{
          Tank: { level: 600, capacity: 1000 },
          Buffer: { level: 50, capacity: 500 },
        }}
        model={{
          containerTypes: [
            { id: "Tank", capacity: "1000", initialLevel: "500" },
            { id: "Buffer", capacity: "500", initialLevel: "0" },
          ],
        }}
      />
    );

    expect(screen.getByText("TANK")).toBeInTheDocument();
    expect(screen.getByText("600/1000")).toBeInTheDocument();
    expect(screen.getByText("BUFFER")).toBeInTheDocument();
    expect(screen.getByText("50/500")).toBeInTheDocument();
  });

  test("escalates color to red when level reaches capacity", () => {
    render(
      <ContainerGaugeStrip
        containers={{ Tank: { level: 1000, capacity: 1000 } }}
        model={{ containerTypes: [{ id: "Tank", capacity: "1000", initialLevel: "0" }] }}
      />
    );

    const reading = screen.getByText("1000/1000");
    expect(reading).toHaveStyle({ color: "#f85149" });
  });

  test("falls back to model initialLevel when no live data yet", () => {
    render(
      <ContainerGaugeStrip
        containers={{}}
        model={{ containerTypes: [{ id: "Fuel", capacity: "200", initialLevel: "80" }] }}
      />
    );

    expect(screen.getByText("80/200")).toBeInTheDocument();
  });

  test("renders unbounded container without a capacity suffix", () => {
    render(
      <ContainerGaugeStrip
        containers={{ Inventory: { level: 42, capacity: Infinity } }}
        model={{ containerTypes: [{ id: "Inventory", initialLevel: "0" }] }}
      />
    );

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("level")).toBeInTheDocument();
  });

  test("renders nothing when model has no containerTypes", () => {
    const { container } = render(
      <ContainerGaugeStrip containers={{}} model={{ containerTypes: [] }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
