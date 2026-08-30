// ExecuteQueueNode's entity-type label — before this, the only way to tell
// which entity type(s) were waiting in a queue was dot color (typeColor())
// plus a hover-only title ("#id type"); there was no always-visible text
// naming the type. Follows the same isolated-render pattern
// execute-queue-node-pulse.test.jsx already uses.
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ExecuteQueueNode } from "../../../src/ui/execute/ExecuteQueueNode.jsx";

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return { ...actual, Handle: () => null };
});

const baseLiveData = { depth: 0, discipline: "FIFO", clock: 10 };

describe("ExecuteQueueNode — entity type label", () => {
  test("shows no type label when the queue is empty", () => {
    render(<ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, entities: [] } }} />);
    expect(screen.queryByText("Customer")).not.toBeInTheDocument();
  });

  test("names the entity type waiting in a single-type queue", () => {
    render(
      <ExecuteQueueNode data={{
        label: "Hire Queue",
        liveData: { ...baseLiveData, depth: 2, entities: [
          { id: 1, type: "Customer" },
          { id: 2, type: "Customer" },
        ] },
      }} />
    );
    expect(screen.getByText("Customer")).toBeInTheDocument();
  });

  test("shows one pill per distinct type when a queue hosts more than one", () => {
    render(
      <ExecuteQueueNode data={{
        label: "Shared Queue",
        liveData: { ...baseLiveData, depth: 2, entities: [
          { id: 1, type: "Customer" },
          { id: 2, type: "Repair Job" },
        ] },
      }} />
    );
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Repair Job")).toBeInTheDocument();
  });
});
