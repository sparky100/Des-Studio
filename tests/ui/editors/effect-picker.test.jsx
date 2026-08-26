// EffectPicker — scaling the structured pickers (M-2, M-3, F-8, S-4).
// BATCH/DRAIN/FILL/SPLIT/COSEIZE now go through the expression-macro row
// (operand picker(s) + a validated numeric field) instead of a fixed
// enumerated list, and the flat <select> gets a type-ahead search box.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EffectPicker, assignOptions, bEffectOptions } from "../../../src/ui/editors/helpers.jsx";

const oneQueueCtx = {
  matchQueues: [{ name: "Triage Queue", type: "Customer" }],
  containerTypes: [{ id: "Fuel" }],
  serverTypes: ["Nurse", "Doctor"],
};

describe("EffectPicker — quantity-bearing macros (M-3)", () => {
  it("adds BATCH with a chosen queue and a typed quantity, clamped to >= 2", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "BATCH" }));
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 2)"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["BATCH(Triage Queue, 7)"]);
  });

  it("clamps an invalid BATCH quantity up to the engine's minimum of 2", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "BATCH" }));
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 2)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["BATCH(Triage Queue, 2)"]);
  });

  it("adds SPLIT deriving the entity type from the chosen queue", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "SPLIT" }));
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 2)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["SPLIT(Customer, 3, Triage Queue)"]);
  });

  it("adds DRAIN with a chosen container and a typed amount", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "DRAIN" }));
    fireEvent.change(screen.getByPlaceholderText("amount (> 0)"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["DRAIN(Fuel, 25)"]);
  });

  it("adds FILL with a chosen container and a typed amount", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "FILL" }));
    fireEvent.change(screen.getByPlaceholderText("amount (> 0)"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["FILL(Fuel, 6)"]);
  });

  it("does not add DRAIN/FILL for a zero or negative amount", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "DRAIN" }));
    fireEvent.change(screen.getByPlaceholderText("amount (> 0)"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("EffectPicker — COSEIZE composer", () => {
  it("adds COSEIZE with the chosen queue and two distinct server types", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (2 server types)" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["COSEIZE(Triage Queue, Nurse, Doctor)"]);
  });

  it("disables Add when both COSEIZE server pickers are set to the same type", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (2 server types)" }));
    fireEvent.change(screen.getByDisplayValue("Doctor"), { target: { value: "Nurse" } });

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("does not offer COSEIZE with fewer than 2 server types", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()}
      expressionContext={{ ...oneQueueCtx, serverTypes: ["Nurse"] }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    expect(screen.queryByRole("button", { name: /COSEIZE/ })).not.toBeInTheDocument();
  });
});

describe("EffectPicker — type-ahead search (M-2)", () => {
  const manyOptions = [
    { label: "— select effect —", value: "" },
    { label: "── Service ──", value: "", disabled: true },
    { label: "Start service with Nurse and Customer from Triage Queue", value: "ASSIGN(Triage Queue, Nurse)" },
    { label: "Start service with Doctor and Customer from Triage Queue", value: "ASSIGN(Triage Queue, Doctor)" },
    { label: "── Cost ──", value: "", disabled: true },
    { label: "COST(1) — flat rate", value: "COST(1)" },
  ];

  it("filters the flat select to only matching options", () => {
    render(<EffectPicker effects={[]} options={manyOptions} onChange={vi.fn()} expressionContext={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.change(screen.getByPlaceholderText("Search effects…"), { target: { value: "doctor" } });

    expect(screen.getByRole("option", { name: /Start service with Doctor/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Start service with Nurse/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "COST(1) — flat rate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "── Cost ──" })).not.toBeInTheDocument();
  });

  it("drops a header entirely once none of its options match", () => {
    render(<EffectPicker effects={[]} options={manyOptions} onChange={vi.fn()} expressionContext={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.change(screen.getByPlaceholderText("Search effects…"), { target: { value: "cost" } });

    expect(screen.getByRole("option", { name: "COST(1) — flat rate" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "── Cost ──" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "── Service ──" })).not.toBeInTheDocument();
  });

  it("keeps a header visible when at least one of its options still matches", () => {
    render(<EffectPicker effects={[]} options={manyOptions} onChange={vi.fn()} expressionContext={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.change(screen.getByPlaceholderText("Search effects…"), { target: { value: "nurse" } });

    expect(screen.getByRole("option", { name: "── Service ──" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Start service with Nurse/ })).toBeInTheDocument();
  });
});

describe("EffectPicker option generators — combinatorial caps (F-8)", () => {
  it("caps MATCH enumeration above the option threshold, leaving only the composer path", () => {
    // 6 queues -> 6*5/2*6 = 90 MATCH combinations, over the 50-option cap.
    const queues = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, name: `Queue ${i}` }));
    const opts = assignOptions([{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }], [], queues);
    expect(opts.some(o => /^MATCH\(/.test(o.value))).toBe(false);
  });

  it("still enumerates MATCH combinations under the option threshold", () => {
    // 2 queues -> 2*1/2*2 = 2 combinations, well under the cap.
    const queues = [{ id: "q0", name: "Queue A" }, { id: "q1", name: "Queue B" }];
    const opts = assignOptions([{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }], [], queues);
    expect(opts.some(o => /^MATCH\(/.test(o.value))).toBe(true);
  });

  it("caps COSEIZE enumeration above the option threshold, leaving only the composer path", () => {
    // 6 servers -> C(6,2) = 15 pairs (no skills) per queue; 6 queues -> 90
    // combinations total, over the 50-option cap.
    const queues = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, name: `Queue ${i}` }));
    const servers = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `Server ${i}`, role: "server", attrDefs: [] }));
    const opts = assignOptions(servers, [], queues);
    expect(opts.some(o => /^COSEIZE\(/.test(o.value))).toBe(false);
  });

  it("no longer enumerates BATCH/DRAIN/SPLIT/FILL at fixed sizes (M-3)", () => {
    const queues = [{ id: "q0", name: "Queue A" }];
    const containerTypes = [{ id: "Fuel" }];
    const assignOpts = assignOptions([{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }], [], queues, "", containerTypes);
    expect(assignOpts.some(o => /^BATCH\(/.test(o.value))).toBe(false);
    expect(assignOpts.some(o => /^DRAIN\(/.test(o.value))).toBe(false);

    const bOpts = bEffectOptions([{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }], queues, [], containerTypes);
    expect(bOpts.some(o => /^SPLIT\(/.test(o.value))).toBe(false);
    expect(bOpts.some(o => /^FILL\(/.test(o.value))).toBe(false);
  });
});
