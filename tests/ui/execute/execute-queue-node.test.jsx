// ExecuteQueueNode's depth-caption wording — an earlier iteration added a
// live, per-instant "one pill per distinct entity type currently waiting"
// row, but that was replaced: the queue's own design-time configured type
// (Queue.customerType) is folded straight into the existing depth caption
// instead ("2 customers waiting"), since the design already says who's
// allowed in a queue — no need to guess from whichever entities happen to be
// waiting right now. Follows the same isolated-render pattern
// execute-queue-node-pulse.test.jsx already uses.
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ExecuteQueueNode } from "../../../src/ui/execute/ExecuteQueueNode.jsx";

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return { ...actual, Handle: () => null };
});

const baseLiveData = { depth: 0, discipline: "FIFO", clock: 10, entities: [] };

describe("ExecuteQueueNode — depth caption", () => {
  test("falls back to the generic 'waiting' caption when the queue has no configured customerType", () => {
    render(<ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, depth: 2 } }} />);
    expect(screen.getByText("waiting")).toBeInTheDocument();
  });

  test("pluralizes the configured customerType into the caption, e.g. '2 Customers waiting'", () => {
    render(
      <ExecuteQueueNode data={{
        label: "Hire Queue",
        liveData: { ...baseLiveData, depth: 2, customerType: "Customer" },
      }} />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Customers waiting")).toBeInTheDocument();
  });

  test("leaves the 'capacity' caption untouched even when customerType is set", () => {
    render(
      <ExecuteQueueNode data={{
        label: "Hire Queue",
        liveData: { ...baseLiveData, depth: 2, capacity: 5, customerType: "Customer" },
      }} />
    );
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(screen.getByText("capacity")).toBeInTheDocument();
    expect(screen.queryByText(/Customers/)).not.toBeInTheDocument();
  });

  test("no longer renders a separate per-type pill row", () => {
    render(
      <ExecuteQueueNode data={{
        label: "Hire Queue",
        liveData: { ...baseLiveData, depth: 2, customerType: "Customer", entities: [
          { id: 1, type: "Customer" },
          { id: 2, type: "Customer" },
        ] },
      }} />
    );
    // The type name only ever appears inside the caption text now, not as a
    // standalone pill (the caption reads "Customers waiting", not "Customer").
    expect(screen.queryByText("Customer")).not.toBeInTheDocument();
  });
});
